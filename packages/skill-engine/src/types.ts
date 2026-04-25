export type SkillId = string;

/**
 * A single math skill the system can practice and assess.
 * `prereqs` must be skills that are at least `practicing` before this one becomes eligible.
 * `difficultyBand` is the [min, max] difficulty (0..1) of problems generated for this skill.
 */
export type Skill = {
  id: SkillId;
  description: string;
  prereqs: SkillId[];
  difficultyBand: readonly [number, number];
};

export type Taxonomy = ReadonlyArray<Skill>;

export type MasteryState = "unstarted" | "learning" | "practicing" | "mastered" | "review";

/**
 * One attempt at a problem. Hinted means a hint was shown; scaffolded means
 * the kid used the tap-fallback grid (per spec, scaffolded attempts do NOT
 * count toward demotion).
 */
export type AttemptOutcome = {
  correct: boolean;
  hinted: boolean;
  scaffolded: boolean;
  difficulty: number; // 0..1
  occurredAt: Date;
};

export type SkillState = {
  profileId: string;
  skillId: SkillId;
  state: MasteryState;
  attempts: number;
  correct: number;
  /** Last 8 outcomes, newest last. */
  recentWindow: AttemptOutcome[];
  /** EWMA of recent problem difficulties (only correct, unhinted attempts). */
  currentDifficulty: number;
  /** SRS interval in days. 0 = not yet scheduled. */
  srsInterval: number;
  /** SRS ease factor (SM-2-style). 1.3..2.8. Default 2.5. */
  srsEase: number;
  /** When the next review is due. null until first transition into `review`. */
  nextReviewAt: Date | null;
  updatedAt: Date;
};

export const RECENT_WINDOW_SIZE = 8;
