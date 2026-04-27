import type { SttResult } from "./sttSession";

export type VoiceFlowDeps = {
  speak: (text: string) => Promise<void>;
  startRecorder: (onChunk: (buf: ArrayBuffer) => void) => Promise<{ stop: () => Promise<void> }>;
  startSttSession: (opts: {
    expectedAnswers: number[];
    onResult: (r: SttResult) => void;
    onError: (e: Error) => void;
  }) => { sendAudio: (chunk: ArrayBuffer) => void; stop: () => void };
  submitAnswer: (n: number) => void;
  onLowConfidence: (candidate: number, expected: number[]) => void;
  onNoMatch: () => void;
};

export type RunVoiceFlowOpts = {
  intro: string;
  expectedAnswers: number[];
  deps: VoiceFlowDeps;
};

export type VoiceFlowHandle = {
  stop: () => Promise<void>;
};

/**
 * Per-step voice flow:
 *   1. Speak the intro (mic muted during playback)
 *   2. Open recorder + STT session
 *   3. Forward chunks; route results by confidence
 */
export async function runVoiceFlow(opts: RunVoiceFlowOpts): Promise<VoiceFlowHandle> {
  await opts.deps.speak(opts.intro);

  const session = opts.deps.startSttSession({
    expectedAnswers: opts.expectedAnswers,
    onResult: (r) => {
      switch (r.confidence) {
        case "high":
          if (r.normalized !== null) opts.deps.submitAnswer(r.normalized);
          break;
        case "low":
          if (r.normalized !== null) opts.deps.onLowConfidence(r.normalized, opts.expectedAnswers);
          break;
        case "no_match":
          opts.deps.onNoMatch();
          break;
      }
    },
    onError: () => opts.deps.onNoMatch(),
  });

  const recorder = await opts.deps.startRecorder((chunk) => session.sendAudio(chunk));

  return {
    stop: async () => {
      await recorder.stop();
      session.stop();
    },
  };
}
