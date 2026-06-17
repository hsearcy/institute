import { test, expect, describe } from "vitest";
import { evaluate } from "../src/evaluate.ts";
import type { DoorCodeParams } from "../src/manifest.ts";

const params: DoorCodeParams = {
  problems: [
    { kind: "sub", a: 10, b: 4, answer: 6 },
    { kind: "sub", a: 8, b: 3, answer: 5 },
    { kind: "missing_addend", a: 7, b: 10, answer: 3 },
  ],
  intro: "x",
  sequence: [6, 5, 3],
};

describe("evaluate", () => {
  test("step 0, answer 6 is correct", () => {
    expect(evaluate(params, 0, 6)).toEqual({ correct: true, expected: 6, isLastStep: false });
  });

  test("step 0, answer 4 is wrong", () => {
    expect(evaluate(params, 0, 4)).toEqual({ correct: false, expected: 6, isLastStep: false });
  });

  test("missing_addend step (7 + ? = 10) expects 3", () => {
    expect(evaluate(params, 2, 3)).toEqual({ correct: true, expected: 3, isLastStep: true });
  });

  test("last step is flagged", () => {
    expect(evaluate(params, 2, 3)).toEqual({ correct: true, expected: 3, isLastStep: true });
  });

  test("out-of-range step throws", () => {
    expect(() => evaluate(params, 3, 0)).toThrow(/step/i);
    expect(() => evaluate(params, -1, 0)).toThrow(/step/i);
  });

  test("single-problem round: step 0 is also the last step", () => {
    const single: DoorCodeParams = {
      problems: [{ kind: "sub", a: 9, b: 2, answer: 7 }],
      intro: "x",
      sequence: [7],
    };
    expect(evaluate(single, 0, 7)).toEqual({ correct: true, expected: 7, isLastStep: true });
  });
});
