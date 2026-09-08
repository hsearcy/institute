// The curated skill graph (from the Marble Skill Taxonomy — see data/taxonomy/NOTICE).
// Topics are the units of mastery; prereqs gate unlocking; GenSpec tells the server
// how to synthesize problems for a topic.
import { z } from "zod";
import raw from "./topics.json";

export const GenSpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add_sub"), max: z.number().int(), carry: z.boolean().optional() }),
  z.object({ kind: z.literal("missing_addend"), totalMax: z.number().int() }),
  z.object({ kind: z.literal("add3"), sumMax: z.number().int() }),
  z.object({ kind: z.literal("next_number"), max: z.number().int() }),
  z.object({
    kind: z.literal("skip"), steps: z.array(z.number().int()).min(1),
    /** Start from an arbitrary (non-multiple) number, e.g. 34, 44, 54. */
    offset: z.boolean().optional(),
    /** Sometimes count backwards. */
    back: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("ten_more_less"), max: z.number().int(),
    /** Jump sizes (default [10]) — [10, 100] for the to-1000 topic. */
    steps: z.array(z.number().int()).min(1).optional(),
  }),
  z.object({ kind: z.literal("compose_tens"), tensMax: z.number().int() }),
  z.object({ kind: z.literal("add_sub_tens") }),
  z.object({ kind: z.literal("mul"), tables: z.array(z.number().int()).min(1), maxFactor: z.number().int().optional() }),
  z.object({ kind: z.literal("mul_div"), tables: z.array(z.number().int()).min(1), maxFactor: z.number().int().optional() }),
  z.object({ kind: z.literal("div"), divisors: z.array(z.number().int()).min(1), quotientMax: z.number().int() }),
  // ---- expansion batch (2026-07-10) ----
  z.object({ kind: z.literal("two_digit_ones") }),          // 34 + 5 / 62 − 4
  z.object({ kind: z.literal("add_within_100") }),          // 2-digit + 1-digit or + tens
  z.object({ kind: z.literal("add_2d2d") }),                // 34 + 25 / 71 − 24
  z.object({ kind: z.literal("missing_any"), max: z.number().int() }), // ? in any slot of a±b=c
  z.object({ kind: z.literal("compare_pick"), max: z.number().int() }), // type the bigger/smaller
  z.object({ kind: z.literal("compose_hundreds") }),        // 3 hundreds 4 tens 2 ones
  z.object({ kind: z.literal("coins") }),                   // coin values → total cents
  z.object({ kind: z.literal("money_sum") }),               // make an amount / how many more ¢
  z.object({ kind: z.literal("round_to"), bases: z.array(z.number().int()).min(1) }),
  z.object({ kind: z.literal("odd_pick") }),                // type the odd/even one
  // ---- expansion batch (2026-09-08): 11 kinds for the post-30-mastered frontier ----
  z.object({ kind: z.literal("estimate_sum") }),            // About 48 + 31? (round to tens, add)
  z.object({ kind: z.literal("add_sub_3d"), op: z.enum(["add", "sub"]) }), // 234 + 45 / 671 − 38
  z.object({ kind: z.literal("missing_factor"), maxFactor: z.number().int() }), // 3 × ? = 24
  z.object({ kind: z.literal("mul_2d1d") }),                // 23 × 4
  z.object({ kind: z.literal("div_rem"), maxDivisor: z.number().int() }), // 23 ÷ 4, leftover?
  z.object({ kind: z.literal("frac_of"), dens: z.array(z.number().int()).min(1) }), // 1/4 of 20
  z.object({ kind: z.literal("double_half"), max: z.number().int() }), // Double 34 / Half of 60
  z.object({ kind: z.literal("change_from") }),             // Pay 100¢ for 65¢, change?
  z.object({ kind: z.literal("time_minutes") }),            // Minutes in 2 hours? / 3:15 to 3:50
  z.object({ kind: z.literal("perimeter_rect") }),          // Rectangle 6 by 4, perimeter?
  z.object({ kind: z.literal("area_tiles") }),              // 6 rows of 4 tiles, total?
]);
export type GenSpec = z.infer<typeof GenSpecSchema>;

export const TopicSchema = z.object({
  id: z.string(),
  name: z.string(),
  kidLabel: z.string(),
  domain: z.string(),
  ageRange: z.tuple([z.number(), z.number()]),
  description: z.string(),
  evidence: z.array(z.string()),
  assessmentPrompt: z.string(),
  legacySkill: z.string(),
  gen: GenSpecSchema,
  fluentMs: z.number().int().nullable(),
  prereqs: z.array(z.string()),
  /** Soft-edge remediation targets: NOT unlock gates — where the tutor steps
   *  down to when the child keeps missing this topic. */
  helpPrereqs: z.array(z.string()),
});
export type Topic = z.infer<typeof TopicSchema>;

export const TOPICS: Topic[] = z.object({ topics: z.array(TopicSchema) }).parse(raw).topics;
const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
export const topicById = (id: string): Topic | undefined => BY_ID.get(id);
