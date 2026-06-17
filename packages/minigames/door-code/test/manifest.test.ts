import { test, expect, describe } from "vitest";
import { manifest, DoorCodeParams } from "../src/manifest.ts";

describe("door-code manifest", () => {
  test("id is 'door-code'", () => {
    expect(manifest.id).toBe("door-code");
  });

  test("title is human-readable", () => {
    expect(manifest.title).toBe("Door Code");
  });

  test("supportedSkills includes subtraction + missing_addend", () => {
    expect(manifest.supportedSkills).toEqual(
      expect.arrayContaining(["sub_within_10", "sub_within_20", "missing_addend"]),
    );
  });

  test("paramSchema accepts a valid round", () => {
    const r = DoorCodeParams.safeParse({
      problems: [
        { kind: "sub", a: 10, b: 4, answer: 6 },
        { kind: "missing_addend", a: 7, b: 10, answer: 3 },
      ],
      intro: "The treasure door is locked!",
      sequence: [6, 3],
    });
    expect(r.success).toBe(true);
  });

  test("paramSchema rejects unknown problem kind", () => {
    const r = DoorCodeParams.safeParse({
      problems: [{ kind: "add", a: 1, b: 2, answer: 3 }],
      intro: "x",
      sequence: [3],
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects empty problems", () => {
    const r = DoorCodeParams.safeParse({
      problems: [],
      intro: "x",
      sequence: [1],
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects empty intro", () => {
    const r = DoorCodeParams.safeParse({
      problems: [{ kind: "sub", a: 5, b: 1, answer: 4 }],
      intro: "",
      sequence: [4],
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects empty sequence", () => {
    const r = DoorCodeParams.safeParse({
      problems: [{ kind: "sub", a: 5, b: 1, answer: 4 }],
      intro: "x",
      sequence: [],
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects negative numbers in sequence", () => {
    const r = DoorCodeParams.safeParse({
      problems: [{ kind: "sub", a: 5, b: 1, answer: 4 }],
      intro: "x",
      sequence: [-1],
    });
    expect(r.success).toBe(false);
  });
});
