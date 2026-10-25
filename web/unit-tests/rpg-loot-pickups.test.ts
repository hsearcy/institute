import { expect, test } from 'bun:test';
import { Texture, Vector3 } from 'three';
import type { RpgChestReward, RpgItem } from '@institute/shared';
import { chestRewardTokens, cssColor, freeLabelSlot } from '../src/rpg/rewardPickups';
import { FloorLoot, RARITY_COLORS } from '../src/rpg/world/floorLoot';
import { HELP_GUARD_MS, HelpGuard } from '../src/rpg/helpGuard';

const relic = { id: 'ember-ring', name: 'Ember Ring', rarity: 'epic' } as RpgItem;
const base: RpgChestReward = { chestId: 'chest-1', xp: 16, forgeDust: 8, levelUp: false, levelsGained: 0, item: null, newItems: [], duplicateItem: false, tier: 1 };

test('a chest pays out as XP, then dust, then a relic last', () => {
  const tokens = chestRewardTokens({ ...base, item: relic, newItems: [relic] });
  expect(tokens.map(token => token.kind)).toEqual(['xp', 'dust', 'relic']);
  expect(tokens.map(token => token.label)).toEqual(['+16 XP', '+8 forge dust', 'Ember Ring']);
  expect(tokens[2]!.color).toBe(RARITY_COLORS.epic!);
  expect(tokens[0]!.amount).toBe(16);
});

test('an empty chest and a duplicate relic drop nothing extra', () => {
  expect(chestRewardTokens({ ...base, xp: 0, forgeDust: 0 })).toEqual([]);
  expect(chestRewardTokens({ ...base, item: relic, duplicateItem: true }).map(token => token.kind)).toEqual(['xp', 'dust']);
});

test('pickup labels take the lowest free row', () => {
  expect(freeLabelSlot([])).toBe(0);
  expect(freeLabelSlot([0, 1])).toBe(2);
  expect(freeLabelSlot([1, 2])).toBe(0);
  expect(cssColor(0x00ff8a)).toBe('#00ff8a');
});

test('the help guard holds for two seconds and never overrides busy', () => {
  const guard = new HelpGuard();
  expect(guard.disables(false, 0)).toBe(false);
  guard.arm(1000);
  expect(guard.disables(false, 1000 + HELP_GUARD_MS - 1)).toBe(true);
  expect(guard.remaining(1500)).toBe(HELP_GUARD_MS - 500);
  expect(guard.disables(false, 1000 + HELP_GUARD_MS)).toBe(false);
  expect(guard.disables(true, 1000 + HELP_GUARD_MS)).toBe(true);
  guard.arm(5000); guard.clear();
  expect(guard.active(5001)).toBe(false);
});

test('chest treasures rest on the floor a moment, then fly to the hero on their own', () => {
  const loot = new FloorLoot(new Texture()), hero = new Vector3(3, 0, 0);
  const open = (x: number, z: number) => Math.hypot(x, z) < 6;
  loot.dropRewards(new Vector3(0, .7, 0), chestRewardTokens({ ...base, item: relic, newItems: [relic] }), 0);
  const picked: { kind?: string; t: number }[] = [];
  // The hero is not free to walk (a problem may be up): chest treasure still reaches him.
  for (let t = 0; t < 4; t += 1 / 60) for (const pickup of loot.update(1 / 60, t, hero, false, open)) picked.push({ kind: pickup.reward?.kind, t });
  expect(picked.map(pickup => pickup.kind)).toEqual(['xp', 'dust', 'relic']);
  // Visible on the floor first, then collected quickly.
  expect(picked[0]!.t).toBeGreaterThan(1.2);
  expect(picked[2]!.t).toBeLessThan(3);
  expect(loot.rewardsPending).toBe(0);
  loot.dispose();
});

test('gear found in a chest falls out as its own pickup', async () => {
  const { chestRewardTokens } = await import('../src/rpg/rewardPickups');
  const tokens = chestRewardTokens({ chestId: 'c', xp: 16, forgeDust: 8, levelUp: false, levelsGained: 0, item: null, newItems: [], duplicateItem: false, tier: 1,
    gear: { id: 'g', baseId: 'soft_boots', kind: 'boots', rarity: 'epic', tier: 1, name: 'Swift Soft Boots', stats: { speed: 5 } } } as never);
  expect(tokens.map(token => token.label)).toEqual(['+16 XP', '+8 forge dust', 'Swift Soft Boots']);
});
