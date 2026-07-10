// server/src/review.test.ts
import { describe, expect, test } from "bun:test";
import { nextReview, DAY_MS } from "./review.ts";

const NOW = 1_750_000_000_000;

describe("nextReview", () => {
  test("first mastery starts at 1 day", () => {
    expect(nextReview(null, true, NOW)).toEqual({ intervalDays: 1, dueAt: NOW + DAY_MS });
  });
  test("correct review doubles the interval", () => {
    expect(nextReview(4, true, NOW)).toEqual({ intervalDays: 8, dueAt: NOW + 8 * DAY_MS });
  });
  test("interval caps at 30 days", () => {
    expect(nextReview(20, true, NOW).intervalDays).toBe(30);
  });
  test("wrong review resets to 1 day", () => {
    expect(nextReview(16, false, NOW)).toEqual({ intervalDays: 1, dueAt: NOW + DAY_MS });
  });
});
