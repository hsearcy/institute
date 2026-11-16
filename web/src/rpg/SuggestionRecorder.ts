import { MAX_SUGGESTION_AUDIO } from './suggestions';

export type RecorderEnvironment = {
  secure: boolean; available: boolean;
  getStream: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => MediaRecorder;
};
function browserEnvironment(): RecorderEnvironment {
  return {
    secure: globalThis.isSecureContext === true,
    available: typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    getStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    createRecorder: stream => {
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      return new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    },
  };
}

/** Capture stays in memory. Stopping, including the time limit, NEVER uploads. */
export class SuggestionRecorder {
  state: 'idle' | 'requesting' | 'recording' | 'stopping' | 'ready' = 'idle';
  audio: Blob | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private bytes = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private disposed = false;
  constructor(private changed: () => void, private notice: (text: string) => void,
    private environment: RecorderEnvironment = browserEnvironment(), private maxDuration = 60_000) {}
  get available(): boolean { return this.environment.secure && this.environment.available; }
  async start(): Promise<void> {
    if (this.disposed || this.state === 'requesting' || this.state === 'recording' || this.state === 'stopping') return;
    if (!this.available) {
      this.notice(this.environment.secure ? 'This browser cannot record a microphone. You can type your idea below.' : 'Voice needs a secure HTTPS connection (or localhost). You can still type your idea below.'); return;
    }
    this.cancel(); const generation = this.generation;
    this.state = 'requesting'; this.changed();
    try {
      const stream = await this.environment.getStream();
      if (this.disposed || generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const recorder = this.environment.createRecorder(stream); this.recorder = recorder;
      recorder.ondataavailable = event => {
        if (generation !== this.generation || this.disposed) return;
        this.bytes += event.data.size;
        if (this.bytes > MAX_SUGGESTION_AUDIO) {
          this.cancel(); this.notice('That recording passed the 5 MiB limit and was discarded. Try a shorter idea or type it below.'); return;
        }
        if (event.data.size) this.chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (generation !== this.generation || this.disposed) return;
        this.release();
        // Use what this browser actually recorded, not an assumed WebM type.
        this.audio = new Blob(this.chunks, { type: recorder.mimeType || this.chunks[0]?.type || '' });
        this.chunks = []; this.recorder = null;
        if (!this.audio.size || !this.audio.type.startsWith('audio/')) {
          this.audio = null; this.state = 'idle'; this.notice('No usable audio was recorded. Please try again or type your idea.');
        } else this.state = 'ready';
        this.changed();
      };
      recorder.onerror = () => { this.cancel(); this.notice('The microphone stopped working. You can type your idea instead.'); };
      recorder.start(250);
      this.state = 'recording'; this.changed();
      this.timer = setTimeout(() => {
        this.stop(); this.notice('Recording reached the 60 second limit. Nothing was uploaded. Choose Transcribe recording or type your idea.');
      }, Math.min(this.maxDuration, 60_000));
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.cancel();
      this.notice(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone permission was not allowed. You can type your idea below, or enable microphone permission and try again.'
        : 'No microphone is available right now. You can type your idea below.');
    }
  }
  stop(): void {
    if (this.state !== 'recording' || !this.recorder) return;
    this.state = 'stopping'; this.clearTimer();
    try { this.recorder.stop(); }
    catch { this.cancel(); this.notice('The recording could not be kept. Please type your idea instead.'); }
    finally { this.release(); }
    this.changed();
  }
  cancel(): void {
    this.generation++; this.clearTimer();
    const recorder = this.recorder; this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      if (recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* Tracks are always released below. */ } }
    }
    this.release(); this.chunks = []; this.bytes = 0; this.audio = null; this.state = 'idle'; this.changed();
  }
  dispose(): void { this.disposed = true; this.cancel(); }
  private clearTimer(): void { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }
  private release(): void {
    this.clearTimer(); this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
  }
}
