import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createSuggestionLiveRoutes, suggestionWebsocket } from './suggestions-live';

test('automatic duration requests and accepts a final client audio flush before closing provider', async () => {
  const audio: number[] = [];
  const provider = Bun.serve({ port:0, fetch(req, s) { if (s.upgrade(req)) return; return new Response('', {status:400}); }, websocket: {
    message(ws, data) {
      if (typeof data !== 'string') audio.push(...new Uint8Array(data));
      else if (JSON.parse(data).type === 'CloseStream') {
        ws.send(JSON.stringify({type:'Results',is_final:true,channel:{alternatives:[{transcript:audio.length === 6 ? 'complete last word' : 'truncated'}]}})); ws.close();
      }
    },
  }});
  const app = new Hono();
  app.route('/rpg', createSuggestionLiveRoutes({config:{deepgramKey:'fake'},durationMs:30,connect:()=>new WebSocket(`ws://127.0.0.1:${provider.port}`)}));
  const server = Bun.serve({port:0,fetch:app.fetch,websocket:suggestionWebsocket});
  const client = new WebSocket(`ws://127.0.0.1:${server.port}/rpg/suggestions/live`, {headers:{Origin:`http://127.0.0.1:${server.port}`}} as any);
  const messages: any[] = [];
  try {
    await new Promise<void>((resolve,reject)=>{
      client.onerror=()=>reject(Error('connection failed'));
      client.onopen=()=>client.send(JSON.stringify({type:'start',sampleRate:16000}));
      client.onmessage=e=>{
        const m=JSON.parse(String(e.data)); messages.push(m);
        if(m.type==='ready') client.send(new Uint8Array([1,2,3,4]));
        if(m.type==='stop_requested') { client.send(new Uint8Array([5,6])); client.send(JSON.stringify({type:'stop'})); }
        if(m.type==='done') resolve();
        if(m.type==='error') reject(Error(m.message));
      };
    });
    expect(messages.some(m=>m.type==='stop_requested')).toBe(true);
    expect(audio).toEqual([1,2,3,4,5,6]);
    expect(messages.find(m=>m.type==='transcript')?.text).toBe('complete last word');
  } finally { client.close(); server.stop(true); provider.stop(true); }
});
