import { test, expect, describe } from "vitest";
import { manifest, SpellCastParams } from "../src/manifest.ts";

describe("spell-cast manifest", () => {
  test("id is 'spell-cast'", () => {
    expect(manifest.id).toBe("spell-cast");
  });

  test("title is human-readable", () => {
    expect(manifest.title).toBe("Spell Cast");
  });

  test("supportedSkills includes skip-counting + sequence_next", () => {
    expect(manifest.supportedSkills).toEqual(
      expect.arrayContaining(["skip_count_2", "skip_count_5", "skip_count_10", "sequence_next"]),
    );
  });

  test("paramSchema accepts a valid round", () => {
    const r = SpellCastParams.safeParse({
      enemyType: "goblin",
      sequence: [2, 4, 6, 8, 10],
      intro: "A goblin appears!",
    });
    expect(r.success).toBe(true);
  });

  test("paramSchema rejects unknown enemyType", () => {
    const r = SpellCastParams.safeParse({
      enemyType: "dragon",
      sequence: [1],
      intro: "x",
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects empty sequence", () => {
    const r = SpellCastParams.safeParse({
      enemyType: "goblin",
      sequence: [],
      intro: "x",
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects empty intro", () => {
    const r = SpellCastParams.safeParse({
      enemyType: "goblin",
      sequence: [1, 2],
      intro: "",
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects negative numbers in sequence", () => {
    const r = SpellCastParams.safeParse({
      enemyType: "goblin",
      sequence: [-1, 0, 1],
      intro: "x",
    });
    expect(r.success).toBe(false);
  });
});
