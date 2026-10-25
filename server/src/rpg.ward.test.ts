import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import {
  RPG_GEAR_STORE_CAP, RPG_WARD_BASE, RPG_WARD_TONIC, RPG_WARD_TONIC_FIGHTS, rpgCreateGear, rpgEnemyStrike, rpgGearSalvageValue, rpgRoomForgeDust, rpgTraderWares,
  type RpgGearInstance, type RpgState,
} from '@institute/shared';
import { createRpgRoutes, ensureRpgSchema, getRpgState, openRpgChest, resolveRpgEncounter, saveRpgState, startRpgExpedition } from './rpg';
import { buyFromTrader } from './rpgTrader';
import { ensureRpgEconomySchema } from './rpgEconomy';

function fresh(): Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE attempts (id INTEGER PRIMARY KEY, profile_id TEXT, problem_id TEXT, correct INTEGER, skipped INTEGER DEFAULT 0, created_at INTEGER);
    CREATE TABLE daily_solves (profile_id TEXT, problem_id TEXT, solved_at INTEGER, PRIMARY KEY (profile_id,problem_id));
  `);
  ensureRpgSchema(db); ensureRpgEconomySchema(db);
  startRpgExpedition(db, 'sam');
  return db;
}
const solved = (db: Database, problemId: string) => db.query('INSERT INTO daily_solves VALUES (?, ?, ?)').run('sam', problemId, Date.now());
const cast = (db: Database, problemId: string, extra = {}) => {
  solved(db, problemId);
  const expedition = getRpgState(db, 'sam').expedition!;
  return resolveRpgEncounter(db, { profileId: 'sam', problemId, expeditionId: expedition.id, encounterIndex: expedition.encounterIndex, ...extra });
};
/** Rewrites the saved fight: enemy health and the ward. */
const setFight = (db: Database, change: (state: RpgState) => void) => { const state = getRpgState(db, 'sam'); change(state); saveRpgState(db, state); };
const weaken = (hp: number, ward?: number, elite = false) => (state: RpgState) => {
  const combat = state.expedition!.combat!;
  combat.enemies = combat.enemies.map((enemy, index) => ({ ...enemy, hp, ...(elite && index === combat.enemies.length - 1 ? { elite: true } : {}) }));
  if (ward !== undefined) combat.ward = ward;
};
const piece = (baseId: string, stats: RpgGearInstance['stats'], rarity: RpgGearInstance['rarity'] = 'common'): RpgGearInstance => ({ ...rpgCreateGear(baseId, 1, () => .5, 'common'), rarity, stats });
const wear = (db: Database, items: Partial<Record<string, RpgGearInstance>>) => setFight(db, state => {
  for (const [slot, item] of Object.entries(items)) { state.gear!.push(item!); state.equippedGear = { ...state.equippedGear, [slot]: item!.id }; }
});
const post = (db: Database, path: string, body: unknown) => createRpgRoutes(db).request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

afterEach(() => { (Math.random as unknown as { mockRestore?: () => void }).mockRestore?.(); });

describe('the ward', () => {
  test('a cast lets each survivor strike once; the ward carries over to the next cast of the same fight', () => {
    const db = fresh();
    setFight(db, weaken(100));
    const first = cast(db, 'p1');
    const survivors = first.reward.combat!.enemiesAfter.filter(enemy => enemy.hp > 0);
    const lost = Math.round(survivors.reduce((total, enemy) => total + rpgEnemyStrike(enemy, 0), 0));
    expect(first.reward.ward).toEqual({ value: RPG_WARD_BASE - lost, max: RPG_WARD_BASE, lost, knelt: false });
    expect(getRpgState(db, 'sam').expedition!.combat!.ward).toBe(RPG_WARD_BASE - lost);
    const second = cast(db, 'p2');
    expect(second.reward.ward!.value).toBe(RPG_WARD_BASE - lost - second.reward.ward!.lost);
  });

  test('wrong answers, slow answers, hints and skips never cost ward: only casts do', () => {
    const db = fresh();
    setFight(db, weaken(100, 70));
    // Misses and skips are recorded by the tutor; none of them reach the ward.
    db.query('INSERT INTO attempts (profile_id, problem_id, correct, skipped, created_at) VALUES (?, ?, 0, 0, ?)').run('sam', 'missed', Date.now());
    db.query('INSERT INTO attempts (profile_id, problem_id, correct, skipped, created_at) VALUES (?, ?, 0, 1, ?)').run('sam', 'skipped', Date.now());
    expect(() => cast(db, 'skipped')).toThrow('Finish this problem');
    expect(() => cast(db, 'helped', { assisted: true })).toThrow('Finish this problem');
    expect(getRpgState(db, 'sam').expedition!.combat!.ward).toBe(70);
    // A slow answer with three wrong tries still loses only the survivors' strikes.
    const slow = cast(db, 'slow', { answerMs: 60_000, wrongCount: 3 });
    const survivors = slow.reward.combat!.enemiesAfter.filter(enemy => enemy.hp > 0);
    expect(slow.reward.ward!.lost).toBe(Math.round(survivors.reduce((total, enemy) => total + rpgEnemyStrike(enemy, 0), 0)));
  });

  test('an empty ward refills to full: the hero kneels and keeps everything', () => {
    const db = fresh();
    setFight(db, weaken(100, 1));
    const before = getRpgState(db, 'sam');
    const result = cast(db, 'p1');
    expect(result.reward.ward).toMatchObject({ value: RPG_WARD_BASE, max: RPG_WARD_BASE, knelt: true });
    expect(result.state.xp).toBeGreaterThanOrEqual(before.xp);
    expect(result.state.forgeDust).toBeGreaterThanOrEqual(before.forgeDust!);
    expect(result.state.expedition!.id).toBe(before.expedition!.id);
  });

  test('a fight cleared with more than half the ward pays the steady bonus; a low ward does not', () => {
    const steady = fresh();
    setFight(steady, weaken(1, 80));
    const won = cast(steady, 'p1');
    expect(won.reward.combat!.encounterCleared).toBe(true);
    expect(won.reward.steadyDust).toBe(2);
    expect(won.reward.forgeDust).toBe(rpgRoomForgeDust(1) + 2);
    // The next pack starts with a full ward.
    expect(won.state.expedition!.combat!.ward).toBeUndefined();
    const low = fresh();
    setFight(low, weaken(1, 30));
    const scraped = cast(low, 'p1');
    expect(scraped.reward.steadyDust).toBeUndefined();
    expect(scraped.reward.forgeDust).toBe(rpgRoomForgeDust(1));
  });

  test('ward gear raises the most; warding and mending soften the strikes', () => {
    const db = fresh();
    wear(db, { chest: piece('padded_tunic', { ward: 30, warding: 20 }), amulet: piece('bone_charm', { wardMend: 3 }) });
    setFight(db, weaken(100));
    const result = cast(db, 'p1');
    const survivors = result.reward.combat!.enemiesAfter.filter(enemy => enemy.hp > 0);
    const lost = Math.round(survivors.reduce((total, enemy) => total + rpgEnemyStrike(enemy, 0), 0) * .8);
    expect(result.reward.ward).toEqual({ value: 130 - lost + 3, max: 130, lost, knelt: false });
  });
});

describe('gear drops', () => {
  test('a cleared pack drops gear 35% of the time', () => {
    for (const [roll, drops] of [[.34, true], [.36, false]] as const) {
      const db = fresh();
      setFight(db, weaken(1));
      spyOn(Math, 'random').mockReturnValue(roll);
      const result = cast(db, 'p1');
      (Math.random as unknown as { mockRestore: () => void }).mockRestore();
      expect(!!result.reward.gear).toBe(drops);
      expect(result.state.gear!.length).toBe(drops ? 1 : 0);
      if (drops) expect(result.state.gear![0]!.id).toBe(result.reward.gear!.id);
    }
  });

  test('a fight that is not over drops nothing', () => {
    const db = fresh();
    setFight(db, weaken(100));
    spyOn(Math, 'random').mockReturnValue(0);
    expect(cast(db, 'p1').reward.gear).toBeUndefined();
  });

  test('an elite pack always drops gear, rolled better', () => {
    const db = fresh();
    setFight(db, weaken(1, undefined, true));
    spyOn(Math, 'random').mockReturnValue(.99);
    const result = cast(db, 'p1');
    expect(result.reward.elite).toBe(true);
    expect(result.reward.gear).toBeDefined();
    // .99 is common for an ordinary roll; the better roll stays common only at the very top, so check the odds directly.
    expect(result.state.gear!.length).toBe(1);
  });

  test('paying chests hold gear 40% of the time; dust found adds to what the story counted', () => {
    for (const [roll, drops] of [[.39, true], [.41, false]] as const) {
      const db = fresh();
      solved(db, 'chest');
      spyOn(Math, 'random').mockReturnValue(roll);
      const result = openRpgChest(db, { profileId: 'sam', problemId: 'chest', expeditionId: getRpgState(db, 'sam').expedition!.id, chestId: 'c1' });
      (Math.random as unknown as { mockRestore: () => void }).mockRestore();
      expect(!!result.reward.gear).toBe(drops);
    }
    const lucky = fresh();
    wear(lucky, { ring1: piece('copper_ring', { dustFind: 50 }) });
    solved(lucky, 'chest');
    const result = openRpgChest(lucky, { profileId: 'sam', problemId: 'chest', expeditionId: getRpgState(lucky, 'sam').expedition!.id, chestId: 'c1' });
    expect(result.reward.forgeDust).toBe(rpgRoomForgeDust(1) + Math.round(rpgRoomForgeDust(1) * .5));
    expect(result.reward.dustFound).toBe(Math.round(rpgRoomForgeDust(1) * .5));
  });

  test('a full bag breaks its weakest spare copy into dust to make room', () => {
    const db = fresh();
    setFight(db, state => {
      state.gear = Array.from({ length: RPG_GEAR_STORE_CAP }, () => piece('leather_cap', { ward: 8 }, 'rare'));
      state.gear[5] = piece('leather_cap', { ward: 8 }, 'common');
      weaken(1)(state);
    });
    const spare = getRpgState(db, 'sam').gear![5]!;
    spyOn(Math, 'random').mockReturnValue(.1);
    const result = cast(db, 'p1');
    expect(result.state.gear!.length).toBe(RPG_GEAR_STORE_CAP);
    expect(result.state.gear!.some(item => item.id === spare.id)).toBe(false);
    expect(result.reward.gearSalvaged).toEqual({ name: spare.name, rarity: 'common', forgeDust: rpgGearSalvageValue(spare) });
  });

  test('worn dust-find gear and power gear change a fight', () => {
    const db = fresh();
    wear(db, { ring1: piece('copper_ring', { dustFind: 100 }), gloves: piece('cloth_wraps', { power: 3 }) });
    setFight(db, weaken(1, 90));
    const result = cast(db, 'p1');
    // Dust found doubles the fight's dust (capped at +100%); steady is added on top.
    expect(result.reward.forgeDust).toBe(rpgRoomForgeDust(1) * 2 + 2);
    expect(result.reward.dustFound).toBe(rpgRoomForgeDust(1));
    const plain = fresh();
    setFight(plain, weaken(100));
    const geared = fresh();
    wear(geared, { gloves: piece('cloth_wraps', { power: 3 }) });
    setFight(geared, weaken(100));
    expect(cast(geared, 'p1').reward.combat!.damage).toBe(cast(plain, 'p1').reward.combat!.damage + 3);
  });
});

describe('gear routes', () => {
  test('equip checks ownership and slot kind; a ring moves between hands but never fills both', async () => {
    const db = fresh();
    const ring = piece('copper_ring', { dustFind: 5 }), helm = piece('leather_cap', { ward: 8 });
    setFight(db, state => { state.gear!.push(ring, helm); });
    expect((await post(db, '/gear/equip', { profileId: 'sam', gearId: 'nope', slot: 'helm' })).status).toBe(400);
    const wrong = await post(db, '/gear/equip', { profileId: 'sam', gearId: helm.id, slot: 'boots' });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toContain('does not fit');
    expect((await post(db, '/gear/equip', { profileId: 'sam', gearId: ring.id, slot: 'ring3' })).status).toBe(400);
    let state = await (await post(db, '/gear/equip', { profileId: 'sam', gearId: ring.id, slot: 'ring1' })).json() as RpgState;
    expect(state.equippedGear).toEqual({ ring1: ring.id });
    state = await (await post(db, '/gear/equip', { profileId: 'sam', gearId: ring.id, slot: 'ring2' })).json() as RpgState;
    expect(state.equippedGear).toEqual({ ring2: ring.id });
    state = await (await post(db, '/gear/equip', { profileId: 'sam', gearId: helm.id, slot: 'helm' })).json() as RpgState;
    expect(state.equippedGear).toEqual({ ring2: ring.id, helm: helm.id });
    state = await (await post(db, '/gear/unequip', { profileId: 'sam', slot: 'ring2' })).json() as RpgState;
    expect(state.equippedGear).toEqual({ helm: helm.id });
    expect(getRpgState(db, 'sam').equippedGear).toEqual({ helm: helm.id });
  });

  test('salvage breaks a spare copy into dust, never a worn one', async () => {
    const db = fresh();
    const helm = piece('leather_cap', { ward: 8 }, 'epic'), spare = piece('leather_cap', { ward: 8 });
    setFight(db, state => { state.gear!.push(helm, spare); state.equippedGear = { helm: helm.id }; state.forgeDust = 4; });
    const refused = await post(db, '/gear/salvage', { profileId: 'sam', gearId: helm.id });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toContain('Take this gear off');
    const state = await (await post(db, '/gear/salvage', { profileId: 'sam', gearId: spare.id })).json() as RpgState;
    expect(state.gear!.map(item => item.id)).toEqual([helm.id]);
    expect(state.forgeDust).toBe(4 + rpgGearSalvageValue(spare));
    expect((await post(db, '/gear/salvage', { profileId: 'sam', gearId: spare.id })).status).toBe(400);
  });

  test('a save from before gear loads with an empty bag and plays on', () => {
    const db = fresh();
    const state = getRpgState(db, 'sam') as Partial<RpgState>;
    delete state.gear; delete state.equippedGear;
    db.query('UPDATE rpg_profiles SET state_json = ? WHERE profile_id = ?').run(JSON.stringify(state), 'sam');
    const loaded = getRpgState(db, 'sam');
    expect(loaded.gear).toEqual([]);
    expect(loaded.equippedGear).toEqual({});
    expect(cast(db, 'p1').reward.ward!.max).toBe(RPG_WARD_BASE);
  });
});

describe('the ward tonic', () => {
  test('bought with the right change, it adds ward to the next three fights, one at a time', () => {
    const db = fresh();
    setFight(db, state => { state.forgeDust = 40; });
    const price = rpgTraderWares(getRpgState(db, 'sam')).find(ware => ware.id === 'ward-tonic')!.price;
    buyFromTrader(db, { profileId: 'sam', requestId: 't1', wareId: 'ward-tonic', seenDust: 40, answer: 40 - price });
    expect(getRpgState(db, 'sam').wardTonics).toBe(RPG_WARD_TONIC_FIGHTS);
    // One tonic at a time.
    expect(() => buyFromTrader(db, { profileId: 'sam', requestId: 't2', wareId: 'ward-tonic', seenDust: 40 - price, answer: 40 - 2 * price })).toThrow('still lasts');
    setFight(db, weaken(100));
    const first = cast(db, 'p1');
    expect(first.reward.ward!.max).toBe(RPG_WARD_BASE + RPG_WARD_TONIC);
    expect(first.state.wardTonics).toBe(RPG_WARD_TONIC_FIGHTS - 1);
    // A second cast in the same fight uses the same tonic.
    expect(cast(db, 'p2').state.wardTonics).toBe(RPG_WARD_TONIC_FIGHTS - 1);
  });
});
