import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createSuggestionLiveRoutes, suggestionWebsocket } from './suggestions-live';

test('per-IP simultaneous cap, startup timeout and released capacity', async () => {
  const app=new Hono(); app.route('/rpg',createSuggestionLiveRoutes({config:{deepgramKey:'secret'},startupMs:100}));
  const server=Bun.serve({port:0,fetch:app.fetch,websocket:suggestionWebsocket});
  const origin=`http://127.0.0.1:${server.port}`; const url=`ws://127.0.0.1:${server.port}/rpg/suggestions/live`;
  const clients:WebSocket[]=[];
  const connect=()=>new Promise<WebSocket>((resolve,reject)=>{const ws=new WebSocket(url,{headers:{Origin:origin}} as any); ws.onopen=()=>resolve(ws); ws.onerror=()=>reject(Error('rejected'));});
  try {
    for(let i=0;i<3;i++) clients.push(await connect());
    await expect(connect()).rejects.toThrow('rejected');
    await new Promise<void>(resolve=>{clients[0]!.onmessage=e=>{expect(JSON.parse(String(e.data)).type).toBe('error');resolve();};});
    const next=await connect();clients.push(next);
  } finally {for(const c of clients)c.close();server.stop(true);}
});
