# M2: Plugin Engine + Spell Cast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static M3 hub into a playable scene by adding the plugin-engine framework and a hand-coded Spell Cast mini-game playable via on-screen number-pad input.

**Architecture:** New `packages/plugin-engine/` (pure logic, Zod-validated contract + registry, fully unit-tested). New `packages/minigames/spell-cast/` (manifest + evaluate + Scene). Kid-app gains a top-level `mode` state, a `MiniGameMount` overlay, and a `NumberPad` UI. The hub's portal taps now launch the mini-game scene; finishing or backing out returns to hub. No LLM, no voice, no real assets — those land in M4/M5/M6.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Zod, react-three-fiber/native, expo-gl. All existing M1/M3 conventions preserved.

---

## Reference

- Spec: `docs/superpowers/specs/2026-04-26-m2-plugin-engine-design.md`
- Parent spec: `docs/superpowers/specs/2026-04-25-institute-design.md` (Mini-game plugin framework section)
- M1 plan: `docs/superpowers/plans/2026-04-25-m1-skill-engine.md` (TDD pattern + Bun-now-pnpm conventions, AttemptOutcome shape)
- M3 plan: `docs/superpowers/plans/2026-04-25-m3-hub-3d.md` (Expo + R3F conventions, on-device verification limits)

## Pre-flight notes

- **pnpm workspaces:** new packages go under `packages/` and are auto-picked-up by `pnpm-workspace.yaml`. Run `pnpm install` after each new package is scaffolded.
- **Vitest:** no `bun:test` here — `import { test, expect, describe } from "vitest"`.
- **AttemptOutcome shape:** must match `@institute/skill-engine`'s `AttemptOutcome` exactly (see `packages/skill-engine/src/types.ts`). Don't redefine; re-export. The plugin-engine package depends on skill-engine.
- **Visual verification limit:** all UI changes (Tasks 6+) need on-device check via Expo Go on the Pixel. Subagents can confirm `pnpm typecheck` and `pnpm test` but cannot eyeball the rendered scene. Document this expectation in any task that touches `apps/kid-app/`.
- **R3F native imports:** use `@react-three/fiber/native` for Canvas/useFrame in `apps/kid-app/`. The Metro alias to web variants applies only when `platform === "web"` (per M3's `metro.config.js`); native bundles are unaffected.
- **No drei `<Text>`:** troika-three-text crashes on RN (no `document`). Use procedural meshes for any 3D labels (M3 already swapped to color-coded flags on portals; the same constraint holds for any Spell Cast UI inside the canvas).
- **One Canvas only:** Spell Cast renders inside the **existing** kid-app `<Canvas>` — `MiniGameMount` swaps the Canvas children based on app mode.

## File structure produced by this plan

```
packages/
├── plugin-engine/                        # NEW
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── contract.ts                   # types: AttemptOutcome (re-export), RoundResult, SceneProps, Manifest, Plugin
│   │   ├── registry.ts                   # register / getPlugin / clearRegistry (test helper)
│   │   ├── validate.ts                   # validateParams<P>(plugin, candidate) → Result
│   │   └── index.ts                      # public re-exports
│   └── test/
│       ├── registry.test.ts
│       └── validate.test.ts
└── minigames/
    └── spell-cast/                       # NEW
        ├── package.json
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── src/
        │   ├── manifest.ts               # SpellCastParams Zod schema + manifest object
        │   ├── evaluate.ts               # pure: evaluate(params, step, answer)
        │   ├── Scene.tsx                 # R3F scene: procedural goblin, sparks, HP shrink
        │   └── index.ts                  # exports Plugin<SpellCastParams>
        └── test/
            ├── manifest.test.ts
            └── evaluate.test.ts
apps/kid-app/
├── App.tsx                               # MODIFY: add `mode` state, dispatch on portal tap
└── src/
    └── minigame/                         # NEW
        ├── MiniGameMount.tsx             # mounts plugin scene by id; validates fixture
        ├── NumberPad.tsx                 # RN UI: 1-10 grid below the canvas
        ├── BackButton.tsx                # RN UI: top-left × button
        └── fixtures.ts                   # hand-coded params per plugin id (M2: only spell-cast)
```

Each file has one responsibility:
- `contract.ts` — types only
- `registry.ts` — Map<id, plugin>
- `validate.ts` — Zod validation against `manifest.paramSchema`
- `manifest.ts` — schema + manifest data
- `evaluate.ts` — pure step-checking
- `Scene.tsx` — 3D + animation
- `MiniGameMount.tsx` — composition: lookup → validate → mount Scene + UI overlays
- `NumberPad.tsx`, `BackButton.tsx` — focused RN UI primitives

---

## Task 1 — Bootstrap `plugin-engine` package

**Files:**
- Create: `packages/plugin-engine/package.json`
- Create: `packages/plugin-engine/tsconfig.json`
- Create: `packages/plugin-engine/vitest.config.ts`
- Create: `packages/plugin-engine/src/index.ts`
- Create: `packages/plugin-engine/test/smoke.test.ts`

- [ ] **Step 1.1: Create `packages/plugin-engine/package.json`**

```json
{
  "name": "@institute/plugin-engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@institute/skill-engine": "workspace:*",
    "react": "*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/react": "*"
  }
}
```

- [ ] **Step 1.2: Create `packages/plugin-engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx" },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 1.3: Create `packages/plugin-engine/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", globals: false },
});
```

- [ ] **Step 1.4: Create `packages/plugin-engine/src/index.ts`**

```ts
export {};
```

- [ ] **Step 1.5: Create `packages/plugin-engine/test/smoke.test.ts`**

```ts
import { test, expect } from "vitest";
test("smoke: plugin-engine vitest runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 1.6: Install + verify**

Run: `cd /home/hfsearcy/git/institute && pnpm install`
Expected: `@institute/plugin-engine` resolves; React + Zod installed.

Run: `cd /home/hfsearcy/git/institute/packages/plugin-engine && pnpm test`
Expected: 1 pass, 0 fail.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 1.7: Commit**

```bash
cd /home/hfsearcy/git/institute
git add packages/plugin-engine pnpm-lock.yaml
git commit -m "chore(plugin-engine): scaffold package"
```

---

## Task 2 — Contract types + Manifest schema

**Files:**
- Create: `packages/plugin-engine/src/contract.ts`
- Modify: `packages/plugin-engine/src/index.ts`

This task defines the types only. No tests for pure type definitions (TS handles that at compile); the next task adds runtime tests against these types via the registry.

- [ ] **Step 2.1: Implement `contract.ts`**

```ts
// packages/plugin-engine/src/contract.ts
import { z } from "zod";
import type { ComponentType } from "react";
import type { AttemptOutcome } from "@institute/skill-engine";

/** Re-export so plugins import everything from one place. */
export type { AttemptOutcome };

export type RoundResult = {
  status: "completed" | "aborted";
  outcomes: AttemptOutcome[];
  durationMs: number;
};

export type SceneProps<Params = unknown> = {
  params: Params;
  onComplete: (r: RoundResult) => void;
};

/**
 * Manifest fields validated structurally on register. The `paramSchema` itself
 * is a ZodType (not validatable by another Zod schema), so we check it
 * structurally in the registry.
 */
export const ManifestBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  supportedSkills: z.array(z.string().min(1)).nonempty(),
});

export type Manifest<Params = unknown> = z.infer<typeof ManifestBaseSchema> & {
  paramSchema: z.ZodType<Params>;
};

export type EvaluateResult = {
  correct: boolean;
  expected: number;
  isLastStep: boolean;
};

export type Plugin<Params = unknown> = {
  manifest: Manifest<Params>;
  Scene: ComponentType<SceneProps<Params>>;
  evaluate: (params: Params, step: number, answer: number) => EvaluateResult;
};
```

- [ ] **Step 2.2: Update `src/index.ts`**

```ts
export type {
  AttemptOutcome,
  RoundResult,
  SceneProps,
  Manifest,
  Plugin,
  EvaluateResult,
} from "./contract.ts";
export { ManifestBaseSchema } from "./contract.ts";
```

- [ ] **Step 2.3: Verify typecheck**

Run: `cd packages/plugin-engine && pnpm typecheck`
Expected: exit 0.

- [ ] **Step 2.4: Verify smoke test still passes**

Run: `pnpm test`
Expected: 1 pass.

- [ ] **Step 2.5: Commit**

```bash
git add packages/plugin-engine/src
git commit -m "feat(plugin-engine): contract types + ManifestBaseSchema"
```

---

## Task 3 — Registry (TDD)

**Files:**
- Create: `packages/plugin-engine/src/registry.ts`
- Create: `packages/plugin-engine/test/registry.test.ts`
- Modify: `packages/plugin-engine/src/index.ts`

- [ ] **Step 3.1: Write the failing tests**

```ts
// packages/plugin-engine/test/registry.test.ts
import { test, expect, describe, beforeEach } from "vitest";
import { z } from "zod";
import { register, getPlugin, listPluginIds, clearRegistry } from "../src/registry.ts";
import type { Plugin } from "../src/contract.ts";

const fakePlugin = (id: string): Plugin<{ n: number }> => ({
  manifest: {
    id,
    title: id,
    supportedSkills: ["x"],
    paramSchema: z.object({ n: z.number() }),
  },
  Scene: () => null,
  evaluate: () => ({ correct: true, expected: 0, isLastStep: true }),
});

describe("registry", () => {
  beforeEach(() => clearRegistry());

  test("getPlugin returns undefined when nothing registered", () => {
    expect(getPlugin("missing")).toBeUndefined();
  });

  test("register then getPlugin round-trips", () => {
    const p = fakePlugin("alpha");
    register(p);
    expect(getPlugin("alpha")).toBe(p);
  });

  test("listPluginIds returns sorted ids", () => {
    register(fakePlugin("zulu"));
    register(fakePlugin("alpha"));
    register(fakePlugin("mike"));
    expect(listPluginIds()).toEqual(["alpha", "mike", "zulu"]);
  });

  test("re-registering the same id throws (no silent override)", () => {
    register(fakePlugin("alpha"));
    expect(() => register(fakePlugin("alpha"))).toThrow(/already registered/i);
  });

  test("register validates the manifest base schema (rejects empty id)", () => {
    const bad: Plugin<{ n: number }> = {
      manifest: {
        // @ts-expect-error - intentionally bad
        id: "",
        title: "x",
        supportedSkills: ["x"],
        paramSchema: z.object({ n: z.number() }),
      },
      Scene: () => null,
      evaluate: () => ({ correct: true, expected: 0, isLastStep: true }),
    };
    expect(() => register(bad)).toThrow();
  });

  test("register requires paramSchema to be a Zod-like object (has .parse)", () => {
    const bad = {
      manifest: { id: "alpha", title: "x", supportedSkills: ["x"], paramSchema: {} as any },
      Scene: () => null,
      evaluate: () => ({ correct: true, expected: 0, isLastStep: true }),
    } as unknown as Plugin<{ n: number }>;
    expect(() => register(bad)).toThrow(/paramSchema/i);
  });
});
```

- [ ] **Step 3.2: Run test — verify it fails**

Run: `cd packages/plugin-engine && pnpm test test/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement `registry.ts`**

```ts
// packages/plugin-engine/src/registry.ts
import { ManifestBaseSchema, type Plugin } from "./contract.ts";

const registry = new Map<string, Plugin<unknown>>();

export function register<P>(plugin: Plugin<P>): void {
  // Validate manifest's base shape (id, title, supportedSkills) via Zod.
  ManifestBaseSchema.parse({
    id: plugin.manifest.id,
    title: plugin.manifest.title,
    supportedSkills: plugin.manifest.supportedSkills,
  });
  // paramSchema must be a Zod-like (has .parse). Structural check.
  if (
    !plugin.manifest.paramSchema ||
    typeof (plugin.manifest.paramSchema as { parse?: unknown }).parse !== "function"
  ) {
    throw new Error(
      `plugin ${plugin.manifest.id}: paramSchema must be a Zod schema (missing .parse)`,
    );
  }
  if (registry.has(plugin.manifest.id)) {
    throw new Error(`plugin ${plugin.manifest.id} already registered`);
  }
  registry.set(plugin.manifest.id, plugin as Plugin<unknown>);
}

export function getPlugin<P = unknown>(id: string): Plugin<P> | undefined {
  return registry.get(id) as Plugin<P> | undefined;
}

export function listPluginIds(): string[] {
  return [...registry.keys()].sort();
}

/** Test-only: wipes the registry. Do not call in app code. */
export function clearRegistry(): void {
  registry.clear();
}
```

- [ ] **Step 3.4: Update `src/index.ts`**

Append:

```ts
export { register, getPlugin, listPluginIds, clearRegistry } from "./registry.ts";
```

- [ ] **Step 3.5: Run tests — verify they pass**

Run: `pnpm test test/registry.test.ts`
Expected: 6 pass, 0 fail.

- [ ] **Step 3.6: Commit**

```bash
git add packages/plugin-engine/src packages/plugin-engine/test
git commit -m "feat(plugin-engine): plugin registry"
```

---

## Task 4 — Params validation (TDD)

**Files:**
- Create: `packages/plugin-engine/src/validate.ts`
- Create: `packages/plugin-engine/test/validate.test.ts`
- Modify: `packages/plugin-engine/src/index.ts`

- [ ] **Step 4.1: Write the failing tests**

```ts
// packages/plugin-engine/test/validate.test.ts
import { test, expect, describe } from "vitest";
import { z } from "zod";
import { validateParams } from "../src/validate.ts";
import type { Plugin } from "../src/contract.ts";

const ParamsZ = z.object({
  enemyType: z.enum(["goblin", "slime"]),
  hp: z.number().int().positive(),
});
type Params = z.infer<typeof ParamsZ>;

const plugin: Plugin<Params> = {
  manifest: { id: "x", title: "X", supportedSkills: ["s"], paramSchema: ParamsZ },
  Scene: () => null,
  evaluate: () => ({ correct: true, expected: 0, isLastStep: true }),
};

describe("validateParams", () => {
  test("returns ok with parsed value for valid input", () => {
    const r = validateParams(plugin, { enemyType: "goblin", hp: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ enemyType: "goblin", hp: 5 });
  });

  test("returns ok=false with ZodError for invalid input", () => {
    const r = validateParams(plugin, { enemyType: "dragon", hp: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(Error);
      expect(r.error.message).toMatch(/enemyType|hp/);
    }
  });

  test("strips unknown keys silently (Zod default behavior)", () => {
    const r = validateParams(plugin, { enemyType: "goblin", hp: 1, extra: "ignored" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { extra?: unknown }).extra).toBeUndefined();
  });

  test("rejects null / non-object input", () => {
    expect(validateParams(plugin, null).ok).toBe(false);
    expect(validateParams(plugin, "string").ok).toBe(false);
    expect(validateParams(plugin, undefined).ok).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run test — verify it fails**

Run: `pnpm test test/validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement `validate.ts`**

```ts
// packages/plugin-engine/src/validate.ts
import type { Plugin } from "./contract.ts";

export type ValidateResult<P> =
  | { ok: true; value: P }
  | { ok: false; error: Error };

export function validateParams<P>(
  plugin: Plugin<P>,
  candidate: unknown,
): ValidateResult<P> {
  const parsed = plugin.manifest.paramSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: new Error(parsed.error.message) };
}
```

- [ ] **Step 4.4: Update `src/index.ts`**

Append:

```ts
export { validateParams } from "./validate.ts";
export type { ValidateResult } from "./validate.ts";
```

- [ ] **Step 4.5: Run tests — verify they pass**

Run: `pnpm test test/validate.test.ts`
Expected: 4 pass, 0 fail.

- [ ] **Step 4.6: Run the full plugin-engine suite**

Run: `pnpm test && pnpm typecheck`
Expected: 11 tests pass (1 smoke + 6 registry + 4 validate); typecheck exit 0.

- [ ] **Step 4.7: Commit**

```bash
git add packages/plugin-engine/src packages/plugin-engine/test
git commit -m "feat(plugin-engine): params validation"
```

---

## Task 5 — Bootstrap `spell-cast` plugin package

**Files:**
- Create: `packages/minigames/spell-cast/package.json`
- Create: `packages/minigames/spell-cast/tsconfig.json`
- Create: `packages/minigames/spell-cast/vitest.config.ts`
- Create: `packages/minigames/spell-cast/src/index.ts`
- Create: `packages/minigames/spell-cast/test/smoke.test.ts`

- [ ] **Step 5.1: Create `packages/minigames/spell-cast/package.json`**

```json
{
  "name": "@institute/minigame-spell-cast",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@institute/plugin-engine": "workspace:*",
    "@react-three/fiber": "*",
    "react": "*",
    "three": "*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/react": "*",
    "@types/three": "*"
  }
}
```

The `@react-three/fiber` and `three` deps are listed because Scene.tsx will use them. We list them as `*` so they pick the kid-app's pinned versions via pnpm peer resolution.

- [ ] **Step 5.2: Create `packages/minigames/spell-cast/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx" },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 5.3: Create `packages/minigames/spell-cast/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", globals: false },
});
```

- [ ] **Step 5.4: Create `packages/minigames/spell-cast/src/index.ts`**

```ts
export {};
```

- [ ] **Step 5.5: Create `packages/minigames/spell-cast/test/smoke.test.ts`**

```ts
import { test, expect } from "vitest";
test("smoke: spell-cast vitest runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5.6: Update `pnpm-workspace.yaml`**

Read `pnpm-workspace.yaml` at repo root. Confirm it already covers `packages/*` recursively. If it lists only `packages/*` (one level), add `packages/minigames/*` so spell-cast is detected:

```yaml
packages:
  - "packages/*"
  - "packages/minigames/*"
  - "apps/*"
```

(If it already had a wildcard like `packages/**` no change is needed.)

- [ ] **Step 5.7: Install + verify**

Run: `cd /home/hfsearcy/git/institute && pnpm install`
Expected: `@institute/minigame-spell-cast` discovered as a workspace.

Run: `cd packages/minigames/spell-cast && pnpm test`
Expected: 1 pass.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5.8: Commit**

```bash
cd /home/hfsearcy/git/institute
git add packages/minigames pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore(spell-cast): scaffold plugin package"
```

---

## Task 6 — Spell Cast manifest + paramSchema (TDD)

**Files:**
- Create: `packages/minigames/spell-cast/src/manifest.ts`
- Create: `packages/minigames/spell-cast/test/manifest.test.ts`

- [ ] **Step 6.1: Write the failing tests**

```ts
// packages/minigames/spell-cast/test/manifest.test.ts
import { test, expect, describe } from "vitest";
import { manifest, SpellCastParams } from "../src/manifest.ts";

describe("spell-cast manifest", () => {
  test("id is 'spell-cast'", () => {
    expect(manifest.id).toBe("spell-cast");
  });

  test("title is human-readable", () => {
    expect(manifest.title).toBe("Spell Cast");
  });

  test("supportedSkills includes skip-counting + sequence_next", () => {
    expect(manifest.supportedSkills).toEqual(
      expect.arrayContaining(["skip_count_2", "skip_count_5", "skip_count_10", "sequence_next"]),
    );
  });

  test("paramSchema accepts a valid round", () => {
    const r = SpellCastParams.safeParse({
      enemyType: "goblin",
      sequence: [2, 4, 6, 8, 10],
      intro: "A goblin appears!",
    });
    expect(r.success).toBe(true);
  });

  test("paramSchema rejects unknown enemyType", () => {
    const r = SpellCastParams.safeParse({
      enemyType: "dragon",
      sequence: [1],
      intro: "x",
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects empty sequence", () => {
    const r = SpellCastParams.safeParse({
      enemyType: "goblin",
      sequence: [],
      intro: "x",
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects empty intro", () => {
    const r = SpellCastParams.safeParse({
      enemyType: "goblin",
      sequence: [1, 2],
      intro: "",
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects negative numbers in sequence", () => {
    const r = SpellCastParams.safeParse({
      enemyType: "goblin",
      sequence: [-1, 0, 1],
      intro: "x",
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 6.2: Run test — verify it fails**

Run: `cd packages/minigames/spell-cast && pnpm test test/manifest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement `manifest.ts`**

```ts
// packages/minigames/spell-cast/src/manifest.ts
import { z } from "zod";
import type { Manifest } from "@institute/plugin-engine";

export const SpellCastParams = z.object({
  enemyType: z.enum(["goblin", "slime", "ghost"]),
  /** Sequence of correct answers, in order. e.g. [2,4,6,8,10] for skip-by-2s. */
  sequence: z.array(z.number().int().nonnegative()).nonempty(),
  /** Tutor-spoken intro line (M2 renders as on-screen text). */
  intro: z.string().min(1),
});
export type SpellCastParams = z.infer<typeof SpellCastParams>;

export const manifest: Manifest<SpellCastParams> = {
  id: "spell-cast",
  title: "Spell Cast",
  supportedSkills: ["skip_count_2", "skip_count_5", "skip_count_10", "sequence_next"],
  paramSchema: SpellCastParams,
};
```

- [ ] **Step 6.4: Run tests — verify they pass**

Run: `pnpm test test/manifest.test.ts`
Expected: 8 pass.

- [ ] **Step 6.5: Commit**

```bash
git add packages/minigames/spell-cast/src packages/minigames/spell-cast/test
git commit -m "feat(spell-cast): manifest + SpellCastParams schema"
```

---

## Task 7 — Spell Cast evaluate (TDD)

**Files:**
- Create: `packages/minigames/spell-cast/src/evaluate.ts`
- Create: `packages/minigames/spell-cast/test/evaluate.test.ts`

- [ ] **Step 7.1: Write the failing tests**

```ts
// packages/minigames/spell-cast/test/evaluate.test.ts
import { test, expect, describe } from "vitest";
import { evaluate } from "../src/evaluate.ts";
import type { SpellCastParams } from "../src/manifest.ts";

const params: SpellCastParams = {
  enemyType: "goblin",
  sequence: [2, 4, 6, 8, 10],
  intro: "x",
};

describe("evaluate", () => {
  test("step 0, answer 2 is correct", () => {
    expect(evaluate(params, 0, 2)).toEqual({ correct: true, expected: 2, isLastStep: false });
  });

  test("step 0, answer 4 is wrong (off-by-one)", () => {
    expect(evaluate(params, 0, 4)).toEqual({ correct: false, expected: 2, isLastStep: false });
  });

  test("last step is flagged", () => {
    expect(evaluate(params, 4, 10)).toEqual({ correct: true, expected: 10, isLastStep: true });
  });

  test("out-of-range step throws", () => {
    expect(() => evaluate(params, 5, 0)).toThrow(/step/i);
    expect(() => evaluate(params, -1, 0)).toThrow(/step/i);
  });

  test("single-element sequence: step 0 is also the last step", () => {
    const single: SpellCastParams = { enemyType: "slime", sequence: [7], intro: "x" };
    expect(evaluate(single, 0, 7)).toEqual({ correct: true, expected: 7, isLastStep: true });
  });
});
```

- [ ] **Step 7.2: Run test — verify it fails**

Run: `pnpm test test/evaluate.test.ts`
Expected: FAIL.

- [ ] **Step 7.3: Implement `evaluate.ts`**

```ts
// packages/minigames/spell-cast/src/evaluate.ts
import type { EvaluateResult } from "@institute/plugin-engine";
import type { SpellCastParams } from "./manifest.ts";

export function evaluate(
  params: SpellCastParams,
  step: number,
  answer: number,
): EvaluateResult {
  if (step < 0 || step >= params.sequence.length) {
    throw new Error(`spell-cast.evaluate: step ${step} out of range [0, ${params.sequence.length - 1}]`);
  }
  const expected = params.sequence[step]!;
  return {
    correct: answer === expected,
    expected,
    isLastStep: step === params.sequence.length - 1,
  };
}
```

- [ ] **Step 7.4: Run tests**

Run: `pnpm test test/evaluate.test.ts`
Expected: 5 pass.

- [ ] **Step 7.5: Commit**

```bash
git add packages/minigames/spell-cast/src packages/minigames/spell-cast/test
git commit -m "feat(spell-cast): step evaluator"
```

---

## Task 8 — Spell Cast Scene (3D, no LLM, no voice)

**Files:**
- Create: `packages/minigames/spell-cast/src/Scene.tsx`
- Modify: `packages/minigames/spell-cast/src/index.ts`

This task is the first that touches R3F components. Subagents cannot visually verify; only `pnpm typecheck` + `pnpm test` confirm. On-device verification happens in Task 11.

- [ ] **Step 8.1: Implement `Scene.tsx`**

```tsx
// packages/minigames/spell-cast/src/Scene.tsx
import { useRef, useState, useCallback, useEffect } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group } from "three";
import type { SceneProps, AttemptOutcome } from "@institute/plugin-engine";
import type { SpellCastParams } from "./manifest.ts";
import { evaluate } from "./evaluate.ts";

const SKILL_ID = "skip_count_2"; // M2 hand-coded; M5 uses params-driven skill targeting

/**
 * Imperative interface the kid-app's NumberPad uses to drive the round.
 * Exposed via a global ref-like setter on first mount; the App-level
 * MiniGameMount captures it to wire taps from the RN NumberPad UI to the
 * Scene's evaluate-and-advance logic.
 *
 * Why not React context: Scene runs inside the R3F render tree; NumberPad
 * runs inside the RN UI tree. They don't share a React subtree. A small
 * imperative bridge is the simplest correct shape and isolates the
 * coupling to two well-named callbacks.
 */
export type SpellCastSceneHandle = {
  /** Called with a number when the kid taps a button. Returns the EvaluateResult for any UI feedback. */
  submitAnswer: (answer: number) => { correct: boolean; expected: number; isLastStep: boolean };
  /** Called when the kid taps the back button. */
  abort: () => void;
};

type Props = SceneProps<SpellCastParams> & {
  /** Bridge for the RN NumberPad / BackButton to talk to the Scene. */
  onHandleReady?: (h: SpellCastSceneHandle) => void;
};

export function Scene({ params, onComplete, onHandleReady }: Props) {
  const goblinRef = useRef<Group>(null);
  const [step, setStep] = useState(0);
  const [hp, setHp] = useState(params.sequence.length);
  const [shake, setShake] = useState(0);
  const startedAtRef = useRef(Date.now());
  const outcomesRef = useRef<AttemptOutcome[]>([]);

  // Subtle bob always, plus shake when wrong.
  useFrame(({ clock }) => {
    if (!goblinRef.current) return;
    const t = clock.elapsedTime;
    goblinRef.current.position.y = 1 + Math.sin(t * 1.5) * 0.05;
    if (shake > 0) {
      goblinRef.current.position.x = Math.sin(t * 50) * 0.1;
      // shake decays per frame; not exact ms but close enough for placeholder
      setShake((s) => Math.max(0, s - 1));
    } else {
      goblinRef.current.position.x = 0;
    }
  });

  const finish = useCallback(
    (status: "completed" | "aborted") => {
      onComplete({
        status,
        outcomes: outcomesRef.current,
        durationMs: Date.now() - startedAtRef.current,
      });
    },
    [onComplete],
  );

  useEffect(() => {
    if (!onHandleReady) return;
    onHandleReady({
      submitAnswer: (answer: number) => {
        const r = evaluate(params, step, answer);
        outcomesRef.current.push({
          correct: r.correct,
          hinted: false,
          scaffolded: false,
          difficulty: 0.4, // placeholder; real difficulty banding lands in M5
          skillId: SKILL_ID,
          occurredAt: new Date(),
        });
        if (r.correct) {
          setHp((h) => h - 1);
          if (r.isLastStep) {
            // Defer to next tick so the HP shrink renders before the round closes.
            setTimeout(() => finish("completed"), 250);
          } else {
            setStep((s) => s + 1);
          }
        } else {
          setShake(20); // ~20 frames of shake at 60fps ≈ 333ms
        }
        return r;
      },
      abort: () => finish("aborted"),
    });
  }, [params, step, onHandleReady, finish]);

  // Each correct answer shrinks the goblin proportionally to remaining HP.
  const scale = Math.max(0.05, hp / params.sequence.length);

  // Pretty hacky color per enemy type — placeholder until we get assets.
  const enemyColor =
    params.enemyType === "goblin" ? "#3a7d52" :
    params.enemyType === "slime"  ? "#7fc7d9" : "#bda7e0";

  return (
    <>
      <ambientLight intensity={0.5} color="#b8d8ff" />
      <directionalLight position={[5, 10, 5]} intensity={1.0} color="#fff5e0" />
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#5fa052" />
      </mesh>
      {/* Goblin: capsule body + sphere head + 2 sphere eyes */}
      <group ref={goblinRef} position={[0, 1, -3]} scale={[scale, scale, scale]}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 1.2, 12]} />
          <meshStandardMaterial color={enemyColor} />
        </mesh>
        <mesh position={[0, 0.6, 0]}>
          <sphereGeometry args={[0.6, 16, 16]} />
          <meshStandardMaterial color={enemyColor} />
        </mesh>
        <mesh position={[0, -0.6, 0]}>
          <sphereGeometry args={[0.6, 16, 16]} />
          <meshStandardMaterial color={enemyColor} />
        </mesh>
        <mesh position={[-0.22, 0.7, 0.55]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.22, 0.7, 0.55]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
    </>
  );
}
```

- [ ] **Step 8.2: Update `src/index.ts`**

```ts
// packages/minigames/spell-cast/src/index.ts
import type { Plugin } from "@institute/plugin-engine";
import { manifest, type SpellCastParams } from "./manifest.ts";
import { evaluate } from "./evaluate.ts";
import { Scene } from "./Scene.tsx";

export { Scene, manifest, SpellCastParams, evaluate };

export const plugin: Plugin<SpellCastParams> = {
  manifest,
  Scene,
  evaluate,
};
```

- [ ] **Step 8.3: Verify typecheck + tests**

Run: `cd packages/minigames/spell-cast && pnpm typecheck && pnpm test`
Expected: typecheck exit 0; tests still 1 + 8 + 5 = 14 (smoke + manifest + evaluate). Scene has no unit tests in M2 — visual behavior verified on device.

Note: Scene.tsx imports from `@react-three/fiber/native` and `three`. These resolve via pnpm peer-dependency lookup to the kid-app's pinned versions. If pnpm complains about missing peer deps at install time, that's expected — the kid-app provides them when it imports this plugin. Fix only if `pnpm typecheck` actually fails.

- [ ] **Step 8.4: Commit**

```bash
git add packages/minigames/spell-cast/src
git commit -m "feat(spell-cast): Scene component (procedural goblin, HP shrink)"
```

---

## Task 9 — Kid-app integration: NumberPad + BackButton + MiniGameMount

**Files:**
- Create: `apps/kid-app/src/minigame/NumberPad.tsx`
- Create: `apps/kid-app/src/minigame/BackButton.tsx`
- Create: `apps/kid-app/src/minigame/fixtures.ts`
- Create: `apps/kid-app/src/minigame/MiniGameMount.tsx`
- Modify: `apps/kid-app/package.json` (add deps on the new packages)

- [ ] **Step 9.1: Add workspace deps to kid-app**

Modify `apps/kid-app/package.json`'s `dependencies`:

```json
"@institute/plugin-engine": "workspace:*",
"@institute/minigame-spell-cast": "workspace:*",
```

Run: `cd /home/hfsearcy/git/institute && pnpm install`
Expected: pnpm-lock updates; no errors.

- [ ] **Step 9.2: Implement `fixtures.ts`**

```ts
// apps/kid-app/src/minigame/fixtures.ts
import type { PortalId } from "../config";
import { SpellCastParams } from "@institute/minigame-spell-cast";
import type { z } from "zod";

/**
 * Hand-coded round params per portal id, for M2. M5 will replace these with
 * LLM-generated params per round. The shape per portal is whatever each
 * plugin's paramSchema declares.
 *
 * Currently only `spell-cast` is wired; the other 3 portals still show the
 * "Coming soon" toast in App.tsx and never reach this map.
 */
export const FIXTURES: { "spell-cast": z.infer<typeof SpellCastParams> } = {
  "spell-cast": {
    enemyType: "goblin",
    sequence: [2, 4, 6, 8, 10],
    intro: "A goblin appears! Cast sparks by 2s to defeat it.",
  },
};

export type FixtureFor<P extends PortalId> =
  P extends "spell-cast" ? typeof FIXTURES["spell-cast"] : never;
```

- [ ] **Step 9.3: Implement `NumberPad.tsx`**

```tsx
// apps/kid-app/src/minigame/NumberPad.tsx
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onPress: (n: number) => void;
};

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function NumberPad({ onPress }: Props) {
  return (
    <View style={styles.row}>
      {NUMBERS.map((n) => (
        <Pressable
          key={n}
          onPress={() => onPress(n)}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.label}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  btn: {
    flex: 1,
    marginHorizontal: 3,
    aspectRatio: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  btnPressed: { backgroundColor: "rgba(176,124,240,0.8)" },
  label: { color: "#fff", fontSize: 22, fontWeight: "700" },
});
```

- [ ] **Step 9.4: Implement `BackButton.tsx`**

```tsx
// apps/kid-app/src/minigame/BackButton.tsx
import { Pressable, StyleSheet, Text } from "react-native";

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
    >
      <Text style={styles.label}>×</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: "absolute",
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  btnPressed: { backgroundColor: "rgba(214,59,59,0.85)" },
  label: { color: "#fff", fontSize: 22, fontWeight: "700", lineHeight: 24 },
});
```

- [ ] **Step 9.5: Implement `MiniGameMount.tsx`**

```tsx
// apps/kid-app/src/minigame/MiniGameMount.tsx
import { useRef } from "react";
import { plugin as spellCastPlugin } from "@institute/minigame-spell-cast";
import { register, getPlugin, validateParams, type RoundResult } from "@institute/plugin-engine";
import type { Scene as SpellCastScene, SpellCastSceneHandle } from "@institute/minigame-spell-cast";
import { FIXTURES } from "./fixtures";
import type { PortalId } from "../config";

// Register V1 plugins once at module load. New plugins added here in M6.
let registered = false;
function ensureRegistered() {
  if (registered) return;
  try {
    register(spellCastPlugin);
  } catch (e) {
    // Already-registered errors are fine in dev hot-reload; surface other errors.
    if (!(e instanceof Error) || !/already registered/i.test(e.message)) throw e;
  }
  registered = true;
}

type Props = {
  portalId: PortalId;
  onComplete: (r: RoundResult) => void;
};

/**
 * Renders the 3D Scene for the requested mini-game. Returns the imperative
 * handle (via ref param) so the parent App can wire NumberPad taps and the
 * BackButton to the Scene without React-tree coupling.
 */
export function MiniGameMount({
  portalId,
  onComplete,
  handleRef,
}: Props & { handleRef: React.MutableRefObject<SpellCastSceneHandle | null> }) {
  ensureRegistered();
  const plugin = getPlugin(portalId);
  if (!plugin) {
    // M2 only wires spell-cast. Other portals shouldn't reach here.
    onComplete({ status: "aborted", outcomes: [], durationMs: 0 });
    return null;
  }
  const fixture = portalId === "spell-cast" ? FIXTURES["spell-cast"] : undefined;
  if (!fixture) {
    onComplete({ status: "aborted", outcomes: [], durationMs: 0 });
    return null;
  }
  const validated = validateParams(plugin, fixture);
  if (!validated.ok) {
    // This shouldn't happen — the fixture was authored against the schema.
    // Logging covers the dev case until M5's LLM path makes invalid params
    // a real possibility.
    console.error("MiniGameMount: fixture failed validation", validated.error);
    onComplete({ status: "aborted", outcomes: [], durationMs: 0 });
    return null;
  }
  const Scene = plugin.Scene as unknown as typeof SpellCastScene;
  return (
    <Scene
      params={validated.value as never}
      onComplete={onComplete}
      onHandleReady={(h) => { handleRef.current = h; }}
    />
  );
}
```

- [ ] **Step 9.6: Verify typecheck**

Run: `cd /home/hfsearcy/git/institute && pnpm -r typecheck`
Expected: exit 0 (all packages).

- [ ] **Step 9.7: Commit**

```bash
git add apps/kid-app pnpm-lock.yaml
git commit -m "feat(kid-app): MiniGameMount, NumberPad, BackButton, fixtures"
```

---

## Task 10 — Wire App.tsx to launch + close mini-games

**Files:**
- Modify: `apps/kid-app/App.tsx`

- [ ] **Step 10.1: Replace App.tsx with mode-aware version**

```tsx
// apps/kid-app/App.tsx
import { Canvas } from "@react-three/fiber/native";
import { Suspense, useRef, useState } from "react";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  type PanGestureHandlerGestureEvent,
} from "react-native-gesture-handler";
import { StyleSheet, View } from "react-native";
import type { SpellCastSceneHandle } from "@institute/minigame-spell-cast";
import { HubScene } from "./src/world/HubScene";
import { SceneController } from "./src/world/SceneController";
import { Toast } from "./src/ui/Toast";
import { LoadingScreen } from "./src/ui/LoadingScreen";
import { FpsOverlay } from "./src/ui/FpsOverlay";
import { SHOW_FPS, type PortalId } from "./src/config";
import { MiniGameMount } from "./src/minigame/MiniGameMount";
import { NumberPad } from "./src/minigame/NumberPad";
import { BackButton } from "./src/minigame/BackButton";

const PORTAL_LABELS: Record<PortalId, string> = {
  "spell-cast": "Spell Cast",
  "block-tower": "Block Tower",
  "cookie-share": "Cookie Share",
  "door-code": "Door Code",
};

type Mode = { kind: "hub" } | { kind: "minigame"; portalId: PortalId; runId: string };

export default function App() {
  const [mode, setMode] = useState<Mode>({ kind: "hub" });
  const [yaw, setYaw] = useState(0);
  const [fps, setFps] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const sceneHandleRef = useRef<SpellCastSceneHandle | null>(null);

  const onPan = (e: PanGestureHandlerGestureEvent) => {
    if (mode.kind !== "hub") return; // disable orbit during a round
    setYaw((prev) => prev + e.nativeEvent.translationX * 0.0001);
  };

  const onPortalTap = (id: PortalId) => {
    if (id === "spell-cast") {
      setMode({ kind: "minigame", portalId: id, runId: `${Date.now()}` });
    } else {
      setToast(`Coming soon — ${PORTAL_LABELS[id]}!`);
    }
  };

  const onRoundComplete = (result: { status: "completed" | "aborted"; outcomes: unknown[]; durationMs: number }) => {
    console.log("[round complete]", result);
    sceneHandleRef.current = null;
    setMode({ kind: "hub" });
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <PanGestureHandler onGestureEvent={onPan}>
        <View style={styles.root}>
          <Suspense fallback={<LoadingScreen />}>
            <Canvas style={styles.canvas}>
              {mode.kind === "hub" ? (
                <>
                  <HubScene onPortalTap={onPortalTap} />
                  <SceneController yaw={yaw} pitch={Math.PI / 4} distance={10} onFps={setFps} />
                </>
              ) : (
                <MiniGameMount
                  key={mode.runId}
                  portalId={mode.portalId}
                  onComplete={onRoundComplete}
                  handleRef={sceneHandleRef}
                />
              )}
            </Canvas>
          </Suspense>
          {/* Hub-only overlays */}
          {mode.kind === "hub" && toast !== null && <Toast message={toast} onHide={() => setToast(null)} />}
          {mode.kind === "hub" && SHOW_FPS && <FpsOverlay fps={fps} />}
          {/* Mini-game overlays */}
          {mode.kind === "minigame" && (
            <>
              <BackButton onPress={() => sceneHandleRef.current?.abort()} />
              <NumberPad onPress={(n) => sceneHandleRef.current?.submitAnswer(n)} />
            </>
          )}
        </View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#7ec0ee" },
  canvas: { flex: 1 },
});
```

- [ ] **Step 10.2: Verify typecheck + tests**

Run: `cd /home/hfsearcy/git/institute && pnpm -r typecheck && pnpm -r test`
Expected: typecheck exit 0; all tests pass (M1's 29 + kid-app's 24 + plugin-engine's 11 + spell-cast's 14 = 78).

- [ ] **Step 10.3: Commit**

```bash
git add apps/kid-app/App.tsx
git commit -m "feat(kid-app): hub ↔ mini-game mode switching"
```

---

## Task 11 — Manual on-device verification + tag

**Files:**
- Modify: `apps/kid-app/test/manual-checklist.md` (append M2 section)

This task is paper + device. Subagent produces the checklist; user runs the actual checks on the Pixel.

- [ ] **Step 11.1: Append M2 section to the manual checklist**

Append to `apps/kid-app/test/manual-checklist.md`:

```markdown
---

## M2 manual on-device checks

After M2 ships, re-run on Fire HD 10 (or Pixel 6a as proxy):

- [ ] **Tap Spell Cast portal:** scene transitions to mini-game. Goblin (green capsule + eyes) visible at z=-3. Number pad appears at the bottom. Back × button at top-left.
- [ ] **Correct sequence:** tap 2, then 4, then 6, then 8, then 10. Each tap shrinks the goblin by ~20% scale. After tapping 10, scene returns to the hub within ~500ms.
- [ ] **Wrong answer:** tap, e.g., 5 first. Goblin shakes briefly; HP does not decrement; scene does NOT progress to the next step. (Tap 2 to recover and continue.)
- [ ] **Back button mid-round:** tap × at any point. Scene returns immediately to the hub without crashing.
- [ ] **Hub state preserved:** after returning from the mini-game, hub looks identical to before — same camera angle, tutor still bobbing, decor in place.
- [ ] **Other portals unchanged:** tapping Block Tower / Cookie Share / Door Code in the hub still shows the "Coming soon" toast (not the mini-game).
- [ ] **`console.log("[round complete]", result)` appears** in the Expo CLI / Metro output when a round finishes (status=completed) or aborts (status=aborted), with `outcomes` array populated.

If anything fails, look at:
- Mode-state transitions in App.tsx
- The `key={mode.runId}` on MiniGameMount (forces remount per run)
- Pan-gesture disablement in `onPan` (prevents orbit-during-round bugs)
```

- [ ] **Step 11.2: Commit**

```bash
git add apps/kid-app/test/manual-checklist.md
git commit -m "docs(kid-app): M2 on-device verification checks"
```

- [ ] **Step 11.3: Tag the milestone**

```bash
git tag m2-plugin-engine
```

---

## What this milestone proves

After M2:

1. The plugin contract (Zod-validated manifest + Scene + evaluate) is locked in code as `@institute/plugin-engine`.
2. New mini-games are added by dropping a folder under `packages/minigames/<id>/`. The kid app registers them via `MiniGameMount` and dispatches by portal id.
3. Spell Cast is playable end-to-end: portal tap → 3D scene → tap-to-answer → correct/wrong feedback → goblin defeated → return to hub. No LLM, no voice, no real assets.
4. The skeleton is in place for M5 (LLM picks/fills params instead of `FIXTURES`) and M6 (more mini-game folders + Forest zone), with no breaking changes to the contract anticipated.

## Out of scope for this plan (handled in later milestones)

- LLM-driven problem selection or `paramSchema` filling (M5).
- Voice input via mic / STT / kid-speech normalizer (M4).
- The other 3 mini-games (Block Tower, Cookie Share, Door Code) (M6).
- Wiring `RoundResult.outcomes` back to skill-engine's `applyOutcome` + SRS scheduler (M5).
- Real (non-procedural) 3D assets for goblin and other enemies (M6).
- Hub Forest zone, daily quest, gems, streaks, parent dashboard (M6, M7).
