// server/src/review.ts — spaced-repetition interval schedule. Success grows the
// gap (consolidation), a miss restarts it: the Ebbinghaus curve, coarsely.
export const DAY_MS = 24 * 60 * 60 * 1000;
// A daily-playing 6-year-old forgets across 16- and 30-day gaps, so the ladder is
// deliberately tighter than doubling and caps low — he revisits at most weekly.
const LADDER = [1, 2, 3, 5, 8, 13];
const CAP = LADDER[LADDER.length - 1];

/** Next review after an attempt on a mastered topic (prev=null ⇒ fresh mastery).
 *  A foundational skill he has carried all the way to the cap and passed AGAIN is
 *  durably learned — retire it (dueAt=null) so it stops taking review slots as he
 *  masters more and more topics. A miss always restarts the ladder at 1 day. */
export function nextReview(
  prevIntervalDays: number | null,
  correct: boolean,
  now: number,
  foundational = false,
): { intervalDays: number; dueAt: number | null; retired: boolean } {
  if (!correct || prevIntervalDays === null) {
    return { intervalDays: 1, dueAt: now + DAY_MS, retired: false };
  }
  if (foundational && prevIntervalDays >= CAP) {
    return { intervalDays: CAP, dueAt: null, retired: true }; // graduated out of review
  }
  const next = LADDER.find((d) => d > prevIntervalDays) ?? CAP;
  return { intervalDays: next, dueAt: now + next * DAY_MS, retired: false };
}
