import type { Cosmetic } from "./types.ts";

/**
 * The V1 cosmetic shop. Pure cosmetics, no gameplay effect. `swatch` is the
 * primary color the 3D layer renders the item with.
 */
export const CATALOG: readonly Cosmetic[] = [
  // Tutor hats
  { id: "hat_party", name: "Party Hat", slot: "tutorHat", cost: 12, swatch: "#ff6b5e" },
  { id: "hat_wizard", name: "Wizard Hat", slot: "tutorHat", cost: 22, swatch: "#5b2ea0" },
  { id: "hat_crown", name: "Gold Crown", slot: "tutorHat", cost: 50, swatch: "#ffd84a" },
  // Hero outfits — a magic cape on the wizard, in the swatch color.
  { id: "hero_teal", name: "Teal Cape", slot: "heroOutfit", cost: 15, swatch: "#2bb3a3" },
  { id: "hero_violet", name: "Violet Cape", slot: "heroOutfit", cost: 15, swatch: "#8a5cf0" },
  { id: "hero_sun", name: "Sunshine Cape", slot: "heroOutfit", cost: 30, swatch: "#ffb33a" },
  // Pets (a little companion that floats near the hero in the hub)
  { id: "pet_slime", name: "Pet Slime", slot: "pet", cost: 35, swatch: "#7fc7d9" },
  { id: "pet_bird", name: "Pet Bird", slot: "pet", cost: 45, swatch: "#ff8fb0" },
] as const;

export function cosmeticById(id: string): Cosmetic | undefined {
  return CATALOG.find((c) => c.id === id);
}
