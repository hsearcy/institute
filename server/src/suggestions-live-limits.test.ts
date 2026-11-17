import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createSuggestionLiveRoutes, suggestionWebsocket } from './suggestions-live';

test('origin is mandatory, configured public origin authoritative, and attempts rate limited', async () => {
  const app = new Hono(); app.route('/rpg', createSuggestionLiveRoutes({config:{speechProvider:'deepgram',deepgramKey:'secret',publicOrigin:'https://institute.example'}}));
  const server = Bun.serve({port:0,fetch:app.fetch,websocket:suggestionWebsocket});
  try {
    const url = `http://127.0.0.1:${server.port}/rpg/suggestions/live`;
    expect((await fetch(url)).status).toBe(403);
    expect((await fetch(url,{headers:{Origin:'https://evil.example'}})).status).toBe(403);
    expect((await fetch(url,{headers:{Origin:'https://institute.example','Sec-Fetch-Site':'cross-site'}})).status).toBe(403);
    for (let i=0; i<60; i++) await fetch(url,{headers:{Origin:'https://institute.example'}});
    expect((await fetch(url,{headers:{Origin:'https://institute.example'}})).status).toBe(429);
  } finally { server.stop(true); }
});

test('byte budget rejects audio and closes upstream; cancellation never finalizes', async () => {
  let closes = 0; const controls: string[] = [];
  const fake = Bun.serve({port:0,fetch(req,s) {if(s.upgrade(req)) return; return new Response('',{status:400});},websocket:{message(_ws,d){if(typeof d==='string') controls.push(d);},close(){closes++;}}});
  const app = new Hono(); app.route('/rpg',createSuggestionLiveRoutes({config:{speechProvider:'deepgram',deepgramKey:'secret'},maxAudio:4,connect: () => new WebSocket(`ws://127.0.0.1:${fake.port}`)}));
  const server = Bun.serve({port:0,fetch:app.fetch,websocket:suggestionWebsocket});
  const open = () => new WebSocket(`ws://127.0.0.1:${server.port}/rpg/suggestions/live`,{headers:{Origin:`http://127.0.0.1:${server.port}`}} as any);
  try {
    const one = open();
    await new Promise<void>((resolve,reject) => { one.onerror=()=>reject(Error('connection failed')); one.onopen=()=>one.send(JSON.stringify({type:'start',sampleRate:16000})); one.onmessage=e=>{const m=JSON.parse(String(e.data)); if(m.type==='ready') {one.send(new Uint8Array(4));one.send(new Uint8Array(2));} if(m.type==='error') resolve();}; });
    const two = open();
    await new Promise<void>((resolve,reject) => {two.onerror=()=>reject(Error('connection failed')); two.onopen=()=>two.send(JSON.stringify({type:'start',sampleRate:16000})); two.onmessage=e=>{if(JSON.parse(String(e.data)).type==='ready'){two.close();resolve();}};});
    for (let i=0;i<50 && closes<2;i++) await Bun.sleep(10);
    expect(closes).toBe(2); expect(controls).toEqual([]);
  } finally {server.stop(true);fake.stop(true);}
});

test('duration closes stream; drain timeout reports error rather than false done', async () => {
  const controls:string[]=[];
  const fake=Bun.serve({port:0,fetch(req,s){if(s.upgrade(req)) return;return new Response('',{status:400});},websocket:{message(_ws,d){if(typeof d==='string') controls.push(d);}}});
  const app=new Hono();app.route('/rpg',createSuggestionLiveRoutes({config:{speechProvider:'deepgram',deepgramKey:'secret'},durationMs:30,drainMs:30,connect:()=>new WebSocket(`ws://127.0.0.1:${fake.port}`)}));
  const server=Bun.serve({port:0,fetch:app.fetch,websocket:suggestionWebsocket});
  try {
    const client=new WebSocket(`ws://127.0.0.1:${server.port}/rpg/suggestions/live`,{headers:{Origin:`http://127.0.0.1:${server.port}`}} as any);
    const result=await new Promise<any>((resolve,reject)=>{client.onerror=()=>reject(Error('connection failed'));client.onopen=()=>client.send(JSON.stringify({type:'start',sampleRate:16000}));client.onmessage=e=>{const m=JSON.parse(String(e.data));if(m.type==='error') resolve(m);};});
    expect(result.type).toBe('error'); expect(controls.map(x=>JSON.parse(x))).toEqual([{type:'CloseStream'}]);
  } finally {server.stop(true);fake.stop(true);}
});
