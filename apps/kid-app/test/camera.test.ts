// apps/kid-app/test/camera.test.ts
import { test, expect, describe } from "vitest";
import { cameraPosition, clampYaw, YAW_RANGE_RAD } from "../src/world/camera.ts";

describe("clampYaw", () => {
  test("returns input when within range", () => {
    expect(clampYaw(0)).toBe(0);
    expect(clampYaw(0.1)).toBe(0.1);
  });
  test("clamps above range", () => {
    expect(clampYaw(YAW_RANGE_RAD + 1)).toBe(YAW_RANGE_RAD);
  });
  test("clamps below negative range", () => {
    expect(clampYaw(-(YAW_RANGE_RAD + 1))).toBe(-YAW_RANGE_RAD);
  });
});

describe("cameraPosition", () => {
  test("at yaw=0 places camera directly south of origin at given pitch", () => {
    // pitch=π/4 means 45° elevation; distance=10
    // Expect x=0, y=10*sin(π/4), z=10*cos(π/4)
    const p = cameraPosition({ distance: 10, pitch: Math.PI / 4, yaw: 0 });
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[1]).toBeCloseTo(10 * Math.sin(Math.PI / 4), 5);
    expect(p[2]).toBeCloseTo(10 * Math.cos(Math.PI / 4), 5);
  });

  test("at yaw=+π/2 (looking from east) x is positive, z is ~0", () => {
    const p = cameraPosition({ distance: 10, pitch: 0, yaw: Math.PI / 2 });
    expect(p[0]).toBeCloseTo(10, 5);
    expect(p[2]).toBeCloseTo(0, 5);
  });

  test("y component depends only on distance and pitch, not yaw", () => {
    const a = cameraPosition({ distance: 10, pitch: Math.PI / 6, yaw: 0 });
    const b = cameraPosition({ distance: 10, pitch: Math.PI / 6, yaw: 0.3 });
    expect(a[1]).toBeCloseTo(b[1], 5);
  });
});
