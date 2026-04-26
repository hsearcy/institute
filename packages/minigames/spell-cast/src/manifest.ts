import { z } from "zod";
import type { Manifest } from "@institute/plugin-engine";

export const SpellCastParams = z.object({
  enemyType: z.enum(["goblin", "slime", "ghost"]),
  /** Sequence of correct answers, in order. e.g. [2,4,6,8,10] for skip-by-2s. */
  sequence: z.array(z.number().int().nonnegative()).nonempty(),
  /** Tutor-spoken intro line (M2 renders as on-screen text). */
  intro: z.string().min(1),
});
export type SpellCastParams = z.infer<typeof SpellCastParams>;

export const manifest: Manifest<SpellCastParams> = {
  id: "spell-cast",
  title: "Spell Cast",
  supportedSkills: ["skip_count_2", "skip_count_5", "skip_count_10", "sequence_next"],
  paramSchema: SpellCastParams,
};
