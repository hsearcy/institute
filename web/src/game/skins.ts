// Pickaxe-skin definitions — the single source of truth shared by the 3D material
// factory (Game.ts) and the shop UI swatches (hud.ts). Each tier carries a headline
// `tint` (used for the HUD swatch + the unlock banner color) and a `make()` that
// builds the Three.js material applied to the loaded pickaxe head/handle.
import { MeshStandardMaterial, MeshPhysicalMaterial, Color, type Material } from 'three';

export type SkinKey =
  | 'wooden' | 'stone' | 'iron' | 'silver' | 'gold' | 'diamond' | 'obsidian' | 'legendary';

export type SkinSpec = {
  /** CSS color string for the HUD swatch + the banner accent. */
  tint: string;
  /** A short flavor blurb for the shop row. */
  blurb: string;
  /** Build the 3D material for the pickaxe. `null` ⇒ keep the GLB's baked material
   *  (the wooden starter look). `legendary` is flagged so the tick loop cycles its hue. */
  make: (() => Material) | null;
  /** Marks the iridescent legendary so the animation loop can drive its emissive. */
  animated?: boolean;
};

export const PICKAXE_SKINS: Record<SkinKey, SkinSpec> = {
  wooden: {
    tint: '#b07a43',
    blurb: 'Trusty starter',
    make: null, // keep the GLB's baked wood + steel
  },
  stone: {
    tint: '#8d8f97',
    blurb: 'Solid grey rock',
    make: () => new MeshStandardMaterial({ color: 0x8d8f97, roughness: 0.95, metalness: 0.0, flatShading: false }),
  },
  iron: {
    tint: '#6d7480',
    blurb: 'Dark brushed steel',
    make: () => new MeshStandardMaterial({ color: 0x6c7482, roughness: 0.42, metalness: 0.78, envMapIntensity: 1.1 }),
  },
  silver: {
    tint: '#e6ebf2',
    blurb: 'Bright polished silver',
    make: () => new MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.12, metalness: 1.0, envMapIntensity: 1.5 }),
  },
  gold: {
    tint: '#ffce4d',
    blurb: 'Rich shiny gold',
    make: () => new MeshStandardMaterial({ color: 0xffc23a, emissive: 0x4a2f00, emissiveIntensity: 0.35, roughness: 0.18, metalness: 1.0, envMapIntensity: 1.6 }),
  },
  diamond: {
    tint: '#7af0ff',
    blurb: 'Glowing cyan crystal',
    make: () => new MeshPhysicalMaterial({
      color: 0xbff7ff, emissive: 0x18c6e0, emissiveIntensity: 0.6,
      metalness: 0.0, roughness: 0.04, transmission: 0.65, ior: 2.2, thickness: 0.6,
      clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.6,
    }),
  },
  obsidian: {
    tint: '#1b1430',
    blurb: 'Glossy black, purple sheen',
    make: () => new MeshPhysicalMaterial({
      color: 0x0d0a17, emissive: 0x2a0a4a, emissiveIntensity: 0.22,
      metalness: 0.35, roughness: 0.08, clearcoat: 1.0, clearcoatRoughness: 0.06,
      sheen: 1.0, sheenColor: new Color(0x9a5cff), sheenRoughness: 0.4, envMapIntensity: 1.3,
    }),
  },
  legendary: {
    tint: '#ff5bd1',
    blurb: 'Iridescent — the showpiece',
    animated: true,
    make: () => new MeshPhysicalMaterial({
      color: 0xff2bbf, emissive: 0xff2bbf, emissiveIntensity: 0.4,
      metalness: 0.35, roughness: 0.2,
      iridescence: 1.0, iridescenceIOR: 2.2, iridescenceThicknessRange: [100, 820],
      clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 1.6,
    }),
  },
};

export const SKIN_KEYS = Object.keys(PICKAXE_SKINS) as SkinKey[];

export function isSkinKey(k: string): k is SkinKey {
  return k in PICKAXE_SKINS;
}
