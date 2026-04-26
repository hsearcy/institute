import { test, expect, describe } from "vitest";
import { evaluate } from "../src/evaluate.ts";
import type { SpellCastParams } from "../src/manifest.ts";

const params: SpellCastParams = {
  enemyType: "goblin",
  sequence: [2, 4, 6, 8, 10],
  intro: "x",
};

describe("evaluate", () => {
  test("step 0, answer 2 is correct", () => {
    expect(evaluate(params, 0, 2)).toEqual({ correct: true, expected: 2, isLastStep: false });
  });

  test("step 0, answer 4 is wrong (off-by-one)", () => {
    expect(evaluate(params, 0, 4)).toEqual({ correct: false, expected: 2, isLastStep: false });
  });

  test("last step is flagged", () => {
    expect(evaluate(params, 4, 10)).toEqual({ correct: true, expected: 10, isLastStep: true });
  });

  test("out-of-range step throws", () => {
    expect(() => evaluate(params, 5, 0)).toThrow(/step/i);
    expect(() => evaluate(params, -1, 0)).toThrow(/step/i);
  });

  test("single-element sequence: step 0 is also the last step", () => {
    const single: SpellCastParams = { enemyType: "slime", sequence: [7], intro: "x" };
    expect(evaluate(single, 0, 7)).toEqual({ correct: true, expected: 7, isLastStep: true });
  });
});
