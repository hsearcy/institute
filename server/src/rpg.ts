import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  RPG_ITEMS, RPG_REGIONS, RPG_SKILLS, RPG_SPELL_IDS, RPG_DUPLICATE_ITEM_XP, RPG_APPEARANCES, RPG_APPEARANCE_IDS, rpgAppearanceUnlocked, rpgLevel, rpgSpellUnlocked, rpgEncounterCombat, rpgApplyCombat, rpgRelicDrop, rpgNormalizeLoot, rpgCreateLoot, rpgRoomForgeDust, rpgTier, rpgUnlockedTier, RPG_MAX_DUNGEON_TIER,
  type RpgState, type RpgReward, type RpgResolveResult,
} from '@institute/shared';

/** Additive tables only: never migrate, reset, or award learning state. */
export function ensureRpgSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_profiles (
      profile_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rpg_upgrades (
      profile_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      PRIMARY KEY (profile_id, request_id)
    );
    CREATE TABLE IF NOT EXISTS rpg_misses (
      profile_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      response_json TEXT NOT NULL,
      PRIMARY KEY (profile_id, problem_id)
    );
    CREATE TABLE IF NOT EXISTS rpg_claims (
      profile_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      expedition_id TEXT NOT NULL,
      encounter_index INTEGER NOT NULL,
      reward_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (profile_id, problem_id),
      UNIQUE (profile_id, expedition_id, encounter_index)
    );
    CREATE TABLE IF NOT EXISTS rpg_cast_claims (
      profile_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      expedition_id TEXT NOT NULL,
      encounter_index INTEGER NOT NULL,
      reward_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (profile_id, problem_id)
    );
  `);
}

class RpgError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) { super(message); }
}

export function getRpgState(db: Database, profileId: string): RpgState {
  const row = db.query('SELECT state_json FROM rpg_profiles WHERE profile_id = ?').get(profileId) as { state_json: string } | null;
  if (row) {
    const state = rpgNormalizeLoot(JSON.parse(row.state_json) as RpgState);
    // Existing JSON saves gain a default only in the response. Reading never
    // rewrites the profile or changes any earned learning/adventure progress.
    state.appearanceId = rpgAppearanceUnlocked(state.appearanceId, rpgLevel(state.xp).level) ? state.appearanceId : 'wayfarer';
    if (state.expedition && !state.expedition.cleared) state.expedition.combat = rpgEncounterCombat(state);
    return state;
  }
  return rpgNormalizeLoot({
    profileId, xp: 0, ...rpgLevel(0), skillPoints: 0, skills: {}, inventory: ['apprentice'],
    equippedItemId: 'apprentice', selectedSpellId: 'ember', appearanceId: 'wayfarer', totalKills: 0, expeditionsCompleted: 0, expedition: null,
  });
}

export function saveRpgState(db: Database, state: RpgState): void {
  db.query(`INSERT INTO rpg_profiles (profile_id, state_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`)
    .run(state.profileId, JSON.stringify(state), Date.now());
}

export function startRpgExpedition(db: Database, profileId: string, regionId?: string, tier?: number): RpgState {
  return db.transaction(() => {
    const state = getRpgState(db, profileId);
    if (state.expedition && !state.expedition.cleared) return state;
    const region = RPG_REGIONS.find((r) => r.id === (regionId ?? 'embercrypt'));
    if (!region) throw new RpgError('Unknown dungeon.');
    const selectedTier = tier ?? state.dungeonTier ?? 1;
    if (!Number.isInteger(selectedTier) || selectedTier < 1 || selectedTier > rpgUnlockedTier(state)) throw new RpgError('Clear your highest dungeon tier to unlock the next one.');
    state.dungeonTier = selectedTier;
    if (state.expeditionsCompleted < region.requiredClears) throw new RpgError('Finish more adventures to unlock this dungeon.');
    state.expedition = { id: crypto.randomUUID(), regionId: region.id, tier: selectedTier, encounterIndex: 0, encountersTotal: 6, cleared: false, startedAt: Date.now() };
    state.expedition.combat = rpgEncounterCombat(state);
    saveRpgState(db, state);
    return state;
  })();
}

const ResolveSchema = z.object({
  profileId: z.string().min(1).max(100), problemId: z.string().min(1).max(200),
  expeditionId: z.string().min(1).max(100), encounterIndex: z.number().int().min(0).max(5),
  spellId: z.enum(RPG_SPELL_IDS).optional(), assisted: z.boolean().optional(),
});

/** One recorded learning outcome can trigger one cast, even after reloads or HTTP retries.
 * Correctness remains the existing tutor's responsibility. This module reads its receipts only.
 * Assisted outcomes give the same adventure progress without changing any mastery records. */
export function resolveRpgEncounter(db: Database, input: z.infer<typeof ResolveSchema>): RpgResolveResult {
  const body = ResolveSchema.parse(input);
  return db.transaction(() => {
    const state = getRpgState(db, body.profileId);
    // Old room-clear receipts remain untouched and still reserve their solve.
    // The additive table allows several different problems in the same room.
    const claimed = db.query(`SELECT expedition_id, encounter_index, reward_json FROM rpg_claims WHERE profile_id = ? AND problem_id = ?
      UNION ALL SELECT expedition_id, encounter_index, reward_json FROM rpg_cast_claims WHERE profile_id = ? AND problem_id = ? LIMIT 1`)
      .get(body.profileId, body.problemId, body.profileId, body.problemId) as { expedition_id: string; encounter_index: number; reward_json: string } | null;
    if (claimed) {
      if (claimed.expedition_id !== body.expeditionId || claimed.encounter_index !== body.encounterIndex) throw new RpgError('This problem already powered another encounter.', 409);
      const reward = JSON.parse(claimed.reward_json) as RpgReward;
      // Old receipts predate school/scope/effect metadata. Keep their earned XP
      // and kills while returning the current description of the same item ID.
      if (reward.item) reward.item = RPG_ITEMS.find(item => item.id === reward.item!.id) ?? reward.item;
      reward.newItems = (reward.newItems ?? []).map(old => RPG_ITEMS.find(item => item.id === old.id) ?? old);
      return { state, reward, duplicate: true };
    }
    const expedition = state.expedition;
    if (!expedition || expedition.cleared || expedition.id !== body.expeditionId || expedition.encounterIndex !== body.encounterIndex) {
      throw new RpgError('Your adventure has moved on. Reload its saved checkpoint.', 409);
    }
    const spellId = body.spellId ?? state.selectedSpellId;
    if (!rpgSpellUnlocked(spellId, state.skills)) throw new RpgError('Unlock this spell in your skill tree first.');
    const solve = db.query('SELECT solved_at FROM daily_solves WHERE profile_id = ? AND problem_id = ?')
      .get(body.profileId, body.problemId) as { solved_at: number } | null;
    const assisted = body.assisted ? db.query(`SELECT created_at FROM attempts WHERE profile_id = ? AND problem_id = ?
      AND (correct = 0 OR skipped = 1) ORDER BY id DESC LIMIT 1`).get(body.profileId, body.problemId) as { created_at: number } | null : null;
    const receiptTime = solve?.solved_at ?? assisted?.created_at;
    if (receiptTime === undefined || receiptTime < expedition.startedAt) throw new RpgError('Finish this problem with your tutor before casting.');
    const before = rpgEncounterCombat(state);
    const cast = rpgApplyCombat(state, before, spellId);
    expedition.combat = cast.combat;
    const bossDefeated = cast.result.encounterCleared && expedition.encounterIndex === expedition.encountersTotal - 1;
    const kills = cast.result.defeatedIds.length;
    let xp = bossDefeated ? 90 : 32;
    const oldLevel = state.level;
    // Relic forecasts use progress at the room's start, even when several
    // casts were needed. In particular, the first-room gift cannot disappear
    // merely because earlier casts already defeated a weak enemy.
    const roomStartKills = state.totalKills - before.enemies.filter(enemy => enemy.hp === 0).length;
    const item = cast.result.encounterCleared ? rpgRelicDrop({ ...state, totalKills: roomStartKills }, expedition.regionId, expedition.encounterIndex) : null;
    state.totalKills += kills;
    state.selectedSpellId = spellId;
    const duplicateItem = !!item && state.inventory.includes(item.id);
    const tier = rpgTier(expedition.tier);
    const loot = item ? rpgCreateLoot(item.id, tier) : undefined;
    if (loot) state.loot!.push(loot);
    const forgeDust = cast.result.encounterCleared ? rpgRoomForgeDust(tier, bossDefeated) : 0;
    state.forgeDust = (state.forgeDust ?? 0) + forgeDust;
    if (item && !duplicateItem) state.inventory.push(item.id);
    if (duplicateItem) xp += RPG_DUPLICATE_ITEM_XP;
    state.xp += xp;
    Object.assign(state, rpgLevel(state.xp));
    const levelsGained = state.level - oldLevel;
    state.skillPoints += levelsGained;
    if (bossDefeated) { expedition.cleared = true; state.expeditionsCompleted++; state.bestTier = Math.max(state.bestTier ?? 0, tier); }
    else if (cast.result.encounterCleared) { expedition.encounterIndex++; expedition.combat = rpgEncounterCombat(state); }
    const reward: RpgReward = { xp, kills, levelUp: levelsGained > 0, levelsGained, item, newItems: item && !duplicateItem ? [item] : [], duplicateItem, bossDefeated, spellId, combat: cast.result, loot, forgeDust, tier };
    db.query(`INSERT INTO rpg_cast_claims (profile_id, problem_id, expedition_id, encounter_index, reward_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(body.profileId, body.problemId, expedition.id, body.encounterIndex, JSON.stringify(reward), Date.now());
    saveRpgState(db, state);
    return { state, reward, duplicate: false };
  })();
}

const ProfileSchema = z.object({ profileId: z.string().min(1).max(100) });
export function createRpgRoutes(db: Database, applyMiss?: (profileId: string) => unknown): Hono {
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid adventure request.' }, 400);
    if (error instanceof RpgError) return c.json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return c.json({ error: 'Invalid JSON.' }, 400);
    console.error('[rpg]', error);
    return c.json({ error: 'Your adventure could not be saved. Please try again.' }, 500);
  });
  app.get('/attempt-status', (c) => {
    const { profileId, problemId } = ProfileSchema.extend({ problemId: z.string().min(1).max(200) })
      .parse({ profileId: c.req.query('profileId'), problemId: c.req.query('problemId') });
    const attempt = db.query(`SELECT correct, skipped FROM attempts WHERE profile_id = ? AND problem_id = ? ORDER BY id LIMIT 1`)
      .get(profileId, problemId) as { correct: number; skipped: number } | null;
    const solved = !!db.query('SELECT 1 FROM daily_solves WHERE profile_id = ? AND problem_id = ?').get(profileId, problemId);
    return c.json({ recorded: !!attempt, correct: attempt ? !!attempt.correct : null, solved, skipped: !!attempt?.skipped });
  });
  app.get('/state', (c) => {
    const { profileId } = ProfileSchema.parse({ profileId: c.req.query('profileId') ?? 'sam' });
    return c.json(getRpgState(db, profileId));
  });
  app.post('/start', async (c) => {
    const { profileId, regionId, tier } = ProfileSchema.extend({ regionId: z.string().optional(), tier: z.number().int().min(1).max(RPG_MAX_DUNGEON_TIER).optional() }).parse(await c.req.json());
    return c.json(startRpgExpedition(db, profileId, regionId, tier));
  });
  // Leaving an over-tough dungeon never takes earned rewards away or grants
  // a clear. Existing solve receipts remain claimed across the return to camp.
  app.post('/retreat', async (c) => {
    const { profileId } = ProfileSchema.parse(await c.req.json());
    const state = db.transaction(() => {
      const state = getRpgState(db, profileId);
      if (state.expedition) { state.expedition = null; saveRpgState(db, state); }
      return state;
    })();
    return c.json(state);
  });
  // The original miss calculation runs unchanged, but its receipt is atomic
  // with the write so a disconnected client cannot consume two shields.
  app.post('/miss', async (c) => {
    const { profileId, problemId } = ProfileSchema.extend({ problemId: z.string().min(1).max(200) }).parse(await c.req.json());
    const response = db.transaction(() => {
      const receipt = db.query('SELECT response_json FROM rpg_misses WHERE profile_id = ? AND problem_id = ?')
        .get(profileId, problemId) as { response_json: string } | null;
      if (receipt) return JSON.parse(receipt.response_json);
      const attempt = db.query('SELECT correct, skipped FROM attempts WHERE profile_id = ? AND problem_id = ? ORDER BY id LIMIT 1')
        .get(profileId, problemId) as { correct: number; skipped: number } | null;
      const solved = db.query('SELECT 1 FROM daily_solves WHERE profile_id = ? AND problem_id = ?').get(profileId, problemId);
      if (!applyMiss || !attempt || attempt.correct || attempt.skipped || solved) throw new RpgError('This problem is not an exhausted attempt.');
      const result = applyMiss(profileId);
      db.query('INSERT INTO rpg_misses (profile_id,problem_id,response_json) VALUES (?, ?, ?)').run(profileId, problemId, JSON.stringify(result));
      return result;
    })();
    return c.json(response);
  });
  app.post('/resolve', async (c) => c.json(resolveRpgEncounter(db, await c.req.json())));
  app.post('/upgrade', async (c) => {
    const { profileId, skillId, requestId } = ProfileSchema.extend({ skillId: z.string(), requestId: z.string().min(1).max(100).optional() }).parse(await c.req.json());
    const state = db.transaction(() => {
      const state = getRpgState(db, profileId);
      if (requestId) {
        const receipt = db.query('SELECT skill_id FROM rpg_upgrades WHERE profile_id = ? AND request_id = ?')
          .get(profileId, requestId) as { skill_id: string } | null;
        if (receipt) {
          if (receipt.skill_id !== skillId) throw new RpgError('This request already learned a different skill.', 409);
          return state;
        }
      }
      const skill = RPG_SKILLS.find((entry) => entry.id === skillId);
      if (!skill) throw new RpgError('Unknown skill.');
      if (state.skillPoints < 1) throw new RpgError('Level up to earn a skill point.');
      if (state.level < skill.level) throw new RpgError(`Reach level ${skill.level} to learn this skill.`);
      if (skill.parentId && !(state.skills[skill.parentId] > 0)) throw new RpgError('Learn the connected skill first.');
      if ((state.skills[skillId] ?? 0) >= skill.maxRank) throw new RpgError('This skill is already fully learned.');
      state.skills[skillId] = (state.skills[skillId] ?? 0) + 1;
      state.skillPoints--;
      if (requestId) db.query('INSERT INTO rpg_upgrades (profile_id,request_id,skill_id) VALUES (?, ?, ?)').run(profileId, requestId, skillId);
      saveRpgState(db, state);
      return state;
    })();
    return c.json(state);
  });
  app.post('/equip', async (c) => {
    const { profileId, itemId, lootId } = ProfileSchema.extend({ itemId: z.string().optional(), lootId: z.string().optional() }).parse(await c.req.json());
    const state = getRpgState(db, profileId);
    const loot = lootId ? state.loot?.find(item => item.id === lootId) : state.loot?.find(item => item.itemId === itemId);
    if (!loot || (itemId && loot.itemId !== itemId) || !state.inventory.includes(loot.itemId)) throw new RpgError('Find this item before equipping it.');
    state.equippedItemId = loot.itemId;
    state.equippedLootId = loot.id;
    saveRpgState(db, state);
    return c.json(state);
  });
  app.post('/goal', async (c) => {
    const { profileId, goal } = ProfileSchema.extend({ goal: z.object({ kind: z.enum(['item', 'upgrade', 'skill']), id: z.string().min(1).max(100) }).nullable() }).parse(await c.req.json());
    const state = getRpgState(db, profileId);
    if (goal) {
      const valid = goal.kind === 'item' ? RPG_ITEMS.some(item => item.id === goal.id)
        : goal.kind === 'skill' ? RPG_SKILLS.some(skill => skill.id === goal.id)
        : state.loot?.some(item => item.id === goal.id);
      if (!valid) throw new RpgError('Choose a reward from your adventure collection.');
    }
    state.goal = goal;
    saveRpgState(db, state);
    return c.json(state);
  });
  app.post('/spell', async (c) => {
    const { profileId, spellId } = ProfileSchema.extend({ spellId: z.enum(RPG_SPELL_IDS) }).parse(await c.req.json());
    const state = getRpgState(db, profileId);
    if (!rpgSpellUnlocked(spellId, state.skills)) throw new RpgError('Unlock this spell in your skill tree first.');
    state.selectedSpellId = spellId;
    saveRpgState(db, state);
    return c.json(state);
  });
  app.post('/appearance', async (c) => {
    const { profileId, appearanceId } = ProfileSchema.extend({ appearanceId: z.enum(RPG_APPEARANCE_IDS) }).parse(await c.req.json());
    const state = db.transaction(() => {
      const state = getRpgState(db, profileId);
      if (!rpgAppearanceUnlocked(appearanceId, rpgLevel(state.xp).level)) {
        const appearance = RPG_APPEARANCES.find(entry => entry.id === appearanceId)!;
        throw new RpgError(`Reach level ${appearance.requiredLevel} to wear ${appearance.name}.`);
      }
      if (state.appearanceId !== appearanceId) { state.appearanceId = appearanceId; saveRpgState(db, state); }
      return state;
    })();
    return c.json(state);
  });
  app.post('/respec', async (c) => {
    const { profileId } = ProfileSchema.parse(await c.req.json());
    const state = getRpgState(db, profileId);
    if (state.expedition && !state.expedition.cleared) throw new RpgError('Finish this adventure to rebuild your skills at camp.');
    state.skillPoints = state.level - 1;
    state.skills = {};
    state.selectedSpellId = 'ember';
    saveRpgState(db, state);
    return c.json(state);
  });
  return app;
}
