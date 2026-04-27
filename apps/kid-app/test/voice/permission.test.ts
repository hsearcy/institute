import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("expo-audio", () => ({
  requestRecordingPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  getRecordingPermissionsAsync:    vi.fn(async () => ({ status: "undetermined" })),
}));

import { _resetForTests, ensureMicPermission } from "../../src/voice/permission";

describe("ensureMicPermission", () => {
  beforeEach(async () => { _resetForTests(); vi.clearAllMocks(); });

  test("returns true when granted", async () => {
    expect(await ensureMicPermission()).toBe(true);
  });

  test("caches a granted result without re-requesting", async () => {
    const expoAudio = await import("expo-audio");
    await ensureMicPermission();
    await ensureMicPermission();
    await ensureMicPermission();
    expect(expoAudio.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  test("returns false when denied", async () => {
    const expoAudio = await import("expo-audio");
    (expoAudio.requestRecordingPermissionsAsync as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: "denied" });
    expect(await ensureMicPermission()).toBe(false);
  });
});
