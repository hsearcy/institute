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
  z.object({ kind: z.literal("skip"), steps: z.array(z.number().int()).min(1) }),
  z.object({ kind: z.literal("ten_more_less"), max: z.number().int() }),
  z.object({ kind: z.literal("compose_tens"), tensMax: z.number().int() }),
  z.object({ kind: z.literal("add_sub_tens") }),
  z.object({ kind: z.literal("mul"), tables: z.array(z.number().int()).min(1) }),
  z.object({ kind: z.literal("mul_div"), tables: z.array(z.number().int()).min(1) }),
  z.object({ kind: z.literal("div"), divisors: z.array(z.number().int()).min(1), quotientMax: z.number().int() }),
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
