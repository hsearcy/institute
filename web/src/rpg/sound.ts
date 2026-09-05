/** Original dungeon audio. Nothing plays until unlock() is called by a gesture.
 * Presentation only: audio completion and elapsed time never advance learning.
 */
import { rpgSpellSchool, type RpgSpellId } from '@institute/shared';

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

/** Short original tonal signatures give the expanded abilities their own
 * cadence above the recorded impact beds. Voices share mute/duck/teardown. */
const signatures: Partial<Record<RpgSpellId, {notes:number[]; end:number; gap:number; duration:number; gain:number; wave:OscillatorType}>> = {
  cleave:{notes:[330,185],end:.28,gap:.13,duration:.2,gain:.055,wave:'triangle'},
  meteor:{notes:[95,54],end:.22,gap:.38,duration:.55,gain:.09,wave:'sine'},
  phoenix_dive:{notes:[196,294,440,588],end:1.6,gap:.15,duration:.4,gain:.033,wave:'triangle'},
  firestorm:{notes:[85,110,76,135,95,150],end:.35,gap:.18,duration:.3,gain:.038,wave:'triangle'},
  ice_lance:{notes:[1175,1760],end:.78,gap:.09,duration:.42,gain:.035,wave:'sine'},
  glacial_surge:{notes:[110,165,220],end:.5,gap:.18,duration:.5,gain:.045,wave:'triangle'},
  blizzard:{notes:[880,1318,987,1480,1109,1661],end:.86,gap:.13,duration:.33,gain:.022,wave:'sine'},
  frost_guardian:{notes:[73,110,146],end:.6,gap:.16,duration:.65,gain:.07,wave:'triangle'},
  arc_lance:{notes:[740,1480],end:.3,gap:.055,duration:.22,gain:.035,wave:'sawtooth'},
  thunderclap:{notes:[65,49,38],end:.22,gap:.24,duration:.5,gain:.085,wave:'sine'},
  ball_lightning:{notes:[330,494,659,494,330],end:1.12,gap:.21,duration:.21,gain:.03,wave:'triangle'},
  tempest:{notes:[98,440,73,588,65,740],end:.35,gap:.16,duration:.4,gain:.035,wave:'triangle'},
};
const lastSignature = new Map<RpgSpellId,number>();
function playSignature(spellId:RpgSpellId):void {
  const spec=signatures[spellId];
  if (!spec || !canPlay() || !context || !master) return;
  const now=context.currentTime;
  if(now-(lastSignature.get(spellId)??-Infinity)<.12)return;
  lastSignature.set(spellId,now);
  spec.notes.forEach((frequency,index)=>{
    if(voices.size>=12)return;
    const source=context!.createOscillator(),gain=context!.createGain(),at=now+.16+index*spec.gap;
    source.type=spec.wave;
    source.frequency.setValueAtTime(frequency,at);
    source.frequency.exponentialRampToValueAtTime(Math.max(20,frequency*spec.end),at+spec.duration);
    gain.gain.setValueAtTime(0,at);
    gain.gain.linearRampToValueAtTime(spec.gain,at+.013);
    gain.gain.exponentialRampToValueAtTime(.0001,at+spec.duration);
    source.connect(gain).connect(master!);track(source,gain);
    source.start(at);source.stop(at+spec.duration+.02);
  });
}

/** Clips contain a 220 ms charge, aligned with DungeonWorld.attack's impact. */
export function cast(spellId: RpgSpellId): void {
  const school = rpgSpellSchool(spellId);
  play(school === 'frost' ? 'frost-shatter' : school === 'storm' ? 'chain-lightning' : 'fire-nova');
  playSignature(spellId);
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
  loading.clear(); buffers.clear(); lastPlayed.clear(); lastSignature.clear();
  ambienceWanted = false; ducked = false;
}
