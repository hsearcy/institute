import { test, expect, describe } from "vitest";
import { z } from "zod";
import { validateParams } from "../src/validate.ts";
import type { Plugin } from "../src/contract.ts";

const ParamsZ = z.object({
  enemyType: z.enum(["goblin", "slime"]),
  hp: z.number().int().positive(),
});
type Params = z.infer<typeof ParamsZ>;

const plugin: Plugin<Params> = {
  manifest: { id: "x", title: "X", supportedSkills: ["s"], paramSchema: ParamsZ },
  Scene: () => null,
  evaluate: () => ({ correct: true, expected: 0, isLastStep: true }),
};

describe("validateParams", () => {
  test("returns ok with parsed value for valid input", () => {
    const r = validateParams(plugin, { enemyType: "goblin", hp: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ enemyType: "goblin", hp: 5 });
  });

  test("returns ok=false with ZodError for invalid input", () => {
    const r = validateParams(plugin, { enemyType: "dragon", hp: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(Error);
      expect(r.error.message).toMatch(/enemyType|hp/);
    }
  });

  test("strips unknown keys silently (Zod default behavior)", () => {
    const r = validateParams(plugin, { enemyType: "goblin", hp: 1, extra: "ignored" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { extra?: unknown }).extra).toBeUndefined();
  });

  test("rejects null / non-object input", () => {
    expect(validateParams(plugin, null).ok).toBe(false);
    expect(validateParams(plugin, "string").ok).toBe(false);
    expect(validateParams(plugin, undefined).ok).toBe(false);
  });
});
