import { expect, test } from 'bun:test';
import { skillUpgradePreview } from '../src/rpg/skillPreview';

test('an already capped spell with its relic modifier does not promise another benefit', () => {
  const state = { selectedSpellId: 'firestorm' as const, equippedItemId: 'inferno', skills: { ember_power: 3, ember_echo: 1, ember_master: 2, meteor: 1, firestorm: 1 } };
  const original = JSON.stringify(state);
  const [preview] = skillUpgradePreview(state, 'firestorm_inferno', 0)!;
  expect(preview.before).toBe(48); expect(preview.after).toBe(48);
  expect(preview.extraTargets).toBe(0); expect(preview.newModifiers).toEqual([]);
  expect(preview.existingModifier).toBe(true);
  expect(JSON.stringify(state)).toBe(original);
});

test('preview reports partial target gain at the cap and benefits for other learned spells', () => {
  const state = { selectedSpellId: 'firestorm' as const, equippedItemId: 'moonstaff', skills: { ember_power: 2, ember_echo: 1, ember_master: 1, meteor: 1, firestorm: 1, firestorm_inferno: 1, frost: 1 } };
  const previews = skillUpgradePreview(state, 'ember_power', 3)!;
  const firestorm = previews.find(preview => preview.spell.id === 'firestorm')!;
  expect(firestorm.before).toBe(47); expect(firestorm.after).toBe(48); expect(firestorm.extraTargets).toBe(1);
  expect(previews.find(preview => preview.spell.id === 'ember')!.extraTargets).toBe(2);
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
