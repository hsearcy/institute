/** Fresh-hero CDP QA with an isolated database; never touches the user's preview save. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root=resolve(import.meta.dir,'..'),stamp=Date.now();
const output=resolve(process.env.QA_OUTPUT??`/tmp/rpg-starter-${stamp}`),dbPath=`/tmp/rpg-starter-${stamp}.db`,profile='rpg-playtest';
const apiPort=8976,webPort=5276;
await mkdir(output,{recursive:true});
process.env.TUTOR_PROXY_TARGET=`http://127.0.0.1:${apiPort}`;process.env.VITE_PROFILE_ID=profile;
const logs:string[]=[],report:any={output,dbPath,errors:[],checks:[],receipts:[],frames:[]};
const api=spawn('bun',['--no-env-file','scripts/rpg-local-server.ts'],{cwd:root,env:{...process.env,RPG_TEST_DB:dbPath,RPG_TEST_PORT:String(apiPort)},stdio:['ignore','pipe','pipe']});
api.stdout.on('data',c=>logs.push(String(c)));api.stderr.on('data',c=>logs.push(String(c)));
let vite:Awaited<ReturnType<typeof createServer>>|undefined,browser:Awaited<ReturnType<typeof chromium.connectOverCDP>>|undefined,context:Awaited<ReturnType<NonNullable<typeof browser>['newContext']>>|undefined;
const state=async()=>{const r=await fetch(`http://127.0.0.1:${apiPort}/rpg/state?profileId=${profile}`);assert(r.ok);return await r.json() as any;};
try{
 for(let i=0;;i++){try{if((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok)break;}catch{}assert(i<150,logs.join(''));await Bun.sleep(100);}
 const fresh=await state();assert.equal(fresh.level,1);assert.equal(fresh.xp,0);assert.equal(fresh.selectedSpellId,'cleave');
 vite=await createServer({root:resolve(root,'web'),server:{host:'127.0.0.1',port:webPort,strictPort:true,watch:null,hmr:false}});await vite.watcher.close();await vite.listen();
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');report.preexistingTabs=browser.contexts().flatMap(c=>c.pages()).map(p=>p.url());
 context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});await context.route('**/favicon.ico',r=>r.fulfill({status:204}));await context.addInitScript(()=>localStorage.setItem('institute:rpg:muted','true'));
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('response',async r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()} ${r.url()}`);if(r.url().endsWith('/rpg/resolve'))report.receipts.push(await r.json());});
 const ready=async()=>{for(let i=0;i<350;i++){const demo=page.getByRole('button',{name:'Let me try',exact:true});if(await demo.isVisible())await demo.click();if(await page.evaluate(()=>{const g=(window as any).__game;return !!g?.session&&!g.busy&&!g.panel&&!g.world.traveling;}))return;await page.waitForTimeout(100);}throw Error('Problem not ready');};
 const shot=async(name:string)=>{const path=resolve(output,`${name}.png`);await page.screenshot({path});console.log(`SCREENSHOT ${path}`);};
 const world=()=>page.evaluate(()=>{const g=(window as any).__game;return {level:g.state.level,selected:g.state.selectedSpellId,enemies:g.world.enemies.map((e:any)=>({id:e.id,hp:e.hp,dead:e.dead,visible:e.root.visible})),attack:g.world.lastAttack,age:g.world.attackAge};});
 await page.goto(`http://127.0.0.1:${webPort}/`);await page.waitForFunction(()=>!!(window as any).__game?.state&&!(window as any).__game.busy);
 assert.equal(await page.locator('.rpg-starter-spells button').count(),1);assert.equal(await page.locator('.rpg-starter-spells button').getAttribute('data-spell'),'cleave');await shot('camp-desktop');
 await page.locator('[data-action=begin]').click();await ready();const start=await world();assert.equal(start.enemies.length,3);assert.equal(start.selected,'cleave');assert.equal(await page.locator('#rpg-spellbar [aria-pressed=true]').getAttribute('data-spell'),'cleave');await shot('level-one-desktop');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);assert(await page.locator('#rpg-spellbar [data-spell=cleave]').isVisible());assert.equal(await page.locator('#rpg-spellbar [aria-pressed=true]').getAttribute('aria-label'),'Heavy Cleave');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('level-one-phone');await page.setViewportSize({width:1440,height:900});
 report.checks.push('Fresh hero starts at XP 0 / level 1 with Heavy Cleave selected, a sword-only camp selector, and three visible monsters on desktop and phone');
 const answer=async(capture=false)=>{
  await page.locator('#rpg-answer').fill(await page.evaluate(()=>String((window as any).__game.session.problem.answer)));await page.locator('#rpg-cast').click();
  if(capture)for(const age of [.15,.40,.65,.9]){await page.waitForFunction(age=>{const w=(window as any).__game.world;return w.__captureFrozen&&w.attackAge>=age;},age,{timeout:30000});report.frames.push(await world());await shot(`actual-cleave-${String(age).replace('.','-')}`);await page.evaluate(()=>{const w=(window as any).__game.world;w.__captureAges.shift();w.__captureFrozen=false;});}
  await ready();return await state();
 };
 await page.evaluate(()=>{const w=(window as any).__game.world,original=w.tick.bind(w);w.__captureAges=[.15,.4,.65,.9];w.__captureFrozen=false;w.tick=(delta:number)=>{if(w.__captureFrozen)return original(0);const target=w.__captureAges[0];if(w.attacking&&target!==undefined){const step=Math.min(delta,Math.max(0,target-w.attackAge));original(step);if(w.attackAge>=target-1e-9)w.__captureFrozen=true;}else original(delta);};});
 const one=await answer(true);assert.equal(report.receipts[0].reward.spellId,'cleave');assert.equal(report.receipts[0].reward.kills,2);assert.equal(one.expedition.encounterIndex,0);assert.equal(one.expedition.combat.enemies.filter((e:any)=>e.hp>0).length,1);await shot('one-survivor-desktop');
 report.checks.push('First actual correct answer uses Heavy Cleave: two kills and one wounded survivor, not a full-pack wipe');
 if(process.env.QA_EFFECT_ONLY==='1'){assert.equal(report.errors.length,0,report.errors.join('\n'));report.success=true;}else{
 const two=await answer();assert.equal(two.expedition.encounterIndex,1);assert.equal(two.level,1);assert.equal(two.expedition.combat.enemies.length,3);assert(report.receipts[1].reward.item);assert(two.forgeDust>0);await shot('room-clear-loot');report.checks.push('Second actual answer clears room one, awards a relic and forge materials, and starts another three-enemy room');
 const three=await answer();assert.equal(three.level,2);assert.equal(three.expedition.encounterIndex,1);assert.equal(three.expedition.combat.enemies.length,3);assert.equal(three.expedition.combat.enemies.filter((e:any)=>e.hp>0).length,1);const saved=structuredClone(three.expedition.combat);await page.reload();await page.waitForFunction(()=>!!(window as any).__game?.state&&!(window as any).__game.busy);const begin=page.locator('[data-action=begin]');if(await begin.isVisible())await begin.click();await ready();assert.deepEqual((await state()).expedition.combat,saved);report.checks.push('Level two is earned through real answers and survives reload; the current three-enemy room is preserved');
 const four=await answer();assert.equal(four.expedition.encounterIndex,2);assert.equal(four.expedition.combat.enemies.length,4);assert.equal((await world()).enemies.filter((e:any)=>!e.dead).length,4);await shot('level-two-four-enemies');report.checks.push('Next fresh room at level two has four enemies in saved combat and the actual rendered scene');
 assert.equal(report.errors.length,0,report.errors.join('\n'));report.success=true;
 }
}catch(error){report.failure=String(error);throw error;}finally{if(context)await context.close();if(browser)await browser.close();if(vite)await vite.close();api.kill('SIGTERM');await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));await writeFile(resolve(output,'server.log'),logs.join(''));}
console.log(JSON.stringify({success:report.success,checks:report.checks,output}));
