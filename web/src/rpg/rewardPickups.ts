import type { RpgChestReward, RpgItem, RpgReward } from '@institute/shared';
import { DUST_COLOR, RARITY_COLORS, XP_COLOR, type RewardToken } from './world/floorLoot';

/** What a chest paid, as things that burst out of it and fly to the hero:
 * XP first, then forge dust, then a relic last as the best part. */
export function chestRewardTokens(reward: RpgChestReward): RewardToken[] {
  const tokens: RewardToken[] = [];
  if (reward.xp > 0) tokens.push({ kind: 'xp', label: `+${reward.xp} XP`, color: XP_COLOR, amount: reward.xp });
  if (reward.forgeDust > 0) tokens.push({ kind: 'dust', label: `+${reward.forgeDust} forge dust`, color: DUST_COLOR, amount: reward.forgeDust });
  const item = reward.item;
  if (item && (reward.loot || !reward.duplicateItem)) tokens.push(relicToken(item));
  // Armour and jewellery fall out the same way as a relic.
  if (reward.gear) tokens.push({ kind: 'relic', label: reward.gear.name, color: RARITY_COLORS[reward.gear.rarity] ?? RARITY_COLORS.rare!, rarity: reward.gear.rarity, baseId: reward.gear.baseId, gearKind: reward.gear.kind });
  return tokens;
}

/** A relic as a floor pickup: its name in its rarity colour, with its art on the label. */
export function relicToken(item: Pick<RpgItem, 'id' | 'name' | 'rarity'>): RewardToken {
  return { kind: 'relic', label: item.name, color: RARITY_COLORS[item.rarity] ?? RARITY_COLORS.rare!, rarity: item.rarity, itemId: item.id };
}

/** The relic a pack, a champion or the guardian dropped, if it is new or a fresh roll.
 * It is already saved in the equipment; this only shows it falling and flying to the hero. */
export function monsterRelicToken(reward: Pick<RpgReward, 'item' | 'loot' | 'duplicateItem'>): RewardToken | undefined {
  return reward.item && (reward.loot || !reward.duplicateItem) ? relicToken(reward.item) : undefined;
}

/** The lowest stack row no live pickup label uses, so labels never overlap. */
export function freeLabelSlot(taken: readonly number[]): number {
  let slot = 0;
  while (taken.includes(slot)) slot++;
  return slot;
}

export const cssColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
