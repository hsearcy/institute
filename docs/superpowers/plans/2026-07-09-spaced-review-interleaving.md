# Spaced Review + Interleaving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mastered topics come back for spaced review on growing intervals, mastery is computed over a recent window (so decayed skills demote themselves), and sessions interleave topics instead of grinding one — the remaining two Math Academy pillars, built on the topic graph shipped in `2026-07-09-taxonomy-skill-graph.md`.

**Architecture:** Two new pure modules carry the logic: `server/src/review.ts` (interval schedule) and `server/src/select.ts` (unified topic selection: due-reviews-first → stay-on-current up to a run cap → rotate to a different-domain frontier topic). `recordTopicMastery` switches to windowed accuracy and updates the review schedule; `pickStartTopic` and the LLM right-branch targeting are replaced by `selectNext`. Two nullable columns on `topic_mastery`; no new tables.

**Tech Stack:** unchanged (Bun, Hono, bun:sqlite, zod, bun test).

**Branch:** dedicated worktree `feat/spaced-review` off current `master`. NOTE: a parallel agent is building a parent dashboard in `web/` — do not touch `web/src/game/hud.ts` or `Game.ts` in this plan (nothing here needs the client; `topicLabel` already flows).

---

## Design decisions (settled — do not relitigate)

1. **Windowed mastery.** State = `attempts_lifetime ≥ 8` AND `windowed accuracy ≥ 0.85` (window = last 12 attempts on the topic from the `attempts` table) AND the fluency bar (unchanged: median of last 8 correct solves ≤ fluentMs). If the topic has **zero attempt rows** (legacy-granted mastery), fall back to the lifetime counters on `topic_mastery` — grants stay mastered until real attempts exist. Demotion is emergent: 2 misses in the recent 12 → below 85% → `practicing` → back into the frontier. One slip (11/12 = 92%) does NOT demote.
2. **Review schedule** (`topic_mastery.review_interval_days REAL`, `review_due_at INTEGER`, both nullable):
   - On the practicing→mastered transition: `interval = 1`, `due = now + 1d`.
   - Attempt on an already-mastered topic (= a review): correct → `interval = min(interval × 2, 30)`; wrong → `interval = 1`. Either way `due = now + interval` days.
   - Demoted topics keep their columns (ignored while practicing); re-mastery restarts at 1d.
   - Startup backfill: any `mastered` row with `review_due_at IS NULL` gets `interval = 1, due = now` — legacy grants (e.g. sam's) become due immediately, which deliberately verifies the granted knowledge in the first session.
3. **Selection** (`selectNext` — one pure function used by BOTH `/tutor/first` and the LLM right branch):
   - **Priority 1 — due review:** a mastered topic with `due ≤ now` (oldest due first), UNLESS the previous attempt was already a review (never two reviews back-to-back — reviews season the session, they don't take it over).
   - **Priority 2 — stay:** if there's a current topic that is still frontier (unlocked, not mastered) and the run of consecutive attempts on it is < 4, stay on it.
   - **Priority 3 — rotate:** pick a frontier topic ≠ current, preferring a **different domain** than the current topic (non-interference), then least-recently-attempted, then youngest `ageRange[0]`. Fall back to any frontier topic, then (all mastered, nothing due) the deepest topic by age.
   - Difficulty: reviews at `max(0.3, last_difficulty − 0.1)` (confidence-friendly re-entry); learning topics resume at their stored `last_difficulty` (clamped); the finer accuracy anchoring stays inside the LLM difficulty targets, not the selector.
   - Returns `{ topic, difficulty, mode: "review" | "learn" }`.
4. **Wrong branch never changes:** it stays on the current topic at reduced difficulty — struggling is the wrong moment to switch subjects.
5. **`/mastery` gains `reviewDueAt` + `reviewIntervalDays`** per topic (additive — the dashboard being built in parallel simply won't show them yet).
6. **Review problems are visually normal.** No client work; a review is just the next gem.

## File structure

| File | Responsibility |
|---|---|
| `server/src/review.ts` (new) | Pure: `nextReview(prev, correct, now)` interval math; `DAY_MS` |
| `server/src/review.test.ts` (new) | Interval schedule tests |
| `server/src/select.ts` (new) | Pure: `selectNext(args)` — the whole selection policy |
| `server/src/select.test.ts` (new) | Selection policy tests |
| `server/src/mastery.ts` (modify) | `topicState` gains windowed inputs (signature reshuffle, still pure) |
| `server/src/mastery.test.ts` (modify) | Window/fallback cases |
| `server/src/index.ts` (modify) | Columns + backfill; windowed `recordTopicMastery` + review updates; `selectNext` wiring in `/tutor/first` and `adaptivePlan`; `/mastery` fields |
| `server/src/integration.test.ts` (modify) | Review scheduling + interleaving over HTTP |

---

### Task 1: `review.ts` — interval schedule (pure, TDD)

**Files:** Create `server/src/review.ts`, `server/src/review.test.ts`

- [ ] **Step 1: Failing test**

```ts
// server/src/review.test.ts
import { describe, expect, test } from "bun:test";
import { nextReview, DAY_MS } from "./review.ts";

const NOW = 1_750_000_000_000;

describe("nextReview", () => {
  test("first mastery starts at 1 day", () => {
    expect(nextReview(null, true, NOW)).toEqual({ intervalDays: 1, dueAt: NOW + DAY_MS });
  });
  test("correct review doubles the interval", () => {
    expect(nextReview(4, true, NOW)).toEqual({ intervalDays: 8, dueAt: NOW + 8 * DAY_MS });
  });
  test("interval caps at 30 days", () => {
    expect(nextReview(20, true, NOW).intervalDays).toBe(30);
  });
  test("wrong review resets to 1 day", () => {
    expect(nextReview(16, false, NOW)).toEqual({ intervalDays: 1, dueAt: NOW + DAY_MS });
  });
});
```

- [ ] **Step 2: Run — FAIL (module missing).** `bun test server/src/review.test.ts`

- [ ] **Step 3: Implement**

```ts
// server/src/review.ts — spaced-repetition interval schedule. Success grows the
// gap (consolidation), a miss restarts it: the Ebbinghaus curve, coarsely.
export const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INTERVAL_DAYS = 30;

/** Next review after an attempt on a mastered topic (prev=null ⇒ fresh mastery). */
export function nextReview(
  prevIntervalDays: number | null,
  correct: boolean,
  now: number,
): { intervalDays: number; dueAt: number } {
  const intervalDays = !correct || prevIntervalDays === null
    ? 1
    : Math.min(prevIntervalDays * 2, MAX_INTERVAL_DAYS);
  return { intervalDays, dueAt: now + intervalDays * DAY_MS };
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(institute): spaced-review interval schedule`

---

### Task 2: windowed `topicState` (modify pure fn, TDD)

**Files:** Modify `server/src/mastery.ts`, `server/src/mastery.test.ts`

- [ ] **Step 1: Add failing tests** (keep existing ones; adjust call sites to the new shape)

New signature: `topicState({ lifetimeAttempts, recentResults, recentSolveMs, fluentMs })` where `recentResults: boolean[]` = last ≤12 attempt outcomes, newest first; empty array ⇒ legacy grant ⇒ fall back to `lifetimeCorrectRatio` passed as `grantRatio`.

Simplest concrete shape (write tests against THIS):

```ts
export type TopicSignals = {
  lifetimeAttempts: number;
  /** Outcomes of the last ≤12 attempts (any order). Empty ⇒ no attempt rows (legacy grant). */
  recentResults: boolean[];
  /** Lifetime correct/attempts — the fallback accuracy when recentResults is empty. */
  lifetimeRatio: number;
  recentSolveMs: number[];
  fluentMs: number | null;
};
```

Tests to add:

```ts
test("windowed accuracy demotes after two recent misses", () => {
  const twelve = [...Array(10).fill(true), false, false]; // 10/12 = 83%
  expect(topicState({ lifetimeAttempts: 40, recentResults: twelve, lifetimeRatio: 0.95, recentSolveMs: [], fluentMs: null }))
    .toBe("practicing");
});
test("one recent miss does not demote", () => {
  const twelve = [...Array(11).fill(true), false]; // 11/12 = 92%
  expect(topicState({ lifetimeAttempts: 40, recentResults: twelve, lifetimeRatio: 0.95, recentSolveMs: [], fluentMs: null }))
    .toBe("mastered");
});
test("legacy grants (no attempt rows) use lifetime ratio", () => {
  expect(topicState({ lifetimeAttempts: 8, recentResults: [], lifetimeRatio: 1, recentSolveMs: [], fluentMs: null }))
    .toBe("mastered");
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Reimplement `topicState`**

```ts
export function topicState(s: TopicSignals): "practicing" | "mastered" {
  if (s.lifetimeAttempts < 8) return "practicing";
  const acc = s.recentResults.length
    ? s.recentResults.filter(Boolean).length / s.recentResults.length
    : s.lifetimeRatio;
  if (acc < 0.85) return "practicing";
  if (s.fluentMs !== null && median(s.recentSolveMs) > s.fluentMs) return "practicing";
  return "mastered";
}
```

- [ ] **Step 4: Run mastery tests — PASS** (`median` unchanged). Old tests that called the previous shape must be updated in Step 1, not deleted.
- [ ] **Step 5: Commit** `feat(institute): windowed topic mastery — decayed skills demote themselves`

---

### Task 3: `select.ts` — unified selection policy (pure, TDD)

**Files:** Create `server/src/select.ts`, `server/src/select.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// server/src/select.test.ts
import { describe, expect, test } from "bun:test";
import { selectNext, type SelectInput } from "./select.ts";
import type { Topic } from "@institute/shared";

const NOW = 1_750_000_000_000;
const t = (id: string, prereqs: string[], domain = "d1", age = 5): Topic => ({
  id, name: id, kidLabel: id, domain, ageRange: [age, age + 1], description: "",
  evidence: [], assessmentPrompt: "", legacySkill: "add_within_20",
  gen: { kind: "add_sub", max: 10 }, fluentMs: null, prereqs,
});
// a,b roots in different domains; c behind a; d root in a third domain
const G = [t("a", [], "add"), t("b", [], "count"), t("c", ["a"], "add"), t("d", [], "place")];

const base: SelectInput = {
  topics: G, now: NOW, currentTopicId: null,
  mastery: [], // rows: {topicId, state, lastDifficulty, reviewDueAt, reviewIntervalDays}
  recentTopicIds: [], lastWasReview: false,
};

describe("selectNext", () => {
  test("cold start serves a frontier root", () => {
    const r = selectNext(base);
    expect(r.mode).toBe("learn");
    expect(["a", "b", "d"]).toContain(r.topic.id);
  });
  test("due review wins over learning", () => {
    const r = selectNext({ ...base,
      mastery: [{ topicId: "a", state: "mastered", lastDifficulty: 0.6, reviewDueAt: NOW - 1000, reviewIntervalDays: 1 }],
    });
    expect(r).toMatchObject({ mode: "review", topic: { id: "a" } });
    expect(r.difficulty).toBeCloseTo(0.5); // lastDifficulty − 0.1
  });
  test("never two reviews back-to-back", () => {
    const r = selectNext({ ...base, lastWasReview: true,
      mastery: [{ topicId: "a", state: "mastered", lastDifficulty: 0.6, reviewDueAt: NOW - 1000, reviewIntervalDays: 1 }],
    });
    expect(r.mode).toBe("learn");
  });
  test("stays on current frontier topic under the run cap", () => {
    const r = selectNext({ ...base, currentTopicId: "b", recentTopicIds: ["b", "b"] });
    expect(r.topic.id).toBe("b");
  });
  test("rotates after 4 consecutive, preferring a different domain", () => {
    const r = selectNext({ ...base, currentTopicId: "b", recentTopicIds: ["b", "b", "b", "b"] });
    expect(r.topic.id).not.toBe("b");
    expect(r.topic.domain).not.toBe("count");
  });
  test("everything mastered and nothing due → deepest topic, learn mode", () => {
    const mastered = G.map((x) => ({ topicId: x.id, state: "mastered" as const, lastDifficulty: 0.5, reviewDueAt: NOW + 999_999_999, reviewIntervalDays: 4 }));
    const r = selectNext({ ...base, mastery: mastered });
    expect(r.mode).toBe("learn");
    expect(r.topic).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement**

```ts
// server/src/select.ts — the one place that decides what he works on next.
// Priorities: (1) a due review, unless the last problem was already a review;
// (2) keep the current topic while its consecutive run is short (focus);
// (3) rotate to a different-domain frontier topic (interleaving without
// interference). Wrong-branch easing never goes through here — struggling is
// the wrong moment to switch subjects.
import type { Topic } from "@institute/shared";
import { frontierTopics } from "./graph.ts";

export type MasteryLite = {
  topicId: string; state: string; lastDifficulty: number;
  reviewDueAt: number | null; reviewIntervalDays: number | null;
};
export type SelectInput = {
  topics: Topic[]; now: number;
  currentTopicId: string | null;
  mastery: MasteryLite[];
  /** topic ids of recent attempts, newest first */
  recentTopicIds: string[];
  lastWasReview: boolean;
};
export type Selection = { topic: Topic; difficulty: number; mode: "review" | "learn" };

const RUN_CAP = 4;

export function selectNext(s: SelectInput): Selection {
  const byId = new Map(s.mastery.map((m) => [m.topicId, m]));
  const mastered = new Set(s.mastery.filter((m) => m.state === "mastered").map((m) => m.topicId));

  // (1) due review
  if (!s.lastWasReview) {
    const due = s.topics
      .filter((t) => mastered.has(t.id))
      .map((t) => ({ t, m: byId.get(t.id)! }))
      .filter(({ m }) => m.reviewDueAt !== null && m.reviewDueAt <= s.now)
      .sort((x, y) => x.m.reviewDueAt! - y.m.reviewDueAt!);
    if (due.length) {
      const { t, m } = due[0];
      return { topic: t, difficulty: Math.max(0.3, m.lastDifficulty - 0.1), mode: "review" };
    }
  }

  const frontier = frontierTopics(s.topics, mastered);
  const learnDifficulty = (t: Topic): number => {
    const m = byId.get(t.id);
    return Math.max(0.2, Math.min(0.95, m?.lastDifficulty ?? 0.4));
  };

  // (2) stay on the current topic while the run is short
  const current = s.currentTopicId ? frontier.find((t) => t.id === s.currentTopicId) : undefined;
  if (current) {
    let run = 0;
    for (const id of s.recentTopicIds) { if (id === current.id) run++; else break; }
    if (run < RUN_CAP) return { topic: current, difficulty: learnDifficulty(current), mode: "learn" };
  }

  // (3) rotate: different domain first, then least-recently-attempted, then youngest
  const candidates = frontier.filter((t) => t.id !== s.currentTopicId);
  const currentDomain = s.currentTopicId
    ? s.topics.find((t) => t.id === s.currentTopicId)?.domain
    : undefined;
  const lastSeen = (id: string): number => {
    const i = s.recentTopicIds.indexOf(id);
    return i === -1 ? 1e9 : i; // large finite sentinel (Infinity-Infinity = NaN breaks sort)
  };
  const pool = candidates.length ? candidates : frontier;
  if (pool.length) {
    const pick = [...pool].sort((a, b) =>
      Number(b.domain !== currentDomain) - Number(a.domain !== currentDomain) ||
      lastSeen(b.id) - lastSeen(a.id) ||
      a.ageRange[0] - b.ageRange[0],
    )[0];
    return { topic: pick, difficulty: learnDifficulty(pick), mode: "learn" };
  }

  // (4) nothing to learn, nothing due — free play on the deepest topic
  const deepest = [...s.topics].sort((a, b) => b.ageRange[0] - a.ageRange[0])[0];
  return { topic: deepest, difficulty: 0.8, mode: "learn" };
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(institute): unified topic selection — reviews first, focus runs, domain-rotating interleave`

---

### Task 4: wire the server

**Files:** Modify `server/src/index.ts`, `server/src/integration.test.ts`

- [ ] **Step 1: Failing integration tests** (append to the existing describe; the flow helpers exist)

```ts
test("mastering a topic schedules a review ~1 day out", async () => {
  for (let i = 0; i < 8; i++) {
    await call("POST", "/tutor/attempt", {
      profileId: "kid6", problemId: `p${i}`, skill: "add_within_20",
      topicId: "mt_e8CZ7E5qW7", correct: true, solveMs: 2500, difficulty: 0.5,
    });
  }
  const m = await call("GET", "/mastery?profileId=kid6");
  const row = m.topics.find((t: any) => t.id === "mt_e8CZ7E5qW7");
  expect(row.state).toBe("mastered");
  expect(row.reviewIntervalDays).toBe(1);
  const day = 24 * 60 * 60 * 1000;
  expect(row.reviewDueAt).toBeGreaterThan(Date.now() + day - 60_000);
  expect(row.reviewDueAt).toBeLessThan(Date.now() + day + 60_000);
});

test("right branch rotates topic after a 4-run (interleaving)", async () => {
  // Build a 4-run on Number Bonds for a fresh profile, then ask for branches.
  const topicId = "mt_e8CZ7E5qW7";
  for (let i = 0; i < 4; i++) {
    await call("POST", "/tutor/attempt", {
      profileId: "kid7", problemId: `p${i}`, skill: "add_within_20",
      topicId, correct: i % 2 === 0, solveMs: 6000, difficulty: 0.5, // mixed → not mastered
    });
  }
  const current = { id: "px", skill: "add_within_20", topicId, topicLabel: "Number Bonds",
    prompt: "3 + ? = 9", spoken: "3 plus what makes 9?", answer: 6, difficulty: 0.5 };
  const b = await call("POST", "/tutor/branches", { profileId: "kid7", current });
  expect(b.right.topicId).not.toBe(topicId);     // rotated away after the run
  expect(b.wrong.topicId).toBe(topicId);          // wrong branch never switches
});
```

- [ ] **Step 2: Run — FAIL** (`reviewIntervalDays` undefined; right branch stays).

- [ ] **Step 3: Schema + backfill** (after the `topic_mastery` CREATE):

```ts
try { db.exec(`ALTER TABLE topic_mastery ADD COLUMN review_interval_days REAL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE topic_mastery ADD COLUMN review_due_at INTEGER`); } catch { /* exists */ }
// Backfill: mastered rows without a schedule (legacy grants) become due NOW —
// the first sessions verify granted knowledge before building on it.
db.query(`UPDATE topic_mastery SET review_interval_days = 1, review_due_at = ?
          WHERE state = 'mastered' AND review_due_at IS NULL`).run(Date.now());
```

(Place the backfill AFTER the legacy-grant migration loop so freshly granted rows are covered on the same boot.) Extend `TopicMasteryRow` + the `topicMasteryRows` SELECT with the two columns.

- [ ] **Step 4: Rework `recordTopicMastery`** — windowed signals + review updates:

```ts
function recordTopicMastery(profileId: string, topicId: string, correct: boolean, difficulty: number): void {
  const topic = topicById(topicId);
  if (!topic) return;
  const row = db.query(
    `SELECT attempts, correct, state, review_interval_days FROM topic_mastery WHERE profile_id = ? AND topic_id = ?`,
  ).get(profileId, topicId) as { attempts: number; correct: number; state: string; review_interval_days: number | null } | null;
  const wasMastered = row?.state === "mastered";
  const attempts = (row?.attempts ?? 0) + 1;
  const corr = (row?.correct ?? 0) + (correct ? 1 : 0);
  // NOTE: the /tutor/attempt handler inserts the attempt row BEFORE calling this,
  // so these windows include the attempt being recorded.
  const recentResults = (db.query(
    `SELECT correct FROM attempts WHERE profile_id = ? AND topic_id = ?
     ORDER BY created_at DESC, id DESC LIMIT 12`,
  ).all(profileId, topicId) as { correct: number }[]).map((r) => !!r.correct);
  const recentSolveMs = (db.query(
    `SELECT solve_ms FROM attempts WHERE profile_id = ? AND topic_id = ? AND correct = 1
     ORDER BY created_at DESC, id DESC LIMIT 8`,
  ).all(profileId, topicId) as { solve_ms: number }[]).map((r) => r.solve_ms);
  const state = topicState({
    lifetimeAttempts: attempts, recentResults, lifetimeRatio: corr / attempts,
    recentSolveMs, fluentMs: topic.fluentMs,
  });
  // Review schedule: any attempt while mastered is a review outcome; the moment
  // of first mastery schedules the first review.
  let schedule: { intervalDays: number; dueAt: number } | null = null;
  if (wasMastered) schedule = nextReview(row?.review_interval_days ?? null, correct, Date.now());
  else if (state === "mastered") schedule = nextReview(null, correct, Date.now());
  db.query(
    `INSERT INTO topic_mastery (profile_id, topic_id, attempts, correct, last_difficulty, state, review_interval_days, review_due_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, topic_id) DO UPDATE SET
       attempts = excluded.attempts, correct = excluded.correct,
       last_difficulty = excluded.last_difficulty, state = excluded.state,
       review_interval_days = COALESCE(excluded.review_interval_days, topic_mastery.review_interval_days),
       review_due_at = COALESCE(excluded.review_due_at, topic_mastery.review_due_at),
       updated_at = excluded.updated_at`,
  ).run(profileId, topicId, attempts, corr, difficulty, state,
    schedule?.intervalDays ?? null, schedule?.dueAt ?? null, Date.now());
}
```

Import `nextReview` from `./review.ts` and the reshaped `topicState`.

- [ ] **Step 5: Selection wiring.** Build one helper and use it twice:

```ts
/** Assemble selectNext inputs from the DB. `currentTopicId` null ⇒ session start. */
function selectFor(profileId: string, currentTopicId: string | null) {
  const recent = recentAttempts(profileId, 12);
  const rows = topicMasteryRows(profileId);
  const masteredAtTime = new Set(rows.filter((r) => r.state === "mastered").map((r) => r.topic_id));
  // "last was review" ≈ the most recent attempt hit a topic that is currently mastered
  const lastWasReview = recent[0]?.topic_id != null && masteredAtTime.has(recent[0].topic_id);
  return selectNext({
    topics: TOPICS, now: Date.now(), currentTopicId,
    mastery: rows.map((r) => ({
      topicId: r.topic_id, state: r.state, lastDifficulty: r.last_difficulty,
      reviewDueAt: r.review_due_at, reviewIntervalDays: r.review_interval_days,
    })),
    recentTopicIds: recent.map((r) => r.topic_id ?? "").filter(Boolean),
    lastWasReview,
  });
}
```

- Replace `pickStartTopic`'s body with `selectFor(profileId, null)` (keep the endpoint shape).
- In `adaptivePlan`, replace the `advanceTopic` computation: `const next = selectFor(profileId, current.topicId ?? null);` → `advanceTopic = next.topic.id !== current.topicId ? next.topic : null`, and thread `next.mode`/`next.difficulty` so the LLM right-branch difficulty target uses `next.mode === "review" ? next.difficulty : rightTarget` and the prompt says "REVIEW an earlier skill (friendly confidence check)" when mode is review. `localBranches` right side follows the same selection (change its signature to `localBranches(profileId: string, current: Problem)` — profileId is in scope at the call site in `nextProblems` — and route its right side through `selectFor`; wrong side unchanged).

- [ ] **Step 6: `/mastery` additions:** include `reviewDueAt: r?.review_due_at ?? null, reviewIntervalDays: r?.review_interval_days ?? null` per topic.

- [ ] **Step 7: Run the full suite** — `bun test server shared scripts` all green (existing tests must keep passing; the kid2/kid4 flows still hold because rotation only kicks in at a 4-run and reviews require mastered-with-due).

- [ ] **Step 8: Commit** `feat(institute): spaced review scheduling + session interleaving in the tutor loop`

---

### Task 5: end-to-end verification

- [ ] Full suite green.
- [ ] Boot a scratch server on a COPY of the real DB (port 8793, `DB_PATH` to the copy): confirm on boot sam's two granted topics get `review_due_at ≈ now` (backfill), `/tutor/first` for sam returns one of them in review mode at gentle difficulty, and after a correct attempt on it `/mastery` shows `reviewIntervalDays: 2` with a future due date. Then simulate 5 correct answers on one frontier topic via `/tutor/attempt` + `/tutor/branches` and confirm the right branch rotates to a different-domain topic.
- [ ] Real browser spot-check on the running dev stack is NOT part of this task (the live servers on :8787/:5188 hot-reload from master when merged — verify after merge with one screenshot, no answers submitted).
- [ ] Update the vault roadmap note status.

## Risks

- `lastWasReview` is inferred (most recent attempt's topic is currently mastered) rather than stored. Edge case: a just-demoted topic makes the last attempt look like non-review — acceptable; the guard only prevents review *pile-ups*.
- The windowed rule changes existing mastery semantics: integration test kid3 (10 slow corrects) still practices (fluency), kid2 flows still master (12-window all-correct). Verified in Task 4 Step 7.
- Difficulty for review problems intentionally ignores the LLM's rightTarget — reviews re-enter gently by design.
