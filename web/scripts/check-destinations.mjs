import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=resolve(root,'docs/concepts/destination-variety/browser');await mkdir(out,{recursive:true});
const apiPort=8964,webPort=5264,db=`/tmp/destinations-${Date.now()}.db`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
process.env.TUTOR_PROXY_TARGET=`http://127.0.0.1:${apiPort}`;process.env.VITE_PROFILE_ID='rpg-archmage';
const api=spawn('bun',['--no-env-file','scripts/rpg-local-server.ts'],{cwd:root,env:{...process.env,RPG_TEST_DB:db,RPG_TEST_PORT:String(apiPort)},stdio:'ignore'});
let vite,browser,context;const report={errors:[],scenes:[],casts:[]};
try{
 for(let n=0;;n++){try{if((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok)break;}catch{}assert(n<100);await sleep(100);}
 vite=await createServer({root:resolve(root,'web'),server:{host:'127.0.0.1',port:webPort,strictPort:true,hmr:false,watch:null}});await vite.watcher.close();await vite.listen();
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))report.errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400&&!new URL(r.url()).pathname.endsWith('/favicon.ico'))report.errors.push(`HTTP ${r.status()} ${r.url()}`);});
 await page.addInitScript(()=>localStorage.setItem('institute:rpg:muted','true'));
 await page.goto(`http://127.0.0.1:${webPort}`);await page.waitForFunction(()=>window.__game?.world?.loadedAt&&!window.__game.busy,undefined,{timeout:90000});
 const guide=page.getByRole('button',{name:'Skip guide',exact:true});if(await guide.isVisible())await guide.click();
 const ready=async()=>{for(let i=0;i<400;i++){const demo=page.getByRole('button',{name:'Let me try',exact:true});if(await demo.isVisible())await demo.click();if(await page.evaluate(()=>{const g=window.__game;return !!g.session&&!g.busy&&!g.panel&&!g.world.traveling;}))return;await sleep(100);}throw Error('Question not ready');};
 await page.evaluate(()=>window.__game.showMap());await page.screenshot({path:out+'/map-desktop.png'});
 for(const region of ['mosswood','tidebreak','old-quarry','kingsgarden','embercrypt']){
   if(await page.evaluate(()=>!!window.__game.state.expedition&&!window.__game.state.expedition.cleared))await page.evaluate(()=>window.__game.retreat());
   await page.evaluate(()=>window.__game.showMap());await page.locator(`button[data-region="${region}"]`).click();await ready();
   assert.equal(await page.evaluate(()=>window.__game.state.expedition.regionId),region);
   if(region!=='embercrypt'){
     const xp=await page.evaluate(()=>window.__game.state.xp);
     await page.locator('#rpg-answer').fill(await page.evaluate(()=>String(window.__game.session.problem.answer)));
     await page.locator('#rpg-cast').click();await page.waitForFunction(xp=>window.__game.state.xp>xp,xp,{timeout:30000});await ready();await sleep(4500);report.casts.push(region);
   }
   for(const room of region==='embercrypt'?[0]:[0,1,2,3,4,5]){
     await page.evaluate(({room,region})=>{const g=window.__game,w=g.world;g.state.expedition.encounterIndex=room;delete g.state.expedition.combat;g.renderState();g.setEncounter();if(room!==1){w.hero.position.copy(w.destination);w.cameraTarget.copy(w.destination);w.heroTravelWaypoints=[];}}, {room,region});
     if(room===1)await page.waitForFunction(()=>!window.__game.world.traveling,undefined,{timeout:30000});
     await sleep(450);
     await page.screenshot({path:`${out}/${region}-${room}-desktop.png`});
     report.scenes.push(await page.evaluate(()=>{const w=window.__game.world;return {...w.diagnostics,outdoors:w.outdoorWorld?.name,legacyVisible:w.floorGroup.visible,memory:w.renderer.info.memory};}));
   }
   await page.setViewportSize({width:390,height:844});await sleep(400);await page.screenshot({path:`${out}/${region}-phone.png`});await page.setViewportSize({width:1440,height:900});
 }
 await page.evaluate(()=>window.__game.showMap());await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/map-phone.png'});
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));console.log(JSON.stringify({scenes:report.scenes.length,casts:report.casts,errors:report.errors}));
}finally{if(context)await context.close();if(browser)await browser.close();if(vite)await vite.close();api.kill();}
