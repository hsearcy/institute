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
  // Keep meeting NEW topics on a steady cadence — even while several older topics
  // are still unfinished. The signal is whether he's met a NEW topic RECENTLY: a
  // "freshly-met" topic is one he's only just started (few attempts). If none of
  // his recent problems were on a freshly-met topic, it's time to discover one;
  // otherwise let him consolidate the new one alongside his in-progress work.
  // (Earlier this keyed off "≤2 distinct recent topics", which never fired once
  // he had 3+ long-worked topics — trapping him on his started set.)
  const FRESHLY_MET = 12; // ~3 short runs before a new topic stops being "new"
  const recentlyMetNew = s.recentTopicIds.some((id) => {
    const m = byId.get(id);
    // A freshly-MASTERED topic doesn't count — he's done with it, so it must not
    // suppress discovering the next new one. Only an in-progress fresh topic does.
    return m !== undefined && m.state !== "mastered" && m.attempts > 0 && m.attempts <= FRESHLY_MET;
  });
  const ranked =
    !recentlyMetNew && newTopics.length ? newTopics :  // no new topic lately → discover one
    inProgress.length ? inProgress :                   // else finish started work
    pool;                                              // early game: only new topics exist
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
