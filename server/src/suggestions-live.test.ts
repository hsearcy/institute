import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createSuggestionLiveRoutes, suggestionWebsocket } from './suggestions-live';

test('live proxy forwards audio and drains final transcript without exposing the key', async () => {
  const audio: number[] = [];
  const fake = Bun.serve({ port: 0, fetch(req, server) { expect(req.headers.get('authorization')).toBe('Token private-test-key'); if (server.upgrade(req)) return; return new Response('', {status: 400}); }, websocket: {
    message(ws, data) { if (typeof data !== 'string') { audio.push(...new Uint8Array(data)); ws.send(JSON.stringify({type:'Results',is_final:false,channel:{alternatives:[{transcript:'hello'}]}})); } else if (JSON.parse(data).type === 'CloseStream') { ws.send(JSON.stringify({type:'Results',is_final:true,channel:{alternatives:[{transcript:'hello world'}]}})); ws.close(); } },
  }});
  const app = new Hono();
  app.route('/rpg', createSuggestionLiveRoutes({config:{deepgramKey:'private-test-key'}, connect: (url, key) => { expect(url).toBe('wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&channels=1&sample_rate=16000&interim_results=true&punctuate=true&endpointing=300'); return new WebSocket(`ws://127.0.0.1:${fake.port}`, {headers:{Authorization:`Token ${key}`}} as any); }}));
  const server = Bun.serve({port:0, fetch:app.fetch, websocket:suggestionWebsocket});
  try {
    const messages: any[] = [];
    const client = new WebSocket(`ws://127.0.0.1:${server.port}/rpg/suggestions/live`, {headers:{Origin:`http://127.0.0.1:${server.port}`}} as any);
    const done = new Promise<void>((resolve, reject) => { client.onerror = () => reject(Error('client error')); client.onopen = () => client.send(JSON.stringify({type:'start',sampleRate:16000})); client.onmessage = e => { const m=JSON.parse(String(e.data)); messages.push(m); if(m.type==='ready') client.send(new Uint8Array([1,2,3,4])); if(m.type==='transcript' && !m.isFinal) client.send(JSON.stringify({type:'stop'})); if(m.type==='done') resolve(); }; });
    await Promise.race([done, Bun.sleep(3000).then(() => {throw Error('timeout')})]);
    expect(audio).toEqual([1,2,3,4]);
    expect(messages).toEqual([{type:'ready'},{type:'transcript',text:'hello',isFinal:false},{type:'transcript',text:'hello world',isFinal:true},{type:'done'}]);
    expect(JSON.stringify(messages)).not.toContain('private-test-key');
    client.close();
  } finally { server.stop(true); fake.stop(true); }
});
