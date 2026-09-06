import { chromium } from '/home/houston/git/institute/web/node_modules/@playwright/test/index.mjs';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/home/houston/git/institute',report={};
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
const preview=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://127.0.0.1:5240/'));
assert(preview,'Existing preview must remain present');
try {
 report.before=await preview.evaluate(()=>{
  const g=window.__game,w=g.world;
  if(window.__phoenixProofPrior)throw Error('A prior proof hold exists');
  const before={frame:w.frame,paused:w.paused,playing:g.playing,state:JSON.stringify(g.state)};
  window.__phoenixProofPrior={world:w,before};
  if(w.frame){cancelAnimationFrame(w.frame);w.frame=0;}
  return before;
 });
 report.run=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[root+'/tmp/rpg-phoenix-installed-proof.mjs'],{cwd:root,env:{...process.env,QA_LABEL:process.env.QA_LABEL||'phoenix-installed',QA_CASTS:'1'},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
 });
 assert.equal(report.run.code,0,JSON.stringify(report.run));report.success=true;
} finally {
 report.restored=await preview.evaluate(()=>{
  const hold=window.__phoenixProofPrior;if(!hold)return {missingHold:true};
  const g=window.__game,sameWorld=g.world===hold.world;
  if(sameWorld&&hold.before.frame)hold.world.start();
  const after={sameWorld,frame:g.world.frame,paused:g.world.paused,playing:g.playing,state:JSON.stringify(g.state)};
  delete window.__phoenixProofPrior;return after;
 });
 await writeFile(root+'/tmp/item-models/phoenix/v3/installed-isolation.json',JSON.stringify(report,null,2));
 await browser.close();
}
assert(report.restored.sameWorld);
assert.equal(Boolean(report.restored.frame),Boolean(report.before.frame));
for(const key of ['paused','playing','state'])assert.equal(report.restored[key],report.before[key]);
console.log(JSON.stringify({success:report.success,restoredSameWorld:report.restored.sameWorld,restoredSameState:report.restored.state===report.before.state,run:report.run}));
