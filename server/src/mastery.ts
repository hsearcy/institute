// server/src/mastery.ts — the mastery rule. Accuracy is computed over a RECENT
// window (last ≤12 attempts) so a decayed skill demotes itself back into the
// frontier; fluency topics (fluentMs set) additionally require fast correct
// solves — automaticity, not just correctness.
export function median(xs: number[]): number {
  if (xs.length === 0) return Infinity;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type TopicSignals = {
  lifetimeAttempts: number;
  /** Outcomes of the last ≤12 attempts. Empty ⇒ no attempt rows (legacy grant). */
  recentResults: boolean[];
  /** Lifetime correct/attempts — the fallback accuracy when recentResults is empty. */
  lifetimeRatio: number;
  recentSolveMs: number[];
  fluentMs: number | null;
};

export function topicState(s: TopicSignals): "practicing" | "mastered" {
  if (s.lifetimeAttempts < 8) return "practicing";
  const acc = s.recentResults.length
    ? s.recentResults.filter(Boolean).length / s.recentResults.length
    : s.lifetimeRatio;
  if (acc < 0.85) return "practicing";
  if (s.fluentMs !== null && median(s.recentSolveMs) > s.fluentMs) return "practicing";
  return "mastered";
}
