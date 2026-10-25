import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import {
  RPG_BREAKABLE_DUST_PER_EXPEDITION, RPG_BREAKABLE_DUST_PER_DAY, RPG_BREAKABLES_PER_EXPEDITION, RPG_ELITE_HP_MULTIPLIER,
  rpgEliteRoom, rpgEncounterCombat, type RpgState,
} from '@institute/shared';
import { ensureRpgSchema, getRpgState, saveRpgState, startRpgExpedition, resolveRpgEncounter, breakRpgObject, createRpgRoutes } from './rpg';

function db(): Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE attempts (id INTEGER PRIMARY KEY, profile_id TEXT, problem_id TEXT, correct INTEGER, skipped INTEGER DEFAULT 0, created_at INTEGER);
    CREATE TABLE daily_solves (profile_id TEXT, problem_id TEXT, solved_at INTEGER, PRIMARY KEY (profile_id,problem_id));
  `);
  ensureRpgSchema(db);
  return db;
}
const always = () => 0, never = () => .99;
const breakOne = (d: Database, breakableId: string, random = always, now = Date.now()) =>
  breakRpgObject(d, { profileId: 'sam', expeditionId: getRpgState(d, 'sam').expedition!.id, breakableId }, random, now);
const leave = (d: Database) => { const state = getRpgState(d, 'sam'); state.expedition = null; saveRpgState(d, state); };

describe('breakable barrels, urns and crates', () => {
  test('a breakable pays at most one dust, once; a retry repeats its first answer', () => {
    const d = db(); startRpgExpedition(d, 'sam');
    const first = breakOne(d, 'barrel-1');
    expect(first).toMatchObject({ duplicate: false, reward: { breakableId: 'barrel-1', forgeDust: 1 } });
    expect(getRpgState(d, 'sam').forgeDust).toBe(1);
    const retry = breakOne(d, 'barrel-1');
    expect(retry).toMatchObject({ duplicate: true, reward: { forgeDust: 1 } });
    expect(getRpgState(d, 'sam').forgeDust).toBe(1);
    expect(breakOne(d, 'urn-2', never).reward.forgeDust).toBe(0);
    // An empty breakable stays empty on a retry.
    expect(breakOne(d, 'urn-2', always)).toMatchObject({ duplicate: true, reward: { forgeDust: 0 } });
  });

  test('dust from breakables stops at the expedition cap', () => {
    const d = db(); startRpgExpedition(d, 'sam');
    let dust = 0;
    for (let n = 0; n < 20; n++) dust += breakOne(d, `crate-${n}`).reward.forgeDust;
    expect(dust).toBe(RPG_BREAKABLE_DUST_PER_EXPEDITION);
    expect(getRpgState(d, 'sam').forgeDust).toBe(RPG_BREAKABLE_DUST_PER_EXPEDITION);
  });

  test('dust from breakables stops at the daily cap across expeditions', () => {
    const d = db(); let dust = 0;
    for (let trip = 0; trip < 6; trip++) {
      startRpgExpedition(d, 'sam');
      for (let n = 0; n < 10; n++) dust += breakOne(d, `t${trip}-b${n}`).reward.forgeDust;
      leave(d);
    }
    expect(dust).toBe(RPG_BREAKABLE_DUST_PER_DAY);
    // A day later the daily cap is free again.
    startRpgExpedition(d, 'sam');
    expect(breakOne(d, 'tomorrow', always, Date.now() + 25 * 3600 * 1000).reward.forgeDust).toBe(1);
  });

  test('past the receipt limit a break stores and pays nothing', () => {
    const d = db(); startRpgExpedition(d, 'sam');
    for (let n = 0; n < RPG_BREAKABLES_PER_EXPEDITION; n++) breakOne(d, `b${n}`, never);
    expect(breakOne(d, 'one-more').reward.forgeDust).toBe(0);
    const count = d.query('SELECT COUNT(*) AS n FROM rpg_break_claims').get() as { n: number };
    expect(count.n).toBe(RPG_BREAKABLES_PER_EXPEDITION);
  });

  test('a break needs the current expedition and a plain id', async () => {
    const d = db();
    expect(() => breakRpgObject(d, { profileId: 'sam', expeditionId: 'none', breakableId: 'b1' })).toThrow('moved on');
    startRpgExpedition(d, 'sam');
    expect(() => breakRpgObject(d, { profileId: 'sam', expeditionId: 'old', breakableId: 'b1' })).toThrow('moved on');
    const app = createRpgRoutes(d);
    const post = (body: unknown) => app.request('/break', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const expeditionId = getRpgState(d, 'sam').expedition!.id;
    expect((await post({ profileId: 'sam', expeditionId, breakableId: 'bad id; drop' })).status).toBe(400);
    expect((await post({ profileId: 'sam', expeditionId, breakableId: '123-4-5' })).status).toBe(200);
  });
});

/** Starts expeditions until room `room` holds an elite (or, with `elite` false, does not). */
function expeditionAt(d: Database, room: number, elite: boolean): RpgState {
  for (let n = 0; n < 60; n++) {
    const state = startRpgExpedition(d, 'sam');
    if (rpgEliteRoom(state.expedition!.id, room) === elite) {
      state.totalKills = 5;
      state.expedition!.encounterIndex = room; state.expedition!.combat = undefined;
      state.expedition!.combat = rpgEncounterCombat(state); saveRpgState(d, state);
      return getRpgState(d, 'sam');
    }
    leave(d);
  }
  throw new Error('no matching room found');
}

/** Casts until the room is cleared; returns the clearing reward. */
function clear(d: Database, prefix: string) {
  for (let cast = 0; cast < 40; cast++) {
    const problem = `${prefix}-${cast}`;
    d.query('INSERT INTO daily_solves VALUES (?, ?, ?)').run('sam', problem, Date.now());
    const expedition = getRpgState(d, 'sam').expedition!;
    const result = resolveRpgEncounter(d, { profileId: 'sam', problemId: problem, expeditionId: expedition.id, encounterIndex: expedition.encounterIndex });
    if (result.reward.combat!.encounterCleared) return result.reward;
    expect(result.reward.elite).toBeUndefined();
  }
  throw new Error('room was not cleared');
}

describe('elite packs', () => {
  test('elites appear only in rooms 1 to 4, in about half of them, the same way every time', () => {
    let elites = 0;
    for (let n = 0; n < 400; n++) {
      expect(rpgEliteRoom(`trip-${n}`, 0)).toBe(false);
      expect(rpgEliteRoom(`trip-${n}`, 5)).toBe(false);
      expect(rpgEliteRoom(`trip-${n}`, 3)).toBe(rpgEliteRoom(`trip-${n}`, 3));
      if (rpgEliteRoom(`trip-${n}`, 1)) elites++;
    }
    expect(elites).toBeGreaterThan(150); expect(elites).toBeLessThan(250);
    expect(rpgEliteRoom(undefined, 2)).toBe(false);
  });

  test('the server gives one elite in an elite room, last in the pack, with more health', () => {
    const d = db(); const state = expeditionAt(d, 3, true);
    const enemies = state.expedition!.combat!.enemies, elites = enemies.filter(enemy => enemy.elite);
    expect(elites).toHaveLength(1);
    expect(elites[0]!.id).toBe(enemies[enemies.length - 1]!.id);
    const plain = rpgEncounterCombat({ expedition: { ...state.expedition!, id: 'plain-1', combat: undefined }, level: state.level }).enemies;
    expect(rpgEliteRoom('plain-1', 3)).toBe(false);
    expect(elites[0]!.maxHp).toBe(Math.ceil(plain[plain.length - 1]!.maxHp * RPG_ELITE_HP_MULTIPLIER));
    // The boss room never has an elite.
    expect(rpgEncounterCombat(state, 5).enemies.some(enemy => enemy.elite)).toBe(false);
  });

  test('clearing an elite pack always drops a relic, marked as an elite reward', () => {
    const d = db(); expeditionAt(d, 3, true);
    const reward = clear(d, 'elite');
    expect(reward.elite).toBe(true);
    expect(reward.item).not.toBeNull();
    expect(reward.loot).toBeDefined();
  });

  test('an ordinary room 3 drops no relic', () => {
    const d = db(); expeditionAt(d, 3, false);
    const reward = clear(d, 'plain');
    expect(reward.item).toBeNull(); expect(reward.elite).toBeUndefined();
  });
});
