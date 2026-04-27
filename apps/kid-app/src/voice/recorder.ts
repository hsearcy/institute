export type RecorderHandle = {
  stop: () => Promise<void>;
};

export type StartRecorderOpts = {
  /** Called repeatedly with PCM 16kHz mono audio chunks suitable for Deepgram. */
  onChunk: (chunk: ArrayBuffer) => void;
  /** Called once when recording actually starts. */
  onStart?: () => void;
  /** Called on any error. */
  onError?: (e: Error) => void;
};

/**
 * Begin recording from the device microphone. Resolves to a handle whose
 * `.stop()` method ends recording.
 *
 * IMPLEMENTATION PENDING — wired against the actual expo-audio recording
 * API in M4 Task 14 (on-device). This stub keeps the signature stable so
 * downstream code can be built and tested.
 */
export async function startRecorder(_opts: StartRecorderOpts): Promise<RecorderHandle> {
  throw new Error("recorder.ts not yet wired — see M4 Task 14 for impl steps");
}
