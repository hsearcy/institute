// apps/kid-app/src/world/theme.ts
// Shared visual language for the hub world. Stylized low-poly,
// Astroneer / Slime Rancher flavor — warm, soft, kid-friendly.

/** Cohesive named palette. Keep colors here so the look stays consistent. */
export const PALETTE = {
  // Sky + atmosphere
  skyZenith: "#4fb0ef",
  skyHorizon: "#dff2ff",
  fog: "#d6eeff",

  // Ground
  grassCenter: "#9bd16a", // warm light green near the hero
  grassEdge: "#4f8f3e", // deeper green toward the rim
  cliffRock: "#b89a6a", // warm sandy rock for the perimeter
  cliffRockDark: "#8c6f45",

  // Detail scatter
  rock: "#a8a29a",
  rockDark: "#7d776e",
  grassTuft: "#76bf57",
  flowerPink: "#f48bb1",
  flowerYellow: "#ffd84a",
  flowerWhite: "#fff4e6",
  flowerCore: "#ffd84a",

  // Hero (friendly modern avatar)
  heroSkin: "#f6c79b",
  heroShirt: "#ff6b5e",
  heroPants: "#3a6ea5",
  heroHair: "#5a3a22",
  heroShoe: "#2c3e50",
  eyeDark: "#2a2a33",
  white: "#ffffff",

  // Tutor (magical purple blob)
  tutorBody: "#b07cf0",
  tutorGlow: "#7b3fd1",
  tutorCheek: "#ff9ad1",

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

/**
 * Material-preset helper for the stylized matte look: high roughness,
 * zero metalness, flat-ish shading. Returns props to spread onto a
 * <meshStandardMaterial>.
 */
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

/** Soft glowing preset for portals/tutor accents. */
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
