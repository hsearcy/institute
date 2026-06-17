import { test, expect, describe } from "vitest";
import { evaluate } from "../src/evaluate.ts";
import type { CookieShareParams } from "../src/manifest.ts";

const params: CookieShareParams = {
  rounds: [
    { cookies: 6, friends: 3, answer: 2 },
    { cookies: 8, friends: 2, answer: 4 },
    { cookies: 9, friends: 3, answer: 3 },
  ],
  intro: "x",
  sequence: [2, 4, 3],
};

describe("evaluate", () => {
  test("step 0, answer 2 is correct", () => {
    expect(evaluate(params, 0, 2)).toEqual({ correct: true, expected: 2, isLastStep: false });
  });

  test("step 0, answer 3 is wrong", () => {
    expect(evaluate(params, 0, 3)).toEqual({ correct: false, expected: 2, isLastStep: false });
  });

  test("last step is flagged", () => {
    expect(evaluate(params, 2, 3)).toEqual({ correct: true, expected: 3, isLastStep: true });
  });

  test("out-of-range step throws", () => {
    expect(() => evaluate(params, 3, 0)).toThrow(/step/i);
    expect(() => evaluate(params, -1, 0)).toThrow(/step/i);
  });

  test("single-round params: step 0 is also the last step", () => {
    const single: CookieShareParams = {
      rounds: [{ cookies: 10, friends: 5, answer: 2 }],
      intro: "x",
      sequence: [2],
    };
    expect(evaluate(single, 0, 2)).toEqual({ correct: true, expected: 2, isLastStep: true });
  });
});
