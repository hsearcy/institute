import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
const inspector=process.env.SPELL_CANVAS_INSPECTOR?await import(process.env.SPELL_CANVAS_INSPECTOR):null;
const root=fileURLToPath(new URL('../../',import.meta.url));
const baseline=false,runId=process.env.SPELL_RUN_ID??'spell-input';
const out=resolve(root,'artifacts',runId);await mkdir(out,{recursive:true});
const apiPort=8968,webPort=5268,db=`/tmp/spell-effects-${Date.now()}.db`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
process.env.TUTOR_PROXY_TARGET=`http://127.0.0.1:${apiPort}`;process.env.VITE_PROFILE_ID='rpg-archmage';
const api=spawn('bun',['--no-env-file','scripts/rpg-local-server.ts'],{cwd:root,env:{...process.env,RPG_TEST_DB:db,RPG_TEST_PORT:String(apiPort)},stdio:'ignore'});
let vite,browser,context;const report={runId,baseline,errors:[],captures:[]};
try{
 for(let n=0;;n++){try{if((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok)break;}catch{}assert(n<100);await sleep(100);}
 const seed=spawnSync('bun',['--no-env-file','--eval',`
 import {Database} from 'bun:sqlite';import {RPG_SPELL_SHAPES} from './shared/src/index.ts';
 const db=new Database(process.argv[1]);const row=db.query("SELECT state_json FROM rpg_profiles WHERE profile_id='rpg-archmage'").get();const s=JSON.parse(row.state_json);
 s.skills={};s.loot=RPG_SPELL_SHAPES.map(shape=>({id:'input-'+shape.id,itemId:'moonstaff',bonusPower:0,upgradeLevel:0,spellShape:shape.id}));
 s.equippedLootId=s.loot[0].id;s.equippedItemId='moonstaff';s.selectedSpellId='ball_lightning';
 s.expedition={id:'spell-input',regionId:'embercrypt',encounterIndex:0,encountersTotal:6,cleared:false,startedAt:Date.now(),combat:{version:1,encounterIndex:0,casts:0,enemies:Array.from({length:10},(_,i)=>({id:'enemy-'+i,hp:10000,maxHp:10000}))}};
 db.query("UPDATE rpg_profiles SET state_json=? WHERE profile_id='rpg-archmage'").run(JSON.stringify(s));db.close();`,db],{cwd:root});assert.equal(seed.status,0,seed.stderr.toString());
 vite=await createServer({root:resolve(root,'web'),server:{host:'127.0.0.1',port:webPort,strictPort:true,hmr:false,watch:null}});await vite.watcher.close();await vite.listen();
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');context=await browser.newContext({viewport:{width:1200,height:800}});const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`http://127.0.0.1:${webPort}`);await page.waitForFunction(()=>window.__game?.world?.loadedAt&&!window.__game.busy,undefined,{timeout:90000});
 const skip=page.getByRole('button',{name:'Skip guide',exact:true});if(await skip.isVisible())await skip.click();
 await page.locator('[data-action="begin"]').click();
 const ready=async()=>{for(let i=0;i<150;i++) {const demo=page.locator('[data-action="demo-go"]');if(await demo.isVisible())await demo.click();if(await page.evaluate(()=>window.__game.session&&!window.__game.busy&&!window.__game.panel))return;await sleep(200);}throw Error('Problem not ready');};
 await ready();
 const shapes=await page.evaluate(async root=>{window.spellShared=await import(`/@fs${root}shared/src/index.ts`);return window.spellShared.RPG_SPELL_SHAPES;},root);
 await writeFile(`${out}/expected.json`,JSON.stringify({runId,expected:shapes.map(shape=>({spellId:shape.spellId,shape:shape.id,mode:'desktop',capture:'real-input-unpaused',frames:3}))},null,2));
 for(const shape of shapes){
  await ready();
  await page.evaluate(async shape=>{
   const g=window.__game;const response=await fetch('/rpg/equip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileId:'rpg-archmage',lootId:'input-'+shape.id})});
   if(!response.ok)throw Error('Equip failed');g.state=await response.json();g.renderState();
  },shape);
  await page.getByRole('button',{name:'Open spellbook',exact:true}).click();
  await page.locator(`[data-school="${shape.school}"]`).click();
  await page.locator(`#rpg-dialog-content [data-spell="${shape.spellId}"]`).click();await page.waitForFunction(id=>!window.__game.busy&&window.__game.state.selectedSpellId===id,shape.spellId);
  await page.locator('.rpg-dialog-close').click();
  const problem=await page.evaluate(()=>window.__game.session.problem);
  await page.locator('#rpg-answer').fill(String(problem.answer));
  const receiptPromise=page.waitForResponse(r=>r.url().endsWith('/rpg/resolve')&&r.request().method()==='POST');
  await page.locator('#rpg-cast').click();const response=await receiptPromise;assert.equal(response.status(),200);const receipt=await response.json();
  assert.equal(receipt.reward.spellShape,shape.id);assert.equal(receipt.reward.spellId,shape.spellId);
  await page.waitForFunction(()=>window.__game.world.attacking);
  const frames=[];for(const delay of [200,300,400]){await page.waitForTimeout(delay);const file=`${shape.spellId}-${frames.length}.png`;await page.screenshot({path:`${out}/${file}`});frames.push({file,...await page.evaluate(()=>({age:window.__game.world.attackAge,attacking:window.__game.world.attacking}))});}
  await page.waitForFunction(()=>!window.__game.world.attacking,undefined,{timeout:15000});
  const actual=await page.evaluate(()=>window.__game.world.diagnostics.lastAttack);assert.equal(actual.options.spellShape,shape.id);
  report.captures.push({spellId:shape.spellId,shape:shape.id,combat:receipt.reward.combat,frames});console.log('PASS input '+shape.spellId);
 }
 if(inspector){
  report.canvas=[];
  await page.evaluate(()=>{Object.defineProperty(window,'__THREE_GAME_DIAGNOSTICS__',{configurable:true,get(){const w=window.__game.world,i=w.renderer.info;return {...w.diagnostics,renderer:{calls:i.render.calls,triangles:i.render.triangles,geometries:i.memory.geometries,textures:i.memory.textures}};}});});
  for(const mobile of [false,true]){await page.setViewportSize(mobile?{width:390,height:844}:{width:1200,height:800});await page.waitForTimeout(500);const result=await inspector.sampleCanvas(page,mobile?'mobile':'desktop');assert(result.ok);report.canvas.push({mode:mobile?'mobile':'desktop',gpu:await inspector.readGpuInfo(page),result});}
 }
 assert.deepEqual(report.errors,[]);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 console.log('PASS 15 real answer submissions, server receipts, and spell animations');
}finally{if(context)await context.close();if(browser)await browser.close();if(vite)await vite.close();api.kill();}
