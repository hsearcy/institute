import type { Plugin } from "@institute/plugin-engine";
import { manifest, type DoorCodeParams } from "./manifest.ts";
import { evaluate } from "./evaluate.ts";
import { Scene } from "./Scene.tsx";

export { Scene, manifest, evaluate };
export type { DoorCodeParams };
export type { DoorCodeSceneHandle } from "./Scene.tsx";

export const plugin: Plugin<DoorCodeParams> = {
  manifest,
  Scene,
  evaluate,
};

/** Fixture-ready default round the host can use directly. */
export const DEFAULT_DOOR_CODE_PARAMS: DoorCodeParams = {
  problems: [
    { kind: "sub", a: 10, b: 4, answer: 6 },
    { kind: "sub", a: 8, b: 3, answer: 5 },
    { kind: "missing_addend", a: 7, b: 10, answer: 3 },
  ],
  intro: "The treasure door is locked! Solve each riddle to crack the code.",
  sequence: [6, 5, 3],
};
