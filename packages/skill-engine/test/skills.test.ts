import { test, expect, describe } from "vitest";
import { TAXONOMY } from "../src/skills.ts";
import { validateTaxonomy } from "../src/taxonomy-utils.ts";

describe("TAXONOMY", () => {
  test("contains at least 25 skills", () => {
    expect(TAXONOMY.length).toBeGreaterThanOrEqual(25);
  });

  test("all skill ids are unique", () => {
    const ids = TAXONOMY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every prereq references an existing skill", () => {
    const ids = new Set(TAXONOMY.map((s) => s.id));
    for (const skill of TAXONOMY) {
      for (const p of skill.prereqs) {
        expect(ids.has(p)).toBe(true);
      }
    }
  });

  test("validateTaxonomy returns ok=true with no errors", () => {
    const result = validateTaxonomy(TAXONOMY);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("validateTaxonomy detects a cycle", () => {
    const bad = [
      { id: "a", description: "a", prereqs: ["b"], difficultyBand: [0, 1] as const },
      { id: "b", description: "b", prereqs: ["a"], difficultyBand: [0, 1] as const },
    ];
    const result = validateTaxonomy(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  test("validateTaxonomy detects difficultyBand inversion", () => {
    const bad = [
      { id: "a", description: "a", prereqs: [], difficultyBand: [0.8, 0.2] as const },
    ];
    const result = validateTaxonomy(bad);
    expect(result.ok).toBe(false);
  });
});
