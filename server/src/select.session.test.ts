// select.session.test.ts — the guardrail I should have had before touching the
// selector three times. Instead of asserting one rotation in isolation, this
// simulates a FULL realistic session against the real curriculum and asserts the
// properties that actually matter to a kid: he keeps meeting new topics, and he
// never gets trapped cycling a small set. Each of the three shipped selector bugs
// (stuck-on-2, stuck-on-started-set, freshly-mastered-suppresses-discovery) fails
// at least one assertion here.
import { describe, expect, test } from "bun:test";
import { selectNext, type MasteryLite } from "./select.ts";
import { TOPICS } from "@institute/shared";

const NOW = 1_750_000_000_000;
const FAR_FUTURE = NOW + 9e9; // reviews scheduled far out → none fire during the sim

type SimOpts = {
  masteredIds: string[];              // already mastered before the session (out of frontier)
  inProgressIds: string[];            // started-but-unmastered, with their attempt counts
  attempts: Record<string, number>;   // starting attempt count per started/mastered topic
  problems: number;
  neverMaster?: Set<string>;          // topics that stay hard for him (never reach mastery)
  masterAfter?: number;               // a topic he keeps getting right masters after this many attempts
  freshlyMastered?: Record<string, number>; // mastered THIS session at a low attempt count
  initialRecent?: string[];           // seed the recent-attempt window
};

/** Run a deterministic session through selectNext, modelling how the real game
 *  loops: pick a topic, it accrues attempts, easy topics eventually master (which
 *  creates the "freshly-mastered topic in recent history" condition that broke a
 *  prior fix). Returns the ordered sequence of topic ids he was served. */
function simulate(o: SimOpts): { seq: string[]; masteredMidSession: string[] } {
  const state = new Map<string, { started: boolean; mastered: boolean; attempts: number }>();
  for (const id of o.masteredIds) state.set(id, { started: true, mastered: true, attempts: o.attempts[id] ?? 12 });
  for (const id of o.inProgressIds) state.set(id, { started: true, mastered: false, attempts: o.attempts[id] ?? 4 });
  for (const [id, att] of Object.entries(o.freshlyMastered ?? {})) state.set(id, { started: true, mastered: true, attempts: att });

  const rows = (): MasteryLite[] => [...state.entries()].map(([topicId, s]) => ({
    topicId, state: s.mastered ? "mastered" : "practicing", lastDifficulty: 0.5, attempts: s.attempts,
    reviewDueAt: s.mastered ? FAR_FUTURE : null, reviewIntervalDays: s.mastered ? 4 : null,
  }));

  const masterAfter = o.masterAfter ?? 8;
  let recent: string[] = o.initialRecent ? [...o.initialRecent] : [];
  let current: string | null = o.initialRecent?.[0] ?? o.inProgressIds[0] ?? null;
  const seq: string[] = [];
  const masteredMidSession: string[] = [];

  for (let i = 0; i < o.problems; i++) {
    const sel = selectNext({ topics: TOPICS, now: NOW, currentTopicId: current, mastery: rows(), recentTopicIds: recent, lastWasReview: false });
    const id = sel.topic.id;
    seq.push(id);
    const s = state.get(id) ?? { started: false, mastered: false, attempts: 0 };
    s.started = true;
    s.attempts += 1;
    // Easy topics he meets get mastered after a short run — unless he's genuinely
    // stuck on them — which is exactly how a freshly-mastered topic appears in his
    // recent window mid-session.
    if (!s.mastered && !o.neverMaster?.has(id) && s.attempts >= masterAfter) {
      s.mastered = true;
      masteredMidSession.push(id);
    }
    state.set(id, s);
    current = id;
    recent = [id, ...recent].slice(0, 20);
  }
  return { seq, masteredMidSession };
}

/** Longest run of consecutive served problems confined to `allowed` topics. */
function longestConfinedRun(seq: string[], allowed: Set<string>): number {
  let max = 0, run = 0;
  for (const id of seq) { if (allowed.has(id)) { run++; max = Math.max(max, run); } else run = 0; }
  return max;
}

describe("full-session selector behaviour (regression guard)", () => {
  // Sam's real shape on the night this broke: a stack of mastered topics, two
  // genuinely-hard topics he's stuck on, and MANY unlocked topics he'd never met.
  const samState: SimOpts = {
    masteredIds: [
      "mt_M5PPDJStGm", "mt_ghF3Vv6taM", "mt_e8CZ7E5qW7", "mt_Zx1xZM-RbX", "mt_ezc2m_0dzN",
      "mt_nvdpxAJTBG", "mt_kw7xmp68rU", "mt_THl9GLxwoL", "mt_PZ909yPrEC", "mt_HhuSDxwDNM",
      "mt_U0waNfD8PB",
    ],
    inProgressIds: ["mt_LpSuPgL31x", "mt_s2mfRBoTal"], // Fair Shares, Bond Master
    attempts: { mt_LpSuPgL31x: 73, mt_s2mfRBoTal: 42 },
    neverMaster: new Set(["mt_LpSuPgL31x", "mt_s2mfRBoTal"]), // he stays stuck on these
    problems: 48,
  };

  test("keeps discovering new topics across a session — never traps on his started set", () => {
    const { seq } = simulate(samState);
    const startedSet = new Set([...samState.masteredIds, ...samState.inProgressIds]);
    const newDiscovered = new Set(seq.filter((id) => !startedSet.has(id)));
    // He must meet several genuinely-new topics over ~12 rotations, not cycle 2-3.
    expect(newDiscovered.size).toBeGreaterThanOrEqual(4);
    // And never grind only his already-known topics for a long stretch (the trap).
    expect(longestConfinedRun(seq, startedSet)).toBeLessThan(16); // < 4 rotations
  });

  test("a freshly-MASTERED topic in recent history does not suppress discovery (the c4dcd0b bug)", () => {
    // The exact bug: he mastered Ten Hops Anywhere this session at ~8 attempts,
    // and it sat in his recent window. A prior fix counted that as "just met a new
    // topic" and refused to introduce another — trapping him. Seed that directly.
    const withFreshMaster: SimOpts = {
      ...samState,
      freshlyMastered: { "mt_OkSJfrmFb_": 8 },                 // Ten Hops, just mastered, low attempts
      initialRecent: ["mt_OkSJfrmFb_", "mt_OkSJfrmFb_", "mt_s2mfRBoTal", "mt_s2mfRBoTal"],
      problems: 40,
    };
    const { seq } = simulate(withFreshMaster);
    const known = new Set([...samState.masteredIds, ...samState.inProgressIds, "mt_OkSJfrmFb_"]);
    // The very first pick must be a genuinely NEW topic, and discovery keeps flowing.
    expect(known.has(seq[0])).toBe(false);
    expect(new Set(seq.filter((id) => !known.has(id))).size).toBeGreaterThanOrEqual(4);
    expect(longestConfinedRun(seq, known)).toBeLessThan(16);
  });

  test("still meets a new topic even when several long-worked topics are in progress", () => {
    // Three+ started topics: the 'recentDistinct <= 2' rule never fired here.
    const many: SimOpts = {
      masteredIds: samState.masteredIds,
      inProgressIds: ["mt_LpSuPgL31x", "mt_s2mfRBoTal", "mt__we2TDqnJx"],
      attempts: { mt_LpSuPgL31x: 73, mt_s2mfRBoTal: 42, mt__we2TDqnJx: 20 },
      neverMaster: new Set(["mt_LpSuPgL31x", "mt_s2mfRBoTal", "mt__we2TDqnJx"]),
      problems: 40,
    };
    const { seq } = simulate(many);
    const startedSet = new Set([...many.masteredIds, ...many.inProgressIds]);
    expect(new Set(seq.filter((id) => !startedSet.has(id))).size).toBeGreaterThanOrEqual(3);
    expect(longestConfinedRun(seq, startedSet)).toBeLessThan(16);
  });

  test("consolidates a freshly-met topic before piling on another new one", () => {
    // When he's just started a NEW topic, the very next rotations shouldn't keep
    // opening even newer topics — he should work the fresh one (and his others).
    const { seq } = simulate({ ...samState, problems: 24 });
    // Count distinct NEW topics in any 8-problem (2-rotation) window — should be
    // small, i.e. he isn't handed a brand-new topic every single rotation.
    const startedSet = new Set([...samState.masteredIds, ...samState.inProgressIds]);
    let maxNewInWindow = 0;
    for (let i = 0; i + 8 <= seq.length; i++) {
      const newInWin = new Set(seq.slice(i, i + 8).filter((id) => !startedSet.has(id)));
      maxNewInWindow = Math.max(maxNewInWindow, newInWin.size);
    }
    expect(maxNewInWindow).toBeLessThanOrEqual(2); // not a novelty firehose
  });
});
