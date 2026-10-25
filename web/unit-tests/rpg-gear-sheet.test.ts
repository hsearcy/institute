import { expect, test } from 'bun:test';
import { rpgNormalizeLoot, rpgGearSalvageValue, RPG_GEAR_BASES, type RpgGearInstance, type RpgState } from '@institute/shared';
import { renderGearSheet, gearComparison, gearStatLines, gearBag, emptyGearUi, gearSlotsFor } from '../src/rpg/gearView';
import { gearArt, WORN_ONLY, wornGearUrl } from '../src/rpg/icons';
import { renderEquipmentView } from '../src/rpg/equipmentView';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const gear = (id: string, baseId: string, kind: RpgGearInstance['kind'], rarity: RpgGearInstance['rarity'], stats: RpgGearInstance['stats'], tier = 2): RpgGearInstance =>
  ({ id, baseId, kind, rarity, tier, name: `${rarity} ${baseId}`, stats });

function fixture(): RpgState {
  const state = rpgNormalizeLoot({ profileId: 'test', xp: 90, level: 2, xpIntoLevel: 0, xpForNextLevel: 110, skillPoints: 0, skills: {}, inventory: ['apprentice'], equippedItemId: 'apprentice', selectedSpellId: 'ember', appearanceId: 'wayfarer', totalKills: 20, expeditionsCompleted: 1, expedition: null, forgeDust: 10, bestTier: 1, dungeonTier: 1 } as RpgState);
  state.gear = [
    gear('h1', 'iron_helm', 'helm', 'rare', { ward: 14, power: 1 }),
    gear('r1', 'copper_ring', 'ring', 'common', { dustFind: 5 }),
    gear('h2', 'leather_cap', 'helm', 'epic', { ward: 20, frost: 2 }),
    gear('b1', 'windstep_boots', 'boots', 'legendary', { speed: 12 }, 5),
  ];
  state.equippedGear = { helm: 'h1', ring2: 'r1' };
  return state;
}

test('Every gear base has its exact model and icon installed', () => {
  for (const base of RPG_GEAR_BASES) {
    expect(existsSync(join(import.meta.dir, '../public/assets/rpg/gear', `${base.id}.webp`))).toBe(true);
    // Pants exist only as worn pieces; everything else also has a free-standing model.
    if (WORN_ONLY.has(base.id)) expect(existsSync(join(import.meta.dir, '../public', wornGearUrl(base.id)!))).toBe(true);
    else expect(existsSync(join(import.meta.dir, '../public/assets/rpg/gear', `${base.id}.glb`))).toBe(true);
    expect(gearArt(base.id)).toContain(`/assets/rpg/gear/${base.id}.webp`);
  }
});

test('Paper doll shows every slot, the relic, worn gear and ward totals', () => {
  const html = renderGearSheet(fixture(), emptyGearUi());
  for (const slot of ['helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring1', 'ring2']) expect(html).toContain(`data-gear-slot="${slot}"`);
  expect(html).toContain('href="#rpg-relic-collection"');
  expect(html).toContain('/assets/rpg/appearances/wayfarer.png');
  expect(html).toContain('rpg-doll-slot rare');
  expect(html).toContain('/assets/rpg/gear/iron_helm.webp');
  expect(html).toContain('<strong>114</strong>'); // 100 + 14 ward
  expect(html).toContain('+1 damage to every attack');
  expect(html).toContain('+5% forge dust found');
  expect(html).not.toMatch(/hard|tricky|scary/i);
});

test('Bag lists only unworn gear, newest first, with filters and new badges', () => {
  const state = fixture();
  expect(gearBag(state).map(item => item.id)).toEqual(['b1', 'h2']);
  expect(gearBag(state, 'helm').map(item => item.id)).toEqual(['h2']);
  const html = renderGearSheet(state, { ...emptyGearUi(), seen: new Set(['h2']) });
  expect(html.match(/class="rpg-gear-new"/g)).toHaveLength(1);
  expect(html).toContain('data-gear-filter="ring" aria-pressed="false">Rings<span>0</span>');
  expect(renderGearSheet(state, { ...emptyGearUi(), filter: 'amulet' })).toContain('Nothing of this kind in your bag yet.');
});

test('Details card compares with the worn item and offers equip and salvage', () => {
  const state = fixture();
  const html = renderGearSheet(state, { ...emptyGearUi(), selectedId: 'h2' });
  expect(html).toContain('<li>+20 ward</li>');
  expect(html).toContain('<li class="up"><span aria-hidden="true">▲</span>+6 ward</li>');
  expect(html).toContain('<li class="down"><span aria-hidden="true">▼</span>−1 damage to every attack</li>');
  expect(html).toContain('data-gear-equip="h2" data-slot="helm"');
  expect(html).toContain(`Turn into ${rpgGearSalvageValue(state.gear![2]!)} forge dust`);
  expect(html).toContain('data-gear-viewer="leather_cap"');
  const confirm = renderGearSheet(state, { ...emptyGearUi(), selectedId: 'h2', confirmSalvage: true });
  expect(confirm).toContain('data-gear-salvage-confirm="h2"');
  expect(confirm).toContain('Keep it');
});

test('Rings choose a hand; worn items offer take-off', () => {
  const state = fixture();
  state.gear!.push(gear('r2', 'moon_signet', 'ring', 'rare', { power: 1 }));
  const ring = renderGearSheet(state, { ...emptyGearUi(), selectedId: 'r2' });
  expect(ring).toContain('Wear on left hand'); expect(ring).toContain('Wear on right hand');
  expect(ring).toContain('Left ring is empty');
  expect(gearSlotsFor('ring')).toEqual(['ring1', 'ring2']);
  const worn = renderGearSheet(state, { ...emptyGearUi(), selectedId: 'h1' });
  expect(worn).toContain('data-gear-unequip="helm"');
  expect(worn).not.toContain('data-gear-salvage=');
});

test('Stat lines and comparisons use child-friendly labels', () => {
  expect(gearStatLines({ speed: 5, ward: 3 }).map(line => line.text)).toEqual(['+3 ward', '+5% run speed']);
  expect(gearComparison(gear('x', 'soft_boots', 'boots', 'common', { speed: 4 })).map(line => line.direction)).toEqual(['up']);
  expect(gearComparison(gear('x', 'soft_boots', 'boots', 'common', { speed: 4 }), gear('y', 'soft_boots', 'boots', 'common', { speed: 4 }))[0]!.text).toBe('Same run speed');
});

test('Equipment dialog puts the character sheet above the relics', () => {
  const html = renderEquipmentView(fixture(), renderGearSheet(fixture(), emptyGearUi()), false);
  expect(html.indexOf('rpg-gear-sheet')).toBeLessThan(html.indexOf('id="rpg-relic-collection"'));
});
