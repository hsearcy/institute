import { expect, test } from 'bun:test';
import { RPG_ITEMS, RPG_SKILLS, rpgEncounterCombat, rpgSpellCombatStats, rpgSpellModifiers, rpgSpellUnlocked, type RpgState } from './rpg';
import { rpgCreateLoot, rpgNormalizeLoot, rpgEffectiveSkills, rpgForgeCost, rpgDungeonForgeDust, rpgUnlockedTier } from './rpgLoot';

const oldSave: RpgState = {
  profileId: 'old', xp: 500, level: 4, xpIntoLevel: 95, xpForNextLevel: 225, skillPoints: 2,
  skills: { ember_power: 1 }, inventory: ['apprentice', 'cinderwand'], equippedItemId: 'cinderwand',
  appearanceId: 'wayfarer', selectedSpellId: 'ember', totalKills: 100, expeditionsCompleted: 3, expedition: null,
};

test('legacy normalization is deterministic, additive, and does not mutate existing progress', () => {
  const before = JSON.stringify(oldSave), normalized = rpgNormalizeLoot(oldSave);
  expect(JSON.stringify(oldSave)).toBe(before);
  expect(normalized).toMatchObject(oldSave);
  expect(normalized.loot).toEqual([
    { id: 'legacy:apprentice', itemId: 'apprentice', bonusPower: 0, upgradeLevel: 0 },
    { id: 'legacy:cinderwand', itemId: 'cinderwand', bonusPower: 0, upgradeLevel: 0 },
  ]);
  expect(normalized.equippedLootId).toBe('legacy:cinderwand');
  expect(rpgNormalizeLoot(normalized)).toEqual(normalized);
  expect(rpgUnlockedTier(normalized)).toBe(2);
  expect(rpgSpellCombatStats(normalized)).toEqual(rpgSpellCombatStats(oldSave));
});

test('random rolls are bounded and provide school-relevant learned skill bonuses', () => {
  for (const item of RPG_ITEMS) for (const tier of [1, 4, 10, 999]) for (const value of [0, 0.2, 0.49, 0.999]) {
    const result = rpgCreateLoot(item.id, tier, () => value);
    expect(result.itemId).toBe(item.id);
    expect(result.bonusPower).toBeGreaterThanOrEqual(1);
    expect(result.bonusPower).toBeLessThanOrEqual(12);
    expect(result.upgradeLevel).toBe(0);
    if (result.bonusSkillId) {
      const skill = RPG_SKILLS.find(entry => entry.id === result.bonusSkillId)!;
      expect(skill.kind).not.toBe('unlock');
      if (item.school) expect(skill.school).toBe(item.school);
      expect([1, 2]).toContain(result.bonusSkillRanks);
    }
  }
  expect(rpgCreateLoot('cinderwand', 1, () => 0).id).not.toBe(rpgCreateLoot('cinderwand', 1, () => 0).id);
});

test('rolls and forging change authoritative damage; skill affixes never unlock unlearned abilities or modifiers', () => {
  const state = rpgNormalizeLoot(oldSave), item = state.loot![1];
  const base = rpgSpellCombatStats(state).damage;
  item.bonusPower = 3; item.upgradeLevel = 2; item.bonusSkillId = 'ember_power'; item.bonusSkillRanks = 2;
  expect(rpgSpellCombatStats(state).damage).toBe(base + 3 + 4 + 4);
  expect(rpgEffectiveSkills(state).ember_power).toBe(3);
  expect(state.skills).toEqual({ ember_power: 1 });
  item.bonusSkillId = 'meteor';
  expect(rpgEffectiveSkills(state).meteor).toBe(0);
  expect(rpgSpellUnlocked('meteor', state.skills)).toBe(false);
  item.bonusSkillId = 'ember_echo';
  expect(rpgEffectiveSkills(state).ember_echo).toBe(0);
  expect(rpgSpellModifiers(state)).not.toContain('echo');
  state.skills.ember_echo = 1;
  expect(rpgSpellModifiers(state)).toContain('echo');
  expect(rpgEffectiveSkills(state).ember_echo).toBe(3);
  expect(rpgForgeCost(item)).toEqual({ gems: 75, dust: 15 });
  state.equippedLootId = 'not-owned';
  expect(rpgSpellCombatStats(state).damage).toBe(base + 4);
});

test('higher dungeon tiers add bounded health and guaranteed materials without extra enemies', () => {
  for (let tier = 1; tier <= 10; tier++) {
    expect(rpgDungeonForgeDust(tier)).toBe(20 + 8 * tier);
    expect(rpgUnlockedTier({ bestTier: tier })).toBe(Math.min(10, tier + 1));
    for (let room = 0; room < 6; room++) {
      const expedition = { id: 'tier', regionId: 'embercrypt', encounterIndex: room, encountersTotal: 6, cleared: false, startedAt: 0, tier };
      const pack = rpgEncounterCombat({ expedition });
      const baseline = rpgEncounterCombat({ expedition: { ...expedition, tier: 1 } });
      expect(pack.enemies.length).toBeLessThanOrEqual(10);
      expect(pack.enemies.length).toBe(baseline.enemies.length);
      expect(pack.enemies[0].maxHp).toBe(Math.ceil(baseline.enemies[0].maxHp * (1.4 ** (tier - 1))));
    }
  }
});

test('large item rolls strengthen hits while learned modifiers preserve each spell\'s coverage', () => {
  const state = rpgNormalizeLoot(oldSave), item = state.loot![1];
  item.bonusPower = 12; item.upgradeLevel = 5;
  state.skills = Object.fromEntries(RPG_SKILLS.map(skill => [skill.id, skill.maxRank]));
  expect(rpgSpellCombatStats(state, 'cleave').targets).toBe(5);
  expect(rpgSpellCombatStats(state, 'ember').targets).toBe(7);
  expect(rpgSpellCombatStats(state, 'meteor').targets).toBe(7);
  expect(rpgSpellCombatStats(state, 'firestorm').targets).toBe(10);
  state.skills = { ember_power: 3, ember_master: 2 };
  expect(rpgSpellCombatStats(state, 'ember').targets).toBe(6);
  item.bonusSkillId = 'ember_echo'; item.bonusSkillRanks = 2;
  expect(rpgSpellCombatStats(state, 'ember').targets).toBe(6);
  state.skills.ember_echo = 1;
  expect(rpgSpellCombatStats(state, 'ember').targets).toBe(8);
});
