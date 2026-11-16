import { describe, expect, test } from 'bun:test';
import { SuggestionRecorder, type RecorderEnvironment } from '../src/rpg/SuggestionRecorder';

function fixture(options: { wait?: boolean; failStart?: boolean; duration?: number } = {}) {
  let resolve!: (stream: MediaStream) => void;
  const track = { stops: 0, stop() { this.stops++; } };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const recorder = {
    state: 'inactive', mimeType: 'audio/ogg;codecs=opus',
    ondataavailable: null as ((event: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null, onerror: null as (() => void) | null,
    start() { if (options.failStart) throw Error('start failed'); this.state = 'recording'; },
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) }); this.onstop?.(); },
  };
  const env: RecorderEnvironment = {
    secure: true, available: true,
    getStream: () => options.wait ? new Promise<MediaStream>(r => { resolve = r; }) : Promise.resolve(stream),
    createRecorder: () => recorder as unknown as MediaRecorder,
  };
  const errors: string[] = [];
  const recording = new SuggestionRecorder(() => {}, text => errors.push(text), env, options.duration ?? 60_000);
  return { recording, recorder, track, stream, errors, resolve: () => resolve(stream) };
}

describe('microphone lifecycle (fake device, no database or upload)', () => {
  test('stop captures actual MIME; cancel discards and releases every track', async () => {
    const f = fixture(); await f.recording.start();
    expect(f.recording.state).toBe('recording');
    f.recording.stop();
    expect(f.track.stops).toBe(1);
    expect(f.recording.audio?.type).toBe('audio/ogg;codecs=opus');
    expect(f.recording.state).toBe('ready');
    f.recording.cancel(); expect(f.recording.audio).toBeNull(); expect(f.recording.state).toBe('idle');
  });
  test('closing during permission prompt stops a late stream and never starts recording', async () => {
    const f = fixture({ wait: true }); const starting = f.recording.start();
    f.recording.dispose(); f.resolve(); await starting;
    expect(f.track.stops).toBe(1); expect(f.recorder.state).toBe('inactive');
    expect(f.recording.audio).toBeNull();
  });
  test('cancel during recording does not keep its final data and clears the timeout', async () => {
    const f = fixture({ duration: 10 }); await f.recording.start(); f.recording.cancel();
    await Bun.sleep(25);
    expect(f.track.stops).toBe(1); expect(f.recording.audio).toBeNull(); expect(f.recording.state).toBe('idle');
  });
  test('time limit stops locally without uploading and releases microphone', async () => {
    const f = fixture({ duration: 10 }); await f.recording.start(); await Bun.sleep(25);
    expect(f.recording.state).toBe('ready'); expect(f.track.stops).toBe(1);
    expect(f.errors.join(' ')).toContain('limit'); f.recording.dispose();
  });
  test('oversized data is discarded and recorder errors/start failures release tracks', async () => {
    const f = fixture(); await f.recording.start();
    f.recorder.ondataavailable?.({ data: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]) });
    expect(f.track.stops).toBe(1); expect(f.recording.audio).toBeNull(); expect(f.errors.join(' ')).toContain('5 MiB');
    const failure = fixture({ failStart: true }); await failure.recording.start();
    expect(failure.track.stops).toBe(1); expect(failure.recording.state).toBe('idle');
    const error = fixture(); await error.recording.start(); error.recorder.onerror?.();
    expect(error.track.stops).toBe(1); expect(error.recording.audio).toBeNull();
  });
  test('insecure context and denied permission provide friendly text fallback', async () => {
    const messages: string[] = [];
    const unavailable = new SuggestionRecorder(() => {}, message => messages.push(message), { secure: false, available: false, getStream: async () => { throw Error(); }, createRecorder: () => { throw Error(); } });
    await unavailable.start(); expect(messages.join(' ')).toContain('type');
    const denied = new SuggestionRecorder(() => {}, message => messages.push(message), { secure: true, available: true, getStream: async () => { throw new DOMException('denied', 'NotAllowedError'); }, createRecorder: () => { throw Error(); } });
    await denied.start(); expect(messages.join(' ')).toContain('permission'); expect(denied.state).toBe('idle');
  });
});
