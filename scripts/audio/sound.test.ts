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
class Param {
  value = 0;
  cancelScheduledValues() {}
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
}
class Node {
  gain = new Param(); frequency = new Param(); playbackRate = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  loop = false; buffer: unknown; onended?: () => void;
  connect(node: Node) { return node; }
  disconnect() {}
  start() { started++; }
  stop() { stopped++; this.onended?.(); }
}
class Context {
  state = 'suspended'; destination = new Node();
  get currentTime() { return clock; }
  constructor() { madeContexts++; }
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createBufferSource() { return new Node(); }
  createOscillator() { return new Node(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; closedContexts++; return Promise.resolve(); }
  decodeAudioData() { return Promise.resolve({ duration: 1 }); }
}
class Document extends EventTarget { hidden = false; }

afterEach(() => {
  sound.dispose();
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
});

test('gesture gating, preload deduplication, mute, tab visibility, and teardown', async () => {
  const document = new Document();
  globalThis.window = { AudioContext: Context } as unknown as Window & typeof globalThis;
  globalThis.document = document as unknown as globalThis.Document;
  globalThis.fetch = (async () => {
    fetches++;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response;
  }) as typeof fetch;
  sound.setMuted(false);
  sound.cast('ember'); sound.loot(); sound.startAmbience();
  expect(madeContexts).toBe(0);
  expect(fetches).toBe(0);

  await sound.unlock();
  await Promise.resolve();
  expect(madeContexts).toBe(1);
  expect(fetches).toBe(8);
  expect(started).toBe(1); // Only the requested ambience, no queued pre-gesture hit.
  await sound.unlock();
  sound.startAmbience();
  await Promise.resolve();
  expect(fetches).toBe(8);
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
  expect(madeContexts).toBe(2);
  expect(started).toBe(4); // Old ambience request was disposed too.
  sound.loot(); expect(started).toBe(5);
});

test('leaving while clips load cannot restart ambience or play a delayed effect', async () => {
  const before = started;
  let finishFetch!: () => void;
  const gate = new Promise<void>(resolve => { finishFetch = resolve; });
  globalThis.window = { AudioContext: Context } as unknown as Window & typeof globalThis;
  globalThis.document = new Document() as unknown as globalThis.Document;
  globalThis.fetch = (async () => {
    await gate;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response;
  }) as typeof fetch;
  sound.startAmbience();
  const loading = sound.unlock();
  sound.dispose();
  finishFetch();
  await loading;
  await Promise.resolve();
  expect(started).toBe(before);
});
