import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RPG_SPELLS, RPG_SPELL_IDS, RPG_SKILLS, RPG_ITEMS, rpgLevel, rpgSpellUnlocked, rpgSpellSchool, rpgItemApplies, rpgSpellModifiers, rpgEncounterKills, rpgEncounterCombat, rpgSpellCombatStats, rpgNextRelicHunt, rpgNormalizeLoot } from '@institute/shared';
import { ensureRpgSchema, getRpgState, startRpgExpedition, resolveRpgEncounter, createRpgRoutes, openRpgChest, descendRpgExpedition, wakeRpgGuardian, saveRpgState } from './rpg';
import { RPG_MAX_DEPTH_STEPS, rpgDepthHealth, rpgDepthXp, rpgRoomForgeDust } from '@institute/shared';
import { RPG_CHESTS_PER_EXPEDITION, RPG_CHEST_XP } from '@institute/shared';

function legacyDb(): Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE attempts (id INTEGER PRIMARY KEY, profile_id TEXT, problem_id TEXT, correct INTEGER, skipped INTEGER DEFAULT 0, created_at INTEGER);
    CREATE TABLE daily_solves (profile_id TEXT, problem_id TEXT, solved_at INTEGER, PRIMARY KEY (profile_id,problem_id));
    CREATE TABLE topic_mastery (profile_id TEXT, topic_id TEXT, state TEXT, attempts INTEGER, correct INTEGER, review_due_at INTEGER);
    CREATE TABLE profile_state (profile_id TEXT PRIMARY KEY, gems INTEGER, equipped_pickaxe TEXT);
    CREATE TABLE topic_demos (profile_id TEXT, topic_id TEXT, seen_at INTEGER);
    INSERT INTO profile_state VALUES ('sam', 482, 'diamond');
    INSERT INTO topic_mastery VALUES ('sam', 'preserved-topic', 'mastered', 44, 40, 1900000000000);
    INSERT INTO topic_demos VALUES ('sam', 'preserved-topic', 1600000000000);
    INSERT INTO attempts VALUES (1, 'sam', 'old-problem', 1, 0, 1600000000000);
    INSERT INTO daily_solves VALUES ('sam', 'old-problem', 1600000000000);
  `);
  return db;
}
const snapshot = (db: Database) => JSON.stringify(['attempts', 'daily_solves', 'topic_mastery', 'profile_state', 'topic_demos'].map((table) => db.query(`SELECT * FROM ${table}`).all()));
function solved(db: Database, profileId: string, problemId: string): void {
  db.query('INSERT INTO daily_solves VALUES (?, ?, ?)').run(profileId, problemId, Date.now());
}
function resolve(db: Database, profileId: string, problemId: string, extra = {}) {
  const expedition = getRpgState(db, profileId).expedition!;
  return resolveRpgEncounter(db, { profileId, problemId, expeditionId: expedition.id, encounterIndex: expedition.encounterIndex, ...extra });
}
/** Tests walk the classic route: five packs, then into the sanctum to wake the guardian. */
function wakeIfDue(db: Database, profileId: string) {
  const expedition = getRpgState(db, profileId).expedition;
  if (expedition && !expedition.cleared && expedition.encounterIndex !== 5 && (expedition.packsCleared ?? 0) >= 5) wakeRpgGuardian(db, profileId, expedition.id);
}
function clearRoom(db: Database, profileId: string, prefix: string, wake = true) {
  if (wake) wakeIfDue(db, profileId);
  const room = getRpgState(db, profileId).expedition!.encounterIndex;
  for (let cast = 0; cast < 16; cast++) {
    const problem = `${prefix}-cast-${cast}`;
    solved(db, profileId, problem);
    const before = snapshot(db), result = resolve(db, profileId, problem);
    expect(snapshot(db)).toBe(before);
    if (result.reward.combat!.encounterCleared) return result;
    expect(result.state.expedition!.encounterIndex).toBe(room);
  }
  throw new Error('Starter failed to clear room within bounded cast count');
}
function call(db: Database, path: string, body?: unknown) {
  return createRpgRoutes(db).request(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe('additive RPG progression on legacy learning data', () => {
  test('several recorded answers damage one persistent pack and only its clear advances or drops loot', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const initial = startRpgExpedition(db, 'sam');
      expect(initial.selectedSpellId).toBe('cleave');
      expect(initial.expedition!.combat!.enemies).toHaveLength(3);
      solved(db, 'sam', 'cast-one'); solved(db, 'sam', 'cast-two');
      const learning = snapshot(db);
      const request = { profileId: 'sam', problemId: 'cast-one', expeditionId: initial.expedition!.id, encounterIndex: 0 };
      const first = resolveRpgEncounter(db, request);
      expect(first.state.expedition).toMatchObject({ encounterIndex: 0, combat: { casts: 1 } });
      expect(first.reward).toMatchObject({ kills: 2, item: null, bossDefeated: false });
      const saved = getRpgState(db, 'sam');
      expect(saved.expedition!.combat!.enemies).toEqual(first.reward.combat!.enemiesAfter);
      expect(rpgNextRelicHunt(saved, 'embercrypt')).toMatchObject({ itemId: 'cinderwand', encounterIndex: 0 });
      const second = resolveRpgEncounter(db, { ...request, problemId: 'cast-two' });
      expect(second.reward.combat!.enemiesBefore).toEqual(first.reward.combat!.enemiesAfter);
      expect(second.reward).toMatchObject({ kills: 1, xp: 32, item: { id: 'cinderwand' }, combat: { encounterCleared: true } });
      expect(second.state).toMatchObject({ xp: 64, totalKills: 3, expedition: { encounterIndex: 1, combat: { casts: 0 } } });
      const lateRetry = resolveRpgEncounter(db, request);
      expect(lateRetry.reward).toEqual(first.reward);
      expect(lateRetry.state).toEqual(second.state);
      expect(lateRetry.duplicate).toBe(true);
      expect(db.query('SELECT COUNT(*) AS n FROM rpg_cast_claims').get()).toEqual({ n: 2 });
      expect(db.query('SELECT COUNT(*) AS n FROM rpg_claims').get()).toEqual({ n: 0 });
      expect(snapshot(db)).toBe(learning);
    } finally { db.close(); }
  });

  test('an old active save gets deterministic health on reads without rewriting earned progress', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const state = startRpgExpedition(db, 'sam');
      state.xp = 420; state.totalKills = 177; state.expedition!.encounterIndex = 4;
      Object.assign(state, rpgLevel(state.xp));
      delete state.expedition!.combat;
      const oldJson = JSON.stringify(state);
      db.query('UPDATE rpg_profiles SET state_json = ? WHERE profile_id = ?').run(oldJson, 'sam');
      const before = snapshot(db), read = getRpgState(db, 'sam');
      expect(read).toMatchObject({ xp: 420, totalKills: 177, expedition: { encounterIndex: 4, combat: { casts: 0, version: 1 } } });
      expect(read.expedition!.combat!.enemies).toHaveLength(6);
      expect(getRpgState(db, 'sam')).toEqual(read);
      expect((db.query('SELECT state_json FROM rpg_profiles WHERE profile_id = ?').get('sam') as any).state_json).toBe(oldJson);
      expect(snapshot(db)).toBe(before);
    } finally { db.close(); }
  });

  test('schema creation and RPG actions leave every legacy table byte-for-byte unchanged', () => {
    const db = legacyDb();
    const before = snapshot(db);
    ensureRpgSchema(db);
    ensureRpgSchema(db);
    expect(getRpgState(db, 'sam')).toMatchObject({ xp: 0, level: 1, inventory: ['apprentice'] });
    startRpgExpedition(db, 'sam');
    expect(snapshot(db)).toBe(before);
    solved(db, 'sam', 'new-problem');
    const beforeResolve = snapshot(db);
    const result = resolve(db, 'sam', 'new-problem');
    expect(result.reward).toMatchObject({ kills: 2, xp: 32, newItems: [], combat: { encounterCleared: false } });
    expect(snapshot(db)).toBe(beforeResolve);
    ensureRpgSchema(db);
    expect(getRpgState(db, 'sam')).toEqual(result.state);
    db.close();
  });

  test('an on-disk checkpoint and reward receipt survive closing and reopening the database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'institute-rpg-'));
    const path = join(directory, 'legacy.db');
    let db: Database | undefined;
    try {
      const seed = legacyDb();
      seed.query('VACUUM INTO ?').run(path);
      seed.close();
      db = new Database(path);
      ensureRpgSchema(db);
      const start = startRpgExpedition(db, 'sam');
      solved(db, 'sam', 'persisted');
      const request = { profileId: 'sam', problemId: 'persisted', expeditionId: start.expedition!.id, encounterIndex: 0 };
      const reward = resolveRpgEncounter(db, request);
      const learning = snapshot(db);
      db.close();
      db = new Database(path);
      ensureRpgSchema(db);
      expect(getRpgState(db, 'sam')).toEqual(reward.state);
      expect(resolveRpgEncounter(db, request).duplicate).toBe(true);
      expect(getRpgState(db, 'sam').xp).toBe(32);
      expect(snapshot(db)).toBe(learning);
    } finally {
      db?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('reward retries are idempotent and cannot spend the same problem on another encounter', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    const initial = startRpgExpedition(db, 'sam');
    solved(db, 'sam', 'right');
    const request = { profileId: 'sam', problemId: 'right', expeditionId: initial.expedition!.id, encounterIndex: 0 };
    const first = resolveRpgEncounter(db, request);
    const retry = resolveRpgEncounter(db, request);
    expect(retry.duplicate).toBe(true);
    expect(retry.state).toEqual(first.state);
    expect(retry.reward).toEqual(first.reward);
    expect(() => resolveRpgEncounter(db, { ...request, encounterIndex: 1 })).toThrow('already powered');
    expect(db.query('SELECT COUNT(*) AS n FROM rpg_cast_claims').get()).toEqual({ n: 1 });
    db.close();
  });

  test('region hunt previews match real rewards while preserving profiles, learning and experience', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const untouched = getRpgState(db, 'sam');
      for (const [regionId, targetItem] of [['embercrypt', 'cleaver'], ['frostvault', 'glacier'], ['stormspire', 'thunderrod']]) {
        const profileId = `hunter-${regionId}`, initial = getRpgState(db, profileId);
        Object.assign(initial, { totalKills: 100, expeditionsCompleted: 3, inventory: ['apprentice', 'cinderwand'] });
        db.query('INSERT INTO rpg_profiles VALUES (?, ?, ?)').run(profileId, JSON.stringify(initial), 1);
        const preview = rpgNextRelicHunt(initial, regionId)!;
        expect(preview).toMatchObject({ itemId: targetItem, encounterIndex: 2 });
        startRpgExpedition(db, profileId, regionId);
        // An elite pack ahead can bring the relic sooner; the forecast for the started expedition knows it.
        const active = rpgNextRelicHunt(getRpgState(db, profileId), regionId)!;
        expect(active.itemId).toBe(targetItem);
        for (let room = 0; room <= active.encounterIndex; room++) {
          const result = clearRoom(db, profileId, `${profileId}-${room}`);
          expect(result.reward.xp).toBe(32);
          expect(result.reward.item?.id ?? null).toBe(room === active.encounterIndex ? targetItem : null);

        }
        expect(getRpgState(db, profileId).inventory).toEqual(['apprentice', 'cinderwand', targetItem]);
      }
      expect(getRpgState(db, 'sam')).toEqual(untouched);
    } finally { db.close(); }
  });

  test('a pre-hunt global-pool receipt never rerolls into the new regional reward', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const initial = startRpgExpedition(db, 'sam');
      initial.totalKills = 100; initial.inventory = ['apprentice', 'cinderwand']; initial.expedition!.encounterIndex = 2;
      db.query('UPDATE rpg_profiles SET state_json = ? WHERE profile_id = ?').run(JSON.stringify(initial), 'sam');
      solved(db, 'sam', 'pre-hunt');
      const request = { profileId: 'sam', problemId: 'pre-hunt', expeditionId: initial.expedition!.id, encounterIndex: 2 };
      const oldRelic = RPG_ITEMS.find(item => item.id === 'glacier')!;
      const oldReward = { xp: 32, kills: 16, levelUp: false, levelsGained: 0, item: oldRelic, newItems: [oldRelic], duplicateItem: false, bossDefeated: false, spellId: 'ember' as const };
      initial.inventory = ['apprentice', 'cinderwand', 'glacier'];
      initial.xp = 32; initial.totalKills = 116; initial.expedition!.encounterIndex = 3;
      delete initial.expedition!.combat;
      db.query('INSERT INTO rpg_claims VALUES (?,?,?,?,?,?)').run('sam', request.problemId, request.expeditionId, 2, JSON.stringify(oldReward), Date.now());
      db.query('UPDATE rpg_profiles SET state_json = ? WHERE profile_id = ?').run(JSON.stringify(initial), 'sam');
      const prior = { state: getRpgState(db, 'sam'), reward: oldReward };
      const saved = db.query('SELECT * FROM rpg_claims').all(), learning = snapshot(db);
      expect(resolveRpgEncounter(db, request)).toEqual({ ...prior, duplicate: true });
      expect(db.query('SELECT * FROM rpg_claims').all()).toEqual(saved);
      expect(getRpgState(db, 'sam')).toEqual(prior.state);
      expect(snapshot(db)).toBe(learning);
    } finally { db.close(); }
  });

  test('old larger-pack receipts retain earned kills while future encounters use smaller packs', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const initial = startRpgExpedition(db, 'sam');
      // A trip with no elite pack, so the next pack's health is the plain one.
      initial.expedition!.id = 'plain-trip-1';
      solved(db, 'sam', 'pre-viewport-change');
      const request = { profileId: 'sam', problemId: 'pre-viewport-change', expeditionId: initial.expedition!.id, encounterIndex: 0 };
      const oldReward = { xp: 32, kills: 24, levelUp: false, levelsGained: 0, item: null, newItems: [], duplicateItem: false, bossDefeated: false, spellId: 'ember' as const };
      initial.xp = 32; initial.xpIntoLevel = 32; initial.totalKills = 24; initial.expedition!.encounterIndex = 1;
      delete initial.expedition!.combat;
      db.query('INSERT INTO rpg_claims VALUES (?,?,?,?,?,?)').run('sam', request.problemId, request.expeditionId, 0, JSON.stringify(oldReward), Date.now());
      db.query('UPDATE rpg_profiles SET state_json = ? WHERE profile_id = ?').run(JSON.stringify(initial), 'sam');
      const earned = { state: getRpgState(db, 'sam'), reward: oldReward };
      const learning = snapshot(db), savedReceipt = db.query('SELECT * FROM rpg_claims').all();
      ensureRpgSchema(db);
      for (let retry = 0; retry < 2; retry++) {
        const repeated = resolveRpgEncounter(db, request);
        expect(repeated).toEqual({ state: earned.state, reward: earned.reward, duplicate: true });
      }
      expect(db.query('SELECT * FROM rpg_claims').all()).toEqual(savedReceipt);
      expect(snapshot(db)).toBe(learning);
      solved(db, 'sam', 'post-viewport-change');
      const beforeNext = snapshot(db), next = resolve(db, 'sam', 'post-viewport-change');
      expect(next.reward).toMatchObject({ kills: 2, xp: 32 });
      expect(next.state.totalKills).toBe(26);
      expect(next.state.xp).toBe(64);
      expect(snapshot(db)).toBe(beforeNext);
    } finally { db.close(); }
  });

  test('a capped late-game pack awards unchanged XP once and does not mutate learning', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const initial = startRpgExpedition(db, 'sam');
      Object.assign(initial, { selectedSpellId: 'firestorm', skills: Object.fromEntries(RPG_SKILLS.map(skill => [skill.id, skill.maxRank])), equippedItemId: 'apprentice' });
      initial.xp = 82305; Object.assign(initial, rpgLevel(initial.xp));
      delete initial.expedition!.combat;
      initial.expedition!.combat = rpgEncounterCombat(initial);
      db.query('UPDATE rpg_profiles SET state_json = ? WHERE profile_id = ?').run(JSON.stringify(initial), 'sam');
      solved(db, 'sam', 'capped-pack');
      const learning = snapshot(db), request = { profileId: 'sam', problemId: 'capped-pack', expeditionId: initial.expedition!.id, encounterIndex: 0 };
      const first = resolveRpgEncounter(db, request);
      expect(first.reward).toMatchObject({ kills: 6, xp: 32 });
      expect(first.state.totalKills).toBe(6);
      expect(resolveRpgEncounter(db, request)).toEqual({ ...first, duplicate: true });
      expect(snapshot(db)).toBe(learning);
      expect(db.query('SELECT COUNT(*) AS n FROM rpg_cast_claims').get()).toEqual({ n: 1 });
    } finally { db.close(); }
  });

  test('unrecorded, other-profile, old, locked-spell, and stale-encounter claims are rejected', () => {
    const db = legacyDb(); ensureRpgSchema(db); startRpgExpedition(db, 'sam');
    expect(() => resolve(db, 'sam', 'invented')).toThrow('Finish this problem');
    expect(() => resolve(db, 'sam', 'old-problem')).toThrow('Finish this problem');
    solved(db, 'other-kid', 'other-solve');
    expect(() => resolve(db, 'sam', 'other-solve')).toThrow('Finish this problem');
    solved(db, 'sam', 'real');
    expect(() => resolve(db, 'sam', 'real', { spellId: 'storm' })).toThrow('Learn this spell');
    expect(() => resolve(db, 'sam', 'real', { encounterIndex: 5 })).toThrow('moved on');
    expect(getRpgState(db, 'sam').xp).toBe(0);
    db.close();
  });

  test('skips and walkthrough answers never cast, claim rewards, or rewrite learning', () => {
    const db = legacyDb(); ensureRpgSchema(db); startRpgExpedition(db, 'sam');
    db.query('INSERT INTO attempts (profile_id,problem_id,correct,skipped,created_at) VALUES (?, ?, 0, 1, ?)').run('sam', 'help', Date.now());
    expect(() => resolve(db, 'sam', 'help')).toThrow('Finish this problem');
    expect(() => resolve(db, 'sam', 'help', { assisted: true })).toThrow('Finish this problem');
    solved(db, 'sam', 'help');
    solved(db, 'sam', 'walkthrough');
    const before = snapshot(db);
    const beforeState = getRpgState(db, 'sam');
    expect(() => resolve(db, 'sam', 'help')).toThrow('Finish this problem');
    expect(() => resolve(db, 'sam', 'walkthrough', { assisted: true })).toThrow('Finish this problem');
    expect(getRpgState(db, 'sam')).toEqual(beforeState);
    expect(db.query('SELECT COUNT(*) AS n FROM rpg_cast_claims').get()).toEqual({ n: 0 });
    expect(snapshot(db)).toBe(before);
    db.close();
  });

  test('timing and mistakes scale server damage while correct-answer XP and immutable retries stay intact', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const initial = startRpgExpedition(db, 'sam');
      db.query('INSERT INTO attempts (profile_id,problem_id,correct,skipped,created_at) VALUES (?, ?, 0, 0, ?)').run('sam', 'slow-retry', Date.now());
      solved(db, 'sam', 'slow-retry');
      const before = snapshot(db);
      const body = { profileId: 'sam', problemId: 'slow-retry', expeditionId: initial.expedition!.id, encounterIndex: 0, answerMs: 30000, wrongCount: 2 };
      const result = resolveRpgEncounter(db, body);
      expect(result.reward).toMatchObject({ xp: 32, kills: 0, combat: { damage: 3, powerPercent: 30, coverage: 3 } });
      expect(result.state.expedition!.combat!.enemies.map(enemy => enemy.hp)).toEqual([9, 3, 5]);
      expect(getRpgState(db, 'sam')).toEqual(result.state);
      expect(resolveRpgEncounter(db, { ...body, answerMs: 0, wrongCount: 0 })).toEqual({ ...result, duplicate: true });
      expect(snapshot(db)).toBe(before);
    } finally { db.close(); }
  });

  test('an already claimed assisted reward remains a read-only historical receipt', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const state = startRpgExpedition(db, 'sam');
      db.query('INSERT INTO attempts (profile_id,problem_id,correct,skipped,created_at) VALUES (?, ?, 0, 1, ?)').run('sam', 'old-help', Date.now());
      const reward = { xp: 32, kills: 0, levelUp: false, levelsGained: 0, item: null, newItems: [], duplicateItem: false, bossDefeated: false, spellId: 'cleave' };
      db.query('INSERT INTO rpg_cast_claims VALUES (?,?,?,?,?,?)').run('sam', 'old-help', state.expedition!.id, 0, JSON.stringify(reward), Date.now());
      const before = snapshot(db), claims = db.query('SELECT * FROM rpg_cast_claims').all();
      expect(resolve(db, 'sam', 'old-help', { assisted: true, answerMs: 90000, wrongCount: 2 })).toEqual({ state, reward, duplicate: true });
      expect(snapshot(db)).toBe(before);
      expect(db.query('SELECT * FROM rpg_cast_claims').all()).toEqual(claims);
      expect(getRpgState(db, 'sam')).toEqual(state);
    } finally { db.close(); }
  });

  test('recorded wrong first attempts enforce a penalty even when an older client omits retry metadata', () => {
    const db = legacyDb(); ensureRpgSchema(db); startRpgExpedition(db, 'sam');
    try {
      db.query('INSERT INTO attempts (profile_id,problem_id,correct,skipped,created_at) VALUES (?, ?, 0, 0, ?)').run('sam', 'retry-power', Date.now());
      solved(db, 'sam', 'retry-power');
      const before = snapshot(db);
      expect(resolve(db, 'sam', 'retry-power').reward.combat).toMatchObject({ damage: 8, powerPercent: 90 });
      expect(snapshot(db)).toBe(before);
    } finally { db.close(); }
  });

  test('invalid response timing and mistake counters are rejected before combat changes', async () => {
    const db = legacyDb(); ensureRpgSchema(db); const state = startRpgExpedition(db, 'sam');
    try {
      solved(db, 'sam', 'valid-solve');
      const body = { profileId: 'sam', problemId: 'valid-solve', expeditionId: state.expedition!.id, encounterIndex: 0 };
      for (const extra of [{ answerMs: -1 }, { answerMs: 'fast' }, { wrongCount: -1 }, { wrongCount: 1.5 }]) {
        expect((await call(db, '/resolve', { ...body, ...extra })).status).toBe(400);
      }
      expect(getRpgState(db, 'sam')).toEqual(state);
    } finally { db.close(); }
  });

  test('six encounters award a boss, persist the checkpoint, unlock region and allow free respec', async () => {
    const db = legacyDb(); ensureRpgSchema(db);
    const run = startRpgExpedition(db, 'sam');
    expect(startRpgExpedition(db, 'sam', 'frostvault')).toEqual(run);
    let last;
    for (let i = 0; i < 6; i++) {
      last = clearRoom(db, 'sam', `p${i}`);
      if (i === 2) {
        expect(last.state.level).toBeGreaterThanOrEqual(2);
        expect(last.state.skillPoints).toBeGreaterThanOrEqual(1);
        const upgrade = await call(db, '/upgrade', { profileId: 'sam', skillId: 'frost' });
        expect(upgrade.status).toBe(200);
        expect((await upgrade.json() as any).skills.frost).toBe(1);
        expect((await call(db, '/respec', { profileId: 'sam' })).status).toBe(400);
      }
    }
    expect(last!.reward.bossDefeated).toBe(true);
    expect(last!.state).toMatchObject({ expeditionsCompleted: 1, expedition: { cleared: true } });
    expect((await call(db, '/respec', { profileId: 'sam' })).status).toBe(200);
    expect(getRpgState(db, 'sam')).toMatchObject({ skills: {}, skillPoints: last!.state.level - 1, selectedSpellId: 'ember' });
    const next = startRpgExpedition(db, 'sam', 'frostvault');
    expect(next.expedition!.regionId).toBe('frostvault');
    expect(next.expedition!.id).not.toBe(run.expedition!.id);
    db.close();
  });

  test('API validates skill costs, item ownership, region unlocks, malformed requests and isolates profiles', async () => {
    const db = legacyDb(); ensureRpgSchema(db);
    for (const [path, body] of [
      ['/upgrade', { profileId: 'sam', skillId: 'frost' }],
      ['/equip', { profileId: 'sam', itemId: 'phoenix' }],
      ['/spell', { profileId: 'sam', spellId: 'frost' }],
      ['/start', { profileId: 'sam', regionId: 'stormspire' }],
      ['/resolve', { profileId: 'sam', xp: 999999 }],
      ['/start', { profileId: '' }],
    ] as const) expect((await call(db, path, body)).status).toBe(400);
    startRpgExpedition(db, 'sam'); clearRoom(db, 'sam', 'reward');
    expect((await call(db, '/equip', { profileId: 'sam', itemId: 'cinderwand' })).status).toBe(200);
    expect(getRpgState(db, 'other-kid').inventory).toEqual(['apprentice']);
    expect(getRpgState(db, 'other-kid').xp).toBe(0);
    db.close();
  });

  test('skill purchase request IDs prevent a lost response from spending two points', async () => {
    const db = legacyDb(); ensureRpgSchema(db);
    const state = getRpgState(db, 'sam');
    Object.assign(state, { xp: 500, level: 4, skillPoints: 3 });
    db.query('INSERT INTO rpg_profiles VALUES (?, ?, ?)').run('sam', JSON.stringify(state), Date.now());
    const body = { profileId: 'sam', skillId: 'ember_power', requestId: 'lost-upgrade' };
    const first = await call(db, '/upgrade', body);
    expect(first.status).toBe(200);
    const firstState = await first.json();
    expect(await (await call(db, '/upgrade', body)).json()).toEqual(firstState);
    expect(getRpgState(db, 'sam')).toMatchObject({ skills: { ember_power: 1 }, skillPoints: 2 });
    expect((await call(db, '/upgrade', { ...body, skillId: 'frost' })).status).toBe(409);
    db.close();
  });

  test('read-only attempt reconciliation distinguishes missing, first incorrect, retry solved, and skip', async () => {
    const db = legacyDb(); ensureRpgSchema(db);
    const status = async (problemId: string) => (await call(db, `/attempt-status?profileId=sam&problemId=${problemId}`)).json();
    expect(await status('missing')).toEqual({ recorded: false, correct: null, solved: false, skipped: false });
    db.query('INSERT INTO attempts (profile_id, problem_id, correct, skipped, created_at) VALUES (?, ?, 0, 0, ?)').run('sam', 'retry', Date.now());
    expect(await status('retry')).toEqual({ recorded: true, correct: false, solved: false, skipped: false });
    solved(db, 'sam', 'retry');
    const before = snapshot(db);
    expect(await status('retry')).toEqual({ recorded: true, correct: false, solved: true, skipped: false });
    expect(snapshot(db)).toBe(before);
    db.close();
  });
});


describe('expanded spellbook compatibility and authority', () => {
  test('fifteen distinct abilities have complete, acyclic unlock trees and matching school equipment', () => {
    expect(RPG_SPELLS).toHaveLength(15);
    expect(RPG_SKILLS.length).toBeGreaterThanOrEqual(27);
    expect(RPG_ITEMS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(RPG_SPELLS.map(spell => spell.effect)).size).toBe(15);
    expect(RPG_SPELLS.filter(spell => rpgSpellUnlocked(spell.id, {})).map(spell => spell.id)).toEqual(['ember', 'cleave']);
    for (const school of ['ember', 'frost', 'storm']) expect(RPG_SPELLS.filter(spell => spell.school === school)).toHaveLength(5);
    for (const spell of RPG_SPELLS) {
      expect(RPG_SPELL_IDS.includes(spell.id)).toBe(true);
      if (spell.skillId) expect(RPG_SKILLS.find(skill => skill.id === spell.skillId)?.kind).toBe('unlock');
      const path = new Set<string>();
      let node = RPG_SKILLS.find(skill => skill.id === spell.skillId);
      while (node) {
        expect(path.has(node.id)).toBe(false); path.add(node.id);
        const parent = RPG_SKILLS.find(skill => skill.id === node!.parentId);
        if (node.parentId) { expect(parent).toBeDefined(); expect(parent!.level).toBeLessThanOrEqual(node.level); }
        node = parent;
      }
      expect(RPG_ITEMS.some(item => item.scope === 'school' && rpgItemApplies(item, spell.id))).toBe(true);
    }
  });

  test('old three-spell saves keep XP, skills, equipped items, and learning rows without a rewrite', async () => {
    const db = legacyDb(); ensureRpgSchema(db);
    for (const selectedSpellId of ['ember', 'frost', 'storm'] as const) {
      const state = getRpgState(db, `old-${selectedSpellId}`);
      Object.assign(state, { xp: 2250, ...rpgLevel(2250), selectedSpellId, skillPoints: 2,
        skills: { ember_power: 1, ember_echo: 1, frost: 1, frost_shards: 1, storm: 1, storm_chain: 1 },
        inventory: ['apprentice', 'cinderwand', 'glacier', 'thunderrod', 'moonstaff', 'phoenix', 'wintercrown', 'tempest'], equippedItemId: 'tempest' });
      const oldJson = JSON.stringify(state);
      db.query('INSERT INTO rpg_profiles VALUES (?, ?, ?)').run(state.profileId, oldJson, Date.now());
      const learning = snapshot(db);
      ensureRpgSchema(db);
      expect(getRpgState(db, state.profileId)).toEqual(rpgNormalizeLoot(state));
      expect(rpgSpellUnlocked(selectedSpellId, state.skills)).toBe(true);
      expect(rpgSpellUnlocked('meteor', state.skills)).toBe(false);
      expect((await call(db, '/spell', { profileId: state.profileId, spellId: 'meteor' })).status).toBe(400);
      expect((db.query('SELECT state_json FROM rpg_profiles WHERE profile_id = ?').get(state.profileId) as any).state_json).toBe(oldJson);
      expect(snapshot(db)).toBe(learning);
    }
    db.close();
  });

  test('new abilities enforce level, parent, skill-point, and item ownership gates', async () => {
    const db = legacyDb(); ensureRpgSchema(db);
    expect((await call(db, '/spell', { profileId: 'sam', spellId: 'cleave' })).status).toBe(200);
    expect((await call(db, '/spell', { profileId: 'sam', spellId: 'meteor' })).status).toBe(400);
    const state = getRpgState(db, 'sam');
    Object.assign(state, { xp: 13455, ...rpgLevel(13455), skillPoints: 23 });
    db.query('UPDATE rpg_profiles SET state_json = ? WHERE profile_id = ?').run(JSON.stringify(state), 'sam');
    expect((await call(db, '/upgrade', { profileId: 'sam', skillId: 'meteor' })).status).toBe(400);
    expect(getRpgState(db, 'sam').skillPoints).toBe(23);
    expect((await call(db, '/upgrade', { profileId: 'sam', skillId: 'ember_power' })).status).toBe(200);
    expect((await call(db, '/upgrade', { profileId: 'sam', skillId: 'meteor' })).status).toBe(200);
    expect(getRpgState(db, 'sam').skillPoints).toBe(21);
    expect((await call(db, '/spell', { profileId: 'sam', spellId: 'meteor' })).status).toBe(200);
    expect((await call(db, '/equip', { profileId: 'sam', itemId: 'starfall' })).status).toBe(400);
    const owned = getRpgState(db, 'sam'); owned.inventory.push('starfall');
    db.query('UPDATE rpg_profiles SET state_json = ? WHERE profile_id = ?').run(JSON.stringify(owned), 'sam');
    expect((await call(db, '/equip', { profileId: 'sam', itemId: 'starfall' })).status).toBe(200);
    startRpgExpedition(db, 'sam'); solved(db, 'sam', 'meteor-test');
    const learning = snapshot(db);
    const result = resolve(db, 'sam', 'meteor-test', { spellId: 'meteor' });
    expect(result.reward).toMatchObject({ spellId: 'meteor', kills: 5, xp: 32 });
    expect(snapshot(db)).toBe(learning);
    db.close();
  });

  test('all fifteen learned abilities can be selected and resolved through the real RPG routes', async () => {
    const db = legacyDb(); ensureRpgSchema(db);
    const state = getRpgState(db, 'all-abilities');
    const xp = 29925; // Level 36, enough for one rank in every node.
    Object.assign(state, { xp, ...rpgLevel(xp), skillPoints: 2, skills: Object.fromEntries(RPG_SKILLS.map(skill => [skill.id, 1])) });
    db.query('INSERT INTO rpg_profiles VALUES (?, ?, ?)').run(state.profileId, JSON.stringify(state), Date.now());
    for (const spell of RPG_SPELLS) {
      startRpgExpedition(db, state.profileId);
      expect((await call(db, '/spell', { profileId: state.profileId, spellId: spell.id })).status).toBe(200);
      solved(db, state.profileId, `ability-${spell.id}`);
      const current = getRpgState(db, state.profileId);
      const learning = snapshot(db);
      const response = await call(db, '/resolve', { profileId: state.profileId, problemId: `ability-${spell.id}`, expeditionId: current.expedition!.id, encounterIndex: current.expedition!.encounterIndex, spellId: spell.id });
      expect(response.status).toBe(200);
      const result = await response.json() as any;
      expect(result.reward.spellId).toBe(spell.id);
      expect(result.state.selectedSpellId).toBe(spell.id);
      expect(snapshot(db)).toBe(learning);
    }
    db.close();
  });

  test('broad school gear and learned specialist modifiers affect their documented abilities', () => {
    const item = (id: string) => RPG_ITEMS.find(entry => entry.id === id)!;
    expect(rpgItemApplies(item('sunforged'), 'meteor')).toBe(true);
    expect(rpgItemApplies(item('sunforged'), 'ice_lance')).toBe(false);
    expect(rpgItemApplies(item('starfall'), 'meteor')).toBe(true);
    expect(rpgItemApplies(item('starfall'), 'ember')).toBe(true);
    expect(rpgItemApplies(item('tempest'), 'storm')).toBe(true);
    expect(rpgItemApplies(item('tempest'), 'tempest')).toBe(true); // Retained ID now boosts its whole school.
    const state = { skills: { ember_power: 1, ember_echo: 1, meteor: 1, meteor_shower: 1 }, equippedItemId: 'starfall', selectedSpellId: 'meteor' as const };
    expect(rpgSpellModifiers(state)).toEqual(['echo']);
    expect(rpgSpellModifiers(state, 'ice_lance')).toEqual([]);
    expect(rpgSpellCombatStats(state).damage).toBe(27); // 8 base + 6 Meteor + 2 Wildfire + 3 shower + 8 gear.
    expect(rpgSpellCombatStats(state, 'cleave').damage).toBe(19); // 7 base + 2 Cleave + 2 school power + 8 school gear.
    expect(rpgSpellSchool('frost_guardian')).toBe('frost');
    expect(rpgSpellSchool('ball_lightning')).toBe('storm');
  });

  test('expanded loot stays collectible after the original eight relics and eventually covers every ability', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    for (let expedition = 0; expedition < 12; expedition++) {
      startRpgExpedition(db, 'collector');
      for (let room = 0; room < 6; room++) {
        const id = `collect-${expedition}-${room}`;
        clearRoom(db, 'collector', id);
      }
    }
    expect(new Set(getRpgState(db, 'collector').inventory)).toEqual(new Set(RPG_ITEMS.map(item => item.id)));
    db.close();
  });
});

test('a relic grants its spell only while equipped, without permanent ranks or duplicate rewards', async () => {
  const db = legacyDb(); ensureRpgSchema(db);
  try {
    const state = getRpgState(db, 'sam');
    Object.assign(state, { xp: 15000, ...rpgLevel(15000), skillPoints: 2 });
    state.inventory.push('tempest');
    state.loot!.push({ id: 'borrowed-tempest', itemId: 'tempest', bonusPower: 0, upgradeLevel: 0, bonusSkillId: 'tempest_overcharge', bonusSkillRanks: 1 });
    db.query('INSERT INTO rpg_profiles VALUES (?, ?, ?)').run('sam', JSON.stringify(state), Date.now());
    const learningBefore = snapshot(db);
    expect((await call(db, '/spell', { profileId: 'sam', spellId: 'tempest' })).status).toBe(400);
    expect((await call(db, '/equip', { profileId: 'sam', lootId: 'borrowed-tempest' })).status).toBe(200);
    expect((await call(db, '/spell', { profileId: 'sam', spellId: 'tempest' })).status).toBe(200);
    const borrowed = getRpgState(db, 'sam');
    expect(borrowed.selectedSpellId).toBe('tempest');
    expect(borrowed.skills).toEqual({}); expect(borrowed.skillPoints).toBe(2);
    const upgrade = await call(db, '/upgrade', { profileId: 'sam', skillId: 'tempest_overcharge' });
    expect(upgrade.status).toBe(400);
    expect(await upgrade.json()).toMatchObject({ error: 'Learn the connected skill first.' });
    expect(snapshot(db)).toBe(learningBefore);
    const started = startRpgExpedition(db, 'sam');
    solved(db, 'sam', 'relic-cast');
    const learning = snapshot(db);
    const cast = { profileId: 'sam', problemId: 'relic-cast', expeditionId: started.expedition!.id, encounterIndex: 0, spellId: 'tempest' as const };
    const first = resolveRpgEncounter(db, cast);
    expect(first.reward.spellId).toBe('tempest');
    expect(first.reward.combat!.hits[0].damage).toBeGreaterThan(0);
    expect((await call(db, '/equip', { profileId: 'sam', lootId: 'legacy:apprentice' })).status).toBe(200);
    expect(getRpgState(db, 'sam').selectedSpellId).toBe('cleave');
    expect((await call(db, '/spell', { profileId: 'sam', spellId: 'tempest' })).status).toBe(400);
    const replay = resolveRpgEncounter(db, cast);
    expect(replay.duplicate).toBe(true); expect(replay.reward).toEqual(first.reward);
    expect(replay.state.xp).toBe(first.state.xp);
    expect(replay.state.selectedSpellId).toBe('cleave');
    expect(replay.state.skills).toEqual({});
    expect(snapshot(db)).toBe(learning);
    const learned = getRpgState(db, 'sam'); learned.skills.tempest = 1;
    db.query('UPDATE rpg_profiles SET state_json=? WHERE profile_id=?').run(JSON.stringify(learned), 'sam');
    await call(db, '/equip', { profileId: 'sam', lootId: 'borrowed-tempest' });
    await call(db, '/spell', { profileId: 'sam', spellId: 'tempest' });
    await call(db, '/equip', { profileId: 'sam', lootId: 'legacy:apprentice' });
    expect(getRpgState(db, 'sam').selectedSpellId).toBe('tempest');
  } finally { db.close(); }
});


test('New outdoor destinations start at tier one with no clears and preserve learning state', () => {
  for (const regionId of ['mosswood', 'tidebreak', 'old-quarry', 'kingsgarden']) {
    const db = legacyDb();
    try {
      ensureRpgSchema(db);
      const before = snapshot(db);
      const started = startRpgExpedition(db, 'sam', regionId, 1);
      expect(started.expeditionsCompleted).toBe(0);
      expect(started.expedition).toMatchObject({ regionId, tier: 1, encountersTotal: 6, encounterIndex: 0 });
      expect(started.expedition!.combat!.enemies[0].maxHp).toBe(12);
      expect(getRpgState(db, 'sam').expedition).toEqual(started.expedition);
      expect(snapshot(db)).toBe(before);
    } finally { db.close(); }
  }
});

describe('treasure chests open with a solved problem', () => {
  const chest = (db: Database, problemId: string, chestId: string) => openRpgChest(db, { profileId: 'sam', problemId, expeditionId: getRpgState(db, 'sam').expedition!.id, chestId });

  test('a solved problem opens one chest once, and retries replay the same reward', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    startRpgExpedition(db, 'sam');
    expect(() => chest(db, 'unsolved', 'c1')).toThrow('Finish this problem');
    solved(db, 'sam', 'p1');
    const learning = snapshot(db);
    const first = chest(db, 'p1', 'c1');
    expect(first.duplicate).toBe(false);
    expect(first.reward.xp).toBe(RPG_CHEST_XP);
    expect(first.reward.forgeDust).toBeGreaterThan(0);
    expect(first.state.xp).toBe(RPG_CHEST_XP);
    // Learning records are only read, never written.
    expect(snapshot(db)).toBe(learning);
    const retry = chest(db, 'p1', 'c1');
    expect(retry.duplicate).toBe(true); expect(retry.reward).toEqual(first.reward);
    expect(getRpgState(db, 'sam').xp).toBe(RPG_CHEST_XP);
    expect(() => chest(db, 'p1', 'c2')).toThrow('another chest');
    solved(db, 'sam', 'p2');
    expect(() => chest(db, 'p2', 'c1')).toThrow('already open');
  });

  test('a problem pays for a spell or a chest, never both, and skipped problems open nothing', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    startRpgExpedition(db, 'sam');
    solved(db, 'sam', 'cast'); resolve(db, 'sam', 'cast');
    expect(() => chest(db, 'cast', 'c1')).toThrow('powered a spell');
    solved(db, 'sam', 'chest'); chest(db, 'chest', 'c1');
    expect(() => resolve(db, 'sam', 'chest')).toThrow();
    db.query('INSERT INTO attempts (id, profile_id, problem_id, correct, skipped, created_at) VALUES (99, ?, ?, 0, 1, ?)').run('sam', 'skipped', Date.now());
    solved(db, 'sam', 'skipped');
    expect(() => chest(db, 'skipped', 'c2')).toThrow('Finish this problem');
  });

  test('chests past the limit open empty until another pack is beaten', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    startRpgExpedition(db, 'sam');
    for (let n = 0; n < RPG_CHESTS_PER_EXPEDITION; n++) { solved(db, 'sam', `p${n}`); expect(chest(db, `p${n}`, `c${n}`).reward.xp).toBe(RPG_CHEST_XP); }
    solved(db, 'sam', 'extra');
    const empty = chest(db, 'extra', 'c-extra').reward;
    expect(empty).toMatchObject({ xp: 0, forgeDust: 0, item: null });
    // Every pack beaten puts treasure in one more chest.
    clearRoom(db, 'sam', 'fight');
    solved(db, 'sam', 'after-fight');
    expect(chest(db, 'after-fight', 'c-after').reward.xp).toBe(RPG_CHEST_XP);
    solved(db, 'sam', 'spent-again');
    expect(chest(db, 'spent-again', 'c-spent').reward.xp).toBe(0);
  });
});

describe('going deeper after the guardian', () => {
  const clearExpedition = (db: Database, prefix: string) => {
    let last;
    for (let i = 0; i < 6; i++) last = clearRoom(db, 'sam', `${prefix}-${i}`);
    return last!;
  };

  test('a cleared expedition descends once into a new depth of the same region, tier and six packs', async () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const first = startRpgExpedition(db, 'sam', 'embercrypt').expedition!;
      // Only a felled guardian opens the way down.
      expect(() => descendRpgExpedition(db, 'sam', first.id)).toThrow('Defeat this guardian');
      const boss = clearExpedition(db, 'd1');
      expect(boss.reward.bossDefeated).toBe(true);
      expect(boss.state.expeditionsCompleted).toBe(1);
      const deeper = descendRpgExpedition(db, 'sam', first.id);
      expect(deeper.expedition).toMatchObject({ regionId: 'embercrypt', tier: 1, depth: 2, previousId: first.id, encounterIndex: 0, encountersTotal: 6, cleared: false });
      expect(deeper.expedition!.id).not.toBe(first.id);
      // A lost response retried returns the same depth, not a third one.
      const retried = await call(db, '/descend', { profileId: 'sam', expeditionId: first.id });
      expect(retried.status).toBe(200);
      expect(((await retried.json()) as any).expedition.id).toBe(deeper.expedition!.id);
      expect(getRpgState(db, 'sam').expedition!.depth).toBe(2);
      // An unknown or stale expedition cannot descend.
      expect((await call(db, '/descend', { profileId: 'sam', expeditionId: 'nope' })).status).toBe(409);
      // The new depth plays all six packs and pays its own guardian once.
      const second = clearExpedition(db, 'd2');
      expect(second.reward.bossDefeated).toBe(true);
      expect(second.reward.xp).toBeGreaterThanOrEqual(rpgDepthXp(true, 2));
      expect(second.state).toMatchObject({ expeditionsCompleted: 2, expedition: { depth: 2, cleared: true } });
      const third = descendRpgExpedition(db, 'sam', second.state.expedition!.id);
      expect(third.expedition).toMatchObject({ depth: 3, previousId: second.state.expedition!.id });
      // The return to camp still works from any depth, and a new start begins at the top.
      expect((await call(db, '/retreat', { profileId: 'sam' })).status).toBe(200);
      expect(getRpgState(db, 'sam').expedition).toBeNull();
      expect(() => descendRpgExpedition(db, 'sam', third.expedition!.id)).toThrow('Defeat this guardian');
      expect(startRpgExpedition(db, 'sam', 'embercrypt').expedition!.depth).toBeUndefined();
    } finally { db.close(); }
  });

  test('the guardian of each depth pays once and old receipts cannot be replayed deeper', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const first = startRpgExpedition(db, 'sam').expedition!;
      const boss = clearExpedition(db, 'r1');
      const bossProblem = db.query(`SELECT problem_id FROM rpg_cast_claims WHERE expedition_id = ? AND encounter_index = 5 AND json_extract(reward_json, '$.bossDefeated') = 1`).get(first.id) as { problem_id: string };
      solved(db, 'sam', 'chest-1');
      // A cleared depth opens no more chests.
      expect(() => openRpgChest(db, { profileId: 'sam', problemId: 'chest-1', expeditionId: first.id, chestId: 'c' })).toThrow('moved on');
      const deeper = descendRpgExpedition(db, 'sam', first.id).expedition!;
      const xp = getRpgState(db, 'sam').xp;
      // The old guardian's receipt replays only for its own depth, and pays nothing new.
      const replay = resolveRpgEncounter(db, { profileId: 'sam', problemId: bossProblem.problem_id, expeditionId: first.id, encounterIndex: 5 });
      expect(replay.duplicate).toBe(true); expect(replay.reward).toEqual(boss.reward);
      expect(() => resolveRpgEncounter(db, { profileId: 'sam', problemId: bossProblem.problem_id, expeditionId: deeper.id, encounterIndex: 0 })).toThrow('already powered');
      // A new problem cannot be spent on the finished depth.
      solved(db, 'sam', 'late');
      expect(() => resolveRpgEncounter(db, { profileId: 'sam', problemId: 'late', expeditionId: first.id, encounterIndex: 5 })).toThrow('moved on');
      expect(getRpgState(db, 'sam').xp).toBe(xp);
      // A chest problem in the deeper level pays once, and never also as a cast.
      solved(db, 'sam', 'chest-2');
      const opened = openRpgChest(db, { profileId: 'sam', problemId: 'chest-2', expeditionId: deeper.id, chestId: 'c' });
      expect(opened.duplicate).toBe(false);
      expect(() => openRpgChest(db, { profileId: 'sam', problemId: 'chest-2', expeditionId: first.id, chestId: 'c' })).toThrow('another chest');
      expect(() => resolveRpgEncounter(db, { profileId: 'sam', problemId: 'chest-2', expeditionId: deeper.id, encounterIndex: 0 })).toThrow('opened a chest');
      // A problem solved before the descent cannot power the new depth.
      db.query('INSERT INTO daily_solves VALUES (?, ?, ?)').run('sam', 'before', deeper.startedAt - 1000);
      expect(() => resolveRpgEncounter(db, { profileId: 'sam', problemId: 'before', expeditionId: deeper.id, encounterIndex: 0 })).toThrow('Finish this problem');
      // Exactly one guardian clear was counted for the first depth.
      expect(db.query(`SELECT COUNT(*) AS n FROM rpg_cast_claims WHERE expedition_id = ? AND json_extract(reward_json, '$.bossDefeated') = 1`).get(first.id)).toEqual({ n: 1 });
      expect(getRpgState(db, 'sam').expeditionsCompleted).toBe(1);
    } finally { db.close(); }
  });

  test('deeper packs are a little tougher and pay a little more, within a cap', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      expect(rpgDepthHealth(10, 1)).toBe(10);
      expect(rpgDepthHealth(10, 2)).toBe(11);
      expect(rpgDepthHealth(10, 50)).toBe(10 + RPG_MAX_DEPTH_STEPS);
      expect(rpgDepthXp(false, 1)).toBe(32); expect(rpgDepthXp(true, 1)).toBe(90);
      expect(rpgDepthXp(false, 99)).toBe(rpgDepthXp(false, 1 + RPG_MAX_DEPTH_STEPS));
      const first = startRpgExpedition(db, 'sam').expedition!;
      clearExpedition(db, 'h1');
      const deeper = descendRpgExpedition(db, 'sam', first.id);
      // Same room, same hero level: only the depth differs.
      const shallow = rpgEncounterCombat({ level: deeper.level, expedition: { ...deeper.expedition!, depth: 1, combat: undefined } }).enemies.map(enemy => enemy.maxHp);
      const deep = deeper.expedition!.combat!.enemies.map(enemy => enemy.maxHp);
      expect(deep).toHaveLength(shallow.length);
      deep.forEach((hp, i) => { expect(hp).toBeGreaterThanOrEqual(shallow[i]!); expect(hp).toBeLessThanOrEqual(Math.ceil(shallow[i]! * 1.1)); });
      expect(deep.some((hp, i) => hp > shallow[i]!)).toBe(true);
      const room = clearRoom(db, 'sam', 'h2-0');
      expect(room.reward.xp).toBeGreaterThanOrEqual(rpgDepthXp(false, 2));
      expect(room.reward.forgeDust).toBe(rpgRoomForgeDust(1) + 1);
    } finally { db.close(); }
  });
});

describe('endless packs and the sleeping guardian', () => {
  test('packs never run out, and the guardian wakes only after four of them', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const expedition = startRpgExpedition(db, 'sam', 'embercrypt').expedition!;
      for (let pack = 0; pack < 3; pack++) clearRoom(db, 'sam', `early-${pack}`, false);
      expect(() => wakeRpgGuardian(db, 'sam', expedition.id)).toThrow('still sleeps');
      // Past the fifth pack the rooms cycle on; the guardian does not come by itself.
      for (let pack = 3; pack < 9; pack++) {
        const result = clearRoom(db, 'sam', `late-${pack}`, false);
        expect(result.reward.bossDefeated).toBe(false);
        expect(result.state.expedition!.encounterIndex).toBeGreaterThanOrEqual(1);
        expect(result.state.expedition!.encounterIndex).toBeLessThanOrEqual(4);
        expect(result.state.expedition!.packsCleared).toBe(pack + 1);
      }
      expect(getRpgState(db, 'sam').expedition!.cleared).toBe(false);
      const woken = wakeRpgGuardian(db, 'sam', expedition.id);
      expect(woken.expedition!.encounterIndex).toBe(5);
      expect(woken.expedition!.combat!.encounterIndex).toBe(5);
      // A retry keeps the woken guardian and its health.
      expect(wakeRpgGuardian(db, 'sam', expedition.id).expedition!.combat).toEqual(woken.expedition!.combat);
      const boss = clearRoom(db, 'sam', 'boss');
      expect(boss.reward.bossDefeated).toBe(true);
      expect(boss.state.expedition!.cleared).toBe(true);
      expect(() => wakeRpgGuardian(db, 'sam', expedition.id)).toThrow('moved on');
    } finally { db.close(); }
  });

  test('an expedition saved before endless packs counts its rooms as packs', () => {
    const db = legacyDb(); ensureRpgSchema(db);
    try {
      const expedition = startRpgExpedition(db, 'sam', 'embercrypt').expedition!;
      const state = getRpgState(db, 'sam');
      state.expedition!.encounterIndex = 4; delete state.expedition!.packsCleared; delete state.expedition!.combat;
      saveRpgState(db, state);
      expect(wakeRpgGuardian(db, 'sam', expedition.id).expedition!.encounterIndex).toBe(5);
    } finally { db.close(); }
  });
});
