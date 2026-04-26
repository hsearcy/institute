import { test, expect, describe } from "vitest";
import { scheduleNextReview, MAX_INTERVAL_DAYS } from "../src/srs.ts";
import { initialSkillState } from "../src/mastery.ts";

const day = (n: number) => 1000 * 60 * 60 * 24 * n;

describe("scheduleNextReview", () => {
  test("first correct schedules 1 day out", () => {
    const s = initialSkillState("p1", "add_within_5");
    const now = new Date("2026-04-25T10:00:00Z");
    const r = scheduleNextReview(s, { skillId: "skip_count_2", correct: true, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r.srsInterval).toBe(1);
    expect(r.nextReviewAt.getTime()).toBe(now.getTime() + day(1));
    expect(r.srsEase).toBeGreaterThanOrEqual(2.5);
  });

  test("second correct (after interval=1) schedules 2 days out", () => {
    const now = new Date("2026-04-25T10:00:00Z");
    const s = { ...initialSkillState("p1", "add_within_5"), srsInterval: 1, srsEase: 2.5 };
    const r = scheduleNextReview(s, { skillId: "skip_count_2", correct: true, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r.srsInterval).toBe(2);
  });

  test("third correct multiplies by ease (rounded)", () => {
    const now = new Date("2026-04-25T10:00:00Z");
    const s = { ...initialSkillState("p1", "add_within_5"), srsInterval: 2, srsEase: 2.5 };
    const r = scheduleNextReview(s, { skillId: "skip_count_2", correct: true, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r.srsInterval).toBe(5); // round(2 * 2.5)
  });

  test("wrong resets interval to 1 and lowers ease", () => {
    const now = new Date("2026-04-25T10:00:00Z");
    const s = { ...initialSkillState("p1", "add_within_5"), srsInterval: 8, srsEase: 2.5 };
    const r = scheduleNextReview(s, { skillId: "skip_count_2", correct: false, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r.srsInterval).toBe(1);
    expect(r.srsEase).toBeLessThan(2.5);
    expect(r.srsEase).toBeGreaterThanOrEqual(1.3);
  });

  test("ease is bounded at 1.3 (floor) and 2.8 (ceiling)", () => {
    const now = new Date("2026-04-25T10:00:00Z");
    let s = { ...initialSkillState("p1", "x"), srsInterval: 1, srsEase: 1.3 };
    const r1 = scheduleNextReview(s, { skillId: "skip_count_2", correct: false, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r1.srsEase).toBe(1.3);

    s = { ...initialSkillState("p1", "x"), srsInterval: 1, srsEase: 2.8 };
    const r2 = scheduleNextReview(s, { skillId: "skip_count_2", correct: true, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r2.srsEase).toBe(2.8);
  });

  test("interval is capped at MAX_INTERVAL_DAYS", () => {
    const now = new Date("2026-04-25T10:00:00Z");
    const s = { ...initialSkillState("p1", "x"), srsInterval: 30, srsEase: 2.5 };
    const r = scheduleNextReview(s, { skillId: "skip_count_2", correct: true, hinted: false, scaffolded: false, difficulty: 0.2, occurredAt: now }, now);
    expect(r.srsInterval).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
  });
});
