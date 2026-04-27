import { describe, test, expect, vi, beforeEach } from "vitest";

// expo-audio's createAudioPlayer returns an AudioPlayer instance with play()
// and addListener(). We mock it so the test can simulate "playback finished"
// by emitting a playbackStatusUpdate with didJustFinish: true on the next tick.
vi.mock("expo-audio", () => {
  return {
    createAudioPlayer: vi.fn(() => ({
      play: vi.fn(),
      remove: vi.fn(),
      addListener: (event: string, fn: (status: { didJustFinish?: boolean }) => void) => {
        if (event === "playbackStatusUpdate") {
          queueMicrotask(() => fn({ didJustFinish: true }));
        }
        return { remove: vi.fn() };
      },
    })),
  };
});

import { speak } from "../../src/voice/ttsClient";

describe("speak", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test("POSTs to /tts with the right body and bearer header", async () => {
    const fetchMock = vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    await speak({ baseUrl: "http://x:3000", bearerToken: "shh", text: "hello" });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const [url, init] = calls[0]!;
    expect(url).toBe("http://x:3000/tts");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer shh");
    const body = JSON.parse(init.body as string);
    expect(body.text).toBe("hello");
  });

  test("resolves once playback completes", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 }));
    await speak({ baseUrl: "http://x:3000", text: "hi" });
    expect(true).toBe(true);
  });

  test("throws on non-2xx response", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(async () => new Response("nope", { status: 502 }));
    await expect(speak({ baseUrl: "http://x:3000", text: "hi" })).rejects.toThrow();
  });

  test("no-op when baseUrl is empty", async () => {
    const fetchMock = vi.fn();
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    await speak({ baseUrl: "", text: "hi" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
