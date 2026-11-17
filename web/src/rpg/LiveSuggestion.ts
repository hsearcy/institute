/** Streaming mono PCM, with state carried across audio callbacks. */
export class PcmResampler {
  private buffer: number[] = [];
  private position = 0;
  constructor(private inputRate: number, private outputRate = 16000) {}
  process(input: Float32Array): ArrayBuffer {
    this.buffer.push(...input);
    const samples: number[] = [], step = this.inputRate / this.outputRate;
    while (this.position + 1 < this.buffer.length) {
      const i = Math.floor(this.position), fraction = this.position - i;
      samples.push(this.buffer[i]! * (1 - fraction) + this.buffer[i + 1]! * fraction);
      this.position += step;
    }
    const consumed = Math.min(Math.floor(this.position), this.buffer.length);
    this.buffer.splice(0, consumed); this.position -= consumed;
    const result = new ArrayBuffer(samples.length * 2), view = new DataView(result);
    samples.forEach((sample, i) => { const v = Math.max(-1, Math.min(1, sample)); view.setInt16(i * 2, v < 0 ? v * 32768 : v * 32767, true); });
    return result;
  }
}
// Batch audio on the audio thread, not after hundreds of messages reach the main thread.
export const CAPTURE_WORKLET = `class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(2048); this.used = 0; this.stopped = false;
    this.port.onmessage = e => { if (e.data === 'flush' && !this.stopped) { this.stopped = true; if (this.used) this.port.postMessage(this.buffer.slice(0, this.used)); this.port.postMessage({type: 'flushed'}); } }; }
  process(inputs) { if (this.stopped) return false; const input = inputs[0][0]; if (input) { let offset = 0; while (offset < input.length) { const n = Math.min(input.length - offset, this.buffer.length - this.used); this.buffer.set(input.subarray(offset, offset + n), this.used); this.used += n; offset += n; if (this.used === this.buffer.length) { this.port.postMessage(this.buffer); this.buffer = new Float32Array(2048); this.used = 0; } } } return true; }
} registerProcessor('idea-capture', Capture);`;
export class TranscriptSegments {
  final = ''; interim = '';
  update(text: string, isFinal: boolean): string {
    if (isFinal) { this.final = [this.final, text.trim()].filter(Boolean).join(' '); this.interim = ''; }
    else this.interim = text.trim();
    return [this.final, this.interim].filter(Boolean).join(' ');
  }
}
type State = 'idle' | 'requesting' | 'listening' | 'stopping';
export class LiveSuggestion {
  state: State = 'idle';
  private generation = 0;
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private bytes = 0;
  private ready = false;
  private segments = new TranscriptSegments();
  constructor(private changed: () => void, private words: (text: string) => void, private error: (text: string) => void) {}
  private set(state: State) { this.state = state; this.changed(); }
  async start(): Promise<void> {
    if (this.state !== 'idle') return;
    const generation = ++this.generation; this.segments = new TranscriptSegments(); this.bytes = 0; this.ready = false; this.set('requesting');
    try {
      // getUserMedia is called directly in the click handler, before any await.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new Audio(); this.context = context;
      const source = context.createMediaStreamSource(stream), resampler = new PcmResampler(context.sampleRate);
      let socket: WebSocket;
      const emit = (samples: Float32Array) => {
        if (generation !== this.generation || !this.ready || (this.state !== 'listening' && this.state !== 'stopping')) return;
        const frame = resampler.process(samples);
        if (!frame.byteLength) return;
        if (socket.bufferedAmount > 256 * 1024 || this.bytes + frame.byteLength > 5 * 1024 * 1024) { this.fail('Voice stopped. Please check your words.'); return; }
        this.bytes += frame.byteLength; socket.send(frame);
      };
      // Worklet keeps capture off the main thread. ScriptProcessor supports older browsers.
      if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' }));
        try { await context.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
        if (generation !== this.generation) return;
        const node = new AudioWorkletNode(context, 'idea-capture'); this.node = node; this.worklet = node;
        node.port.onmessage = event => { if (generation !== this.generation) return; if (event.data?.type === 'flushed') { if (this.state === 'stopping') this.sendStop(); } else emit(event.data as Float32Array); }; source.connect(node); node.connect(context.destination);
      } else {
        const node = context.createScriptProcessor(4096, 1, 1); this.node = node;
        node.onaudioprocess = event => emit(event.inputBuffer.getChannelData(0)); source.connect(node); node.connect(context.destination);
      }
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/rpg/suggestions/live`); this.socket = socket;
      socket.onopen = () => { if (generation === this.generation) socket.send(JSON.stringify({ type: 'start', sampleRate: 16000 })); };
      socket.onmessage = event => {
        if (generation !== this.generation) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ready' && this.state === 'requesting') { if (this.timer) clearTimeout(this.timer); this.ready = true; this.set('listening'); this.timer = setTimeout(() => this.stop(), 60_000); }
          else if (data.type === 'transcript' && typeof data.text === 'string' && typeof data.isFinal === 'boolean') this.words(this.segments.update(data.text, data.isFinal));
          else if (data.type === 'stop_requested' && this.state === 'listening') this.stop();
          else if (data.type === 'done' && (this.state === 'stopping' || this.state === 'listening')) this.finish();
          else if (data.type === 'error') this.fail('Voice is not working. You can type your idea.');
        } catch { this.fail('Voice is not working. You can type your idea.'); }
      };
      socket.onerror = () => { if (generation === this.generation) this.fail('Voice is not working. You can type your idea.'); };
      socket.onclose = () => { if (generation === this.generation && this.state !== 'idle') this.fail('Voice stopped. You can type your idea.'); };
      this.timer = setTimeout(() => this.fail('Voice took too long. You can type your idea.'), 10000);
      await context.resume();
    } catch { if (generation === this.generation) this.fail('Could not use the microphone. You can type your idea.'); }
  }
  stop(): void {
    if (this.state !== 'listening') return;
    if (this.timer) clearTimeout(this.timer);
    this.set('stopping');
    if (this.worklet) {
      this.worklet.port.postMessage('flush');
      this.timer = setTimeout(() => this.fail('Voice took too long. Please check your words.'), 1000);
    } else this.sendStop();
  }
  private sendStop(): void {
    this.releaseAudio();
    try { this.socket?.send(JSON.stringify({ type: 'stop' })); } catch { this.fail('Voice stopped. Please check your words.'); return; }
    // Allow the server's 8s drain deadline to report before the browser gives up.
    this.timer = setTimeout(() => this.fail('Voice took too long. Please check your words.'), 10000);
  }
  cancel(): void { ++this.generation; this.releaseAudio(); this.socket?.close(); this.socket = null; this.set('idle'); }
  private finish(): void { this.cancel(); }
  private fail(message: string): void { this.cancel(); this.error(message); }
  private releaseAudio(): void {
    if (this.timer) clearTimeout(this.timer); this.timer = null; this.ready = false;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.node?.disconnect(); this.node = null;
    this.worklet = null;
    if (this.context) void this.context.close().catch(() => {}); this.context = null;
  }
}
