// Tutor voice (ElevenLabs via the server) + generated game SFX/ambience played
// through WebAudio buffers for low latency. SFX assets live in /public/assets/audio.
import { API } from './config';

let ctx: AudioContext | null = null;
function ac(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// ---- SFX buffers -----------------------------------------------------------
type Clip = 'pickaxe-chink' | 'gem-mine' | 'gem-collect' | 'wrong-soft' | 'cavern-ambience';
const GAIN: Record<Clip, number> = {
  'pickaxe-chink': 0.5, 'gem-mine': 0.9, 'gem-collect': 0.6, 'wrong-soft': 0.7, 'cavern-ambience': 0.2,
};
const buffers = new Map<Clip, AudioBuffer>();

async function load(clip: Clip): Promise<AudioBuffer | null> {
  const cached = buffers.get(clip);
  if (cached) return cached;
  try {
    const r = await fetch(`/assets/audio/${clip}.mp3`);
    const buf = await ac().decodeAudioData(await r.arrayBuffer());
    buffers.set(clip, buf);
    return buf;
  } catch {
    return null;
  }
}

// Preload everything (cheap; total < 250 KB) so the first hit has no latency.
export function preloadAudio(): void {
  (['pickaxe-chink', 'gem-mine', 'gem-collect', 'wrong-soft', 'cavern-ambience'] as Clip[]).forEach((c) => void load(c));
}

function play(clip: Clip, opts: { rate?: number; gainMul?: number } = {}): void {
  const buf = buffers.get(clip);
  if (!buf) { void load(clip); return; } // not ready yet — skip this hit, no blocking
  const c = ac();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = opts.rate ?? 1;
  const g = c.createGain();
  g.gain.value = GAIN[clip] * (opts.gainMul ?? 1);
  src.connect(g).connect(c.destination);
  src.start();
}

/** Pickaxe striking a number-gem — slight pitch variation so rapid taps don't fatigue. */
export function sfxChink(): void { play('pickaxe-chink', { rate: 0.94 + Math.random() * 0.14 }); }
/** Gem mined free — triumphant shimmer. */
export function sfxMine(): void { play('gem-mine'); }
/** Wrong — gentle, non-punitive. */
export function sfxFizzle(): void { play('wrong-soft'); }
/** Reward gem lands in the collection. */
export function sfxCollect(): void { play('gem-collect'); }

/** A synthesized rising arpeggio + shimmer for celebrations — no asset needed, so
 *  it always works even before MP3s parse. `big` adds octaves + sparkle for milestones. */
export function sfxFanfare(big = false): void {
  const c = ac();
  const t0 = c.currentTime;
  // Bright major arpeggio (C E G C — plus a high octave + fifth for big wins).
  const notes = big ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const at = t0 + i * (big ? 0.07 : 0.085);
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(big ? 0.34 : 0.26, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
    osc.connect(g).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.6);
  });
  // A high sparkle tail on big wins.
  if (big) {
    const at = t0 + notes.length * 0.07;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1568, at);
    osc.frequency.exponentialRampToValueAtTime(3136, at + 0.4);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.18, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    osc.connect(g).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.55);
  }
}

// ---- Ambience --------------------------------------------------------------
let ambienceStarted = false;
export function startAmbience(): void {
  if (ambienceStarted) return;
  ambienceStarted = true;
  void (async () => {
    const buf = await load('cavern-ambience');
    if (!buf) { ambienceStarted = false; return; }
    const c = ac();
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = c.createGain();
    g.gain.value = GAIN['cavern-ambience'];
    src.connect(g).connect(c.destination);
    src.start();
  })();
}

// ---- Tutor voice -----------------------------------------------------------
let current: HTMLAudioElement | null = null;
/** Speak `text` with the tutor's ElevenLabs voice. Best-effort; never throws.
 *  Resolves when playback FINISHES (or is preempted by a newer speak), so
 *  callers can sequence speech and hold the game until the tutor is done. */
export async function speak(text: string): Promise<void> {
  try {
    current?.pause();
    const r = await fetch(`${API}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return;
    const url = URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: 'audio/mpeg' }));
    const a = new Audio(url);
    current = a;
    await a.play().catch(() => {});
    if (a.paused) { URL.revokeObjectURL(url); return; } // autoplay blocked / instantly preempted
    await new Promise<void>((res) => {
      const done = () => { URL.revokeObjectURL(url); res(); };
      a.onended = done;
      a.onerror = done;
      a.onpause = done; // a newer speak() preempted us — we're done either way
    });
  } catch {
    /* best-effort */
  }
}
