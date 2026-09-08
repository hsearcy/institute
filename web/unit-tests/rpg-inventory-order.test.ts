import { expect, test } from 'bun:test';
import { rpgNormalizeLoot, type RpgState } from '@institute/shared';
import { renderEquipmentView } from '../src/rpg/equipmentView';
import { collectionLootChoice, newestLoot, renderLootCards } from '../src/rpg/campView';

function fixture(): RpgState {
  return rpgNormalizeLoot({ profileId: 'test', xp: 0, level: 1, xpIntoLevel: 0, xpForNextLevel: 90, skillPoints: 0,
    skills: {}, inventory: ['apprentice', 'cinderwand', 'moonstaff'], equippedItemId: 'cinderwand', selectedSpellId: 'cleave',
    appearanceId: 'wayfarer', totalKills: 0, expeditionsCompleted: 0, expedition: null,
    loot: [{ id: 'old-powerful', itemId: 'cinderwand', bonusPower: 12, upgradeLevel: 5 },
      { id: 'middle', itemId: 'moonstaff', bonusPower: 4, upgradeLevel: 0 },
      { id: 'new-weak-copy', itemId: 'cinderwand', bonusPower: 1, upgradeLevel: 0 }], equippedLootId: 'old-powerful',
  });
}

test('newest finds lead even when weaker or unequipped, and later migration placeholders stay last', () => {
  const state = fixture(), before = JSON.stringify(state);
  expect(state.loot!.at(-1)!.id).toBe('legacy:apprentice');
  expect(newestLoot(state).map(copy => copy.id)).toEqual(['new-weak-copy', 'middle', 'old-powerful', 'legacy:apprentice']);
  for (const forge of [false, true]) {
    const html = renderLootCards(state, 1000, forge);
    expect([...html.matchAll(/data-loot-card="([^"]+)"/g)].map(match => match[1])).toEqual(['new-weak-copy', 'middle', 'old-powerful', 'legacy:apprentice']);
  }
  expect(collectionLootChoice(state, 'cinderwand')?.id).toBe('old-powerful');
  expect(JSON.stringify(state)).toBe(before);
});

test('the main equipment grid shows each exact copy once, newest first, without changing the equipped copy', () => {
  const state = fixture(), before = JSON.stringify(state);
  const html = renderEquipmentView(state, '', false);
  expect([...html.matchAll(/data-loot-equip="([^"]+)"/g)].map(match => match[1])).toEqual(['new-weak-copy', 'middle', 'old-powerful', 'legacy:apprentice']);
  expect(html).not.toContain('Your individual copies');
  expect(html).not.toContain('rpg-loot-collection');
  const selected = html.match(/<button[^>]*data-loot-equip="old-powerful"[^>]*>/)![0];
  expect(selected).toContain('aria-pressed="true"');
  const newest = html.match(/<button[^>]*data-loot-equip="new-weak-copy"[^>]*>/)![0];
  expect(newest).toContain('aria-pressed="false"');
  expect(state.equippedLootId).toBe('old-powerful');
  expect(JSON.stringify(state)).toBe(before);
});

test('missing loot returns an empty ordering until legacy normalization supplies its original copies', () => {
  const state = fixture(); delete state.loot;
  const before = JSON.stringify(state);
  expect(newestLoot(state)).toEqual([]);
  expect(newestLoot(rpgNormalizeLoot(state)).map(copy => copy.id)).toEqual(['legacy:moonstaff', 'legacy:cinderwand', 'legacy:apprentice']);
  expect(JSON.stringify(state)).toBe(before);
});
