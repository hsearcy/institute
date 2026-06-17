import { test, expect, describe } from "vitest";
import { evaluate } from "../src/evaluate.ts";
import type { BlockTowerParams } from "../src/manifest.ts";

const params: BlockTowerParams = {
  problems: [
    { a: 3, b: 4, answer: 7 },
    { a: 5, b: 5, answer: 10 },
    { a: 6, b: 7, answer: 13 },
  ],
  intro: "x",
  sequence: [7, 10, 13],
};

describe("evaluate", () => {
  test("step 0, answer 7 is correct", () => {
    expect(evaluate(params, 0, 7)).toEqual({ correct: true, expected: 7, isLastStep: false });
  });

  test("step 0, answer 8 is wrong (off-by-one)", () => {
    expect(evaluate(params, 0, 8)).toEqual({ correct: false, expected: 7, isLastStep: false });
  });

  test("last step is flagged", () => {
    expect(evaluate(params, 2, 13)).toEqual({ correct: true, expected: 13, isLastStep: true });
  });

  test("out-of-range step throws", () => {
    expect(() => evaluate(params, 3, 0)).toThrow(/step/i);
    expect(() => evaluate(params, -1, 0)).toThrow(/step/i);
  });

  test("single-problem round: step 0 is also the last step", () => {
    const single: BlockTowerParams = {
      problems: [{ a: 2, b: 5, answer: 7 }],
      intro: "x",
      sequence: [7],
    };
    expect(evaluate(single, 0, 7)).toEqual({ correct: true, expected: 7, isLastStep: true });
  });
});
