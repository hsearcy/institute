import type { EvaluateResult } from "@institute/plugin-engine";
import type { BlockTowerParams } from "./manifest.ts";

export function evaluate(
  params: BlockTowerParams,
  step: number,
  answer: number,
): EvaluateResult {
  if (step < 0 || step >= params.problems.length) {
    throw new Error(`block-tower.evaluate: step ${step} out of range [0, ${params.problems.length - 1}]`);
  }
  const expected = params.problems[step]!.answer;
  return {
    correct: answer === expected,
    expected,
    isLastStep: step === params.problems.length - 1,
  };
}
