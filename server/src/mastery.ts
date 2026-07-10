// server/src/mastery.ts — the mastery rule. Accuracy for every topic; fluency
// topics (fluentMs set) additionally require fast correct solves — automaticity,
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
