import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../../',import.meta.url)),out='/tmp/institute-boss-rewards';
await mkdir(out,{recursive:true});
const apiPort=8966,webPort=5266,db=`/tmp/boss-rewards-${Date.now()}.db`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
process.env.TUTOR_PROXY_TARGET=`http://127.0.0.1:${apiPort}`;process.env.VITE_PROFILE_ID='rpg-archmage';
const api=spawn('bun',['--no-env-file','scripts/rpg-local-server.ts'],{cwd:root,env:{...process.env,RPG_TEST_DB:db,RPG_TEST_PORT:String(apiPort)},stdio:'ignore'});
let vite,browser,context;const report={errors:[],redemptions:[],spells:[]};
try {
 for(let n=0;;n++){try{if((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok)break;}catch{}assert(n<100);await sleep(100);}
 const seed=spawnSync('bun',['--eval',`import {Database} from 'bun:sqlite'; const db=new Database(process.argv[1]); db.query("UPDATE profile_state SET crazy_coins=3,dimes=3 WHERE profile_id='rpg-archmage'").run();db.close();`,db],{cwd:root});assert.equal(seed.status,0,seed.stderr.toString());
 vite=await createServer({root:resolve(root,'web'),server:{host:'127.0.0.1',port:webPort,strictPort:true,hmr:false,watch:null}});await vite.watcher.close();await vite.listen();
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
 const cdp=await browser.newBrowserCDPSession(),version=await cdp.send('Browser.getVersion');assert.match(version.userAgent,/Windows/);assert(!version.userAgent.includes('HeadlessChrome'));
 context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`http://127.0.0.1:${webPort}`);await page.waitForFunction(()=>window.__game?.world?.loadedAt&&!window.__game.busy,undefined,{timeout:90000});
 const skip=page.getByRole('button',{name:'Skip guide',exact:true});if(await skip.isVisible())await skip.click();
 for(const width of [1440,390]) {
   await page.setViewportSize({width,height:900});await page.evaluate(()=>window.__game.showParent());
   await page.locator('.rpg-journal-rewards summary').click();
   await page.locator('[data-action="redeem"]').scrollIntoViewIfNeeded();
   assert(!await page.locator('[data-action="redeem"]').textContent().then(t=>t.includes('15')));
   await page.evaluate(()=>window.journalBefore=document.querySelector('.rpg-parent-journal'));
   for(const [action,kind] of [['redeem','coin'],['redeem-dime','dime']]) {
     const before=Number(await page.locator(`[data-parent-balance="${kind}"]`).textContent());
     const scroll=await page.locator('#rpg-dialog-content').evaluate(el=>el.scrollTop);
     await page.locator(`[data-action="${action}"]`).click();await page.waitForFunction(()=>!window.__game.parentRedemptionBusy);
     assert.equal(Number(await page.locator(`[data-parent-balance="${kind}"]`).textContent()),before-1);
     assert(await page.evaluate(()=>window.journalBefore===document.querySelector('.rpg-parent-journal')));
     assert(await page.locator('.rpg-journal-rewards').evaluate(el=>el.open));
     assert(Math.abs(scroll-await page.locator('#rpg-dialog-content').evaluate(el=>el.scrollTop))<2);
     report.redemptions.push({width,kind,before,after:before-1});
   }
   await page.screenshot({path:`${out}/parent-${width}.png`});
 }
 // Lose a successful response, then retry its same request ID. Only one dime is spent.
 let lostId;
 await page.route('**/shop/redeem-dime',async route=>{lostId=route.request().postDataJSON().requestId;await route.fetch();await route.abort();},{times:1});
 await page.locator('[data-action="redeem-dime"]').click();await page.waitForFunction(()=>!window.__game.parentRedemptionBusy);
 assert.match(await page.locator('[data-parent-redemption-status]').textContent(),/Could not confirm/);
 const next=page.waitForRequest(r=>r.url().endsWith('/shop/redeem-dime'));
 await page.locator('[data-action="redeem-dime"]').click();assert.equal((await next).postDataJSON().requestId,lostId);
 await page.waitForFunction(()=>!window.__game.parentRedemptionBusy);
 assert.equal(await page.locator('[data-parent-balance="dime"]').textContent(),'0');
 assert(await page.locator('[data-action="redeem-dime"]').isDisabled());
 await page.setViewportSize({width:1200,height:800});
 for(const [spellId,shape] of [['ball_lightning','twin-orb'],['meteor','meteor-shower'],['ice_lance','split-lance']]) {
   for(const enhanced of [false,true]) {
     const stats=await page.evaluate(async({spellId,shape,enhanced})=>{
       const shared=await import('/@fs'+ '/home/hfsearcy/git/institute/shared/src/index.ts');
       const g=window.__game,w=g.world;
       g.state=structuredClone(g.state);g.state.skills={};g.state.equippedItemId='moonstaff';g.state.equippedLootId='visual';g.state.selectedSpellId=spellId;
       g.state.loot=[{id:'visual',itemId:'moonstaff',bonusPower:0,upgradeLevel:0,...(enhanced?{spellShape:shape}:{})}];
       g.state.expedition={id:'visual',regionId:'embercrypt',encounterIndex:0,encountersTotal:6,cleared:false,startedAt:0};
       g.playing=true;g.panel='';g.root.dataset.panel='';document.querySelector('#rpg-overlay').hidden=true;g.renderState();
       const combat={version:1,encounterIndex:0,casts:0,enemies:Array.from({length:6},(_,i)=>({id:`enemy-${i}`,hp:1000,maxHp:1000}))};
       w.setEncounter(0,'embercrypt',6,combat.enemies);w.hero.position.copy(w.destination);w.cameraTarget.copy(w.destination);w.heroTravelWaypoints=[];w.setPaused(false);
       const result=shared.rpgApplyCombat(g.state,combat,spellId).result;
       window.visualDone=false;w.attack(spellId,{combat:result,spellShape:enhanced?shape:undefined}).then(()=>window.visualDone=true);
       return result.damage;
     },{spellId,shape,enhanced});
     await page.waitForTimeout(spellId==='ice_lance'?380:650);
     await page.screenshot({path:`${out}/${spellId}-${enhanced?'bonus':'base'}.png`});
     const attack=await page.evaluate(()=>window.__game.world.diagnostics.lastAttack);
     assert.equal(attack.options.spellShape,enhanced?shape:undefined);
     report.spells.push({spellId,enhanced,damage:stats});
     await page.waitForFunction(()=>window.visualDone,undefined,{timeout:15000});
   }
 }
 await page.evaluate(async()=>{const g=window.__game;g.state.expedition.cleared=true;g.showVictory({bossDefeated:true,bossCrazyCoins:1,bossDimes:1,xp:90,kills:1,levelUp:false,levelsGained:0,item:null,newItems:[],duplicateItem:false,spellId:'ball_lightning'});});
 assert.match(await page.locator('.rpg-boss-bonus').textContent(),/Crazy Coin/);assert.match(await page.locator('.rpg-boss-bonus').textContent(),/dime/);
 for (const width of [1200,390]) {
   await page.setViewportSize({width,height:800});await page.waitForTimeout(600);
   const size=await page.locator('#rpg-dialog-content').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
   assert(size.scroll<=size.width+1, `Victory scrolls sideways at ${width}: ${JSON.stringify(size)}`);
   await page.screenshot({path:`${out}/victory-${width}.png`});
 }
 await page.evaluate(()=>{const g=window.__game;g.school='frost';g.showSpellbook();});
 assert.match(await page.locator('#rpg-dialog-content').textContent(),/From relic/);
 assert.deepEqual(report.errors,[]);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(context)await context.close();if(browser)await browser.close();if(vite)await vite.close();api.kill();}
