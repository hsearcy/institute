// Shared visual language for minigame stages. Mirrors the hub's look
// (apps/kid-app/src/world/theme.ts) so games feel part of the same world.
// Stylized low-poly, Astroneer / Slime Rancher flavor — warm, soft, kid-friendly.

/** Cohesive named palette. */
export const PALETTE = {
  // Sky + atmosphere
  skyZenith: "#4fb0ef",
  skyHorizon: "#dff2ff",
  fog: "#d6eeff",
  hemiSky: "#bfe6ff",
  hemiGround: "#6f9a4d",
  sun: "#fff2d6",

  // Ground
  grassCenter: "#9bd16a",
  grassEdge: "#4f8f3e",

  // Detail scatter
  rock: "#a8a29a",
  rockDark: "#7d776e",
  grassTuft: "#76bf57",
  flowerPink: "#f48bb1",
  flowerYellow: "#ffd84a",
  flowerWhite: "#fff4e6",
  flowerCore: "#ffd84a",

  // Generic accents games can reuse
  white: "#ffffff",
  eyeDark: "#2a2a33",
  gold: "#ffd84a",
  cyan: "#6fe6ff",
  pink: "#ff8fb0",
  green: "#8fd16b",
  purple: "#b07cf0",

  // Shadow
  shadow: "#1c2a1a",
} as const;

type StandardPresetOpts = {
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  flatShading?: boolean;
};

/** Matte stylized preset: high roughness, no metalness, flat-ish shading. */
export function flatStandard(color: string, opts: StandardPresetOpts = {}) {
  return {
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flatShading ?? true,
    emissive: opts.emissive ?? "#000000",
    emissiveIntensity: opts.emissiveIntensity ?? (opts.emissive ? 0.6 : 0),
  } as const;
}

/** Soft glowing preset for accents / magic. */
export function glowStandard(color: string, emissive: string, intensity = 0.9) {
  return {
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.5,
    metalness: 0,
    flatShading: false,
  } as const;
}
