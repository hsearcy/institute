import type { Plugin } from "@institute/plugin-engine";
import { manifest, type CookieShareParams } from "./manifest.ts";
import { evaluate } from "./evaluate.ts";
import { Scene } from "./Scene.tsx";

export { Scene, manifest, evaluate };
export type { CookieShareParams };
export type { CookieShareSceneHandle } from "./Scene.tsx";

export const plugin: Plugin<CookieShareParams> = {
  manifest,
  Scene,
  evaluate,
};
