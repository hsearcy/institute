import { test, expect, describe } from "vitest";
import { manifest, CookieShareParams } from "../src/manifest.ts";

describe("cookie-share manifest", () => {
  test("id is 'cookie-share'", () => {
    expect(manifest.id).toBe("cookie-share");
  });

  test("title is human-readable", () => {
    expect(manifest.title).toBe("Cookie Share");
  });

  test("supportedSkills covers counting + equal sharing + beginning division", () => {
    expect(manifest.supportedSkills).toEqual(
      expect.arrayContaining(["counting", "equal_sharing", "beginning_division"]),
    );
  });

  test("paramSchema accepts a valid set of rounds", () => {
    const r = CookieShareParams.safeParse({
      rounds: [
        { cookies: 6, friends: 3, answer: 2 },
        { cookies: 8, friends: 2, answer: 4 },
      ],
      intro: "Share the cookies fairly!",
      sequence: [2, 4],
    });
    expect(r.success).toBe(true);
  });

  test("paramSchema rejects empty rounds", () => {
    const r = CookieShareParams.safeParse({
      rounds: [],
      intro: "x",
      sequence: [1],
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects empty intro", () => {
    const r = CookieShareParams.safeParse({
      rounds: [{ cookies: 6, friends: 3, answer: 2 }],
      intro: "",
      sequence: [2],
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects empty sequence", () => {
    const r = CookieShareParams.safeParse({
      rounds: [{ cookies: 6, friends: 3, answer: 2 }],
      intro: "x",
      sequence: [],
    });
    expect(r.success).toBe(false);
  });

  test("paramSchema rejects non-positive cookies/friends", () => {
    const r = CookieShareParams.safeParse({
      rounds: [{ cookies: 0, friends: 3, answer: 0 }],
      intro: "x",
      sequence: [0],
    });
    expect(r.success).toBe(false);
  });
});
