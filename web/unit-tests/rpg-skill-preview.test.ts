import { expect, test } from 'bun:test';
import { skillUpgradePreview } from '../src/rpg/skillPreview';

test('capped coverage still shows the damage upgrade without promising a duplicate effect', () => {
  const state = { selectedSpellId: 'firestorm' as const, equippedItemId: 'inferno', skills: { ember_power: 3, ember_echo: 1, ember_master: 2, meteor: 1, firestorm: 1 } };
  const original = JSON.stringify(state);
  const [preview] = skillUpgradePreview(state, 'firestorm_inferno', 0)!;
  expect(preview.before).toBe(10); expect(preview.after).toBe(10);
  expect(preview.beforeDamage).toBe(49); expect(preview.afterDamage).toBe(53); expect(preview.extraDamage).toBe(4);
  expect(preview.extraTargets).toBe(0); expect(preview.newModifiers).toEqual([]);
  expect(preview.existingModifier).toBe(true);
  expect(JSON.stringify(state)).toBe(original);
});

test('school power improves damage for matching learned spells while respecting the target cap', () => {
  const state = { selectedSpellId: 'firestorm' as const, equippedItemId: 'moonstaff', skills: { ember_power: 2, ember_echo: 1, ember_master: 1, meteor: 1, firestorm: 1, firestorm_inferno: 1, frost: 1 } };
  const previews = skillUpgradePreview(state, 'ember_power', 3)!;
  const firestorm = previews.find(preview => preview.spell.id === 'firestorm')!;
  expect(firestorm.before).toBe(10); expect(firestorm.after).toBe(10); expect(firestorm.extraTargets).toBe(0);
  expect(firestorm.extraDamage).toBe(2);
  expect(previews.find(preview => preview.spell.id === 'ember')!.extraDamage).toBe(2);
  expect(previews.every(preview => preview.after <= 10 && preview.after >= preview.before)).toBe(true);
  expect(previews.some(preview => preview.spell.id === 'frost')).toBe(false);
});

test('a new effect remains a real upgrade at the target cap; maxed and unknown ranks have no preview', () => {
  const state = { selectedSpellId: 'firestorm' as const, equippedItemId: 'moonstaff', skills: { ember_power: 3, ember_echo: 1, ember_master: 2, meteor: 1, firestorm: 1 } };
  const [preview] = skillUpgradePreview(state, 'firestorm_inferno', 5)!;
  expect(preview.extraTargets).toBe(0); expect(preview.newModifiers).toEqual(['burn']);
  expect(preview.existingModifier).toBe(false);
  expect(skillUpgradePreview(state, 'ember_power', 5)).toBeNull();
  expect(skillUpgradePreview(state, 'unknown', 5)).toBeNull();
});
