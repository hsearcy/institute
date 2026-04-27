import { describe, test, expect, vi } from "vitest";
import { runVoiceFlow, type VoiceFlowDeps } from "../../src/voice/voiceFlow";

function deps(over: Partial<VoiceFlowDeps> = {}): VoiceFlowDeps {
  return {
    speak: vi.fn(async () => {}),
    startRecorder: vi.fn(async () => ({ stop: vi.fn(async () => {}) })),
    startSttSession: vi.fn(() => ({ sendAudio: vi.fn(), stop: vi.fn() })),
    submitAnswer: vi.fn(),
    onLowConfidence: vi.fn(),
    onNoMatch: vi.fn(),
    ...over,
  };
}

describe("runVoiceFlow", () => {
  test("speaks the intro before opening the recorder", async () => {
    const order: string[] = [];
    const d = deps({
      speak: vi.fn(async () => { order.push("speak"); }),
      startRecorder: vi.fn(async () => { order.push("rec"); return { stop: vi.fn(async () => {}) }; }),
    });
    await runVoiceFlow({ intro: "go!", expectedAnswers: [2, 4], deps: d });
    expect(order).toEqual(["speak", "rec"]);
  });

  test("on high-confidence result: calls submitAnswer with normalized", async () => {
    let onResult: ((r: unknown) => void) | null = null;
    const d = deps({
      startSttSession: vi.fn(({ onResult: cb }) => { onResult = cb; return { sendAudio: vi.fn(), stop: vi.fn() }; }),
    });
    await runVoiceFlow({ intro: "go!", expectedAnswers: [2, 4], deps: d });
    onResult!({ transcript: "four", normalized: 4, confidence: "high" });
    expect(d.submitAnswer).toHaveBeenCalledWith(4);
  });

  test("on low-confidence result: calls onLowConfidence with the candidate", async () => {
    let onResult: ((r: unknown) => void) | null = null;
    const d = deps({
      startSttSession: vi.fn(({ onResult: cb }) => { onResult = cb; return { sendAudio: vi.fn(), stop: vi.fn() }; }),
    });
    await runVoiceFlow({ intro: "go!", expectedAnswers: [2, 4], deps: d });
    onResult!({ transcript: "six", normalized: 6, confidence: "low" });
    expect(d.onLowConfidence).toHaveBeenCalledWith(6, [2, 4]);
    expect(d.submitAnswer).not.toHaveBeenCalled();
  });

  test("on no_match: calls onNoMatch", async () => {
    let onResult: ((r: unknown) => void) | null = null;
    const d = deps({
      startSttSession: vi.fn(({ onResult: cb }) => { onResult = cb; return { sendAudio: vi.fn(), stop: vi.fn() }; }),
    });
    await runVoiceFlow({ intro: "go!", expectedAnswers: [2, 4], deps: d });
    onResult!({ transcript: "blah", normalized: null, confidence: "no_match" });
    expect(d.onNoMatch).toHaveBeenCalled();
  });

  test("returned stop() halts both recorder and STT session", async () => {
    const recStop = vi.fn(async () => {});
    const sttStop = vi.fn();
    const d = deps({
      startRecorder: vi.fn(async () => ({ stop: recStop })),
      startSttSession: vi.fn(() => ({ sendAudio: vi.fn(), stop: sttStop })),
    });
    const handle = await runVoiceFlow({ intro: "go!", expectedAnswers: [], deps: d });
    await handle.stop();
    expect(recStop).toHaveBeenCalled();
    expect(sttStop).toHaveBeenCalled();
  });
});
