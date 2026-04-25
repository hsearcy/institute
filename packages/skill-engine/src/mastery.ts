import {
  type AttemptOutcome,
  type MasteryState,
  type SkillId,
  type SkillState,
  RECENT_WINDOW_SIZE,
} from "./types.ts";

export function initialSkillState(profileId: string, skillId: SkillId): SkillState {
  return {
    profileId,
    skillId,
    state: "unstarted",
    attempts: 0,
    correct: 0,
    recentWindow: [],
    currentDifficulty: 0,
    srsInterval: 0,
    srsEase: 2.5,
    nextReviewAt: null,
    updatedAt: new Date(0),
  };
}

/**
 * Pure function: given the current SkillState and a new AttemptOutcome,
 * return the next SkillState. Does not call the SRS scheduler — that lives
 * in srs.ts and is composed by the eligible-pool layer.
 *
 * @param state Current skill state
 * @param outcome The new attempt outcome
 * @param difficultyBand The skill's difficulty band [min, max] — used for relative mastery threshold
 */
export function applyOutcome(
  state: SkillState,
  outcome: AttemptOutcome,
  difficultyBand: readonly [number, number],
): SkillState {
  const recentWindow = [...state.recentWindow, outcome].slice(-RECENT_WINDOW_SIZE);
  const attempts = state.attempts + 1;
  const correct = state.correct + (outcome.correct ? 1 : 0);
  const currentDifficulty = updateDifficultyEwma(state.currentDifficulty, outcome);
  const nextState = nextMasteryState(state.state, recentWindow, difficultyBand);

  return {
    ...state,
    state: nextState,
    attempts,
    correct,
    recentWindow,
    currentDifficulty,
    updatedAt: outcome.occurredAt,
  };
}

function updateDifficultyEwma(prev: number, o: AttemptOutcome): number {
  // Only update on correct, unhinted, non-scaffolded attempts — those are
  // the signal of "the kid is comfortable at this difficulty."
  if (!o.correct || o.hinted || o.scaffolded) return prev;
  const alpha = 0.3;
  return prev === 0 ? o.difficulty : prev * (1 - alpha) + o.difficulty * alpha;
}

function nextMasteryState(
  prev: MasteryState,
  recent: AttemptOutcome[],
  difficultyBand: readonly [number, number],
): MasteryState {
  // Demotion: 2 unhinted, non-scaffolded wrongs in a row.
  if (recent.length >= 2) {
    const [a, b] = [recent[recent.length - 2], recent[recent.length - 1]];
    if (
      a &&
      b &&
      !a.correct &&
      !b.correct &&
      !a.hinted &&
      !b.hinted &&
      !a.scaffolded &&
      !b.scaffolded
    ) {
      return "learning";
    }
  }

  // Unstarted → learning on any first attempt.
  if (prev === "unstarted") return "learning";

  // Promotion: learning → practicing on 1 correct.
  if (prev === "learning") {
    if (recent.some((o) => o.correct)) return "practicing";
    return "learning";
  }

  // Promotion: practicing → mastered when last 5 unhinted attempts are
  // 4-of-5 correct AND at least one was in the upper third of the skill's own difficulty band.
  if (prev === "practicing") {
    const unhinted = recent.filter((o) => !o.hinted && !o.scaffolded);
    const last5 = unhinted.slice(-5);
    if (last5.length >= 5) {
      const correctCount = last5.filter((o) => o.correct).length;
      const upperThreshold = difficultyBand[0] + 0.66 * (difficultyBand[1] - difficultyBand[0]);
      const sawHardEnough = last5.some((o) => o.correct && o.difficulty >= upperThreshold);
      if (correctCount >= 4 && sawHardEnough) return "mastered";
    }
    return "practicing";
  }

  // Mastered/review states are advanced by SRS, not by raw outcomes — we
  // only handle demotion here. Stay put otherwise.
  return prev;
}
