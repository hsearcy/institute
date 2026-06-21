// The contract shared by the web game and the tutor server. A single typed
// schema across the boundary — validated at runtime — so a malformed problem can
// never slip through (the v1 tutor's worst bug class was JS↔Ruby schema drift).
import { z } from "zod";

/** The skill ladder = the depth of the mine. MVP focuses on the first two. */
export const SKILLS = [
  "add_within_20",
  "subtraction",
  "skip_counting",
  "place_value",
  "multiplication",
  "division",
] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_LABELS: Record<Skill, string> = {
  add_within_20: "Addition to 20",
  subtraction: "Subtraction",
  skip_counting: "Skip-counting",
  place_value: "Place value",
  multiplication: "Multiplication",
  division: "Division",
};

/** One math problem = one gem to mine. */
export const ProblemSchema = z.object({
  /** Unique id (the server stamps this). */
  id: z.string(),
  skill: z.enum(SKILLS),
  /** Written form shown on the rock, e.g. "8 + 7" or "5, 10, 15, ?". */
  prompt: z.string().min(1).max(40),
  /** Kid-friendly spoken form the tutor reads, e.g. "What is eight plus seven?". */
  spoken: z.string().min(1).max(160),
  /** The correct numeric answer (what the kid keys in). */
  answer: z.number().int().min(0).max(999),
  /** 0..1 difficulty, for telemetry and the gem-rarity mapping. */
  difficulty: z.number().min(0).max(1),
});
export type Problem = z.infer<typeof ProblemSchema>;

/** Speculative pre-generation: the next problem for BOTH outcomes of the current
 *  one, so whichever the kid does, the next gem is already loaded (zero wait). */
export const BranchesSchema = z.object({
  right: ProblemSchema, // got it right → build on it / stretch
  wrong: ProblemSchema, // got it wrong → reinforce / ease off
});
export type Branches = z.infer<typeof BranchesSchema>;

/** One recorded answer — drives mastery + the LLM's next-difficulty decision. */
export const AttemptSchema = z.object({
  profileId: z.string(),
  problemId: z.string(),
  skill: z.enum(SKILLS),
  correct: z.boolean(),
  solveMs: z.number().int().min(0),
});
export type Attempt = z.infer<typeof AttemptSchema>;

// ---- API payloads ---------------------------------------------------------

export const StartRequestSchema = z.object({ profileId: z.string() });
export type StartRequest = z.infer<typeof StartRequestSchema>;

/** Pre-generate the two follow-ups for the problem currently on screen. */
export const BranchesRequestSchema = z.object({
  profileId: z.string(),
  current: ProblemSchema,
});
export type BranchesRequest = z.infer<typeof BranchesRequestSchema>;

export const TtsRequestSchema = z.object({ text: z.string().min(1).max(300) });
export type TtsRequest = z.infer<typeof TtsRequestSchema>;
