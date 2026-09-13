import { rpgEquippedLoot, rpgForgeCost, RPG_MAX_ITEM_UPGRADE, type RpgState } from '@institute/shared';

type ForgeLoadout = Pick<RpgState, 'loot' | 'equippedItemId' | 'equippedLootId' | 'forgeDust'>;

/** Use the same copy, rank limit, and prices as the blacksmith. */
export function equippedForgeReady(state: ForgeLoadout, gems?: number): boolean {
  const copy = rpgEquippedLoot(state);
  if (!copy || copy.upgradeLevel >= RPG_MAX_ITEM_UPGRADE || gems === undefined || !Number.isFinite(gems)) return false;
  const cost = rpgForgeCost(copy);
  return gems >= cost.gems && (state.forgeDust ?? 0) >= cost.dust;
}
