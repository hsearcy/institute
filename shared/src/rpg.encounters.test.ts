import { expect, test } from 'bun:test';
import { RPG_ITEMS, RPG_SKILLS, RPG_SPELLS, rpgEncounterCombat, rpgApplyCombat, rpgSpellCombatStats, rpgEncounterKills } from './rpg';

const plain = { skills: {}, equippedItemId: 'apprentice', selectedSpellId: 'ember' as const };

test('new heroes meet three monsters, with gradual growth and persistent current rooms', () => {
  for (let room = 0; room < 6; room++) {
    expect(rpgEncounterCombat({ expedition: null, level: 1 }, room).enemies).toHaveLength(3);
    expect(rpgEncounterCombat({ expedition: null, level: 2 }, room).enemies).toHaveLength(4);
    expect(rpgEncounterCombat({ expedition: null, level: 3 }, room).enemies).toHaveLength(5);
  }
  const combat = rpgEncounterCombat({ expedition: null, level: 1 });
  const wounded = rpgApplyCombat({ ...plain, selectedSpellId: 'cleave' }, combat).combat;
  const expedition = { id: 'intro', regionId: 'embercrypt', encounterIndex: 0, encountersTotal: 6, cleared: false, startedAt: 0, combat: wounded };
  expect(rpgEncounterCombat({ expedition, level: 2 })).toEqual(wounded);
  expect(rpgEncounterCombat({ expedition: null, level: 8 }, 5).enemies).toHaveLength(10);
  expect(rpgEncounterCombat({ expedition: null, level: 60 }, 5).enemies).toHaveLength(10);
});

test('fixed packs and guardian/boss health are independent of spell power', () => {
  const packs = Array.from({ length: 6 }, (_, room) => rpgEncounterCombat({ expedition: null }, room));
  expect(packs.map(pack => pack.enemies.length)).toEqual([6, 7, 8, 8, 9, 10]);
  expect(packs[0].enemies[0].maxHp).toBeGreaterThan(packs[0].enemies[1].maxHp);
  expect(packs[5].enemies[0].maxHp).toBeGreaterThan(packs[5].enemies[7].maxHp);
  expect(packs[5].enemies.map(enemy => enemy.id)).toEqual(Array.from({ length: 10 }, (_, i) => `enemy-${i}`));
});

test('starter Nova defeats weak enemies and leaves persistent wounds; a second cast clears the first room', () => {
  const initial = rpgEncounterCombat({ expedition: null });
  const frozen = JSON.stringify(initial);
  const first = rpgApplyCombat(plain, initial);
  expect(first.result.defeatedIds).toEqual(['enemy-1', 'enemy-5']);
  expect(first.result.encounterCleared).toBe(false);
  expect(first.combat.enemies[0].hp).toBe(6);
  expect(JSON.stringify(initial)).toBe(frozen);
  const second = rpgApplyCombat(plain, first.combat);
  expect(second.result.defeatedIds).toEqual(['enemy-0', 'enemy-2', 'enemy-3', 'enemy-4']);
  expect(second.result.hits.some(hit => first.result.defeatedIds.includes(hit.enemyId))).toBe(false);
  expect(second.result.encounterCleared).toBe(true);
  expect(second.result.enemiesBefore).toEqual(first.result.enemiesAfter);
  expect(second.combat.casts).toBe(2);
  expect(rpgEncounterKills(plain, 0)).toBe(2);
});

test('damage, coverage and applicable equipment make upgrades meaningful without multiplying enemies', () => {
  const initial = rpgEncounterCombat({ expedition: null });
  const base = rpgApplyCombat(plain, initial);
  const skilled = rpgApplyCombat({ ...plain, skills: { ember_power: 1 } }, initial);
  const relic = rpgApplyCombat({ ...plain, equippedItemId: 'cinderwand' }, initial);
  expect(skilled.result.defeatedIds.length).toBeGreaterThan(base.result.defeatedIds.length);
  expect(relic.result.damage).toBe(base.result.damage + 3);
  expect(rpgSpellCombatStats(plain, 'cleave')).toEqual({ damage: 9, targets: 3 });
  expect(rpgSpellCombatStats({ ...plain, skills: { ember_power: 3 } }, 'frost')).toEqual(rpgSpellCombatStats(plain, 'frost'));
  expect(rpgSpellCombatStats({ ...plain, equippedItemId: 'starfall' }, 'meteor').damage - rpgSpellCombatStats(plain, 'meteor').damage).toBe(8);
  expect(rpgSpellCombatStats({ ...plain, equippedItemId: 'starfall' }, 'frost')).toEqual(rpgSpellCombatStats(plain, 'frost'));
  const advanced = rpgApplyCombat({ ...plain, skills: { firestorm: 1, ember_power: 3 } }, initial, 'firestorm');
  expect(advanced.result.encounterCleared).toBe(true);
  expect(advanced.combat.enemies.length).toBe(initial.enemies.length);
});

test('all learned spell/relic combinations preserve the ten-enemy cap and conserve actual damage', () => {
  const skills = Object.fromEntries(RPG_SKILLS.map(skill => [skill.id, skill.maxRank]));
  for (const spell of RPG_SPELLS) for (const item of RPG_ITEMS) {
    const pack = rpgEncounterCombat({ expedition: null }, 5);
    const cast = rpgApplyCombat({ skills, equippedItemId: item.id, selectedSpellId: spell.id }, pack);
    expect(cast.result.hits.length).toBeLessThanOrEqual(10);
    expect(cast.combat.enemies.length).toBe(10);
    expect(cast.result.hits.every(hit => hit.damage === hit.hpBefore - hit.hpAfter && hit.hpAfter >= 0)).toBe(true);
    expect(cast.result.defeatedIds.length + cast.result.remainingEnemies).toBe(10);
  }
});
