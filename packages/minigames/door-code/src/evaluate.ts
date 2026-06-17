import type { EvaluateResult } from "@institute/plugin-engine";
import type { DoorCodeParams } from "./manifest.ts";

export function evaluate(
  params: DoorCodeParams,
  step: number,
  answer: number,
): EvaluateResult {
  if (step < 0 || step >= params.problems.length) {
    throw new Error(`door-code.evaluate: step ${step} out of range [0, ${params.problems.length - 1}]`);
  }
  const expected = params.problems[step]!.answer;
  return {
    correct: answer === expected,
    expected,
    isLastStep: step === params.problems.length - 1,
  };
}
