/** Dungeon audio: ElevenLabs-generated clips (scripts/audio/generate_rpg_sfx.py).
 * Nothing plays until unlock() is called by a gesture.
 * Presentation only: audio completion and elapsed time never advance learning.
 */
import type { RpgEnvironment, RpgSchoolId, RpgSpellId } from '@institute/shared';

const BASE = '/assets/rpg/audio/sfx/';
type Manifest = { clips: Record<string, { kind: 'sfx' | 'ui' | 'loop'; files: { file: string }[] }> };

/** Clip level in the mix; the files are already leveled by loudness per group. */
const VOLUME: Record<string, number> = {
  'hit-frost': 1.5, 'hit-heavy': .85, 'hit-blade': .75, 'hit-fire': .7, 'hit-storm': .7,
  'blast-fire': .8, 'blast-frost': .9, 'blast-storm': .8,
  swing: .32, ward: .5, collapse: .5, alert: .55, step: .32, soul: .32,
  'lurk-rattle': .5, 'lurk-growl': .42, 'lurk-scrape': .4,
  'charge-ember': .45, 'charge-frost': .5, 'charge-storm': .5,
  'relic-drop': .7, 'chest-open': .75, 'relic-pickup': .6, reward: .5, 'room-clear': .6, 'level-up': .75, 'boss-defeat': .85,
  'break-wood': .62, 'break-pottery': .6, 'dust-pickup': .5, 'elite-alert': .7, 'elite-defeat': .75,
  'ui-click': .45, 'ui-select': .5, 'ui-open': .35, 'answer-correct': .55, 'answer-wrong': .5,
};
const CAST_VOLUME = .72, AMBIENCE_VOLUME = .38;
/** Frequent events: never stack the same clip closer than this. */
const MIN_GAP: Record<string, number> = { 'break-wood': .05, 'break-pottery': .05, step: .16, 'hit-fire': .05, 'hit-frost': .05, 'hit-storm': .05, 'hit-blade': .05, soul: .05, 'ui-click': .06 };
const SPELL_CAST: Record<RpgSpellId, string> = {
  ember: 'cast-ember', cleave: 'cast-cleave', meteor: 'cast-meteor', phoenix_dive: 'cast-phoenix', firestorm: 'cast-firestorm',
  frost: 'cast-frost', ice_lance: 'cast-ice-lance', glacial_surge: 'cast-glacial-surge', blizzard: 'cast-blizzard', frost_guardian: 'cast-frost-guardian',
  storm: 'cast-storm', arc_lance: 'cast-arc-lance', thunderclap: 'cast-thunderclap', ball_lightning: 'cast-ball-lightning', tempest: 'cast-tempest',
};

let context: AudioContext | null = null;
let master: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let muted = false;
let ducked = false;
let generation = 0;
let controller: AbortController | null = null;
let manifest: Promise<Manifest | null> | null = null;
let clips: Manifest['clips'] | null = null;
let ambienceWanted: RpgEnvironment | null = null;
let ambience: { environment: RpgEnvironment; source: AudioBufferSourceNode; gain: GainNode } | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const voices = new Set<AudioBufferSourceNode>();
const lastPlayed = new Map<string, number>();
const lastVariant = new Map<string, number>();

function hidden(): boolean { return typeof document !== 'undefined' && document.hidden; }

function ramp(node: GainNode | null, value: number, seconds = .08): void {
  if (!node || !context) return;
  const now = context.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setTargetAtTime(value, now, seconds);
}

function refreshVolume(): void {
  ramp(master, muted || hidden() ? 0 : ducked ? .3 : .8);
  if (ambience) ramp(ambience.gain, ducked ? AMBIENCE_VOLUME * .35 : AMBIENCE_VOLUME, .3);
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

function loadManifest(): Promise<Manifest | null> {
  const epoch = generation;
  manifest ??= fetch(`${BASE}manifest.json`, { signal: controller?.signal })
    .then(response => response.ok ? response.json() as Promise<Manifest> : null)
    .then(data => { if (data && epoch === generation) clips = data.clips; return data; })
    .catch(() => null);
  return manifest;
}

async function load(file: string): Promise<AudioBuffer | null> {
  if (buffers.has(file)) return buffers.get(file)!;
  if (loading.has(file)) return loading.get(file)!;
  const c = context;
  if (!c) return null;
  const epoch = generation;
  const task = (async () => {
    try {
      const response = await fetch(BASE + file, { signal: controller?.signal });
      if (!response.ok) return null;
      const buffer = await c.decodeAudioData(await response.arrayBuffer());
      if (epoch !== generation) return null;
      buffers.set(file, buffer);
      return buffer;
    } catch { return null; } // Sound must never block a spell or the tutor.
  })();
  loading.set(file, task);
  void task.finally(() => { if (loading.get(file) === task) loading.delete(file); });
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
      master.gain.value = muted || hidden() ? 0 : .8;
      // Smooth simultaneous spell and reward peaks without audible pumping.
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 14;
      compressor.ratio.value = 4;
      compressor.attack.value = .004;
      compressor.release.value = .2;
      master.connect(compressor).connect(context.destination);
      document.addEventListener('visibilitychange', onVisibility);
      refreshVolume();
    }
    // Invoke resume synchronously within the gesture before any asynchronous work.
    if (context.state === 'suspended') void context.resume().catch(() => {});
    const all = (await loadManifest())?.clips ?? {};
    // Effects first, so the first spell has its sound; ambience streams in after.
    const files = Object.values(all).filter(clip => clip.kind !== 'loop').flatMap(clip => clip.files.map(entry => entry.file));
    await Promise.all(files.map(load));
    if (ambienceWanted) setAmbience(ambienceWanted);
  } catch { /* WebAudio may be disabled or unavailable. */ }
}

/** Muting applies to ambience and active effects; it does not change tutor voice. */
export function setMuted(value: boolean): void {
  muted = value;
  if (value) stopVoices();
  refreshVolume();
}

/** Lower effects and ambience while the tutor speaks. */
export function setDucked(value: boolean): void { ducked = value; refreshVolume(); }

function canPlay(): boolean {
  return !!context && !!master && context.state === 'running' && !muted && !hidden();
}

/** Plays a random variant of a clip, never the same take twice in a row. */
function play(id: string, options: { volume?: number; pitch?: number; delay?: number; pan?: number } = {}): void {
  if (!canPlay() || !context || !master) return;
  const c = context, now = c.currentTime;
  if (now - (lastPlayed.get(id) ?? -Infinity) < (MIN_GAP[id] ?? .08)) return;
  // Before the manifest arrives there is nothing to play; never queue a late sound.
  if (!clips) { void loadManifest(); return; }
  const files = clips[id]?.files;
  if (!files?.length) return;
  lastPlayed.set(id, now);
  let index = Math.floor(Math.random() * files.length);
  if (files.length > 1 && index === lastVariant.get(id)) index = (index + 1) % files.length;
  const buffer = buffers.get(files[index]!.file);
  // A clip still downloading is skipped, never played late.
  if (!buffer) { void load(files[index]!.file); return; }
  // Keep a burst of contacts from building a loud stack.
  if (voices.size >= 18) return;
  lastVariant.set(id, index);
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 1 + (Math.random() - .5) * (options.pitch ?? .08);
  const gain = c.createGain(); gain.gain.value = (options.volume ?? 1) * (VOLUME[id] ?? (id.startsWith('cast-') ? CAST_VOLUME : .6));
  const panner = options.pan && c.createStereoPanner ? c.createStereoPanner() : null;
  if (panner) { panner.pan.value = Math.max(-1, Math.min(1, options.pan!)); source.connect(gain).connect(panner).connect(master!); }
  else source.connect(gain).connect(master!);
  voices.add(source);
  source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); panner?.disconnect(); };
  source.start(now + (options.delay ?? 0));
}

/** Called as the cast clip starts; each spell has its own sound. */
export function cast(spellId: RpgSpellId): void { play(SPELL_CAST[spellId] ?? 'cast-ember', { pitch: .04 }); }
/** A relic picked up from the floor. */
export function loot(): void { play('relic-pickup'); }
export function levelUp(): void { play('level-up', { pitch: 0 }); }
/** Quest, level and daily-board rewards. */
export function rewardFanfare(kind: 'quest' | 'level' | 'daily-board'): void {
  play(kind === 'level' ? 'level-up' : 'room-clear', { pitch: 0 });
  if (kind !== 'level') play('reward', { delay: .25 });
}
/** The guardian falls. */
export function boss(): void { play('boss-defeat', { pitch: 0 }); }
/** Gold, gems and XP from a spell. */
export function reward(): void { play('reward'); }
export function footstep(): void { play('step', { pitch: .14 }); }
export function ui(kind: 'click' | 'select' | 'open'): void { play(`ui-${kind}`, { pitch: .04 }); }
/** A right answer chimes; a wrong one is a soft, friendly tock. */
export function answer(correct: boolean): void { play(correct ? 'answer-correct' : 'answer-wrong', { pitch: 0 }); }

/** World events. Combat sounds never signal harm to the hero: wards and enemy hits only. */
export type WorldSound =
  | 'impact-fire' | 'impact-frost' | 'impact-storm' | 'impact-blade' | 'impact-heavy'
  | 'blast-fire' | 'blast-frost' | 'blast-storm'
  | 'charge-ember' | 'charge-frost' | 'charge-storm'
  | 'ward' | 'swing' | 'soul' | 'collapse' | 'step' | 'alert' | 'room-clear' | 'relic-drop' | 'chest-open'
  | 'break-wood' | 'break-pottery' | 'dust-pickup' | 'elite-alert' | 'elite-defeat';
export function world(kind: WorldSound): void {
  if (kind.startsWith('impact-')) { play(kind.replace('impact-', 'hit-'), { pitch: .12 }); return; }
  if (kind === 'step') { footstep(); return; }
  play(kind, { pitch: kind === 'soul' ? .3 : kind === 'room-clear' ? 0 : .08 });
}
const LURK = ['lurk-rattle', 'lurk-rattle', 'lurk-growl', 'lurk-scrape'] as const;
/**
 * An unseen pack stirs: a bone rattle, a low growl or a blade scraping stone.
 * `gain` (0..1) rises as the hero comes near; `pan` (-1..1) is its side of the screen.
 */
export function lurk(gain: number, pan: number): void {
  if (gain <= 0) return;
  play(LURK[Math.floor(Math.random() * LURK.length)]!, { volume: Math.min(1, gain), pan, pitch: .12 });
}
export const chargeSound = (school: RpgSchoolId): WorldSound => `charge-${school}`;

/** The room tone for an environment; crossfades when the environment changes. Safe before unlock(). */
export function setAmbience(environment: RpgEnvironment): void {
  ambienceWanted = environment;
  if (!context || !master || ambience?.environment === environment) return;
  const c = context, epoch = generation;
  void loadManifest().then(data => {
    const file = data?.clips[`amb-${environment}`]?.files[0]?.file;
    return file ? load(file) : null;
  }).then(buffer => {
    if (!buffer || epoch !== generation || ambienceWanted !== environment || ambience?.environment === environment || !master || context !== c) return;
    const old = ambience;
    if (old) {
      ramp(old.gain, 0, .5);
      setTimeout(() => { try { old.source.stop(); } catch { /* Already stopped. */ } old.source.disconnect(); old.gain.disconnect(); }, 2500);
    }
    const source = c.createBufferSource(); source.buffer = buffer; source.loop = true;
    const gain = c.createGain(); gain.gain.value = 0;
    source.connect(gain).connect(master);
    ambience = { environment, source, gain };
    source.start();
    ramp(gain, ducked ? AMBIENCE_VOLUME * .35 : AMBIENCE_VOLUME, .8);
  });
}

/** Starts the room tone of the last environment set, or the vault. */
export function startAmbience(): void { setAmbience(ambienceWanted ?? 'vault'); }

/** Call when leaving the RPG. Invalidates pending loads and closes its context. */
export function dispose(): void {
  generation++;
  controller?.abort(); controller = null;
  document.removeEventListener('visibilitychange', onVisibility);
  stopVoices();
  if (ambience) {
    try { ambience.source.stop(); } catch { /* Already stopped. */ }
    ambience.source.disconnect(); ambience.gain.disconnect(); ambience = null;
  }
  master?.disconnect(); master = null;
  compressor?.disconnect(); compressor = null;
  const c = context; context = null;
  if (c && c.state !== 'closed') void c.close().catch(() => {});
  loading.clear(); buffers.clear(); lastPlayed.clear(); lastVariant.clear();
  manifest = null; clips = null; ambienceWanted = null; ducked = false;
}
