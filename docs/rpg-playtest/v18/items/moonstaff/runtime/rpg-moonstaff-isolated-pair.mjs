import { chromium } from '/home/houston/git/institute/web/node_modules/@playwright/test/index.mjs';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/home/houston/git/institute',report={runs:[]};
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
const preview=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://127.0.0.1:5240/'));
assert(preview,'Existing preview5240 must be present');
try {
 report.before=await preview.evaluate(()=>{
  const g=window.__game,w=g.world;
  if(window.__moonstaffPerfPrior)throw Error('A prior performance hold exists');
  const before={frame:w.frame,paused:w.paused,playing:g.playing,xp:g.state.xp,kills:g.state.totalKills,encounter:g.state.expedition.encounterIndex};
  window.__moonstaffPerfPrior={world:w,before};
  if(w.frame){cancelAnimationFrame(w.frame);w.frame=0;}
  return before;
 });
 assert.equal(report.before.xp,826);assert.equal(report.before.kills,48);assert.equal(report.before.encounter,5);
 for(const [label,file] of [['moonstaff-isolated','rpg-moonstaff-motion-proof.mjs'],['apprentice-isolated','rpg-moonstaff-baseline-proof.mjs']]){
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[root+'/tmp/'+file],{cwd:root,env:{...process.env,QA_LABEL:label,QA_CASTS:'1'},stdio:['ignore','pipe','pipe']});
   let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>resolve({label,code,stdout,stderr}));
  });report.runs.push(result);if(result.code!==0)throw Error(JSON.stringify(result));
 }
 report.success=true;
} finally {
 report.restored=await preview.evaluate(()=>{
  const hold=window.__moonstaffPerfPrior;if(!hold)return {missingHold:true};
  const g=window.__game,sameWorld=g.world===hold.world;
  if(sameWorld&&hold.before.frame)hold.world.start();
  const after={sameWorld,frame:g.world.frame,paused:g.world.paused,playing:g.playing,xp:g.state.xp,kills:g.state.totalKills,encounter:g.state.expedition.encounterIndex};
  delete window.__moonstaffPerfPrior;return after;
 });
 await writeFile(root+'/tmp/item-models/moonstaff/isolated-pair.json',JSON.stringify(report,null,2));
 await browser.close();
}
assert(report.restored.sameWorld);assert(report.restored.frame>0);
for(const key of ['paused','playing','xp','kills','encounter'])assert.equal(report.restored[key],report.before[key]);
console.log(JSON.stringify(report));
