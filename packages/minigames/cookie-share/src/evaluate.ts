import type { EvaluateResult } from "@institute/plugin-engine";
import type { CookieShareParams } from "./manifest.ts";

export function evaluate(
  params: CookieShareParams,
  step: number,
  answer: number,
): EvaluateResult {
  if (step < 0 || step >= params.rounds.length) {
    throw new Error(`cookie-share.evaluate: step ${step} out of range [0, ${params.rounds.length - 1}]`);
  }
  const expected = params.rounds[step]!.answer;
  return {
    correct: answer === expected,
    expected,
    isLastStep: step === params.rounds.length - 1,
  };
}
