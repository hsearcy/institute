import { expect, test } from 'bun:test';
import { RPG_APPEARANCES, RPG_APPEARANCE_IDS, rpgAppearanceUnlocked, rpgLevel } from './rpg';

test('Appearance milestones have explicit assets and unlock at the existing level boundary', () => {
  expect(RPG_APPEARANCES.map(entry => entry.id)).toEqual([...RPG_APPEARANCE_IDS]);
  expect(RPG_APPEARANCES.map(entry => entry.modelId)).toEqual(['hero', 'hero-cinder', 'hero-glacier', 'hero-tempest']);
  expect(RPG_APPEARANCES.map(entry => entry.requiredLevel)).toEqual([1, 12, 15, 18]);
  for (const appearance of RPG_APPEARANCES) {
    const threshold = Array.from({ length: appearance.requiredLevel - 1 }, (_, index) => 90 + index * 45).reduce((sum, xp) => sum + xp, 0);
    expect(rpgAppearanceUnlocked(appearance.id, rpgLevel(threshold).level)).toBe(true);
    if (threshold) expect(rpgAppearanceUnlocked(appearance.id, rpgLevel(threshold - 1).level)).toBe(false);
    if (appearance.id === 'wayfarer') expect(appearance.thumbnail).toBeNull();
    else expect(appearance.thumbnail).toBe(`/assets/rpg/appearances/${appearance.id}.png`);
  }
});

test('Unknown appearances and invalid levels never unlock', () => {
  for (const id of ['', 'hero-tempest', 'legendary', '__proto__']) expect(rpgAppearanceUnlocked(id, 99)).toBe(false);
  for (const level of [0, -1, NaN, Infinity]) expect(rpgAppearanceUnlocked('wayfarer', level)).toBe(false);
});
