// server/src/dailyRecord.ts — "how many did I get right today?", and the all-time
// daily record he is chasing.
//
// TIMEZONE. A day here is the PLAYER's calendar day in an explicitly configured
// IANA zone (env PLAYER_TZ, default America/New_York), resolved through Intl —
// never the machine's ambient TZ. A tutor server that boots under TZ=UTC must
// still roll the day over at his bedtime, not at 7pm. (The daily QUESTS keep
// their long-standing UTC day; changing that would silently reset an
// in-progress board, which is not this feature's job.)
//
// COUNTING. One row per solved problem, keyed by problem id, so a re-posted
// attempt, a retry, or a double-tap can never inflate the count.
//
// COMPLETENESS. The pre-feature database stored no problem id for a "solved on
// a retry" answer, so those solves are unrecoverable. The migration therefore
// records the first day it knows is completely counted, and the UI says so
// rather than claiming a perfect lifetime history.
import type { Database } from "bun:sqlite";
import type {
  DailyCount, DailyProgress, DailyRecord, DailyRecordEvent, DailyTracking,
} from "@institute/shared";

/** Days of history handed to the client for the graph. */
export const HISTORY_DAYS = 30;
/** Window summarised by the "this week" stats. */
export const RECENT_WINDOW_DAYS = 7;
/** Where this deployment's kid actually lives. */
export const DEFAULT_PLAYER_TIME_ZONE = "America/New_York";
/** Undelivered record parties expire: a celebration three days late is confusing. */
export const PENDING_EVENT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
/** Never hand the client an unbounded backlog. */
export const MAX_PENDING_EVENTS = 8;

// ---- Player timezone --------------------------------------------------------

/** First of [configured, default, UTC] that this runtime accepts as an IANA
 *  zone. A typo in the env var degrades to the default rather than crashing the
 *  tutor server or silently reverting to the machine clock. */
export function resolvePlayerTimeZone(raw?: string | null): string {
  for (const candidate of [raw?.trim(), DEFAULT_PLAYER_TIME_ZONE, "UTC"]) {
    if (!candidate) continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: candidate });
      return candidate;
    } catch {
      console.warn(`[daily] ignoring unknown timezone "${candidate}"`);
    }
  }
  return "UTC";
}

/** The zone this process treats as the player's. */
export const PLAYER_TIME_ZONE = resolvePlayerTimeZone(process.env.PLAYER_TZ);

const formatters = new Map<string, Intl.DateTimeFormat>();
function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The player's calendar day that owns a timestamp, as YYYY-MM-DD. Built from
 *  parts, so no locale's date order or separator can leak in. */
export function playerDay(ts: number, timeZone: string = PLAYER_TIME_ZONE): string {
  const parts = dayFormatter(timeZone).formatToParts(new Date(ts));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Step a calendar day by whole days. Deliberately pure civil-date arithmetic
 *  (via UTC, which has no DST): the SEQUENCE of calendar dates is the same in
 *  every zone, so a spring-forward day is neither skipped nor repeated. */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const stepped = new Date(Date.UTC(y, m - 1, d) + delta * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${stepped.getUTCFullYear()}-${pad(stepped.getUTCMonth() + 1)}-${pad(stepped.getUTCDate())}`;
}

// ---- Schema + migration -----------------------------------------------------

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS daily_record_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_solves (
    profile_id TEXT NOT NULL,
    problem_id TEXT NOT NULL,
    day TEXT NOT NULL,
    solved_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, problem_id)
  );
  CREATE INDEX IF NOT EXISTS idx_daily_solves_day ON daily_solves(profile_id, day);
  CREATE TABLE IF NOT EXISTS daily_record_events (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL,
    previous_record INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    acknowledged_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_daily_record_events_pending
    ON daily_record_events(profile_id, acknowledged_at, created_at);
`;

const META_BACKFILL_STATE = "backfill_state";
const META_COMPLETE_SINCE = "complete_since";
const META_BACKFILLED = "backfilled";
const BACKFILL_COMPLETE = "complete";

function getMeta(db: Database, key: string): string | null {
  const row = db.query(`SELECT value FROM daily_record_meta WHERE key = ?`).get(key) as
    { value: string } | null;
  return row?.value ?? null;
}

function setMeta(db: Database, key: string, value: string): void {
  db.query(
    `INSERT INTO daily_record_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

/** Create the tables and run the one-shot backfill.
 *
 *  Restart-safe by construction: the "done" marker is written INSIDE the same
 *  transaction as the backfilled rows, so an interruption commits neither and
 *  the next boot simply runs it again. The inserts are INSERT OR IGNORE, so a
 *  re-run after a partial earlier attempt converges instead of double-counting.
 *  Table existence is explicitly NOT the marker — a half-filled table would
 *  otherwise be mistaken for a finished migration, forever. */
export function ensureDailyRecordSchema(
  db: Database,
  now: number = Date.now(),
  timeZone: string = PLAYER_TIME_ZONE,
): void {
  db.exec(SCHEMA);
  if (getMeta(db, META_BACKFILL_STATE) === BACKFILL_COMPLETE) return;

  // Every distinct problem ever answered correctly, filed under the player-day
  // of its FIRST correct answer. Additive only: nothing else is read or written.
  const solved = db.query(
    `SELECT profile_id, problem_id, MIN(created_at) AS solved_at
     FROM attempts WHERE correct = 1 GROUP BY profile_id, problem_id`,
  ).all() as { profile_id: string; problem_id: string; solved_at: number }[];
  const insert = db.query(
    `INSERT OR IGNORE INTO daily_solves (profile_id, problem_id, day, solved_at) VALUES (?, ?, ?, ?)`,
  );
  const today = playerDay(now, timeZone);
  // Detect legacy activity independently of reconstructable correct rows. A
  // profile may have solved only on retries; the old schema retained the wrong
  // first attempt but no correct retry row, so `solved.length === 0` does NOT
  // prove that history is complete.
  const hadLegacyActivity = !!db.query(`SELECT 1 FROM attempts LIMIT 1`).get();
  // A database with prior activity may be missing legacy retry solves, and today
  // is only half over — so completeness is conservatively claimed from TOMORROW.
  // A genuinely unused database has lost nothing: complete from today.
  const completeSince = hadLegacyActivity ? shiftDay(today, 1) : today;

  db.transaction(() => {
    for (const row of solved) {
      insert.run(row.profile_id, row.problem_id, playerDay(row.solved_at, timeZone), row.solved_at);
    }
    setMeta(db, META_COMPLETE_SINCE, completeSince);
    // This flag drives the disclosure. It means "legacy history may be partial",
    // even when there were no first-try correct rows available to insert.
    setMeta(db, META_BACKFILLED, hadLegacyActivity ? "1" : "0");
    setMeta(db, META_BACKFILL_STATE, BACKFILL_COMPLETE); // last, and atomic with the rows
  })();
}

/** How far back the numbers can be trusted (see DailyTrackingSchema). */
export function trackingInfo(db: Database): DailyTracking {
  return {
    completeSince: getMeta(db, META_COMPLETE_SINCE),
    backfilled: getMeta(db, META_BACKFILLED) === "1",
  };
}

// ---- Counting ---------------------------------------------------------------

/** All of a profile's day tallies, oldest first. */
function dayCounts(db: Database, profileId: string): DailyCount[] {
  return (db.query(
    `SELECT day, COUNT(*) AS count FROM daily_solves WHERE profile_id = ? GROUP BY day ORDER BY day`,
  ).all(profileId) as { day: string; count: number }[]).map((r) => ({ day: r.day, count: r.count }));
}

const countOn = (counts: DailyCount[], day: string): number =>
  counts.find((c) => c.day === day)?.count ?? 0;

/** The best day in the list (earliest day wins a tie — that's when he set it). */
function bestOf(counts: DailyCount[]): DailyCount | null {
  let best: DailyCount | null = null;
  for (const c of counts) if (!best || c.count > best.count) best = c;
  return best;
}

/** Count one solved problem. Idempotent per problem id: a repeat is a no-op, so
 *  the same count can never fire the record celebration twice. A record-breaking
 *  answer also persists a durable event (see pendingRecordEvents). */
export function recordDailySolve(
  db: Database,
  profileId: string,
  problemId: string,
  now: number,
  timeZone: string = PLAYER_TIME_ZONE,
): DailyProgress {
  const day = playerDay(now, timeZone);
  // The solve and its record event are one commit. A crash can leave neither,
  // but can never leave a counted record with its durable celebration missing.
  return db.transaction(() => {
    // Explicit "have I seen this problem?" rather than trusting a driver's row
    // count: whether this answer is NEW is exactly what decides the celebration.
    const seen = db.query(`SELECT 1 FROM daily_solves WHERE profile_id = ? AND problem_id = ?`)
      .get(profileId, problemId);
    if (!seen) {
      db.query(
        `INSERT OR IGNORE INTO daily_solves (profile_id, problem_id, day, solved_at) VALUES (?, ?, ?, ?)`,
      ).run(profileId, problemId, day, now);
    }
    const progress = dailyProgress(db, profileId, day, !seen);
    if (progress.newRecord && progress.eventId) {
      // Written before the response leaves: if the response is lost, /state still
      // carries the party.
      db.query(
        `INSERT OR IGNORE INTO daily_record_events
           (id, profile_id, day, count, previous_record, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(progress.eventId, profileId, day, progress.today, progress.previousRecord, now);
    }
    return progress;
  })();
}

/** Today vs the bar he had to clear. `justCounted` false ⇒ nothing moved, so
 *  this answer cannot be the one that broke the record. */
export function dailyProgress(
  db: Database,
  profileId: string,
  day: string,
  justCounted: boolean,
): DailyProgress {
  const counts = dayCounts(db, profileId);
  const today = countOn(counts, day);
  const previousRecord = bestOf(counts.filter((c) => c.day !== day))?.count ?? 0;
  // A record needs an earlier record to beat: on the first-ever day
  // previousRecord is 0 and nothing fires. From then on, the exact answer that
  // clears the old best — and only that one — is the moment.
  const newRecord = justCounted && previousRecord > 0 && today === previousRecord + 1;
  return {
    day,
    today,
    record: Math.max(today, previousRecord),
    previousRecord,
    newRecord,
    eventId: newRecord ? recordEventId(profileId, day, today) : null,
  };
}

/** Stable across retries of the same request: same profile, day, and count. */
export const recordEventId = (profileId: string, day: string, count: number): string =>
  `${profileId}:${day}:${count}`;

// ---- Durable record celebrations --------------------------------------------

/** Record moments this profile has not acknowledged showing yet, oldest first.
 *  Delivery is at-least-once (the client de-dupes on id); stale ones are dropped
 *  rather than surfacing a party days after the fact. */
export function pendingRecordEvents(
  db: Database,
  profileId: string,
  now: number,
  limit: number = MAX_PENDING_EVENTS,
): DailyRecordEvent[] {
  const rows = db.query(
    `SELECT id, day, count, previous_record FROM daily_record_events
     WHERE profile_id = ? AND acknowledged_at IS NULL AND created_at >= ?
     ORDER BY created_at ASC, id ASC LIMIT ?`,
  ).all(profileId, now - PENDING_EVENT_TTL_MS, limit) as
    { id: string; day: string; count: number; previous_record: number }[];
  return rows.map((r) => ({
    id: r.id, day: r.day, count: r.count, previousRecord: r.previous_record,
  }));
}

/** "I showed this one." Idempotent, and safe for an id that never existed. */
export function acknowledgeRecordEvent(
  db: Database,
  profileId: string,
  eventId: string,
  now: number,
): void {
  db.query(
    `UPDATE daily_record_events SET acknowledged_at = ?
     WHERE id = ? AND profile_id = ? AND acknowledged_at IS NULL`,
  ).run(now, eventId, profileId);
}

// ---- The view ---------------------------------------------------------------

/** The full view for the HUD chip and the stats panel. */
export function dailyRecordState(
  db: Database,
  profileId: string,
  now: number,
  timeZone: string = PLAYER_TIME_ZONE,
): DailyRecord {
  const counts = dayCounts(db, profileId);
  const day = playerDay(now, timeZone);
  const today = countOn(counts, day);
  const best = bestOf(counts);
  const record = best?.count ?? 0;

  // Zero-filled window ending today, so the graph shows the rest days too.
  const history: DailyCount[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const d = shiftDay(day, -i);
    history.push({ day: d, count: countOn(counts, d) });
  }

  const last7Total = history.slice(-RECENT_WINDOW_DAYS).reduce((sum, d) => sum + d.count, 0);
  const trackedSolves = counts.reduce((sum, d) => sum + d.count, 0);

  // Days in a row with at least one solve. A morning before he has played yet
  // still shows yesterday's run intact rather than a scary 0.
  let streak = 0;
  let cursor = today > 0 ? day : shiftDay(day, -1);
  while (countOn(counts, cursor) > 0) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }

  return {
    day,
    timeZone,
    today,
    record,
    recordDay: best?.day ?? null,
    isRecord: today > 0 && today >= record,
    history,
    stats: {
      last7Total,
      last7Average: Math.round((last7Total / RECENT_WINDOW_DAYS) * 10) / 10,
      bestDay: best,
      daysPlayed: counts.length,
      trackedSolves,
      currentStreakDays: streak,
    },
    tracking: trackingInfo(db),
    pendingEvents: pendingRecordEvents(db, profileId, now),
  };
}
