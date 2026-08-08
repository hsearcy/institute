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
  StartRequestSchema, BranchesRequestSchema, TtsRequestSchema, ExplainRequestSchema, DemoRequestSchema,
  DailyRecordAckSchema,
  TOPICS, topicById, type Topic,
} from "@institute/shared";
import { localProblem, type ProblemDraft, type SkillStat } from "./generate.ts";
import { unlockedTopics, frontierTopics } from "./graph.ts";
import { problemForTopic, serveProblem, maybeCostume } from "./topicgen.ts";
import { topicState } from "./mastery.ts";
import { nextReview } from "./review.ts";
import { selectNext } from "./select.ts";
import { rescueTopic } from "./rescue.ts";
import {
  PLAYER_TIME_ZONE, acknowledgeRecordEvent, dailyProgress, dailyRecordState,
  ensureDailyRecordSchema, playerDay, recordDailySolve,
} from "./dailyRecord.ts";

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
    lifetime_gems INTEGER DEFAULT 0,
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
  CREATE TABLE IF NOT EXISTS weekly_quests (
    profile_id TEXT,
    quest_key TEXT,
    week_start TEXT,
    label TEXT,
    target INTEGER,
    progress INTEGER DEFAULT 0,
    reward INTEGER,
    done INTEGER DEFAULT 0,
    PRIMARY KEY (profile_id, quest_key, week_start)
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
// "I'm not sure yet" presses: honest not-knowing, recorded WITHOUT any streak or
// shield cost. Counts as a not-correct attempt so the tutor eases up on its own.
try { db.exec(`ALTER TABLE attempts ADD COLUMN skipped INTEGER DEFAULT 0`); } catch { /* column exists */ }
// Which topics he has already been shown the worked demonstration for, so a
// brand-new kind of problem is never a cold graded question — and never
// demonstrated twice.
db.exec(`CREATE TABLE IF NOT EXISTS topic_demos (
  profile_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, topic_id)
)`);
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
// Equipped number-pad theme (guarded ALTER; 'pad_classic' = the free default look).
try {
  db.exec(`ALTER TABLE profile_state ADD COLUMN equipped_pad_theme TEXT DEFAULT 'pad_classic'`);
} catch { /* column already present */ }
// Equipped model for the prize embedded in the mine wall.
try {
  db.exec(`ALTER TABLE profile_state ADD COLUMN equipped_gem_style TEXT DEFAULT 'gem_classic'`);
} catch { /* column already present */ }
// Crazy Coins: a real-world consumable — each coin trades for 15 minutes of
// shows, redeemed by a parent from the dashboard (guarded ALTER).
try {
  db.exec(`ALTER TABLE profile_state ADD COLUMN crazy_coins INTEGER DEFAULT 0`);
} catch { /* column already present */ }
// Lifetime earnings never fall when gems are spent. Existing profiles are
// backfilled below once the shop catalogs are available.
let shouldBackfillLifetimeGems = false;
try {
  db.exec(`ALTER TABLE profile_state ADD COLUMN lifetime_gems INTEGER DEFAULT 0`);
  shouldBackfillLifetimeGems = true;
} catch { /* column already present */ }
// Per-player-day tally of problems he got right, and the record he is chasing.
// Creates the tables and, on an existing database, backfills what the attempt
// log can prove — recording how far back that count is actually complete.
// Restart-safe: an interrupted backfill simply runs again next boot.
ensureDailyRecordSchema(db);
console.log(`[institute] daily record days are ${PLAYER_TIME_ZONE} calendar days`);
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

/** True when this topic is GENUINELY new to him: no mastery row, no attempts,
 *  and no demonstration shown yet. (Pre-taxonomy attempt rows carry a NULL
 *  topic_id, hence the mastery-row check too.) */
function needsDemo(profileId: string, topicId: string | undefined): boolean {
  if (!topicId) return false;
  const seen = db.query(`SELECT 1 FROM topic_demos WHERE profile_id = ? AND topic_id = ?`)
    .get(profileId, topicId);
  if (seen) return false;
  const mastery = db.query(`SELECT 1 FROM topic_mastery WHERE profile_id = ? AND topic_id = ?`)
    .get(profileId, topicId);
  if (mastery) return false;
  const attempt = db.query(`SELECT 1 FROM attempts WHERE profile_id = ? AND topic_id = ? LIMIT 1`)
    .get(profileId, topicId);
  return !attempt;
}

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

/** Test hook: give a profile one shield without buying it. */
export function grantShieldForTest(profileId: string): void {
  const st = getProfileState(profileId);
  st.shields += 1;
  saveProfileState(profileId, st);
}

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

type ProfileStateRow = { gems: number; lifetime_gems: number; streak: number; best_streak: number; shields: number; crazy_coins: number; equipped_pickaxe: string; equipped_pad_theme: string; equipped_gem_style: string };
type QuestRow = { quest_key: string; label: string; target: number; progress: number; reward: number; done: number };

const utcDay = () => new Date().toISOString().slice(0, 10);

// Bonus gems awarded when the client's hoard meter fills up (kept in sync with
// HOARD_BONUS on the client, which renders the "+N" banner).
const HOARD_BONUS = 10;
const LEGACY_CRAZY_COIN_COST = 200;

/** The five daily quests, regenerated lazily per UTC day. Keep the legacy keys
 *  for the first three so an in-progress day survives deploys. */
const QUEST_DEFS = [
  { key: "mine_gems", label: "Earn 50 gems today", target: 50, reward: 25 },
  { key: "solve_10", label: "Solve 20 problems", target: 20, reward: 20 },
  { key: "streak_5", label: "Reach a 10-streak", target: 10, reward: 20 },
  // Keep the legacy key so an in-progress daily board survives this deploy.
  { key: "speed_8", label: "Lightning: 5 under 20 seconds", target: 5, reward: 10 },
  { key: "topic_explorer", label: "Explore 4 math topics", target: 4, reward: 15 },
] as const;

const WEEKLY_QUEST_DEF = {
  key: "daily_quests_5_days",
  label: "Finish Daily Quests on 5 Days",
  target: 5,
  reward: 250,
} as const;

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
  let row = db.query(`SELECT gems, lifetime_gems, streak, best_streak, shields, crazy_coins, equipped_pickaxe, equipped_pad_theme, equipped_gem_style FROM profile_state WHERE profile_id = ?`)
    .get(profileId) as ProfileStateRow | null;
  if (!row) {
    db.query(`INSERT OR IGNORE INTO profile_state (profile_id, gems, lifetime_gems, streak, best_streak, shields, crazy_coins, equipped_pickaxe, equipped_pad_theme, equipped_gem_style, updated_at)
              VALUES (?, 0, 0, 0, 0, 0, 0, 'wooden', 'pad_classic', 'gem_classic', ?)`).run(profileId, Date.now());
    row = { gems: 0, lifetime_gems: 0, streak: 0, best_streak: 0, shields: 0, crazy_coins: 0, equipped_pickaxe: "wooden", equipped_pad_theme: "pad_classic", equipped_gem_style: "gem_classic" };
  }
  // Existing rows predating the columns come back with NULL — normalize to the defaults.
  if (!row.equipped_pickaxe) row.equipped_pickaxe = "wooden";
  if (!row.crazy_coins) row.crazy_coins = 0;
  if (!row.equipped_pad_theme) row.equipped_pad_theme = "pad_classic";
  if (!row.equipped_gem_style) row.equipped_gem_style = "gem_classic";
  return row;
}

function saveProfileState(profileId: string, s: ProfileStateRow): void {
  db.query(`UPDATE profile_state SET gems = ?, lifetime_gems = ?, streak = ?, best_streak = ?, shields = ?, crazy_coins = ?, equipped_pickaxe = ?, equipped_pad_theme = ?, equipped_gem_style = ?, updated_at = ?
            WHERE profile_id = ?`)
    .run(s.gems, s.lifetime_gems, s.streak, s.best_streak, s.shields, s.crazy_coins, s.equipped_pickaxe, s.equipped_pad_theme, s.equipped_gem_style, Date.now(), profileId);
}

function creditGems(state: ProfileStateRow, amount: number): void {
  state.gems += amount;
  state.lifetime_gems += amount;
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

/** Number-pad style themes: pure-cosmetic gem sinks with varied price anchors
 *  (they double as numbers for the gem-shop math costume + Socratic moments). */
const PAD_THEME_CATALOG = [
  { key: "pad_ocean", name: "Ocean Pad", price: 75 },
  { key: "pad_lava", name: "Lava Pad", price: 160 },
  { key: "pad_galaxy", name: "Galaxy Pad", price: 340 },
  { key: "pad_rainbow", name: "Rainbow Pad", price: 650 },
] as const;
const padThemeEntry = (key: string) => PAD_THEME_CATALOG.find((c) => c.key === key) ?? null;

/** Authored models for the geode/gem currently embedded in the mine wall. */
const GEM_STYLE_CATALOG = [
  { key: "gem_emerald", name: "Mega Emerald", price: 90 },
  { key: "gem_ruby", name: "Power Ruby", price: 220 },
  { key: "gem_diamond", name: "Super Diamond", price: 480 },
  { key: "gem_dragonheart", name: "Dragonheart Gem", price: 900 },
] as const;
const gemStyleEntry = (key: string) => GEM_STYLE_CATALOG.find((c) => c.key === key) ?? null;

// Old data has no transaction ledger, but owned catalog items and unredeemed
// Crazy Coins preserve a guaranteed portion of past spending. Use that evidence
// to establish a conservative lifetime floor, then track every award exactly.
if (shouldBackfillLifetimeGems) {
  const priceByKey = new Map<string, number>([
    ...PICKAXE_CATALOG.map((item) => [item.key, item.price] as const),
    ...PAD_THEME_CATALOG.map((item) => [item.key, item.price] as const),
    ...GEM_STYLE_CATALOG.map((item) => [item.key, item.price] as const),
  ]);
  const profiles = db.query(`SELECT profile_id, gems, crazy_coins FROM profile_state`)
    .all() as { profile_id: string; gems: number; crazy_coins: number }[];
  for (const profile of profiles) {
    const owned = db.query(`SELECT item_key FROM owned_items WHERE profile_id = ?`)
      .all(profile.profile_id) as { item_key: string }[];
    const recordedSpending = owned.reduce((sum, item) => sum + (priceByKey.get(item.item_key) ?? 0), 0);
    const lifetimeGems = profile.gems + recordedSpending + profile.crazy_coins * LEGACY_CRAZY_COIN_COST;
    db.query(`UPDATE profile_state SET lifetime_gems = ? WHERE profile_id = ?`)
      .run(lifetimeGems, profile.profile_id);
  }
}

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
  }
  // Apply definition changes to today's persisted rows. `done` is untouched, so
  // a quest completed before a balance change remains completed while its text,
  // target, and reward immediately match the current definition.
  const tune = db.query(
    `UPDATE quests SET label = ?, target = ?, reward = ?
     WHERE profile_id = ? AND quest_key = ? AND day = ?`,
  );
  for (const q of QUEST_DEFS) tune.run(q.label, q.target, q.reward, profileId, q.key, day);
  return db.query(
    `SELECT quest_key, label, target, progress, reward, done FROM quests WHERE profile_id = ? AND day = ?`,
  ).all(profileId, day) as QuestRow[];
}

const questView = (rows: QuestRow[]) => rows.map((r) => ({
  key: r.quest_key, label: r.label, target: r.target,
  progress: r.progress, reward: r.reward, done: !!r.done,
}));

/** Sunday that owns a UTC calendar day, formatted like the daily quest key. */
function weekStart(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function getWeeklyQuest(profileId: string, day = utcDay()): QuestRow {
  const week = weekStart(day);
  db.query(
    `INSERT OR IGNORE INTO weekly_quests
       (profile_id, quest_key, week_start, label, target, progress, reward, done)
     VALUES (?, ?, ?, ?, ?, 0, ?, 0)`,
  ).run(profileId, WEEKLY_QUEST_DEF.key, week, WEEKLY_QUEST_DEF.label,
    WEEKLY_QUEST_DEF.target, WEEKLY_QUEST_DEF.reward);
  db.query(
    `UPDATE weekly_quests SET label = ?, target = ?, reward = ?
     WHERE profile_id = ? AND quest_key = ? AND week_start = ? AND done = 0`,
  ).run(WEEKLY_QUEST_DEF.label, WEEKLY_QUEST_DEF.target, WEEKLY_QUEST_DEF.reward,
    profileId, WEEKLY_QUEST_DEF.key, week);
  return db.query(
    `SELECT quest_key, label, target, progress, reward, done FROM weekly_quests
     WHERE profile_id = ? AND quest_key = ? AND week_start = ?`,
  ).get(profileId, WEEKLY_QUEST_DEF.key, week) as QuestRow;
}

function completedDailyBoards(profileId: string, day: string): number {
  const row = db.query(
    `SELECT COUNT(*) AS count FROM (
       SELECT day FROM quests
       WHERE profile_id = ? AND day >= ? AND day <= ?
       GROUP BY day
       HAVING COUNT(*) = ? AND SUM(done) = ?
     )`,
  ).get(profileId, weekStart(day), day, QUEST_DEFS.length, QUEST_DEFS.length) as { count: number };
  return row.count;
}

function advanceWeeklyQuest(
  profileId: string,
  day: string,
  state: ProfileStateRow,
): { key: string; label: string; reward: number }[] {
  const quest = getWeeklyQuest(profileId, day);
  if (quest.done) return [];
  const progress = completedDailyBoards(profileId, day);
  const done = progress >= quest.target ? 1 : 0;
  db.query(
    `UPDATE weekly_quests SET progress = ?, done = ?
     WHERE profile_id = ? AND quest_key = ? AND week_start = ?`,
  ).run(progress, done, profileId, quest.quest_key, weekStart(day));
  if (!done) return [];
  creditGems(state, quest.reward);
  return [{ key: quest.quest_key, label: quest.label, reward: quest.reward }];
}

type QuestEvent = {
  firstTry: boolean;
  gemsEarned: number;
  solveMs?: number;
};

/** Advance today's quests from one solved problem. Speed and topic breadth are
 *  deliberately first-try-only; retries still count as persistence/endurance. */
function advanceQuests(
  profileId: string,
  day: string,
  state: ProfileStateRow,
  event: QuestEvent,
): { completed: { key: string; label: string; reward: number }[]; allDailiesCrazyCoin: boolean } {
  const completed: { key: string; label: string; reward: number }[] = [];
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  const doneBefore = getQuests(profileId, day).filter((r) => r.done).length;
  // "Explore" means ENCOUNTER, not master: count every distinct topic he has
  // ATTEMPTED today, right or wrong. Requiring a first-try-correct answer denied
  // credit for the topics he bravely tried and struggled with — exactly the
  // exploring we want to reward (and recomputed on any attempt, not just wins).
  const distinctTopics = (db.query(
    `SELECT COUNT(DISTINCT topic_id) AS count FROM attempts
     WHERE profile_id = ? AND topic_id IS NOT NULL AND created_at >= ?`,
  ).get(profileId, dayStart) as { count: number }).count;

  for (const r of getQuests(profileId, day)) {
    if (r.done) continue;
    let progress = r.progress;
    if (r.quest_key === "mine_gems") progress += event.gemsEarned;
    else if (r.quest_key === "solve_10") progress += 1;
    else if (r.quest_key === "streak_5" && event.firstTry) progress += 1;
    else if (r.quest_key === "speed_8" && event.firstTry && (event.solveMs ?? Infinity) < 20_000) progress += 1;
    else if (r.quest_key === "topic_explorer") progress = Math.max(progress, distinctTopics);

    const done = progress >= r.target ? 1 : 0;
    if (done) {
      creditGems(state, r.reward);
      completed.push({ key: r.quest_key, label: r.label, reward: r.reward });
    }
    db.query(`UPDATE quests SET progress = ?, done = ? WHERE profile_id = ? AND quest_key = ? AND day = ?`)
      .run(progress, done, profileId, r.quest_key, day);
  }
  completed.push(...advanceWeeklyQuest(profileId, day, state));
  // Finishing the whole daily board earns one real-world Crazy Coin.
  const doneAfter = getQuests(profileId, day).filter((r) => r.done).length;
  const allDailiesCrazyCoin = doneBefore < QUEST_DEFS.length && doneAfter >= QUEST_DEFS.length;
  if (allDailiesCrazyCoin) state.crazy_coins += 1;
  return { completed, allDailiesCrazyCoin };
}

/** A daily streak is independent of the profile's cross-day streak. A shield
 *  skips this reset because it explicitly saves the streak. */
function resetDailyStreakQuest(profileId: string, day: string): void {
  db.query(
    `UPDATE quests SET progress = 0
     WHERE profile_id = ? AND quest_key = 'streak_5' AND day = ? AND done = 0`,
  ).run(profileId, day);
}

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
- In "spoken", write any SEQUENCE of numbers as words ("eight, ten, twelve" — never "8, 10, 12"): the voice engine garbles digit runs. Single numbers inside a sentence may stay as digits.
- He is American: money is ALWAYS dollars and cents (penny/nickel/dime/quarter) — never pounds or pence.
- About 1 in 3 problems, when it fits naturally, tell the "spoken" story in HIS game's gem economy instead of plain arithmetic. Real prices you may reference: stone pickaxe 50, ocean pad 75, iron pickaxe 120, lava pad 160, silver pickaxe 250, galaxy pad 340, gold pickaxe 450, rainbow pad 650, diamond pickaxe 800, shield 40 gems. Use third-person characters (a miner saving up, a shopkeeper) — NEVER "you have N gems" (he compares it against his live gem counter). The numbers you were told to target stay EXACTLY the same; never invent a different price for a named item.
- "hint" teaches a concrete strategy he can act on if he's stuck (make-a-ten, count-on, count-back) — a real method, never just restating the answer. For a missing addend that crosses ten, the strategy is "add a ten first, then adjust the ones" — never "count up to ten then add the two jumps". For division, the strategy is "skip-count by the divisor" (count by 3s up to 12 → four jumps → 4) — not dealing items out to friends one at a time.
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
  const recent = recentAttempts(profileId, 20);
  const rows = topicMasteryRows(profileId);
  const masteredNow = new Set(rows.filter((r) => r.state === "mastered").map((r) => r.topic_id));
  // "last was review" ≈ the most recent attempt hit a topic that is currently mastered
  const lastWasReview = recent[0]?.topic_id != null && masteredNow.has(recent[0].topic_id);
  return selectNext({
    topics: TOPICS, now: Date.now(), currentTopicId,
    mastery: rows.map((r) => ({
      topicId: r.topic_id, state: r.state, lastDifficulty: r.last_difficulty, attempts: r.attempts,
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
  // Costume only the SURVIVOR — never roll dice inside the uniqueness loop.
  const dress = (p: Problem): Problem => (topic ? maybeCostume(p, topic) : p);
  for (let i = 0; i < 10; i++) {
    const p = make();
    if (!taken.has(p.prompt)) { taken.add(p.prompt); return dress(p); }
  }
  return dress(make());
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
    topicId: r.topic_id, state: r.state, lastDifficulty: r.last_difficulty, attempts: r.attempts,
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
  // Costume the LLM's problems too — real play is almost entirely this path,
  // so without this the gem-shop framing only ever reached fallback problems.
  const dress = (p: Problem, t: Topic | undefined): Problem => (t ? maybeCostume(p, t) : p);
  let right = dress(stampTopic(ProblemSchema.parse(stampId(correctDraft(raw.right as ProblemDraft))), rightTopic), rightTopic);
  let wrong = dress(stampTopic(ProblemSchema.parse(stampId(correctDraft(raw.wrong as ProblemDraft))), wrongTopic), wrongTopic);
  // Reject repeats (the just-solved problem or anything recently shown); regenerate locally.
  const taken = new Set<string>([current.prompt, ...avoid]);
  if (taken.has(right.prompt)) right = freshLocal(rightTopic, right.skill, right.difficulty, taken);
  else taken.add(right.prompt);
  if (taken.has(wrong.prompt)) wrong = freshLocal(wrongTopic, wrong.skill, wrong.difficulty, taken);
  notePrompt(profileId, right.prompt);
  notePrompt(profileId, wrong.prompt);
  // Stamp LAST, off each branch's FINAL topic — a regenerated or costumed branch
  // must never inherit a stale flag (and an LLM-emitted one must never survive).
  right = { ...right, newTopic: needsDemo(profileId, right.topicId) || undefined };
  wrong = { ...wrong, newTopic: needsDemo(profileId, wrong.topicId) || undefined };
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
    topic ? maybeCostume(stampId(problemForTopic(topic, d)), topic) : stampId(localProblem(current.skill, d));
  const next = curTopic ? selectFor(profileId, curTopic.id) : null;
  const right = next
    ? make(next.topic, next.mode === "review" ? next.difficulty : Math.min(0.95, current.difficulty + 0.12))
    : make(undefined, Math.min(0.95, current.difficulty + 0.12));
  const wrongPlan = wrongBranchPlan(profileId, current, recentAttempts(profileId, 3));
  const wrong = make(wrongPlan.topic, wrongPlan.difficulty);
  return {
    right: { ...right, newTopic: needsDemo(profileId, right.topicId) || undefined },
    wrong: { ...wrong, newTopic: needsDemo(profileId, wrong.topicId) || undefined },
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
  const problem = stampId(serveProblem(topic, difficulty));
  notePrompt(profileId, problem.prompt);
  return c.json({ ...problem, newTopic: needsDemo(profileId, topic.id) || undefined });
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
  const shieldUsed = false;
  let allDailiesCrazyCoin = false;
  const questsCompleted: { key: string; label: string; reward: number }[] = [];
  // Today's correct-answer count, on HIS calendar day (PLAYER_TZ). Keyed by
  // problem id, so a re-posted attempt cannot inflate it — or re-fire the
  // record celebration.
  const daily = correct && typeof problemId === "string" && problemId
    ? recordDailySolve(db, profileId, problemId, Date.now())
    : dailyProgress(db, profileId, playerDay(Date.now()), false);

  if (correct) {
    state.streak += 1;
    state.best_streak = Math.max(state.best_streak, state.streak);
    const bonus = streakBonus(state.streak);
    gemsEarned = 1 + bonus;
    creditGems(state, gemsEarned);
    if (bonus > 0) milestone = state.streak;

    const q = advanceQuests(profileId, day, state, {
      firstTry: true,
      gemsEarned,
      solveMs: Math.round(solveMs ?? 0),
    });
    questsCompleted.push(...q.completed);
    allDailiesCrazyCoin = q.allDailiesCrazyCoin;
  } else {
    // A wrong FIRST try is learning data, not a punishable miss: he still has
    // retries. The streak/shield outcome happens at /reward/miss, which the
    // client calls only when the problem gives up and moves on.
    gemsEarned = 0;
  }
  // A correct answer mines a gem — that swing wears the equipped pickaxe.
  const durability = equippedDurability(profileId, state, correct);
  saveProfileState(profileId, state);

  return c.json({
    ok: true,
    reward: {
      gemsEarned,
      totalGems: state.gems,
      lifetimeGems: state.lifetime_gems,
      streak: state.streak,
      bestStreak: state.best_streak,
      shields: state.shields,
      milestone,
      shieldUsed,
      questsCompleted,
      allDailiesCrazyCoin,
      durability,
      daily,
    },
  });
});

// The problem gave up and moved on (3 tries exhausted) — THIS is the miss that
// counts: consume a shield if he has one, else the streak resets. bestStreak is
// untouched either way (it's his forever).
app.post("/reward/miss", async (c) => {
  const { profileId } = await c.req.json();
  const state = getProfileState(profileId);
  let shieldUsed = false;
  let streakLost = 0;
  if (state.shields > 0) {
    state.shields -= 1;
    shieldUsed = true; // shield saved the streak — leave it unchanged
  } else {
    streakLost = state.streak;
    state.streak = 0;
    resetDailyStreakQuest(profileId, utcDay());
  }
  saveProfileState(profileId, state);
  return c.json({
    ok: true,
    reward: {
      gemsEarned: 0, totalGems: state.gems, lifetimeGems: state.lifetime_gems, streak: state.streak, bestStreak: state.best_streak,
      shields: state.shields, milestone: null, shieldUsed, streakLost, questsCompleted: [],
    },
  });
});

// A correct answer that wasn't his FIRST try: still earns a gem and counts toward
// the gem/solve quests, but NOT the streak (a streak needs a clean first-try win).
app.post("/reward/retry-solve", async (c) => {
  const { profileId, problemId } = await c.req.json();
  const state = getProfileState(profileId);
  const day = utcDay();
  // He got it right in the end, so it counts toward today's total — once. An
  // older client that doesn't send problemId simply isn't counted (a missing
  // count is recoverable; a double count would fake a record).
  const daily = typeof problemId === "string" && problemId
    ? recordDailySolve(db, profileId, problemId, Date.now())
    : dailyProgress(db, profileId, playerDay(Date.now()), false);
  creditGems(state, 1);
  const { completed: questsCompleted, allDailiesCrazyCoin } = advanceQuests(profileId, day, state, {
    firstTry: false,
    gemsEarned: 1,
  });
  const durability = equippedDurability(profileId, state, true); // a mined gem wears it
  saveProfileState(profileId, state);
  return c.json({
    ok: true,
    reward: {
      gemsEarned: 1, totalGems: state.gems, lifetimeGems: state.lifetime_gems, streak: state.streak, bestStreak: state.best_streak,
      shields: state.shields, milestone: null, shieldUsed: false, questsCompleted, allDailiesCrazyCoin, durability,
      daily,
    },
  });
});

// Hoard meter filled → award a flat bonus on top. Purely client-triggered (no
// adversary in a kid's game); the server stays the gem authority by crediting +
// returning the new total. Quests are untouched (the bonus is "extra").
app.post("/reward/hoard-bonus", async (c) => {
  const { profileId } = await c.req.json();
  const state = getProfileState(profileId);
  creditGems(state, HOARD_BONUS);
  saveProfileState(profileId, state);
  return c.json({
    ok: true,
    reward: {
      gemsEarned: HOARD_BONUS, totalGems: state.gems, lifetimeGems: state.lifetime_gems, streak: state.streak, bestStreak: state.best_streak,
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
    lifetimeGems: s.lifetime_gems,
    streak: s.streak,
    bestStreak: s.best_streak,
    shields: s.shields,
    quests: questView(getQuests(profileId)),
    weeklyQuest: questView([getWeeklyQuest(profileId)])[0],
    equipped: s.equipped_pickaxe,
    durability: equippedDurability(profileId, s, false),
    equippedGemStyle: s.equipped_gem_style,
    daily: dailyRecordState(db, profileId, Date.now()),
  });
});

// The client has SHOWN a record celebration. Until this lands, /state keeps
// handing the event back — durable at-least-once delivery, so a dropped attempt
// response or a mid-party reload still gets its moment. The client de-dupes on
// the event id, which makes the visible result exactly-once in practice.
// Idempotent, and a no-op for an id that never existed.
app.post("/daily-record/ack", async (c) => {
  const { profileId, eventId } = DailyRecordAckSchema.parse(await c.req.json());
  acknowledgeRecordEvent(db, profileId, eventId, Date.now());
  return c.json({ ok: true });
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
  const padThemes = PAD_THEME_CATALOG.map((t) => ({
    key: t.key, name: t.name, price: t.price,
    owned: ownsItem(profileId, t.key),
    equipped: s.equipped_pad_theme === t.key,
  }));
  const gemStyles = GEM_STYLE_CATALOG.map((style) => ({
    key: style.key, name: style.name, price: style.price,
    owned: ownsItem(profileId, style.key),
    equipped: s.equipped_gem_style === style.key,
  }));
  return c.json({
    gems: s.gems,
    equipped: s.equipped_pickaxe,
    items,
    padThemes,
    equippedPadTheme: s.equipped_pad_theme,
    gemStyles,
    equippedGemStyle: s.equipped_gem_style,
  });
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
  // Pad themes share owned_items — never let one be equipped as a pickaxe.
  if (padThemeEntry(itemKey) || gemStyleEntry(itemKey)) {
    return c.json({ ok: false, reason: "not a pickaxe" });
  }
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

// Buy a pad theme: spend gems, record ownership, auto-equip. Pure cosmetic —
// no durability, no repair; switching back to the classic look is always free.
app.post("/shop/buy-pad-theme", async (c) => {
  const { profileId, themeKey } = await c.req.json();
  const s = getProfileState(profileId);
  const cat = padThemeEntry(themeKey);
  if (!cat || ownsItem(profileId, themeKey)) {
    return c.json({ ok: false, reason: "unavailable", gems: s.gems });
  }
  if (s.gems < cat.price) {
    return c.json({ ok: false, reason: "not enough gems", gems: s.gems });
  }
  s.gems -= cat.price;
  s.equipped_pad_theme = themeKey;
  db.query(`INSERT OR IGNORE INTO owned_items (profile_id, item_key) VALUES (?, ?)`)
    .run(profileId, themeKey);
  saveProfileState(profileId, s);
  return c.json({ ok: true, gems: s.gems, equippedPadTheme: s.equipped_pad_theme, item: { key: cat.key, name: cat.name, price: cat.price } });
});

// Equip an owned pad theme (or the free classic).
app.post("/shop/equip-pad-theme", async (c) => {
  const { profileId, themeKey } = await c.req.json();
  const s = getProfileState(profileId);
  if (themeKey === "pad_classic" || (padThemeEntry(themeKey) && ownsItem(profileId, themeKey))) {
    s.equipped_pad_theme = themeKey;
    saveProfileState(profileId, s);
    return c.json({ ok: true, equippedPadTheme: s.equipped_pad_theme });
  }
  return c.json({ ok: false, reason: "not owned" });
});

// Buy a mine-target model: spend gems, record ownership, and auto-equip it.
app.post("/shop/buy-gem-style", async (c) => {
  const { profileId, styleKey } = await c.req.json();
  const s = getProfileState(profileId);
  const cat = gemStyleEntry(styleKey);
  if (!cat || ownsItem(profileId, styleKey)) {
    return c.json({ ok: false, reason: "unavailable", gems: s.gems });
  }
  if (s.gems < cat.price) {
    return c.json({ ok: false, reason: "not enough gems", gems: s.gems });
  }
  s.gems -= cat.price;
  s.equipped_gem_style = styleKey;
  db.query(`INSERT OR IGNORE INTO owned_items (profile_id, item_key) VALUES (?, ?)`)
    .run(profileId, styleKey);
  saveProfileState(profileId, s);
  return c.json({
    ok: true,
    gems: s.gems,
    equippedGemStyle: s.equipped_gem_style,
    item: { key: cat.key, name: cat.name, price: cat.price },
  });
});

// Equip an owned mine-target model (or the free classic geode).
app.post("/shop/equip-gem-style", async (c) => {
  const { profileId, styleKey } = await c.req.json();
  const s = getProfileState(profileId);
  if (styleKey === "gem_classic" || (gemStyleEntry(styleKey) && ownsItem(profileId, styleKey))) {
    s.equipped_gem_style = styleKey;
    saveProfileState(profileId, s);
    return c.json({ ok: true, equippedGemStyle: s.equipped_gem_style });
  }
  return c.json({ ok: false, reason: "not owned" });
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

// Parent redeems one Crazy Coin (kid cashes it in for 15 minutes of shows).
// Only decrements the counter — daily quest rewards do not affect gems.
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
  const skipCounts = new Map((db.query(
    `SELECT topic_id, COUNT(*) AS n FROM attempts
     WHERE profile_id = ? AND skipped = 1 AND topic_id IS NOT NULL GROUP BY topic_id`,
  ).all(profileId) as { topic_id: string; n: number }[]).map((r) => [r.topic_id, r.n]));
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
      skips: skipCounts.get(t.id) ?? 0,
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

const EXPLAIN_SYSTEM = `You are the warm tutor voice inside a gem-mine math game, explaining ONE problem to a 6-year-old American boy who tapped "explain". Rules:
- Think through the numbers PRIVATELY first, then speak only the finished explanation. The spoken text must read like you knew the plan all along — never search out loud, never change course (no "hmm", no "actually", no "wait", no "or you could").
- Pick ONE strategy — the single most natural one for these exact numbers — and teach only that one. Never mention another way, a strategy you are NOT using, or why some other approach doesn't apply. Just teach the one that works.
- For adding several numbers: if two of them make exactly ten, start with that pair; otherwise just add the two biggest first and then the last one. Don't hunt for tens that aren't there.
- For a missing addend that crosses ten (like 6 + ? = 17): add a whole ten first, then adjust — six plus ten is sixteen, and it just needs one more to reach seventeen. NEVER count up to ten and then add the two jumps together (4 then 7): that ends in a second hard sum and hurts more than it helps. (Only state the final number if these rules say you may.)
- For division (like 12 ÷ 3): teach SKIP-COUNTING by the divisor — count by threes up to twelve (three, six, nine, twelve) and count the jumps. Do NOT narrate dealing items out one at a time to a group of friends; that's slow and rambly.
- At most 60 spoken words. Plain sentences a child can follow by ear. No emoji, no markdown, no lists.
- Walk the strategy with his actual numbers (make-a-ten, count on, count back, think in tens, share one at a time, skip-count...).
- Money is ALWAYS American: dollars and cents, penny/nickel/dime/quarter. Never pounds, pence, or notes.
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
        model: TUTOR_MODEL, max_tokens: 1400, // no temperature — rejected by claude-sonnet-5
        // Private planning space (Claude 5 adaptive thinking): the model works out
        // the strategy off-mic, so the spoken text never rambles or self-corrects.
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
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

// Short lines (praise/nudges) repeat thousands of times — cache their audio so
// they play instantly instead of re-synthesizing at ElevenLabs each time.
const ttsCache = new Map<string, ArrayBuffer>();
const TTS_CACHE_MAX_LEN = 90;   // only cache short, repeated lines
const TTS_CACHE_ENTRIES = 150;  // ~30-60KB each → a few MB tops

// ---- New-topic demonstration ------------------------------------------------

const DEMO_SYSTEM = `You are the warm tutor voice inside a gem-mine math game. A 6-year-old American boy has just discovered a BRAND-NEW kind of problem he has never seen before. He is only WATCHING right now — nothing is being tested. Show him how this kind works, start to finish, using the example given. Rules:
- Think through it PRIVATELY first, then speak only the finished demonstration. Never search out loud or change course (no "hmm", no "actually", no "wait").
- At most 70 spoken words. Short plain sentences a child can follow by ear. No emoji, no markdown, no lists.
- Pick ONE strategy and walk it all the way to the end. DO say the answer — this is a demonstration, not a question.
- For a missing addend that crosses ten (like 6 + ? = 17): add a whole ten first, then adjust — six plus ten is sixteen, and it just needs one more to reach seventeen. NEVER count up to ten and then add the two jumps together (4 then 7): that ends in a second hard sum and hurts more than it helps. (Only state the final number if these rules say you may.)
- For division (like 12 ÷ 3): teach SKIP-COUNTING by the divisor — count by threes up to twelve (three, six, nine, twelve) and count the jumps. Do NOT narrate dealing items out one at a time to a group of friends; that's slow and rambly.
- Sound excited about the discovery, never like a lesson: "You found a new kind of gem!"
- Never ask him a question except the final invitation.
- Money is ALWAYS American: dollars and cents, penny/nickel/dime/quarter.
- Finish with "Now you try one!"`;

const demoCache = new Map<string, string>();

// He met a topic he has never seen. Show one worked example BEFORE any graded
// question — the worked-example effect, and the thing his 🤔 usage was asking for.
app.post("/tutor/demo", async (c) => {
  const { profileId, topicId } = DemoRequestSchema.parse(await c.req.json());
  const topic = topicById(topicId);
  if (!topic) return c.json({ error: "unknown topic" }, 404);
  // Easiest end of the topic's range, and never costumed — a first look should
  // be as plain as possible.
  const example = problemForTopic(topic, 0.2);
  const fallback = `You found a new kind of gem! Here's how it works.${example.hint ? " " + example.hint : ""} So ${example.prompt} is ${example.answer}. Now you try one!`;
  const key = `${topicId}::${example.prompt}`;
  const cached = demoCache.get(key);
  const reply = (script: string) => {
    db.query(`INSERT OR IGNORE INTO topic_demos (profile_id, topic_id, seen_at) VALUES (?, ?, ?)`)
      .run(profileId, topicId, Date.now());
    return c.json({
      kidLabel: topic.kidLabel, name: topic.name,
      example: { prompt: example.prompt, spoken: example.spoken, answer: example.answer, hint: example.hint },
      script,
    });
  };
  if (cached) return reply(cached);
  try {
    const resp = await anthropic.messages.create({
      model: TUTOR_MODEL, max_tokens: 1400, // no temperature — rejected by claude-sonnet-5
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: DEMO_SYSTEM,
      messages: [{ role: "user", content: [
        `New topic: "${topic.name}" (${topic.kidLabel}) — ${topic.description}`,
        `Worked example to demonstrate: "${example.prompt}" (read aloud: "${example.spoken}"). The answer is ${example.answer}.`,
        example.hint ? `A strategy that works: ${example.hint}` : "",
      ].filter(Boolean).join("\n") }],
    });
    const block = resp.content.find((b) => b.type === "text");
    let text = (block && block.type === "text" ? block.text : "").trim();
    if (text.length > 550) {
      const cut = text.slice(0, 550);
      text = cut.slice(0, Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?")) + 1) || cut;
    }
    const out = text || fallback;
    demoCache.set(key, out);
    if (demoCache.size > 60) demoCache.delete(demoCache.keys().next().value!);
    return reply(out);
  } catch (e) {
    console.warn("[tutor] demo failed; scripted fallback:", (e as Error)?.message);
    return reply(fallback);
  }
});

// ---- "I'm not sure yet" (the escape hatch) ---------------------------------

// He pressed 🤔. This is the most honest signal the tutor gets: he knows he
// doesn't know. It records as a not-correct attempt (so difficulty eases and the
// prereq step-down arms) but touches NO reward state — no streak loss, no shield
// burned, no gem earned. Being stuck must never be punished.
app.post("/tutor/skip", async (c) => {
  const body = await c.req.json();
  const { profileId, problemId, skill } = body;
  const topicId = typeof body.topicId === "string" ? body.topicId : null;
  const difficulty = typeof body.difficulty === "number" ? body.difficulty : 0.5;
  // Ignore a skip for a problem he already answered — one problem, one row.
  const seen = db.query(`SELECT 1 FROM attempts WHERE profile_id = ? AND problem_id = ?`)
    .get(profileId, problemId);
  if (seen) return c.json({ ok: true, duplicate: true });
  db.query(
    `INSERT INTO attempts (profile_id, problem_id, skill, topic_id, correct, solve_ms, difficulty, skipped, created_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, 1, ?)`,
  ).run(profileId, problemId, skill, topicId, difficulty, Date.now());
  recordMastery(profileId, skill, false, difficulty);
  if (topicId) recordTopicMastery(profileId, topicId, false, difficulty);
  return c.json({ ok: true });
});

const WALKTHROUGH_SYSTEM = `You are the warm tutor voice inside a gem-mine math game. A 6-year-old American boy just pressed "I'm not sure how to do this one" — he has told you he is stuck, so this is a WORKED EXAMPLE, not a quiz. Rules:
- Think through the numbers PRIVATELY first, then speak only the finished walkthrough. Never search out loud, never change course (no "hmm", no "actually", no "wait").
- Pick ONE strategy and walk it all the way to the end using his actual numbers. DO say the final answer — he needs to see it done.
- For a missing addend that crosses ten (like 6 + ? = 17): add a whole ten first, then adjust — six plus ten is sixteen, and it just needs one more to reach seventeen. NEVER count up to ten and then add the two jumps together (4 then 7): that ends in a second hard sum and hurts more than it helps. (Only state the final number if these rules say you may.)
- For division (like 12 ÷ 3): teach SKIP-COUNTING by the divisor — count by threes up to twelve (three, six, nine, twelve) and count the jumps. Do NOT narrate dealing items out one at a time to a group of friends; that's slow and rambly.
- At most 70 spoken words. Short plain sentences a child can follow by ear. No emoji, no markdown, no lists.
- Be matter-of-fact and kind about not knowing it ("This one's tricky — here's the trick"). Never say he is wrong, slow, or that it's too hard for him. Never ask him a question.
- Money is ALWAYS American: dollars and cents, penny/nickel/dime/quarter.
- Finish by inviting the next try, e.g. "Now let's do one like it together!"`;

const walkthroughCache = new Map<string, string>();

app.post("/tutor/walkthrough", async (c) => {
  const { problem } = ExplainRequestSchema.parse(await c.req.json());
  const cached = walkthroughCache.get(problem.id);
  if (cached) return c.json({ text: cached });
  const fallback = `That one is tricky! The answer is ${problem.answer}.${problem.hint ? " " + problem.hint : ""} Now let's do one like it together!`;
  const topic = problem.topicId ? topicById(problem.topicId) : undefined;
  const userContent = [
    `The problem on screen: "${problem.prompt}" (read aloud as: "${problem.spoken}").`,
    topic ? `It practices the topic "${topic.name}": ${topic.description}` : "",
    `The answer is ${problem.answer}. Show him how to get there, and say the answer.`,
  ].filter(Boolean).join("\n");
  try {
    const resp = await anthropic.messages.create({
      model: TUTOR_MODEL, max_tokens: 1400, // no temperature — rejected by claude-sonnet-5
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: WALKTHROUGH_SYSTEM,
      messages: [{ role: "user", content: userContent }],
    });
    const block = resp.content.find((b) => b.type === "text");
    let text = (block && block.type === "text" ? block.text : "").trim();
    if (text.length > 550) {
      const cut = text.slice(0, 550);
      text = cut.slice(0, Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?")) + 1) || cut;
    }
    const out = text || fallback;
    walkthroughCache.set(problem.id, out);
    if (walkthroughCache.size > 50) walkthroughCache.delete(walkthroughCache.keys().next().value!);
    return c.json({ text: out });
  } catch (e) {
    console.warn("[tutor] walkthrough failed; answer+hint fallback:", (e as Error)?.message);
    walkthroughCache.set(problem.id, fallback);
    return c.json({ text: fallback });
  }
});

app.post("/tts", async (c) => {
  const { text } = TtsRequestSchema.parse(await c.req.json());
  const cached = ttsCache.get(text);
  if (cached) return new Response(cached.slice(0), { headers: { "Content-Type": "audio/mpeg" } });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return c.json({ error: "no tts key" }, 503);
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      // Warm + expressive for an encouraging kid tutor; slower so a 6-year-old can follow.
      // stability lower = more emotional range; style adds warmth; speed 0.7–1.2 (1.0 default).
      // turbo_v2_5 is multilingual: short punctuation-heavy lines (em dashes
      // especially) can flip it into another language — pin English and swap
      // dashes for commas before synthesis.
      body: JSON.stringify({
        text: text.replace(/\s*[—–]\s*/g, ", "),
        model_id: "eleven_turbo_v2_5",
        language_code: "en",
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 0.82 },
      }),
    },
  );
  if (!r.ok) return c.json({ error: `tts ${r.status}` }, 502);
  if (text.length <= TTS_CACHE_MAX_LEN) {
    const buf = await r.arrayBuffer();
    ttsCache.set(text, buf);
    if (ttsCache.size > TTS_CACHE_ENTRIES) ttsCache.delete(ttsCache.keys().next().value!);
    return new Response(buf.slice(0), { headers: { "Content-Type": "audio/mpeg" } });
  }
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg" } });
});

console.log(`[institute] tutor server on :${PORT} (model ${TUTOR_MODEL})`);
export default { port: PORT, fetch: app.fetch };
