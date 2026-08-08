// Pure shaping for the daily-record panel: bar geometry, labels, summary tiles,
// and the "how close am I?" line. No DOM here, so it is unit-testable and the
// graph stays a handful of divs (no chart library in a 6-year-old's game).
import type { DailyCount, DailyRecord, DailyRecordEvent, DailyTracking } from '@institute/shared';

/** Days shown in the graph. Two weeks reads well even on a phone. */
export const CHART_DAYS = 14;
/** A day with any solves is never invisible, however big the record is. */
const MIN_BAR_PCT = 7;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "2026-08-03" → a local Date at midday (never trips over a DST boundary). */
function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** The tick printed under a bar: the day of the month. */
export function dayTick(day: string): string {
  return String(parseDay(day).getDate());
}

/** "Monday 3 Aug" — the readable form, used in labels and the record caption. */
export function dayLabel(day: string): string {
  const d = parseDay(day);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "12 right" / "1 right" / "no problems" — always words, never colour alone. */
export function countPhrase(count: number): string {
  if (count === 0) return 'no problems';
  return `${count} right`;
}

export type Bar = {
  day: string;
  count: number;
  /** Bar height as a percentage of the tallest day in view. */
  heightPct: number;
  /** Short tick under the bar. */
  tick: string;
  /** The full text a screen reader (or a curious grown-up) gets. */
  label: string;
  isToday: boolean;
  isRecord: boolean;
};

/** The last `days` days of history as bars, oldest → newest. Heights are relative
 *  to the tallest bar IN VIEW so a good week still fills the chart. */
export function chartBars(
  history: DailyCount[],
  today: string,
  recordDay: string | null,
  days = CHART_DAYS,
): Bar[] {
  const window = history.slice(-days);
  const tallest = window.reduce((max, d) => Math.max(max, d.count), 0);
  return window.map((d) => {
    const isToday = d.day === today;
    const isRecord = d.count > 0 && d.day === recordDay;
    const tags = [isToday ? 'today' : '', isRecord ? 'best day' : ''].filter(Boolean).join(', ');
    return {
      day: d.day,
      count: d.count,
      heightPct: d.count === 0 ? 0 : Math.max(MIN_BAR_PCT, Math.round((d.count / tallest) * 100)),
      tick: dayTick(d.day),
      label: `${dayLabel(d.day)}${tags ? ` (${tags})` : ''}: ${countPhrase(d.count)}`,
      isToday,
      isRecord,
    };
  });
}

export type StatTile = { key: string; label: string; value: string; hint: string };

/** The summary numbers under the graph. Every tile carries its own words. */
export function statTiles(daily: DailyRecord): StatTile[] {
  const { stats } = daily;
  return [
    {
      key: 'today',
      label: 'Right today',
      value: String(daily.today),
      hint: daily.isRecord && daily.today > 0 ? 'Your best day ever!' : dayLabel(daily.day),
    },
    {
      key: 'record',
      label: 'Best day ever',
      value: String(daily.record),
      hint: daily.recordDay ? dayLabel(daily.recordDay) : 'Not set yet',
    },
    {
      key: 'week',
      label: 'Last 7 days',
      value: String(stats.last7Total),
      hint: `${stats.last7Average} a day on average`,
    },
    {
      key: 'streak',
      label: 'Days in a row',
      value: String(stats.currentStreakDays),
      hint: stats.currentStreakDays > 0 ? 'Keep it going!' : 'Solve one to start a run',
    },
    {
      key: 'played',
      label: 'Days played',
      value: String(stats.daysPlayed),
      hint: 'Days you mined at least one gem',
    },
    {
      key: 'lifetime',
      // "Tracked", not "ever": solves from before the counter existed that were
      // only got right on a retry were never recorded and cannot be recovered.
      label: 'Tracked solves',
      value: String(stats.trackedSolves),
      hint: 'Every problem we have counted',
    },
  ];
}

/** The honest small print, or null when there is nothing to disclose (a profile
 *  whose counting has been complete from its very first day). */
export function trackingNote(tracking: DailyTracking): string | null {
  if (!tracking.backfilled || !tracking.completeSince) return null;
  return `Every answer has been counted since ${dayLabel(tracking.completeSince)}. `
    + 'Days before that were rebuilt from your old answers, so a few problems you '
    + 'got right on a second try are missing.';
}

/** The one warm line at the top of the panel. */
export function encouragement(daily: DailyRecord): string {
  if (daily.record === 0) return 'Mine your first gem to start the record!';
  if (daily.today === 0) return `Your record is ${daily.record} in one day. Ready to chase it?`;
  if (daily.isRecord) return `${daily.today} today — that is your best day EVER!`;
  const togo = daily.record - daily.today + 1;
  return `${daily.today} today. ${togo} more beats your record of ${daily.record}!`;
}

/** The HUD chip's accessible name — both numbers spelled out, plus what a tap
 *  does. Takes anything carrying the two counts (state payload or answer delta). */
export function chipLabel(counts: { today: number; record: number } | null): string {
  const today = counts?.today ?? 0;
  const record = counts?.record ?? 0;
  return `Right today: ${today}. Best day ever: ${record}. Tap to see your stats.`;
}

// ---- Record celebrations: at-least-once delivery, shown-once display --------
//
// The server keeps a record moment queued until the client acknowledges it, so a
// dropped response or a reload mid-party still gets its celebration. Delivery is
// therefore at-LEAST-once. What makes the VISIBLE result once is this: every
// event carries a stable id, and ids already shown are remembered locally. The
// only way to see one twice is to clear browser storage before the
// acknowledgement lands — a deliberate trade against silently losing the moment.

/** How many shown ids to remember. Comfortably more than a record streak. */
export const PRESENTED_EVENT_MEMORY = 40;

/** Events that still deserve a celebration, in server order. */
export function unpresentedEvents(
  events: readonly DailyRecordEvent[],
  presentedIds: readonly string[],
): DailyRecordEvent[] {
  const seen = new Set(presentedIds);
  const fresh: DailyRecordEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id); // a duplicate inside one payload is still one party
    fresh.push(e);
  }
  return fresh;
}

/** Add an id to the shown list, newest last, oldest evicted past the cap. */
export function rememberPresented(
  presentedIds: readonly string[],
  id: string,
  cap = PRESENTED_EVENT_MEMORY,
): string[] {
  const kept = presentedIds.filter((existing) => existing !== id);
  kept.push(id);
  return kept.slice(-cap);
}

/** Where Tab should land inside a modal, so focus never escapes to the game
 *  behind it. `current` is -1 when focus is somewhere outside the trap. */
export function focusTrapIndex(count: number, current: number, shiftKey: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return shiftKey ? count - 1 : 0;
  return shiftKey ? (current - 1 + count) % count : (current + 1) % count;
}
