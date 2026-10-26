import { RPG_ITEMS, type RpgItem, type RpgLootInstance, type RpgState } from './rpg';

export interface RpgMerchantOffer {
  itemId: string;
  price: number;
  owned: boolean;
  requiredClears: number;
  available: boolean;
}
export interface RpgCampState {
  gems: number;
  forgeDust: number;
  offers: RpgMerchantOffer[];
}
export interface RpgEconomyResult {
  state: RpgState;
  gems: number;
  forgeDust: number;
  duplicate: boolean;
  lootId?: string;
  gearId?: string;
  dustGained?: number;
}

/** Named purchases have fixed prices and no rolled bonuses. Legendary gear
 * remains dungeon treasure; the free starter is never sold. */
export function rpgMerchantPrice(item: RpgItem): number | null {
  if (item.id === 'apprentice' || item.rarity === 'legendary') return null;
  return item.rarity === 'epic' ? 180 + item.requiredClears * 80 : 80 + item.requiredClears * 40;
}

export function rpgCampOffers(state: Pick<RpgState, 'inventory' | 'expeditionsCompleted'>): RpgMerchantOffer[] {
  return RPG_ITEMS.flatMap(item => {
    const price = rpgMerchantPrice(item);
    if (price === null) return [];
    const owned = state.inventory.includes(item.id);
    return [{ itemId: item.id, price, owned, requiredClears: item.requiredClears,
      available: !owned && state.expeditionsCompleted >= item.requiredClears }];
  });
}

/** Salvaging refunds a portion of invested dust, never gems. Each retained
 * collection item stays usable, so salvaging cannot undo a collection unlock. */
export function rpgSalvageValue(loot: RpgLootInstance): number {
  const rarity = RPG_ITEMS.find(item => item.id === loot.itemId)?.rarity;
  const base = rarity === 'legendary' ? 12 : rarity === 'epic' ? 8 : rarity === 'rare' ? 5 : 2;
  return base + Math.max(0, loot.bonusPower) + Math.floor(Math.max(0, loot.upgradeLevel) * (loot.upgradeLevel + 1));
}
