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
/** Speak `text` with the tutor's ElevenLabs voice. Best-effort; never throws. */
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
    a.onended = () => URL.revokeObjectURL(url);
    await a.play().catch(() => {});
  } catch {
    /* best-effort */
  }
}
