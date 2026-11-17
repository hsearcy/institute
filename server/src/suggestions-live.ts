import { Hono } from 'hono';
import { getBunServer, upgradeWebSocket, websocket } from 'hono/bun';
import { sameOrigin, suggestionConfigFromEnv, speechProvider, voiceAvailable, type SuggestionConfig } from './suggestions';

// This handler must be supplied to Bun.serve alongside the Hono fetch function.
export const suggestionWebsocket = { ...websocket, maxPayloadLength: 64 * 1024, backpressureLimit: 256 * 1024, closeOnBackpressureLimit: true, idleTimeout: 75 };
const ENDPOINT = 'wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&channels=1&sample_rate=16000&interim_results=true&punctuate=true&endpointing=300';
const MAX_AUDIO = 5 * 1024 * 1024;
const MAX_FRAME = 64 * 1024;
const UNAVAILABLE = 'Voice is unavailable right now. You can type your idea instead.';

function localBarkUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw Error('Invalid local Bark URL');
  return value;
}

type Options = {
  config?: SuggestionConfig;
  // Injection is for isolated tests; key is present only for explicit Deepgram.
  connect?: (url: string, key?: string) => WebSocket;
  durationMs?: number; startupMs?: number; idleMs?: number; drainMs?: number;
  maxAudio?: number; maxFrame?: number;
};
export function createSuggestionLiveRoutes(options: Options = {}) {
  const config = options.config ?? suggestionConfigFromEnv();
  const connect = options.connect ?? ((url, key) => key
    ? new WebSocket(url, { headers: { Authorization: `Token ${key}` } } as any)
    : new WebSocket(url));
  const app = new Hono();
  let active = 0, windowStart = Date.now(), attempts = 0;
  const ips = new Map<string, number>();
  app.get('/suggestions/live', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    try {
      if (!c.req.header('origin')) return c.json({error:'Send suggestions from Institute.'}, 403);
      sameOrigin(c.req.raw, config);
    } catch { return c.json({error:'Send suggestions from Institute.'}, 403); }
    if (!voiceAvailable(config)) return c.json({error:UNAVAILABLE}, 503);
    if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); attempts = 0; }
    if (++attempts > 60) return c.json({error:'Please wait a minute and try again.'}, 429);
    const ip = (getBunServer(c) as any)?.requestIP(c.req.raw)?.address ?? 'unknown';
    if (active >= 20 || (ips.get(ip) ?? 0) >= 3) return c.json({error:'Please wait a minute and try again.'}, 429);
    c.set('liveIp' as never, ip as never);
    await next();
  }, upgradeWebSocket(c => {
    const ip = c.get('liveIp' as never) as string;
    let up: WebSocket | undefined;
    let phase: 'waiting'|'connecting'|'streaming'|'draining'|'closed' = 'waiting';
    let bytes = 0, frameWindow = Date.now(), frames = 0, totalFrames = 0;
    let startup: ReturnType<typeof setTimeout> | undefined, duration: ReturnType<typeof setTimeout> | undefined;
    let idle: ReturnType<typeof setTimeout> | undefined, drain: ReturnType<typeof setTimeout> | undefined;
    let browser: any;
    let counted = false;
    const clear = () => { clearTimeout(startup); clearTimeout(duration); clearTimeout(idle); clearTimeout(drain); };
    const cleanup = () => {
      if (phase === 'closed') return;
      phase = 'closed'; clear();
      if (counted) { active--; const n = (ips.get(ip) ?? 1) - 1; if (n) ips.set(ip,n); else ips.delete(ip); counted = false; }
      try { up?.close(); } catch {}
    };
    const send = (data: object) => { try { if (browser?.raw?.getBufferedAmount() > 256 * 1024) throw Error('backpressure'); browser?.send(JSON.stringify(data)); } catch { cleanup(); try { browser?.close(); } catch {} } };
    const fail = (message = UNAVAILABLE) => { if (phase === 'closed') return; send({type:'error',message}); cleanup(); try { browser?.close(); } catch {} };
    const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => fail('I could not hear you. Please try again.'), options.idleMs ?? 15_000); };
    const stop = () => {
      if (phase !== 'streaming') { fail(); return; }
      phase = 'draining'; clearTimeout(idle); clearTimeout(duration);
      try { up!.send(JSON.stringify({type:'CloseStream'})); } catch { fail(); return; }
      // Bark budgets 7s including any in-flight interim; browser waits 10s.
      drain = setTimeout(() => fail('I could not finish listening. Please try again.'), options.drainMs ?? 8000);
    };
    return {
      onOpen(_evt, ws) {
        browser = ws; counted = true; active++; ips.set(ip, (ips.get(ip) ?? 0) + 1);
        startup = setTimeout(() => fail(), options.startupMs ?? 8000);
      },
      onMessage(event) {
        if (phase === 'closed') return;
        const data = event.data;
        if (typeof data === 'string') {
          if (data.length > 1024) { fail(); return; }
          let message: any; try { message = JSON.parse(data); } catch { fail(); return; }
          if (phase === 'waiting' && message?.type === 'start' && message.sampleRate === 16000 && Object.keys(message).length === 2) {
            phase = 'connecting';
            try {
              const isDeepgram = speechProvider(config) === 'deepgram';
              up = connect(isDeepgram ? ENDPOINT : localBarkUrl(config.barkUrl ?? 'ws://127.0.0.1:15003/listen'), isDeepgram ? config.deepgramKey!.trim() : undefined);
              up.binaryType = 'arraybuffer';
              up.onopen = () => {
                if (phase !== 'connecting') { up?.close(); return; }
                phase = 'streaming'; clearTimeout(startup); send({type:'ready'}); resetIdle();
                duration = setTimeout(() => {
                  // Let the browser flush its worklet tail before closing the provider.
                  // A non-cooperating client gets only this bounded grace period.
                  if (phase !== 'streaming') return;
                  send({type:'stop_requested'});
                  if (phase === 'streaming') duration = setTimeout(stop, 1500);
                }, options.durationMs ?? 60_000);
              };
              up.onmessage = e => {
                if (phase !== 'streaming' && phase !== 'draining') return;
                if (typeof e.data !== 'string' || e.data.length > 65536) { fail(); return; }
                let result: any; try { result = JSON.parse(e.data); } catch { fail(); return; }
                if (result.type === 'Results') {
                  const text = result.channel?.alternatives?.[0]?.transcript;
                  if (typeof text !== 'string' || text.length > 10000 || typeof result.is_final !== 'boolean') { fail(); return; }
                  send({type:'transcript', text, isFinal:result.is_final});
                }
              };
              up.onerror = () => fail();
              up.onclose = e => {
                if (phase === 'draining' && e.code === 1000) { send({type:'done'}); cleanup(); try { browser?.close(); } catch {} }
                else if (phase !== 'closed') fail();
              };
            } catch { fail(); }
          } else if ((phase === 'streaming' || phase === 'draining') && message?.type === 'stop' && Object.keys(message).length === 1) { if (phase === 'streaming') stop(); }
          else fail();
          return;
        }
        // Audio already in flight when the duration limit fired is discarded, not saved.
        if (phase === 'draining') return;
        const now = Date.now();
        if (now - frameWindow >= 1000) { frameWindow = now; frames = 0; }
        if (++frames > 200 || ++totalFrames > 10000 || phase !== 'streaming' || !(data instanceof ArrayBuffer) || !data.byteLength || data.byteLength % 2 || data.byteLength > (options.maxFrame ?? MAX_FRAME) || (bytes += data.byteLength) > (options.maxAudio ?? MAX_AUDIO) || (up?.bufferedAmount ?? 0) > 256 * 1024) { fail('That recording is too long. Please try again.'); return; }
        try { up!.send(data); resetIdle(); } catch { fail(); }
      },
      onClose() { cleanup(); },
      onError() { fail(); },
    };
  }));
  return app;
}
