import { expect, test } from 'bun:test';
import { rpgNormalizeLoot, type RpgState } from '@institute/shared';
import { renderSpellbookView } from '../src/rpg/spellbookView';

test('spellbook distinguishes a usable relic spell from a permanently learned spell', () => {
  const state = rpgNormalizeLoot({ profileId: 'test', xp: 0, level: 1, xpIntoLevel: 0, xpForNextLevel: 90, skillPoints: 0,
    skills: {}, inventory: ['apprentice', 'tempest'], equippedItemId: 'tempest', selectedSpellId: 'tempest',
    appearanceId: 'wayfarer', totalKills: 0, expeditionsCompleted: 0, expedition: null } as RpgState);
  state.loot!.find(copy => copy.id === state.equippedLootId)!.bonusSkillId = 'tempest_overcharge';
  state.loot!.find(copy => copy.id === state.equippedLootId)!.bonusSkillRanks = 1;
  const before = JSON.stringify(state);
  const view = () => renderSpellbookView({ state, school: 'storm', trackedSpell: null, playing: false });
  expect(view()).toContain('Selected · From relic');
  expect(view()).toContain('From relic · available while equipped.');
  expect(view()).toContain('2 / 15 learned · 1 from relic');
  expect(view()).toContain('0 / 5 learned');
  expect(JSON.stringify(state)).toBe(before);
  state.equippedItemId = 'apprentice'; state.equippedLootId = 'legacy:apprentice'; state.selectedSpellId = 'cleave';
  expect(view()).not.toContain('From relic');
  expect(view()).toContain('Level 10 · Track spell');
  state.skills.tempest = 1; state.selectedSpellId = 'tempest';
  expect(view()).not.toContain('From relic');
  expect(view()).toContain('3 / 15 learned');
});
