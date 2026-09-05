import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
function call(db: Database, path: string, body?: unknown) {
  return createRpgRoutes(db).request(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe('additive RPG progression on legacy learning data', () => {
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
    expect(result.reward).toMatchObject({ kills: 12, xp: 32, newItems: [{ id: 'cinderwand' }] });
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
    expect(() => resolve(db, 'sam', 'right')).toThrow('already powered');
    expect(db.query('SELECT COUNT(*) AS n FROM rpg_claims').get()).toEqual({ n: 1 });
    db.close();
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
      solved(db, 'sam', `p${i}`);
      last = resolve(db, 'sam', `p${i}`);
      if (i === 2) {
        expect(last.state).toMatchObject({ level: 2, skillPoints: 1 });
        const upgrade = await call(db, '/upgrade', { profileId: 'sam', skillId: 'frost' });
        expect(upgrade.status).toBe(200);
        expect((await upgrade.json() as any).skills.frost).toBe(1);
        expect((await call(db, '/respec', { profileId: 'sam' })).status).toBe(400);
      }
    }
    expect(last!.reward.bossDefeated).toBe(true);
    expect(last!.state).toMatchObject({ expeditionsCompleted: 1, level: 3, expedition: { cleared: true } });
    expect((await call(db, '/respec', { profileId: 'sam' })).status).toBe(200);
    expect(getRpgState(db, 'sam')).toMatchObject({ skills: {}, skillPoints: 2, selectedSpellId: 'ember' });
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
    startRpgExpedition(db, 'sam'); solved(db, 'sam', 'reward'); resolve(db, 'sam', 'reward');
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
