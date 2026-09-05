/** Original dungeon audio. Nothing plays until unlock() is called by a gesture.
 * Presentation only: audio completion and elapsed time never advance learning.
 */
import type { RpgSpellId } from '@institute/shared';

type Clip = 'fire-nova' | 'frost-shatter' | 'chain-lightning' | 'loot' | 'level-up' | 'boss-defeat' | 'footstep' | 'dungeon-ambience';
const clips: Clip[] = ['fire-nova', 'frost-shatter', 'chain-lightning', 'loot', 'level-up', 'boss-defeat', 'footstep', 'dungeon-ambience'];
const volume: Record<Clip, number> = {
  'fire-nova': .72, 'frost-shatter': .68, 'chain-lightning': .52,
  loot: .31, 'level-up': .44, 'boss-defeat': .50, footstep: .13, 'dungeon-ambience': .19,
};
let context: AudioContext | null = null;
let master: GainNode | null = null;
let ambienceGain: GainNode | null = null;
let ambienceSource: AudioBufferSourceNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let muted = false;
let ducked = false;
let ambienceWanted = false;
let generation = 0;
let controller: AbortController | null = null;
const buffers = new Map<Clip, AudioBuffer>();
const loading = new Map<Clip, Promise<AudioBuffer | null>>();
const voices = new Set<AudioBufferSourceNode | OscillatorNode>();
const lastPlayed = new Map<Clip, number>();

function hidden(): boolean { return typeof document !== 'undefined' && document.hidden; }

function ramp(node: GainNode | null, value: number, seconds = .08): void {
  if (!node || !context) return;
  const now = context.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setTargetAtTime(value, now, seconds);
}

function refreshVolume(): void {
  ramp(master, muted || hidden() ? 0 : ducked ? .23 : .74);
  ramp(ambienceGain, ducked ? .055 : volume['dungeon-ambience'], .3);
}

function stopVoices(): void {
  for (const voice of voices) {
    try { voice.stop(); } catch { /* Already ended. */ }
    voice.disconnect();
  }
  voices.clear();
}

function onVisibility(): void {
  if (hidden()) stopVoices();
  refreshVolume();
}

async function load(clip: Clip): Promise<AudioBuffer | null> {
  if (buffers.has(clip)) return buffers.get(clip)!;
  if (loading.has(clip)) return loading.get(clip)!;
  const c = context;
  if (!c) return null;
  const epoch = generation;
  const task = (async () => {
    try {
      const response = await fetch(`/assets/rpg/audio/${clip}.wav`, { signal: controller?.signal });
      if (!response.ok) return null;
      const buffer = await c.decodeAudioData(await response.arrayBuffer());
      if (epoch !== generation) return null;
      buffers.set(clip, buffer);
      return buffer;
    } catch { return null; } // Sound must never block a spell or the tutor.
  })();
  loading.set(clip, task);
  void task.finally(() => { if (loading.get(clip) === task) loading.delete(clip); });
  return task;
}

/** Call directly from a pointerdown/click/keydown handler, not after an API await.
 * Safe to call repeatedly. Resolves after preload; gameplay need not await it.
 */
export async function unlock(): Promise<void> {
  try {
    if (!context) {
      const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      context = new Audio();
      controller = new AbortController();
      master = context.createGain();
      master.gain.value = muted || hidden() ? 0 : .74;
      // Smooth simultaneous spell/reward peaks without aggressive pumping.
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 3;
      compressor.attack.value = .006;
      compressor.release.value = .22;
      master.connect(compressor).connect(context.destination);
      document.addEventListener('visibilitychange', onVisibility);
      refreshVolume();
    }
    // Invoke resume synchronously within the gesture before any asynchronous work.
    if (context.state === 'suspended') void context.resume().catch(() => {});
    await Promise.all(clips.map(load));
    if (ambienceWanted) startAmbience();
  } catch { /* WebAudio may be disabled or unavailable. */ }
}

/** Muting applies to ambience and active effects; it does not change tutor voice. */
export function setMuted(value: boolean): void {
  muted = value;
  if (value) stopVoices();
  refreshVolume();
}

/** Optional: lower effects and ambience while the existing tutor speaks. */
export function setDucked(value: boolean): void { ducked = value; refreshVolume(); }

function canPlay(): boolean {
  return !!context && !!master && context.state === 'running' && !muted && !hidden();
}

function track(source: AudioBufferSourceNode | OscillatorNode, gain: GainNode): void {
  voices.add(source);
  source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); };
}

/** Tiny soft fallback while a first-use clip downloads. Never queues late sounds. */
function fallback(clip: Clip): void {
  if (!canPlay() || !context || !master) return;
  const c = context;
  const frequency = clip === 'frost-shatter' ? 740 : clip === 'chain-lightning' ? 330 : clip === 'fire-nova' ? 145 : 587;
  const note = c.createOscillator();
  const gain = c.createGain();
  const t = c.currentTime;
  note.type = 'sine';
  note.frequency.setValueAtTime(frequency, t);
  note.frequency.exponentialRampToValueAtTime(frequency * .65, t + .18);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(.055, t + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, t + .26);
  note.connect(gain).connect(master);
  track(note, gain);
  note.start(t); note.stop(t + .28);
}

function play(clip: Clip, pitchVariation = 0): void {
  if (!canPlay() || !context || !master) return;
  const c = context;
  const now = c.currentTime;
  const minInterval = clip === 'footstep' ? .23 : .08;
  if (now - (lastPlayed.get(clip) ?? -Infinity) < minInterval) return;
  lastPlayed.set(clip, now);
  const buffer = buffers.get(clip);
  if (!buffer) { void load(clip); fallback(clip); return; }
  // Keep accidental repeated UI events from building a loud stack.
  if (voices.size >= 12) return;
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 1 + (Math.random() - .5) * pitchVariation;
  const gain = c.createGain(); gain.gain.value = volume[clip];
  source.connect(gain).connect(master);
  track(source, gain);
  source.start(now);
}

/** Clips contain a 220 ms charge, aligned with DungeonWorld.attack's impact. */
export function cast(spellId: RpgSpellId): void {
  play(spellId === 'frost' ? 'frost-shatter' : spellId === 'storm' ? 'chain-lightning' : 'fire-nova');
}
export function loot(): void { play('loot', .035); }
export function levelUp(): void { play('level-up'); }
/** Stone collapse followed by a warm victory interval; call on boss defeat. */
export function boss(): void { play('boss-defeat'); }
export function footstep(): void { play('footstep', .16); }

/** Safe before unlock(); starts after the first gesture/preload, only once. */
export function startAmbience(): void {
  ambienceWanted = true;
  if (ambienceSource || !context || !master) return;
  const epoch = generation;
  const c = context;
  void load('dungeon-ambience').then(buffer => {
    if (!buffer || epoch !== generation || ambienceSource || !ambienceWanted || !master || context !== c) return;
    const source = c.createBufferSource(); source.buffer = buffer; source.loop = true;
    const gain = c.createGain(); gain.gain.value = 0;
    source.connect(gain).connect(master);
    ambienceSource = source; ambienceGain = gain;
    source.start();
    ramp(gain, ducked ? .055 : volume['dungeon-ambience'], .8);
  });
}

/** Call when leaving the RPG. Invalidates pending loads and closes its context. */
export function dispose(): void {
  generation++;
  controller?.abort(); controller = null;
  document.removeEventListener('visibilitychange', onVisibility);
  stopVoices();
  if (ambienceSource) {
    try { ambienceSource.stop(); } catch { /* Already stopped. */ }
    ambienceSource.disconnect(); ambienceSource = null;
  }
  ambienceGain?.disconnect(); ambienceGain = null;
  master?.disconnect(); master = null;
  compressor?.disconnect(); compressor = null;
  const c = context; context = null;
  if (c && c.state !== 'closed') void c.close().catch(() => {});
  loading.clear(); buffers.clear(); lastPlayed.clear();
  ambienceWanted = false; ducked = false;
}
