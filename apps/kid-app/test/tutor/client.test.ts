import { describe, test, expect, beforeEach, vi } from "vitest";
import { requestNextRound } from "../../src/tutor/client";

const VALID_RESPONSE = {
  skillId: "skip_count_2",
  pluginId: "spell-cast",
  params: { enemyType: "goblin", sequence: [2, 4, 6, 8, 10], intro: "ready?" },
};

const baseRequest = {
  baseUrl: "http://localhost:3000",
  bearerToken: undefined as string | undefined,
  payload: {
    profile: { id: "sam", name: "Sam", age: 6 },
    currentZone: "hub",
    eligiblePool: [{ skillId: "skip_count_2", description: "x", masteryState: "practicing" as const, currentDifficulty: 0.4, attempts: 1, correct: 1 }],
    recentHistory: [],
    availablePlugins: [{ id: "spell-cast", title: "Spell Cast", supportedSkills: ["skip_count_2"], paramSchema: {} }],
  },
};

describe("requestNextRound", () => {
  beforeEach(() => { (globalThis as { fetch?: unknown }).fetch = undefined; });

  test("returns parsed response on 200", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(async () => new Response(JSON.stringify(VALID_RESPONSE), { status: 200, headers: { "content-type": "application/json" } }));
    const r = await requestNextRound({ ...baseRequest, fallback: () => { throw new Error("should not fall back"); } });
    expect(r).toEqual(VALID_RESPONSE);
  });

  test("includes Authorization header when bearerToken is set", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    await requestNextRound({ ...baseRequest, bearerToken: "supersecret", fallback: () => ({ pluginId: "spell-cast", skillId: "x", params: {} }) });
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, { headers?: Record<string, string> }]>;
    const init = calls[0]?.[1] ?? { headers: {} };
    expect(init.headers!["Authorization"]).toBe("Bearer supersecret");
  });

  test("falls back on non-2xx", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(async () => new Response("oops", { status: 502 }));
    const r = await requestNextRound({ ...baseRequest, fallback: () => ({ skillId: "fb", pluginId: "spell-cast", params: { fallback: true } as never }) });
    expect((r.params as { fallback: boolean }).fallback).toBe(true);
  });

  test("falls back on network error", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(async () => { throw new Error("offline"); });
    const r = await requestNextRound({ ...baseRequest, fallback: () => ({ skillId: "fb", pluginId: "spell-cast", params: { fallback: true } as never }) });
    expect((r.params as { fallback: boolean }).fallback).toBe(true);
  });

  test("falls back when baseUrl is empty (offline / dev no-backend)", async () => {
    const fetchMock = vi.fn();
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const r = await requestNextRound({ ...baseRequest, baseUrl: "", fallback: () => ({ skillId: "fb", pluginId: "spell-cast", params: { fallback: true } as never }) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((r.params as { fallback: boolean }).fallback).toBe(true);
  });

  test("falls back on malformed (non-JSON) response", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(async () => new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }));
    const r = await requestNextRound({ ...baseRequest, fallback: () => ({ skillId: "fb", pluginId: "spell-cast", params: { fallback: true } as never }) });
    expect((r.params as { fallback: boolean }).fallback).toBe(true);
  });
});
