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
  // Topics he has already started beat brand-new ones: novelty is what
  // intimidates him, and least-recently-attempted alone ranks NEVER-attempted
  // topics first (Infinity-ago), which fed him a diet of unfamiliar shapes.
  const started = (id: string) => Number(byId.has(id));
  if (pool.length) {
    const pick = [...pool].sort((a, b) =>
      Number(b.domain !== currentDomain) - Number(a.domain !== currentDomain) ||
      started(b.id) - started(a.id) ||
      lastSeen(b.id) - lastSeen(a.id) ||
      a.ageRange[0] - b.ageRange[0],
    )[0];
    return { topic: pick, difficulty: learnDifficulty(pick), mode: "learn" };
  }

  // (4) nothing to learn, nothing due — free play on the deepest topic
  const deepest = [...s.topics].sort((a, b) => b.ageRange[0] - a.ageRange[0])[0];
  return { topic: deepest, difficulty: 0.8, mode: "learn" };
}
