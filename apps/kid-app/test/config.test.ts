import { test, expect, describe } from "bun:test";
import { PROFILE_ID, PORTAL_DEFS, SHOW_FPS } from "../src/config.ts";

describe("config", () => {
  test("PROFILE_ID is set (M3 hardcodes 'sam')", () => {
    expect(PROFILE_ID).toBe("sam");
  });

  test("PORTAL_DEFS contains exactly 4 portals with unique ids", () => {
    expect(PORTAL_DEFS.length).toBe(4);
    const ids = PORTAL_DEFS.map((p) => p.id);
    expect(new Set(ids).size).toBe(4);
  });

  test("PORTAL_DEFS ids are the four V1 mini-games", () => {
    const ids = PORTAL_DEFS.map((p) => p.id).sort();
    expect(ids).toEqual(["block-tower", "cookie-share", "door-code", "spell-cast"]);
  });

  test("each portal has a non-empty label and a valid 3D position", () => {
    for (const p of PORTAL_DEFS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.position.length).toBe(3);
      for (const coord of p.position) {
        expect(Number.isFinite(coord)).toBe(true);
      }
    }
  });

  test("SHOW_FPS is a boolean", () => {
    expect(typeof SHOW_FPS).toBe("boolean");
  });
});
