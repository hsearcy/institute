/** Independent real-browser QA. Scratch tutor/API/database; existing preview and saves are untouched. */
import assert from 'node:assert/strict';
import { rpgAnswerPower } from '../shared/src/rpg';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root=resolve(import.meta.dir,'..'),stamp=Date.now();
const output=resolve(process.env.QA_OUTPUT??`/tmp/rpg-answer-power-${stamp}`),dbPath=`/tmp/rpg-answer-power-${stamp}.db`,profile='rpg-playtest';
const apiPort=8977,webPort=5277;
await mkdir(output,{recursive:true});
process.env.TUTOR_PROXY_TARGET=`http://127.0.0.1:${apiPort}`;process.env.VITE_PROFILE_ID=profile;
const logs:string[]=[],report:any={output,dbPath,errors:[],checks:[],receipts:[],requests:[]};
const api=spawn('bun',['--no-env-file','scripts/rpg-local-server.ts'],{cwd:root,env:{...process.env,RPG_TEST_DB:dbPath,RPG_TEST_PORT:String(apiPort)},stdio:['ignore','pipe','pipe']});
api.stdout.on('data',c=>logs.push(String(c)));api.stderr.on('data',c=>logs.push(String(c)));
let vite:Awaited<ReturnType<typeof createServer>>|undefined,browser:Awaited<ReturnType<typeof chromium.connectOverCDP>>|undefined,context:Awaited<ReturnType<NonNullable<typeof browser>['newContext']>>|undefined;
const state=async()=>{const r=await fetch(`http://127.0.0.1:${apiPort}/rpg/state?profileId=${profile}`);assert(r.ok);return await r.json() as any;};
try{
 for(let i=0;;i++){try{if((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok)break;}catch{}assert(i<150,logs.join(''));await Bun.sleep(100);}
 vite=await createServer({root:resolve(root,'web'),server:{host:'127.0.0.1',port:webPort,strictPort:true,watch:null,hmr:false}});await vite.watcher.close();await vite.listen();
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');report.preexistingTabs=browser.contexts().flatMap(c=>c.pages()).map(p=>p.url());
 context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});await context.route('**/favicon.ico',r=>r.fulfill({status:204}));await context.addInitScript(()=>localStorage.setItem('institute:rpg:muted','true'));
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('request',r=>{if(r.url().endsWith('/rpg/resolve'))report.requests.push(r.postDataJSON());});page.on('response',async r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()} ${r.url()}`);if(r.url().endsWith('/rpg/resolve'))report.receipts.push(await r.json());});
 const ready=async()=>{for(let i=0;i<450;i++){const demo=page.getByRole('button',{name:'Let me try',exact:true});if(await demo.isVisible())await demo.click();if(await page.evaluate(()=>{const g=(window as any).__game;return !!g?.session&&!g.busy&&!g.panel&&!g.world.traveling;}))return;await page.waitForTimeout(100);}throw Error('Problem not ready');};
 const enter=async()=>{await page.waitForFunction(()=>!!(window as any).__game?.state&&!(window as any).__game.busy);const begin=page.locator('[data-action=begin]');if(await begin.isVisible())await begin.click();await ready();};
 const shot=async(name:string)=>{const path=resolve(output,`${name}.png`);await page.screenshot({path});console.log(`SCREENSHOT ${path}`);};
 const current=()=>page.evaluate(()=>(window as any).__game.session.problem);
 const snapshot=async()=>({state:await state(),world:await page.evaluate(()=>{const w=(window as any).__game.world;return {attackCount:w.__qaAttackCount,lastAttack:w.lastAttack,enemies:w.enemies.map((e:any)=>({id:e.id,hp:e.hp,dead:e.dead}))};}),requests:report.requests.length});
 const instrument=()=>page.evaluate(()=>{const w=(window as any).__game.world,attack=w.attack.bind(w);w.__qaAttackCount=0;w.attack=(...args:any[])=>{w.__qaAttackCount++;return attack(...args);};});
 const submit=async(correct=true)=>{const p=await current();await page.locator('#rpg-answer').fill(String(correct?p.answer:(p.answer+1)%1000));await page.locator('#rpg-cast').click();};
 const age=async(ms:number)=>{await page.evaluate(ms=>{const g=(window as any).__game;g.answerClock.restore(ms);g.startClock();g.updatePower();g.saveSession();},ms);};
 await page.goto(`http://127.0.0.1:${webPort}/`);await enter();await instrument();
 if(process.env.QA_NARRATION_ONLY!=='1'){
 const beforeSkip=await snapshot(),skipped=await current();
 await page.locator('[data-action=walkthrough]').click();await page.getByRole('button',{name:'Next question',exact:true}).waitFor();await shot('walkthrough-no-attack');await page.getByRole('button',{name:'Next question',exact:true}).click();await ready();assert.notEqual((await current()).id,skipped.id);assert.deepEqual(await snapshot(),beforeSkip);
 report.checks.push("I don't know → worked example → Next question changes only the learning question: zero RPG resolve calls, attacks, XP, HP, kills, or room changes");
 const beforeWrongSkip=await snapshot();for(let n=1;n<=3;n++){await submit(false);await page.waitForFunction(n=>(window as any).__game.session.wrongCount===n,n);if(n<3)await ready();}
 await page.getByRole('button',{name:'Next question',exact:true}).waitFor();await page.getByRole('button',{name:'Next question',exact:true}).click();await ready();assert.deepEqual(await snapshot(),beforeWrongSkip);report.checks.push('Three incorrect attempts automatically teach the answer and advance without any attack or RPG rewards');
 for(const scenario of [{name:'first-try',wrong:0,ms:0,power:100},{name:'second-try',wrong:1,ms:0,power:90},{name:'third-try',wrong:2,ms:0,power:80},{name:'slow-first-try',wrong:0,ms:32000,power:50},{name:'slow-third-try',wrong:2,ms:32000,power:30}]){
  for(let n=1;n<=scenario.wrong;n++){await submit(false);await page.waitForFunction(n=>(window as any).__game.session.wrongCount===n,n);await ready();}
  await age(scenario.ms);assert.equal(await page.locator('#rpg-power').textContent(),`${scenario.power}%`);if(scenario.name==='slow-third-try')await shot('thirty-percent-desktop');
  const count=report.receipts.length;await submit();await ready();assert.equal(report.receipts.length,count+1);const receipt=report.receipts.at(-1);assert.equal(receipt.reward.combat.powerPercent,scenario.power);assert.equal(receipt.reward.combat.damage,Math.max(1,Math.round(9*scenario.power/100)));assert.equal(receipt.reward.xp,32);report.checks.push(`${scenario.name}: ${scenario.power}% power in a real server combat receipt, with scaled damage`);
 }
 await age(12000);const previous=await page.evaluate(()=>(window as any).__game.session.answerMs);await page.locator('[data-action=pause]').click();const paused=await page.evaluate(()=>(window as any).__game.answerClock.elapsed());await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>(window as any).__game.answerClock.elapsed()),paused);await page.getByRole('button',{name:'Keep exploring',exact:true}).click();await ready();assert(await page.evaluate(()=>(window as any).__game.session.answerMs)>=previous);await page.locator('[data-action=explain]').click();await ready();assert(await page.evaluate(()=>(window as any).__game.session.answerMs)>=previous);await page.locator('[data-action=hear]').click();assert(await page.evaluate(()=>(window as any).__game.session.answerMs)>=previous);
 const originalId=(await current()).id;await page.reload();await enter();assert.equal((await current()).id,originalId);assert(await page.evaluate(()=>(window as any).__game.session.answerMs)>=previous);report.checks.push('Pause, hint, replay, and reload preserve the accumulated attack clock for the same unsolved question');
 let lost=false;await page.route('**/rpg/resolve',async route=>{if(!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});await submit();await page.getByRole('button',{name:'Try again',exact:true}).waitFor();const committed=await state(),pending=await page.evaluate(()=>(window as any).__game.session.pending);await page.reload();await enter();assert.deepEqual(await state(),committed);assert.equal(report.requests.at(-1).answerMs,pending.answerMs);assert.equal(report.receipts.at(-1).duplicate,true);assert.equal(report.receipts.at(-1).reward.combat.powerPercent,rpgAnswerPower(pending.answerMs,pending.wrongCount));await page.unroute('**/rpg/resolve');report.checks.push('Lost combat response and reload replay the saved timing with identical power and no duplicate state, XP, or damage');
 }
 // Delay only narration of the next genuine learning question. The tutor and combat stay real.
 console.log('NARRATION: awaiting branches');await page.waitForFunction(()=>!!(window as any).__game.session.branches);
 console.log('NARRATION: branches ready');const nextSpoken=await page.evaluate(()=>(window as any).__game.session.branches.wrong.spoken);
 const narrationAudio=Buffer.from(await Bun.file(resolve(root,'web/public/assets/rpg/audio/sfx/reward.mp3')).arrayBuffer());
 let releaseNarration!:()=>void,reading=false;const narrationGate=new Promise<void>(resolve=>releaseNarration=resolve);
 await page.route('**/tts',async route=>{if(route.request().postDataJSON().text===nextSpoken){reading=true;await narrationGate;}await route.fulfill({status:200,contentType:'audio/mpeg',body:narrationAudio});});
 await page.locator('[data-action=sound]').click();await page.locator('[data-action=walkthrough]').click();await page.getByRole('button',{name:'Next question',exact:true}).waitFor();await page.getByRole('button',{name:'Next question',exact:true}).click();await ready();
 for(let i=0;!reading&&i<100;i++)await page.waitForTimeout(50);assert(reading,'Initial question narration requested');console.log('NARRATION: response held');
 assert.equal(await page.evaluate(()=>(window as any).__game.answerClock.elapsed()),0);await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>(window as any).__game.answerClock.elapsed()),0);releaseNarration();console.log('NARRATION: response released');await page.waitForFunction(()=>(window as any).__game.answerClock.elapsed()>500);report.checks.push('Power clock stays at zero throughout delayed initial narration and starts only after speech resolves');await page.unroute('**/tts');await page.locator('[data-action=sound]').click();
 const centers=await page.evaluate(()=>['#rpg-answer','#rpg-cast','.rpg-help-buttons'].map(s=>{const r=document.querySelector(s)!.getBoundingClientRect();return r.y+r.height/2;}));assert(Math.max(...centers)-Math.min(...centers)<3,'Desktop answer, attack, and help remain in one row');await shot('answer-power-desktop');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert(await page.locator('#rpg-cast').isVisible());assert(await page.locator('[data-action=walkthrough]').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('answer-power-phone');
 assert.equal(report.errors.length,0,report.errors.join('\n'));report.success=true;
}catch(error){report.failure=String(error);throw error;}finally{if(context)await context.close();if(browser)await browser.close();if(vite)await vite.close();api.kill('SIGTERM');await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));await writeFile(resolve(output,'server.log'),logs.join(''));}
console.log(JSON.stringify({success:report.success,checks:report.checks,output}));
