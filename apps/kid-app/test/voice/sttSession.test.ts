import { describe, test, expect, vi, beforeEach } from "vitest";

// In-memory fake of @rails/actioncable's createConsumer.
const subscriptions: Array<{
  channel: string;
  params: Record<string, unknown>;
  send: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  onReceived: (data: unknown) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}> = [];

vi.mock("@rails/actioncable", () => ({
  createConsumer: vi.fn(() => ({
    subscriptions: {
      create(spec: { channel: string } & Record<string, unknown>, callbacks: { received: (d: unknown) => void; connected?: () => void; disconnected?: () => void }) {
        const sub = {
          channel: spec.channel,
          params: spec,
          send: vi.fn(),
          unsubscribe: vi.fn(),
          onReceived: callbacks.received,
          onConnected: callbacks.connected,
          onDisconnected: callbacks.disconnected,
        };
        subscriptions.push(sub);
        return sub;
      },
    },
    disconnect: vi.fn(),
  })),
}));

import { startSttSession } from "../../src/voice/sttSession";

describe("startSttSession", () => {
  beforeEach(() => { subscriptions.length = 0; });

  test("subscribes to SttChannel with expected_answers", () => {
    startSttSession({
      wsUrl: "ws://x/cable",
      expectedAnswers: [2, 4, 6],
      onResult: () => {},
      onError: () => {},
    });
    expect(subscriptions[0]!.channel).toBe("SttChannel");
    expect(subscriptions[0]!.params.expected_answers).toEqual([2, 4, 6]);
  });

  test("sendAudio forwards data via the subscription", () => {
    const session = startSttSession({
      wsUrl: "ws://x/cable",
      expectedAnswers: [],
      onResult: () => {},
      onError: () => {},
    });
    const buf = new ArrayBuffer(4);
    session.sendAudio(buf);
    expect(subscriptions[0]!.send).toHaveBeenCalledTimes(1);
  });

  test("calls onResult with each transcript event", () => {
    const onResult = vi.fn();
    startSttSession({
      wsUrl: "ws://x/cable",
      expectedAnswers: [],
      onResult,
      onError: () => {},
    });
    subscriptions[0]!.onReceived({ transcript: "two", normalized: 2, confidence: "high" });
    expect(onResult).toHaveBeenCalledWith({ transcript: "two", normalized: 2, confidence: "high" });
  });

  test("calls onError when disconnected fires", () => {
    const onError = vi.fn();
    startSttSession({
      wsUrl: "ws://x/cable",
      expectedAnswers: [],
      onResult: () => {},
      onError,
    });
    subscriptions[0]!.onDisconnected?.();
    expect(onError).toHaveBeenCalled();
  });

  test("stop unsubscribes", () => {
    const session = startSttSession({
      wsUrl: "ws://x/cable",
      expectedAnswers: [],
      onResult: () => {},
      onError: () => {},
    });
    session.stop();
    expect(subscriptions[0]!.unsubscribe).toHaveBeenCalled();
  });

  test("no-op when wsUrl is empty (returns inert session)", () => {
    const session = startSttSession({
      wsUrl: "",
      expectedAnswers: [],
      onResult: () => {},
      onError: () => {},
    });
    expect(subscriptions).toHaveLength(0);
    session.sendAudio(new ArrayBuffer(0));
    session.stop();
  });
});
