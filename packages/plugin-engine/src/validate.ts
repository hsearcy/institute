import type { Plugin } from "./contract.ts";

export type ValidateResult<P> =
  | { ok: true; value: P }
  | { ok: false; error: Error };

export function validateParams<P>(
  plugin: Plugin<P>,
  candidate: unknown,
): ValidateResult<P> {
  const parsed = plugin.manifest.paramSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: new Error(parsed.error.message) };
}
