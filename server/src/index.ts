// Institute tutor server (Bun + Hono + bun:sqlite).
//  - POST /tutor/first    → instant first problem (local; uses stored mastery)
//  - POST /tutor/branches → LLM pre-generates BOTH follow-ups for the on-screen
//                           problem (validated; local fallback). Hides latency.
//  - POST /tutor/attempt  → record an answer (drives mastery + adaptivity)
//  - POST /tts            → ElevenLabs reads text aloud
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { Database } from "bun:sqlite";
import Anthropic from "@anthropic-ai/sdk";
import {
  SKILLS, SKILL_LABELS, ProblemSchema, type Problem,
  StartRequestSchema, BranchesRequestSchema, TtsRequestSchema, ExplainRequestSchema,
  TOPICS, topicById, type Topic,
} from "@institute/shared";
import { localProblem, type ProblemDraft, type SkillStat } from "./generate.ts";
import { unlockedTopics, frontierTopics } from "./graph.ts";
import { problemForTopic } from "./topicgen.ts";
import { topicState } from "./mastery.ts";
import { nextReview } from "./review.ts";
import { selectNext } from "./select.ts";
import { rescueTopic } from "./rescue.ts";

const PORT = Number(process.env.PORT ?? 8787);
const TUTOR_MODEL = process.env.TUTOR_MODEL ?? "claude-sonnet-5";
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

// ---- DB --------------------------------------------------------------------
const db = new Database(process.env.DB_PATH ?? "data/institute.db", { create: true });
db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    skill TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    ladder INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    problem_id TEXT NOT NULL,
    skill TEXT NOT NULL,
    correct INTEGER NOT NULL,
    solve_ms INTEGER NOT NULL,
    difficulty REAL NOT NULL DEFAULT 0.5,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attempts_profile ON attempts(profile_id, created_at);
  CREATE TABLE IF NOT EXISTS mastery (
    profile_id TEXT NOT NULL,
    skill TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    last_difficulty REAL NOT NULL DEFAULT 0.5,
    state TEXT NOT NULL DEFAULT 'practicing',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, skill)
  );
  CREATE TABLE IF NOT EXISTS profile_state (
    profile_id TEXT PRIMARY KEY,
    gems INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    shields INTEGER DEFAULT 0,
    updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS quests (
    profile_id TEXT,
    quest_key TEXT,
    day TEXT,
    label TEXT,
    target INTEGER,
    progress INTEGER DEFAULT 0,
    reward INTEGER,
    done INTEGER DEFAULT 0,
    PRIMARY KEY (profile_id, quest_key, day)
  );
  CREATE TABLE IF NOT EXISTS owned_items (
    profile_id TEXT,
    item_key TEXT,
    PRIMARY KEY (profile_id, item_key)
  );
  CREATE TABLE IF NOT EXISTS topic_mastery (
    profile_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    last_difficulty REAL NOT NULL DEFAULT 0.4,
    state TEXT NOT NULL DEFAULT 'practicing',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, topic_id)
  );
`);
// Attempts gain the curated-topic dimension (guarded — ALTER throws if present).
try { db.exec(`ALTER TABLE attempts ADD COLUMN topic_id TEXT`); } catch { /* column exists */ }
// Spaced-review schedule per mastered topic (guarded ALTERs).
try { db.exec(`ALTER TABLE topic_mastery ADD COLUMN review_interval_days REAL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE topic_mastery ADD COLUMN review_due_at INTEGER`); } catch { /* exists */ }
// Add the equipped-pickaxe column (guarded — ALTER throws if it already exists).
try {
  db.exec(`ALTER TABLE profile_state ADD COLUMN equipped_pickaxe TEXT DEFAULT 'wooden'`);
} catch { /* column already present */ }
// Per-owned-item durability (NULL ⇒ treat as full). Pickaxes wear as he mines and
// break at 0 (→ auto-swap to wooden); repair refills it.
try {
  db.exec(`ALTER TABLE owned_items ADD COLUMN durability INTEGER`);
} catch { /* column already present */ }
// Crazy Coins: a real-world consumable — each coin trades for 15 minutes of
// shows, redeemed by a parent from the dashboard (guarded ALTER).
try {
  db.exec(`ALTER TABLE profile_state ADD COLUMN crazy_coins INTEGER DEFAULT 0`);
} catch { /* column already present */ }
// Seed the skill ladder (categories + descent order) from the shared schema.
const seedSkill = db.query(`INSERT OR IGNORE INTO skills (skill, label, ladder) VALUES (?, ?, ?)`);
SKILLS.forEach((s, i) => seedSkill.run(s, SKILL_LABELS[s], i));

/** Upsert per-skill mastery after each attempt (drives adaptivity + the deferred dashboard). */
function recordMastery(profileId: string, skill: string, correct: boolean, difficulty: number): void {
  const row = db.query(`SELECT attempts, correct FROM mastery WHERE profile_id = ? AND skill = ?`)
    .get(profileId, skill) as { attempts: number; correct: number } | null;
  const attempts = (row?.attempts ?? 0) + 1;
  const corr = (row?.correct ?? 0) + (correct ? 1 : 0);
  const state = attempts >= 8 && corr / attempts >= 0.85 ? "mastered" : "practicing";
  db.query(
    `INSERT INTO mastery (profile_id, skill, attempts, correct, last_difficulty, state, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, skill) DO UPDATE SET
       attempts = excluded.attempts, correct = excluded.correct,
       last_difficulty = excluded.last_difficulty, state = excluded.state, updated_at = excluded.updated_at`,
  ).run(profileId, skill, attempts, corr, difficulty, state, Date.now());
}

// ---- Curated-topic mastery (the skill graph) --------------------------------

type TopicMasteryRow = {
  topic_id: string; attempts: number; correct: number; last_difficulty: number; state: string;
  review_interval_days: number | null; review_due_at: number | null;
};

function topicMasteryRows(profileId: string): TopicMasteryRow[] {
  return db.query(
    `SELECT topic_id, attempts, correct, last_difficulty, state, review_interval_days, review_due_at
     FROM topic_mastery WHERE profile_id = ?`,
  ).all(profileId) as TopicMasteryRow[];
}
const masteredTopicIds = (profileId: string): Set<string> =>
  new Set(topicMasteryRows(profileId).filter((r) => r.state === "mastered").map((r) => r.topic_id));

/** Upsert per-topic mastery after an attempt. Accuracy is windowed (last 12
 *  attempts); fluency uses the last 8 correct solves. An attempt on an
 *  already-mastered topic is a REVIEW — it reschedules the next one. NOTE: the
 *  /tutor/attempt handler inserts the attempt row BEFORE calling this, so the
 *  windows include the attempt being recorded. */
function recordTopicMastery(profileId: string, topicId: string, correct: boolean, difficulty: number): void {
  const topic = topicById(topicId);
  if (!topic) return;
  const row = db.query(
    `SELECT attempts, correct, state, review_interval_days FROM topic_mastery WHERE profile_id = ? AND topic_id = ?`,
  ).get(profileId, topicId) as { attempts: number; correct: number; state: string; review_interval_days: number | null } | null;
  const wasMastered = row?.state === "mastered";
  const attempts = (row?.attempts ?? 0) + 1;
  const corr = (row?.correct ?? 0) + (correct ? 1 : 0);
  const recentResults = (db.query(
    `SELECT correct FROM attempts WHERE profile_id = ? AND topic_id = ?
     ORDER BY created_at DESC, id DESC LIMIT 12`,
  ).all(profileId, topicId) as { correct: number }[]).map((r) => !!r.correct);
  const recentSolveMs = (db.query(
    `SELECT solve_ms FROM attempts WHERE profile_id = ? AND topic_id = ? AND correct = 1
     ORDER BY created_at DESC, id DESC LIMIT 8`,
  ).all(profileId, topicId) as { solve_ms: number }[]).map((r) => r.solve_ms);
  const state = topicState({
    lifetimeAttempts: attempts, recentResults, lifetimeRatio: corr / attempts,
    recentSolveMs, fluentMs: topic.fluentMs,
  });
  // Review schedule: any attempt while mastered is a review outcome; the moment
  // of first mastery schedules the first review.
  let schedule: { intervalDays: number; dueAt: number } | null = null;
  if (wasMastered) schedule = nextReview(row?.review_interval_days ?? null, correct, Date.now());
  else if (state === "mastered") schedule = nextReview(null, correct, Date.now());
  db.query(
    `INSERT INTO topic_mastery (profile_id, topic_id, attempts, correct, last_difficulty, state, review_interval_days, review_due_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, topic_id) DO UPDATE SET
       attempts = excluded.attempts, correct = excluded.correct,
       last_difficulty = excluded.last_difficulty, state = excluded.state,
       review_interval_days = COALESCE(excluded.review_interval_days, topic_mastery.review_interval_days),
       review_due_at = COALESCE(excluded.review_due_at, topic_mastery.review_due_at),
       updated_at = excluded.updated_at`,
  ).run(profileId, topicId, attempts, corr, difficulty, state,
    schedule?.intervalDays ?? null, schedule?.dueAt ?? null, Date.now());
}

/** Map an old-model mastered skill onto curated-topic grants (synthetic 8/8). */
const LEGACY_GRANTS: Record<string, string[]> = {
  add_within_20: ["mt_ghF3Vv6taM", "mt_e8CZ7E5qW7"],
  subtraction: ["mt_ghF3Vv6taM"],
  skip_counting: ["mt_M5PPDJStGm", "mt_nvdpxAJTBG"],
  place_value: ["mt_THl9GLxwoL"],
  multiplication: ["mt_PZ909yPrEC"],
  division: ["mt_LpSuPgL31x"],
};

export function grantLegacyMastery(profileId: string, masteredSkills: string[]): void {
  for (const skill of masteredSkills) {
    for (const topicId of LEGACY_GRANTS[skill] ?? []) {
      db.query(
        `INSERT INTO topic_mastery (profile_id, topic_id, attempts, correct, last_difficulty, state, updated_at)
         VALUES (?, ?, 8, 8, 0.5, 'mastered', ?)
         ON CONFLICT(profile_id, topic_id) DO NOTHING`,
      ).run(profileId, topicId, Date.now());
    }
  }
}

// One-shot startup migration: any profile with legacy mastered skills but no
// topic_mastery rows gets its grants.
for (const row of db.query(
  `SELECT DISTINCT profile_id FROM mastery WHERE state = 'mastered'
   AND profile_id NOT IN (SELECT DISTINCT profile_id FROM topic_mastery)`,
).all() as { profile_id: string }[]) {
  const skills = (db.query(`SELECT skill FROM mastery WHERE profile_id = ? AND state = 'mastered'`)
    .all(row.profile_id) as { skill: string }[]).map((r) => r.skill);
  grantLegacyMastery(row.profile_id, skills);
}
// Backfill: mastered rows without a schedule (legacy grants) become due NOW —
// the first sessions verify granted knowledge before building on it.
db.query(`UPDATE topic_mastery SET review_interval_days = 1, review_due_at = ?
          WHERE state = 'mastered' AND review_due_at IS NULL`).run(Date.now());

// ---- Rewards: gems / streaks / daily quests / shield -----------------------

type ProfileStateRow = { gems: number; streak: number; best_streak: number; shields: number; crazy_coins: number; equipped_pickaxe: string };
type QuestRow = { quest_key: string; label: string; target: number; progress: number; reward: number; done: number };

const utcDay = () => new Date().toISOString().slice(0, 10);

// Bonus gems awarded when the client's hoard meter fills up (kept in sync with
// HOARD_BONUS on the client, which renders the "+N" banner).
const HOARD_BONUS = 10;

/** The exact three daily quests, regenerated lazily per UTC day. */
const QUEST_DEFS = [
  { key: "mine_gems", label: "Mine 30 gems today", target: 30, reward: 15 },
  { key: "streak_5", label: "Reach a 5-streak", target: 5, reward: 20 },
  { key: "solve_10", label: "Solve 10 problems", target: 10, reward: 10 },
] as const;

/** Streak bonus gems on top of the base +1 per correct answer. */
function streakBonus(streak: number): number {
  if (streak === 3) return 2;
  if (streak === 5) return 5;
  if (streak === 10) return 10;
  if (streak > 10 && streak % 5 === 0) return 10;
  return 0;
}

/** Read (creating if missing) the per-profile reward state. */
function getProfileState(profileId: string): ProfileStateRow {
  let row = db.query(`SELECT gems, streak, best_streak, shields, crazy_coins, equipped_pickaxe FROM profile_state WHERE profile_id = ?`)
    .get(profileId) as ProfileStateRow | null;
  if (!row) {
    db.query(`INSERT OR IGNORE INTO profile_state (profile_id, gems, streak, best_streak, shields, crazy_coins, equipped_pickaxe, updated_at)
              VALUES (?, 0, 0, 0, 0, 0, 'wooden', ?)`).run(profileId, Date.now());
    row = { gems: 0, streak: 0, best_streak: 0, shields: 0, crazy_coins: 0, equipped_pickaxe: "wooden" };
  }
  // Existing rows predating the columns come back with NULL — normalize to the defaults.
  if (!row.equipped_pickaxe) row.equipped_pickaxe = "wooden";
  if (!row.crazy_coins) row.crazy_coins = 0;
  return row;
}

function saveProfileState(profileId: string, s: ProfileStateRow): void {
  db.query(`UPDATE profile_state SET gems = ?, streak = ?, best_streak = ?, shields = ?, crazy_coins = ?, equipped_pickaxe = ?, updated_at = ?
            WHERE profile_id = ?`)
    .run(s.gems, s.streak, s.best_streak, s.shields, s.crazy_coins, s.equipped_pickaxe, Date.now(), profileId);
}

// ---- Pickaxe-skin shop -----------------------------------------------------

/** Server-owned catalog of pickaxe skins, in ladder order. `wooden` is the free,
 *  default-owned, default-equipped starter. */
const PICKAXE_CATALOG = [
  { key: "wooden", name: "Wooden Pickaxe", price: 0 },
  { key: "stone", name: "Stone Pickaxe", price: 50 },
  { key: "iron", name: "Iron Pickaxe", price: 120 },
  { key: "silver", name: "Silver Pickaxe", price: 250 },
  { key: "gold", name: "Gold Pickaxe", price: 450 },
  { key: "diamond", name: "Diamond Pickaxe", price: 800 },
  { key: "obsidian", name: "Obsidian Pickaxe", price: 1400 },
  { key: "legendary", name: "Legendary Pickaxe", price: 2500 },
] as const;

const catalogEntry = (key: string) => PICKAXE_CATALOG.find((c) => c.key === key) ?? null;

// Full durability per tier = how many gems it mines before wearing out. Pricier
// tiers last much longer (a real reason to climb the ladder, not just looks).
// wooden = the free fallback, never wears. Tunable — start soft.
const DURABILITY: Record<string, number> = {
  stone: 40, iron: 60, silver: 90, gold: 130, diamond: 180, obsidian: 250, legendary: 350,
};
const maxDurability = (key: string): number | null => (key === "wooden" ? null : DURABILITY[key] ?? 60);
// Gentle repair cost: ~10% of the purchase price (min 5). wooden never repairs.
const repairCost = (key: string): number => {
  const cat = catalogEntry(key);
  return cat && cat.price > 0 ? Math.max(5, Math.ceil(cat.price * 0.1)) : 0;
};

/** Whether the profile owns the item. `wooden` is always owned (free starter). */
function ownsItem(profileId: string, itemKey: string): boolean {
  if (itemKey === "wooden") return true;
  const row = db.query(`SELECT 1 FROM owned_items WHERE profile_id = ? AND item_key = ?`)
    .get(profileId, itemKey);
  return !!row;
}

/** Current durability of an owned pickaxe (NULL column ⇒ full; unowned ⇒ 0). */
function itemDurability(profileId: string, key: string): number {
  const max = maxDurability(key);
  if (max === null) return Infinity; // wooden
  const row = db.query(`SELECT durability FROM owned_items WHERE profile_id = ? AND item_key = ?`)
    .get(profileId, key) as { durability: number | null } | null;
  if (!row) return 0;
  return row.durability == null ? max : row.durability;
}

function setItemDurability(profileId: string, key: string, val: number): void {
  db.query(`UPDATE owned_items SET durability = ? WHERE profile_id = ? AND item_key = ?`)
    .run(val, profileId, key);
}

/** Read (and optionally wear −1) the equipped pickaxe's durability. On wear to 0
 *  it breaks: the equip auto-reverts to wooden (skin stays owned at 0 until repaired).
 *  Mutates `state.equipped_pickaxe` on break; the caller persists state. */
function equippedDurability(
  profileId: string,
  state: ProfileStateRow,
  wear: boolean,
): { key: string; current: number | null; max: number | null; broke: boolean } {
  const key = state.equipped_pickaxe;
  const max = maxDurability(key);
  if (max === null) return { key, current: null, max: null, broke: false }; // wooden
  let cur = itemDurability(profileId, key);
  let broke = false;
  if (wear) {
    cur = Math.max(0, cur - 1);
    setItemDurability(profileId, key, cur);
    if (cur <= 0) { state.equipped_pickaxe = "wooden"; broke = true; }
  }
  return { key, current: cur, max, broke };
}

/** Ensure today's quest rows exist; return them. */
function getQuests(profileId: string, day = utcDay()): QuestRow[] {
  const existing = db.query(
    `SELECT quest_key, label, target, progress, reward, done FROM quests WHERE profile_id = ? AND day = ?`,
  ).all(profileId, day) as QuestRow[];
  if (existing.length < QUEST_DEFS.length) {
    const ins = db.query(
      `INSERT OR IGNORE INTO quests (profile_id, quest_key, day, label, target, progress, reward, done)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0)`,
    );
    for (const q of QUEST_DEFS) ins.run(profileId, q.key, day, q.label, q.target, q.reward);
    return db.query(
      `SELECT quest_key, label, target, progress, reward, done FROM quests WHERE profile_id = ? AND day = ?`,
    ).all(profileId, day) as QuestRow[];
  }
  return existing;
}

const questView = (rows: QuestRow[]) => rows.map((r) => ({
  key: r.quest_key, label: r.label, target: r.target,
  progress: r.progress, reward: r.reward, done: !!r.done,
}));

function skillStats(profileId: string): SkillStat[] {
  const rows = db.query(
    `SELECT skill, COUNT(*) n, SUM(correct) c, AVG(difficulty) d
     FROM attempts WHERE profile_id = ? GROUP BY skill`,
  ).all(profileId) as { skill: string; n: number; c: number; d: number }[];
  return rows
    .filter((r) => (SKILLS as readonly string[]).includes(r.skill))
    .map((r) => ({ skill: r.skill as SkillStat["skill"], attempts: r.n, correct: r.c ?? 0, avgDifficulty: r.d ?? 0.5 }));
}

function recentAttempts(profileId: string, n: number) {
  return db.query(
    `SELECT skill, topic_id, correct, solve_ms, difficulty FROM attempts
     WHERE profile_id = ? ORDER BY created_at DESC LIMIT ?`,
  ).all(profileId, n) as { skill: string; topic_id: string | null; correct: number; solve_ms: number; difficulty: number }[];
}

let idCounter = 0;
const stampId = (d: ProblemDraft): Problem => ({ ...d, id: `p${Date.now().toString(36)}_${idCounter++}` });

// ---- LLM tutor -------------------------------------------------------------
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // Tests point at a dead endpoint and need instant local fallback (retries 0).
  maxRetries: Number(process.env.TUTOR_MAX_RETRIES ?? 2),
  // Branches are speculative pre-generation: past ~15s the answer has already
  // happened and the local fallback is strictly better than waiting.
  timeout: Number(process.env.TUTOR_TIMEOUT_MS ?? 15_000),
});

const PROBLEM_DRAFT_SCHEMA = {
  type: "object",
  properties: {
    skill: { type: "string", enum: [...SKILLS] },
    prompt: { type: "string", description: "Written form on the rock, e.g. \"8 + 7\" or \"5, 10, 15, ?\"" },
    spoken: { type: "string", description: "Kid-friendly spoken form, e.g. \"What is 8 plus 7?\"" },
    answer: { type: "integer", description: "The correct numeric answer the kid keys in" },
    difficulty: { type: "number", description: "0..1" },
    hint: { type: "string", description: "One warm, concrete strategy hint a 6-year-old can act on if stuck — e.g. make-a-ten: \"Make a ten! 8 plus 2 is 10, then 5 more makes 15.\" Not just the answer." },
  },
  required: ["skill", "prompt", "spoken", "answer", "difficulty", "hint"],
  additionalProperties: false,
} as const;

const BRANCHES_TOOL = {
  name: "next_problems",
  description: "The next math problem for BOTH outcomes of the current one.",
  input_schema: {
    type: "object",
    properties: { right: PROBLEM_DRAFT_SCHEMA, wrong: PROBLEM_DRAFT_SCHEMA },
    required: ["right", "wrong"],
    additionalProperties: false,
  },
} as const;

const SYSTEM = `You are the adaptive tutor inside "Institute", a gem-mine math game for one 6-year-old. Each turn you produce the next problem for BOTH outcomes of the problem he is solving right now — "right" (he answers correctly) and "wrong" (he misses it) — so the game can instantly load whichever happens.

You are given his LIVE per-skill mastery and concrete difficulty targets computed from his real attempts. Follow that data and those targets. Do NOT assume fixed strengths or weaknesses — they change as he learns.

Rules:
- You will be told the exact TOPIC each branch must exercise, with its teaching goal, what mastery looks like, and an example problem of the right shape. Stay inside that topic's numeric envelope — match the example's FORM (operation, number sizes, prompt shape) with different numbers.
- "difficulty" (0..1) must match the target you are given.
- Keep him productive: "right" stretches a little harder, "wrong" eases off and rebuilds confidence in the SAME topic.
- VARY the numbers a lot: consecutive problems must not share the same total and must not be permutations of one another (8+12, 9+11 are bad — repetitive). Never reuse the problem he is on.
- "prompt" is the short written form; "spoken" is a warm, kid-friendly sentence to read aloud (no emoji/markdown). "answer" is the exact integer.
- "hint" teaches a concrete strategy he can act on if he's stuck (make-a-ten, count-on, count-back) — a real method, never just restating the answer.
Return via the next_problems tool only.`;

type SkillSummary = { skill: string; label: string; attempts: number; accuracy: number; state: string; avgDifficulty: number };

/** Per-skill mastery summary built fresh each call from the DB (replaces a frozen persona). */
function learnerSummaries(profileId: string): SkillSummary[] {
  const rows = db.query(
    `SELECT s.skill, s.label, m.attempts, m.correct, m.last_difficulty, m.state
     FROM skills s LEFT JOIN mastery m ON m.skill = s.skill AND m.profile_id = ?
     ORDER BY s.ladder`,
  ).all(profileId) as { skill: string; label: string; attempts: number | null; correct: number | null; last_difficulty: number | null; state: string | null }[];
  return rows.map((r) => ({
    skill: r.skill,
    label: r.label,
    attempts: r.attempts ?? 0,
    accuracy: r.attempts ? (r.correct ?? 0) / r.attempts : 0,
    state: r.state ?? "unstarted",
    avgDifficulty: r.last_difficulty ?? 0.4,
  }));
}

function describeLearner(sums: SkillSummary[]): string {
  const lines = sums.map((s) => {
    if (s.attempts === 0) return `- ${s.label}: not started`;
    const pct = Math.round(s.accuracy * 100);
    const tag = s.state === "mastered" ? "mastered" : s.accuracy < 0.6 ? "shaky" : s.accuracy < 0.8 ? "developing" : "strong";
    return `- ${s.label}: ${tag} (${pct}% over ${s.attempts} attempts, recently around difficulty ${s.avgDifficulty.toFixed(2)})`;
  });
  return `His current mastery, computed from his real attempts:\n${lines.join("\n")}`;
}

const clampDiff = (x: number) => Math.max(0.1, Math.min(0.97, x));

/** Compute concrete difficulty targets + a solve-pace tag to steer the model. */
function adaptivePlan(
  profileId: string,
  current: Problem,
  recent: { skill: string; topic_id?: string | null; correct: number; solve_ms: number }[],
) {
  const cur = current.difficulty;
  // Prefer per-topic recency; fall back to per-skill for problems without a topic.
  const related = current.topicId
    ? recent.filter((r) => r.topic_id === current.topicId)
    : recent.filter((r) => r.skill === current.skill);
  const recentAcc = related.length ? related.filter((r) => r.correct).length / related.length : 0.7;
  const lastMs = recent[0]?.solve_ms ?? 0;
  const solveTag = lastMs === 0 ? "unknown" : lastMs < 4000 ? "fast" : lastMs < 9000 ? "steady" : "slow";
  // Push harder when he's accurate and fast; ease more when he's struggling.
  const up = (recentAcc >= 0.8 ? 0.14 : recentAcc >= 0.6 ? 0.08 : 0.04) + (solveTag === "fast" ? 0.04 : 0);
  const down = 0.12 + (recentAcc < 0.5 ? 0.05 : 0);
  // Where the right branch goes: the unified selector (due reviews → focus run
  // → domain-rotating interleave). Staying put is selection returning current.
  const next = selectFor(profileId, current.topicId ?? null);
  const advanceTopic = next.topic.id !== current.topicId ? next.topic : null;
  return {
    rightTarget: next.mode === "review" ? next.difficulty : +clampDiff(cur + up).toFixed(2),
    wrongTarget: +clampDiff(cur - down).toFixed(2),
    solveTag,
    recentAccuracyPct: Math.round(recentAcc * 100),
    advanceTopic,
    rightMode: next.mode,
  };
}

/** Assemble selectNext inputs from the DB. `currentTopicId` null ⇒ session start. */
function selectFor(profileId: string, currentTopicId: string | null) {
  const recent = recentAttempts(profileId, 12);
  const rows = topicMasteryRows(profileId);
  const masteredNow = new Set(rows.filter((r) => r.state === "mastered").map((r) => r.topic_id));
  // "last was review" ≈ the most recent attempt hit a topic that is currently mastered
  const lastWasReview = recent[0]?.topic_id != null && masteredNow.has(recent[0].topic_id);
  return selectNext({
    topics: TOPICS, now: Date.now(), currentTopicId,
    mastery: rows.map((r) => ({
      topicId: r.topic_id, state: r.state, lastDifficulty: r.last_difficulty,
      reviewDueAt: r.review_due_at, reviewIntervalDays: r.review_interval_days,
    })),
    recentTopicIds: recent.map((r) => r.topic_id ?? "").filter(Boolean),
    lastWasReview,
  });
}

// Recently-served problem prompts per profile (in-memory) so the tutor avoids repeats.
const recentPrompts = new Map<string, string[]>();
function notePrompt(profileId: string, prompt: string): void {
  const arr = recentPrompts.get(profileId) ?? [];
  arr.push(prompt);
  while (arr.length > 12) arr.shift();
  recentPrompts.set(profileId, arr);
}
/** A locally-generated problem whose prompt isn't already in `taken`. Uses the
 *  topic's GenSpec when a topic is known; legacy per-skill generator otherwise. */
function freshLocal(topic: Topic | undefined, skill: Problem["skill"], difficulty: number, taken: Set<string>): Problem {
  const make = () => stampId(topic ? problemForTopic(topic, difficulty) : localProblem(skill, difficulty));
  for (let i = 0; i < 10; i++) {
    const p = make();
    if (!taken.has(p.prompt)) { taken.add(p.prompt); return p; }
  }
  return make();
}

/** One topic's teaching brief for the model, with a concrete example at the target difficulty. */
function topicBlock(t: Topic, target: number): string {
  return [
    `TOPIC: ${t.name} (${t.kidLabel})`,
    `Goal: ${t.description}`,
    `Mastery looks like: ${t.evidence.join("; ")}`,
    `Example of the right shape: "${problemForTopic(t, target).prompt}"`,
  ].join("\n");
}

/** The wrong branch's target. Normally the current topic (easier numbers) — but if
 *  the PREVIOUS attempt already missed this topic, serving the wrong branch means a
 *  2nd consecutive miss: step DOWN the graph to a prereq he can win at instead. */
function wrongBranchPlan(
  profileId: string,
  current: Problem,
  recent: { topic_id?: string | null; correct: number }[],
): { topic: Topic | undefined; rescuing: boolean; difficulty: number } {
  const curTopic = current.topicId ? topicById(current.topicId) : undefined;
  const fallback = { topic: curTopic, rescuing: false, difficulty: Math.max(0.15, current.difficulty - 0.12) };
  if (!curTopic) return fallback;
  const lastMissedHere = recent[0] && recent[0].topic_id === curTopic.id && !recent[0].correct;
  if (!lastMissedHere) return fallback;
  const rows = topicMasteryRows(profileId);
  const rescue = rescueTopic(curTopic, rows.map((r) => ({
    topicId: r.topic_id, state: r.state, lastDifficulty: r.last_difficulty,
    reviewDueAt: r.review_due_at, reviewIntervalDays: r.review_interval_days,
  })), TOPICS);
  if (!rescue) return fallback;
  const last = rows.find((r) => r.topic_id === rescue.id)?.last_difficulty ?? 0.35;
  return { topic: rescue, rescuing: true, difficulty: Math.max(0.25, last - 0.1) };
}

async function llmBranches(profileId: string, current: Problem): Promise<{ right: Problem; wrong: Problem }> {
  const sums = learnerSummaries(profileId);
  const recent = recentAttempts(profileId, 10);
  const plan = adaptivePlan(profileId, current, recent);
  const curTopic = current.topicId ? topicById(current.topicId) : undefined;
  const rightTopic = plan.advanceTopic ?? curTopic;
  const wrongPlan = wrongBranchPlan(profileId, current, recent);
  const wrongTopic = wrongPlan.topic;
  const wrongTarget = wrongPlan.rescuing ? +wrongPlan.difficulty.toFixed(2) : plan.wrongTarget;
  const avoid = recentPrompts.get(profileId) ?? [];
  const userContent = [
    describeLearner(sums),
    "",
    `He is solving now: "${current.prompt}"  (topic: ${curTopic?.name ?? current.skill}, difficulty: ${current.difficulty.toFixed(2)}).`,
    `His last problem was answered ${plan.solveTag}; his recent accuracy here is ${plan.recentAccuracyPct}%.`,
    avoid.length ? `Recently shown already — do NOT repeat any of these: ${avoid.join("; ")}.` : "",
    "",
    "Produce the two follow-ups, matching difficulty to these targets:",
    `- "right" (he answers correctly): difficulty ≈ ${plan.rightTarget}` +
      (plan.rightMode === "review"
        ? `, as a REVIEW of an earlier skill — a friendly confidence check on this topic:`
        : plan.advanceTopic ? `, moving on to this topic:` : `, staying on this topic:`),
    rightTopic ? topicBlock(rightTopic, plan.rightTarget) : "",
    wrongPlan.rescuing
      ? `- "wrong" (he misses it): that would be his SECOND miss in a row here, so step down to a warm-up he already knows — difficulty ≈ ${wrongTarget}, on this easier prerequisite topic:`
      : `- "wrong" (he misses it): rebuild confidence at difficulty ≈ ${wrongTarget} with friendlier numbers, on this topic:`,
    wrongTopic ? topicBlock(wrongTopic, wrongTarget) : "",
    `Vary the numbers; do not reuse "${current.prompt}".`,
  ].filter(Boolean).join("\n");
  const resp = await anthropic.messages.create({
    model: TUTOR_MODEL,
    max_tokens: 1024,
    temperature: 0.9,
    system: SYSTEM,
    tools: [BRANCHES_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "next_problems" },
    messages: [{ role: "user", content: userContent }],
  });
  const tool = resp.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("no tool_use in response");
  const raw = tool.input as { right: unknown; wrong: unknown };
  // The model narrates; the code decides identity: stamp topic + skill authoritatively.
  const stampTopic = (p: Problem, t: Topic | undefined): Problem =>
    t ? { ...p, topicId: t.id, topicLabel: t.kidLabel, skill: t.legacySkill as Problem["skill"] } : p;
  let right = stampTopic(ProblemSchema.parse(stampId(correctDraft(raw.right as ProblemDraft))), rightTopic);
  let wrong = stampTopic(ProblemSchema.parse(stampId(correctDraft(raw.wrong as ProblemDraft))), wrongTopic);
  // Reject repeats (the just-solved problem or anything recently shown); regenerate locally.
  const taken = new Set<string>([current.prompt, ...avoid]);
  if (taken.has(right.prompt)) right = freshLocal(rightTopic, right.skill, right.difficulty, taken);
  else taken.add(right.prompt);
  if (taken.has(wrong.prompt)) wrong = freshLocal(wrongTopic, wrong.skill, wrong.difficulty, taken);
  notePrompt(profileId, right.prompt);
  notePrompt(profileId, wrong.prompt);
  return { right, wrong };
}

/** Recompute the answer for a parseable binary arithmetic prompt; null otherwise. */
function arithmeticAnswer(prompt: string): number | null {
  const m = prompt.replace(/[−–—]/g, "-").match(/^\s*(\d+)\s*([+\-x×*÷/])\s*(\d+)\s*$/i);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[3]);
  switch (m[2].toLowerCase()) {
    case "+": return a + b;
    case "-": return a - b;
    case "x": case "×": case "*": return a * b;
    case "÷": case "/": return b === 0 ? null : a / b;
    default: return null;
  }
}

/** Trust math over the model: if the written prompt is a parseable expression whose
 *  true value differs from the model's answer, correct it. The kid is never shown a
 *  problem whose displayed answer is wrong. */
function correctDraft(d: ProblemDraft): ProblemDraft {
  const truth = arithmeticAnswer(d.prompt);
  if (truth !== null && Number.isInteger(truth) && truth !== d.answer) {
    console.warn(`[tutor] corrected "${d.prompt}": answer ${d.answer} -> ${truth}`);
    return { ...d, answer: truth };
  }
  return d;
}

/** Local fallback branches: right side follows the unified selector (reviews,
 *  rotation); wrong side eases off on the same topic — or steps down to a prereq
 *  when this would be the 2nd consecutive miss (the soft-edge safety net). */
function localBranches(profileId: string, current: Problem): { right: Problem; wrong: Problem } {
  const curTopic = current.topicId ? topicById(current.topicId) : undefined;
  const make = (topic: Topic | undefined, d: number) =>
    stampId(topic ? problemForTopic(topic, d) : localProblem(current.skill, d));
  const next = curTopic ? selectFor(profileId, curTopic.id) : null;
  const right = next
    ? make(next.topic, next.mode === "review" ? next.difficulty : Math.min(0.95, current.difficulty + 0.12))
    : make(undefined, Math.min(0.95, current.difficulty + 0.12));
  const wrongPlan = wrongBranchPlan(profileId, current, recentAttempts(profileId, 3));
  return {
    right,
    wrong: make(wrongPlan.topic, wrongPlan.difficulty),
  };
}

// ---- App -------------------------------------------------------------------
const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, model: TUTOR_MODEL, voice: ELEVEN_VOICE }));

app.post("/tutor/first", async (c) => {
  const { profileId } = StartRequestSchema.parse(await c.req.json());
  // Session start = the unified selector with no current topic: a due review
  // first (gentle re-entry), else the interleave rotation over the frontier.
  const { topic, difficulty } = selectFor(profileId, null);
  const problem = stampId(problemForTopic(topic, difficulty));
  notePrompt(profileId, problem.prompt);
  return c.json(problem);
});

// Speculative pre-generation: both "if right" and "if wrong" follow-ups for the
// current problem. Spec names this /next-problems; /tutor/branches is kept as an alias.
async function nextProblems(c: Context) {
  const { profileId, current } = BranchesRequestSchema.parse(await c.req.json());
  try {
    return c.json(await llmBranches(profileId, current));
  } catch (e) {
    console.warn("[tutor] LLM branches failed; local fallback:", (e as Error)?.message);
    return c.json(localBranches(profileId, current));
  }
}
app.post("/next-problems", nextProblems);
app.post("/tutor/branches", nextProblems);

app.post("/tutor/attempt", async (c) => {
  const body = await c.req.json();
  const { profileId, problemId, skill, correct, solveMs } = body;
  const difficulty = typeof body.difficulty === "number" ? body.difficulty : 0.5;
  db.query(
    `INSERT INTO attempts (profile_id, problem_id, skill, topic_id, correct, solve_ms, difficulty, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(profileId, problemId, skill, typeof body.topicId === "string" ? body.topicId : null,
    correct ? 1 : 0, Math.round(solveMs ?? 0), difficulty, Date.now());
  recordMastery(profileId, skill, !!correct, difficulty);
  if (typeof body.topicId === "string") recordTopicMastery(profileId, body.topicId, !!correct, difficulty);

  // ---- Reward state update (one first-try answer) --------------------------
  const state = getProfileState(profileId);
  const day = utcDay();
  let gemsEarned = 0;
  let milestone: number | null = null;
  let shieldUsed = false;
  const questsCompleted: { key: string; label: string; reward: number }[] = [];

  if (correct) {
    state.streak += 1;
    state.best_streak = Math.max(state.best_streak, state.streak);
    const bonus = streakBonus(state.streak);
    gemsEarned = 1 + bonus;
    state.gems += gemsEarned;
    if (bonus > 0) milestone = state.streak;

    // Update quest progress, completing any that hit target (reward → gems).
    const rows = getQuests(profileId, day);
    for (const r of rows) {
      if (r.done) continue;
      let progress = r.progress;
      if (r.quest_key === "mine_gems") progress += gemsEarned;
      else if (r.quest_key === "solve_10") progress += 1;
      else if (r.quest_key === "streak_5") progress = Math.max(progress, state.streak);
      let done = 0;
      if (progress >= r.target) {
        done = 1;
        state.gems += r.reward;
        questsCompleted.push({ key: r.quest_key, label: r.label, reward: r.reward });
      }
      db.query(`UPDATE quests SET progress = ?, done = ? WHERE profile_id = ? AND quest_key = ? AND day = ?`)
        .run(progress, done, profileId, r.quest_key, day);
    }
  } else {
    gemsEarned = 0;
    if (state.shields > 0) {
      state.shields -= 1;
      shieldUsed = true; // shield saved the streak — leave it unchanged
    } else {
      state.streak = 0;
    }
  }
  // A correct answer mines a gem — that swing wears the equipped pickaxe.
  const durability = equippedDurability(profileId, state, correct);
  saveProfileState(profileId, state);

  return c.json({
    ok: true,
    reward: {
      gemsEarned,
      totalGems: state.gems,
      streak: state.streak,
      bestStreak: state.best_streak,
      shields: state.shields,
      milestone,
      shieldUsed,
      questsCompleted,
      durability,
    },
  });
});

// A correct answer that wasn't his FIRST try: still earns a gem and counts toward
// the gem/solve quests, but NOT the streak (a streak needs a clean first-try win).
app.post("/reward/retry-solve", async (c) => {
  const { profileId } = await c.req.json();
  const state = getProfileState(profileId);
  const day = utcDay();
  state.gems += 1;
  const questsCompleted: { key: string; label: string; reward: number }[] = [];
  for (const r of getQuests(profileId, day)) {
    if (r.done || r.quest_key === "streak_5") continue;
    let progress = r.progress;
    if (r.quest_key === "mine_gems") progress += 1;
    else if (r.quest_key === "solve_10") progress += 1;
    let done = 0;
    if (progress >= r.target) {
      done = 1; state.gems += r.reward;
      questsCompleted.push({ key: r.quest_key, label: r.label, reward: r.reward });
    }
    db.query(`UPDATE quests SET progress = ?, done = ? WHERE profile_id = ? AND quest_key = ? AND day = ?`)
      .run(progress, done, profileId, r.quest_key, day);
  }
  const durability = equippedDurability(profileId, state, true); // a mined gem wears it
  saveProfileState(profileId, state);
  return c.json({
    ok: true,
    reward: {
      gemsEarned: 1, totalGems: state.gems, streak: state.streak, bestStreak: state.best_streak,
      shields: state.shields, milestone: null, shieldUsed: false, questsCompleted, durability,
    },
  });
});

// Hoard meter filled → award a flat bonus on top. Purely client-triggered (no
// adversary in a kid's game); the server stays the gem authority by crediting +
// returning the new total. Quests are untouched (the bonus is "extra").
app.post("/reward/hoard-bonus", async (c) => {
  const { profileId } = await c.req.json();
  const state = getProfileState(profileId);
  state.gems += HOARD_BONUS;
  saveProfileState(profileId, state);
  return c.json({
    ok: true,
    reward: {
      gemsEarned: HOARD_BONUS, totalGems: state.gems, streak: state.streak, bestStreak: state.best_streak,
      shields: state.shields, milestone: null, shieldUsed: false, questsCompleted: [],
    },
  });
});

// Persisted per-profile reward state + today's quests (generated if missing).
app.get("/state", (c) => {
  const profileId = c.req.query("profileId") ?? "sam";
  const s = getProfileState(profileId);
  return c.json({
    gems: s.gems,
    streak: s.streak,
    bestStreak: s.best_streak,
    shields: s.shields,
    quests: questView(getQuests(profileId)),
    equipped: s.equipped_pickaxe,
    durability: equippedDurability(profileId, s, false),
  });
});

// ---- Pickaxe-skin shop endpoints -------------------------------------------

// Catalog + balance + ownership/equipped flags (server is the source of truth).
app.get("/shop", (c) => {
  const profileId = c.req.query("profileId") ?? "sam";
  const s = getProfileState(profileId);
  const items = PICKAXE_CATALOG.map((cat) => {
    const max = maxDurability(cat.key);
    const owned = ownsItem(profileId, cat.key);
    return {
      key: cat.key,
      name: cat.name,
      price: cat.price,
      owned,
      equipped: s.equipped_pickaxe === cat.key,
      // current durability if owned; else show it full so the shop previews the tier's stat
      durability: max === null ? null : (owned ? itemDurability(profileId, cat.key) : max),
      maxDurability: max,
      repairCost: repairCost(cat.key),
    };
  });
  return c.json({ gems: s.gems, equipped: s.equipped_pickaxe, items, crazyCoins: s.crazy_coins });
});

// Buy a skin: spend gems, record ownership, and auto-equip it.
app.post("/shop/buy", async (c) => {
  const { profileId, itemKey } = await c.req.json();
  const s = getProfileState(profileId);
  const cat = catalogEntry(itemKey);
  if (!cat || itemKey === "wooden" || ownsItem(profileId, itemKey)) {
    return c.json({ ok: false, reason: "unavailable", gems: s.gems });
  }
  if (s.gems < cat.price) {
    return c.json({ ok: false, reason: "not enough gems", gems: s.gems });
  }
  s.gems -= cat.price;
  s.equipped_pickaxe = itemKey;
  const max = maxDurability(itemKey);
  db.query(`INSERT OR IGNORE INTO owned_items (profile_id, item_key, durability) VALUES (?, ?, ?)`)
    .run(profileId, itemKey, max);
  setItemDurability(profileId, itemKey, max ?? 0); // fresh + full even if re-owned
  saveProfileState(profileId, s);
  return c.json({
    ok: true,
    gems: s.gems,
    equipped: s.equipped_pickaxe,
    item: { key: cat.key, name: cat.name, price: cat.price },
    durability: equippedDurability(profileId, s, false),
  });
});

// Equip an already-owned skin (or wooden, always allowed). Blocks equipping a
// broken skin (durability 0) — it must be repaired first.
app.post("/shop/equip", async (c) => {
  const { profileId, itemKey } = await c.req.json();
  if (itemKey === "wooden" || ownsItem(profileId, itemKey)) {
    if (itemKey !== "wooden" && itemDurability(profileId, itemKey) <= 0) {
      return c.json({ ok: false, reason: "broken" });
    }
    const s = getProfileState(profileId);
    s.equipped_pickaxe = itemKey;
    saveProfileState(profileId, s);
    return c.json({ ok: true, equipped: s.equipped_pickaxe, durability: equippedDurability(profileId, s, false) });
  }
  return c.json({ ok: false, reason: "not owned" });
});

// Repair an owned pickaxe: spend gems → refill durability → re-equip it (so a
// just-broken tool is instantly back in hand). Never destroys the skin.
app.post("/shop/repair", async (c) => {
  const { profileId, itemKey } = await c.req.json();
  const s = getProfileState(profileId);
  const max = maxDurability(itemKey);
  if (itemKey === "wooden" || max === null || !ownsItem(profileId, itemKey)) {
    return c.json({ ok: false, reason: "unavailable", gems: s.gems });
  }
  const cost = repairCost(itemKey);
  if (s.gems < cost) return c.json({ ok: false, reason: "not enough gems", gems: s.gems });
  s.gems -= cost;
  setItemDurability(profileId, itemKey, max);
  s.equipped_pickaxe = itemKey;
  saveProfileState(profileId, s);
  return c.json({ ok: true, gems: s.gems, equipped: itemKey, durability: equippedDurability(profileId, s, false) });
});

// Buy a shield: 40 gems → +1 shield. Saves a streak on the next wrong answer.
app.post("/shop/buy-shield", async (c) => {
  const { profileId } = await c.req.json();
  const s = getProfileState(profileId);
  if (s.gems >= 40) {
    s.gems -= 40;
    s.shields += 1;
    saveProfileState(profileId, s);
    return c.json({ ok: true, gems: s.gems, shields: s.shields });
  }
  return c.json({ ok: false, reason: "not enough gems", gems: s.gems, shields: s.shields });
});

// Crazy Coin: 200 gems → +1 coin. A real-world reward — each coin trades for
// 15 minutes of shows; a parent redeems it from the dashboard. Kept in sync
// with CRAZY_COIN_COST on the client (which renders the price tag).
const CRAZY_COIN_COST = 200;
app.post("/shop/buy-crazy-coin", async (c) => {
  const { profileId } = await c.req.json();
  const s = getProfileState(profileId);
  if (s.gems >= CRAZY_COIN_COST) {
    s.gems -= CRAZY_COIN_COST;
    s.crazy_coins += 1;
    saveProfileState(profileId, s);
    return c.json({ ok: true, gems: s.gems, crazyCoins: s.crazy_coins });
  }
  return c.json({ ok: false, reason: "not enough gems", gems: s.gems, crazyCoins: s.crazy_coins });
});

// Parent redeems one Crazy Coin (kid cashes it in for 15 minutes of shows).
// Only decrements the counter — the gems were already spent at purchase.
app.post("/shop/redeem-crazy-coin", async (c) => {
  const { profileId } = await c.req.json();
  const s = getProfileState(profileId);
  if (s.crazy_coins <= 0) {
    return c.json({ ok: false, reason: "no coins", crazyCoins: s.crazy_coins });
  }
  s.crazy_coins -= 1;
  saveProfileState(profileId, s);
  return c.json({ ok: true, crazyCoins: s.crazy_coins });
});

// Topic-graph mastery view (parent dashboard): per-topic state, unlock status,
// and the taxonomy's parent-facing assessment prompt.
app.get("/mastery", (c) => {
  const profileId = c.req.query("profileId") ?? "sam";
  const kidName = c.req.query("name") ?? "your child";
  const rows = new Map(topicMasteryRows(profileId).map((r) => [r.topic_id, r]));
  const mastered = masteredTopicIds(profileId);
  const unlocked = new Set(unlockedTopics(TOPICS, mastered).map((t) => t.id));
  const topics = TOPICS.map((t) => {
    const r = rows.get(t.id);
    return {
      id: t.id, name: t.name, kidLabel: t.kidLabel, domain: t.domain,
      prereqs: t.prereqs, unlocked: unlocked.has(t.id),
      attempts: r?.attempts ?? 0, correct: r?.correct ?? 0,
      state: r?.state ?? "unstarted",
      fluentMs: t.fluentMs,
      assessmentPrompt: t.assessmentPrompt.replaceAll("{{name}}", kidName),
      reviewDueAt: r?.review_due_at ?? null,
      reviewIntervalDays: r?.review_interval_days ?? null,
    };
  });
  return c.json({ profileId, topics, crazyCoins: getProfileState(profileId).crazy_coins });
});

// ---- Explain (the 🎓 button) ------------------------------------------------

/** True when the explanation states the answer as a standalone number token.
 *  Numbers FROM the prompt are fine; only the answer itself is forbidden. */
export function leaksAnswer(text: string, answer: number): boolean {
  return new RegExp(`(?<!\\d)${answer}(?!\\d)`).test(text);
}

const EXPLAIN_SYSTEM = `You are the warm tutor voice inside a gem-mine math game, explaining ONE problem to a 6-year-old who tapped "explain". Rules:
- At most 60 spoken words. Plain sentences a child can follow by ear. No emoji, no markdown, no lists.
- Teach the concrete STRATEGY using his actual numbers (make-a-ten, count on, count back, think in tens, share one at a time, skip-count...).
- NEVER say the final answer, and never spell it out in words either. Stop one step short.
- End with one small, encouraging leading question that points at the last step.`;

const explainCache = new Map<string, string>();

app.post("/tutor/explain", async (c) => {
  const { problem } = ExplainRequestSchema.parse(await c.req.json());
  const cached = explainCache.get(problem.id);
  if (cached) return c.json({ text: cached });
  const fallback = problem.hint ?? "Read it again slowly — what is it asking you to find?";
  const topic = problem.topicId ? topicById(problem.topicId) : undefined;
  const userContent = [
    `The problem on screen: "${problem.prompt}" (read aloud as: "${problem.spoken}").`,
    topic ? `It practices the topic "${topic.name}": ${topic.description}` : "",
    topic?.evidence.length ? `Mastery of this topic looks like: ${topic.evidence.join("; ")}` : "",
    `Explain how to work it out. Do NOT reveal that the answer is ${problem.answer} — never say that number.`,
  ].filter(Boolean).join("\n");
  try {
    let text = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await anthropic.messages.create({
        model: TUTOR_MODEL, max_tokens: 250, // no temperature — rejected by claude-sonnet-5
        system: EXPLAIN_SYSTEM,
        messages: [{ role: "user", content: userContent }],
      });
      const block = resp.content.find((b) => b.type === "text");
      text = (block && block.type === "text" ? block.text : "").trim();
      if (text && !leaksAnswer(text, problem.answer)) break;
      text = ""; // leaked or empty → retry once, then fall back
    }
    // Keep it speakable: TTS accepts ≤600 chars — trim overruns at a sentence end.
    if (text.length > 550) {
      const cut = text.slice(0, 550);
      text = cut.slice(0, Math.max(cut.lastIndexOf("."), cut.lastIndexOf("?"), cut.lastIndexOf("!")) + 1) || cut;
    }
    const out = text || fallback;
    explainCache.set(problem.id, out);
    if (explainCache.size > 50) explainCache.delete(explainCache.keys().next().value!);
    return c.json({ text: out });
  } catch (e) {
    console.warn("[tutor] explain failed; hint fallback:", (e as Error)?.message);
    explainCache.set(problem.id, fallback);
    return c.json({ text: fallback });
  }
});

app.post("/tts", async (c) => {
  const { text } = TtsRequestSchema.parse(await c.req.json());
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return c.json({ error: "no tts key" }, 503);
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      // Warm + expressive for an encouraging kid tutor; slower so a 6-year-old can follow.
      // stability lower = more emotional range; style adds warmth; speed 0.7–1.2 (1.0 default).
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 0.78 },
      }),
    },
  );
  if (!r.ok) return c.json({ error: `tts ${r.status}` }, 502);
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg" } });
});

console.log(`[institute] tutor server on :${PORT} (model ${TUTOR_MODEL})`);
export default { port: PORT, fetch: app.fetch };
