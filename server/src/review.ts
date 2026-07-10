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
