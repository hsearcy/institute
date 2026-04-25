import type { AttemptOutcome, SkillState } from "./types.ts";

/** Hard cap — kids forget fast; intervals beyond two weeks aren't useful. */
export const MAX_INTERVAL_DAYS = 14;

export type SrsUpdate = {
  srsInterval: number;
  srsEase: number;
  nextReviewAt: Date;
};

export function scheduleNextReview(
  state: SkillState,
  outcome: AttemptOutcome,
  now: Date,
): SrsUpdate {
  if (!outcome.correct) {
    const ease = clamp(state.srsEase - 0.2, 1.3, 2.8);
    return { srsInterval: 1, srsEase: ease, nextReviewAt: addDays(now, 1) };
  }

  const ease = clamp(state.srsEase + 0.05, 1.3, 2.8);
  let interval: number;
  if (state.srsInterval <= 0) interval = 1;
  else if (state.srsInterval === 1) interval = 2;
  else interval = Math.round(state.srsInterval * state.srsEase);

  interval = Math.min(interval, MAX_INTERVAL_DAYS);

  return { srsInterval: interval, srsEase: ease, nextReviewAt: addDays(now, interval) };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}
