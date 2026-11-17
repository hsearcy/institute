import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { createSuggestionRoutes, speechProvider, suggestionConfigFromEnv } from './suggestions';
import { createSuggestionLiveRoutes, suggestionWebsocket } from './suggestions-live';

const unavailable = 'Voice is unavailable right now. You can type your idea instead.';

test('environment selection defaults to Bark and invalid selection fails closed', () => {
  const names = ['INSTITUTE_SPEECH_PROVIDER', 'INSTITUTE_BARK_URL', 'DEEPGRAM_API_KEY'];
  const saved = names.map(name => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    expect(speechProvider(suggestionConfigFromEnv())).toBe('bark');
    process.env.INSTITUTE_SPEECH_PROVIDER = 'bogus';
    expect(speechProvider(suggestionConfigFromEnv())).toBe('disabled');
    process.env.INSTITUTE_SPEECH_PROVIDER = 'deepgram'; process.env.DEEPGRAM_API_KEY = 'key'; process.env.INSTITUTE_BARK_URL = 'ws://127.0.0.1:9999/listen';
    expect(suggestionConfigFromEnv()).toMatchObject({speechProvider:'deepgram',deepgramKey:'key',barkUrl:'ws://127.0.0.1:9999/listen'});
  } finally { names.forEach((name,i)=>{if(saved[i]===undefined) delete process.env[name]; else process.env[name]=saved[i];}); }
});

test('availability and legacy batch depend on explicit provider selection', async () => {
  let calls = 0;
  for (const [provider,key,expected] of [[undefined,undefined,true],['bark','secret',true],['disabled','secret',false],['invalid','secret',false],['deepgram',undefined,false],['deepgram','secret',true]] as const) {
    const db = new Database(':memory:');
    try {
      const app = new Hono().route('/rpg',createSuggestionRoutes(db,{config:{speechProvider:provider,deepgramKey:key},fetch:(async()=>{calls++;return Response.json({results:{channels:[{alternatives:[{transcript:'hello'}]}]}});}) as unknown as typeof fetch}));
      expect((await (await app.request('/rpg/suggestions?profileId=sam')).json()).voiceAvailable).toBe(expected);
      const response = await app.request('/rpg/suggestions/transcribe',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'audio/wav'},body:new Uint8Array([1,2])});
      expect(response.status).toBe(provider==='deepgram' && key ? 200 : 503);
    } finally { db.close(); }
  }
  expect(calls).toBe(1);
});

test('Bark socket has no auth and forwards PCM, transcripts, stop and cancel', async () => {
  let auth: string | null = 'unset'; let path = ''; const audio: number[] = []; let closed=0; let stops=0;
  const provider = Bun.serve({port:0,fetch(req,server){auth=req.headers.get('authorization');path=new URL(req.url).pathname;if(server.upgrade(req))return;return new Response('',{status:400});},websocket:{
    message(ws,data){if(typeof data!=='string'){audio.push(...new Uint8Array(data));ws.send(JSON.stringify({type:'Results',is_final:false,channel:{alternatives:[{transcript:'hello'}]}}));}else if(JSON.parse(data).type==='CloseStream'){stops++;ws.send(JSON.stringify({type:'Results',is_final:true,channel:{alternatives:[{transcript:'hello world'}]}}));ws.close(1000);}},close(){closed++;}
  }});
  const app = new Hono().route('/rpg',createSuggestionLiveRoutes({config:{barkUrl:`ws://127.0.0.1:${provider.port}/listen`,deepgramKey:'global-secret'}}));
  const server = Bun.serve({port:0,fetch:app.fetch,websocket:suggestionWebsocket});
  const open = () => new WebSocket(`ws://127.0.0.1:${server.port}/rpg/suggestions/live`,{headers:{Origin:`http://127.0.0.1:${server.port}`}} as any);
  try {
    const client=open(); const messages:any[]=[];
    await Promise.race([new Promise<void>((resolve,reject)=>{client.onerror=()=>reject(Error('client error'));client.onopen=()=>client.send(JSON.stringify({type:'start',sampleRate:16000}));client.onmessage=e=>{const m=JSON.parse(String(e.data));messages.push(m);if(m.type==='ready')client.send(new Uint8Array([1,2,3,4]));if(m.type==='transcript'&&!m.isFinal)client.send(JSON.stringify({type:'stop'}));if(m.type==='done')resolve();};}),Bun.sleep(3000).then(()=>{throw Error('timeout');})]);
    expect(auth).toBeNull();expect(path).toBe('/listen');expect(audio).toEqual([1,2,3,4]);
    expect(messages).toEqual([{type:'ready'},{type:'transcript',text:'hello',isFinal:false},{type:'transcript',text:'hello world',isFinal:true},{type:'done'}]);
    const cancel=open();
    await Promise.race([new Promise<void>((resolve,reject)=>{cancel.onerror=()=>reject(Error('client error'));cancel.onopen=()=>cancel.send(JSON.stringify({type:'start',sampleRate:16000}));cancel.onmessage=e=>{if(JSON.parse(String(e.data)).type==='ready'){cancel.close();resolve();}};}),Bun.sleep(3000).then(()=>{throw Error('timeout');})]);
    for(let i=0;i<100&&closed<2;i++)await Bun.sleep(10);
    expect(closed).toBe(2);expect(stops).toBe(1);
  } finally {server.stop(true);provider.stop(true);}
});

test('default Bark target has no key and failures are friendly', async () => {
  let target='';let key:string|undefined='unexpected';
  const app=new Hono().route('/rpg',createSuggestionLiveRoutes({config:{deepgramKey:'global-secret'},connect:(url,k)=>{target=url;key=k;throw Error('global-secret');}}));
  const server=Bun.serve({port:0,fetch:app.fetch,websocket:suggestionWebsocket});
  try {
    const client=new WebSocket(`ws://127.0.0.1:${server.port}/rpg/suggestions/live`,{headers:{Origin:`http://127.0.0.1:${server.port}`}} as any);
    const message=await Promise.race([new Promise<any>((resolve,reject)=>{client.onerror=()=>reject(Error('client error'));client.onopen=()=>client.send(JSON.stringify({type:'start',sampleRate:16000}));client.onmessage=e=>resolve(JSON.parse(String(e.data)));}),Bun.sleep(3000).then(()=>{throw Error('timeout');})]);
    expect(target).toBe('ws://127.0.0.1:15003/listen');expect(key).toBeUndefined();expect(message).toEqual({type:'error',message:unavailable});
  } finally {server.stop(true);}
});

test('invalid and disabled providers reject live upgrades without connecting', async () => {
  for(const provider of ['invalid','disabled','deepgram']){
    let called=false;const app=new Hono().route('/rpg',createSuggestionLiveRoutes({config:{speechProvider:provider},connect:()=>{called=true;throw Error();}}));
    const response=await app.request('/rpg/suggestions/live',{headers:{Origin:'http://localhost'}});
    expect(response.status).toBe(503);expect(await response.json()).toEqual({error:unavailable});expect(called).toBe(false);
  }
});

test('remote Bark URLs fail without connecting', async () => {
  let called=false;
  const app=new Hono().route('/rpg',createSuggestionLiveRoutes({config:{barkUrl:'ws://example.com/listen'},connect:()=>{called=true;throw Error();}}));
  const server=Bun.serve({port:0,fetch:app.fetch,websocket:suggestionWebsocket});
  try {
    const client=new WebSocket(`ws://127.0.0.1:${server.port}/rpg/suggestions/live`,{headers:{Origin:`http://127.0.0.1:${server.port}`}} as any);
    const message=await Promise.race([new Promise<any>((resolve,reject)=>{client.onerror=()=>reject(Error('client error'));client.onopen=()=>client.send(JSON.stringify({type:'start',sampleRate:16000}));client.onmessage=e=>resolve(JSON.parse(String(e.data)));}),Bun.sleep(3000).then(()=>{throw Error('timeout');})]);
    expect(message).toEqual({type:'error',message:unavailable});expect(called).toBe(false);
  } finally {server.stop(true);}
});
