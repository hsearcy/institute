import type { RpgChestReward } from '@institute/shared';
import { DUST_COLOR, RARITY_COLORS, XP_COLOR, type RewardToken } from './world/floorLoot';

/** What a chest paid, as things that burst out of it and fly to the hero:
 * XP first, then forge dust, then a relic last as the best part. */
export function chestRewardTokens(reward: RpgChestReward): RewardToken[] {
  const tokens: RewardToken[] = [];
  if (reward.xp > 0) tokens.push({ kind: 'xp', label: `+${reward.xp} XP`, color: XP_COLOR, amount: reward.xp });
  if (reward.forgeDust > 0) tokens.push({ kind: 'dust', label: `+${reward.forgeDust} forge dust`, color: DUST_COLOR, amount: reward.forgeDust });
  const item = reward.item;
  if (item && (reward.loot || !reward.duplicateItem)) tokens.push({ kind: 'relic', label: item.name, color: RARITY_COLORS[item.rarity] ?? RARITY_COLORS.rare!, rarity: item.rarity });
  return tokens;
}

/** The lowest stack row no live pickup label uses, so labels never overlap. */
export function freeLabelSlot(taken: readonly number[]): number {
  let slot = 0;
  while (taken.includes(slot)) slot++;
  return slot;
}

export const cssColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
