import type { Plugin } from "@institute/plugin-engine";
import { manifest, type SpellCastParams } from "./manifest.ts";
import { evaluate } from "./evaluate.ts";
import { Scene } from "./Scene.tsx";

export { Scene, manifest, evaluate };
export type { SpellCastParams };
export type { SpellCastSceneHandle } from "./Scene.tsx";

export const plugin: Plugin<SpellCastParams> = {
  manifest,
  Scene,
  evaluate,
};
