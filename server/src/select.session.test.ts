// select.session.test.ts — the guardrail I should have had before touching the
// selector three times. Instead of asserting one rotation in isolation, this
// simulates a FULL realistic session against the real curriculum and asserts the
// properties that actually matter to a kid: he keeps meeting new topics, and he
// never gets trapped cycling a small set. Each of the three shipped selector bugs
// (stuck-on-2, stuck-on-started-set, freshly-mastered-suppresses-discovery) fails
// at least one assertion here.
import { describe, expect, test } from "bun:test";
import { selectNext, ACTIVE_CAP, type MasteryLite } from "./select.ts";
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
function simulate(o: SimOpts): { seq: string[]; masteredMidSession: string[]; newlyMet: string[] } {
  const state = new Map<string, { started: boolean; mastered: boolean; attempts: number }>();
  for (const id of o.masteredIds) state.set(id, { started: true, mastered: true, attempts: o.attempts[id] ?? 12 });
  for (const id of o.inProgressIds) state.set(id, { started: true, mastered: false, attempts: o.attempts[id] ?? 4 });
  for (const [id, att] of Object.entries(o.freshlyMastered ?? {})) state.set(id, { started: true, mastered: true, attempts: att });

  const rows = (): MasteryLite[] => [...state.entries()].map(([topicId, s]) => ({
    topicId, state: s.mastered ? "mastered" : "practicing", lastDifficulty: 0.5, attempts: s.attempts,
    reviewDueAt: s.mastered ? FAR_FUTURE : null, reviewIntervalDays: s.mastered ? 4 : null,
  }));

  const knownAtStart = new Set(state.keys());
  const masterAfter = o.masterAfter ?? 8;
  let recent: string[] = o.initialRecent ? [...o.initialRecent] : [];
  let current: string | null = o.initialRecent?.[0] ?? o.inProgressIds[0] ?? null;
  const seq: string[] = [];
  const masteredMidSession: string[] = [];
  const newlyMet: string[] = []; // genuinely-new topics, in the order he first met them
  const sessionAttempts = new Map<string, number>();

  for (let i = 0; i < o.problems; i++) {
    const sel = selectNext({ topics: TOPICS, now: NOW, currentTopicId: current, mastery: rows(), recentTopicIds: recent, lastWasReview: false });
    const id = sel.topic.id;
    seq.push(id);
    if (!knownAtStart.has(id) && !newlyMet.includes(id)) newlyMet.push(id);
    const s = state.get(id) ?? { started: false, mastered: false, attempts: 0 };
    s.started = true;
    s.attempts += 1;
    sessionAttempts.set(id, (sessionAttempts.get(id) ?? 0) + 1);
    // Easy topics he meets get mastered after a short run THIS session — unless
    // he's genuinely stuck on them — which is exactly how a freshly-mastered topic
    // appears in his recent window mid-session.
    if (!s.mastered && !o.neverMaster?.has(id) && sessionAttempts.get(id)! >= masterAfter) {
      s.mastered = true;
      masteredMidSession.push(id);
    }
    state.set(id, s);
    current = id;
    recent = [id, ...recent].slice(0, 20);
  }
  return { seq, masteredMidSession, newlyMet };
}

/** Longest run of consecutive served problems confined to `allowed` topics. */
function longestConfinedRun(seq: string[], allowed: Set<string>): number {
  let max = 0, run = 0;
  for (const id of seq) { if (allowed.has(id)) { run++; max = Math.max(max, run); } else run = 0; }
  return max;
}

describe("full-session selector behaviour (regression guard)", () => {
  // Sam's real shape on the night this broke: a stack of mastered topics, and two
  // genuinely-hard topics he's stuck on (Fair Shares = division, Bond Master =
  // missing-addend across ten). Each now carries hand-authored help-prereqs — the
  // underlying skills — so the selector can remediate instead of grinding.
  const FAIR_SHARES = "mt_LpSuPgL31x", BOND_MASTER = "mt_s2mfRBoTal";
  // Their unmastered help-prereqs, from topics.json: skip-counting (Counting by
  // 3s, Ten Hops) for division; make-a-ten (Add & Take to 10) for the bond.
  const PREREQS = ["mt_aHAM29nidj", "mt_OkSJfrmFb_", "mt__we2TDqnJx"];
  const samState: SimOpts = {
    masteredIds: [
      "mt_M5PPDJStGm", "mt_ghF3Vv6taM", "mt_e8CZ7E5qW7", "mt_Zx1xZM-RbX", "mt_ezc2m_0dzN",
      "mt_nvdpxAJTBG", "mt_kw7xmp68rU", "mt_THl9GLxwoL", "mt_PZ909yPrEC", "mt_HhuSDxwDNM",
      "mt_U0waNfD8PB",
    ],
    inProgressIds: [FAIR_SHARES, BOND_MASTER],
    attempts: { [FAIR_SHARES]: 73, [BOND_MASTER]: 42 },
    neverMaster: new Set([FAIR_SHARES, BOND_MASTER]), // he stays stuck on these two
    problems: 48,
  };

  test("a stuck topic pulls in its PREREQS, not unrelated novelty (focused remediation)", () => {
    // Nothing masters (masterAfter huge), so remediation stays active the whole
    // session: the selector must interleave the underlying skills that unstick the
    // two hard topics, and must NOT open unrelated brand-new topics meanwhile.
    const { seq, newlyMet } = simulate({ ...samState, masterAfter: 999 });
    // The prereqs actually get worked.
    for (const p of PREREQS) expect(seq).toContain(p);
    // Every genuinely-new topic he meets is on a stuck topic's ladder (hard or
    // help prereq, from the curriculum data) — no strangers.
    const ladder = [FAIR_SHARES, BOND_MASTER].flatMap((sid) => { const t = TOPICS.find((x) => x.id === sid)!; return [...t.prereqs, ...t.helpPrereqs]; });
    for (const id of newlyMet) expect(ladder).toContain(id);
  });

  test("never trapped cycling only the two hard topics", () => {
    const { seq } = simulate({ ...samState, masterAfter: 999 });
    // Broken remediation (the ping-pong bug) leaves the WHOLE session inside the two
    // hard topics (run = 48). Working remediation confines them to the opening pair
    // of runs, then interleaves prereqs — so the longest confined stretch stays small.
    expect(longestConfinedRun(seq, new Set([FAIR_SHARES, BOND_MASTER]))).toBeLessThan(12); // < 3 runs
  });

  test("once the prereqs are mastered, genuinely-new topics resume (not imprisoned)", () => {
    // Prereqs are easy for him — they master after a short run. After that there's
    // nothing left to remediate, so discovery of brand-new topics must resume.
    const { newlyMet } = simulate({ ...samState, masterAfter: 6, problems: 80 });
    const beyondPrereqs = newlyMet.filter((id) => !PREREQS.includes(id));
    expect(beyondPrereqs.length).toBeGreaterThan(0); // he's not locked to the remediation set forever
  });

  test("a freshly-MASTERED topic in recent history does not suppress the next pick (the c4dcd0b bug)", () => {
    // He mastered Ten Hops this session at ~8 attempts and it sat in his recent
    // window. A prior fix counted that as 'just met a new topic' and refused to
    // move on — trapping him. With Ten Hops mastered, remediation should move to
    // the remaining prereqs, never re-serve the mastered one, and never trap.
    const withFreshMaster: SimOpts = {
      ...samState,
      freshlyMastered: { "mt_OkSJfrmFb_": 8 },
      initialRecent: ["mt_OkSJfrmFb_", "mt_OkSJfrmFb_", BOND_MASTER, BOND_MASTER],
      problems: 40,
    };
    const { seq } = simulate({ ...withFreshMaster, masterAfter: 999 });
    const stuckOnly = new Set([FAIR_SHARES, BOND_MASTER]);
    expect(longestConfinedRun(seq, stuckOnly)).toBeLessThan(12);
    expect(seq).not.toContain("mt_OkSJfrmFb_"); // the mastered prereq is never re-served
    // The remaining (still-unmastered) prereqs still get worked.
    expect(seq).toContain("mt_aHAM29nidj"); // Counting by 3s
    expect(seq).toContain("mt__we2TDqnJx"); // Add & Take to 10
  });


  // Pax's REAL map on 2026-09-09, the night he had 10 topics in "practicing":
  // 31 mastered, 10 started. The firehose that must never happen again.
  const paxState: SimOpts = {
    masteredIds: ["mt_M5PPDJStGm", "mt_ghF3Vv6taM", "mt_e8CZ7E5qW7", "mt__we2TDqnJx", "mt_m1W6nTQJ2b", "mt__t4afSyZRm", "mt_Zx1xZM-RbX", "mt_ezc2m_0dzN", "mt_nvdpxAJTBG", "mt_kw7xmp68rU", "mt_THl9GLxwoL", "mt_I5j1ZWo2cn", "mt_PZ909yPrEC", "mt_LpSuPgL31x", "mt_s2mfRBoTal", "mt_AKAtWEwpcj", "mt_glPPG-kTQY", "mt_UQnAFPs83F", "mt_3JgrHY221M", "mt__YRJ23GuIK", "mt_aHAM29nidj", "mt_OkSJfrmFb_", "mt_IzQvs7k_sE", "mt_M2v1A9OEuM", "mt_0u4KLbvBa1", "mt_U0waNfD8PB", "mt_aPBzD28_mT", "mt_izien3ZX51", "mt_cPZwlUk8Nd", "mt_AF2BeFQwfX", "mt_QaYfeVL-0C"],
    inProgressIds: ["mt_HhuSDxwDNM", "mt_cChv2j_-Da", "mt_wh3UqnWsa7", "mt_wQ89AEXhz3", "mt_7rJM8eWUfw", "mt_3XJkeIn6J6", "mt_g3W0mdADVu", "mt_6_O6THdEDK", "mt_2XDGT5tei1", "mt_wE7-Gs9ENL"],
    attempts: {"mt_HhuSDxwDNM": 208, "mt_cChv2j_-Da": 57, "mt_wh3UqnWsa7": 5, "mt_wQ89AEXhz3": 9, "mt_7rJM8eWUfw": 6, "mt_3XJkeIn6J6": 2, "mt_g3W0mdADVu": 10, "mt_6_O6THdEDK": 2, "mt_2XDGT5tei1": 15, "mt_wE7-Gs9ENL": 2},
    neverMaster: new Set(["mt_HhuSDxwDNM", "mt_cChv2j_-Da", "mt_wh3UqnWsa7", "mt_wQ89AEXhz3", "mt_7rJM8eWUfw", "mt_3XJkeIn6J6", "mt_g3W0mdADVu", "mt_6_O6THdEDK", "mt_2XDGT5tei1", "mt_wE7-Gs9ENL"]),
    masterAfter: 999,
    problems: 60,
  };

  test("PAX 2026-09-09: with 10 topics started, NOTHING new opens and he works at most ACTIVE_CAP of them", () => {
    const { seq, newlyMet } = simulate(paxState);
    expect(newlyMet.length).toBe(0);
    expect(new Set(seq).size).toBeLessThanOrEqual(ACTIVE_CAP);
    // and the ones he works are the ones he is furthest along in
    const top = [...Object.entries(paxState.attempts)].sort((a, b) => b[1] - a[1]).slice(0, ACTIVE_CAP).map(([id]) => id);
    for (const id of new Set(seq)) expect(top).toContain(id);
  });

  test("a slot opens when an active topic masters, and the NEXT started topic takes it before anything new", () => {
    // Let the active ones master quickly; the waiting started topics must fill
    // the freed slots before a brand-new topic is opened.
    const { seq, newlyMet, masteredMidSession } = simulate({ ...paxState, neverMaster: new Set(), masterAfter: 6, problems: 80 });
    const startedAtStart = new Set(paxState.inProgressIds);
    const firstNew = seq.findIndex((id) => !startedAtStart.has(id) && !paxState.masteredIds.includes(id));
    const waitingServed = new Set(seq.slice(0, firstNew === -1 ? seq.length : firstNew).filter((id) => startedAtStart.has(id)));
    expect(waitingServed.size).toBeGreaterThan(ACTIVE_CAP); // more than the first 3 got worked before any new topic
    // Every new topic needs a freed slot, and the 7 waiting topics take slots first:
    // new ≤ masteries beyond that backlog. No slot, no stranger.
    const backlog = startedAtStart.size - ACTIVE_CAP;
    expect(newlyMet.length).toBeLessThanOrEqual(Math.max(0, masteredMidSession.length - backlog));
  });

  test("a HEALTHY set (no stuck topic) meets new topics on a steady cadence, not a firehose", () => {
    // No stuck topic: the discovery cadence runs. He should meet several new topics
    // but never get a brand-new one every single rotation.
    const healthy: SimOpts = {
      masteredIds: samState.masteredIds,
      inProgressIds: ["mt__we2TDqnJx", "mt_I5j1ZWo2cn"], // two freshly-started topics, low attempts
      attempts: { "mt__we2TDqnJx": 3, "mt_I5j1ZWo2cn": 3 },
      neverMaster: new Set(["mt__we2TDqnJx", "mt_I5j1ZWo2cn"]),
      masterAfter: 999, // hold the set stable to test the STEADY cadence (mastering fast → faster discovery is fine)
      problems: 40,
    };
    const { seq, newlyMet } = simulate(healthy);
    // Two started, cap is ACTIVE_CAP: exactly one slot opens, then the set is full.
    // (A started topic that gets stuck may pull in a prereq; that is remediation,
    // not discovery, so it is excluded here.)
    // Walk his first meetings in order: a topic that is a prereq of something he
    // has already started is remediation; anything else is genuine discovery.
    const started = new Set(healthy.inProgressIds);
    const genuineIds = new Set<string>();
    for (const id of newlyMet) {
      const ladder = new Set([...started].flatMap((sid) => { const t = TOPICS.find((x) => x.id === sid)!; return [...t.prereqs, ...(t.helpPrereqs ?? [])]; }));
      if (!ladder.has(id)) genuineIds.add(id);
      started.add(id);
    }
    expect(genuineIds.size).toBe(ACTIVE_CAP - 2);
    // The cadence is about DISCOVERY; a stuck topic's ladder arriving is remediation.
    let maxNewInWindow = 0;
    for (let i = 0; i + 8 <= seq.length; i++) {
      const newInWin = new Set(seq.slice(i, i + 8).filter((id) => genuineIds.has(id)));
      maxNewInWindow = Math.max(maxNewInWindow, newInWin.size);
    }
    expect(maxNewInWindow).toBeLessThanOrEqual(2); // not a novelty firehose
  });
});
