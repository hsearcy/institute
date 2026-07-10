# Taxonomy Skill Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 6-skill linear ladder with a prerequisite graph of fine-grained topics curated from the Marble Skill Taxonomy (github.com/withmarbleapp/os-taxonomy), with per-topic mastery (including fluency/automaticity bars) gating unlocks.

**Architecture:** A one-time curation script filters the vendored taxonomy to a 15-topic arithmetic starter set, contracts prerequisite edges through excluded nodes, and emits a static `shared/src/topics.json`. Pure modules (`graph.ts` for unlock/frontier computation, `topicgen.ts` for topic→problem generation, `mastery.ts` for the mastery rule) are unit-tested; `server/src/index.ts` wires them into new `topic_mastery` sqlite state and the existing LLM branch generator. Per-topic `evidence` strings from the taxonomy drive the LLM prompt; `assessmentPrompt` surfaces in the parent-facing `/mastery` view.

**Tech Stack:** Bun workspaces, TypeScript, Hono, bun:sqlite, zod, `bun test`, Anthropic SDK. No new dependencies.

**Explicitly out of scope (next plan):** spaced-repetition review scheduling and session interleaving. This plan only changes *what* the skill model is, not *when* topics are revisited.

**Branch:** execute on a dedicated worktree/branch `feat/taxonomy-graph` off `master`.

---

## Background for the implementer (zero context assumed)

- This is a Three.js gem-mine math game for one 6-year-old. Solving a math problem = mining a gem. The server (`server/src/index.ts`, single file) serves problems, records attempts, and tracks mastery. The client (`web/src/game/Game.ts`) renders the mine and calls the server via `web/src/game/tutor.ts`.
- **Today's model:** 6 skills in a fixed array (`shared/src/index.ts:7`), mastery per skill = ≥8 attempts at ≥85% accuracy (`server/src/index.ts:94`), advancement = next array index once mastered.
- **Target model:** curated micro-topics with prerequisite edges. A topic is **unlocked** when all its (contracted, hard) prerequisites are `mastered`. The **frontier** = unlocked ∧ not mastered. Problems are generated per-topic; some topics additionally require *fluency* (fast solves) to count as mastered.
- **Two problem-generation paths exist and both must keep working:** a deterministic local generator (`server/src/generate.ts`) used for the first problem and as LLM fallback, and an LLM path (`llmBranches`, `server/src/index.ts:390`) that pre-generates the next problem for both outcomes ("right"/"wrong") of the on-screen problem. The server re-computes answers from prompts and overrides the LLM when they disagree (`correctDraft`) — never weaken that.
- The taxonomy source repo is cloned at `/tmp/claude-1000/-home-hfsearcy-git-institute/4f386110-2f94-4903-b759-10a522f7acd0/scratchpad/os-taxonomy` (re-clone from https://github.com/withmarbleapp/os-taxonomy if missing).
- **License obligation:** ODbL 1.0 (database) + CC BY-SA 4.0 (Marble-authored text). Using it inside the app is a "produced work" — attribution required (Task 1 adds a NOTICE + README section). We do not redistribute modified taxonomy data beyond this repo.
- Run all commands from the repo root `~/git/institute`. This monorepo uses **Bun** (not pnpm/npm): `bun install`, `bun test`, `bun run …`.

## File structure

| File | Responsibility |
|---|---|
| `data/taxonomy/topics.json` (new, committed) | Vendored source subset: all 503 Mathematics topics from os-taxonomy |
| `data/taxonomy/dependencies.json` (new, committed) | Vendored source subset: dependency edges with both endpoints in Mathematics |
| `data/taxonomy/NOTICE` (new) | ODbL/CC BY-SA attribution |
| `scripts/import-taxonomy.mjs` (new) | One-time: filter a full os-taxonomy checkout → `data/taxonomy/` |
| `scripts/curation.ts` (new) | The curated topic list: taxonomy IDs + per-topic GenSpec, fluency bar, kid label, legacy skill |
| `scripts/curate-topics.ts` (new) | Reads `data/taxonomy/` + `curation.ts`, contracts prereq edges, emits `shared/src/topics.json` |
| `scripts/contract-graph.ts` (new) | Pure edge-contraction algorithm (imported by curate-topics; unit-tested) |
| `shared/src/topics.json` (generated, committed) | The curated topic set the app runs on |
| `shared/src/topics.ts` (new) | `TopicSchema`, `GenSpec` types, loads/validates topics.json, lookup helpers |
| `shared/src/index.ts` (modify) | Re-export topics module; add optional `topicId`/`topicLabel` to `ProblemSchema`, `topicId` to `AttemptSchema` |
| `server/src/graph.ts` (new) | Pure: `unlockedTopics(masteredIds)`, `frontierTopics(masteredIds)` |
| `server/src/topicgen.ts` (new) | Pure: `problemForTopic(topic, difficulty)` — GenSpec interpreter |
| `server/src/mastery.ts` (new) | Pure: `topicState(...)` mastery rule incl. fluency; `median` |
| `server/src/index.ts` (modify) | `topic_mastery` table + `attempts.topic_id` column, migration from legacy mastery, topic-aware `/tutor/first`, `adaptivePlan`, LLM prompt, `/tutor/attempt`, `/mastery` |
| `server/src/generate.ts` (modify) | `pickStart` deprecated in favor of topic-based start (keep `localProblem` for legacy fallback) |
| `web/src/game/tutor.ts` (modify) | Pass `topicId` through `recordAttempt` |
| `web/src/game/Game.ts` (modify) | Send `problem.topicId` with attempts; prefer `problem.topicLabel` for any skill-label display |
| `server/src/*.test.ts` (new) | Unit tests colocated with modules |
| `scripts/contract-graph.test.ts` (new) | Contraction algorithm tests |
| `server/src/integration.test.ts` (new) | HTTP-level flow test against `:memory:` sqlite |

## The curated starter set (locked in — IDs verified against os-taxonomy v1)

Curation criterion: **assessable by a typed integer answer** (procedural topics plus the conceptual ones our generators can genuinely check). `fluentMs` = median first-try solve-time bar for mastery (null = accuracy only). `legacySkill` keeps the client's existing gem visuals and the old mastery table working.

| # | Taxonomy ID | Name | GenSpec | fluentMs | legacySkill | kidLabel |
|---|---|---|---|---|---|---|
| 1 | `mt_M5PPDJStGm` | Rote counting to 100 | `{kind:"next_number", max:100}` | null | skip_counting | Counting |
| 2 | `mt_ghF3Vv6taM` | Fluent adding and subtracting within 5 | `{kind:"add_sub", max:5}` | 7000 | add_within_20 | Add & Take to 5 |
| 3 | `mt_e8CZ7E5qW7` | Number bonds to 9 | `{kind:"missing_addend", totalMax:10}` | null | add_within_20 | Number Bonds |
| 4 | `mt__we2TDqnJx` | Fluent adding and subtracting within 10 | `{kind:"add_sub", max:10}` | 6000 | add_within_20 | Add & Take to 10 |
| 5 | `mt_m1W6nTQJ2b` | Addition and subtraction within 20 | `{kind:"add_sub", max:20, carry:true}` | null | add_within_20 | Add & Take to 20 |
| 6 | `mt__t4afSyZRm` | Fluent adding and subtracting within 20 | `{kind:"add_sub", max:20, carry:true}` | 8000 | add_within_20 | Lightning 20s |
| 7 | `mt_Zx1xZM-RbX` | Adding Three Small Numbers | `{kind:"add3", sumMax:20}` | null | add_within_20 | Triple Add |
| 8 | `mt_ezc2m_0dzN` | Finding a missing number in addition | `{kind:"missing_addend", totalMax:20}` | null | add_within_20 | Mystery Number |
| 9 | `mt_nvdpxAJTBG` | Counting in 2s | `{kind:"skip", steps:[2]}` | null | skip_counting | Counting by 2s |
| 10 | `mt_kw7xmp68rU` | 10 More or 10 Less | `{kind:"ten_more_less", max:90}` | null | place_value | Ten Jumps |
| 11 | `mt_THl9GLxwoL` | The two digits of a two-digit number | `{kind:"compose_tens", tensMax:9}` | null | place_value | Tens & Ones |
| 12 | `mt_I5j1ZWo2cn` | Adding and subtracting tens mentally | `{kind:"add_sub_tens"}` | null | place_value | Tens Math |
| 13 | `mt_PZ909yPrEC` | Multiplication as repeated addition | `{kind:"mul", tables:[2,5,10]}` | null | multiplication | Groups Of |
| 14 | `mt_HhuSDxwDNM` | Times tables | `{kind:"mul_div", tables:[2,5,10]}` | 7000 | multiplication | Times Tables |
| 15 | `mt_LpSuPgL31x` | Division as equal sharing | `{kind:"div", divisors:[2,3,4,5], quotientMax:5}` | null | division | Fair Shares |

Prereq edges are NOT hand-authored — the curation script derives them by contracting the taxonomy's hard edges through excluded nodes (Task 2). Against the real data this yields **8 roots** (Counting, Add & Take to 5, Number Bonds, Triple Add, Mystery Number, Tens & Ones, Groups Of, Fair Shares — their taxonomy prereqs are conceptual topics we excluded) and the load-bearing chains hold: AddTake5/NumBonds → AddTake10 → AddTake20 → Lightning 20s; Counting by 2s → Times Tables; Tens & Ones → Ten Jumps → Tens Math. 8 roots is correct, not a bug — a fresh player gets a wide easy frontier, which is fine for v1 (interleaving comes next plan).

**Legacy-mastery migration map** (old skill `mastered` ⇒ grant these topic IDs as mastered, so the boy's frontier lands where he already is):

```
add_within_20  → mt_ghF3Vv6taM, mt_e8CZ7E5qW7
subtraction    → mt_ghF3Vv6taM
skip_counting  → mt_M5PPDJStGm, mt_nvdpxAJTBG
place_value    → mt_THl9GLxwoL
multiplication → mt_PZ909yPrEC
division       → mt_LpSuPgL31x
```

---

### Task 0: Test harness for server + shared

**Files:**
- Modify: `server/package.json`, `package.json` (root)

- [ ] **Step 1: Add test scripts**

In `server/package.json` `"scripts"` add: `"test": "bun test src scripts"` → actually keep it simple: `"test": "bun test"` (bun discovers `*.test.ts` under the package). In root `package.json` `"scripts"` add: `"test": "bun test server scripts shared"`.

- [ ] **Step 2: Verify the runner works**

Run: `bun test server scripts shared` from repo root.
Expected: `0 tests` (no failures, exits 0). Bun prints "no tests found" — that's fine.

- [ ] **Step 3: Commit**

```bash
git add package.json server/package.json
git commit -m "chore(institute): wire bun test for server/shared/scripts"
```

(All commits in this plan end with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.)

---

### Task 1: Vendor the taxonomy source + attribution

**Files:**
- Create: `scripts/import-taxonomy.mjs`, `data/taxonomy/NOTICE`
- Generate + commit: `data/taxonomy/topics.json`, `data/taxonomy/dependencies.json`

- [ ] **Step 1: Write the import script**

```js
// scripts/import-taxonomy.mjs — one-time: filter an os-taxonomy checkout to Mathematics.
// Usage: bun scripts/import-taxonomy.mjs /path/to/os-taxonomy
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const src = process.argv[2];
if (!src) { console.error("usage: bun scripts/import-taxonomy.mjs <os-taxonomy dir>"); process.exit(1); }

const topics = JSON.parse(readFileSync(join(src, "data/topics.json"), "utf8")).topics;
const deps = JSON.parse(readFileSync(join(src, "data/dependencies.json"), "utf8")).dependencies;

const math = topics.filter((t) => t.subject === "Mathematics");
const mathIds = new Set(math.map((t) => t.id));
// Keep only edges internal to Mathematics (drops e.g. "Number Words" → phonics edges).
const mathDeps = deps.filter((d) => mathIds.has(d.topicId) && mathIds.has(d.prerequisiteId));

mkdirSync("data/taxonomy", { recursive: true });
writeFileSync("data/taxonomy/topics.json", JSON.stringify({ topics: math }, null, 1));
writeFileSync("data/taxonomy/dependencies.json", JSON.stringify({ dependencies: mathDeps }, null, 1));
console.log(`wrote ${math.length} topics, ${mathDeps.length} edges`);
```

- [ ] **Step 2: Run it against the checkout**

Run: `bun scripts/import-taxonomy.mjs /tmp/claude-1000/-home-hfsearcy-git-institute/4f386110-2f94-4903-b759-10a522f7acd0/scratchpad/os-taxonomy`
Expected: `wrote 503 topics, 985 edges`

- [ ] **Step 3: Write `data/taxonomy/NOTICE`**

```
This directory contains a Mathematics-subject extract of the
Marble Skill Taxonomy (v1) · © Generative Spark, Inc. (Marble)
https://withmarble.com · https://github.com/withmarbleapp/os-taxonomy

Database licensed under ODbL 1.0; Marble-authored textual content
(descriptions, evidence, assessment prompts, dependency reasons)
licensed under CC BY-SA 4.0. The Institute app is a "produced work"
built on this database. Modifications: filtered to subject =
"Mathematics"; cross-subject dependency edges removed.
```

- [ ] **Step 4: Add a README attribution section**

Append to `README.md` (create the section if the file is minimal):

```markdown
## Curriculum data

The skill graph is curated from the [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy)
(v1) · © Generative Spark, Inc. (Marble) · https://withmarble.com — database under
ODbL 1.0, Marble-authored content under CC BY-SA 4.0. See `data/taxonomy/NOTICE`.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/import-taxonomy.mjs data/taxonomy README.md
git commit -m "feat(institute): vendor Marble taxonomy Mathematics subset with attribution"
```

---

### Task 2: Graph contraction + curation script → `shared/src/topics.json`

**Files:**
- Create: `scripts/contract-graph.ts`, `scripts/contract-graph.test.ts`, `scripts/curation.ts`, `scripts/curate-topics.ts`
- Generate + commit: `shared/src/topics.json`

- [ ] **Step 1: Write the failing contraction test**

```ts
// scripts/contract-graph.test.ts
import { describe, expect, test } from "bun:test";
import { contractEdges } from "./contract-graph.ts";

// A ← B ← C ← D (X ← Y means "Y depends on X"). Curated = {A, C, D}.
// B is excluded, so C's dependency on B must contract to A.
const edges = [
  { topicId: "B", prerequisiteId: "A", strength: "hard" },
  { topicId: "C", prerequisiteId: "B", strength: "hard" },
  { topicId: "D", prerequisiteId: "C", strength: "hard" },
];

describe("contractEdges", () => {
  test("contracts through excluded nodes", () => {
    const out = contractEdges(edges, new Set(["A", "C", "D"]));
    expect(out.get("C")).toEqual(["A"]);
    expect(out.get("D")).toEqual(["C"]);
    expect(out.get("A")).toEqual([]);
  });
  test("ignores soft edges", () => {
    const soft = [{ topicId: "C", prerequisiteId: "A", strength: "soft" }];
    expect(contractEdges(soft, new Set(["A", "C"])).get("C")).toEqual([]);
  });
  test("stops at the first curated ancestor (no skipping past it)", () => {
    // D ← C ← B ← A, all hard, curated {A, C, D}: D must get C only, not also A.
    const out = contractEdges(edges, new Set(["A", "C", "D"]));
    expect(out.get("D")).toEqual(["C"]);
  });
  test("dedupes diamond paths", () => {
    // Z depends on X via two excluded intermediates.
    const dia = [
      { topicId: "m1", prerequisiteId: "X", strength: "hard" },
      { topicId: "m2", prerequisiteId: "X", strength: "hard" },
      { topicId: "Z", prerequisiteId: "m1", strength: "hard" },
      { topicId: "Z", prerequisiteId: "m2", strength: "hard" },
    ];
    expect(contractEdges(dia, new Set(["X", "Z"])).get("Z")).toEqual(["X"]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bun test scripts/contract-graph.test.ts`
Expected: FAIL — module `./contract-graph.ts` not found.

- [ ] **Step 3: Implement the contraction**

```ts
// scripts/contract-graph.ts — contract taxonomy prereq edges onto a curated subset.
// For each curated topic, walk hard-prereq ancestors; the nearest curated ancestor
// on each path becomes a direct prereq (excluded intermediates are skipped over).
export type Edge = { topicId: string; prerequisiteId: string; strength: string };

export function contractEdges(edges: Edge[], curated: Set<string>): Map<string, string[]> {
  const hardPrereqs = new Map<string, string[]>();
  for (const e of edges) {
    if (e.strength !== "hard") continue;
    const arr = hardPrereqs.get(e.topicId) ?? [];
    arr.push(e.prerequisiteId);
    hardPrereqs.set(e.topicId, arr);
  }
  const out = new Map<string, string[]>();
  for (const id of curated) {
    const found = new Set<string>();
    const seen = new Set<string>([id]);
    const queue = [...(hardPrereqs.get(id) ?? [])];
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (curated.has(cur)) { found.add(cur); continue; } // stop at curated ancestor
      queue.push(...(hardPrereqs.get(cur) ?? []));
    }
    out.set(id, [...found].sort());
  }
  return out;
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `bun test scripts/contract-graph.test.ts` → 4 pass.

- [ ] **Step 5: Write the curation config**

```ts
// scripts/curation.ts — THE curated topic list. Adding a topic to the game = add a
// row here (+ a GenSpec) and re-run `bun scripts/curate-topics.ts`.
import type { GenSpec } from "../shared/src/topics.ts"; // type-only; safe before topics.json exists

export type CurationRow = {
  id: string;             // taxonomy id (mt_…)
  kidLabel: string;       // short HUD label
  legacySkill: "add_within_20" | "subtraction" | "skip_counting" | "place_value" | "multiplication" | "division";
  gen: GenSpec;
  fluentMs: number | null; // median first-try solve-time bar for mastery (null = accuracy only)
};

export const CURATION: CurationRow[] = [
  { id: "mt_M5PPDJStGm", kidLabel: "Counting",        legacySkill: "skip_counting",  gen: { kind: "next_number", max: 100 },                 fluentMs: null },
  { id: "mt_ghF3Vv6taM", kidLabel: "Add & Take to 5", legacySkill: "add_within_20",  gen: { kind: "add_sub", max: 5 },                        fluentMs: 7000 },
  { id: "mt_e8CZ7E5qW7", kidLabel: "Number Bonds",    legacySkill: "add_within_20",  gen: { kind: "missing_addend", totalMax: 10 },           fluentMs: null },
  { id: "mt__we2TDqnJx", kidLabel: "Add & Take to 10",legacySkill: "add_within_20",  gen: { kind: "add_sub", max: 10 },                       fluentMs: 6000 },
  { id: "mt_m1W6nTQJ2b", kidLabel: "Add & Take to 20",legacySkill: "add_within_20",  gen: { kind: "add_sub", max: 20, carry: true },          fluentMs: null },
  { id: "mt__t4afSyZRm", kidLabel: "Lightning 20s",   legacySkill: "add_within_20",  gen: { kind: "add_sub", max: 20, carry: true },          fluentMs: 8000 },
  { id: "mt_Zx1xZM-RbX", kidLabel: "Triple Add",      legacySkill: "add_within_20",  gen: { kind: "add3", sumMax: 20 },                       fluentMs: null },
  { id: "mt_ezc2m_0dzN", kidLabel: "Mystery Number",  legacySkill: "add_within_20",  gen: { kind: "missing_addend", totalMax: 20 },           fluentMs: null },
  { id: "mt_nvdpxAJTBG", kidLabel: "Counting by 2s",  legacySkill: "skip_counting",  gen: { kind: "skip", steps: [2] },                       fluentMs: null },
  { id: "mt_kw7xmp68rU", kidLabel: "Ten Jumps",       legacySkill: "place_value",    gen: { kind: "ten_more_less", max: 90 },                 fluentMs: null },
  { id: "mt_THl9GLxwoL", kidLabel: "Tens & Ones",     legacySkill: "place_value",    gen: { kind: "compose_tens", tensMax: 9 },               fluentMs: null },
  { id: "mt_I5j1ZWo2cn", kidLabel: "Tens Math",       legacySkill: "place_value",    gen: { kind: "add_sub_tens" },                           fluentMs: null },
  { id: "mt_PZ909yPrEC", kidLabel: "Groups Of",       legacySkill: "multiplication", gen: { kind: "mul", tables: [2, 5, 10] },                fluentMs: null },
  { id: "mt_HhuSDxwDNM", kidLabel: "Times Tables",    legacySkill: "multiplication", gen: { kind: "mul_div", tables: [2, 5, 10] },            fluentMs: 7000 },
  { id: "mt_LpSuPgL31x", kidLabel: "Fair Shares",     legacySkill: "division",       gen: { kind: "div", divisors: [2, 3, 4, 5], quotientMax: 5 }, fluentMs: null },
];
```

- [ ] **Step 6: Write the curate script**

```ts
// scripts/curate-topics.ts — emit shared/src/topics.json from vendored taxonomy + curation.
import { readFileSync, writeFileSync } from "node:fs";
import { contractEdges, type Edge } from "./contract-graph.ts";
import { CURATION } from "./curation.ts";

const topics = JSON.parse(readFileSync("data/taxonomy/topics.json", "utf8")).topics as any[];
const deps = JSON.parse(readFileSync("data/taxonomy/dependencies.json", "utf8")).dependencies as Edge[];
const byId = new Map(topics.map((t) => [t.id, t]));

const curatedIds = new Set(CURATION.map((c) => c.id));
for (const c of CURATION) if (!byId.has(c.id)) throw new Error(`unknown taxonomy id ${c.id}`);
const prereqs = contractEdges(deps, curatedIds);

const out = CURATION.map((c) => {
  const t = byId.get(c.id)!;
  return {
    id: c.id,
    name: t.name,
    kidLabel: c.kidLabel,
    domain: t.domain,
    ageRange: [t.ageRangeStart, t.ageRangeEnd],
    description: t.description,
    evidence: t.evidence,
    assessmentPrompt: t.assessmentPrompt,
    legacySkill: c.legacySkill,
    gen: c.gen,
    fluentMs: c.fluentMs,
    prereqs: prereqs.get(c.id) ?? [],
  };
});

// Sanity: DAG (no cycles among curated), at least one root.
const roots = out.filter((t) => t.prereqs.length === 0);
if (roots.length === 0) throw new Error("no root topics — graph is unstartable");
writeFileSync(
  "shared/src/topics.json",
  JSON.stringify({ _attribution: "Marble Skill Taxonomy v1 © Generative Spark, Inc. — ODbL 1.0 / CC BY-SA 4.0 — see data/taxonomy/NOTICE", topics: out }, null, 1),
);
console.log(`wrote ${out.length} topics; roots: ${roots.map((r) => r.name).join(" | ")}`);
```

Note: the `import type { GenSpec }` from `shared/src/topics.ts` doesn't exist until Task 3. To keep this task self-contained, define `GenSpec` locally in `curation.ts` for now and swap the import in Task 3 — OR do Task 3's type file first. **Simplest: inline the `GenSpec` type union in `curation.ts` in this task; Task 3 moves it to `shared/src/topics.ts` and re-imports.** The union:

```ts
export type GenSpec =
  | { kind: "add_sub"; max: number; carry?: boolean }
  | { kind: "missing_addend"; totalMax: number }
  | { kind: "add3"; sumMax: number }
  | { kind: "next_number"; max: number }
  | { kind: "skip"; steps: number[] }
  | { kind: "ten_more_less"; max: number }
  | { kind: "compose_tens"; tensMax: number }
  | { kind: "add_sub_tens" }
  | { kind: "mul"; tables: number[] }
  | { kind: "mul_div"; tables: number[] }
  | { kind: "div"; divisors: number[]; quotientMax: number };
```

- [ ] **Step 7: Run the curate script and eyeball the graph**

Run: `bun scripts/curate-topics.ts`
Expected: `wrote 15 topics; roots: …` with **8 roots** (Counting, Add & Take to 5, Number Bonds, Triple Add, Mystery Number, Tens & Ones, Groups Of, Fair Shares). Then inspect: `bun -e 'const t=(await Bun.file("shared/src/topics.json").json()).topics; for (const x of t) console.log(x.kidLabel, "<-", x.prereqs.map(p=>t.find(y=>y.id===p)?.kidLabel ?? p).join(", ") || "(root)")'`

Verify the load-bearing chains printed match: *Add & Take to 10* ← {Add & Take to 5, Number Bonds}; *Add & Take to 20* ← {Number Bonds, Add & Take to 10}; *Lightning 20s* ← {Add & Take to 20, Add & Take to 10}; *Times Tables* ← Counting by 2s (± Groups Of); *Ten Jumps* / *Tens Math* ← Tens & Ones. Exact edge sets may differ slightly — what matters is that every non-root topic is reachable from the roots and no chain is inverted. If a topic is unreachable, the fix belongs in the CURATION list (add a bridging topic) — do not hand-edit topics.json.

- [ ] **Step 8: Run all tests**

Run: `bun test scripts` → contraction tests pass.

- [ ] **Step 9: Commit**

```bash
git add scripts/contract-graph.ts scripts/contract-graph.test.ts scripts/curation.ts scripts/curate-topics.ts shared/src/topics.json
git commit -m "feat(institute): curate 15-topic arithmetic skill graph from Marble taxonomy"
```

---

### Task 3: Shared topics module + schema extensions

**Files:**
- Create: `shared/src/topics.ts`, `shared/src/topics.test.ts`
- Modify: `shared/src/index.ts` (ProblemSchema, AttemptSchema, re-exports)

- [ ] **Step 1: Write the failing test**

```ts
// shared/src/topics.test.ts
import { describe, expect, test } from "bun:test";
import { TOPICS, topicById, TopicSchema } from "./topics.ts";

describe("curated topics", () => {
  test("loads and validates all topics", () => {
    expect(TOPICS.length).toBe(15);
    for (const t of TOPICS) expect(() => TopicSchema.parse(t)).not.toThrow();
  });
  test("every prereq id resolves", () => {
    for (const t of TOPICS) for (const p of t.prereqs) expect(topicById(p)).toBeDefined();
  });
  test("graph is acyclic", () => {
    const state = new Map<string, number>(); // 0 visiting, 1 done
    const visit = (id: string): void => {
      if (state.get(id) === 1) return;
      if (state.get(id) === 0) throw new Error(`cycle at ${id}`);
      state.set(id, 0);
      for (const p of topicById(id)!.prereqs) visit(p);
      state.set(id, 1);
    };
    for (const t of TOPICS) expect(() => visit(t.id)).not.toThrow();
  });
  test("has at least one root", () => {
    expect(TOPICS.some((t) => t.prereqs.length === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test shared` → FAIL (no `topics.ts`).

- [ ] **Step 3: Implement `shared/src/topics.ts`**

```ts
// The curated skill graph (from the Marble Skill Taxonomy — see data/taxonomy/NOTICE).
// Topics are the units of mastery; prereqs gate unlocking; GenSpec tells the server
// how to synthesize problems for a topic.
import { z } from "zod";
import raw from "./topics.json";

export const GenSpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add_sub"), max: z.number().int(), carry: z.boolean().optional() }),
  z.object({ kind: z.literal("missing_addend"), totalMax: z.number().int() }),
  z.object({ kind: z.literal("add3"), sumMax: z.number().int() }),
  z.object({ kind: z.literal("next_number"), max: z.number().int() }),
  z.object({ kind: z.literal("skip"), steps: z.array(z.number().int()).min(1) }),
  z.object({ kind: z.literal("ten_more_less"), max: z.number().int() }),
  z.object({ kind: z.literal("compose_tens"), tensMax: z.number().int() }),
  z.object({ kind: z.literal("add_sub_tens") }),
  z.object({ kind: z.literal("mul"), tables: z.array(z.number().int()).min(1) }),
  z.object({ kind: z.literal("mul_div"), tables: z.array(z.number().int()).min(1) }),
  z.object({ kind: z.literal("div"), divisors: z.array(z.number().int()).min(1), quotientMax: z.number().int() }),
]);
export type GenSpec = z.infer<typeof GenSpecSchema>;

export const TopicSchema = z.object({
  id: z.string(),
  name: z.string(),
  kidLabel: z.string(),
  domain: z.string(),
  ageRange: z.tuple([z.number(), z.number()]),
  description: z.string(),
  evidence: z.array(z.string()),
  assessmentPrompt: z.string(),
  legacySkill: z.string(),
  gen: GenSpecSchema,
  fluentMs: z.number().int().nullable(),
  prereqs: z.array(z.string()),
});
export type Topic = z.infer<typeof TopicSchema>;

export const TOPICS: Topic[] = z.object({ topics: z.array(TopicSchema) }).parse(raw).topics;
const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
export const topicById = (id: string): Topic | undefined => BY_ID.get(id);
```

Move the `GenSpec` type out of `scripts/curation.ts` and import it from here instead (`import type { GenSpec } from "../shared/src/topics.ts"`). Re-run `bun scripts/curate-topics.ts` to confirm it still works.

- [ ] **Step 4: Extend the shared schemas in `shared/src/index.ts`**

To `ProblemSchema` add (after `skill`):

```ts
  /** Curated-graph topic this problem exercises (Marble taxonomy id). */
  topicId: z.string().optional(),
  /** Short kid-facing topic label for the HUD, e.g. "Number Bonds". */
  topicLabel: z.string().optional(),
```

To `AttemptSchema` add: `topicId: z.string().optional(),`

At the bottom of `shared/src/index.ts` add: `export * from "./topics.ts";`

Note: `shared/package.json` has no `zod` resolveJsonModule concern — Bun imports JSON natively; ensure `web`'s `tsc` build still passes (Task 8 verifies; if tsc complains about the JSON import in shared, add `"resolveJsonModule": true` to `web/tsconfig.json` or whichever tsconfig compiles shared).

- [ ] **Step 5: Run tests** — `bun test shared` → all pass.

- [ ] **Step 6: Commit**

```bash
git add shared/src/topics.ts shared/src/topics.test.ts shared/src/index.ts scripts/curation.ts
git commit -m "feat(institute): shared topic schema + topicId on Problem/Attempt contracts"
```

---

### Task 4: `server/src/graph.ts` — unlock/frontier (pure)

**Files:**
- Create: `server/src/graph.ts`, `server/src/graph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/graph.test.ts
import { describe, expect, test } from "bun:test";
import { unlockedTopics, frontierTopics } from "./graph.ts";
import type { Topic } from "@institute/shared";

const t = (id: string, prereqs: string[]): Topic => ({
  id, name: id, kidLabel: id, domain: "d", ageRange: [5, 6], description: "",
  evidence: [], assessmentPrompt: "", legacySkill: "add_within_20",
  gen: { kind: "add_sub", max: 10 }, fluentMs: null, prereqs,
});
const G = [t("a", []), t("b", []), t("c", ["a"]), t("d", ["a", "b"]), t("e", ["d"])];

describe("unlockedTopics", () => {
  test("roots are always unlocked", () => {
    const ids = unlockedTopics(G, new Set()).map((x) => x.id);
    expect(ids.sort()).toEqual(["a", "b"]);
  });
  test("a topic unlocks when ALL prereqs are mastered", () => {
    expect(unlockedTopics(G, new Set(["a"])).map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
    expect(unlockedTopics(G, new Set(["a", "b"])).map((x) => x.id).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("frontierTopics", () => {
  test("frontier = unlocked and not yet mastered", () => {
    expect(frontierTopics(G, new Set(["a"])).map((x) => x.id).sort()).toEqual(["b", "c"]);
  });
  test("all mastered → empty frontier", () => {
    expect(frontierTopics(G, new Set(["a", "b", "c", "d", "e"]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test server/src/graph.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// server/src/graph.ts — pure unlock/frontier computation over the curated graph.
import type { Topic } from "@institute/shared";

/** Topics whose hard prereqs are ALL mastered (roots are always unlocked). */
export function unlockedTopics(topics: Topic[], mastered: Set<string>): Topic[] {
  return topics.filter((t) => t.prereqs.every((p) => mastered.has(p)));
}

/** Unlocked topics still being learned — where new problems come from. */
export function frontierTopics(topics: Topic[], mastered: Set<string>): Topic[] {
  return unlockedTopics(topics, mastered).filter((t) => !mastered.has(t.id));
}
```

- [ ] **Step 4: Run tests** — PASS. **Step 5: Commit**

```bash
git add server/src/graph.ts server/src/graph.test.ts
git commit -m "feat(institute): pure unlock/frontier computation over the topic graph"
```

---

### Task 5: `server/src/topicgen.ts` — GenSpec interpreter (pure)

**Files:**
- Create: `server/src/topicgen.ts`, `server/src/topicgen.test.ts`

Reuse `addHint`/`subHint` from `generate.ts` — export them from there (`export function addHint…`).

- [ ] **Step 1: Write the failing test**

```ts
// server/src/topicgen.test.ts
import { describe, expect, test } from "bun:test";
import { problemForTopic } from "./topicgen.ts";
import { TOPICS, topicById } from "@institute/shared";

const N = 200; // generators are random — property-test across many samples

describe("problemForTopic", () => {
  test("every curated topic generates valid problems across the difficulty range", () => {
    for (const t of TOPICS) {
      for (let i = 0; i < N; i++) {
        const d = i / (N - 1);
        const p = problemForTopic(t, d);
        expect(p.skill).toBe(t.legacySkill);
        expect(p.topicId).toBe(t.id);
        expect(Number.isInteger(p.answer)).toBe(true);
        expect(p.answer).toBeGreaterThanOrEqual(0);
        expect(p.answer).toBeLessThanOrEqual(999);
        expect(p.prompt.length).toBeGreaterThan(0);
        expect(p.prompt.length).toBeLessThanOrEqual(40);
        expect(p.spoken.length).toBeLessThanOrEqual(160);
      }
    }
  });
  test("add_sub within 5 stays within 5", () => {
    const t = topicById("mt_ghF3Vv6taM")!;
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t, Math.random());
      const m = p.prompt.replace(/[−]/g, "-").match(/^(\d+) ([+-]) (\d+)$/);
      expect(m).not.toBeNull();
      const [a, op, b] = [Number(m![1]), m![2], Number(m![3])];
      expect(op === "+" ? a + b : a).toBeLessThanOrEqual(5); // sum ≤5 / minuend ≤5
      expect(p.answer).toBe(op === "+" ? a + b : a - b);
    }
  });
  test("missing_addend answers the missing part", () => {
    const t = topicById("mt_e8CZ7E5qW7")!;
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t, Math.random());
      const m = p.prompt.match(/^(\d+) \+ \? = (\d+)$/);
      expect(m).not.toBeNull();
      expect(p.answer).toBe(Number(m![2]) - Number(m![1]));
    }
  });
  test("mul_div sometimes produces division", () => {
    const t = topicById("mt_HhuSDxwDNM")!;
    const kinds = new Set<string>();
    for (let i = 0; i < N; i++) kinds.add(problemForTopic(t, 0.8).prompt.includes("÷") ? "div" : "mul");
    expect(kinds.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (no module).

- [ ] **Step 3: Implement**

```ts
// server/src/topicgen.ts — synthesize a problem for a curated topic. The GenSpec is
// the topic's numeric envelope; difficulty (0..1) scales *within* it.
import type { Topic } from "@institute/shared";
import { addHint, subHint, type ProblemDraft } from "./generate.ts";

const ri = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const lerp = (lo: number, hi: number, d: number) => Math.round(lo + (hi - lo) * Math.max(0, Math.min(1, d)));

export type TopicProblemDraft = ProblemDraft & { topicId: string; topicLabel: string };

export function problemForTopic(topic: Topic, difficulty: number): TopicProblemDraft {
  const d = Math.max(0, Math.min(1, difficulty));
  const g = topic.gen;
  const base = { skill: topic.legacySkill as ProblemDraft["skill"], difficulty: d, topicId: topic.id, topicLabel: topic.kidLabel };

  switch (g.kind) {
    case "add_sub": {
      const cap = Math.max(4, lerp(Math.ceil(g.max / 2), g.max, d));
      if (Math.random() < 0.5) {
        // addition: sum ≤ cap; when carry allowed and d high, prefer crossing ten
        let a: number, b: number;
        if (g.carry && cap > 10 && d > 0.6) { a = ri(4, 9); b = ri(Math.max(2, 11 - a), Math.min(9, cap - a)); }
        else { a = ri(1, cap - 1); b = ri(1, cap - a); }
        return { ...base, prompt: `${a} + ${b}`, spoken: `What is ${a} plus ${b}?`, answer: a + b, hint: addHint(a, b) };
      }
      const a = ri(2, cap), b = ri(1, a);
      return { ...base, prompt: `${a} − ${b}`, spoken: `What is ${a} minus ${b}?`, answer: a - b, hint: subHint(a, b) };
    }
    case "missing_addend": {
      const total = ri(Math.max(4, lerp(4, g.totalMax, d) - 3), lerp(5, g.totalMax, d));
      const a = ri(1, total - 1);
      return { ...base, prompt: `${a} + ? = ${total}`, spoken: `${a} plus what makes ${total}?`, answer: total - a,
        hint: `Count up from ${a} until you reach ${total}. How many hops?` };
    }
    case "add3": {
      const cap = lerp(9, g.sumMax, d);
      const a = ri(1, Math.max(1, cap - 4)), b = ri(1, Math.max(1, cap - a - 2)), c = ri(1, Math.max(1, cap - a - b));
      return { ...base, prompt: `${a} + ${b} + ${c}`, spoken: `What is ${a} plus ${b} plus ${c}?`, answer: a + b + c,
        hint: `Add two first: ${a} plus ${b} is ${a + b}. Then add ${c} more.` };
    }
    case "next_number": {
      const n = ri(lerp(5, 40, d), lerp(20, g.max - 1, d));
      return { ...base, prompt: `${n}, then?`, spoken: `What number comes right after ${n}?`, answer: n + 1,
        hint: `Count on: ${n}, and one more.` };
    }
    case "skip": {
      const step = g.steps[ri(0, g.steps.length - 1)];
      const start = step * ri(1, lerp(1, 5, d));
      const seq = [start, start + step, start + 2 * step];
      return { ...base, prompt: `${seq.join(", ")}, ?`, spoken: `Keep counting by ${step}s. ${seq.join(", ")}… what comes next?`,
        answer: start + 3 * step, hint: `Add ${step} to the last number: ${seq[2]} plus ${step}.` };
    }
    case "ten_more_less": {
      const n = ri(11, lerp(40, g.max, d));
      const more = Math.random() < 0.5;
      return { ...base, prompt: `${n} ${more ? "+" : "−"} 10`, spoken: `What is ten ${more ? "more" : "less"} than ${n}?`,
        answer: more ? n + 10 : n - 10, hint: `Only the tens digit changes: ${Math.floor(n / 10)} tens goes ${more ? "up" : "down"} by one.` };
    }
    case "compose_tens": {
      const tens = ri(1, lerp(3, g.tensMax, d)), ones = ri(0, 9);
      return { ...base, prompt: `${tens} tens ${ones} ones`, spoken: `${tens} tens and ${ones} ones make what number?`,
        answer: tens * 10 + ones, hint: `${tens} tens is ${tens * 10}, then add ${ones} more.` };
    }
    case "add_sub_tens": {
      const a = 10 * ri(1, lerp(3, 6, d));
      if (Math.random() < 0.5) {
        const b = 10 * ri(1, Math.min(9, Math.floor((90 - a) / 10)));
        return { ...base, prompt: `${a} + ${b}`, spoken: `What is ${a} plus ${b}?`, answer: a + b,
          hint: `Think in tens: ${a / 10} tens plus ${b / 10} tens.` };
      }
      const b = 10 * ri(1, a / 10);
      return { ...base, prompt: `${a} − ${b}`, spoken: `What is ${a} minus ${b}?`, answer: a - b,
        hint: `Think in tens: ${a / 10} tens take away ${b / 10} tens.` };
    }
    case "mul": case "mul_div": {
      const t = g.tables[ri(0, g.tables.length - 1)];
      const k = ri(2, lerp(3, 9, d));
      if (g.kind === "mul_div" && Math.random() < 0.4) {
        return { ...base, prompt: `${t * k} ÷ ${t}`, spoken: `What is ${t * k} divided by ${t}?`, answer: k,
          hint: `How many ${t}s make ${t * k}? Count by ${t}s.` };
      }
      return { ...base, prompt: `${t} × ${k}`, spoken: `What is ${t} times ${k}?`, answer: t * k,
        hint: `${k} groups of ${t}. Skip-count by ${t}, ${k} times.` };
    }
    case "div": {
      const b = g.divisors[ri(0, g.divisors.length - 1)];
      const q = ri(2, Math.max(2, lerp(2, g.quotientMax, d)));
      return { ...base, prompt: `${b * q} ÷ ${b}`, spoken: `If you share ${b * q} gems between ${b} friends, how many does each get?`,
        answer: q, hint: `Deal them out one at a time to ${b} friends, or count by ${b}s up to ${b * q}.` };
    }
  }
}
```

- [ ] **Step 4: Export `addHint`/`subHint` from `generate.ts`** (add `export` keywords; no behavior change).

- [ ] **Step 5: Run tests** — `bun test server` → PASS (fix any range bugs the property test catches — that's its job).

- [ ] **Step 6: Commit**

```bash
git add server/src/topicgen.ts server/src/topicgen.test.ts server/src/generate.ts
git commit -m "feat(institute): GenSpec interpreter — per-topic problem synthesis"
```

---

### Task 6: `server/src/mastery.ts` — mastery rule with fluency (pure)

**Files:**
- Create: `server/src/mastery.ts`, `server/src/mastery.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/mastery.test.ts
import { describe, expect, test } from "bun:test";
import { topicState, median } from "./mastery.ts";

describe("median", () => {
  test("odd/even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(Infinity); // no data ⇒ never passes a fluency bar
  });
});

describe("topicState", () => {
  test("needs ≥8 attempts and ≥85% accuracy", () => {
    expect(topicState({ attempts: 7, correct: 7, recentSolveMs: [], fluentMs: null })).toBe("practicing");
    expect(topicState({ attempts: 8, correct: 6, recentSolveMs: [], fluentMs: null })).toBe("practicing");
    expect(topicState({ attempts: 8, correct: 7, recentSolveMs: [], fluentMs: null })).toBe("mastered");
  });
  test("fluency topics also need fast median solves", () => {
    const slow = { attempts: 10, correct: 10, recentSolveMs: [9000, 8000, 7000], fluentMs: 6000 };
    expect(topicState(slow)).toBe("practicing");
    const fast = { ...slow, recentSolveMs: [3000, 5000, 4000] };
    expect(topicState(fast)).toBe("mastered");
  });
});
```

- [ ] **Step 2: Run to verify failure.** **Step 3: Implement**

```ts
// server/src/mastery.ts — the mastery rule. Accuracy for every topic; fluency
// topics (fluentMs set) additionally require fast first-try solves — automaticity,
// not just correctness.
export function median(xs: number[]): number {
  if (xs.length === 0) return Infinity;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function topicState(m: {
  attempts: number; correct: number; recentSolveMs: number[]; fluentMs: number | null;
}): "practicing" | "mastered" {
  const accurate = m.attempts >= 8 && m.correct / m.attempts >= 0.85;
  if (!accurate) return "practicing";
  if (m.fluentMs !== null && median(m.recentSolveMs) > m.fluentMs) return "practicing";
  return "mastered";
}
```

- [ ] **Step 4: Run tests → PASS.** **Step 5: Commit**

```bash
git add server/src/mastery.ts server/src/mastery.test.ts
git commit -m "feat(institute): topic mastery rule with fluency (automaticity) bar"
```

---

### Task 7: Wire the server — DB, migration, endpoints, LLM prompt

**Files:**
- Modify: `server/src/index.ts`
- Create: `server/src/integration.test.ts`

This is the big wiring task. Work in the listed order; the integration test is written FIRST and drives the whole task.

- [ ] **Step 1: Write the failing integration test**

```ts
// server/src/integration.test.ts — end-to-end over app.fetch with :memory: sqlite.
process.env.DB_PATH = ":memory:";
process.env.ANTHROPIC_API_KEY = "test-key-no-network";
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9"; // instant connection refusal → LLM calls fail fast → local fallback path (no real network dependency)
const { default: server } = await import("./index.ts");
import { describe, expect, test } from "bun:test";
import { TOPICS } from "@institute/shared";

const call = async (method: string, path: string, body?: unknown) => {
  const res = await server.fetch(
    new Request(`http://x${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return res.json() as Promise<any>;
};

describe("topic-graph tutor flow", () => {
  test("first problem comes from a root topic and carries topicId + label", async () => {
    const p = await call("POST", "/tutor/first", { profileId: "kid1" });
    const topic = TOPICS.find((t) => t.id === p.topicId);
    expect(topic).toBeDefined();
    expect(topic!.prereqs).toEqual([]); // nothing mastered yet ⇒ must be a root
    expect(p.topicLabel).toBe(topic!.kidLabel);
    expect(typeof p.answer).toBe("number");
  });

  test("mastering ALL prereqs of a topic unlocks it", async () => {
    // Deterministic: Add & Take to 10 (mt__we2TDqnJx) requires BOTH roots
    // Add & Take to 5 (mt_ghF3Vv6taM) and Number Bonds (mt_e8CZ7E5qW7).
    const target = TOPICS.find((t) => t.id === "mt__we2TDqnJx")!;
    expect(target.prereqs.sort()).toEqual(["mt_e8CZ7E5qW7", "mt_ghF3Vv6taM"]);

    const master = async (topicId: string) => {
      for (let i = 0; i < 8; i++) {
        await call("POST", "/tutor/attempt", {
          profileId: "kid2", problemId: `${topicId}-p${i}`, skill: "add_within_20",
          topicId, correct: true, solveMs: 2500, difficulty: 0.5,
        });
      }
    };

    await master("mt_ghF3Vv6taM");
    let m = await call("GET", "/mastery?profileId=kid2");
    expect(m.topics.find((t: any) => t.id === "mt_ghF3Vv6taM").state).toBe("mastered");
    // Only ONE of the two prereqs is mastered — target must stay locked.
    expect(m.topics.find((t: any) => t.id === "mt__we2TDqnJx").unlocked).toBe(false);

    await master("mt_e8CZ7E5qW7");
    m = await call("GET", "/mastery?profileId=kid2");
    expect(m.topics.find((t: any) => t.id === "mt__we2TDqnJx").unlocked).toBe(true);
    // …and /tutor/first now serves from the frontier, never a mastered root.
    const next = await call("POST", "/tutor/first", { profileId: "kid2" });
    expect(["mt_ghF3Vv6taM", "mt_e8CZ7E5qW7"]).not.toContain(next.topicId);
  });

  test("fluency topics stay practicing when solves are slow", async () => {
    // use a fluency root directly: Add & Take to 5 (fluentMs 7000)
    for (let i = 0; i < 10; i++) {
      await call("POST", "/tutor/attempt", {
        profileId: "kid3", problemId: `p${i}`, skill: "add_within_20",
        topicId: "mt_ghF3Vv6taM", correct: true, solveMs: 15000, difficulty: 0.5,
      });
    }
    const m = await call("GET", "/mastery?profileId=kid3");
    expect(m.topics.find((t: any) => t.id === "mt_ghF3Vv6taM").state).toBe("practicing");
  });

  test("branches fall back locally and stay on the current topic", async () => {
    const first = await call("POST", "/tutor/first", { profileId: "kid4" });
    const b = await call("POST", "/tutor/branches", { profileId: "kid4", current: first });
    expect(b.right.topicId).toBeDefined();
    expect(b.wrong.topicId).toBe(first.topicId); // wrong branch reinforces same topic
    expect(b.right.difficulty).toBeGreaterThan(b.wrong.difficulty);
  });

  test("legacy mastery rows migrate to topic grants", async () => {
    // The migration function is exported for testability.
    const { grantLegacyMastery } = await import("./index.ts");
    grantLegacyMastery("kid5", ["add_within_20"]);
    const m = await call("GET", "/mastery?profileId=kid5");
    expect(m.topics.find((t: any) => t.id === "mt_ghF3Vv6taM").state).toBe("mastered");
    expect(m.topics.find((t: any) => t.id === "mt_e8CZ7E5qW7").state).toBe("mastered");
    // ⇒ Add & Take to 10 unlocked
    expect(m.topics.find((t: any) => t.id === "mt__we2TDqnJx").unlocked).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test server/src/integration.test.ts` → FAIL (endpoints don't know topics yet). **Note:** the Anthropic constructor at `index.ts:269` must tolerate a dummy key — it does (fails only at request time, which the fallback catches).

- [ ] **Step 3: DB schema + migration in `index.ts`** (after the existing `db.exec`, ~line 74)

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS topic_mastery (
    profile_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    last_difficulty REAL NOT NULL DEFAULT 0.4,
    state TEXT NOT NULL DEFAULT 'practicing',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, topic_id)
  );
`);
try { db.exec(`ALTER TABLE attempts ADD COLUMN topic_id TEXT`); } catch { /* column exists */ }
```

Add the imports: `TOPICS, topicById` from `@institute/shared`; `frontierTopics, unlockedTopics` from `./graph.ts`; `problemForTopic` from `./topicgen.ts`; `topicState, median` from `./mastery.ts`.

- [ ] **Step 4: Legacy migration (exported for the test)**

```ts
/** Map an old-model mastered skill onto curated-topic grants (synthetic 8/8). */
const LEGACY_GRANTS: Record<string, string[]> = {
  add_within_20: ["mt_ghF3Vv6taM", "mt_e8CZ7E5qW7"],
  subtraction: ["mt_ghF3Vv6taM"],
  skip_counting: ["mt_M5PPDJStGm", "mt_nvdpxAJTBG"],
  place_value: ["mt_THl9GLxwoL"],
  multiplication: ["mt_PZ909yPrEC"],
  division: ["mt_LpSuPgL31x"],
};

export function grantLegacyMastery(profileId: string, masteredSkills: string[]): void {
  for (const skill of masteredSkills) {
    for (const topicId of LEGACY_GRANTS[skill] ?? []) {
      db.query(
        `INSERT INTO topic_mastery (profile_id, topic_id, attempts, correct, last_difficulty, state, updated_at)
         VALUES (?, ?, 8, 8, 0.5, 'mastered', ?)
         ON CONFLICT(profile_id, topic_id) DO NOTHING`,
      ).run(profileId, topicId, Date.now());
    }
  }
}

// One-shot startup migration: any profile with legacy mastered skills but no
// topic_mastery rows gets its grants.
for (const row of db.query(
  `SELECT DISTINCT profile_id FROM mastery WHERE state = 'mastered'
   AND profile_id NOT IN (SELECT DISTINCT profile_id FROM topic_mastery)`,
).all() as { profile_id: string }[]) {
  const skills = (db.query(`SELECT skill FROM mastery WHERE profile_id = ? AND state = 'mastered'`)
    .all(row.profile_id) as { skill: string }[]).map((r) => r.skill);
  grantLegacyMastery(row.profile_id, skills);
}
```

- [ ] **Step 5: Topic mastery recording + reads**

```ts
type TopicMasteryRow = { topic_id: string; attempts: number; correct: number; last_difficulty: number; state: string };

function topicMasteryRows(profileId: string): TopicMasteryRow[] {
  return db.query(
    `SELECT topic_id, attempts, correct, last_difficulty, state FROM topic_mastery WHERE profile_id = ?`,
  ).all(profileId) as TopicMasteryRow[];
}
const masteredTopicIds = (profileId: string): Set<string> =>
  new Set(topicMasteryRows(profileId).filter((r) => r.state === "mastered").map((r) => r.topic_id));

/** Upsert per-topic mastery after an attempt; fluency uses the last 8 first-try solves. */
function recordTopicMastery(profileId: string, topicId: string, correct: boolean, difficulty: number): void {
  const topic = topicById(topicId);
  if (!topic) return;
  const row = db.query(`SELECT attempts, correct FROM topic_mastery WHERE profile_id = ? AND topic_id = ?`)
    .get(profileId, topicId) as { attempts: number; correct: number } | null;
  const attempts = (row?.attempts ?? 0) + 1;
  const corr = (row?.correct ?? 0) + (correct ? 1 : 0);
  const recent = (db.query(
    `SELECT solve_ms FROM attempts WHERE profile_id = ? AND topic_id = ? AND correct = 1
     ORDER BY created_at DESC LIMIT 8`,
  ).all(profileId, topicId) as { solve_ms: number }[]).map((r) => r.solve_ms);
  const state = topicState({ attempts, correct: corr, recentSolveMs: recent, fluentMs: topic.fluentMs });
  db.query(
    `INSERT INTO topic_mastery (profile_id, topic_id, attempts, correct, last_difficulty, state, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, topic_id) DO UPDATE SET
       attempts = excluded.attempts, correct = excluded.correct,
       last_difficulty = excluded.last_difficulty, state = excluded.state, updated_at = excluded.updated_at`,
  ).run(profileId, topicId, attempts, corr, difficulty, state, Date.now());
}
```

- [ ] **Step 6: Topic-aware first problem** — replace the body of `/tutor/first`:

```ts
/** Choose the next topic to serve: prefer the in-progress frontier topic with the
 *  most attempts (finish what's started), else the youngest frontier topic. */
function pickStartTopic(profileId: string) {
  const rows = topicMasteryRows(profileId);
  const byTopic = new Map(rows.map((r) => [r.topic_id, r]));
  const frontier = frontierTopics(TOPICS, masteredTopicIds(profileId));
  if (frontier.length === 0) {
    // Everything mastered — keep him playing at the oldest-age (deepest) topic.
    const deepest = [...TOPICS].sort((a, b) => b.ageRange[0] - a.ageRange[0])[0];
    return { topic: deepest, difficulty: 0.8 };
  }
  frontier.sort((a, b) => {
    const pa = byTopic.get(a.id)?.attempts ?? 0, pb = byTopic.get(b.id)?.attempts ?? 0;
    if (pa !== pb) return pb - pa;
    return a.ageRange[0] - b.ageRange[0];
  });
  const topic = frontier[0];
  const st = byTopic.get(topic.id);
  const acc = st && st.attempts >= 3 ? st.correct / st.attempts : 0.6;
  const base = st?.last_difficulty ?? 0.4;
  const difficulty = Math.max(0.2, Math.min(0.95, base + (acc - 0.75) * 0.5));
  return { topic, difficulty };
}

app.post("/tutor/first", async (c) => {
  const { profileId } = StartRequestSchema.parse(await c.req.json());
  const { topic, difficulty } = pickStartTopic(profileId);
  const problem = stampId(problemForTopic(topic, difficulty));
  notePrompt(profileId, problem.prompt);
  return c.json(problem);
});
```

(`stampId` already spreads the draft, so `topicId`/`topicLabel` flow through. The old `pickStart` import from `generate.ts` can be removed.)

- [ ] **Step 7: Topic-aware adaptivity + LLM prompt**

In `adaptivePlan`: replace the `advanceSkill` computation. New signature takes the current topic:

```ts
const curTopic = current.topicId ? topicById(current.topicId) : undefined;
// advance = current topic just mastered ⇒ suggest the next frontier topic
const mastered = masteredTopicIds(profileId);
const advanceTopic = curTopic && mastered.has(curTopic.id)
  ? frontierTopics(TOPICS, mastered).find((t) => t.id !== curTopic.id) ?? null
  : null;
```

(`adaptivePlan` will need `profileId` as a parameter — thread it through from `llmBranches`. Keep `rightTarget`/`wrongTarget`/`solveTag` math unchanged, but compute `recentAcc` filtering by `topic_id = current.topicId` when present, falling back to skill.)

In `SYSTEM`: delete the two hardcoded per-skill rule lines (`- add_within_20: …` and `- subtraction: …`) and the `- Stay mostly in addition-within-20…` line. Add one line: `- You will be told the exact TOPIC each branch must exercise, with its teaching goal and evidence of mastery. Stay inside that topic's numeric envelope.`

In `llmBranches`' `userContent`, replace `describeLearner(sums)` block additions with a topic block (keep describeLearner too — it's still useful context):

```ts
const topicBlock = (t: Topic, target: number) => [
  `TOPIC: ${t.name} (${t.kidLabel})`,
  `Goal: ${t.description}`,
  `Mastery looks like: ${t.evidence.join("; ")}`,
  `Example of the right shape: "${problemForTopic(t, target).prompt}"`,
].join("\n");
```

Right branch uses `advanceTopic ?? curTopic ?? fallback-by-skill`; wrong branch always uses `curTopic`. After validation, **stamp authority over the model**: `right = { ...right, topicId: rightTopic.id, topicLabel: rightTopic.kidLabel, skill: rightTopic.legacySkill }` (same for wrong). The `freshLocal` fallback becomes `stampId(problemForTopic(topic, difficulty))` with the same repeat-avoidance loop.

Update `localBranches(current)` similarly: when `current.topicId` resolves, use `problemForTopic(topic, d±0.12)`; else keep the old `localProblem` path (safety for stale clients).

- [ ] **Step 8: `/tutor/attempt` records topic mastery**

After the existing `INSERT INTO attempts` (add `topic_id` to the column list + values) and `recordMastery(...)` call, add:

```ts
if (typeof body.topicId === "string") recordTopicMastery(profileId, body.topicId, !!correct, difficulty);
```

Keep `recordMastery` (legacy skill) untouched — the old parent view and any historical queries stay coherent.

- [ ] **Step 9: `/mastery` returns the topic graph**

Replace the endpoint body:

```ts
app.get("/mastery", (c) => {
  const profileId = c.req.query("profileId") ?? "sam";
  const kidName = c.req.query("name") ?? "your child";
  const rows = new Map(topicMasteryRows(profileId).map((r) => [r.topic_id, r]));
  const mastered = masteredTopicIds(profileId);
  const unlocked = new Set(unlockedTopics(TOPICS, mastered).map((t) => t.id));
  const topics = TOPICS.map((t) => {
    const r = rows.get(t.id);
    return {
      id: t.id, name: t.name, kidLabel: t.kidLabel, domain: t.domain,
      prereqs: t.prereqs, unlocked: unlocked.has(t.id),
      attempts: r?.attempts ?? 0, correct: r?.correct ?? 0,
      state: r?.state ?? "unstarted",
      fluentMs: t.fluentMs,
      assessmentPrompt: t.assessmentPrompt.replaceAll("{{name}}", kidName),
    };
  });
  return c.json({ profileId, topics });
});
```

- [ ] **Step 10: Run the integration test until green**

Run: `bun test server` → all unit + integration tests pass. Then run the FULL suite: `bun test server shared scripts`.

- [ ] **Step 11: Commit**

```bash
git add server/src/index.ts server/src/integration.test.ts
git commit -m "feat(institute): topic-graph tutor — unlock gating, fluency mastery, topic-aware LLM branches"
```

---

### Task 8: Client passthrough

**Files:**
- Modify: `web/src/game/tutor.ts` (`recordAttempt` signature), `web/src/game/Game.ts` (attempt call site + any skill-label display)

- [ ] **Step 1: Thread topicId through `recordAttempt`**

In `tutor.ts`, add `topicId?: string` to the `recordAttempt` parameter object (it already spreads `...a` into the POST body — no other change).

- [ ] **Step 2: Find the call sites in Game.ts**

Run: `grep -n "recordAttempt\|SKILL_LABELS\|\.skill" web/src/game/Game.ts web/src/game/hud.ts`

At each `recordAttempt({...})` call, add `topicId: problem.topicId` (the current `Problem` object is in scope — verify the local variable name at the call site). If the HUD displays a skill label anywhere (check `hud.ts` for `SKILL_LABELS`), prefer `problem.topicLabel ?? SKILL_LABELS[problem.skill]`.

- [ ] **Step 3: Typecheck the web build**

Run: `bun run --cwd web build`
Expected: tsc + vite succeed. If tsc fails on shared's JSON import, add `"resolveJsonModule": true` to the tsconfig that compiles shared code.

- [ ] **Step 4: Commit**

```bash
git add web/src/game/tutor.ts web/src/game/Game.ts web/src/game/hud.ts
git commit -m "feat(institute): client sends topicId with attempts, shows topic labels"
```

---

### Task 9: End-to-end verification (real server, real flow)

**Files:** none (verification only) — use the `verify` skill if its checklist adds steps.

- [ ] **Step 1: Full test suite**

Run: `bun test server shared scripts` → everything green.

- [ ] **Step 2: Boot the real server against a scratch DB**

Run: `DB_PATH=/tmp/claude-1000/-home-hfsearcy-git-institute/4f386110-2f94-4903-b759-10a522f7acd0/scratchpad/verify.db bun --env-file=.env server/src/index.ts &` then:

```bash
curl -s localhost:8787/tutor/first -X POST -H 'Content-Type: application/json' -d '{"profileId":"verify"}'
# expect: a problem with topicId (a root topic) + topicLabel
curl -s "localhost:8787/mastery?profileId=verify&name=Sam"
# expect: 15 topics, roots unlocked, assessmentPrompt says "Sam"
```

Then POST `/tutor/branches` with the returned problem as `current` and confirm both branches carry `topicId` and the LLM path works with the real API key (watch server logs — no repeated `[tutor] LLM branches failed`, and no `[tutor] corrected` storm).

- [ ] **Step 3: Real gameplay check in the browser**

Run the web dev server (`bun run dev:web` + `dev:server`), load the game, solve 3 problems. Verify: problems appear instantly, hints still speak, gems still credit, and the served problems match the frontier topic (check the HUD label). **Screenshot the whole screen, not a crop** (house rule).

- [ ] **Step 4: Check the existing playtest script still passes**

Run: `node web/scripts/playtest.mjs` (inspect the script first for required env/servers). If it asserts on the old 6-skill behavior, update its assertions to the topic model rather than deleting them.

- [ ] **Step 5: Final commit (any verification fixes) + update the vault**

```bash
git add -A && git commit -m "feat(institute): taxonomy skill graph — verified end-to-end"
```

Note completion + any surprises in `~/git/sons_of_ares/02 PROJECTS/institute/Math Academy aligned tutor roadmap.md`.

---

## Risks / decisions already made (do not relitigate during execution)

- **Sequencing:** graph first, SRS/interleaving second — the scheduler must operate on topics, not legacy skills.
- **Both mastery tables coexist.** `mastery` (legacy, per-skill) keeps recording; `topic_mastery` is the new authority for unlocks. Cleanup happens after the SRS plan proves the model out.
- **The server stamps `topicId`/`skill` onto LLM drafts** — the model narrates, the code decides. Same philosophy as `correctDraft`.
- **`problemForTopic` may produce prompts the `arithmeticAnswer` checker can't parse** (`3 + ? = 10`, `4 tens 2 ones`). That's fine — `correctDraft` returns the draft unchanged when unparseable, and local generation computes its own answers. Do NOT try to make the checker parse everything.
- **Difficulty stays 0..1 within a topic** — the graph carries the between-topic progression now, so within-topic difficulty is a small dial, not the main ladder.
