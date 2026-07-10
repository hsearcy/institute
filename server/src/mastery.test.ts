// server/src/mastery.test.ts
import { describe, expect, test } from "bun:test";
import { topicState, median, type TopicSignals } from "./mastery.ts";

const sig = (over: Partial<TopicSignals>): TopicSignals => ({
  lifetimeAttempts: 0, recentResults: [], lifetimeRatio: 0, recentSolveMs: [], fluentMs: null, ...over,
});

describe("median", () => {
  test("odd/even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(Infinity); // no data ⇒ never passes a fluency bar
  });
});

describe("topicState", () => {
  test("needs ≥8 lifetime attempts and ≥85% recent accuracy", () => {
    expect(topicState(sig({ lifetimeAttempts: 7, recentResults: Array(7).fill(true), lifetimeRatio: 1 }))).toBe("practicing");
    expect(topicState(sig({ lifetimeAttempts: 8, recentResults: [...Array(6).fill(true), false, false], lifetimeRatio: 0.75 }))).toBe("practicing");
    expect(topicState(sig({ lifetimeAttempts: 8, recentResults: [...Array(7).fill(true), false], lifetimeRatio: 0.875 }))).toBe("mastered");
  });
  test("fluency topics also need fast median solves", () => {
    const base = { lifetimeAttempts: 10, recentResults: Array(10).fill(true), lifetimeRatio: 1, fluentMs: 6000 };
    expect(topicState(sig({ ...base, recentSolveMs: [9000, 8000, 7000] }))).toBe("practicing");
    expect(topicState(sig({ ...base, recentSolveMs: [3000, 5000, 4000] }))).toBe("mastered");
  });
  test("windowed accuracy demotes after two recent misses", () => {
    const twelve = [...Array(10).fill(true), false, false]; // 10/12 = 83%
    expect(topicState(sig({ lifetimeAttempts: 40, recentResults: twelve, lifetimeRatio: 0.95 }))).toBe("practicing");
  });
  test("one recent miss does not demote", () => {
    const twelve = [...Array(11).fill(true), false]; // 11/12 = 92%
    expect(topicState(sig({ lifetimeAttempts: 40, recentResults: twelve, lifetimeRatio: 0.95 }))).toBe("mastered");
  });
  test("legacy grants (no attempt rows) use lifetime ratio", () => {
    expect(topicState(sig({ lifetimeAttempts: 8, recentResults: [], lifetimeRatio: 1 }))).toBe("mastered");
    expect(topicState(sig({ lifetimeAttempts: 8, recentResults: [], lifetimeRatio: 0.75 }))).toBe("practicing");
  });
});
