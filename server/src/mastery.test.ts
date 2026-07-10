// server/src/mastery.test.ts
import { describe, expect, test } from "bun:test";
import { topicState, median } from "./mastery.ts";

describe("median", () => {
  test("odd/even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(Infinity); // no data ⇒ never passes a fluency bar
  });
});

describe("topicState", () => {
  test("needs ≥8 attempts and ≥85% accuracy", () => {
    expect(topicState({ attempts: 7, correct: 7, recentSolveMs: [], fluentMs: null })).toBe("practicing");
    expect(topicState({ attempts: 8, correct: 6, recentSolveMs: [], fluentMs: null })).toBe("practicing");
    expect(topicState({ attempts: 8, correct: 7, recentSolveMs: [], fluentMs: null })).toBe("mastered");
  });
  test("fluency topics also need fast median solves", () => {
    const slow = { attempts: 10, correct: 10, recentSolveMs: [9000, 8000, 7000], fluentMs: 6000 };
    expect(topicState(slow)).toBe("practicing");
    const fast = { ...slow, recentSolveMs: [3000, 5000, 4000] };
    expect(topicState(fast)).toBe("mastered");
  });
});
