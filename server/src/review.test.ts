// server/src/review.test.ts
import { describe, expect, test } from "bun:test";
import { nextReview, DAY_MS } from "./review.ts";

const NOW = 1_750_000_000_000;

describe("nextReview", () => {
  test("first mastery starts at 1 day", () => {
    expect(nextReview(null, true, NOW)).toEqual({ intervalDays: 1, dueAt: NOW + DAY_MS, retired: false });
  });
  test("climbs the tighter ladder 1→2→3→5→8→13", () => {
    expect(nextReview(1, true, NOW).intervalDays).toBe(2);
    expect(nextReview(2, true, NOW).intervalDays).toBe(3);
    expect(nextReview(3, true, NOW).intervalDays).toBe(5);
    expect(nextReview(5, true, NOW).intervalDays).toBe(8);
    expect(nextReview(8, true, NOW).intervalDays).toBe(13);
  });
  test("interval caps at 13 days", () => {
    expect(nextReview(13, true, NOW).intervalDays).toBe(13);
    expect(nextReview(99, true, NOW).intervalDays).toBe(13);
  });
  test("wrong review resets to 1 day", () => {
    expect(nextReview(8, false, NOW)).toEqual({ intervalDays: 1, dueAt: NOW + DAY_MS, retired: false });
  });
  test("a foundational skill graduates out of review once it passes at the cap", () => {
    expect(nextReview(13, true, NOW, true)).toEqual({ intervalDays: 13, dueAt: null, retired: true });
    // still climbing → not yet retired
    expect(nextReview(8, true, NOW, true).retired).toBe(false);
    // a non-foundational topic keeps reviewing at the cap forever
    expect(nextReview(13, true, NOW, false).retired).toBe(false);
    expect(nextReview(13, true, NOW, false).dueAt).toBe(NOW + 13 * DAY_MS);
  });
});
