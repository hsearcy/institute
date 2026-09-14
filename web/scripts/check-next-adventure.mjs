import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../../',import.meta.url));
const baseline=false,runId='next-adventure';
const out=resolve(root,'artifacts',runId);await mkdir(out,{recursive:true});
const apiPort=8969,webPort=5269,db=`/tmp/spell-effects-${Date.now()}.db`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
process.env.TUTOR_PROXY_TARGET=`http://127.0.0.1:${apiPort}`;process.env.VITE_PROFILE_ID='rpg-archmage';
const api=spawn('bun',['--no-env-file','scripts/rpg-local-server.ts'],{cwd:root,env:{...process.env,RPG_TEST_DB:db,RPG_TEST_PORT:String(apiPort)},stdio:'ignore'});
let vite,browser,context;const report={runId,baseline,errors:[],captures:[]};
try {
 for(let n=0;;n++){try{if((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok)break;}catch{}assert(n<100);await sleep(100);}
 vite=await createServer({root:resolve(root,'web'),server:{host:'127.0.0.1',port:webPort,strictPort:true,hmr:false,watch:null}});await vite.watcher.close();await vite.listen();
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
 const cdp=await browser.newBrowserCDPSession(),version=await cdp.send('Browser.getVersion');assert.match(version.userAgent,/Windows/);assert(!version.userAgent.includes('HeadlessChrome'));
 context=await browser.newContext({viewport:{width:1200,height:800}});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`http://127.0.0.1:${webPort}`);await page.waitForFunction(()=>window.__game?.world?.loadedAt&&!window.__game.busy,undefined,{timeout:90000});
 const skip=page.getByRole('button',{name:'Skip guide',exact:true});if(await skip.isVisible())await skip.click();
 for(const [mode,width,height,tier] of [['desktop',1200,800,10],['mobile',390,844,100]]){
  await page.setViewportSize({width,height});
  const seed=spawnSync('bun',['--no-env-file','--eval',`
   import {Database} from 'bun:sqlite';const db=new Database(process.argv[1]);const s=JSON.parse(db.query("SELECT state_json FROM rpg_profiles WHERE profile_id='rpg-archmage'").get().state_json);const tier=Number(process.argv[2]);s.bestTier=tier;s.dungeonTier=tier;
   s.expedition={id:'complete-'+tier,regionId:'embercrypt',tier,encounterIndex:5,encountersTotal:6,cleared:true,startedAt:Date.now()};
   db.query("UPDATE rpg_profiles SET state_json=? WHERE profile_id='rpg-archmage'").run(JSON.stringify(s));db.close();`,db,String(tier)],{cwd:root});assert.equal(seed.status,0,seed.stderr.toString());
  await page.evaluate(async()=>{const g=window.__game;g.state=await fetch('/rpg/state?profileId=rpg-archmage').then(r=>r.json());g.session=null;g.busy=false;g.showVictory({xp:90,kills:1,levelUp:false,levelsGained:0,item:null,newItems:[],duplicateItem:false,bossDefeated:true,spellId:'ember'});});
  const selected=page.locator('[data-next-region][aria-pressed="true"]');assert.equal(await selected.count(),1);assert.notEqual(await selected.getAttribute('data-next-region'),'embercrypt');
  assert.equal(await page.locator('#rpg-next-tier').inputValue(),String(Math.min(100,tier+1)));
  await page.locator('#rpg-next-adventure').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${mode}-victory.png`});
  assert(await page.locator('[data-action="next-adventure"]').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Next button is hidden behind another element');
  const dialog=await page.locator('#rpg-dialog-content').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));assert(dialog.scrollWidth<=dialog.width+1);
  let chosen=await selected.getAttribute('data-next-region');
  if(mode==='mobile'){chosen='old-quarry';await page.locator('[data-next-region="old-quarry"]').click();await page.locator('#rpg-next-tier').selectOption('2');assert.match(await page.locator('#rpg-next-adventure .rpg-tier-reward').textContent(),/2%/);}
  const next=page.waitForResponse(r=>r.url().endsWith('/rpg/start'));
  await page.locator('[data-action="next-adventure"]').click();const started=await (await next).json();assert.equal(started.expedition.regionId,chosen);assert.equal(started.expedition.tier,mode==='mobile'?2:Math.min(100,tier+1));
  for(let i=0;i<100;i++){const demo=page.locator('[data-action="demo-go"]');if(await demo.isVisible())await demo.click();if(await page.evaluate(()=>!window.__game.busy&&!window.__game.panel))break;await sleep(200);}
  assert.equal(await page.evaluate(()=>window.__game.state.expedition.encounterIndex),0);
  const before=await page.evaluate(()=>{const s=window.__game.state;return {xp:s.xp,loot:s.loot,clears:s.expeditionsCompleted};});
  await page.getByRole('button',{name:'Expeditions',exact:true}).click();
  await page.locator('#rpg-dialog-content [data-action="retreat"]').click();
  await page.locator('[data-action="confirm-retreat"]').click();await page.waitForFunction(()=>window.__game.panel==='map'&&!window.__game.busy);
  const after=await page.evaluate(()=>{const s=window.__game.state;return {xp:s.xp,loot:s.loot,clears:s.expeditionsCompleted};});assert.deepEqual(after,before);
  await page.locator('#rpg-map-tier').selectOption('1');
  assert.equal(await page.locator('[data-region="mosswood"]').getAttribute('data-tier'),'1');assert.match(await page.locator('.rpg-tier-reward').textContent(),/1%/);
  await page.screenshot({path:`${out}/${mode}-lower-tier.png`});
  const lower=page.waitForResponse(r=>r.url().endsWith('/rpg/start'));await page.locator('[data-region="mosswood"]').click();const lowerState=await (await lower).json();assert.equal(lowerState.expedition.tier,1);assert.equal(lowerState.expedition.regionId,'mosswood');
  report.captures.push({mode,defaultTier:Math.min(100,tier+1),selectedArea:chosen,lowerTier:lowerState.expedition.tier,earnedStatePreserved:true});console.log('PASS '+mode+' next area, start, first-room exit, lower tier');
  await page.waitForFunction(()=>!window.__game.busy,undefined,{timeout:20000});
 }
 assert.deepEqual(report.errors,[]);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
} finally {if(context)await context.close();if(browser)await browser.close();if(vite)await vite.close();api.kill();}
