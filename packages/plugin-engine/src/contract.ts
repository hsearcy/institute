import { z } from "zod";
import type { ComponentType } from "react";
import type { AttemptOutcome } from "@institute/skill-engine";

/** Re-export so plugins import everything from one place. */
export type { AttemptOutcome };

export type RoundResult = {
  status: "completed" | "aborted";
  outcomes: AttemptOutcome[];
  durationMs: number;
};

export type SceneProps<Params = unknown> = {
  params: Params;
  onComplete: (r: RoundResult) => void;
  /** The skill this round is practicing. Plugins stamp it onto every AttemptOutcome. */
  skillId: string;
};

/**
 * Manifest fields validated structurally on register. The `paramSchema` itself
 * is a ZodType (not validatable by another Zod schema), so we check it
 * structurally in the registry.
 */
export const ManifestBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  supportedSkills: z.array(z.string().min(1)).nonempty(),
});

export type Manifest<Params = unknown> = z.infer<typeof ManifestBaseSchema> & {
  paramSchema: z.ZodType<Params>;
};

export type EvaluateResult = {
  correct: boolean;
  expected: number;
  isLastStep: boolean;
};

export type Plugin<Params = unknown> = {
  manifest: Manifest<Params>;
  Scene: ComponentType<SceneProps<Params>>;
  evaluate: (params: Params, step: number, answer: number) => EvaluateResult;
};
