import { expect, test } from 'bun:test';
import { VoicePresence } from '../src/rpg/VoicePresence';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture() {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const window = new EventTarget();
  let now = 0, nextId = 0;
  const timers = new Set<() => void>();
  const calls: { url: string; init: RequestInit; body: {clientId: string; active: boolean}; resolve: () => void; reject: () => void }[] = [];
  const options = {
    document, window, now: () => now,
    uuid: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`,
    setInterval: (fn: () => void, ms: number) => { expect(ms).toBe(25_000); timers.add(fn); return fn; },
    clearInterval: (fn: () => void) => { timers.delete(fn); },
    fetch: (url: string, init: RequestInit) => new Promise<void>((resolve, reject) => {
      calls.push({url, init, body: JSON.parse(String(init.body)), resolve, reject: () => reject(Error('offline'))});
    }),
  };
  return {
    options, calls, timers, document, window,
    tick(ms = 25_000) { now += ms; for (const fn of timers) fn(); },
    activity(type = 'pointermove') { document.dispatchEvent(new Event(type)); },
    visible(value: boolean) { document.visibilityState = value ? 'visible' : 'hidden'; document.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('default browser timers are called without a VoicePresence receiver', () => {
  const f = fixture();
  const savedSet = globalThis.setInterval, savedClear = globalThis.clearInterval;
  const {setInterval: _set, clearInterval: _clear, ...options} = f.options;
  let starts = 0, stops = 0;
  try {
    globalThis.setInterval = function(this: unknown, callback: () => void, ms: number) {
      if (this !== undefined && this !== globalThis) throw TypeError('Illegal invocation');
      starts++; return f.options.setInterval(callback, ms);
    } as any;
    globalThis.clearInterval = function(this: unknown, timer: any) {
      if (this !== undefined && this !== globalThis) throw TypeError('Illegal invocation');
      stops++; f.options.clearInterval(timer);
    } as any;
    const presence = new VoicePresence(options);
    presence.start(); presence.dispose();
    expect(starts).toBe(1); expect(stops).toBe(1); expect(f.timers.size).toBe(0);
  } finally { globalThis.setInterval = savedSet; globalThis.clearInterval = savedClear; }
});

test('immediate same-origin heartbeat, no overlap and visible recent activity only', async () => {
  const f = fixture(), presence = new VoicePresence(f.options);
  presence.start(); presence.start();
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]!.url).toBe('/rpg/suggestions/voice-presence');
  expect(f.calls[0]!.init.method).toBe('POST');
  expect(f.calls[0]!.body.active).toBe(true);
  f.tick(); f.activity(); expect(f.calls).toHaveLength(1);
  f.calls[0]!.resolve(); await flush(); f.tick();
  expect(f.calls).toHaveLength(2);
  f.calls[1]!.resolve(); await flush();
  f.tick(300_000);
  expect(f.calls.at(-1)!.body.active).toBe(false);
  expect(f.calls.at(-1)!.init.keepalive).toBe(true);
  f.calls.at(-1)!.resolve(); await flush(); f.tick();
  expect(f.calls).toHaveLength(3);
  f.activity('keydown'); expect(f.calls.at(-1)!.body.active).toBe(true);
  presence.dispose();
});

test('hidden/pagehide release own lease, late completions cannot revive or clear replacement', async () => {
  const f = fixture(), presence = new VoicePresence(f.options);
  presence.start(); const old = f.calls[0]!;
  f.visible(false);
  expect(old.init.signal!.aborted).toBe(true);
  expect(f.calls[1]!.body).toEqual({...old.body, active: false});
  expect(f.calls[1]!.init.keepalive).toBe(true);
  f.visible(true); expect(f.calls).toHaveLength(2);
  old.resolve(); await flush(); f.tick(); expect(f.calls).toHaveLength(2);
  f.calls[1]!.resolve(); await flush();
  expect(f.calls[2]!.body.active).toBe(true);
  f.window.dispatchEvent(new Event('pagehide'));
  expect(f.calls[3]!.body).toEqual({...old.body, active: false});
  f.calls[2]!.resolve(); f.calls[3]!.resolve(); await flush();
  f.tick(); expect(f.calls).toHaveLength(4);
  f.window.dispatchEvent(new Event('pageshow')); expect(f.calls[4]!.body.active).toBe(true);
  presence.dispose();
});

test('initially hidden, visible return refreshes activity; all interaction types wake idle presence', async () => {
  const f = fixture(); f.visible(false);
  const presence = new VoicePresence(f.options); presence.start();
  expect(f.calls).toHaveLength(0);
  f.tick(400_000); f.visible(true); expect(f.calls).toHaveLength(1);
  for (const type of ['mousemove', 'mousedown', 'pointermove', 'pointerdown', 'keydown', 'touchstart']) {
    f.calls.at(-1)!.resolve(); await flush(); f.tick(300_000);
    expect(f.calls.at(-1)!.body.active).toBe(false);
    f.calls.at(-1)!.resolve(); await flush();
    f.activity(type); expect(f.calls.at(-1)!.body.active).toBe(true);
  }
  presence.dispose();
});

test('multi-instance IDs isolated; stop/dispose remove timers/listeners and ignore failures', async () => {
  const f = fixture(), one = new VoicePresence(f.options), two = new VoicePresence(f.options);
  one.start(); two.start();
  expect(f.calls[0]!.body.clientId).not.toBe(f.calls[1]!.body.clientId);
  one.stop(); expect(f.calls[2]!.body).toEqual({...f.calls[0]!.body, active: false});
  expect(f.timers.size).toBe(1);
  f.calls[0]!.reject(); f.calls[1]!.reject(); f.calls[2]!.resolve(); await flush();
  f.tick(); expect(f.calls[3]!.body).toEqual(f.calls[1]!.body);
  two.dispose(); two.dispose(); expect(f.timers.size).toBe(0);
  const count = f.calls.length;
  f.activity(); f.visible(false); f.visible(true); f.window.dispatchEvent(new Event('pageshow')); f.window.dispatchEvent(new Event('pagehide')); f.tick();
  for (const call of f.calls) call.resolve(); await flush();
  expect(f.calls).toHaveLength(count);
});
