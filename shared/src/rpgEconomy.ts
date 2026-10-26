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

/** How a glow's motes move: embers rise, frost drifts, storm sparks jump, stars twinkle. */
export type RpgGlowMotion = 'rise' | 'drift' | 'spark' | 'twinkle' | 'swirl';
export interface RpgWeaponGlow { id: string; name: string; blurb: string; color: string; price: number; requiredClears: number; motion: RpgGlowMotion; rainbow?: boolean }

/** A ladder of enchantments for the held weapon, bought with gems. Prices climb,
 * so there is always a next one to save for; each one owned can be worn again freely. */
export const RPG_WEAPON_GLOWS: readonly RpgWeaponGlow[] = [
  { id: 'ember', name: 'Ember Glow', blurb: 'Warm sparks drift up from your weapon.', color: '#ff8a3d', price: 60, requiredClears: 0, motion: 'rise' },
  { id: 'frost', name: 'Frost Shimmer', blurb: 'Snowflakes sparkle around the blade.', color: '#7fe4ff', price: 90, requiredClears: 0, motion: 'drift' },
  { id: 'storm', name: 'Storm Spark', blurb: 'Little bolts jump along the edge.', color: '#a3afff', price: 120, requiredClears: 0, motion: 'spark' },
  { id: 'forest', name: 'Forest Glow', blurb: 'Green light like fireflies in the woods.', color: '#7dea8a', price: 160, requiredClears: 1, motion: 'drift' },
  { id: 'moon', name: 'Moonbeam', blurb: 'A cool silver shine, bright as the moon.', color: '#dfe7ff', price: 200, requiredClears: 1, motion: 'twinkle' },
  { id: 'royal', name: 'Royal Violet', blurb: 'A deep purple glow fit for a king.', color: '#c27dff', price: 260, requiredClears: 2, motion: 'swirl' },
  { id: 'sunfire', name: 'Sunfire', blurb: 'Blazing gold flames lick the blade.', color: '#ffc531', price: 330, requiredClears: 2, motion: 'rise' },
  { id: 'starlight', name: 'Starlight', blurb: 'Tiny stars twinkle all around it.', color: '#fff1bd', price: 420, requiredClears: 3, motion: 'twinkle' },
  { id: 'void', name: 'Void Flame', blurb: 'Dark purple fire from beyond the stars.', color: '#8f4dff', price: 520, requiredClears: 4, motion: 'swirl' },
  { id: 'prism', name: 'Rainbow Prism', blurb: 'Every color of the rainbow, all at once.', color: '#ff7ad9', price: 650, requiredClears: 5, motion: 'swirl', rainbow: true },
];

export const rpgWeaponGlow = (id?: string | null): RpgWeaponGlow | undefined => RPG_WEAPON_GLOWS.find(glow => glow.id === id);

/** The cheapest glow not owned yet: what the merchant shows as the next goal. */
export function rpgNextGlow(state: Pick<RpgState, 'glows'>): RpgWeaponGlow | undefined {
  return RPG_WEAPON_GLOWS.find(glow => !state.glows?.includes(glow.id));
}

/** Why a glow cannot be bought now, or null when it can. */
export function rpgGlowBlocked(state: Pick<RpgState, 'glows' | 'expeditionsCompleted'>, gems: number, glowId: string): string | null {
  const glow = rpgWeaponGlow(glowId);
  if (!glow) return 'The merchant does not sell that glow.';
  if (state.glows?.includes(glow.id)) return 'You own this glow already.';
  if (state.expeditionsCompleted < glow.requiredClears) return `Finish ${glow.requiredClears} expeditions to unlock this glow.`;
  if (gems < glow.price) return `You need ${glow.price - gems} more gems.`;
  return null;
}
export interface RpgEconomyResult {
  state: RpgState;
  gems: number;
  forgeDust: number;
  duplicate: boolean;
  lootId?: string;
  gearId?: string;
  glowId?: string;
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
