import { z } from "zod";
import type { Manifest } from "@institute/plugin-engine";

/** A single addition problem: a + b = answer. */
export const BlockTowerProblem = z.object({
  a: z.number().int().nonnegative(),
  b: z.number().int().nonnegative(),
  answer: z.number().int().nonnegative(),
});

export const BlockTowerParams = z.object({
  /** Ordered addition problems, one per step. */
  problems: z.array(BlockTowerProblem).nonempty(),
  /** Tutor-spoken intro line (host's voice layer / on-screen text). */
  intro: z.string().min(1),
  /**
   * Ordered list of correct answers (= each problem's answer), so the host's
   * voice layer can read them without re-deriving from `problems`.
   */
  sequence: z.array(z.number().int().nonnegative()).nonempty(),
});
export type BlockTowerParams = z.infer<typeof BlockTowerParams>;

export const manifest: Manifest<BlockTowerParams> = {
  id: "block-tower",
  title: "Block Tower",
  supportedSkills: ["add_within_10", "add_within_20", "sums_to_n"],
  paramSchema: BlockTowerParams,
};

/**
 * Sensible default/fixture the host can wire directly. The `sequence` mirrors
 * each problem's `answer` in order.
 */
export const fixtureParams: BlockTowerParams = {
  problems: [
    { a: 3, b: 4, answer: 7 },
    { a: 5, b: 5, answer: 10 },
    { a: 6, b: 7, answer: 13 },
  ],
  intro: "Let's build a block tower! Add the blocks to stack it up high.",
  sequence: [7, 10, 13],
};
