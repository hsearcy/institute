import { AudioModule, RecordingPresets } from "expo-audio";

export type RecordingResult = {
  /** Local file URI of the finished recording. */
  uri: string;
  /** MIME type for upload (m4a/aac on Android+iOS, webm on web). */
  contentType: string;
};

export type RecorderHandle = {
  /** Stop early. Resolves with the same result the auto-stop yields. */
  stop: () => Promise<RecordingResult>;
};

export type StartRecorderOpts = {
  /** Auto-stop after this many ms (default 4000). */
  maxDurationMs?: number;
  onStart?: () => void;
  /** Fired by the auto-stop path (kid stayed quiet for the full duration). */
  onAutoStop?: (r: RecordingResult) => void;
  onError?: (e: Error) => void;
};

const DEFAULT_MAX_DURATION_MS = 4000;

/**
 * Record audio from the mic to a local file. Returns a handle whose
 * `.stop()` ends recording early and resolves with the URI + content-type.
 *
 * expo-audio v1 doesn't expose chunk callbacks; we record-to-file and the
 * kid-app uploads the whole file to /stt when done. Trades streaming
 * latency for compatibility with Expo Go (no custom dev client needed).
 */
export async function startRecorder(opts: StartRecorderOpts = {}): Promise<RecorderHandle> {
  const recorder = new AudioModule.AudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    sampleRate: 16000,
    numberOfChannels: 1,
  });

  await recorder.prepareToRecordAsync();

  let resolved = false;
  let resolveAuto: ((r: RecordingResult) => void) | null = null;
  const autoPromise = new Promise<RecordingResult>((res) => { resolveAuto = res; });

  const sub = recorder.addListener(
    "recordingStatusUpdate",
    (status: { isFinished?: boolean; url?: string | null }) => {
      console.log("[recorder] status:", JSON.stringify(status), "recorder.uri=", recorder.uri);
      if (status.isFinished && !resolved) {
        resolved = true;
        const uri = status.url ?? recorder.uri ?? "";
        const result: RecordingResult = { uri, contentType: contentTypeForUri(uri) };
        console.log("[recorder] auto-stopped, uri=", uri);
        resolveAuto?.(result);
        opts.onAutoStop?.(result);
      }
    },
  );

  try {
    recorder.record({ forDuration: (opts.maxDurationMs ?? DEFAULT_MAX_DURATION_MS) / 1000 });
    opts.onStart?.();
  } catch (e) {
    sub?.remove?.();
    opts.onError?.(e as Error);
    throw e;
  }

  return {
    stop: async () => {
      if (!resolved) {
        try { await recorder.stop(); } catch { /* may already be stopped */ }
      }
      const result = await Promise.race([
        autoPromise,
        new Promise<RecordingResult>((res) => {
          setTimeout(() => res({
            uri: recorder.uri ?? "",
            contentType: contentTypeForUri(recorder.uri ?? ""),
          }), 500);
        }),
      ]);
      sub?.remove?.();
      return result;
    },
  };
}

function contentTypeForUri(uri: string): string {
  if (uri.endsWith(".m4a") || uri.endsWith(".mp4") || uri.endsWith(".aac")) return "audio/m4a";
  if (uri.endsWith(".wav")) return "audio/wav";
  if (uri.endsWith(".webm")) return "audio/webm";
  return "audio/m4a";
}
