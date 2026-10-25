import { afterEach, expect, test } from 'bun:test';
import * as sound from '../../web/src/rpg/sound';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;
let clock = 1;
let madeContexts = 0;
let closedContexts = 0;
let started = 0;
let stopped = 0;
let fetches = 0;
const played: unknown[] = [];
class Param {
  value = 0;
  cancelScheduledValues() {}
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
}
class Node {
  gain = new Param(); playbackRate = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  loop = false; buffer: unknown; onended?: () => void;
  connect(node: Node) { return node; }
  disconnect() {}
  start() { started++; played.push(this.buffer); }
  stop() { stopped++; this.onended?.(); }
}
class Context {
  state = 'suspended'; destination = new Node();
  get currentTime() { return clock; }
  constructor() { madeContexts++; }
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createBufferSource() { return new Node(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; closedContexts++; return Promise.resolve(); }
  // The decoded buffer remembers its file, so a test can see which take played.
  decodeAudioData(data: ArrayBuffer) { return Promise.resolve({ file: new TextDecoder().decode(data) }); }
}
class Document extends EventTarget { hidden = false; }

const files = (id: string, count = 1) => Array.from({ length: count }, (_, n) => ({ file: count === 1 ? `${id}.mp3` : `${id}-${n + 1}.mp3` }));
const MANIFEST = { clips: {
  'cast-ember': { kind: 'sfx', files: files('cast-ember') }, 'cast-frost': { kind: 'sfx', files: files('cast-frost') },
  'cast-storm': { kind: 'sfx', files: files('cast-storm') }, 'relic-pickup': { kind: 'sfx', files: files('relic-pickup') },
  'level-up': { kind: 'sfx', files: files('level-up') }, 'boss-defeat': { kind: 'sfx', files: files('boss-defeat') },
  'hit-fire': { kind: 'sfx', files: files('hit-fire', 3) },
  'amb-vault': { kind: 'loop', files: files('amb-vault') }, 'amb-forest': { kind: 'loop', files: files('amb-forest') },
} };
const EFFECT_FILES = 9;
function install(fetchGate?: Promise<void>): Document {
  const document = new Document();
  globalThis.window = { AudioContext: Context } as unknown as Window & typeof globalThis;
  globalThis.document = document as unknown as globalThis.Document;
  globalThis.fetch = (async (url: string) => {
    fetches++;
    await fetchGate;
    if (url.endsWith('manifest.json')) return { ok: true, json: async () => MANIFEST } as Response;
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(url.split('/').pop()).buffer } as Response;
  }) as typeof fetch;
  return document;
}
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

afterEach(() => {
  sound.dispose();
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
});

test('gesture gating, preload deduplication, mute, tab visibility, and teardown', async () => {
  const document = install();
  sound.setMuted(false);
  sound.cast('ember'); sound.loot(); sound.startAmbience();
  expect(madeContexts).toBe(0);
  expect(fetches).toBe(0);

  await sound.unlock();
  await settle();
  expect(madeContexts).toBe(1);
  expect(fetches).toBe(1 + EFFECT_FILES + 1); // Manifest, every effect, the vault room tone.
  expect(started).toBe(1); // Only the requested ambience, no queued pre-gesture hit.
  await sound.unlock();
  sound.startAmbience();
  await settle();
  expect(fetches).toBe(1 + EFFECT_FILES + 1);
  expect(started).toBe(1);

  sound.cast('ember'); expect(started).toBe(2);
  sound.cast('ember'); expect(started).toBe(2); // Duplicate event suppressed.
  sound.setMuted(true);
  expect(stopped).toBe(1);
  clock++;
  sound.cast('frost'); sound.levelUp(); expect(started).toBe(2);
  sound.setMuted(false);
  sound.cast('frost'); expect(started).toBe(3);

  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(stopped).toBe(2);
  sound.cast('storm'); sound.boss(); expect(started).toBe(3);
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  sound.cast('storm'); expect(started).toBe(4);
  sound.dispose();
  expect(closedContexts).toBe(1);
  expect(stopped).toBe(4); // Storm and ambience stopped on exit.
  sound.loot(); sound.cast('ember'); expect(started).toBe(4);

  await sound.unlock(); // Returning to the game gets a fresh, usable context.
  await settle();
  expect(madeContexts).toBe(2);
  expect(started).toBe(4); // Old ambience request was disposed too.
  sound.loot(); expect(started).toBe(5);
});

test('leaving while clips load cannot restart ambience or play a delayed effect', async () => {
  const before = started;
  let finishFetch!: () => void;
  install(new Promise<void>(resolve => { finishFetch = resolve; }));
  sound.startAmbience();
  const loading = sound.unlock();
  sound.dispose();
  finishFetch();
  await loading;
  await settle();
  expect(started).toBe(before);
});

test('a contact never plays the same take twice in a row', async () => {
  install();
  await sound.unlock();
  played.length = 0;
  for (let i = 0; i < 12; i++) { clock += 1; sound.world('impact-fire'); }
  const takes = played.map(buffer => (buffer as { file: string }).file);
  expect(takes.length).toBe(12);
  expect(new Set(takes).size).toBeGreaterThan(1);
  for (let i = 1; i < takes.length; i++) expect(takes[i]).not.toBe(takes[i - 1]);
});

test('a new environment crossfades to its own room tone, once', async () => {
  install();
  sound.setAmbience('vault');
  await sound.unlock();
  await settle();
  played.length = 0;
  sound.setAmbience('forest');
  await settle();
  sound.setAmbience('forest');
  await settle();
  expect(played.map(buffer => (buffer as { file: string }).file)).toEqual(['amb-forest.mp3']);
});
