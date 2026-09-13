import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../../',import.meta.url));
const baseline=process.env.SPELL_PASS==='baseline',runId=process.env.SPELL_RUN_ID??(baseline?'spell-baseline':'spell-final');
const out=resolve(root,'artifacts',runId);await mkdir(out,{recursive:true});
const apiPort=8967,webPort=5267,db=`/tmp/spell-effects-${Date.now()}.db`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
process.env.TUTOR_PROXY_TARGET=`http://127.0.0.1:${apiPort}`;process.env.VITE_PROFILE_ID='rpg-archmage';
const api=spawn('bun',['--no-env-file','scripts/rpg-local-server.ts'],{cwd:root,env:{...process.env,RPG_TEST_DB:db,RPG_TEST_PORT:String(apiPort)},stdio:'ignore'});
let vite,browser,context;const report={runId,baseline,errors:[],captures:[]};
try{
 for(let n=0;;n++){try{if((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok)break;}catch{}assert(n<100);await sleep(100);}
 vite=await createServer({root:resolve(root,'web'),server:{host:'127.0.0.1',port:webPort,strictPort:true,hmr:false,watch:null}});await vite.watcher.close();await vite.listen();
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');context=await browser.newContext({viewport:{width:1200,height:800}});const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))report.errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))report.errors.push(`HTTP ${r.status()} ${r.url()}`);});
 await page.goto(`http://127.0.0.1:${webPort}`);await page.waitForFunction(()=>window.__game?.world?.loadedAt&&!window.__game.busy,undefined,{timeout:90000});
 const skip=page.getByRole('button',{name:'Skip guide',exact:true});if(await skip.isVisible())await skip.click();
 const shapes=await page.evaluate(async root=>{window.spellShared=await import(`/@fs${root}shared/src/index.ts`);return window.spellShared.RPG_SPELL_SHAPES;},root);
 console.log('Game loaded; capturing '+runId);
 const selected=process.env.SPELL_FILTER?shapes.filter(s=>process.env.SPELL_FILTER.split(',').includes(s.spellId)):shapes;
 // Capture set declared before running. Each bonus has desktop and phone motion frames.
 const expected=(baseline?['desktop']:['desktop','mobile']).flatMap(mode=>selected.map(s=>({mode,spellId:s.spellId,shape:baseline?null:s.id,times:baseline?[.75]:[.35,.75,1.2]})));
 await writeFile(`${out}/expected.json`,JSON.stringify({runId,expected},null,2));
 for(const mode of baseline?['desktop']:['desktop','mobile']){
  await page.setViewportSize(mode==='desktop'?{width:1200,height:800}:{width:390,height:844});
  for(const shape of selected){
   const before=await page.evaluate(({shape,baseline})=>{
    const g=window.__game,w=g.world,s=window.spellShared;
    if(!window.originalSpellTick){window.originalSpellTick=w.tick.bind(w);w.tick=delta=>{if(!window.freezeSpellCapture)window.originalSpellTick(delta);};}
    window.freezeSpellCapture=false;
    g.state=structuredClone(g.state);g.state.skills={};g.state.equippedItemId='moonstaff';g.state.equippedLootId='visual';g.state.selectedSpellId=shape.spellId;
    g.state.loot=[{id:'visual',itemId:'moonstaff',bonusPower:0,upgradeLevel:0,...(baseline?{}:{spellShape:shape.id})}];
    g.state.expedition={id:'visual',regionId:'embercrypt',encounterIndex:0,encountersTotal:6,cleared:false,startedAt:0};
    g.playing=true;g.panel='';g.root.dataset.panel='';document.querySelector('#rpg-overlay').hidden=true;document.querySelector('#rpg-controls').hidden=false;g.renderState();
    const combat={version:1,encounterIndex:0,casts:0,enemies:Array.from({length:10},(_,i)=>({id:`enemy-${i}`,hp:1000,maxHp:1000}))};
    w.setEncounter(0,'embercrypt',10,combat.enemies);w.hero.position.copy(w.destination);w.cameraTarget.copy(w.destination);w.heroTravelWaypoints=[];w.setPaused(false);
    const result=s.rpgApplyCombat(g.state,combat,shape.spellId).result;
    window.visualDone=false;window.renderSamples=[];
    const sample=()=>{if(!window.visualDone){window.renderSamples.push({time:w.attackAge,calls:w.renderer.info.render.calls,triangles:w.renderer.info.render.triangles,geometries:w.renderer.info.memory.geometries,textures:w.renderer.info.memory.textures});requestAnimationFrame(sample);}};
    w.attack(shape.spellId,{combat:result,spellShape:baseline?undefined:shape.id}).then(()=>window.visualDone=true);requestAnimationFrame(sample);
    return {damage:result.damage,coverage:result.coverage,memory:{...w.renderer.info.memory}};
   },{shape,baseline});
   const frames=[];
   for(const at of baseline?[.75]:[.35,.75,1.2]){
    await page.waitForFunction(at=>{const w=window.__game.world;if(w.attackAge<at)return false;window.freezeSpellCapture=true;return true;},at,{timeout:15000});
    const file=`${mode}-${shape.spellId}-${at}.png`;await page.screenshot({path:`${out}/${file}`});
    frames.push({file,at,...await page.evaluate(()=>({age:window.__game.world.attackAge,effectNames:window.__game.world.effects.map(e=>e.mesh.name).filter(Boolean)}))});
    const frame=frames[frames.length-1];
    if(!baseline&&shape.spellId==='meteor'&&at===.75&&frame.age<.82)assert(frame.effectNames.includes('fire-bonus:molten-core'),'Meteor vanished before its scheduled impact');
    await page.evaluate(()=>window.freezeSpellCapture=false);
   }
   await page.waitForFunction(()=>window.visualDone,undefined,{timeout:15000});await page.waitForTimeout(1800);
   await page.waitForFunction(()=>window.__game.world.effects.length===0,undefined,{timeout:10000});
   const after=await page.evaluate(()=>({diagnostics:window.__game.world.diagnostics,memory:{...window.__game.world.renderer.info.memory},samples:window.renderSamples,remainingEffects:window.__game.world.effects.length}));
   report.captures.push({mode,spellId:shape.spellId,shape:baseline?null:shape.id,before,frames,after});
   console.log(`${mode} ${shape.spellId}: ${before.damage} damage, ${before.coverage} targets`);
  }
 }
 assert.deepEqual(report.errors,[]);
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 console.log(`PASS ${report.captures.length} spell casts; no page or game HTTP errors.`);
}finally{if(context)await context.close();if(browser)await browser.close();if(vite)await vite.close();api.kill();}
