import { describe, expect, test } from "bun:test";
import type { DailyRecord } from "@institute/shared";
import {
  CHART_DAYS,
  chartBars,
  countPhrase,
  dayLabel,
  dayTick,
  encouragement,
  statTiles,
  trackingNote,
} from "../src/rpg/dailyStats";

const history = (counts: number[], lastDay = "2026-08-08") => {
  const [y, m, d] = lastDay.split("-").map(Number);
  return counts.map((count, i) => {
    const date = new Date(y, m - 1, d - (counts.length - 1 - i), 12);
    const p = (n: number) => String(n).padStart(2, "0");
    return { day: `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`, count };
  });
};

const record = (over: Partial<DailyRecord> = {}): DailyRecord => ({
  day: "2026-08-08",
  timeZone: "America/New_York",
  today: 6,
  record: 14,
  recordDay: "2026-08-05",
  isRecord: false,
  history: history([2, 0, 9, 14, 3, 5, 6]),
  stats: {
    last7Total: 39, last7Average: 5.6, bestDay: { day: "2026-08-05", count: 14 },
    daysPlayed: 6, trackedSolves: 120, currentStreakDays: 4,
  },
  tracking: { completeSince: "2026-07-30", backfilled: false },
  pendingEvents: [],
  ...over,
});

describe("day formatting", () => {
  test("labels a day in words, not just a colour or a number", () => {
    expect(dayLabel("2026-08-08")).toBe("Saturday 8 Aug");
    expect(dayTick("2026-08-08")).toBe("8");
  });

  test("counts are phrased, including the empty day", () => {
    expect(countPhrase(0)).toBe("no problems");
    expect(countPhrase(1)).toBe("1 right");
    expect(countPhrase(12)).toBe("12 right");
  });
});

describe("the graph bars", () => {
  test("scale to the tallest day in view, oldest first", () => {
    const bars = chartBars(history([2, 0, 9, 14, 3, 5, 6]), "2026-08-08", "2026-08-05");
    expect(bars).toHaveLength(7);
    expect(bars.at(-1)!.day).toBe("2026-08-08");
    expect(bars.find((b) => b.count === 14)!.heightPct).toBe(100);
    expect(bars.find((b) => b.count === 7)).toBeUndefined();
    expect(bars.find((b) => b.count === 9)!.heightPct).toBe(64);
  });

  test("a rest day is flat and a tiny day is still visible", () => {
    const bars = chartBars(history([0, 1, 40]), "2026-08-08", "2026-08-08");
    expect(bars[0].heightPct).toBe(0);
    expect(bars[1].heightPct).toBeGreaterThanOrEqual(7); // 1/40 would round to 3% and vanish
    expect(bars[2].heightPct).toBe(100);
  });

  test("today and the record day are labelled in text, never by colour alone", () => {
    const bars = chartBars(history([9, 14, 6]), "2026-08-08", "2026-08-07");
    expect(bars.at(-1)).toMatchObject({ isToday: true, isRecord: false });
    expect(bars.at(-1)!.label).toBe("Saturday 8 Aug (today): 6 right");
    expect(bars.at(-2)).toMatchObject({ isToday: false, isRecord: true });
    expect(bars.at(-2)!.label).toBe("Friday 7 Aug (best day): 14 right");
    expect(bars[0].label).toBe("Thursday 6 Aug: 9 right");
  });

  test("shows at most CHART_DAYS days, keeping the most recent", () => {
    const bars = chartBars(history(Array.from({ length: 30 }, (_, i) => i)), "2026-08-08", null);
    expect(bars).toHaveLength(CHART_DAYS);
    expect(bars.at(-1)!.day).toBe("2026-08-08");
    expect(bars.at(-1)!.count).toBe(29);
  });

  test("a brand-new profile renders flat bars instead of dividing by zero", () => {
    const bars = chartBars(history([0, 0, 0]), "2026-08-08", null);
    expect(bars.map((b) => b.heightPct)).toEqual([0, 0, 0]);
  });
});

describe("the summary tiles", () => {
  test("cover today, the record, the week, and the lifetime totals", () => {
    const tiles = statTiles(record());
    expect(tiles.map((t) => t.key)).toEqual(["today", "record", "week", "streak", "played", "lifetime"]);
    expect(tiles[0]).toMatchObject({ value: "6", hint: "Saturday 8 Aug" });
    expect(tiles[1]).toMatchObject({ label: "Best day ever", value: "14", hint: "Wednesday 5 Aug" });
    expect(tiles[2]).toMatchObject({ value: "39", hint: "5.6 a day on average" });
    expect(tiles[3]).toMatchObject({ value: "4" });
    // Named for what it is: what we counted, not a claimed complete history.
    expect(tiles[5]).toMatchObject({ label: "Tracked solves", value: "120" });
  });

  test("an untouched record reads as 'not set yet', not as a zero date", () => {
    const tiles = statTiles(record({ today: 0, record: 0, recordDay: null, isRecord: false }));
    expect(tiles[1].hint).toBe("Not set yet");
  });

  test("today's tile calls out a record day", () => {
    const tiles = statTiles(record({ today: 15, record: 15, recordDay: "2026-08-08", isRecord: true }));
    expect(tiles[0].hint).toBe("Your best day ever!");
  });
});

describe("the encouraging line", () => {
  test("invites a first solve before there is any record", () => {
    expect(encouragement(record({ today: 0, record: 0, recordDay: null })))
      .toBe("Solve your first problem to start the record!");
  });

  test("counts exactly how many more beat the record", () => {
    expect(encouragement(record({ today: 6, record: 14 })))
      .toBe("6 today. 9 more beats your record of 14!");
  });

  test("celebrates while he is on a record day", () => {
    expect(encouragement(record({ today: 15, record: 15, isRecord: true })))
      .toBe("15 today, that is your best day EVER!");
  });

  test("a fresh morning points at the record to chase", () => {
    expect(encouragement(record({ today: 0, record: 14, isRecord: false })))
      .toBe("Your record is 14 in one day. Ready to chase it?");
  });
});

describe("the tracking small print", () => {
  test("stays quiet when nothing was ever lost", () => {
    expect(trackingNote({ completeSince: "2026-07-30", backfilled: false })).toBeNull();
    expect(trackingNote({ completeSince: null, backfilled: false })).toBeNull();
  });

  test("says plainly what the rebuilt days can be missing", () => {
    const note = trackingNote({ completeSince: "2026-07-30", backfilled: true })!;
    expect(note).toContain("Thursday 30 Jul");
    expect(note).toContain("second try");
    // No claim of a perfect lifetime history.
    expect(note).not.toContain("every problem you have ever");
  });

  test("cannot name a date it does not have", () => {
    expect(trackingNote({ completeSince: null, backfilled: true })).toBeNull();
  });
});
