import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  rpgRollBossBonus, rpgLootSpellShape, RPG_CHESTS_PER_EXPEDITION, RPG_CHEST_XP, rpgEquippedLoot, RPG_ITEMS, RPG_REGIONS, RPG_SKILLS, RPG_SPELL_IDS, RPG_DUPLICATE_ITEM_XP, RPG_APPEARANCES, RPG_APPEARANCE_IDS, rpgAppearanceUnlocked, rpgLevel, rpgSpellAvailable, rpgEncounterCombat, rpgApplyCombat, rpgAnswerPower, rpgRelicDrop, rpgNormalizeLoot, rpgCreateLoot, rpgRoomForgeDust, rpgDepth, rpgDepthSteps, rpgDepthXp, rpgTier, rpgUnlockedTier, RPG_MAX_DUNGEON_TIER,
  type RpgState, type RpgReward, type RpgResolveResult, type RpgChestResult, type RpgChestReward,
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
    CREATE TABLE IF NOT EXISTS rpg_chest_claims (
      profile_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      expedition_id TEXT NOT NULL,
      chest_id TEXT NOT NULL,
      reward_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (profile_id, problem_id),
      UNIQUE (profile_id, expedition_id, chest_id)
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
    if (!rpgSpellAvailable(state)) state.selectedSpellId = 'cleave';
    if (state.expedition && !state.expedition.cleared) state.expedition.combat = rpgEncounterCombat(state);
    return state;
  }
  return rpgNormalizeLoot({
    profileId, xp: 0, ...rpgLevel(0), skillPoints: 0, skills: {}, inventory: ['apprentice'],
    equippedItemId: 'apprentice', selectedSpellId: 'cleave', appearanceId: 'wayfarer', totalKills: 0, expeditionsCompleted: 0, expedition: null,
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

/**
 * After a guardian falls, the hero may go deeper into the same region at once:
 * a new expedition (new id, new receipts, new six packs) one depth lower, at
 * the same tier. A retry after success returns the depth already entered.
 */
export function descendRpgExpedition(db: Database, profileId: string, expeditionId: string): RpgState {
  return db.transaction(() => {
    const state = getRpgState(db, profileId);
    const current = state.expedition;
    if (current?.previousId === expeditionId) return state;
    if (!current || !current.cleared || current.id !== expeditionId) throw new RpgError('Defeat this guardian before going deeper.', 409);
    const region = RPG_REGIONS.find(r => r.id === current.regionId);
    if (!region) throw new RpgError('Unknown dungeon.');
    state.expedition = { id: crypto.randomUUID(), regionId: region.id, tier: rpgTier(current.tier), depth: rpgDepth(rpgDepth(current.depth) + 1), previousId: current.id, encounterIndex: 0, encountersTotal: 6, cleared: false, startedAt: Date.now() };
    state.expedition.combat = rpgEncounterCombat(state);
    saveRpgState(db, state);
    return state;
  })();
}

const ResolveSchema = z.object({
  profileId: z.string().min(1).max(100), problemId: z.string().min(1).max(200),
  expeditionId: z.string().min(1).max(100), encounterIndex: z.number().int().min(0).max(5),
  spellId: z.enum(RPG_SPELL_IDS).optional(), assisted: z.boolean().optional(),
  answerMs: z.number().finite().min(0).optional(), wrongCount: z.number().int().min(0).optional(),
});

/** One recorded learning outcome can trigger one cast, even after reloads or HTTP retries.
 * Correctness remains the existing tutor's responsibility. This module reads its receipts only.
 * Assisted outcomes cannot cast. Old claims still replay their original rewards. */
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
    if (db.query('SELECT 1 FROM rpg_chest_claims WHERE profile_id = ? AND problem_id = ?').get(body.profileId, body.problemId)) {
      throw new RpgError('This problem already opened a chest.', 409);
    }
    const expedition = state.expedition;
    if (!expedition || expedition.cleared || expedition.id !== body.expeditionId || expedition.encounterIndex !== body.encounterIndex) {
      throw new RpgError('Your adventure has moved on. Reload its saved checkpoint.', 409);
    }
    const spellId = body.spellId ?? state.selectedSpellId;
    if (!rpgSpellAvailable(state, spellId)) throw new RpgError('Learn this spell or equip a relic that grants it.');
    const solve = db.query('SELECT solved_at FROM daily_solves WHERE profile_id = ? AND problem_id = ?')
      .get(body.profileId, body.problemId) as { solved_at: number } | null;
    const skipped = db.query('SELECT 1 FROM attempts WHERE profile_id = ? AND problem_id = ? AND skipped = 1 LIMIT 1')
      .get(body.profileId, body.problemId);
    if (body.assisted || skipped || !solve || solve.solved_at < expedition.startedAt) throw new RpgError('Finish this problem with your tutor before casting.');
    // The tutor records the first try; further retries are intentionally not
    // mastery attempts. Preserve that distinction while enforcing its known miss.
    const recordedWrong = db.query(`SELECT COUNT(*) AS count FROM attempts WHERE profile_id = ? AND problem_id = ?
      AND correct = 0 AND COALESCE(skipped, 0) = 0`).get(body.profileId, body.problemId) as { count: number };
    const powerPercent = rpgAnswerPower(body.answerMs, Math.max(body.wrongCount ?? 0, recordedWrong.count));
    const before = rpgEncounterCombat(state);
    const cast = rpgApplyCombat(state, before, spellId, powerPercent);
    expedition.combat = cast.combat;
    const bossDefeated = cast.result.encounterCleared && expedition.encounterIndex === expedition.encountersTotal - 1;
    const kills = cast.result.defeatedIds.length;
    let xp = rpgDepthXp(bossDefeated, expedition.depth);
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
    const loot = item ? rpgCreateLoot(item.id, tier, Math.random, bossDefeated) : undefined;
    if (loot) state.loot!.push(loot);
    const forgeDust = cast.result.encounterCleared ? rpgRoomForgeDust(tier, bossDefeated) + rpgDepthSteps(expedition.depth) : 0;
    state.forgeDust = (state.forgeDust ?? 0) + forgeDust;
    if (item && !duplicateItem) state.inventory.push(item.id);
    if (duplicateItem) xp += RPG_DUPLICATE_ITEM_XP;
    state.xp += xp;
    Object.assign(state, rpgLevel(state.xp));
    const levelsGained = state.level - oldLevel;
    state.skillPoints += levelsGained;
    if (bossDefeated) { expedition.cleared = true; state.expeditionsCompleted++; state.bestTier = Math.max(state.bestTier ?? 0, tier); }
    else if (cast.result.encounterCleared) { expedition.encounterIndex++; expedition.combat = rpgEncounterCombat(state); }
    const shape = rpgLootSpellShape(rpgEquippedLoot(state));
    const spellShape = shape?.spellId === spellId ? shape.id : undefined;
    const { bossCrazyCoins, bossDimes } = bossDefeated ? rpgRollBossBonus(Math.random, tier) : { bossCrazyCoins: 0, bossDimes: 0 };
    const reward: RpgReward = { spellShape, bossCrazyCoins, bossDimes, xp, kills, levelUp: levelsGained > 0, levelsGained, item, newItems: item && !duplicateItem ? [item] : [], duplicateItem, bossDefeated, spellId, combat: cast.result, loot, forgeDust, tier };
    db.query(`INSERT INTO rpg_cast_claims (profile_id, problem_id, expedition_id, encounter_index, reward_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(body.profileId, body.problemId, expedition.id, body.encounterIndex, JSON.stringify(reward), Date.now());
    saveRpgState(db, state);
    return { state, reward, duplicate: false };
  })();
}

const ChestSchema = z.object({
  profileId: z.string().min(1).max(100), problemId: z.string().min(1).max(200),
  expeditionId: z.string().min(1).max(100), chestId: z.string().min(1).max(100),
});

/**
 * A chest opens with one solved problem, as a cast does: the tutor's receipt
 * decides, an assisted or skipped problem cannot open it, and one problem pays
 * once. A problem that powered a cast cannot open a chest, nor the reverse.
 */
export function openRpgChest(db: Database, input: z.infer<typeof ChestSchema>): RpgChestResult {
  const body = ChestSchema.parse(input);
  return db.transaction(() => {
    const state = getRpgState(db, body.profileId);
    const receipt = db.query('SELECT expedition_id, chest_id, reward_json FROM rpg_chest_claims WHERE profile_id = ? AND problem_id = ?')
      .get(body.profileId, body.problemId) as { expedition_id: string; chest_id: string; reward_json: string } | null;
    if (receipt) {
      if (receipt.expedition_id !== body.expeditionId || receipt.chest_id !== body.chestId) throw new RpgError('This problem already opened another chest.', 409);
      return { state, reward: JSON.parse(receipt.reward_json) as RpgChestReward, duplicate: true };
    }
    const cast = db.query(`SELECT 1 FROM rpg_claims WHERE profile_id = ? AND problem_id = ?
      UNION ALL SELECT 1 FROM rpg_cast_claims WHERE profile_id = ? AND problem_id = ? LIMIT 1`).get(body.profileId, body.problemId, body.profileId, body.problemId);
    if (cast) throw new RpgError('This problem already powered a spell.', 409);
    const expedition = state.expedition;
    if (!expedition || expedition.cleared || expedition.id !== body.expeditionId) throw new RpgError('Your adventure has moved on. Reload its saved checkpoint.', 409);
    if (db.query('SELECT 1 FROM rpg_chest_claims WHERE profile_id = ? AND expedition_id = ? AND chest_id = ?').get(body.profileId, expedition.id, body.chestId)) {
      throw new RpgError('This chest is already open.', 409);
    }
    const solve = db.query('SELECT solved_at FROM daily_solves WHERE profile_id = ? AND problem_id = ?')
      .get(body.profileId, body.problemId) as { solved_at: number } | null;
    const skipped = db.query('SELECT 1 FROM attempts WHERE profile_id = ? AND problem_id = ? AND skipped = 1 LIMIT 1').get(body.profileId, body.problemId);
    if (skipped || !solve || solve.solved_at < expedition.startedAt) throw new RpgError('Finish this problem with your tutor to open the chest.');
    const opened = db.query('SELECT COUNT(*) AS count FROM rpg_chest_claims WHERE profile_id = ? AND expedition_id = ?')
      .get(body.profileId, expedition.id) as { count: number };
    const tier = rpgTier(expedition.tier);
    const full = opened.count < RPG_CHESTS_PER_EXPEDITION;
    // One chest in four holds a relic from the hero's current collection pool.
    const pool = RPG_ITEMS.filter(item => item.id !== 'apprentice' && item.requiredClears <= state.expeditionsCompleted);
    const item = full && pool.length && Math.random() < .25 ? pool[Math.floor(Math.random() * pool.length)]! : null;
    const duplicateItem = !!item && state.inventory.includes(item.id);
    const loot = item ? rpgCreateLoot(item.id, tier, Math.random) : undefined;
    if (loot) state.loot!.push(loot);
    if (item && !duplicateItem) state.inventory.push(item.id);
    const xp = full ? RPG_CHEST_XP : 0, forgeDust = full ? rpgRoomForgeDust(tier) : 0;
    const oldLevel = state.level;
    state.xp += xp; state.forgeDust = (state.forgeDust ?? 0) + forgeDust;
    Object.assign(state, rpgLevel(state.xp));
    const levelsGained = state.level - oldLevel;
    state.skillPoints += levelsGained;
    const reward: RpgChestReward = { chestId: body.chestId, xp, forgeDust, levelUp: levelsGained > 0, levelsGained, item, newItems: item && !duplicateItem ? [item] : [], duplicateItem, loot, tier };
    db.query(`INSERT INTO rpg_chest_claims (profile_id, problem_id, expedition_id, chest_id, reward_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(body.profileId, body.problemId, expedition.id, body.chestId, JSON.stringify(reward), Date.now());
    saveRpgState(db, state);
    return { state, reward, duplicate: false };
  })();
}

const ProfileSchema = z.object({ profileId: z.string().min(1).max(100) });
export function createRpgRoutes(db: Database, applyMiss?: (profileId: string) => unknown, onBossDefeated?: (profileId: string, reward: RpgReward) => void): Hono {
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
  app.post('/descend', async (c) => {
    const { profileId, expeditionId } = ProfileSchema.extend({ expeditionId: z.string().min(1).max(100) }).parse(await c.req.json());
    return c.json(descendRpgExpedition(db, profileId, expeditionId));
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
  app.post('/resolve', async (c) => {
    const body = await c.req.json();
    const result = db.transaction(() => {
      const result = resolveRpgEncounter(db, body);
      if (result.reward.bossDefeated && !result.duplicate) onBossDefeated?.(result.state.profileId, result.reward);
      return result;
    })();
    return c.json(result);
  });
  app.post('/chest', async (c) => c.json(openRpgChest(db, await c.req.json())));
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
    // Relic-granted spells last only while their copy is equipped.
    if (!rpgSpellAvailable(state)) state.selectedSpellId = 'cleave';
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
    if (!rpgSpellAvailable(state, spellId)) throw new RpgError('Learn this spell or equip a relic that grants it.');
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
