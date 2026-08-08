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

  // STUCK: attempted many times, still not mastered — grinding it harder won't
  // help. (Computed over the whole frontier, incl. the current topic, so rotating
  // AWAY from a stuck topic still pulls in its prereqs.) The cure is to interleave
  // the underlying skills it leans on, not to distract him with unrelated novelty.
  const STUCK_ATTEMPTS = 12; // mastery needs ≥8; past that and still practicing ⇒ struggling
  const stuck = frontier.filter((t) => {
    const m = byId.get(t.id);
    return m !== undefined && m.state !== "mastered" && m.attempts >= STUCK_ATTEMPTS;
  });
  // The unmastered, unlocked prereqs (hard + soft) those stuck topics rest on.
  const remedialIds = new Set(
    stuck.flatMap((t) => [...t.prereqs, ...(t.helpPrereqs ?? [])]).filter((id) => !mastered.has(id)),
  );
  const remedial = pool.filter((t) => remedialIds.has(t.id));
  const newTopics = pool.filter((t) => !isStarted(t.id) && !remedialIds.has(t.id));
  const inProgress = pool.filter((t) => isStarted(t.id) && !remedialIds.has(t.id));

  let ranked: Topic[];
  if (stuck.length && remedial.length) {
    // FOCUSED REMEDIATION: rotate among the underlying skills, the stuck topics,
    // and his other in-progress work. Withhold brand-new UNRELATED topics until
    // he's unstuck or there's nothing left to remediate — a struggling child
    // should get the skill he's missing, not a parade of strangers. The prereqs
    // are still new topics to him (they count toward the explore quest), just the
    // RIGHT ones. The sort below interleaves them; RUN_CAP keeps each run short.
    ranked = [...remedial, ...stuck.filter((t) => t.id !== s.currentTopicId), ...inProgress];
    if (!ranked.length) ranked = pool;
  } else {
    // HEALTHY (or nothing left to remediate): meet a NEW topic on a steady
    // ~every-other-rotation cadence while consolidating what's freshly met. The
    // signal is whether his CURRENT run was on a freshly-met topic: if so, spend
    // this rotation on in-progress work; otherwise introduce a new one. Keying off
    // the current run (not a wide window) keeps discovery flowing even with several
    // long-worked topics AND stops a freshly-mastered topic from wedging it.
    // (History: "≤2 distinct recent" never fired with 3+ started topics; "any
    // freshly-met in the last 20" was too sticky — blocked discovery ~20 problems.)
    const FRESH = RUN_CAP * 2; // ≤ ~2 runs in ⇒ still a "new" topic to him
    const freshlyMet = (id: string): boolean => {
      const m = byId.get(id);
      return m !== undefined && m.state !== "mastered" && m.attempts > 0 && m.attempts <= FRESH;
    };
    const currentRunWasNew = s.recentTopicIds.slice(0, RUN_CAP).some(freshlyMet);
    ranked =
      !currentRunWasNew && newTopics.length ? newTopics :  // just did an old topic → discover one
      inProgress.length ? inProgress :                     // just met a new one → work in-progress
      pool;                                                // early game: only new topics exist
  }
  if (ranked.length) {
    const pick = [...ranked].sort((a, b) =>
      Number(b.domain !== currentDomain) - Number(a.domain !== currentDomain) || // non-interference
      lastSeen(b.id) - lastSeen(a.id) ||                                          // rotate: least-recently first
      a.ageRange[0] - b.ageRange[0],                                              // then easiest (breaks new-topic ties)
    )[0];
    return { topic: pick, difficulty: learnDifficulty(pick), mode: "learn" };
  }

  // (4) nothing to learn, nothing due — free play on the deepest topic
  const deepest = [...s.topics].sort((a, b) => b.ageRange[0] - a.ageRange[0])[0];
  return { topic: deepest, difficulty: 0.8, mode: "learn" };
}
