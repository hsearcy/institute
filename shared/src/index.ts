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
  /** Curated-graph topic this problem exercises (Marble taxonomy id). */
  topicId: z.string().optional(),
  /** Short kid-facing topic label for the HUD, e.g. "Number Bonds". */
  topicLabel: z.string().optional(),
  /** Written form shown on the rock, e.g. "8 + 7" or "5, 10, 15, ?". */
  prompt: z.string().min(1).max(40),
  /** Kid-friendly spoken form the tutor reads, e.g. "What is eight plus seven?". */
  spoken: z.string().min(1).max(160),
  /** The correct numeric answer (what the kid keys in). */
  answer: z.number().int().min(0).max(999),
  /** 0..1 difficulty, for telemetry and the gem-rarity mapping. */
  difficulty: z.number().min(0).max(1),
  /** A warm, kid-friendly strategy hint (e.g. make-a-ten), shown if he gets stuck. */
  hint: z.string().max(200).optional(),
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
  /** Curated-graph topic the problem exercised (drives topic mastery + unlocks). */
  topicId: z.string().optional(),
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

/** Kid taps 🎓 → the tutor explains THIS problem aloud (never stating the answer). */
export const ExplainRequestSchema = z.object({
  profileId: z.string(),
  problem: ProblemSchema,
});
export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;
export const ExplainResponseSchema = z.object({ text: z.string().min(1).max(600) });
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;

export const TtsRequestSchema = z.object({ text: z.string().min(1).max(600) });
export type TtsRequest = z.infer<typeof TtsRequestSchema>;

// ---- Rewards (gems / streaks / daily quests / shield) ----------------------

/** A daily quest the kid can complete for bonus gems (refreshes each UTC day). */
export const QuestSchema = z.object({
  key: z.string(),
  label: z.string(),
  target: z.number().int(),
  progress: z.number().int(),
  reward: z.number().int(),
  done: z.boolean(),
});
export type Quest = z.infer<typeof QuestSchema>;

/** A quest reported as just-completed by an attempt. */
export const CompletedQuestSchema = z.object({
  key: z.string(),
  label: z.string(),
  reward: z.number().int(),
});
export type CompletedQuest = z.infer<typeof CompletedQuestSchema>;

/** Live durability of the equipped pickaxe. `current`/`max` are null for wooden
 *  (the free starter never wears). `broke` = it just hit 0 this action and the
 *  equip auto-reverted to wooden. */
export const DurabilitySchema = z.object({
  key: z.string(),
  current: z.number().int().nullable(),
  max: z.number().int().nullable(),
  broke: z.boolean(),
});
export type Durability = z.infer<typeof DurabilitySchema>;

/** The reward delta returned by POST /tutor/attempt for one first-try answer. */
export const RewardSchema = z.object({
  gemsEarned: z.number().int(),
  totalGems: z.number().int(),
  lifetimeGems: z.number().int(),
  streak: z.number().int(),
  bestStreak: z.number().int(),
  shields: z.number().int(),
  milestone: z.number().int().nullable(),
  shieldUsed: z.boolean(),
  questsCompleted: z.array(CompletedQuestSchema),
  /** The streak that was just lost to a counted miss (0 if shielded/none) — drives the best-streak trophy. */
  streakLost: z.number().int().optional(),
  /** True the moment the LAST daily quest completes: a Crazy Coin was just awarded. */
  allDailiesCrazyCoin: z.boolean().optional(),
  /** Equipped-pickaxe durability after this action (absent when nothing wore). */
  durability: DurabilitySchema.nullable().optional(),
});
export type Reward = z.infer<typeof RewardSchema>;

/** The persisted per-profile reward state returned by GET /state. */
export const StateSchema = z.object({
  gems: z.number().int(),
  lifetimeGems: z.number().int(),
  streak: z.number().int(),
  bestStreak: z.number().int(),
  shields: z.number().int(),
  quests: z.array(QuestSchema),
  /** Sunday–Saturday quest for completing the full daily board on five days. */
  weeklyQuest: QuestSchema,
  /** The equipped pickaxe skin key (defaults to "wooden"). */
  equipped: z.string(),
  /** Durability of the equipped pickaxe (null current/max for wooden). */
  durability: DurabilitySchema.nullable().optional(),
  /** The equipped mine-target model (defaults to "gem_classic"). */
  equippedGemStyle: z.string().optional(),
});
export type State = z.infer<typeof StateSchema>;

// ---- Pickaxe-skin shop -----------------------------------------------------

/** One catalog entry in the pickaxe-skin shop, as returned by GET /shop. */
export const ShopItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  price: z.number().int(),
  owned: z.boolean(),
  equipped: z.boolean(),
  /** Current durability (null = wooden/infinite; equals maxDurability if unowned). */
  durability: z.number().int().nullable(),
  /** Full durability for this tier (null for wooden). */
  maxDurability: z.number().int().nullable(),
  /** Gem cost to fully repair this tier (0 for wooden). */
  repairCost: z.number().int(),
});
export type ShopItem = z.infer<typeof ShopItemSchema>;

/** The shop view returned by GET /shop: balance, equipped skin, and full catalog. */
/** A number-pad style theme in the shop (pure cosmetic gem sink). */
export const PadThemeSchema = z.object({
  key: z.string(),
  name: z.string(),
  price: z.number().int(),
  owned: z.boolean(),
  equipped: z.boolean(),
});
export type PadTheme = z.infer<typeof PadThemeSchema>;

/** A cosmetic model for the gem/geode being mined. */
export const GemStyleSchema = z.object({
  key: z.string(),
  name: z.string(),
  price: z.number().int(),
  owned: z.boolean(),
  equipped: z.boolean(),
});
export type GemStyle = z.infer<typeof GemStyleSchema>;

export const ShopStateSchema = z.object({
  gems: z.number().int(),
  equipped: z.string(),
  items: z.array(ShopItemSchema),
  padThemes: z.array(PadThemeSchema).optional(),
  equippedPadTheme: z.string().optional(),
  gemStyles: z.array(GemStyleSchema).optional(),
  equippedGemStyle: z.string().optional(),
});
export type ShopState = z.infer<typeof ShopStateSchema>;

// ---- Curated skill graph (Marble taxonomy) ---------------------------------
export * from "./topics.ts";
