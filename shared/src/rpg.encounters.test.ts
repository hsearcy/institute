import { expect, test } from 'bun:test';
import { RPG_ITEMS, RPG_SKILLS, RPG_SPELLS, rpgEncounterKills } from './rpg';

test('fresh adventures have smaller normal packs and a larger boss encounter', () => {
  const state = { skills: {}, equippedItemId: 'apprentice', selectedSpellId: 'ember' as const };
  expect(Array.from({ length: 6 }, (_, room) => rpgEncounterKills(state, room))).toEqual([14, 15, 16, 17, 18, 24]);
  expect(rpgEncounterKills(state, 0, 'cleave')).toBe(16);
});

test('school ranks and applicable gear retain their full contribution below the crowd limit', () => {
  const plain = { skills: {}, equippedItemId: 'apprentice', selectedSpellId: 'meteor' as const };
  expect(rpgEncounterKills({ ...plain, skills: { ember_power: 2 } }, 0) - rpgEncounterKills(plain, 0)).toBe(4);
  expect(rpgEncounterKills({ ...plain, equippedItemId: 'starfall' }, 0) - rpgEncounterKills(plain, 0)).toBe(8);
  expect(rpgEncounterKills({ ...plain, equippedItemId: 'starfall' }, 0, 'frost')).toBe(14);
  expect(rpgEncounterKills({ ...plain, skills: { ember_power: 3 } }, 0, 'frost')).toBe(14);
});

test('every supported fully upgraded spell and relic combination fits the authoritative 48-enemy limit', () => {
  const skills = Object.fromEntries(RPG_SKILLS.map(skill => [skill.id, skill.maxRank]));
  let capped = false;
  for (const spell of RPG_SPELLS) for (const item of RPG_ITEMS) for (let room = 0; room < 6; room++) {
    const count = rpgEncounterKills({ skills, equippedItemId: item.id, selectedSpellId: spell.id }, room);
    expect(Number.isInteger(count)).toBe(true);
    expect(count).toBeGreaterThanOrEqual(room === 5 ? 24 : 14 + room);
    expect(count).toBeLessThanOrEqual(48);
    if (count === 48) capped = true;
  }
  expect(capped).toBe(true);
});
