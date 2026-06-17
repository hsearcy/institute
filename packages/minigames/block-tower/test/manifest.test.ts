import { test, expect, describe } from "vitest";
import { manifest, BlockTowerParams, fixtureParams } from "../src/manifest.ts";

describe("block-tower manifest", () => {
  test("id is 'block-tower'", () => {
    expect(manifest.id).toBe("block-tower");
  });

  test("title is human-readable", () => {
    expect(manifest.title).toBe("Block Tower");
  });

  test("supportedSkills are the addition skills", () => {
    expect(manifest.supportedSkills).toEqual(
      expect.arrayContaining(["add_within_10", "add_within_20", "sums_to_n"]),
    );
  });

  test("paramSchema accepts a valid round", () => {
    const r = BlockTowerParams.safeParse({
      problems: [
        { a: 3, b: 4, answer: 7 },
        { a: 5, b: 5, answer: 10 },
      ],
      intro: "Build a tower!",
      sequence: [7, 10],
    });
    expect(r.success).toBe(true);
  });

  test("fixtureParams is valid", () => {
    expect(BlockTowerParams.safeParse(fixtureParams).success).toBe(true);
  });

  test("paramSchema rejects empty problems", () => {
    const r = BlockTowerParams.safeParse({
      problems: [],
      intro: "x",
      sequence: [1],
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects empty intro", () => {
    const r = BlockTowerParams.safeParse({
      problems: [{ a: 1, b: 1, answer: 2 }],
      intro: "",
      sequence: [2],
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects empty sequence", () => {
    const r = BlockTowerParams.safeParse({
      problems: [{ a: 1, b: 1, answer: 2 }],
      intro: "x",
      sequence: [],
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects non-integer addends", () => {
    const r = BlockTowerParams.safeParse({
      problems: [{ a: 1.5, b: 1, answer: 2 }],
      intro: "x",
      sequence: [2],
    });
    expect(r.success).toBe(false);
  });
});
