// Web post-processing stack. This is where the "magic" comes from: emissive
// things (portals, the wizard's orb, spell bolts, sparkles, rune cores) actually
// glow, colors get candy-punchy, and a soft vignette focuses the eye.
//
// Platform-split: native (expo-gl) resolves PostFx.native.tsx (a no-op) because
// the postprocessing EffectComposer isn't reliable there. Web gets the real thing.
import type { FC } from "react";
import {
  Bloom as BloomRaw,
  EffectComposer as EffectComposerRaw,
  HueSaturation as HueSaturationRaw,
  Vignette as VignetteRaw,
} from "@react-three/postprocessing";

// The library's component return types don't line up with React 19's JSX.Element;
// runtime is fine, so alias them to plain components to satisfy the typechecker.
const EffectComposer = EffectComposerRaw as unknown as FC<Record<string, unknown>>;
const Bloom = BloomRaw as unknown as FC<Record<string, unknown>>;
const HueSaturation = HueSaturationRaw as unknown as FC<Record<string, unknown>>;
const Vignette = VignetteRaw as unknown as FC<Record<string, unknown>>;

export function PostFx() {
  return (
    <EffectComposer disableNormalPass multisampling={2}>
      {/* Bloom ONLY genuinely-bright emissives (orb, spell bolt, sparkles, portal
          cores) — a high threshold keeps the bright sky/grass from hazing out. */}
      <Bloom
        intensity={1.4}
        luminanceThreshold={0.82}
        luminanceSmoothing={0.18}
        mipmapBlur
        radius={0.7}
      />
      {/* Slightly punchier storybook color. */}
      <HueSaturation saturation={0.1} />
      {/* Gentle focus, never heavy. */}
      <Vignette offset={0.32} darkness={0.36} />
    </EffectComposer>
  );
}
