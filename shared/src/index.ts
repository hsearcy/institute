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

/** Extra on-screen context shown with a problem. A union so later kinds (shapes
 *  for geometry, clock faces) slot in beside the first one. */
export const ProblemVisualSchema = z.discriminatedUnion("kind", [
  /** Nearby facts from the same times table, e.g. 8 × 6 = 48 above 8 × 7 = ?.
   *  `rows` never contains the target factor; the client inserts the "?" row. */
  z.object({
    kind: z.literal("fact_ladder"),
    table: z.number().int(),
    target: z.number().int(),
    rows: z.array(z.object({ factor: z.number().int(), product: z.number().int() })),
  }),
]);
export type ProblemVisual = z.infer<typeof ProblemVisualSchema>;

/** One math problem = one gem to mine. */
export const ProblemSchema = z.object({
  /** Unique id (the server stamps this). */
  id: z.string(),
  skill: z.enum(SKILLS),
  /** Curated-graph topic this problem exercises (Marble taxonomy id). */
  topicId: z.string().optional(),
  /** Short kid-facing topic label for the HUD, e.g. "Number Bonds". */
  topicLabel: z.string().optional(),
  /** He has never met this topic: show the worked demonstration first. */
  newTopic: z.boolean().optional(),
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
  /** Optional on-screen context (see ProblemVisualSchema). */
  visual: ProblemVisualSchema.optional(),
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

/** A brand-new topic's demonstration: one worked example he only watches. */
export const DemoRequestSchema = z.object({
  profileId: z.string(),
  topicId: z.string(),
});
export type DemoRequest = z.infer<typeof DemoRequestSchema>;
export const DemoResponseSchema = z.object({
  kidLabel: z.string(),
  name: z.string(),
  example: z.object({
    prompt: z.string(),
    spoken: z.string(),
    answer: z.number().int(),
    hint: z.string().optional(),
  }),
  script: z.string(),
});
export type DemoResponse = z.infer<typeof DemoResponseSchema>;

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

// ---- Daily correct-answer count + the all-time daily record ----------------
//
// "Day" everywhere below is the PLAYER's calendar day in an explicitly
// configured IANA timezone (server env PLAYER_TZ, default America/New_York) —
// never the machine's ambient TZ. The zone travels with the payload so the UI
// can say which clock it means.

/** One calendar day's tally of problems he got right. */
export const DailyCountSchema = z.object({
  /** Player-timezone calendar day, YYYY-MM-DD. */
  day: z.string(),
  count: z.number().int(),
});
export type DailyCount = z.infer<typeof DailyCountSchema>;

/** How far back the count can be trusted. The pre-feature database recorded no
 *  problem id for a "solved on a retry" answer, so those are gone for good and
 *  cannot be reconstructed. Rather than pretend otherwise, the server publishes
 *  the first day it knows is fully counted, and the UI says so. */
export const DailyTrackingSchema = z.object({
  /** First day counted completely (null only if migration hasn't run). */
  completeSince: z.string().nullable(),
  /** True when history before `completeSince` was reconstructed from the attempt
   *  log and may under-count (legacy retry solves were never recorded). */
  backfilled: z.boolean(),
});
export type DailyTracking = z.infer<typeof DailyTrackingSchema>;

/** A record-breaking moment, persisted server-side so a lost response or a
 *  reload can still deliver the celebration. `id` is stable, which is what lets
 *  the client show it exactly once. */
export const DailyRecordEventSchema = z.object({
  /** Stable id: `${profileId}:${day}:${count}`. */
  id: z.string(),
  day: z.string(),
  /** Today's count at the moment the record fell. */
  count: z.number().int(),
  /** The record it beat. */
  previousRecord: z.number().int(),
});
export type DailyRecordEvent = z.infer<typeof DailyRecordEventSchema>;

/** Summary numbers for the stats panel — cheap to compute, all server-side. */
export const DailyStatsSchema = z.object({
  /** Problems right over the last 7 days (today included). */
  last7Total: z.number().int(),
  /** last7Total / 7, rounded to one decimal. */
  last7Average: z.number(),
  /** The all-time best day (null before he has ever solved one). */
  bestDay: DailyCountSchema.nullable(),
  /** Distinct days with at least one tracked correct answer. */
  daysPlayed: z.number().int(),
  /** Every problem counted, each exactly once. Named for what it really is:
   *  the total we TRACKED, which pre-dates-the-feature retries can undercount. */
  trackedSolves: z.number().int(),
  /** Consecutive days with at least one solve, ending today (or yesterday if
   *  today is still empty, so an unplayed morning doesn't read as a broken run). */
  currentStreakDays: z.number().int(),
});
export type DailyStats = z.infer<typeof DailyStatsSchema>;

/** Everything the HUD record chip and the stats panel need, in one payload. */
export const DailyRecordSchema = z.object({
  /** Today's calendar day, YYYY-MM-DD, in `timeZone`. */
  day: z.string(),
  /** The IANA zone that defines "today" for this player. */
  timeZone: z.string(),
  /** Problems he has got right today. */
  today: z.number().int(),
  /** The best single-day count ever, today included. */
  record: z.number().int(),
  /** The day that set `record` (null before any solve). */
  recordDay: z.string().nullable(),
  /** Today IS the record (or ties it) — the chip celebrates quietly. */
  isRecord: z.boolean(),
  /** Recent days oldest → newest, zero-filled, for the graph. */
  history: z.array(DailyCountSchema),
  stats: DailyStatsSchema,
  tracking: DailyTrackingSchema,
  /** Record moments the client has not acknowledged yet. Delivery is durable and
   *  at-least-once; the client de-dupes on `id` to present each exactly once. */
  pendingEvents: z.array(DailyRecordEventSchema),
});
export type DailyRecord = z.infer<typeof DailyRecordSchema>;

/** The daily-count delta returned alongside one solved problem. */
export const DailyProgressSchema = z.object({
  day: z.string(),
  today: z.number().int(),
  /** Best day ever, today included (so the HUD can render today vs record). */
  record: z.number().int(),
  /** Best day EXCLUDING today — the bar he had to clear. */
  previousRecord: z.number().int(),
  /** True on exactly the answer that beat an existing record. Requires a real
   *  earlier benchmark (`previousRecord > 0`), so the first-ever day — which has
   *  nothing to beat — never fires it. */
  newRecord: z.boolean(),
  /** The persisted record event's id when `newRecord` is true; null otherwise. */
  eventId: z.string().nullable(),
});
export type DailyProgress = z.infer<typeof DailyProgressSchema>;

/** Client → server: "I have shown this record celebration." Idempotent. */
export const DailyRecordAckSchema = z.object({
  profileId: z.string(),
  eventId: z.string(),
});
export type DailyRecordAck = z.infer<typeof DailyRecordAckSchema>;

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
  /** Today's correct-answer count + record after this answer (absent when the
   *  action didn't solve a problem, e.g. a miss or the hoard bonus). */
  daily: DailyProgressSchema.optional(),
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
  /** Today vs his all-time daily record, plus history for the stats graph.
   *  Optional so a client running against an older server still parses. */
  daily: DailyRecordSchema.optional(),
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

export * from "./rpg";
export * from "./rpgLoot";
export * from "./rpgEconomy";
