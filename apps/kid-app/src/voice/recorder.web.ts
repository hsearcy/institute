// Web mic recorder using the browser MediaRecorder directly. expo-audio's web
// AudioRecorder doesn't reliably honor forDuration / emit isFinished, so the
// native record-to-file path never finalizes or uploads on web (0 STT requests).
// This captures to a Blob and hands back a blob: URL that sttHttp uploads to /stt.
//
// It also does silence detection: once the kid has spoken and then goes quiet for
// ~600ms it stops immediately (snappy), with a hard cap as a fallback.
//
// Metro resolves this `.web.ts` over recorder.ts on web (same pattern as db.web.ts).
// It re-declares the public types because other modules import them from "./recorder".

export type RecordingResult = {
  uri: string;
  contentType: string;
};

export type RecorderHandle = {
  stop: () => Promise<RecordingResult>;
};

export type StartRecorderOpts = {
  /** Hard cap (fallback if the kid never speaks). Silence detection usually stops first. */
  maxDurationMs?: number;
  onStart?: () => void;
  onAutoStop?: (r: RecordingResult) => void;
  onError?: (e: Error) => void;
};

const DEFAULT_MAX_DURATION_MS = 2500;
const SILENCE_MS = 600; // stop this long after speech drops to silence
const MIN_MS = 500; // don't allow a stop before this (avoid clipping the start)
const SPEAK_THRESHOLD = 9; // time-domain amplitude deviation that counts as speech

function pickMimeType(): string {
  const MR = (globalThis as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } }).MediaRecorder;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const c of candidates) {
    try { if (MR?.isTypeSupported?.(c)) return c; } catch { /* keep trying */ }
  }
  return "audio/webm";
}

export async function startRecorder(opts: StartRecorderOpts = {}): Promise<RecorderHandle> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  const stream = await nav.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MR = (globalThis as any).MediaRecorder;
  const rec = new MR(stream, { mimeType });

  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e: { data?: Blob }) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };

  let resolveResult!: (r: RecordingResult) => void;
  const resultP = new Promise<RecordingResult>((r) => { resolveResult = r; });
  let stoppedByTimer = false;
  let poll: ReturnType<typeof setInterval> | null = null;
  let hardTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanupTimers = () => {
    if (poll) { clearInterval(poll); poll = null; }
    if (hardTimer) { clearTimeout(hardTimer); hardTimer = null; }
  };
  const stopTracks = () => {
    try { stream.getTracks().forEach((t: { stop: () => void }) => t.stop()); } catch { /* ignore */ }
  };

  rec.onstop = () => {
    cleanupTimers();
    stopTracks();
    const blob = new Blob(chunks, { type: mimeType });
    const result: RecordingResult = { uri: URL.createObjectURL(blob), contentType: blob.type || mimeType };
    resolveResult(result);
    if (stoppedByTimer) opts.onAutoStop?.(result); // auto-stop path → caller transcribes
  };
  rec.onerror = (e: { error?: { message?: string } }) => {
    opts.onError?.(new Error(e?.error?.message ?? "recorder error"));
  };

  try {
    rec.start();
    opts.onStart?.();
  } catch (e) {
    stopTracks();
    opts.onError?.(e as Error);
    throw e;
  }

  // Hard cap fallback.
  hardTimer = setTimeout(() => {
    if (rec.state !== "inactive") { stoppedByTimer = true; rec.stop(); }
  }, opts.maxDurationMs ?? DEFAULT_MAX_DURATION_MS);

  // Silence detection: stop shortly after the kid finishes speaking.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    const ctx = new AC();
    ctx.resume?.().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const startedAt = Date.now();
    let spoke = false;
    let lastLoud = Date.now();
    poll = setInterval(() => {
      if (rec.state === "inactive") { cleanupTimers(); try { ctx.close(); } catch { /* ignore */ } return; }
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) { const d = Math.abs(buf[i]! - 128); if (d > peak) peak = d; }
      const now = Date.now();
      if (peak > SPEAK_THRESHOLD) { spoke = true; lastLoud = now; }
      if (spoke && now - startedAt > MIN_MS && now - lastLoud > SILENCE_MS) {
        try { ctx.close(); } catch { /* ignore */ }
        stoppedByTimer = true;
        if (rec.state !== "inactive") rec.stop();
      }
    }, 70);
  } catch {
    /* no silence detection available — rely on the hard cap */
  }

  return {
    stop: async () => {
      cleanupTimers();
      if (rec.state !== "inactive") rec.stop(); // manual stop → onAutoStop NOT fired
      return resultP;
    },
  };
}
