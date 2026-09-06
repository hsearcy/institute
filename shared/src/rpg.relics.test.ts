import { expect, test } from 'bun:test';
import { RPG_ITEMS, RPG_REGIONS, rpgNextRelicHunt, rpgRelicDrop, type RpgState } from './rpg';

const state = (overrides: Partial<RpgState> = {}): RpgState => ({
  profileId: 'hunt-test', xp: 0, level: 1, xpIntoLevel: 0, xpForNextLevel: 90, skillPoints: 0,
  skills: {}, inventory: ['apprentice', 'cinderwand'], equippedItemId: 'apprentice', selectedSpellId: 'ember', appearanceId: 'wayfarer',
  totalKills: 100, expeditionsCompleted: 3, expedition: null, ...overrides,
});

test('The first reward remains Cinderbranch and destinations offer different attainable relics', () => {
  const fresh = state({ totalKills: 0, expeditionsCompleted: 0, inventory: ['apprentice'] });
  expect(rpgNextRelicHunt(fresh, 'embercrypt')).toEqual({ regionId: 'embercrypt', itemId: 'cinderwand', encounterIndex: 0, regional: true, duplicate: false });
  expect(rpgNextRelicHunt(fresh, 'frostvault')).toBeNull();
  expect(rpgNextRelicHunt(fresh, 'stormspire')).toBeNull();
  for (const [region, item] of [['embercrypt', 'cleaver'], ['frostvault', 'glacier'], ['stormspire', 'thunderrod']]) {
    expect(rpgNextRelicHunt(state(), region)).toEqual({ regionId: region, itemId: item, encounterIndex: 2, regional: true, duplicate: false });
    expect(rpgRelicDrop(state(), region, 2)?.id).toBe(item);
  }
});

test('Regional pools fall back to universal then other schools before any repeat', () => {
  const flameOwned = RPG_ITEMS.filter(item => item.school === 'ember').map(item => item.id);
  const progress = state({ inventory: ['apprentice', ...flameOwned] });
  expect(rpgRelicDrop(progress, 'embercrypt', 2)?.id).toBe('moonstaff');
  progress.inventory.push('moonstaff');
  expect(rpgRelicDrop(progress, 'embercrypt', 2)?.id).toBe('glacier');
  expect(rpgNextRelicHunt(progress, 'embercrypt')).toMatchObject({ itemId: 'glacier', regional: false, duplicate: false });
  for (let clears = 0; clears <= 6; clears++) for (const region of RPG_REGIONS) for (const room of [2, 5]) {
    const eligible = RPG_ITEMS.filter(item => item.id !== 'apprentice' && item.requiredClears <= clears && (room === 5 || item.rarity !== 'legendary'));
    for (const missing of eligible) {
      const inventory = RPG_ITEMS.filter(item => item.id !== missing.id).map(item => item.id);
      expect(rpgRelicDrop(state({ inventory, expeditionsCompleted: clears }), region.id, room)?.id).toBe(missing.id);
    }
  }
});

test('Forecasts skip an intervening duplicate when the boss has a new relic, preserving gates', () => {
  const allNonLegendary = RPG_ITEMS.filter(item => item.rarity !== 'legendary').map(item => item.id);
  const progress = state({ expeditionsCompleted: 5, inventory: allNonLegendary });
  const roomDrop = rpgRelicDrop(progress, 'embercrypt', 2)!;
  expect(progress.inventory).toContain(roomDrop.id);
  expect(rpgNextRelicHunt(progress, 'embercrypt')).toMatchObject({ itemId: 'phoenix', encounterIndex: 5, duplicate: false });
  const missingInferno = RPG_ITEMS.filter(item => item.id !== 'inferno').map(item => item.id);
  expect(rpgNextRelicHunt(state({ inventory: missingInferno, expeditionsCompleted: 4 }), 'embercrypt')?.duplicate).toBe(true);
  expect(rpgNextRelicHunt(state({ inventory: missingInferno, expeditionsCompleted: 5 }), 'embercrypt')).toMatchObject({ itemId: 'inferno', encounterIndex: 5, duplicate: false });
  for (const region of RPG_REGIONS) for (let clears = 0; clears < 6; clears++) for (let room = 0; room < 6; room++) {
    const item = rpgRelicDrop(state({ expeditionsCompleted: clears }), region.id, room);
    if (![2, 5].includes(room)) expect(item).toBeNull();
    if (item) {
      expect(item.requiredClears).toBeLessThanOrEqual(clears);
      if (room !== 5) expect(item.rarity).not.toBe('legendary');
    }
  }
});

test('Resumed and completed expeditions forecast the proper room without mutating save state', () => {
  const progress = state({ expedition: { id: 'saved', regionId: 'frostvault', encounterIndex: 4, encountersTotal: 6, cleared: false, startedAt: 1 } });
  const before = structuredClone(progress);
  expect(rpgNextRelicHunt(progress, 'frostvault')).toMatchObject({ itemId: 'glacier', encounterIndex: 5 });
  expect(rpgNextRelicHunt(progress, 'embercrypt')).toMatchObject({ itemId: 'cleaver', encounterIndex: 2 });
  expect(progress).toEqual(before);
  progress.expedition!.cleared = true;
  expect(rpgNextRelicHunt(progress, 'frostvault')).toMatchObject({ itemId: 'glacier', encounterIndex: 2 });
  const complete = state({ inventory: RPG_ITEMS.map(item => item.id), expeditionsCompleted: 8 });
  const hunt = rpgNextRelicHunt(complete, 'stormspire')!;
  expect(hunt).toMatchObject({ encounterIndex: 2, duplicate: true });
  expect(rpgRelicDrop(complete, 'stormspire', 2)?.id).toBe(hunt.itemId);
  expect(rpgNextRelicHunt(progress, 'missing-region')).toBeNull();
  for (const room of [-1, .5, 6, NaN]) expect(rpgRelicDrop(progress, 'embercrypt', room)).toBeNull();
});
