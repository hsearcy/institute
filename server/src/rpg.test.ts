import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RPG_SPELLS, RPG_SPELL_IDS, RPG_SKILLS, RPG_ITEMS, rpgLevel, rpgSpellUnlocked, rpgSpellSchool, rpgItemApplies, rpgSpellModifiers, rpgEncounterKills, rpgEncounterCombat, rpgSpellCombatStats, rpgNextRelicHunt, rpgNormalizeLoot } from '@institute/shared';
import { ensureRpgSchema, getRpgState, startRpgExpedition, resolveRpgEncounter, createRpgRoutes } from './rpg';

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
function clearRoom(db: Database, profileId: string, prefix: string) {
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
        for (let room = 0; room <= preview.encounterIndex; room++) {
          const result = clearRoom(db, profileId, `${profileId}-${room}`);
          expect(result.reward.xp).toBe(32);
          expect(result.reward.item?.id ?? null).toBe(room === 2 ? targetItem : null);

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
    expect(() => resolve(db, 'sam', 'real', { spellId: 'storm' })).toThrow('Unlock this spell');
    expect(() => resolve(db, 'sam', 'real', { encounterIndex: 5 })).toThrow('moved on');
    expect(getRpgState(db, 'sam').xp).toBe(0);
    db.close();
  });

  test('assisted skips progress the adventure with identical rewards and no learning rewrite', () => {
    const db = legacyDb(); ensureRpgSchema(db); startRpgExpedition(db, 'sam');
    db.query('INSERT INTO attempts (profile_id,problem_id,correct,skipped,created_at) VALUES (?, ?, 0, 1, ?)').run('sam', 'help', Date.now());
    expect(() => resolve(db, 'sam', 'help')).toThrow('Finish this problem');
    const before = snapshot(db);
    const result = resolve(db, 'sam', 'help', { assisted: true });
    expect(result.reward.xp).toBe(32);
    expect(snapshot(db)).toBe(before);
    db.close();
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
  test('fifteen distinct abilities have complete, acyclic unlock trees and specialist equipment', () => {
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
      expect(RPG_ITEMS.some(item => item.scope === 'spell' && item.spellId === spell.id)).toBe(true);
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

  test('school gear and specialist modifiers affect only their documented abilities', () => {
    const item = (id: string) => RPG_ITEMS.find(entry => entry.id === id)!;
    expect(rpgItemApplies(item('sunforged'), 'meteor')).toBe(true);
    expect(rpgItemApplies(item('sunforged'), 'ice_lance')).toBe(false);
    expect(rpgItemApplies(item('starfall'), 'meteor')).toBe(true);
    expect(rpgItemApplies(item('starfall'), 'ember')).toBe(false);
    expect(rpgItemApplies(item('tempest'), 'storm')).toBe(true);
    expect(rpgItemApplies(item('tempest'), 'tempest')).toBe(false); // old item ID is retained; its target is Chain Lightning.
    const state = { skills: { ember_power: 1, ember_echo: 1, meteor: 1, meteor_shower: 1 }, equippedItemId: 'starfall', selectedSpellId: 'meteor' as const };
    expect(rpgSpellModifiers(state)).toEqual(['echo']);
    expect(rpgSpellModifiers(state, 'ice_lance')).toEqual([]);
    expect(rpgSpellCombatStats(state).damage).toBe(27); // 8 base + 6 Meteor + 2 Wildfire + 3 shower + 8 gear.
    expect(rpgSpellCombatStats(state, 'cleave').damage).toBe(11); // 7 base + 2 Cleave + 2 school power.
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
