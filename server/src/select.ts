// server/src/select.ts — the one place that decides what he works on next.
// Priorities: (1) a due review, unless the last problem was already a review;
// (2) keep the current topic while its consecutive run is short (focus);
// (3) rotate to a different-domain frontier topic (interleaving without
// interference). Wrong-branch easing never goes through here — struggling is
// the wrong moment to switch subjects.
import type { Topic } from "@institute/shared";
import { frontierTopics } from "./graph.ts";

export type MasteryLite = {
  topicId: string; state: string; lastDifficulty: number; attempts: number;
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
    // A topic he has never met starts gentle — a first impression should be a win.
    return Math.max(0.2, Math.min(0.95, m?.lastDifficulty ?? 0.25));
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
  // Within the frontier, a topic has a mastery row IFF he has attempted it.
  const isStarted = (id: string) => byId.has(id);
  const newTopics = pool.filter((t) => !isStarted(t.id));
  const inProgress = pool.filter((t) => isStarted(t.id));
  // Meet a NEW topic on a steady cadence — roughly every other rotation — while
  // still working what's in progress. The signal is simply whether his CURRENT
  // run was on a freshly-met topic: if he just met/worked a new one, spend this
  // rotation on in-progress work; otherwise introduce a new one. Keying off the
  // current run (not a wide window) keeps discovery flowing even when he has
  // several long-worked topics AND avoids a freshly-mastered topic wedging it.
  // (History: "≤2 distinct recent topics" never fired with 3+ started topics;
  // "any freshly-met in the last 20" was too sticky — a new topic he never
  // consolidated blocked discovery for ~20 problems.)
  const FRESH = RUN_CAP * 2; // ≤ ~2 runs in ⇒ still a "new" topic to him
  const freshlyMet = (id: string): boolean => {
    const m = byId.get(id);
    return m !== undefined && m.state !== "mastered" && m.attempts > 0 && m.attempts <= FRESH;
  };
  const currentRunWasNew = s.recentTopicIds.slice(0, RUN_CAP).some(freshlyMet);
  const ranked =
    !currentRunWasNew && newTopics.length ? newTopics :  // just did an old topic → discover one
    inProgress.length ? inProgress :                     // just met a new one → work in-progress
    pool;                                                // early game: only new topics exist
  if (ranked.length) {
    const pick = [...ranked].sort((a, b) =>
      Number(b.domain !== currentDomain) - Number(a.domain !== currentDomain) || // non-interference
      a.ageRange[0] - b.ageRange[0] ||                                            // easiest first
      lastSeen(b.id) - lastSeen(a.id),                                            // least-recently
    )[0];
    return { topic: pick, difficulty: learnDifficulty(pick), mode: "learn" };
  }

  // (4) nothing to learn, nothing due — free play on the deepest topic
  const deepest = [...s.topics].sort((a, b) => b.ageRange[0] - a.ageRange[0])[0];
  return { topic: deepest, difficulty: 0.8, mode: "learn" };
}
