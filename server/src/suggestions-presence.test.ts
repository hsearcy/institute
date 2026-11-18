import { expect, test, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { createSuggestionLiveRoutes, suggestionWebsocket } from './suggestions-live';

const clientId = '223e4567-e89b-42d3-a456-426614174000';
const path = '/rpg/suggestions/voice-presence';
const payload = {clientId, active: true};
function fixture(config = {}) {
  const calls: Request[] = [];
  const app = new Hono().route('/rpg', createSuggestionLiveRoutes({config, fetch: (async (url, init) => {
    calls.push(new Request(url, init)); return new Response('', {status:202});
  }) as typeof fetch}));
  const post = (body: unknown = payload, headers: Record<string,string> = {}) => app.request(path, {
    method:'POST', headers:{Origin:'http://localhost','Content-Type':'application/json',...headers}, body:JSON.stringify(body),
  });
  return {app, post, calls};
}

test('presence requires Origin and sameOrigin including configured public origin', async () => {
  const f = fixture({publicOrigin:'https://game.example'});
  for (const headers of ([{}, {Origin:'http://localhost'}, {Origin:'null'}, {Origin:'https://evil.example'}, {Origin:'https://game.example','Sec-Fetch-Site':'cross-site'}] as Record<string,string>[])) {
    const response = await f.app.request(path, {method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
    expect(response.status).toBe(403);
  }
  expect(f.calls).toHaveLength(0);
  expect((await f.post(payload,{Origin:'https://game.example'})).status).toBe(202);
});

test('presence validates UUID without trimming, exact keys, boolean and JSON', async () => {
  const f = fixture();
  for (const body of [null, [], true, {}, {clientId}, {...payload,active:1}, {...payload,active:'true'}, {...payload,clientId:` ${clientId}`}, {...payload,clientId:clientId+'x'}, {...payload,clientId:'not-a-uuid'}, {...payload,url:'http://evil.example'}, {...payload,extra:false}]) {
    expect((await f.post(body)).status).toBe(400);
  }
  expect((await f.app.request(path,{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:'{'})).status).toBe(400);
  expect((await f.post(payload,{'Content-Type':'text/plain'})).status).toBe(415);
  expect(f.calls).toHaveLength(0);
  expect((await f.post({...payload,active:false})).status).toBe(202);
});

test('presence bounds actual streamed bytes and declared length before parsing JSON', async () => {
  const f = fixture();
  for (const headers of ([{}, {'Content-Length':'999999'}, {'Content-Length':'invalid'}] as Record<string,string>[])) {
    expect((await f.app.request(path,{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json',...headers},body:' '.repeat(1025)})).status).toBe(413);
  }
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({pull(controller) { controller.enqueue(new Uint8Array(600)); },cancel() { cancelled = true; }});
  const response = await f.app.request(new Request('http://localhost'+path,{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:stream}));
  expect(response.status).toBe(413); expect(cancelled).toBe(true); expect(f.calls).toHaveLength(0);
});

test('disabled, invalid and Deepgram presence are successful isolated no-ops', async () => {
  for (const speechProvider of ['disabled','invalid','deepgram']) {
    const f = fixture({speechProvider,deepgramKey:'global-secret',barkUrl:'ws://evil.example/listen'});
    expect((await f.post()).status).toBe(202);
    expect((await f.post({...payload,active:false})).status).toBe(202);
    expect(f.calls).toHaveLength(0);
  }
});

test('only validated loopback URL determines presence target and credentials never forwarded', async () => {
  for (const host of ['127.0.0.1','localhost','[::1]']) {
    const f = fixture({barkUrl:`ws://${host}:15003/listen?token=private`,deepgramKey:'global-secret',adminToken:'admin-secret'});
    const response = await f.post(payload,{Authorization:'Bearer browser-secret'});
    expect(response.status).toBe(202); expect(response.headers.get('cache-control')).toBe('no-store');
    const request = f.calls[0]!;
    expect(request.url).toBe(`http://${host}:15003/presence`);
    expect(request.headers.get('authorization')).toBeNull(); expect(request.headers.get('origin')).toBeNull();
    expect(request.redirect).toBe('error'); expect(await request.json()).toEqual(payload);
    expect(await response.text()).not.toContain('secret');
  }
  expect((await fixture().post()).status).toBe(202);
  for (const barkUrl of ['ws://evil.example/listen','wss://127.0.0.1/listen','http://localhost/listen','ws://user:secret@localhost/listen','ws://localhost/listen#secret','not a URL','ws://127.0.0.1.evil.example/listen']) {
    const f = fixture({barkUrl}); const response = await f.post();
    expect(response.status).toBe(503); expect(f.calls).toHaveLength(0); expect(await response.text()).not.toContain(barkUrl);
  }
});

test('manager errors, redirects and timeout stay friendly and bounded even if fetch ignores abort', async () => {
  for (const mode of ['throw','status','hang']) {
    let signal: AbortSignal | undefined;
    const app = new Hono().route('/rpg',createSuggestionLiveRoutes({config:{},fetch:(async (_url, init) => {
      signal = init?.signal ?? undefined;
      if (mode === 'throw') throw Error('private-url-secret');
      if (mode === 'status') return new Response('private-secret',{status:302,headers:{Location:'http://evil.example'}});
      return new Promise<Response>(() => {});
    }) as typeof fetch}));
    const start = Date.now();
    const response = await app.request(path,{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify(payload)});
    expect(response.status).toBe(503); expect(await response.json()).toEqual({error:'Voice is unavailable right now. You can type your idea instead.'});
    expect(Date.now()-start).toBeLessThan(3000);
    if (mode === 'hang') expect(signal?.aborted).toBe(true);
  }
});

test('Bark has an 8s start gate then 90s cold readiness; override and Deepgram timing preserved', async () => {
  expect(suggestionWebsocket.idleTimeout).toBeGreaterThan(95);
  const nativeTimeout = globalThis.setTimeout;
  const timers: {callback: () => void; ms: number | undefined; handle: ReturnType<typeof setTimeout>}[] = [];
  const timeout = spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, ms?: number) => {
    const handle = nativeTimeout(callback, ms); timers.push({callback,ms,handle}); return handle;
  }) as typeof setTimeout);
  try {
    for (const scenario of [
      {provider:'bark',start:false,expected:[8000]},
      {provider:'bark',start:true,expected:[8000,90_000]},
      {provider:'bark',start:true,startupMs:1234,expected:[1234,1234]},
      {provider:'deepgram',start:true,expected:[8000]},
    ]) {
      let connected!: () => void;
      const connection = new Promise<void>(resolve => { connected = resolve; });
      const upstream = {close() {},binaryType:'',onopen:undefined as undefined | (() => void)};
      const app = new Hono().route('/rpg',createSuggestionLiveRoutes({
        config:{speechProvider:scenario.provider,deepgramKey:'test-key'},startupMs:scenario.startupMs,
        connect:() => { connected(); return upstream as unknown as WebSocket; },
      }));
      const server = Bun.serve({port:0,fetch:app.fetch,websocket:suggestionWebsocket});
      let client: WebSocket | undefined;
      const offset = timers.length;
      try {
        client = new WebSocket(`ws://127.0.0.1:${server.port}/rpg/suggestions/live`,{headers:{Origin:`http://127.0.0.1:${server.port}`}} as any);
        await new Promise<void>((resolve,reject) => { client!.onopen = () => resolve(); client!.onerror = () => reject(Error('open failed')); });
        if (scenario.start) { client.send(JSON.stringify({type:'start',sampleRate:16000})); await connection; }
        expect(timers.slice(offset).map(timer => timer.ms)).toEqual(scenario.expected);
        const response = new Promise<any>(resolve => { client!.onmessage = event => resolve(JSON.parse(String(event.data))); });
        // Fire the actual installed deadline, without sleeping through a cold worker startup.
        timers.at(-1)!.callback();
        expect((await response).type).toBe('error');
        upstream.onopen?.(); // A late worker cannot send ready after the deadline.
      } finally { client?.close(); server.stop(true); }
    }
  } finally { timeout.mockRestore(); for (const timer of timers) clearTimeout(timer.handle); }
});
