# M1: Skill Engine + SRS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-TypeScript package that picks eligible math skills, tracks mastery state, and schedules spaced-repetition reviews — verifiable end-to-end via a simulated kid session, no UI/network/AI required.

**Architecture:** Standalone Bun-managed package (`packages/skill-engine/`) inside a Bun-workspaces monorepo. All logic is pure functions over plain data — no I/O, no time-of-day side effects (clock is injected), no platform dependencies. Tests use the built-in `bun:test` runner.

**Tech Stack:** TypeScript, Bun (workspaces + runtime + test runner), Zod (schema validation, set up here for use across later milestones).

---

## Reference

- Spec: `docs/superpowers/specs/2026-04-25-institute-design.md` (sections: *Math skill taxonomy & adaptive difficulty*, *Mini-game plugin framework → Schema validation*, *V1 milestones → M1*).
- Background reading on the algorithm: SM-2 (Anki) — we use a simplified, kid-tuned variant. Full SM-2 isn't needed at this scope.

## File structure produced by this plan

```
institute/
├── package.json                    # NEW: root, Bun workspaces
├── tsconfig.base.json              # NEW: shared TS config
├── .gitignore                      # MODIFY: add node_modules/, dist/
├── packages/
│   └── skill-engine/               # NEW
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── types.ts            # Skill, MasteryState, SkillState, AttemptOutcome
│       │   ├── skills.ts           # Full ~30-skill taxonomy
│       │   ├── taxonomy-utils.ts   # validateTaxonomy, prereqsOf, allDescendants
│       │   ├── mastery.ts          # applyOutcome(state, outcome) → state
│       │   ├── srs.ts              # scheduleNextReview(state, outcome, now) → SRS update
│       │   ├── pool.ts             # eligiblePool(states, taxonomy, now, opts) → SkillId[]
│       │   └── index.ts            # public API re-exports
│       ├── test/
│       │   ├── skills.test.ts
│       │   ├── mastery.test.ts
│       │   ├── srs.test.ts
│       │   └── pool.test.ts
│       └── scripts/
│           └── simulate-session.ts # demo: runs a hypothetical kid session
```

Each file has one responsibility:

- **types.ts** — types only, no logic
- **skills.ts** — taxonomy data only
- **taxonomy-utils.ts** — pure functions over the taxonomy
- **mastery.ts** — state transitions on `(state, outcome) → state`
- **srs.ts** — interval scheduling on `(state, outcome, now) → srs update`
- **pool.ts** — pool selection composing the above
- **index.ts** — what consumers import

This split keeps each file small, tightly scoped, and easy to test in isolation.

---

## Task 1 — Bootstrap the monorepo

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `bunfig.toml`
- Modify: `.gitignore`

- [ ] **Step 1.1: Create the root `package.json`**

```json
{
  "name": "institute",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "bun test",
    "typecheck": "bun run --filter '*' typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 1.2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["bun"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "noEmit": true
  }
}
```

- [ ] **Step 1.3: Create `bunfig.toml`**

```toml
[install]
exact = true
```

- [ ] **Step 1.4: Append to `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 1.5: Install root deps and verify**

Run: `bun install`
Expected: creates `bun.lock`, installs `typescript` and `@types/bun` to root `node_modules`.

Run: `bun test`
Expected: "0 tests" (no tests yet, but command succeeds).

- [ ] **Step 1.6: Commit**

```bash
git add package.json tsconfig.base.json bunfig.toml .gitignore bun.lock
git commit -m "chore: bootstrap Bun workspaces monorepo"
```

---

## Task 2 — Bootstrap `skill-engine` package

**Files:**
- Create: `packages/skill-engine/package.json`
- Create: `packages/skill-engine/tsconfig.json`
- Create: `packages/skill-engine/src/index.ts`
- Create: `packages/skill-engine/test/smoke.test.ts`

- [ ] **Step 2.1: Create `packages/skill-engine/package.json`**

```json
{
  "name": "@institute/skill-engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "simulate": "bun run scripts/simulate-session.ts"
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2.2: Create `packages/skill-engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*", "test/**/*", "scripts/**/*"]
}
```

- [ ] **Step 2.3: Create `packages/skill-engine/src/index.ts`**

```ts
export {};
```

- [ ] **Step 2.4: Create `packages/skill-engine/test/smoke.test.ts`**

```ts
import { test, expect } from "bun:test";

test("smoke: bun test runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 2.5: Install package deps**

Run: `bun install`
Expected: `zod` installed under `packages/skill-engine/node_modules` (or hoisted to root).

- [ ] **Step 2.6: Verify test runner**

Run: `cd packages/skill-engine && bun test`
Expected: `1 pass, 0 fail`.

- [ ] **Step 2.7: Verify typecheck**

Run: `cd packages/skill-engine && bun run typecheck`
Expected: exit 0, no output.

- [ ] **Step 2.8: Commit**

```bash
git add packages/skill-engine bun.lock
git commit -m "chore(skill-engine): scaffold package"
```

---

## Task 3 — Skill taxonomy

**Files:**
- Create: `packages/skill-engine/src/types.ts`
- Create: `packages/skill-engine/src/skills.ts`
- Create: `packages/skill-engine/src/taxonomy-utils.ts`
- Create: `packages/skill-engine/test/skills.test.ts`

- [ ] **Step 3.1: Write `types.ts` (taxonomy types only)**

```ts
// packages/skill-engine/src/types.ts

export type SkillId = string;

/**
 * A single math skill the system can practice and assess.
 * `prereqs` must be skills that are at least `practicing` before this one becomes eligible.
 * `difficultyBand` is the [min, max] difficulty (0..1) of problems generated for this skill.
 */
export type Skill = {
  id: SkillId;
  description: string;
  prereqs: SkillId[];
  difficultyBand: readonly [number, number];
};

export type Taxonomy = ReadonlyArray<Skill>;
```

- [ ] **Step 3.2: Write the failing test for the taxonomy**

```ts
// packages/skill-engine/test/skills.test.ts
import { test, expect, describe } from "bun:test";
import { TAXONOMY } from "../src/skills.ts";
import { validateTaxonomy } from "../src/taxonomy-utils.ts";

describe("TAXONOMY", () => {
  test("contains at least 25 skills", () => {
    expect(TAXONOMY.length).toBeGreaterThanOrEqual(25);
  });

  test("all skill ids are unique", () => {
    const ids = TAXONOMY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every prereq references an existing skill", () => {
    const ids = new Set(TAXONOMY.map((s) => s.id));
    for (const skill of TAXONOMY) {
      for (const p of skill.prereqs) {
        expect(ids.has(p)).toBe(true);
      }
    }
  });

  test("validateTaxonomy returns ok=true with no errors", () => {
    const result = validateTaxonomy(TAXONOMY);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("validateTaxonomy detects a cycle", () => {
    const bad = [
      { id: "a", description: "a", prereqs: ["b"], difficultyBand: [0, 1] as const },
      { id: "b", description: "b", prereqs: ["a"], difficultyBand: [0, 1] as const },
    ];
    const result = validateTaxonomy(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  test("validateTaxonomy detects difficultyBand inversion", () => {
    const bad = [
      { id: "a", description: "a", prereqs: [], difficultyBand: [0.8, 0.2] as const },
    ];
    const result = validateTaxonomy(bad);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3.3: Run the test to verify it fails**

Run: `cd packages/skill-engine && bun test test/skills.test.ts`
Expected: FAIL — `TAXONOMY` and `validateTaxonomy` do not yet exist.

- [ ] **Step 3.4: Implement `taxonomy-utils.ts`**

```ts
// packages/skill-engine/src/taxonomy-utils.ts
import type { Skill, SkillId, Taxonomy } from "./types.ts";

export type ValidationResult =
  | { ok: true; errors: [] }
  | { ok: false; errors: string[] };

export function validateTaxonomy(taxonomy: ReadonlyArray<Skill>): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<SkillId>();

  for (const s of taxonomy) {
    if (ids.has(s.id)) errors.push(`duplicate skill id: ${s.id}`);
    ids.add(s.id);
    const [lo, hi] = s.difficultyBand;
    if (!(lo >= 0 && hi <= 1 && lo <= hi)) {
      errors.push(`skill ${s.id}: invalid difficultyBand [${lo}, ${hi}]`);
    }
  }

  for (const s of taxonomy) {
    for (const p of s.prereqs) {
      if (!ids.has(p)) errors.push(`skill ${s.id} references unknown prereq: ${p}`);
    }
  }

  if (hasCycle(taxonomy)) errors.push("taxonomy contains a cycle");

  return errors.length === 0
    ? { ok: true, errors: [] }
    : { ok: false, errors };
}

function hasCycle(taxonomy: ReadonlyArray<Skill>): boolean {
  const adj = new Map<SkillId, SkillId[]>();
  for (const s of taxonomy) adj.set(s.id, [...s.prereqs]);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<SkillId, number>();
  for (const id of adj.keys()) color.set(id, WHITE);

  function dfs(id: SkillId): boolean {
    color.set(id, GRAY);
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next);
      if (c === GRAY) return true;
      if (c === WHITE && dfs(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const id of adj.keys()) {
    if (color.get(id) === WHITE && dfs(id)) return true;
  }
  return false;
}

export function prereqsOf(taxonomy: Taxonomy, id: SkillId): SkillId[] {
  return taxonomy.find((s) => s.id === id)?.prereqs ?? [];
}

export function getSkill(taxonomy: Taxonomy, id: SkillId): Skill | undefined {
  return taxonomy.find((s) => s.id === id);
}
```

- [ ] **Step 3.5: Implement `skills.ts` with the full taxonomy**

```ts
// packages/skill-engine/src/skills.ts
import type { Taxonomy } from "./types.ts";

const s = (
  id: string,
  description: string,
  prereqs: string[],
  difficultyBand: readonly [number, number],
) => ({ id, description, prereqs, difficultyBand });

export const TAXONOMY: Taxonomy = [
  s("counting_1_5",          "Count from 1 to 5",                            [],                                          [0.0, 0.15]),
  s("counting_1_10",         "Count from 1 to 10",                           ["counting_1_5"],                            [0.05, 0.2]),
  s("counting_1_20",         "Count from 1 to 20",                           ["counting_1_10"],                           [0.1, 0.25]),
  s("number_recognize_1_5",  "Recognize written numerals 1–5",               [],                                          [0.0, 0.15]),
  s("number_recognize_1_10", "Recognize written numerals 1–10",              ["number_recognize_1_5"],                    [0.05, 0.2]),
  s("number_recognize_1_20", "Recognize written numerals 1–20",              ["number_recognize_1_10"],                   [0.1, 0.25]),
  s("number_compare",        "Compare two numbers (which is greater?)",      ["counting_1_10", "number_recognize_1_10"],  [0.15, 0.3]),
  s("one_more",              "What number comes after?",                     ["counting_1_10"],                           [0.1, 0.25]),
  s("one_less",              "What number comes before?",                    ["counting_1_10"],                           [0.15, 0.3]),
  s("add_within_5",          "Addition within 5",                            ["counting_1_10", "number_recognize_1_10"],  [0.15, 0.3]),
  s("sub_within_5",          "Subtraction within 5",                         ["add_within_5"],                            [0.2, 0.35]),
  s("add_within_10",         "Addition within 10",                           ["add_within_5"],                            [0.25, 0.45]),
  s("sub_within_10",         "Subtraction within 10",                        ["sub_within_5", "add_within_10"],           [0.3, 0.5]),
  s("missing_addend_5",      "Missing addend within 5 (3 + ? = 5)",          ["add_within_5"],                            [0.25, 0.4]),
  s("missing_addend_10",     "Missing addend within 10",                     ["add_within_10", "missing_addend_5"],       [0.3, 0.5]),
  s("make_10",               "Find pairs that make 10",                      ["add_within_10"],                           [0.3, 0.5]),
  s("add_within_20",         "Addition within 20",                           ["add_within_10"],                           [0.4, 0.6]),
  s("sub_within_20",         "Subtraction within 20",                        ["sub_within_10", "add_within_20"],          [0.45, 0.65]),
  s("skip_count_2",          "Skip count by 2s to 20",                       ["counting_1_20"],                           [0.3, 0.5]),
  s("skip_count_5",          "Skip count by 5s to 50",                       ["counting_1_20"],                           [0.35, 0.55]),
  s("skip_count_10",         "Skip count by 10s to 100",                     ["counting_1_20"],                           [0.3, 0.5]),
  s("counting_to_100_by_10", "Count to 100 by tens",                         ["skip_count_10"],                           [0.4, 0.6]),
  s("sequence_next",         "What number comes next in a sequence",         ["skip_count_2", "add_within_10"],           [0.4, 0.6]),
  s("equal_sharing",         "Share N items equally between K friends",      ["counting_1_20"],                           [0.4, 0.6]),
  s("double_within_10",      "Doubles within 10 (4 + 4)",                    ["add_within_10"],                           [0.35, 0.55]),
  s("half_within_10",        "Halves within 10 (half of 8)",                 ["equal_sharing"],                           [0.45, 0.65]),
  s("place_value_tens",      "Place value: tens and ones",                   ["counting_to_100_by_10", "counting_1_20"],  [0.5, 0.7]),
  s("shape_recognize",       "Recognize basic 2D shapes",                    [],                                          [0.05, 0.2]),
  s("pattern_recognize",     "Continue a simple pattern (ABAB, ABBABB)",     [],                                          [0.1, 0.3]),
  s("greater_less_than",     "Use the symbols >, <, =",                      ["number_compare"],                          [0.4, 0.6]),
];
```

- [ ] **Step 3.6: Update `src/index.ts` to re-export**

```ts
// packages/skill-engine/src/index.ts
export type { Skill, SkillId, Taxonomy } from "./types.ts";
export { TAXONOMY } from "./skills.ts";
export { validateTaxonomy, prereqsOf, getSkill } from "./taxonomy-utils.ts";
```

- [ ] **Step 3.7: Run tests**

Run: `cd packages/skill-engine && bun test test/skills.test.ts`
Expected: 6 pass, 0 fail.

- [ ] **Step 3.8: Run typecheck**

Run: `cd packages/skill-engine && bun run typecheck`
Expected: exit 0.

- [ ] **Step 3.9: Commit**

```bash
git add packages/skill-engine/src packages/skill-engine/test
git commit -m "feat(skill-engine): full skill taxonomy + validation"
```

---

## Task 4 — Mastery state machine

**Files:**
- Modify: `packages/skill-engine/src/types.ts` (add mastery types)
- Create: `packages/skill-engine/src/mastery.ts`
- Create: `packages/skill-engine/test/mastery.test.ts`

- [ ] **Step 4.1: Add mastery types to `types.ts`**

Append to `packages/skill-engine/src/types.ts`:

```ts
export type MasteryState = "unstarted" | "learning" | "practicing" | "mastered" | "review";

/**
 * One attempt at a problem. Hinted means a hint was shown; scaffolded means
 * the kid used the tap-fallback grid (per spec, scaffolded attempts do NOT
 * count toward demotion).
 */
export type AttemptOutcome = {
  correct: boolean;
  hinted: boolean;
  scaffolded: boolean;
  difficulty: number; // 0..1
  occurredAt: Date;
};

export type SkillState = {
  profileId: string;
  skillId: SkillId;
  state: MasteryState;
  attempts: number;
  correct: number;
  /** Last 8 outcomes, newest last. */
  recentWindow: AttemptOutcome[];
  /** EWMA of recent problem difficulties (only correct, unhinted attempts). */
  currentDifficulty: number;
  /** SRS interval in days. 0 = not yet scheduled. */
  srsInterval: number;
  /** SRS ease factor (SM-2-style). 1.3..2.8. Default 2.5. */
  srsEase: number;
  /** When the next review is due. null until first transition into `review`. */
  nextReviewAt: Date | null;
  updatedAt: Date;
};

export const RECENT_WINDOW_SIZE = 8;
```

- [ ] **Step 4.2: Write the failing tests for mastery transitions**

```ts
// packages/skill-engine/test/mastery.test.ts
import { test, expect, describe } from "bun:test";
import { applyOutcome, initialSkillState } from "../src/mastery.ts";
import type { AttemptOutcome } from "../src/types.ts";

const at = (iso: string) => new Date(iso);

const outcome = (overrides: Partial<AttemptOutcome>): AttemptOutcome => ({
  correct: true,
  hinted: false,
  scaffolded: false,
  difficulty: 0.3,
  occurredAt: at("2026-04-25T10:00:00Z"),
  ...overrides,
});

describe("applyOutcome", () => {
  test("first correct moves unstarted → learning", () => {
    const s0 = initialSkillState("p1", "add_within_5");
    expect(s0.state).toBe("unstarted");
    const s1 = applyOutcome(s0, outcome({ correct: true }));
    expect(s1.state).toBe("learning");
    expect(s1.attempts).toBe(1);
    expect(s1.correct).toBe(1);
  });

  test("first wrong also moves unstarted → learning (not penalized)", () => {
    const s0 = initialSkillState("p1", "add_within_5");
    const s1 = applyOutcome(s0, outcome({ correct: false }));
    expect(s1.state).toBe("learning");
    expect(s1.attempts).toBe(1);
    expect(s1.correct).toBe(0);
  });

  test("learning → practicing on a correct attempt at low difficulty", () => {
    const s0 = initialSkillState("p1", "add_within_5");
    const s1 = applyOutcome(s0, outcome({ correct: true, difficulty: 0.15 }));
    const s2 = applyOutcome(s1, outcome({ correct: true, difficulty: 0.2 }));
    expect(s2.state).toBe("practicing");
  });

  test("practicing → mastered after 4 of last 5 correct, no hints, in upper band", () => {
    let s = initialSkillState("p1", "add_within_5");
    // Move to practicing
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    expect(s.state).toBe("practicing");
    // 5 correct attempts in upper band
    for (let i = 0; i < 5; i++) {
      s = applyOutcome(s, outcome({ correct: true, difficulty: 0.28, hinted: false }));
    }
    expect(s.state).toBe("mastered");
  });

  test("hinted attempts do not count toward mastery promotion", () => {
    let s = initialSkillState("p1", "add_within_5");
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    for (let i = 0; i < 5; i++) {
      s = applyOutcome(s, outcome({ correct: true, hinted: true, difficulty: 0.28 }));
    }
    expect(s.state).toBe("practicing");
  });

  test("2 unhinted wrongs in a row demote any state to learning", () => {
    let s = initialSkillState("p1", "add_within_5");
    // Get to practicing
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    expect(s.state).toBe("practicing");
    s = applyOutcome(s, outcome({ correct: false, difficulty: 0.3 }));
    s = applyOutcome(s, outcome({ correct: false, difficulty: 0.3 }));
    expect(s.state).toBe("learning");
  });

  test("scaffolded wrongs do NOT trigger demotion (per spec)", () => {
    let s = initialSkillState("p1", "add_within_5");
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    expect(s.state).toBe("practicing");
    s = applyOutcome(s, outcome({ correct: false, scaffolded: true, difficulty: 0.3 }));
    s = applyOutcome(s, outcome({ correct: false, scaffolded: true, difficulty: 0.3 }));
    expect(s.state).toBe("practicing");
  });

  test("recentWindow is bounded to the last 8 attempts", () => {
    let s = initialSkillState("p1", "counting_1_5");
    for (let i = 0; i < 12; i++) {
      s = applyOutcome(s, outcome({ correct: true, difficulty: 0.1 }));
    }
    expect(s.recentWindow.length).toBe(8);
    expect(s.attempts).toBe(12);
  });
});
```

- [ ] **Step 4.3: Run the test to verify it fails**

Run: `cd packages/skill-engine && bun test test/mastery.test.ts`
Expected: FAIL — `mastery.ts` does not yet export `applyOutcome` or `initialSkillState`.

- [ ] **Step 4.4: Implement `mastery.ts`**

```ts
// packages/skill-engine/src/mastery.ts
import {
  type AttemptOutcome,
  type MasteryState,
  type SkillId,
  type SkillState,
  RECENT_WINDOW_SIZE,
} from "./types.ts";

export function initialSkillState(profileId: string, skillId: SkillId): SkillState {
  return {
    profileId,
    skillId,
    state: "unstarted",
    attempts: 0,
    correct: 0,
    recentWindow: [],
    currentDifficulty: 0,
    srsInterval: 0,
    srsEase: 2.5,
    nextReviewAt: null,
    updatedAt: new Date(0),
  };
}

/**
 * Pure function: given the current SkillState and a new AttemptOutcome,
 * return the next SkillState. Does not call the SRS scheduler — that lives
 * in srs.ts and is composed by the eligible-pool layer.
 */
export function applyOutcome(state: SkillState, outcome: AttemptOutcome): SkillState {
  const recentWindow = [...state.recentWindow, outcome].slice(-RECENT_WINDOW_SIZE);
  const attempts = state.attempts + 1;
  const correct = state.correct + (outcome.correct ? 1 : 0);
  const currentDifficulty = updateDifficultyEwma(state.currentDifficulty, outcome);
  const nextState = nextMasteryState(state.state, recentWindow);

  return {
    ...state,
    state: nextState,
    attempts,
    correct,
    recentWindow,
    currentDifficulty,
    updatedAt: outcome.occurredAt,
  };
}

function updateDifficultyEwma(prev: number, o: AttemptOutcome): number {
  // Only update on correct, unhinted, non-scaffolded attempts — those are
  // the signal of "the kid is comfortable at this difficulty."
  if (!o.correct || o.hinted || o.scaffolded) return prev;
  const alpha = 0.3;
  return prev === 0 ? o.difficulty : prev * (1 - alpha) + o.difficulty * alpha;
}

function nextMasteryState(
  prev: MasteryState,
  recent: AttemptOutcome[],
): MasteryState {
  // Demotion: 2 unhinted, non-scaffolded wrongs in a row.
  if (recent.length >= 2) {
    const [a, b] = [recent[recent.length - 2], recent[recent.length - 1]];
    if (
      a && b &&
      !a.correct && !b.correct &&
      !a.scaffolded && !b.scaffolded &&
      !a.hinted && !b.hinted
    ) {
      return "learning";
    }
  }

  // Unstarted → learning on any first attempt.
  if (prev === "unstarted") return "learning";

  // Promotion: learning → practicing on 1 correct.
  if (prev === "learning") {
    if (recent.some((o) => o.correct)) return "practicing";
    return "learning";
  }

  // Promotion: practicing → mastered when last 5 unhinted attempts are
  // 4-of-5 correct AND at least one was in the upper half of difficulty.
  if (prev === "practicing") {
    const unhinted = recent.filter((o) => !o.hinted && !o.scaffolded);
    const last5 = unhinted.slice(-5);
    if (last5.length >= 5) {
      const correctCount = last5.filter((o) => o.correct).length;
      const sawHardEnough = last5.some((o) => o.correct && o.difficulty >= 0.25);
      if (correctCount >= 4 && sawHardEnough) return "mastered";
    }
    return "practicing";
  }

  // Mastered/review states are advanced by SRS, not by raw outcomes — we
  // only handle demotion here. Stay put otherwise.
  return prev;
}
```

- [ ] **Step 4.5: Update `src/index.ts`**

Append:

```ts
export type { MasteryState, AttemptOutcome, SkillState } from "./types.ts";
export { applyOutcome, initialSkillState } from "./mastery.ts";
```

- [ ] **Step 4.6: Run tests**

Run: `cd packages/skill-engine && bun test test/mastery.test.ts`
Expected: 7 pass, 0 fail.

- [ ] **Step 4.7: Run typecheck and full test suite**

Run: `cd packages/skill-engine && bun run typecheck && bun test`
Expected: exit 0; all tests pass.

- [ ] **Step 4.8: Commit**

```bash
git add packages/skill-engine/src packages/skill-engine/test
git commit -m "feat(skill-engine): mastery state machine"
```

---

## Task 5 — SRS scheduling

**Files:**
- Create: `packages/skill-engine/src/srs.ts`
- Create: `packages/skill-engine/test/srs.test.ts`
- Modify: `packages/skill-engine/src/index.ts`

- [ ] **Step 5.1: Write failing tests for `scheduleNextReview`**

```ts
// packages/skill-engine/test/srs.test.ts
import { test, expect, describe } from "bun:test";
import { scheduleNextReview, MAX_INTERVAL_DAYS } from "../src/srs.ts";
import { initialSkillState } from "../src/mastery.ts";

const day = (n: number) => 1000 * 60 * 60 * 24 * n;

describe("scheduleNextReview", () => {
  test("first correct schedules 1 day out", () => {
    const s = initialSkillState("p1", "add_within_5");
    const now = new Date("2026-04-25T10:00:00Z");
    const r = scheduleNextReview(s, { correct: true, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r.srsInterval).toBe(1);
    expect(r.nextReviewAt.getTime()).toBe(now.getTime() + day(1));
    expect(r.srsEase).toBeGreaterThanOrEqual(2.5);
  });

  test("second correct (after interval=1) schedules 2 days out", () => {
    const now = new Date("2026-04-25T10:00:00Z");
    const s = { ...initialSkillState("p1", "add_within_5"), srsInterval: 1, srsEase: 2.5 };
    const r = scheduleNextReview(s, { correct: true, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r.srsInterval).toBe(2);
  });

  test("third correct multiplies by ease (rounded)", () => {
    const now = new Date("2026-04-25T10:00:00Z");
    const s = { ...initialSkillState("p1", "add_within_5"), srsInterval: 2, srsEase: 2.5 };
    const r = scheduleNextReview(s, { correct: true, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r.srsInterval).toBe(5); // round(2 * 2.5)
  });

  test("wrong resets interval to 1 and lowers ease", () => {
    const now = new Date("2026-04-25T10:00:00Z");
    const s = { ...initialSkillState("p1", "add_within_5"), srsInterval: 8, srsEase: 2.5 };
    const r = scheduleNextReview(s, { correct: false, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r.srsInterval).toBe(1);
    expect(r.srsEase).toBeLessThan(2.5);
    expect(r.srsEase).toBeGreaterThanOrEqual(1.3);
  });

  test("ease is bounded at 1.3 (floor) and 2.8 (ceiling)", () => {
    const now = new Date("2026-04-25T10:00:00Z");
    let s = { ...initialSkillState("p1", "x"), srsInterval: 1, srsEase: 1.3 };
    const r1 = scheduleNextReview(s, { correct: false, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r1.srsEase).toBe(1.3);

    s = { ...initialSkillState("p1", "x"), srsInterval: 1, srsEase: 2.8 };
    const r2 = scheduleNextReview(s, { correct: true, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r2.srsEase).toBe(2.8);
  });

  test("interval is capped at MAX_INTERVAL_DAYS", () => {
    const now = new Date("2026-04-25T10:00:00Z");
    const s = { ...initialSkillState("p1", "x"), srsInterval: 30, srsEase: 2.5 };
    const r = scheduleNextReview(s, { correct: true, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r.srsInterval).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
  });
});
```

- [ ] **Step 5.2: Run the test to verify it fails**

Run: `cd packages/skill-engine && bun test test/srs.test.ts`
Expected: FAIL — `srs.ts` does not exist yet.

- [ ] **Step 5.3: Implement `srs.ts`**

```ts
// packages/skill-engine/src/srs.ts
import type { AttemptOutcome, SkillState } from "./types.ts";

/** Hard cap — kids forget fast; intervals beyond two weeks aren't useful. */
export const MAX_INTERVAL_DAYS = 14;

export type SrsUpdate = {
  srsInterval: number;
  srsEase: number;
  nextReviewAt: Date;
};

export function scheduleNextReview(
  state: SkillState,
  outcome: AttemptOutcome,
  now: Date,
): SrsUpdate {
  if (!outcome.correct) {
    const ease = clamp(state.srsEase - 0.2, 1.3, 2.8);
    return { srsInterval: 1, srsEase: ease, nextReviewAt: addDays(now, 1) };
  }

  const ease = clamp(state.srsEase + 0.05, 1.3, 2.8);
  let interval: number;
  if (state.srsInterval <= 0) interval = 1;
  else if (state.srsInterval === 1) interval = 2;
  else interval = Math.round(state.srsInterval * state.srsEase);

  interval = Math.min(interval, MAX_INTERVAL_DAYS);

  return { srsInterval: interval, srsEase: ease, nextReviewAt: addDays(now, interval) };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}
```

- [ ] **Step 5.4: Update `src/index.ts`**

Append:

```ts
export { scheduleNextReview, MAX_INTERVAL_DAYS } from "./srs.ts";
export type { SrsUpdate } from "./srs.ts";
```

- [ ] **Step 5.5: Run tests**

Run: `cd packages/skill-engine && bun test test/srs.test.ts`
Expected: 6 pass, 0 fail.

- [ ] **Step 5.6: Commit**

```bash
git add packages/skill-engine/src packages/skill-engine/test
git commit -m "feat(skill-engine): SM-2-style SRS scheduling"
```

---

## Task 6 — Eligible pool

**Files:**
- Create: `packages/skill-engine/src/pool.ts`
- Create: `packages/skill-engine/test/pool.test.ts`
- Modify: `packages/skill-engine/src/index.ts`

- [ ] **Step 6.1: Write failing tests**

```ts
// packages/skill-engine/test/pool.test.ts
import { test, expect, describe } from "bun:test";
import { eligiblePool, DEFAULT_POOL_SIZE } from "../src/pool.ts";
import { initialSkillState } from "../src/mastery.ts";
import { TAXONOMY } from "../src/skills.ts";
import type { SkillState } from "../src/types.ts";

const now = new Date("2026-04-25T10:00:00Z");

function profileWithStates(overrides: Record<string, Partial<SkillState>>): SkillState[] {
  return TAXONOMY.map((s) => ({
    ...initialSkillState("p1", s.id),
    ...(overrides[s.id] ?? {}),
  }));
}

describe("eligiblePool", () => {
  test("for a brand-new profile, returns the easiest no-prereq skill as the stretch", () => {
    const states = profileWithStates({});
    const pool = eligiblePool(states, TAXONOMY, now);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.length).toBeLessThanOrEqual(DEFAULT_POOL_SIZE);
    // Counting/recognize/shape/pattern are no-prereq skills. Should pull from there.
    expect(pool).toContain("counting_1_5");
  });

  test("includes all skills currently in 'learning' or 'practicing'", () => {
    const states = profileWithStates({
      counting_1_5: { state: "practicing" },
      add_within_5: { state: "learning" },
    });
    const pool = eligiblePool(states, TAXONOMY, now);
    expect(pool).toContain("counting_1_5");
    expect(pool).toContain("add_within_5");
  });

  test("includes skills whose nextReviewAt is due", () => {
    const states = profileWithStates({
      add_within_5: {
        state: "review",
        nextReviewAt: new Date(now.getTime() - 1000),
      },
      add_within_10: {
        state: "review",
        nextReviewAt: new Date(now.getTime() + 86_400_000), // tomorrow
      },
    });
    const pool = eligiblePool(states, TAXONOMY, now);
    expect(pool).toContain("add_within_5");
    expect(pool).not.toContain("add_within_10");
  });

  test("respects pool size cap", () => {
    const overrides: Record<string, Partial<SkillState>> = {};
    for (const skill of TAXONOMY) overrides[skill.id] = { state: "practicing" };
    const states = profileWithStates(overrides);
    const pool = eligiblePool(states, TAXONOMY, now, { maxPoolSize: 4 });
    expect(pool.length).toBe(4);
  });

  test("does not include a stretch skill whose prereqs are not at least practicing", () => {
    // sub_within_10 needs sub_within_5 + add_within_10. Leave both unstarted.
    const states = profileWithStates({});
    const pool = eligiblePool(states, TAXONOMY, now);
    expect(pool).not.toContain("sub_within_10");
  });

  test("when prereqs are met, the stretch slot can introduce one new skill", () => {
    const overrides: Record<string, Partial<SkillState>> = {};
    for (const s of TAXONOMY) overrides[s.id] = { state: "mastered" };
    overrides["add_within_20"] = { state: "unstarted" };
    const states = profileWithStates(overrides);
    const pool = eligiblePool(states, TAXONOMY, now);
    // add_within_20's prereq (add_within_10) is mastered → eligible as stretch
    expect(pool).toContain("add_within_20");
  });
});
```

- [ ] **Step 6.2: Run the test to verify it fails**

Run: `cd packages/skill-engine && bun test test/pool.test.ts`
Expected: FAIL — `pool.ts` does not exist yet.

- [ ] **Step 6.3: Implement `pool.ts`**

```ts
// packages/skill-engine/src/pool.ts
import type { SkillId, SkillState, Taxonomy } from "./types.ts";

export const DEFAULT_POOL_SIZE = 6;

export type EligiblePoolOptions = {
  maxPoolSize?: number;
};

/**
 * Returns the SkillIds the kid should be practicing today, in priority order:
 *   1. Skills currently due for review.
 *   2. Skills currently in `learning` or `practicing`.
 *   3. One stretch skill: the easiest unstarted skill whose every prereq is at
 *      least `practicing` (or `mastered`/`review`).
 * Capped to `maxPoolSize` (default 6).
 */
export function eligiblePool(
  states: SkillState[],
  taxonomy: Taxonomy,
  now: Date,
  opts: EligiblePoolOptions = {},
): SkillId[] {
  const cap = opts.maxPoolSize ?? DEFAULT_POOL_SIZE;
  const byId = new Map(states.map((s) => [s.skillId, s] as const));
  const result: SkillId[] = [];
  const seen = new Set<SkillId>();

  // 1. Due reviews
  for (const s of states) {
    if (s.state === "review" && s.nextReviewAt && s.nextReviewAt.getTime() <= now.getTime()) {
      if (!seen.has(s.skillId)) {
        result.push(s.skillId);
        seen.add(s.skillId);
      }
    }
  }

  // 2. Active learning/practicing
  for (const s of states) {
    if (s.state === "learning" || s.state === "practicing") {
      if (!seen.has(s.skillId)) {
        result.push(s.skillId);
        seen.add(s.skillId);
      }
    }
  }

  // 3. Stretch — easiest unstarted skill whose prereqs are all practicing+
  if (result.length < cap) {
    const stretch = pickStretch(taxonomy, byId, seen);
    if (stretch) {
      result.push(stretch);
      seen.add(stretch);
    }
  }

  return result.slice(0, cap);
}

function pickStretch(
  taxonomy: Taxonomy,
  byId: Map<SkillId, SkillState>,
  seen: Set<SkillId>,
): SkillId | undefined {
  // Sort by lower bound of difficultyBand ascending — easiest first.
  const candidates = [...taxonomy].sort(
    (a, b) => a.difficultyBand[0] - b.difficultyBand[0],
  );
  for (const skill of candidates) {
    if (seen.has(skill.id)) continue;
    const state = byId.get(skill.id);
    if (state && state.state !== "unstarted") continue;
    if (!prereqsMet(skill.prereqs, byId)) continue;
    return skill.id;
  }
  return undefined;
}

function prereqsMet(prereqs: SkillId[], byId: Map<SkillId, SkillState>): boolean {
  for (const p of prereqs) {
    const s = byId.get(p);
    if (!s) return false;
    if (s.state === "unstarted" || s.state === "learning") return false;
  }
  return true;
}
```

- [ ] **Step 6.4: Update `src/index.ts`**

Append:

```ts
export { eligiblePool, DEFAULT_POOL_SIZE } from "./pool.ts";
export type { EligiblePoolOptions } from "./pool.ts";
```

- [ ] **Step 6.5: Run tests**

Run: `cd packages/skill-engine && bun test test/pool.test.ts`
Expected: 6 pass, 0 fail.

- [ ] **Step 6.6: Run full suite + typecheck**

Run: `cd packages/skill-engine && bun run typecheck && bun test`
Expected: exit 0; all tests pass.

- [ ] **Step 6.7: Commit**

```bash
git add packages/skill-engine/src packages/skill-engine/test
git commit -m "feat(skill-engine): eligible pool selection"
```

---

## Task 7 — Simulated session script (M1 demo)

**Files:**
- Create: `packages/skill-engine/scripts/simulate-session.ts`

- [ ] **Step 7.1: Implement the simulation**

```ts
// packages/skill-engine/scripts/simulate-session.ts
import {
  TAXONOMY,
  initialSkillState,
  applyOutcome,
  scheduleNextReview,
  eligiblePool,
  type AttemptOutcome,
  type SkillState,
} from "../src/index.ts";

/**
 * A small toy simulation: pretend we're "Sam" practicing for 7 days. Each day,
 * we pick the eligible pool, simulate his performance with a known accuracy,
 * apply outcomes, advance SRS for transitions to mastered, and print state.
 *
 * No randomness in the structure — accuracy is parameterized so the run is
 * reproducible.
 */
const PROFILE_ID = "sam";
const ACCURACY = 0.85;

function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

function simulate() {
  const random = rng(42);
  let states: SkillState[] = TAXONOMY.map((s) => initialSkillState(PROFILE_ID, s.id));
  const startDay = new Date("2026-04-25T09:00:00Z");

  for (let day = 0; day < 7; day++) {
    const now = new Date(startDay.getTime() + day * 86_400_000);
    const pool = eligiblePool(states, TAXONOMY, now);
    console.log(`\n=== Day ${day + 1} (${now.toISOString().slice(0, 10)}) — pool: [${pool.join(", ")}] ===`);

    for (const skillId of pool) {
      // Practice 4 problems on each pool skill today
      for (let i = 0; i < 4; i++) {
        const correct = random() < ACCURACY;
        const skill = TAXONOMY.find((s) => s.id === skillId)!;
        const difficulty = skill.difficultyBand[0]
          + random() * (skill.difficultyBand[1] - skill.difficultyBand[0]);
        const outcome: AttemptOutcome = {
          correct,
          hinted: false,
          scaffolded: false,
          difficulty,
          occurredAt: now,
        };
        states = states.map((s) => {
          if (s.skillId !== skillId) return s;
          const advanced = applyOutcome(s, outcome);
          // If state just became mastered, schedule its first review.
          if (s.state !== "mastered" && advanced.state === "mastered") {
            const sched = scheduleNextReview(advanced, outcome, now);
            return {
              ...advanced,
              state: "review",
              srsInterval: sched.srsInterval,
              srsEase: sched.srsEase,
              nextReviewAt: sched.nextReviewAt,
            };
          }
          // For reviews, also advance SRS on every outcome.
          if (s.state === "review") {
            const sched = scheduleNextReview(advanced, outcome, now);
            return {
              ...advanced,
              srsInterval: sched.srsInterval,
              srsEase: sched.srsEase,
              nextReviewAt: sched.nextReviewAt,
            };
          }
          return advanced;
        });
      }

      const after = states.find((s) => s.skillId === skillId)!;
      console.log(`  ${skillId.padEnd(24)} state=${after.state.padEnd(10)} attempts=${after.attempts} correct=${after.correct} dif=${after.currentDifficulty.toFixed(2)}`);
    }
  }

  console.log("\n=== End-of-week summary ===");
  const counts: Record<string, number> = {};
  for (const s of states) counts[s.state] = (counts[s.state] ?? 0) + 1;
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
}

simulate();
```

- [ ] **Step 7.2: Run it end to end**

Run: `cd packages/skill-engine && bun run simulate`
Expected: 7 days of pool/state output, ending with a state-count summary. The summary should show: most skills moved past `unstarted`; some `practicing`/`mastered`/`review`; pool size capped at 6 each day.

- [ ] **Step 7.3: Eyeball sanity-check the output**

The output should be inspectable to confirm:
- Day 1 pool starts with no-prereq skills (counting_1_5, number_recognize_1_5, shape_recognize, pattern_recognize, etc.).
- Skills move `unstarted → learning → practicing` over days, not in one step (unless lucky).
- Once a skill hits `mastered`, it disappears from active pool until its `nextReviewAt` comes due.
- Pool always size ≤ 6.

If any of these are wrong, the bug is upstream — open an issue, don't paper over it in the script.

- [ ] **Step 7.4: Commit**

```bash
git add packages/skill-engine/scripts
git commit -m "feat(skill-engine): M1 simulated-session demo script"
```

- [ ] **Step 7.5: Tag the milestone**

```bash
git tag m1-skill-engine
```

---

## What this milestone proves

After M1, the skill-engine package can:

1. Hold a complete K–1st math taxonomy with prereqs.
2. Apply correct/incorrect outcomes to skill state and demote/promote per spec rules.
3. Schedule SM-2-style review intervals capped at 14 days.
4. Compute an eligible pool of skills to practice today, respecting prereqs and bounded size.
5. Run an end-to-end multi-day simulation in pure Node/Bun.

It is import-clean: no React, no React Native, no UI, no networking, no LLM, no AI. It can be unit-tested fully and rapidly.

## Open questions deferred to the next plan

- The taxonomy is a hand-written constant. M5 may require it to be loaded from the backend so that prompts/templates and curriculum stay in sync. Defer.
- `currentDifficulty` is computed but not yet *used* by anything — its consumer is the LLM problem-selection prompt in M5. That's fine; we capture it now.
- The simulation doesn't yet model "hint" or "scaffold" cases — leave that to M2/M4 when the actual UI generates those signals.
