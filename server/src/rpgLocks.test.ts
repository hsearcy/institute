import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { rpgShrineBoon, rpgEncounterCombat, rpgApplyCombat, RPG_FURY_DAMAGE, RPG_BOON_SECONDS, RPG_BOON_PROBLEM_SLACK_MS } from '@institute/shared';
import { ensureRpgSchema, getRpgState, saveRpgState, startRpgExpedition, resolveRpgEncounter, openRpgChest } from './rpg';
import { activateRpgShrine, openRpgDoor } from './rpgLocks';

function fresh(): Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE attempts (id INTEGER PRIMARY KEY, profile_id TEXT, problem_id TEXT, correct INTEGER, skipped INTEGER DEFAULT 0, created_at INTEGER);
    CREATE TABLE daily_solves (profile_id TEXT, problem_id TEXT, solved_at INTEGER, PRIMARY KEY (profile_id,problem_id));
  `);
  ensureRpgSchema(db);
  startRpgExpedition(db, 'sam');
  return db;
}
const solved = (db: Database, problemId: string) => db.query('INSERT INTO daily_solves VALUES (?, ?, ?)').run('sam', problemId, Date.now());
const expeditionId = (db: Database) => getRpgState(db, 'sam').expedition!.id;
const shrine = (db: Database, problemId: string, targetId: string) => activateRpgShrine(db, { profileId: 'sam', problemId, expeditionId: expeditionId(db), targetId });
const door = (db: Database, problemId: string, targetId: string) => openRpgDoor(db, { profileId: 'sam', problemId, expeditionId: expeditionId(db), targetId });
const cast = (db: Database, problemId: string, extra = {}) => {
  const expedition = getRpgState(db, 'sam').expedition!;
  return resolveRpgEncounter(db, { profileId: 'sam', problemId, expeditionId: expedition.id, encounterIndex: expedition.encounterIndex, ...extra });
};
/** A shrine id whose boon is the one wanted. */
const shrineFor = (boon: string) => { for (let n = 0; ; n++) if (rpgShrineBoon(`shrine-${n}`) === boon) return `shrine-${n}`; };

describe('shrines grant a boon for one solved problem', () => {
  test('a solved problem wakes one shrine once; retries replay it', () => {
    const db = fresh();
    expect(() => shrine(db, 'unsolved', 's1')).toThrow('wake the shrine');
    solved(db, 'p1');
    const first = shrine(db, 'p1', 's1');
    expect(first.duplicate).toBe(false);
    expect(first.boon.id).toBe(rpgShrineBoon('s1'));
    expect(getRpgState(db, 'sam').expedition!.boon).toEqual(first.boon);
    expect(shrine(db, 'p1', 's1')).toMatchObject({ duplicate: true, boon: first.boon });
    expect(() => shrine(db, 'p1', 's2')).toThrow('something else');
    solved(db, 'p2');
    expect(() => shrine(db, 'p2', 's1')).toThrow('already given');
  });

  test('a problem pays once: spell, chest, shrine or door, never two', () => {
    const db = fresh();
    solved(db, 'cast'); cast(db, 'cast');
    expect(() => shrine(db, 'cast', 's1')).toThrow('powered a spell');
    expect(() => door(db, 'cast', 'd1')).toThrow('powered a spell');
    solved(db, 'chest'); openRpgChest(db, { profileId: 'sam', problemId: 'chest', expeditionId: expeditionId(db), chestId: 'c1' });
    expect(() => shrine(db, 'chest', 's1')).toThrow('opened a chest');
    solved(db, 'shrine'); shrine(db, 'shrine', 's1');
    expect(() => cast(db, 'shrine')).toThrow('shrine or a door');
    expect(() => openRpgChest(db, { profileId: 'sam', problemId: 'shrine', expeditionId: expeditionId(db), chestId: 'c2' })).toThrow('shrine or a door');
    expect(() => door(db, 'shrine', 'd1')).toThrow('something else');
    solved(db, 'door'); door(db, 'door', 'd1');
    expect(() => cast(db, 'door')).toThrow('shrine or a door');
  });

  test('skipped problems and solves from before the expedition open nothing', () => {
    const db = fresh();
    db.query('INSERT INTO attempts (profile_id, problem_id, correct, skipped, created_at) VALUES (?, ?, 0, 1, ?)').run('sam', 'skipped', Date.now());
    solved(db, 'skipped');
    expect(() => shrine(db, 'skipped', 's1')).toThrow('wake the shrine');
    expect(() => door(db, 'skipped', 'd1')).toThrow('open the door');
    db.query('INSERT INTO daily_solves VALUES (?, ?, ?)').run('sam', 'old', 1);
    expect(() => door(db, 'old', 'd1')).toThrow('open the door');
  });

  test('fury strikes harder on the server, only while the client clock still runs', () => {
    const db = fresh();
    const state = getRpgState(db, 'sam');
    const plain = rpgApplyCombat(state, rpgEncounterCombat(state), state.selectedSpellId).result.damage;
    const boosted = rpgApplyCombat(state, rpgEncounterCombat(state), state.selectedSpellId, 100, RPG_FURY_DAMAGE).result.damage;
    expect(boosted).toBeGreaterThan(plain);
    solved(db, 'wake'); shrine(db, 'wake', shrineFor('fury'));
    solved(db, 'without'); expect(cast(db, 'without', { boonActive: false }).reward).toMatchObject({ combat: { damage: plain } });
    solved(db, 'with');
    const reward = cast(db, 'with', { boonActive: true }).reward;
    expect(reward.boon).toBe('fury');
    expect(reward.combat!.damage).toBe(boosted);
  });

  test('an expired boon does nothing, however the client asks', () => {
    const db = fresh();
    solved(db, 'wake'); shrine(db, 'wake', shrineFor('fury'));
    const state = getRpgState(db, 'sam');
    state.expedition!.boon!.grantedAt = Date.now() - (RPG_BOON_SECONDS * 1000 + RPG_BOON_PROBLEM_SLACK_MS + 60_000);
    saveRpgState(db, state);
    solved(db, 'late');
    const reward = cast(db, 'late', { boonActive: true, answerMs: 0 }).reward;
    expect(reward.boon).toBeUndefined();
    expect(getRpgState(db, 'sam').expedition!.boon).toBeUndefined();
  });

  test('bounty doubles the dust of the fight it ends, then it is spent', () => {
    const db = fresh();
    solved(db, 'wake'); shrine(db, 'wake', shrineFor('bounty'));
    let reward;
    for (let n = 0; n < 20; n++) {
      solved(db, `c${n}`); reward = cast(db, `c${n}`, { boonActive: true }).reward;
      if (reward.combat!.encounterCleared) break;
      expect(reward.forgeDust).toBe(0);
    }
    expect(reward!.combat!.encounterCleared).toBe(true);
    expect(reward!.bountyDust).toBeGreaterThan(0);
    expect(reward!.forgeDust).toBe(reward!.bountyDust! * 2);
    expect(getRpgState(db, 'sam').expedition!.boon).toBeUndefined();
  });

  test('a problem solved while a boon runs holds its clock still', () => {
    const db = fresh();
    solved(db, 'wake'); shrine(db, 'wake', shrineFor('swiftness'));
    solved(db, 'fight'); cast(db, 'fight', { boonActive: true, answerMs: 9000 });
    expect(getRpgState(db, 'sam').expedition!.boon!.pausedMs).toBe(9000 + RPG_BOON_PROBLEM_SLACK_MS);
  });
});

describe('sealed doors open with a solved problem', () => {
  test('one problem opens one door once; retries replay it', () => {
    const db = fresh();
    expect(() => door(db, 'unsolved', 'd1')).toThrow('open the door');
    solved(db, 'p1');
    expect(door(db, 'p1', 'd1')).toMatchObject({ duplicate: false, doorId: 'd1' });
    expect(door(db, 'p1', 'd1')).toMatchObject({ duplicate: true, doorId: 'd1' });
    expect(() => door(db, 'p1', 'd2')).toThrow('something else');
    solved(db, 'p2');
    expect(() => door(db, 'p2', 'd1')).toThrow('already open');
    // A door and a shrine may share an id without blocking each other.
    expect(shrine(db, 'p2', 'd1').duplicate).toBe(false);
  });

  test('a door gives no reward of its own', () => {
    const db = fresh();
    const before = getRpgState(db, 'sam');
    solved(db, 'p1'); const after = door(db, 'p1', 'd1').state;
    expect([after.xp, after.forgeDust ?? 0, after.inventory]).toEqual([before.xp, before.forgeDust ?? 0, before.inventory]);
  });

  test('another expedition rejects the request', () => {
    const db = fresh();
    solved(db, 'p1');
    expect(() => openRpgDoor(db, { profileId: 'sam', problemId: 'p1', expeditionId: 'elsewhere', targetId: 'd1' })).toThrow('moved on');
  });
});
