import { expect, test } from 'bun:test';
import { RPG_WARD_STRIKE, RPG_WARD_TONIC, RPG_GEAR_STORE_CAP, rpgEnemyStrike, rpgWardCounterstrike, rpgSteadyDust, rpgWardNow, rpgNormalizeGear, rpgStoreGear, rpgDustFindBonus, rpgGearRunSpeed } from './rpgWard';
import { rpgCreateGear, rpgGearSalvageValue, type RpgGearInstance } from './rpgGear';
import { rpgSpellCombatStats } from './rpg';

const piece = (baseId: string, stats: RpgGearInstance['stats'], rarity: RpgGearInstance['rarity'] = 'common'): RpgGearInstance => ({ ...rpgCreateGear(baseId, 1, () => .5, 'common'), rarity, stats });

test('brutes strike harder; elites by half again; the guardian twice; tiers and depth grow gently', () => {
  expect(rpgEnemyStrike({ id: 'enemy-1' }, 1)).toBe(RPG_WARD_STRIKE.normal);
  expect(rpgEnemyStrike({ id: 'enemy-0' }, 1)).toBe(RPG_WARD_STRIKE.brute);
  expect(rpgEnemyStrike({ id: 'enemy-7' }, 1)).toBe(RPG_WARD_STRIKE.brute);
  expect(rpgEnemyStrike({ id: 'enemy-3', elite: true }, 1)).toBe(RPG_WARD_STRIKE.normal * 1.5);
  expect(rpgEnemyStrike({ id: 'enemy-0' }, 5)).toBe(RPG_WARD_STRIKE.brute * 2);
  expect(rpgEnemyStrike({ id: 'enemy-1' }, 1, 6)).toBeCloseTo(RPG_WARD_STRIKE.normal * 1.3);
  expect(rpgEnemyStrike({ id: 'enemy-1' }, 1, 1, 3)).toBeCloseTo(RPG_WARD_STRIKE.normal * 1.2);
  // Depth steps stop at three.
  expect(rpgEnemyStrike({ id: 'enemy-1' }, 1, 1, 50)).toBeCloseTo(RPG_WARD_STRIKE.normal * 1.3);
});

test('each survivor strikes once; the fallen do not; warding softens (at most half); mending restores', () => {
  const survivors = [{ id: 'enemy-0', hp: 3 }, { id: 'enemy-1', hp: 2 }, { id: 'enemy-2', hp: 0 }];
  const lost = RPG_WARD_STRIKE.brute + RPG_WARD_STRIKE.normal;
  expect(rpgWardCounterstrike({ ward: 100, max: 100, survivors, encounterIndex: 1 })).toEqual({ value: 100 - lost, max: 100, lost, knelt: false });
  expect(rpgWardCounterstrike({ ward: 100, max: 100, survivors, encounterIndex: 1, warding: 25 }).lost).toBe(Math.round(lost * .75));
  // Warding past 50% does nothing more.
  expect(rpgWardCounterstrike({ ward: 100, max: 100, survivors, encounterIndex: 1, warding: 90 }).lost).toBe(Math.round(lost * .5));
  expect(rpgWardCounterstrike({ ward: 60, max: 100, survivors, encounterIndex: 1, wardMend: 4 }).value).toBe(60 - lost + 4);
  // Mending never lifts the ward past its most.
  expect(rpgWardCounterstrike({ ward: 100, max: 100, survivors: [{ id: 'enemy-1', hp: 1 }], encounterIndex: 1, wardMend: 50 }).value).toBe(100);
  // A cleared fight strikes nothing.
  expect(rpgWardCounterstrike({ ward: 40, max: 100, survivors: [{ id: 'enemy-1', hp: 0 }], encounterIndex: 1 })).toEqual({ value: 40, max: 100, lost: 0, knelt: false });
});

test('an empty ward refills to full: the hero kneels and nothing is lost', () => {
  const result = rpgWardCounterstrike({ ward: 5, max: 120, survivors: [{ id: 'enemy-0', hp: 9 }], encounterIndex: 1 });
  expect(result).toEqual({ value: 120, max: 120, lost: RPG_WARD_STRIKE.brute, knelt: true });
});

test('steady pays only above half the ward, more at depth', () => {
  expect(rpgSteadyDust(51, 100)).toBe(2);
  expect(rpgSteadyDust(50, 100)).toBe(0);
  expect(rpgSteadyDust(90, 100, 3)).toBe(4);
});

test('the ward shown: a fight not begun is full, with a waiting tonic; a fight in progress shows its value', () => {
  const ring = piece('padded_tunic', { ward: 20 });
  const base = { gear: [ring], equippedGear: { chest: ring.id } };
  expect(rpgWardNow({ ...base, expedition: null })).toEqual({ value: 120, max: 120 });
  expect(rpgWardNow({ ...base, expedition: null, wardTonics: 2 })).toEqual({ value: 120 + RPG_WARD_TONIC, max: 120 + RPG_WARD_TONIC });
  const expedition = { id: 'x', regionId: 'embercrypt', encounterIndex: 1, encountersTotal: 6, cleared: false, startedAt: 0, combat: { version: 1 as const, encounterIndex: 1, casts: 1, enemies: [], ward: 70, wardBonus: 25 } };
  expect(rpgWardNow({ ...base, expedition })).toEqual({ value: 70, max: 145 });
});

test('gear power adds to every attack and school power to its school', () => {
  const loadout = { skills: {}, equippedItemId: 'apprentice', selectedSpellId: 'cleave' as const };
  const gloves = piece('cloth_wraps', { power: 2, frost: 3 });
  const worn = { ...loadout, gear: [gloves], equippedGear: { gloves: gloves.id } };
  expect(rpgSpellCombatStats(worn, 'cleave').damage).toBe(rpgSpellCombatStats(loadout, 'cleave').damage + 2);
  expect(rpgSpellCombatStats(worn, 'frost').damage).toBe(rpgSpellCombatStats(loadout, 'frost').damage + 5);
});

test('dust found and run speed follow capped gear totals', () => {
  const a = piece('copper_ring', { dustFind: 70 }), b = piece('copper_ring', { dustFind: 70 });
  const state = { gear: [a, b], equippedGear: { ring1: a.id, ring2: b.id } };
  expect(rpgDustFindBonus(state, 10)).toBe(10);
  expect(rpgDustFindBonus({ gear: [a], equippedGear: { ring1: a.id } }, 10)).toBe(7);
  expect(rpgDustFindBonus(state, 0)).toBe(0);
  const boots = piece('soft_boots', { speed: 80 });
  expect(rpgGearRunSpeed({ gear: [boots], equippedGear: { boots: boots.id } })).toBe(1.3);
  expect(rpgGearRunSpeed({})).toBe(1);
});

test('old saves load with an empty bag; stale slots drop', () => {
  expect(rpgNormalizeGear({})).toEqual({ gear: [], equippedGear: {} });
  const ring = piece('copper_ring', { dustFind: 5 });
  const normal = rpgNormalizeGear({ gear: [ring, { ...ring, id: 'odd', baseId: 'nothing' }], equippedGear: { ring1: ring.id, ring2: ring.id, helm: 'gone' } });
  expect(normal.gear!.map(item => item.id)).toEqual([ring.id]);
  expect(normal.equippedGear).toEqual({ ring1: ring.id });
});

test('a full bag breaks its oldest, weakest spare copy into dust; worn copies stay', () => {
  const gear = Array.from({ length: RPG_GEAR_STORE_CAP }, (_, index) => piece('leather_cap', { ward: 8 }, index < 2 ? 'common' : 'rare'));
  const state = { gear, equippedGear: { helm: gear[0]!.id }, forgeDust: 0 };
  const next = piece('leather_cap', { ward: 9 }, 'epic');
  const result = rpgStoreGear(state, next);
  expect(result.salvaged!.id).toBe(gear[1]!.id);
  expect(result.dust).toBe(rpgGearSalvageValue(gear[1]!));
  expect(state.forgeDust).toBe(result.dust);
  expect(state.gear.length).toBe(RPG_GEAR_STORE_CAP);
  expect(state.gear.some(item => item.id === gear[0]!.id)).toBe(true);
  expect(state.gear.at(-1)!.id).toBe(next.id);
  // Under the cap nothing is broken.
  expect(rpgStoreGear({ gear: [] }, next)).toEqual({ salvaged: undefined, dust: 0 });
});
