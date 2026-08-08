import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  DEFAULT_PLAYER_TIME_ZONE,
  HISTORY_DAYS,
  PENDING_EVENT_TTL_MS,
  acknowledgeRecordEvent,
  dailyRecordState,
  ensureDailyRecordSchema,
  pendingRecordEvents,
  playerDay,
  recordDailySolve,
  recordEventId,
  resolvePlayerTimeZone,
  shiftDay,
  trackingInfo,
} from "./dailyRecord.ts";

/** The player's zone for these tests — deliberately NOT the process TZ, so a
 *  regression back to ambient-timezone behaviour fails here. */
const TZ = "America/New_York";

/** An absolute UTC instant. Every assertion below is anchored to real instants,
 *  never to whatever zone the test machine happens to run in. */
const utc = (y: number, m: number, d: number, h = 12, min = 0) =>
  Date.UTC(y, m - 1, d, h, min);

/** A DB with just the columns dailyRecord touches (attempts = backfill source). */
function freshDb(seedAttempts = false): Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL, problem_id TEXT NOT NULL,
    correct INTEGER NOT NULL, created_at INTEGER NOT NULL)`);
  if (seedAttempts) {
    const ins = db.query(`INSERT INTO attempts (profile_id, problem_id, correct, created_at) VALUES (?, ?, ?, ?)`);
    // 3 right on Mar 1 (New York), 6 right on Mar 2, plus noise that must not count.
    for (let i = 0; i < 3; i++) ins.run("pax", `a${i}`, 1, utc(2026, 3, 1, 15));
    for (let i = 0; i < 6; i++) ins.run("pax", `b${i}`, 1, utc(2026, 3, 2, 23));
    ins.run("pax", "b0", 1, utc(2026, 3, 3, 0, 30)); // same problem again — one count
    ins.run("pax", "c0", 0, utc(2026, 3, 2, 23));    // wrong — never counts
    ins.run("other", "z0", 1, utc(2026, 3, 2, 23));  // another profile stays separate
  }
  return db;
}

describe("the player timezone", () => {
  test("falls back to the deployment default when the env value is nonsense", () => {
    expect(resolvePlayerTimeZone("Mars/Olympus_Mons")).toBe(DEFAULT_PLAYER_TIME_ZONE);
    expect(resolvePlayerTimeZone("")).toBe(DEFAULT_PLAYER_TIME_ZONE);
    expect(resolvePlayerTimeZone(undefined)).toBe(DEFAULT_PLAYER_TIME_ZONE);
    expect(resolvePlayerTimeZone(null)).toBe(DEFAULT_PLAYER_TIME_ZONE);
  });

  test("accepts any real IANA zone, trimmed", () => {
    expect(resolvePlayerTimeZone("Europe/London")).toBe("Europe/London");
    expect(resolvePlayerTimeZone("  Asia/Tokyo  ")).toBe("Asia/Tokyo");
    expect(resolvePlayerTimeZone("UTC")).toBe("UTC");
  });

  test("a late-evening answer belongs to HIS day, not to UTC's next day", () => {
    // 03:00 UTC on Mar 2 is 22:00 on Mar 1 in New York — still bedtime maths.
    expect(playerDay(utc(2026, 3, 2, 3), TZ)).toBe("2026-03-01");
    expect(playerDay(utc(2026, 3, 2, 3), "UTC")).toBe("2026-03-02");
    expect(playerDay(utc(2026, 3, 2, 3), "Asia/Tokyo")).toBe("2026-03-02");
  });

  test("the day rolls over at HIS midnight", () => {
    expect(playerDay(utc(2026, 3, 2, 4, 59), TZ)).toBe("2026-03-01"); // 23:59 EST
    expect(playerDay(utc(2026, 3, 2, 5, 0), TZ)).toBe("2026-03-02");  // 00:00 EST
  });

  test("spring-forward moves the boundary in UTC terms but never skips a day", () => {
    // US DST begins 2026-03-08 07:00 UTC (02:00 EST becomes 03:00 EDT).
    expect(playerDay(utc(2026, 3, 8, 4, 30), TZ)).toBe("2026-03-07"); // 23:30 EST, the 7th
    expect(playerDay(utc(2026, 3, 8, 6, 30), TZ)).toBe("2026-03-08"); // 01:30 EST, the 8th
    expect(playerDay(utc(2026, 3, 8, 8, 0), TZ)).toBe("2026-03-08");  // 04:00 EDT, same day
    // The next midnight now arrives an hour earlier in UTC — and is still one day on.
    expect(playerDay(utc(2026, 3, 9, 3, 59), TZ)).toBe("2026-03-08"); // 23:59 EDT
    expect(playerDay(utc(2026, 3, 9, 4, 0), TZ)).toBe("2026-03-09");  // 00:00 EDT
  });

  test("shiftDay steps calendar dates, unaffected by DST or leap years", () => {
    expect(shiftDay("2026-03-02", -1)).toBe("2026-03-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-02-28", 2)).toBe("2026-03-02");
    expect(shiftDay("2026-03-09", -1)).toBe("2026-03-08"); // across spring-forward
    expect(shiftDay("2026-11-02", -1)).toBe("2026-11-01"); // across fall-back
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29");  // leap day
    expect(shiftDay("2025-12-31", 1)).toBe("2026-01-01");
  });
});

describe("counting solved problems", () => {
  test("only counts a problem once, however many times it is reported", () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, utc(2026, 3, 2), TZ);
    expect(recordDailySolve(db, "pax", "p1", utc(2026, 3, 2, 18), TZ).today).toBe(1);
    expect(recordDailySolve(db, "pax", "p1", utc(2026, 3, 2, 18), TZ).today).toBe(1);
    expect(recordDailySolve(db, "pax", "p2", utc(2026, 3, 2, 18), TZ).today).toBe(2);
    expect(dailyRecordState(db, "pax", utc(2026, 3, 2, 18), TZ).today).toBe(2);
  });

  test("buckets by the player's day, and keeps profiles separate", () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, utc(2026, 3, 1), TZ);
    recordDailySolve(db, "pax", "p1", utc(2026, 3, 2, 2), TZ);  // 21:00 Mar 1 in NY
    recordDailySolve(db, "pax", "p2", utc(2026, 3, 2, 18), TZ); // 13:00 Mar 2 in NY
    recordDailySolve(db, "sam", "p3", utc(2026, 3, 2, 18), TZ);

    const pax = dailyRecordState(db, "pax", utc(2026, 3, 2, 18), TZ);
    expect(pax.today).toBe(1);
    expect(pax.timeZone).toBe(TZ);
    expect(pax.stats.trackedSolves).toBe(2);
    expect(dailyRecordState(db, "sam", utc(2026, 3, 2, 18), TZ).stats.trackedSolves).toBe(1);
  });
});

describe("the record moment", () => {
  const solveMany = (db: Database, at: number, n: number, tag: string) => {
    let last;
    for (let i = 0; i < n; i++) last = recordDailySolve(db, "pax", `${tag}${i}`, at, TZ);
    return last!;
  };
  const day1 = utc(2026, 3, 1, 18);
  const day2 = utc(2026, 3, 2, 18);

  test("the first ever day never fires a record — there is nothing to beat yet", () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, day1, TZ);
    for (let i = 0; i < 20; i++) {
      const p = recordDailySolve(db, "pax", `p${i}`, day1, TZ);
      expect(p.newRecord).toBe(false);
      expect(p.eventId).toBeNull();
    }
    // …but the day is still fully counted, and it becomes the benchmark.
    expect(dailyRecordState(db, "pax", day1, TZ)).toMatchObject({
      today: 20, record: 20, recordDay: "2026-03-01", isRecord: true,
    });
  });

  test("ANY earlier positive record counts as a benchmark — even a one-problem day", () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, day1, TZ);
    solveMany(db, day1, 1, "a");
    const first = recordDailySolve(db, "pax", "b0", day2, TZ);
    expect(first).toMatchObject({ today: 1, previousRecord: 1, newRecord: false });
    const beats = recordDailySolve(db, "pax", "b1", day2, TZ);
    expect(beats).toMatchObject({ today: 2, previousRecord: 1, record: 2, newRecord: true });
    expect(beats.eventId).toBe(recordEventId("pax", "2026-03-02", 2));
  });

  test("breaking a record fires exactly once, on the answer that breaks it", () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, day1, TZ);
    solveMany(db, day1, 8, "a");

    const fired: number[] = [];
    for (let i = 0; i < 12; i++) {
      const p = recordDailySolve(db, "pax", `b${i}`, day2, TZ);
      if (p.newRecord) fired.push(p.today);
      // Re-report the SAME problem: nothing moves, nothing celebrates twice.
      const repeat = recordDailySolve(db, "pax", `b${i}`, day2, TZ);
      expect(repeat.newRecord).toBe(false);
      expect(repeat.today).toBe(p.today);
    }
    expect(fired).toEqual([9]); // the 9th answer cleared the 8-problem best
  });

  test("previousRecord is the bar to clear and excludes today", () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, day1, TZ);
    solveMany(db, day1, 8, "a");
    expect(solveMany(db, day2, 3, "b"))
      .toMatchObject({ today: 3, previousRecord: 8, record: 8, newRecord: false });
  });
});

describe("durable record celebrations", () => {
  const day1 = utc(2026, 3, 1, 18);
  const day2 = utc(2026, 3, 2, 18);
  const setup = () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, day1, TZ);
    for (let i = 0; i < 3; i++) recordDailySolve(db, "pax", `a${i}`, day1, TZ);
    for (let i = 0; i < 4; i++) recordDailySolve(db, "pax", `b${i}`, day2, TZ);
    return db;
  };

  test("the record event survives a lost response and keeps being offered", () => {
    const db = setup();
    const id = recordEventId("pax", "2026-03-02", 4);
    // Repeated reads (the client retrying after a dropped response) keep it.
    for (let i = 0; i < 3; i++) {
      expect(pendingRecordEvents(db, "pax", day2)).toEqual([
        { id, day: "2026-03-02", count: 4, previousRecord: 3 },
      ]);
    }
    expect(dailyRecordState(db, "pax", day2, TZ).pendingEvents).toHaveLength(1);
  });

  test("acknowledging retires it, and acknowledging again is harmless", () => {
    const db = setup();
    const id = recordEventId("pax", "2026-03-02", 4);
    acknowledgeRecordEvent(db, "pax", id, day2);
    expect(pendingRecordEvents(db, "pax", day2)).toEqual([]);
    acknowledgeRecordEvent(db, "pax", id, day2);
    acknowledgeRecordEvent(db, "pax", "never-existed", day2);
    expect(pendingRecordEvents(db, "pax", day2)).toEqual([]);
  });

  test("one profile cannot acknowledge another's celebration", () => {
    const db = setup();
    acknowledgeRecordEvent(db, "sam", recordEventId("pax", "2026-03-02", 4), day2);
    expect(pendingRecordEvents(db, "pax", day2)).toHaveLength(1);
    expect(pendingRecordEvents(db, "sam", day2)).toEqual([]);
  });

  test("a re-reported answer does not queue the party twice", () => {
    const db = setup();
    recordDailySolve(db, "pax", "b3", day2, TZ); // same problem again
    expect(pendingRecordEvents(db, "pax", day2)).toHaveLength(1);
  });

  test("an undelivered party goes stale instead of ambushing him days later", () => {
    const db = setup();
    expect(pendingRecordEvents(db, "pax", day2 + PENDING_EVENT_TTL_MS - 1000)).toHaveLength(1);
    expect(pendingRecordEvents(db, "pax", day2 + PENDING_EVENT_TTL_MS + 1000)).toEqual([]);
  });
});

describe("the stats view", () => {
  test("history is zero-filled, oldest first, and ends today", () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, utc(2026, 3, 1), TZ);
    recordDailySolve(db, "pax", "p1", utc(2026, 3, 1, 18), TZ);
    recordDailySolve(db, "pax", "p2", utc(2026, 3, 3, 18), TZ);
    const state = dailyRecordState(db, "pax", utc(2026, 3, 3, 18), TZ);
    expect(state.history).toHaveLength(HISTORY_DAYS);
    expect(state.history.at(-1)).toEqual({ day: "2026-03-03", count: 1 });
    expect(state.history.at(-2)).toEqual({ day: "2026-03-02", count: 0 }); // rest day
    expect(state.history.at(-3)).toEqual({ day: "2026-03-01", count: 1 });
  });

  test("summary stats cover the last 7 days, the best day, and the day streak", () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, utc(2026, 3, 1), TZ);
    for (let i = 0; i < 2; i++) recordDailySolve(db, "pax", `a${i}`, utc(2026, 3, 1, 18), TZ);
    for (let i = 0; i < 10; i++) recordDailySolve(db, "pax", `b${i}`, utc(2026, 3, 2, 18), TZ);
    for (let i = 0; i < 4; i++) recordDailySolve(db, "pax", `d${i}`, utc(2026, 3, 4, 18), TZ);

    const state = dailyRecordState(db, "pax", utc(2026, 3, 4, 18), TZ);
    expect(state).toMatchObject({ today: 4, record: 10, recordDay: "2026-03-02", isRecord: false });
    expect(state.stats).toMatchObject({
      last7Total: 16,
      last7Average: 2.3,
      bestDay: { day: "2026-03-02", count: 10 },
      daysPlayed: 3,
      trackedSolves: 16,
      currentStreakDays: 1, // the 3rd was a rest day, so today starts a new run
    });
  });

  test("an unplayed morning still shows yesterday's run intact", () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, utc(2026, 3, 1), TZ);
    for (const d of [1, 2, 3]) recordDailySolve(db, "pax", `p${d}`, utc(2026, 3, d, 18), TZ);
    const state = dailyRecordState(db, "pax", utc(2026, 3, 4, 12), TZ); // 07:00 in NY
    expect(state.today).toBe(0);
    expect(state.stats.currentStreakDays).toBe(3);
    expect(state.isRecord).toBe(false); // 0 today never reads as "record day"
  });

  test("an empty profile reads as all zeroes, not an error", () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, utc(2026, 3, 4), TZ);
    const state = dailyRecordState(db, "nobody", utc(2026, 3, 4), TZ);
    expect(state).toMatchObject({ today: 0, record: 0, recordDay: null, isRecord: false });
    expect(state.pendingEvents).toEqual([]);
    expect(state.stats).toMatchObject({
      last7Total: 0, last7Average: 0, bestDay: null, daysPlayed: 0,
      trackedSolves: 0, currentStreakDays: 0,
    });
  });
});

describe("migrating an existing database", () => {
  test("backfills what the attempt log can prove, deduped, correct-only", () => {
    const db = freshDb(true);
    ensureDailyRecordSchema(db, utc(2026, 3, 3, 18), TZ);
    const state = dailyRecordState(db, "pax", utc(2026, 3, 2, 18), TZ);
    expect(state).toMatchObject({ today: 6, record: 6, recordDay: "2026-03-02" });
    expect(state.stats).toMatchObject({ trackedSolves: 9, daysPlayed: 2 });
    expect(dailyRecordState(db, "other", utc(2026, 3, 2, 18), TZ).today).toBe(1);
  });

  test("declares completeness from TOMORROW — legacy retry solves are gone", () => {
    const db = freshDb(true);
    ensureDailyRecordSchema(db, utc(2026, 3, 3, 18), TZ); // Mar 3 in New York
    expect(trackingInfo(db)).toEqual({ completeSince: "2026-03-04", backfilled: true });
    expect(dailyRecordState(db, "pax", utc(2026, 3, 3, 18), TZ).tracking)
      .toEqual({ completeSince: "2026-03-04", backfilled: true });
  });

  test("a brand-new database has lost nothing: complete from day one", () => {
    const db = freshDb();
    ensureDailyRecordSchema(db, utc(2026, 3, 3, 18), TZ);
    expect(trackingInfo(db)).toEqual({ completeSince: "2026-03-03", backfilled: false });
  });

  test("legacy activity with no first-try correct row still discloses missing retry history", () => {
    const db = freshDb();
    db.query(
      `INSERT INTO attempts (profile_id, problem_id, correct, created_at) VALUES (?, ?, ?, ?)`,
    ).run("pax", "legacy-wrong-first", 0, utc(2026, 3, 1, 18));

    ensureDailyRecordSchema(db, utc(2026, 3, 3, 18), TZ);

    expect(trackingInfo(db)).toEqual({ completeSince: "2026-03-04", backfilled: true });
    expect(dailyRecordState(db, "pax", utc(2026, 3, 3, 18), TZ).stats.trackedSolves).toBe(0);
  });

  test("the backfill runs once — a restart never re-counts or wipes live rows", () => {
    const db = freshDb(true);
    ensureDailyRecordSchema(db, utc(2026, 3, 3, 18), TZ);
    recordDailySolve(db, "pax", "live-1", utc(2026, 3, 3, 18), TZ);
    ensureDailyRecordSchema(db, utc(2026, 3, 4, 18), TZ); // server restart, next day
    ensureDailyRecordSchema(db, utc(2026, 3, 5, 18), TZ);
    const state = dailyRecordState(db, "pax", utc(2026, 3, 3, 18), TZ);
    expect(state.stats.trackedSolves).toBe(10); // 9 backfilled + 1 live, no doubling
    expect(state.today).toBe(1);
    // The completeness marker is stamped once, at the FIRST migration.
    expect(trackingInfo(db).completeSince).toBe("2026-03-04");
  });

  test("an interrupted backfill is retried, not mistaken for a finished one", () => {
    const db = freshDb(true);
    // Simulate a crash midway: the tables exist and some rows landed, but the
    // transaction never committed its marker.
    db.exec(`CREATE TABLE IF NOT EXISTS daily_record_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.exec(`CREATE TABLE IF NOT EXISTS daily_solves (
      profile_id TEXT NOT NULL, problem_id TEXT NOT NULL, day TEXT NOT NULL,
      solved_at INTEGER NOT NULL, PRIMARY KEY (profile_id, problem_id))`);
    db.query(`INSERT INTO daily_solves (profile_id, problem_id, day, solved_at) VALUES (?, ?, ?, ?)`)
      .run("pax", "a0", "2026-03-01", utc(2026, 3, 1, 15));
    expect(trackingInfo(db).completeSince).toBeNull();

    // Table existence is NOT the marker: the next boot finishes the job.
    ensureDailyRecordSchema(db, utc(2026, 3, 3, 18), TZ);
    const state = dailyRecordState(db, "pax", utc(2026, 3, 2, 18), TZ);
    expect(state.stats.trackedSolves).toBe(9); // the partial row is not duplicated
    expect(trackingInfo(db)).toEqual({ completeSince: "2026-03-04", backfilled: true });
  });
});
