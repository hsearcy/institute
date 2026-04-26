// apps/kid-app/test/useFps.test.ts
import { test, expect, describe } from "bun:test";
import { computeFps, FPS_WINDOW } from "../src/world/hooks/useFps.ts";

describe("computeFps", () => {
  test("returns 0 when window is empty", () => {
    expect(computeFps([])).toBe(0);
  });

  test("returns 0 when only one timestamp (need ≥2 to measure)", () => {
    expect(computeFps([1000])).toBe(0);
  });

  test("60 FPS over 60 frames spaced exactly 1/60s apart", () => {
    const frameDt = 1000 / 60;
    const stamps = Array.from({ length: 60 }, (_, i) => i * frameDt);
    expect(computeFps(stamps)).toBe(60);
  });

  test("30 FPS over a long enough window", () => {
    const frameDt = 1000 / 30;
    const stamps = Array.from({ length: 30 }, (_, i) => i * frameDt);
    expect(computeFps(stamps)).toBe(30);
  });

  test("FPS_WINDOW is a sensible positive integer", () => {
    expect(FPS_WINDOW).toBeGreaterThanOrEqual(30);
    expect(FPS_WINDOW).toBeLessThanOrEqual(120);
    expect(Number.isInteger(FPS_WINDOW)).toBe(true);
  });
});
