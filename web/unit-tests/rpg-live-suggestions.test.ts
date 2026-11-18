import { describe, expect, test } from 'bun:test';
import { LiveSuggestion, PcmResampler, TranscriptSegments, CAPTURE_WORKLET } from '../src/rpg/LiveSuggestion';
import { runInNewContext } from 'node:vm';
describe('live suggestion audio', () => {
  for (const rate of [48000, 44100]) test(`chunk boundaries retain resampling phase at ${rate}`, () => {
    const input = Float32Array.from({ length: 5001 }, (_, i) => Math.sin(i * 0.071));
    const whole = new Uint8Array(new PcmResampler(rate).process(input));
    const resampler = new PcmResampler(rate), chunks: number[] = [];
    for (let i = 0; i < input.length; i += 2) chunks.push(...new Uint8Array(resampler.process(input.slice(i, i + 2))));
    expect(chunks).toEqual([...whole]);
  });
  test('worklet batches capture and flushes the last partial packet', () => {
    const posted: Float32Array[] = [];
    class Processor { port = { onmessage: null as null | ((event: {data: string}) => void), postMessage: (data: Float32Array | {type: string}) => { if (data instanceof Float32Array) posted.push(data); } }; }
    let Capture: any;
    runInNewContext(CAPTURE_WORKLET, { AudioWorkletProcessor: Processor, Float32Array, registerProcessor: (_: string, klass: any) => { Capture = klass; } });
    const capture = new Capture();
    const samples = Float32Array.from({length: 48000}, (_, i) => i / 48000);
    for (let i = 0; i < samples.length; i += 128) capture.process([[samples.slice(i, i + 128)]]);
    expect(posted.length).toBeLessThanOrEqual(24);
    capture.port.onmessage({data: 'flush'});
    expect(posted.flatMap(frame => Array.from(frame))).toEqual(Array.from(samples));
    posted.length = 0;
    const minute = new Capture();
    const quantum = new Float32Array(128);
    for (let i = 0; i < 48000 * 60 / 128; i++) minute.process([[quantum]]);
    minute.port.onmessage({data: 'flush'});
    expect(posted.length).toBeLessThan(10000);
    expect(posted.length).toBeLessThanOrEqual(24 * 60);
  });
  test('stop waits for partial PCM before stop, and cancel blocks late audio', async () => {
    const saved = new Map<string, PropertyDescriptor | undefined>();
    const replace = (name: string, value: unknown) => { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, {configurable: true, writable: true, value}); };
    const sent: any[] = [], track = {stop() {}};
    let socket: any, node: any;
    class Socket { bufferedAmount = 0; onopen: any; onmessage: any; onclose: any; onerror: any; constructor() { socket = this; } send(data: any) { sent.push(data); } close() {} }
    class Node { port = {onmessage: null as any, postMessage: (_: string) => {}}; constructor() { node = this; } connect() {} disconnect() {} }
    class Context { sampleRate = 48000; audioWorklet = {addModule: async () => {}}; destination = {}; createMediaStreamSource() { return {connect() {}}; } async resume() {} async close() {} }
    try {
      replace('navigator', {mediaDevices: {getUserMedia: async () => ({getTracks: () => [track]})}});
      replace('window', {AudioContext: Context}); replace('AudioWorkletNode', Node); replace('WebSocket', Socket); replace('location', {protocol: 'https:', host: 'example.test'});
      const recorder = new LiveSuggestion(() => {}, () => {}, () => {});
      await recorder.start(); socket.onopen(); socket.onmessage({data: JSON.stringify({type:'ready'})});
      recorder.stop(); expect(sent).toHaveLength(1);
      node.port.onmessage({data: new Float32Array(500).fill(0.5)});
      node.port.onmessage({data: {type:'flushed'}});
      expect(sent[1]).toBeInstanceOf(ArrayBuffer); expect(new DataView(sent[1]).getInt16(0, true)).toBe(16383);
      expect(JSON.parse(sent[2]).type).toBe('stop');
      recorder.cancel(); node.port.onmessage({data: new Float32Array(500)}); expect(sent).toHaveLength(3);
    } finally { for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); } }
  });
  test('cold startup waits 95s without audio, Cancel ignores late ready; duration and final wait stay unchanged', async () => {
    const saved = new Map<string, PropertyDescriptor | undefined>();
    const replace = (name: string, value: unknown) => { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, {configurable:true,writable:true,value}); };
    const timers: {callback: () => void; ms: number}[] = [], sent: any[] = [], errors: string[] = [];
    let socket: any, node: any, stopped = 0;
    class Socket { bufferedAmount = 0; onopen: any; onmessage: any; onclose: any; onerror: any; constructor() { socket = this; } send(data: any) { sent.push(data); } close() {} }
    class Context {
      sampleRate = 48000; destination = {};
      createMediaStreamSource() { return {connect() {}}; }
      createScriptProcessor() { node = {connect() {},disconnect() {},onaudioprocess:null}; return node; }
      async resume() {} async close() {}
    }
    const recorder = new LiveSuggestion(() => {}, () => {}, text => errors.push(text));
    try {
      replace('navigator', {mediaDevices:{getUserMedia:async () => ({getTracks:() => [{stop() { stopped++; }}]})}});
      replace('window', {AudioContext:Context}); replace('WebSocket',Socket); replace('location',{protocol:'https:',host:'example.test'});
      replace('setTimeout', (callback: () => void, ms: number) => { timers.push({callback,ms}); return timers.length; });
      replace('clearTimeout', () => {});
      await recorder.start(); socket.onopen();
      expect(timers.at(-1)!.ms).toBe(95_000);
      node.onaudioprocess({inputBuffer:{getChannelData:() => new Float32Array(500)}});
      expect(sent).toHaveLength(1); expect(JSON.parse(sent[0]).type).toBe('start');
      recorder.cancel(); expect(stopped).toBe(1);
      socket.onmessage({data:JSON.stringify({type:'ready'})});
      expect(recorder.state).toBe('idle'); expect(errors).toEqual([]);
      await recorder.start(); socket.onopen(); socket.onmessage({data:JSON.stringify({type:'ready'})});
      expect(recorder.state).toBe('listening'); expect(timers.at(-1)!.ms).toBe(60_000);
      recorder.stop(); expect(stopped).toBe(2); expect(timers.at(-1)!.ms).toBe(10000);
      recorder.cancel();
    } finally {
      recorder.cancel();
      for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis,name,descriptor); else Reflect.deleteProperty(globalThis,name); }
    }
  });
  test('resamples across frame boundaries into little endian signed mono PCM', () => {
    const r = new PcmResampler(48000);
    const a = new DataView(r.process(new Float32Array([0, 0, 0, 1])));
    const b = new DataView(r.process(new Float32Array([1, 1, -1, -1, -1, 0])));
    expect(a.getInt16(0, true)).toBe(0);
    expect(b.getInt16(0, true)).toBe(32767);
    expect(b.getInt16(2, true)).toBe(-32768);
  });
  test('finals append and interim revisions replace', () => {
    const s = new TranscriptSegments();
    expect(s.update('blue', false)).toBe('blue');
    expect(s.update('blue dragon', false)).toBe('blue dragon');
    expect(s.update('blue dragon', true)).toBe('blue dragon');
    expect(s.update('please', false)).toBe('blue dragon please');
    expect(s.update('please now', true)).toBe('blue dragon please now');
  });
});
