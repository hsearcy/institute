import {chromium} from '../web/node_modules/@playwright/test/index.mjs';
import {spawn} from 'node:child_process';
import {readFileSync,openSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='/home/houston/git/institute',pid=Number(process.env.PREVIEW_PID),report={};
assert(readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').includes('/tmp/rpg-starter-preview.mjs'),'Only our owned preview server may restart');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://127.0.0.1:5240/'));
assert(page,'Persistent preview exists');
try {
 report.before=await page.evaluate(()=>({state:structuredClone(__game.state),paused:__game.world.paused,playing:__game.playing}));
 process.kill(pid,'SIGTERM');
 for(let n=0;n<100;n++){try{process.kill(pid,0);}catch{break;}await new Promise(r=>setTimeout(r,50));}
 const log=openSync(root+'/tmp/chain-phoenix-preview-refresh-server.log','a');
 const server=spawn(process.execPath,['/tmp/rpg-starter-preview.mjs'],{cwd:root+'/web',env:{...process.env,TUTOR_PROXY_TARGET:'http://127.0.0.1:8839',VITE_PROFILE_ID:'rpg-playtest'},detached:true,stdio:['ignore',log,log]});
 server.unref();report.serverPid=server.pid;
 let ready=false;for(let n=0;n<150;n++){try{if((await fetch('http://127.0.0.1:5240/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,'Restarted preview ready');
 await page.reload();await page.waitForFunction(()=>!!window.__game?.world?.loadedAt&&!__game.busy,undefined,{timeout:90000});
 report.after=await page.evaluate(()=>({state:structuredClone(__game.state),moonstaffLoaded:__game.world.models.has('items/moonstaff'),phoenixLoaded:__game.world.models.has('items/phoenix'),chainEnabled:__game.world.chainCandidate,paused:__game.world.paused,playing:__game.playing,frame:__game.world.frame}));
 assert.deepEqual(report.after.state,report.before.state,'All saved progress retained');assert(report.after.moonstaffLoaded&&report.after.phoenixLoaded&&report.after.chainEnabled);assert(report.after.frame>0);
 await page.screenshot({path:root+'/tmp/chain-phoenix-preview-refreshed.png'});report.success=true;
 console.log(JSON.stringify({success:true,serverPid:server.pid,xp:report.after.state.xp,kills:report.after.state.totalKills,room:report.after.state.expedition.encounterIndex,item:report.after.state.equippedItemId,moonstaffLoaded:true,phoenixLoaded:report.after.phoenixLoaded,chainEnabled:report.after.chainEnabled}));
}finally{writeFileSync(root+'/tmp/chain-phoenix-preview-refresh.json',JSON.stringify(report,null,2));await browser.close();}
