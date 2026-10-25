import { expect, test } from 'bun:test';
import { RPG_GEAR_BASES, RPG_GEAR_CAPS, RPG_WARD_BASE, rpgCreateGear, rpgEquippedGear, rpgGearStats, rpgMaxWard, rpgPickGearBase, rpgRollGearRarity } from './rpgGear';

const seeded = (seed: number) => () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };

test('every base rolls valid gear at every tier and rarity', () => {
  const random = seeded(7);
  for (const base of RPG_GEAR_BASES) for (const tier of [1, 5, 10]) for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
    const gear = rpgCreateGear(base.id, tier, random, rarity);
    expect(gear.kind).toBe(base.kind);
    expect(Object.values(gear.stats).every(value => Number.isInteger(value) && value > 0)).toBe(true);
    for (const stat of Object.keys(base.implicit)) expect(gear.stats[stat as keyof typeof gear.stats]).toBeGreaterThan(0);
    if (rarity === 'common') expect(Object.keys(gear.stats).sort()).toEqual(Object.keys(base.implicit).sort());
    expect(gear.name.length).toBeGreaterThan(3);
  }
});

test('higher tiers roll stronger copies, and better drops are rarer', () => {
  const sum = (tier: number) => { const random = seeded(3); let total = 0; for (let i = 0; i < 300; i++) total += rpgCreateGear('scale_mail', tier, random, 'epic').stats.ward!; return total; };
  expect(sum(10)).toBeGreaterThan(sum(1));
  const random = seeded(11), counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < 4000; i++) counts[rpgRollGearRarity(random, 1)]++;
  expect(counts.common).toBeGreaterThan(counts.rare); expect(counts.rare).toBeGreaterThan(counts.epic); expect(counts.epic).toBeGreaterThan(counts.legendary);
  expect(counts.legendary).toBeGreaterThan(0);
  expect(rpgPickGearBase(seeded(1), 1).minTier).toBe(1);
});

test('only equipped copies in matching slots count, and totals are capped', () => {
  const boots = Array.from({ length: 3 }, () => rpgCreateGear('windstep_boots', 10, seeded(5), 'legendary'));
  boots.forEach(item => { item.stats.speed = 25; });
  const ring = rpgCreateGear('copper_ring', 1, seeded(9), 'common');
  const helm = rpgCreateGear('iron_helm', 1, seeded(2), 'common');
  const state = { gear: [...boots, ring, helm], equippedGear: { boots: boots[0]!.id, ring1: ring.id, ring2: ring.id, helm: boots[1]!.id, chest: 'gone' } };
  const equipped = rpgEquippedGear(state);
  expect(equipped.boots?.id).toBe(boots[0]!.id);
  expect(equipped.helm).toBeUndefined();
  expect(equipped.chest).toBeUndefined();
  expect(equipped.ring1?.id).toBe(ring.id); expect(equipped.ring2).toBeUndefined();
  expect(rpgGearStats(state).speed).toBe(25);
  state.gear[0]!.stats.speed = 99;
  expect(rpgGearStats(state).speed).toBe(RPG_GEAR_CAPS.speed);
  expect(rpgMaxWard({})).toBe(RPG_WARD_BASE);
  expect(rpgMaxWard({ gear: [helm], equippedGear: { helm: helm.id } })).toBe(RPG_WARD_BASE + helm.stats.ward!);
});
