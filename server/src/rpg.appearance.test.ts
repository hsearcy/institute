import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RPG_APPEARANCES, rpgLevel, rpgNormalizeLoot } from '@institute/shared';
import { createRpgRoutes, ensureRpgSchema, getRpgState, startRpgExpedition } from './rpg';

function database() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE topic_mastery (profile_id TEXT, topic_id TEXT, state TEXT, correct INTEGER, attempts INTEGER, review_due_at INTEGER);
    CREATE TABLE topic_demos (profile_id TEXT, topic_id TEXT, seen_at INTEGER);
    CREATE TABLE attempts (id INTEGER PRIMARY KEY, profile_id TEXT, problem_id TEXT, correct INTEGER, skipped INTEGER, created_at INTEGER);
    CREATE TABLE daily_solves (profile_id TEXT, problem_id TEXT, solved_at INTEGER);
    CREATE TABLE profile_state (profile_id TEXT PRIMARY KEY, gems INTEGER, equipped_pickaxe TEXT);
    INSERT INTO topic_mastery VALUES ('sam','multiplication','mastered',19,20,1900000000000);
    INSERT INTO topic_demos VALUES ('sam','multiplication',1600000000000);
    INSERT INTO attempts VALUES (1,'sam','old-answer',1,0,1600000000000);
    INSERT INTO daily_solves VALUES ('sam','old-answer',1600000000000);
    INSERT INTO profile_state VALUES ('sam',482,'diamond');
  `);
  ensureRpgSchema(db);
  return db;
}
const learning = (db: Database) => JSON.stringify(['topic_mastery', 'topic_demos', 'attempts', 'daily_solves', 'profile_state'].map(table => db.query(`SELECT * FROM ${table}`).all()));
const xpAtLevel = (level: number) => Array.from({ length: level - 1 }, (_, index) => 90 + index * 45).reduce((sum, xp) => sum + xp, 0);
function seed(db: Database, profileId: string, xp: number, appearanceId?: unknown, storedLevel?: number) {
  const { appearanceId: ignored, ...legacy } = getRpgState(db, profileId);
  const state = { ...legacy, xp, ...rpgLevel(xp), skillPoints: 3, skills: { frost: 1 }, inventory: ['apprentice', 'glacier'], equippedItemId: 'glacier', selectedSpellId: 'frost' as const, totalKills: 1800, expeditionsCompleted: 12,
    ...(appearanceId === undefined ? {} : { appearanceId }), ...(storedLevel === undefined ? {} : { level: storedLevel }) };
  const json = JSON.stringify(state);
  db.query('INSERT OR REPLACE INTO rpg_profiles VALUES (?,?,?)').run(profileId, json, 123);
  return { state, json };
}
const row = (db: Database, profileId = 'sam') => db.query('SELECT * FROM rpg_profiles WHERE profile_id=?').get(profileId);
const select = (db: Database, body: unknown) => createRpgRoutes(db).request('/appearance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('Legacy saves default appearance in memory without rewriting progress or schema', async () => {
  const db = database();
  try {
    startRpgExpedition(db, 'sam');
    const { state, json } = seed(db, 'sam', xpAtLevel(18));
    const beforeLearning = learning(db), beforeSchema = db.query('SELECT sql FROM sqlite_master ORDER BY name').all();
    const expected = rpgNormalizeLoot({ ...state, appearanceId: 'wayfarer' });
    expect(getRpgState(db, 'sam')).toEqual(expected);
    const response = await createRpgRoutes(db).request('/state?profileId=sam');
    expect(await response.json()).toEqual(expected);
    expect(row(db)).toEqual({ profile_id: 'sam', state_json: json, updated_at: 123 });
    expect(getRpgState(db, 'new-child').appearanceId).toBe('wayfarer');
    expect(row(db, 'new-child')).toBeNull();
    expect(learning(db)).toBe(beforeLearning);
    expect(db.query('SELECT sql FROM sqlite_master ORDER BY name').all()).toEqual(beforeSchema);
  } finally { db.close(); }
});

test('Every cosmetic milestone uses earned XP and rejects early or forged-level selection', async () => {
  const db = database();
  try {
    const beforeLearning = learning(db);
    for (const appearance of RPG_APPEARANCES.filter(entry => entry.id !== 'wayfarer')) {
      const threshold = xpAtLevel(appearance.requiredLevel);
      seed(db, 'sam', threshold - 1, undefined, 99);
      const before = row(db);
      const rejected = await select(db, { profileId: 'sam', appearanceId: appearance.id, level: 99, xp: threshold });
      expect(rejected.status).toBe(400);
      expect((await rejected.json() as { error: string }).error).toContain(`level ${appearance.requiredLevel}`);
      expect(row(db)).toEqual(before);
      seed(db, 'sam', threshold);
      const state = getRpgState(db, 'sam');
      const accepted = await select(db, { profileId: 'sam', appearanceId: appearance.id });
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toEqual({ ...state, appearanceId: appearance.id });
      expect(getRpgState(db, 'sam')).toEqual({ ...state, appearanceId: appearance.id });
    }
    expect(learning(db)).toBe(beforeLearning);
  } finally { db.close(); }
});

test('Malformed and locked stored appearances normalize safely without writes', async () => {
  const db = database();
  try {
    for (const appearance of ['unknown', '../../hero', null, 42, {}, 'tempest']) {
      const { json } = seed(db, 'sam', 0, appearance);
      expect(getRpgState(db, 'sam').appearanceId).toBe('wayfarer');
      expect(row(db)).toEqual({ profile_id: 'sam', state_json: json, updated_at: 123 });
    }
    for (const appearanceId of ['unknown', '', null, 42, {}]) {
      const before = row(db);
      expect((await select(db, { profileId: 'sam', appearanceId })).status).toBe(400);
      expect(row(db)).toEqual(before);
    }
    expect((await select(db, { profileId: 'sam' })).status).toBe(400);
    expect((await select(db, { profileId: '', appearanceId: 'wayfarer' })).status).toBe(400);
  } finally { db.close(); }
});

test('Appearance selection is free, idempotent, and isolated between profiles', async () => {
  const db = database();
  try {
    seed(db, 'sam', xpAtLevel(18)); seed(db, 'sibling', 0);
    const sibling = row(db, 'sibling'), before = getRpgState(db, 'sam'), beforeLearning = learning(db);
    expect((await select(db, { profileId: 'sam', appearanceId: 'cinder' })).status).toBe(200);
    expect(getRpgState(db, 'sam')).toEqual({ ...before, appearanceId: 'cinder' });
    db.query('UPDATE rpg_profiles SET updated_at=123 WHERE profile_id=?').run('sam');
    const saved = row(db);
    expect((await select(db, { profileId: 'sam', appearanceId: 'cinder' })).status).toBe(200);
    expect(row(db)).toEqual(saved);
    expect((await select(db, { profileId: 'sibling', appearanceId: 'cinder' })).status).toBe(400);
    expect(row(db, 'sibling')).toEqual(sibling);
    expect((await select(db, { profileId: 'sam', appearanceId: 'wayfarer' })).status).toBe(200);
    expect(getRpgState(db, 'sam')).toEqual(before);
    expect(learning(db)).toBe(beforeLearning);
  } finally { db.close(); }
});

test('Selected appearance and legacy learning data survive database reopen without a migration', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'institute-appearance-')), path = join(directory, 'legacy.db');
  let db: Database | undefined;
  try {
    const original = database();
    seed(original, 'sam', xpAtLevel(18));
    const beforeLearning = learning(original);
    original.query('VACUUM INTO ?').run(path); original.close();
    db = new Database(path);
    expect((await select(db, { profileId: 'sam', appearanceId: 'tempest' })).status).toBe(200);
    const saved = getRpgState(db, 'sam'); db.close(); db = new Database(path);
    ensureRpgSchema(db);
    expect(getRpgState(db, 'sam')).toEqual(saved);
    expect(saved.appearanceId).toBe('tempest');
    expect(learning(db)).toBe(beforeLearning);
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});
