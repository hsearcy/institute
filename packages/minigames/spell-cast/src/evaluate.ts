import type { EvaluateResult } from "@institute/plugin-engine";
import type { SpellCastParams } from "./manifest.ts";

export function evaluate(
  params: SpellCastParams,
  step: number,
  answer: number,
): EvaluateResult {
  if (step < 0 || step >= params.sequence.length) {
    throw new Error(`spell-cast.evaluate: step ${step} out of range [0, ${params.sequence.length - 1}]`);
  }
  const expected = params.sequence[step]!;
  return {
    correct: answer === expected,
    expected,
    isLastStep: step === params.sequence.length - 1,
  };
}
