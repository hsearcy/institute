import { z } from "zod";
import type { Manifest } from "@institute/plugin-engine";

/**
 * One code-slot problem. For `sub` the prompt is `a - b` (answer = a - b).
 * For `missing_addend` the prompt is `a + ? = b` (answer = b - a).
 * `answer` is stored explicitly so the host's voice layer and the Scene
 * agree on the expected value without re-deriving it.
 */
export const DoorCodeProblem = z.object({
  kind: z.enum(["sub", "missing_addend"]),
  a: z.number().int().nonnegative(),
  b: z.number().int().nonnegative(),
  answer: z.number().int().nonnegative(),
});
export type DoorCodeProblem = z.infer<typeof DoorCodeProblem>;

export const DoorCodeParams = z.object({
  /** Ordered code-slot problems. Each fills one digit of the door code. */
  problems: z.array(DoorCodeProblem).nonempty(),
  /** Tutor-spoken intro line (host renders / speaks it). */
  intro: z.string().min(1),
  /** Ordered correct answers (each problem's answer) for the host's voice layer. */
  sequence: z.array(z.number().int().nonnegative()).nonempty(),
});
export type DoorCodeParams = z.infer<typeof DoorCodeParams>;

export const manifest: Manifest<DoorCodeParams> = {
  id: "door-code",
  title: "Door Code",
  supportedSkills: ["sub_within_10", "sub_within_20", "missing_addend"],
  paramSchema: DoorCodeParams,
};
