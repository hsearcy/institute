import { expect, test } from 'bun:test';
import { RPG_ITEMS, RPG_SKILLS, RPG_SPELLS, rpgEncounterCombat, rpgSpellCombatStats, rpgSpellModifiers, rpgSpellUnlocked, rpgSpellAvailable, type RpgState, type RpgLootInstance } from './rpg';
import { rpgCreateLoot, rpgNormalizeLoot, rpgEffectiveSkills, rpgForgeCost, rpgDungeonForgeDust, rpgUnlockedTier, rpgLootAffixes, rpgLootSkillBonus } from './rpgLoot';

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

test('random rolls are bounded and provide school-relevant temporary skill bonuses', () => {
  for (const item of RPG_ITEMS) for (const tier of [1, 4, 10, 999]) for (const value of [0, 0.2, 0.49, 0.999]) {
    const result = rpgCreateLoot(item.id, tier, () => value);
    expect(result.itemId).toBe(item.id);
    expect(result.bonusPower).toBeGreaterThanOrEqual(1);
    expect(result.bonusPower).toBeLessThanOrEqual(12);
    expect(result.upgradeLevel).toBe(0);
    const affixes = rpgLootAffixes(result);
    expect([affixes.targets, affixes.spellPower, affixes.schoolPower].filter(Boolean).length).toBeLessThanOrEqual(1);
    expect(affixes.targets).toBeLessThanOrEqual(2); expect(affixes.spellPower).toBeLessThanOrEqual(12); expect(affixes.schoolPower).toBeLessThanOrEqual(8);
    if (affixes.spellId && item.spellId) expect(affixes.spellId).toBe(item.spellId);
    if (affixes.spellId && item.school) expect(RPG_SPELLS.find(spell => spell.id === affixes.spellId)!.school).toBe(item.school);
    if (affixes.schoolId && item.school) expect(affixes.schoolId).toBe(item.school);
    if (result.bonusSkillId) {
      const skill = RPG_SKILLS.find(entry => entry.id === result.bonusSkillId)!;
      if (item.school) expect(skill.school).toBe(item.school);
      expect([1, 2]).toContain(result.bonusSkillRanks);
      if (skill.kind === 'unlock') expect(result.bonusSkillRanks).toBe(1);
    }
  }
  expect(rpgCreateLoot('cinderwand', 1, () => 0).id).not.toBe(rpgCreateLoot('cinderwand', 1, () => 0).id);
});

test('new broad and rare rolls use bounded deterministic branches', () => {
  const roll = (values: number[], tier = 1, item = 'cinderwand') => {
    let index = 0;
    const result = rpgCreateLoot(item, tier, () => {
      if (index >= values.length) throw new Error('Unexpected RNG draw');
      return values[index++];
    });
    expect(index).toBe(values.length); return result;
  };
  expect(roll([.25, .99, .99])).toMatchObject({ bonusPower: 2, upgradeLevel: 0 });
  expect(roll([.25, .99, 0])).toMatchObject({ bonusPower: 2, bonusTargets: 1 });
  expect(roll([.25, .99, 0, 0], 5).bonusTargets).toBe(2);
  expect(roll([.25, .99, 0, .99], 5).bonusTargets).toBe(1);
  expect(roll([.25, .99, .52, 0, .99])).toMatchObject({ bonusSpellId: 'ember', bonusSpellPower: 6 });
  expect(roll([.25, .99, .3, 0, .99])).toMatchObject({ bonusSchoolId: 'ember', bonusSchoolPower: 3 });
  const retained = roll([.25, 0, 0, .99, .99], 4);
  expect(retained).toMatchObject({ bonusPower: 3, bonusSkillId: 'ember_power', bonusSkillRanks: 1 });
  expect(rpgLootAffixes(retained)).toEqual({ targets: 0, spellPower: 0, schoolPower: 0 });
  expect(roll([.25, .99, .8, .99, .99], 10, 'winterbranch')).toMatchObject({ bonusSpellId: 'frost_guardian', bonusSpellPower: 12 });
});

test('named affixes affect only their spell or school on the exact equipped copy without unlocking skills', () => {
  const state = rpgNormalizeLoot(oldSave);
  state.loot!.push({ id: 'moon-a', itemId: 'moonstaff', bonusPower: 0, upgradeLevel: 0 }, { id: 'moon-b', itemId: 'moonstaff', bonusPower: 0, upgradeLevel: 0, bonusTargets: 2 });
  state.inventory.push('moonstaff'); state.equippedItemId = 'moonstaff'; state.equippedLootId = 'moon-a';
  const active = state.loot!.find(item => item.id === 'moon-a')!, before = structuredClone(state);
  const base = Object.fromEntries(RPG_SPELLS.map(spell => [spell.id, rpgSpellCombatStats(state, spell.id)]));
  active.bonusSpellId = 'ice_lance'; active.bonusSpellPower = 6;
  for (const spell of RPG_SPELLS) expect(rpgSpellCombatStats(state, spell.id)).toEqual({ ...base[spell.id], damage: base[spell.id].damage + (spell.id === 'ice_lance' ? 6 : 0) });
  expect(rpgSpellUnlocked('ice_lance', state.skills)).toBe(false);
  expect(rpgSpellAvailable(state, 'ice_lance')).toBe(false);
  expect(state.skills).toEqual(before.skills); expect(rpgEffectiveSkills(state)).toEqual(rpgEffectiveSkills(before));
  delete active.bonusSpellId; delete active.bonusSpellPower;
  active.bonusSchoolId = 'frost'; active.bonusSchoolPower = 4;
  for (const spell of RPG_SPELLS) expect(rpgSpellCombatStats(state, spell.id)).toEqual({ ...base[spell.id], damage: base[spell.id].damage + (spell.school === 'frost' ? 4 : 0) });
  state.equippedLootId = 'moon-b';
  expect(rpgSpellCombatStats(state, 'ice_lance')).toEqual({ damage: base.ice_lance.damage, targets: base.ice_lance.targets + 2 });
  state.skills = Object.fromEntries(RPG_SKILLS.map(skill => [skill.id, skill.maxRank]));
  expect(rpgSpellCombatStats(state, 'firestorm').targets).toBe(10);
  expect(rpgSpellCombatStats(state, 'cleave').targets).toBe(7);
  state.equippedLootId = 'not-owned';
  expect(rpgSpellCombatStats(state, 'cleave').targets).toBe(5);
});

test('affix reading sanitizes unsafe values and preserves old saves without adding or rerolling fields', () => {
  const original: RpgLootInstance = { id: 'existing', itemId: 'cinderwand', bonusPower: 3, bonusSkillId: 'ember_power', bonusSkillRanks: 1, upgradeLevel: 2 };
  const state = { ...oldSave, loot: [original] }, before = JSON.stringify(state);
  expect(rpgLootAffixes(original)).toEqual({ targets: 0, spellPower: 0, schoolPower: 0 });
  rpgNormalizeLoot(state); rpgSpellCombatStats(state);
  expect(JSON.stringify(state)).toBe(before); expect(Object.hasOwn(original, 'bonusTargets')).toBe(false);
  expect(rpgLootAffixes({ ...original, bonusTargets: 999, bonusSpellId: 'ember', bonusSpellPower: 999, bonusSchoolId: 'ember', bonusSchoolPower: 999 })).toEqual({ targets: 2, spellId: 'ember', spellPower: 12, schoolId: 'ember', schoolPower: 8 });
  for (const invalid of [NaN, Infinity, -Infinity, -3]) {
    expect(rpgLootAffixes({ ...original, bonusTargets: invalid, bonusSpellId: 'ember', bonusSpellPower: invalid, bonusSchoolId: 'ember', bonusSchoolPower: invalid })).toEqual({ targets: 0, spellPower: 0, schoolPower: 0 });
    expect(Number.isFinite(rpgCreateLoot('cinderwand', 1, () => invalid).bonusPower)).toBe(true);
  }
  expect(rpgLootAffixes({ ...original, bonusTargets: 1.9, bonusSpellId: 'ice_lance', bonusSpellPower: 6, bonusSchoolId: 'frost', bonusSchoolPower: 4 })).toEqual({ targets: 1, spellPower: 0, schoolPower: 0 });
  expect(rpgLootAffixes({ ...original, itemId: 'invalid', bonusTargets: 2 })).toEqual({ targets: 0, spellPower: 0, schoolPower: 0 });
});

test('rolls and forging strengthen attacks; equipped ranks activate immediately without purchasing tree ranks', () => {
  const state = rpgNormalizeLoot(oldSave), item = state.loot![1];
  const base = rpgSpellCombatStats(state).damage;
  item.bonusPower = 3; item.upgradeLevel = 2; item.bonusSkillId = 'ember_power'; item.bonusSkillRanks = 2;
  expect(rpgSpellCombatStats(state).damage).toBe(base + 3 + 4 + 4);
  expect(rpgEffectiveSkills(state).ember_power).toBe(3);
  expect(state.skills).toEqual({ ember_power: 1 });
  item.bonusSkillId = 'meteor';
  expect(rpgEffectiveSkills(state).meteor).toBe(2);
  expect(rpgSpellAvailable(state, 'meteor')).toBe(true);
  expect(rpgSpellUnlocked('meteor', state.skills)).toBe(false);
  item.bonusSkillId = 'ember_echo';
  expect(rpgEffectiveSkills(state).ember_echo).toBe(2);
  expect(rpgSpellModifiers(state)).toContain('echo');
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
  expect(rpgSpellCombatStats(state, 'ember').targets).toBe(8);
  state.skills.ember_echo = 1;
  expect(rpgSpellCombatStats(state, 'ember').targets).toBe(8);
});


test('all base relic power covers every attack or a whole school without named spell effects', () => {
  for (const item of RPG_ITEMS) {
    expect(['all', 'school']).toContain(item.scope); expect(item.spellId).toBeNull(); expect(item.effect).toBeUndefined();
    for (const spell of RPG_SPELLS) {
      const baseline = rpgSpellCombatStats({ skills: {}, equippedItemId: 'apprentice', selectedSpellId: spell.id });
      const equipped = { skills: {}, equippedItemId: item.id, selectedSpellId: spell.id };
      const stats = rpgSpellCombatStats(equipped);
      expect(stats.damage - baseline.damage).toBe(item.scope === 'all' || item.school === spell.school ? item.power : 0);
      expect(stats.targets).toBe(baseline.targets); expect(rpgSpellModifiers(equipped)).toEqual([]);
    }
  }
});

test('skill and named-spell rolls are rare additional bonuses while broad power is guaranteed', () => {
  for (const [tier, expectedSkills, expectedNamed] of [[1, 100, 50], [10, 180, 100]]) {
    let skills = 0, named = 0;
    for (let sample = 0; sample < 1000; sample++) {
      let draw = 0;
      const rankRoll = rpgCreateLoot('moonstaff', tier, () => ++draw === 1 ? .5 : draw === 2 ? (sample + .5) / 1000 : .999);
      if (rankRoll.bonusSkillId) skills++;
      draw = 0;
      const namedRoll = rpgCreateLoot('moonstaff', tier, () => ++draw === 1 ? .5 : draw === 3 ? (sample + .5) / 1000 : .999);
      if (namedRoll.bonusSpellId) named++;
      expect(rankRoll.bonusPower).toBeGreaterThan(0); expect(namedRoll.bonusPower).toBeGreaterThan(0);
    }
    expect(skills).toBe(expectedSkills); expect(named).toBe(expectedNamed);
  }
});

test('every valid equipped skill bonus grants its associated ability and effects immediately, never tree ownership', () => {
  for (const skill of RPG_SKILLS) {
    const state = rpgNormalizeLoot({ ...oldSave, skills: {}, equippedItemId: 'apprentice', selectedSpellId: skill.spellId });
    const copy: RpgLootInstance = { id: 'temporary', itemId: 'apprentice', bonusPower: 0, upgradeLevel: 0, bonusSkillId: skill.id, bonusSkillRanks: 1 };
    state.loot!.push(copy); state.equippedLootId = copy.id;
    const saved = JSON.stringify(state);
    expect(rpgLootSkillBonus(copy)).toEqual({ skillId: skill.id, ranks: 1 });
    expect(rpgEffectiveSkills(state)[skill.id]).toBe(1);
    expect(rpgSpellAvailable(state)).toBe(true);
    if (skill.effect) expect(rpgSpellModifiers(state)).toContain(skill.effect);
    expect(state.skills).toEqual({}); expect(JSON.stringify(state)).toBe(saved);
    state.equippedLootId = 'legacy:apprentice';
    expect(rpgEffectiveSkills(state)[skill.id]).toBe(0);
    expect(rpgSpellAvailable(state)).toBe(rpgSpellUnlocked(skill.spellId, state.skills));
    expect(rpgSpellModifiers(state)).toEqual([]);
  }
});

test('saved Overcharge works immediately for Tempest only while its exact copy is equipped', () => {
  const state = rpgNormalizeLoot({ ...oldSave, skills: {}, equippedItemId: 'skybreaker', selectedSpellId: 'tempest', inventory: ['apprentice', 'skybreaker'] });
  const copy: RpgLootInstance = { id: 'old-overcharge', itemId: 'skybreaker', bonusPower: 2, upgradeLevel: 3, bonusSkillId: 'tempest_overcharge', bonusSkillRanks: 1, bonusTargets: 1 };
  state.loot!.push(copy); state.equippedLootId = copy.id;
  const saved = JSON.stringify(state), permanentBefore = { ...state.skills };
  const baseline = { ...state, loot: state.loot!.map(item => item.id === copy.id ? { ...item, bonusSkillId: undefined, bonusSkillRanks: undefined } : item) };
  expect(rpgSpellAvailable(state, 'tempest')).toBe(true); expect(rpgSpellAvailable(state, 'arc_lance')).toBe(false);
  expect(rpgSpellCombatStats(state).damage - rpgSpellCombatStats(baseline).damage).toBe(4);
  expect(rpgSpellCombatStats(state).targets).toBe(10); expect(rpgSpellModifiers(state)).toEqual(['chain']);
  expect(rpgNormalizeLoot(state).loot!.find(item => item.id === copy.id)).toEqual(copy);
  expect(state.skills).toEqual(permanentBefore); expect(JSON.stringify(state)).toBe(saved);
  state.equippedLootId = 'legacy:skybreaker';
  expect(rpgSpellAvailable(state, 'tempest')).toBe(false); expect(rpgSpellModifiers(state)).toEqual([]);
  expect(rpgLootSkillBonus({ ...copy, bonusSkillRanks: 99 })).toEqual({ skillId: 'tempest_overcharge', ranks: 2 });
  for (const value of [0, -1, NaN, Infinity]) expect(rpgLootSkillBonus({ ...copy, bonusSkillRanks: value })).toBeUndefined();
  expect(rpgLootSkillBonus({ ...copy, bonusSkillId: 'fake' })).toBeUndefined();
  expect(rpgLootSkillBonus({ ...copy, itemId: 'fake' })).toBeUndefined();
});
