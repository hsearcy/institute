import type { Plugin } from "@institute/plugin-engine";
import { manifest, fixtureParams, type BlockTowerParams } from "./manifest.ts";
import { evaluate } from "./evaluate.ts";
import { Scene } from "./Scene.tsx";

export { Scene, manifest, evaluate, fixtureParams };
export type { BlockTowerParams };
export type { BlockTowerSceneHandle } from "./Scene.tsx";

export const plugin: Plugin<BlockTowerParams> = {
  manifest,
  Scene,
  evaluate,
};
