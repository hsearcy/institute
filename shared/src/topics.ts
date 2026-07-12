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
  z.object({ kind: z.literal("mul"), tables: z.array(z.number().int()).min(1) }),
  z.object({ kind: z.literal("mul_div"), tables: z.array(z.number().int()).min(1) }),
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
});
export type Topic = z.infer<typeof TopicSchema>;

export const TOPICS: Topic[] = z.object({ topics: z.array(TopicSchema) }).parse(raw).topics;
const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
export const topicById = (id: string): Topic | undefined => BY_ID.get(id);
