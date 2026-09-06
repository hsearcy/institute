import { chromium } from '/home/houston/git/institute/web/node_modules/@playwright/test/index.mjs';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/home/houston/git/institute',label=process.env.QA_LABEL||'moonstaff-native-v2',stamp=Date.now(),profile=process.env.QA_PROFILE||'rpg-veteran',db=process.env.QA_DB||`/tmp/rpg-partial-${stamp}.db`,logs=[],errors=[],receipts=[];
process.env.QA_SPELL??='cleave';process.env.QA_ITEM??='moonstaff';
const api=spawn('bun',['--no-env-file','scripts/rpg-local-server.ts'],{cwd:root,env:{...process.env,RPG_TEST_DB:db,RPG_TEST_PORT:'8961'},stdio:['ignore','pipe','pipe']});
const vite=spawn('node',['/home/houston/git/institute/tmp/rpg-moonstaff-server.mjs'],{cwd:root+'/web',env:{...process.env,TUTOR_PROXY_TARGET:'http://127.0.0.1:8961',VITE_PROFILE_ID:profile},stdio:['ignore','pipe','pipe']});
for(const process of [api,vite])for(const stream of [process.stdout,process.stderr])stream.on('data',chunk=>logs.push(String(chunk)));
let browser,context,page;const report={label,db,receipts,errors};
const wait=async url=>{for(let n=0;n<150;n++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server unavailable '+url);};
const ready=async page=>{for(let n=0;n<200;n++){const demo=page.getByRole('button',{name:'Let me try',exact:true});if(await demo.isVisible())await demo.click();if(await page.evaluate(()=>!!window.__game?.session&&!__game.busy&&!__game.panel))return;await page.waitForTimeout(100);}throw Error('Math problem not ready');};
const snapshot=page=>page.evaluate(()=>({clock:performance.now(),problemId:__game.session?.problem.id,encounter:__game.state.expedition.encounterIndex,xp:__game.state.xp,kills:__game.state.totalKills,attacking:__game.world.attacking,traveling:__game.world.traveling,enemies:__game.world.enemies.map(e=>({id:e.id,hp:e.hp,maxHp:e.maxHp,dead:e.dead,visible:e.root.visible,position:e.root.position.toArray()})),programs:__game.world.renderer.info.programs.length}));
try {
 await Promise.all([wait('http://127.0.0.1:8961/health'),wait('http://127.0.0.1:5261/')]);
 if(process.env.QA_SPELL){const r=await fetch('http://127.0.0.1:8961/rpg/spell',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileId:profile,spellId:process.env.QA_SPELL})});assert(r.ok,await r.text());}
 if(process.env.QA_ITEM){const r=await fetch('http://127.0.0.1:8961/rpg/equip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileId:profile,itemId:process.env.QA_ITEM})});assert(r.ok,await r.text());}
 if(process.env.QA_SPELL)await fetch('http://127.0.0.1:8961/rpg/appearance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileId:profile,appearanceId:'wayfarer'})});
 if(!process.env.QA_RESUME)await fetch('http://127.0.0.1:8961/rpg/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileId:profile,regionId:process.env.QA_REGION||'embercrypt'})});
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
 context=await browser.newContext({viewport:{width:1440,height:900},...(process.env.QA_NO_VIDEO?{}:{recordVideo:{dir:'/tmp/rpg-partial-hit-video',size:{width:1440,height:900}}})});
 await context.route('**/src/rpg/itemModels.ts*', route=>route.fulfill({contentType:'application/javascript',body:'export const ITEM_MODELS={cleaver:{model:"items/cleaver",thumbnail:"/assets/rpg/items/cleaver.png"},thunderrod:{model:"items/thunderrod",thumbnail:"/assets/rpg/items/thunderrod.png"},apprentice:{model:"items/apprentice",thumbnail:"/assets/rpg/items/apprentice.png"},moonstaff:{model:"items/moonstaff",thumbnail:"/assets/rpg/items/moonstaff.png"}};'}));
 await context.route('**/assets/rpg/items/moonstaff.glb',route=>route.fulfill({path:root+'/tmp/item-models/moonstaff/moonstaff-v2.glb',contentType:'model/gltf-binary'}));
 await context.route('**/assets/rpg/items/moonstaff.png',route=>route.fulfill({path:root+'/tmp/item-models/moonstaff/moonstaff-v2-thumbnail.png',contentType:'image/png'}));
 page=await context.newPage();
 report.console=[];page.on('console',m=>report.console.push({at:Date.now(),type:m.type(),text:m.text()}));
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))errors.push(m.text());});
 page.on('response',async r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`HTTP ${r.status()} ${r.url()}`);if(r.url().includes('/rpg/resolve')){try{receipts.push(await r.json());}catch{}}});
 page.on('requestfailed',r=>errors.push(`Request failed ${r.url()} ${r.failure()?.errorText}`));
 await page.addInitScript(()=>{localStorage.setItem('institute:rpg:muted','true');window.contextEvents=[];for(const type of ['webglcontextlost','webglcontextrestored'])document.addEventListener(type,()=>window.contextEvents.push({type,clock:performance.now()}),true);});await page.goto('http://127.0.0.1:5261/');
 await page.waitForFunction(()=>!!window.__game?.world?.loadedAt&&!__game.busy,undefined,{timeout:90000});
 report.browser='existing Chromium CDP 9222; separate disposable context';
 report.loaded=await page.evaluate(()=>({programs:__game.world.renderer.info.programs.length,warm:__game.world.diagnostics.drawWarmup}));
 await page.locator('#rpg-dialog-content [data-action="begin"]').click();await ready(page);
 await page.evaluate(()=>{window.hitFrames=[];window.hitEvents=[];const w=__game.world;const render=w.composer.render.bind(w.composer);w.composer.render=function(...args){const result=render(...args);const mount=w.heroVisual.getObjectByName('HeldEquipment');let tip;mount?.traverse(n=>{if(n.userData.attachmentRole==='Tip')tip=n;});window.hitFrames.push({itemId:w.heldEquipment?.itemId,mountUuid:mount?.uuid,tipWorld:tip?.getWorldPosition(w.hero.position.clone()).toArray(),clock:performance.now(),age:w.attackAge,attacking:w.attacking,traveling:w.traveling,encounter:w.encounter,visible:w.enemies.filter(e=>e.root.visible).length,programs:w.renderer.info.programs.length,contextLost:w.renderer.getContext().isContextLost(),enemies:w.enemies.map(e=>({id:e.id,hp:e.hp,dead:e.dead,visible:e.root.visible,at:e.root.userData.hitReaction?.at,erosion:e.root.userData.electricDissolve??0,position:e.root.position.toArray()}))});return result;};const hit=w.hitEnemy;w.hitEnemy=function(enemy,color,result){window.hitEvents.push({clock:performance.now(),age:this.attackAge,id:enemy.id,result});return hit.call(this,enemy,color,result);};});
 report.equipmentLifecycle=await page.evaluate(()=>{
 const w=__game.world;const mount=()=>w.heroVisual.getObjectByName('HeldEquipment');
 if(w.heldEquipment?.itemId!=='moonstaff'||!mount())throw Error('Installed Moonshard Staff did not mount');
 const original=mount().uuid;w.setEquipment('moonstaff');if(mount()?.uuid!==original)throw Error('Same item recreates mount');
 w.setEquipment('cinderwand');if(mount())throw Error('Old mount retained');
 let embedded=[];w.heroVisual.traverse(o=>{if(o.userData.sourcePart==='equipped_sword')embedded.push(o.visible);});
 if(!embedded.length||!embedded.every(Boolean))throw Error('Base sword not restored');
 w.setEquipment('moonstaff');if(!mount())throw Error('Item did not remount');
 return {sameItemRetainsInstance:true,unmountRestoresEmbeddedSword:true,remount:true,itemId:w.heldEquipment.itemId};
});
 await page.locator('button[data-action="inventory"]').first().click();
 await page.locator('button[data-item="moonstaff"]').scrollIntoViewIfNeeded();await page.waitForTimeout(250);await page.screenshot({path:`/tmp/${label}-inventory.png`});
 report.inventory=await page.locator('.rpg-relic-art').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).backgroundImage.includes('/items/moonstaff.png')).map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,image:getComputedStyle(n).backgroundImage})));
 assert(report.inventory.length,'Inventory uses the model-derived thumbnail');
 await page.getByRole('button',{name:'Close',exact:true}).click();await ready(page);
 await page.waitForTimeout(800);report.before=await snapshot(page);assert(report.before.enemies.length<=10);await page.screenshot({path:`/tmp/${label}-before.png`});
 report.casts=[];
 for(let cast=0;cast<Number(process.env.QA_CASTS||3);cast++){
  const spell=cast===1?'ember':'cleave';await page.locator('button[data-action="spellbook"]').first().click();await page.locator(`#rpg-dialog-content button[data-spell="${spell}"]`).first().click();await page.waitForFunction(id=>__game.state.selectedSpellId===id&&!__game.busy,spell);await page.getByRole('button',{name:'Close',exact:true}).click();await ready(page);
  const before=await snapshot(page);await page.locator('#rpg-answer').fill(await page.evaluate(()=>String(__game.session.problem.answer)));await page.locator('#rpg-cast').click();
  await page.waitForFunction(()=>!__game.busy,undefined,{timeout:30000});await ready(page);await page.waitForTimeout(850);
  const after=await snapshot(page);report.casts.push({spell,before,after});
  assert.notEqual(after.problemId,before.problemId,'Each solve receives a new math problem');
  if(process.env.QA_SPELL){assert(after.encounter>=before.encounter);assert(after.kills>before.kills||after.enemies.some(e=>e.hp<e.maxHp));}
  else if(cast===0){assert.equal(after.encounter,0);assert.equal(after.enemies.filter(e=>e.dead).length,2);assert.equal(after.enemies.filter(e=>!e.dead).length,4);assert(after.enemies.filter(e=>!e.dead).some(e=>e.hp<e.maxHp));}
  else assert.equal(after.encounter,1,'Only the clearing cast advances the room');
  await page.screenshot({path:`/tmp/${label}-after-${cast+1}.png`});
 }
 await page.waitForFunction(()=>!__game.world.traveling,undefined,{timeout:30000});await page.waitForTimeout(500);
 report.contextEvents=await page.evaluate(()=>window.contextEvents);report.afterTravel=await snapshot(page);report.frames=await page.evaluate(()=>window.hitFrames);report.hits=await page.evaluate(()=>window.hitEvents);
 assert(report.frames.every(f=>f.visible<=10),'Visible roots never exceed ten');assert.equal(errors.length,0,errors.join('\n'));
 await page.reload();
 await page.waitForFunction(()=>!!window.__game?.world?.loadedAt&&!__game.busy,undefined,{timeout:90000});
 report.reload=await page.evaluate(()=>({xp:__game.state.xp,kills:__game.state.totalKills,encounter:__game.state.expedition.encounterIndex,saved:__game.state.equippedItemId,mounted:__game.world.heldEquipment.itemId}));
 assert.equal(report.reload.xp,report.afterTravel.xp);assert.equal(report.reload.kills,report.afterTravel.kills);assert.equal(report.reload.encounter,report.afterTravel.encounter);assert.equal(report.reload.saved,'moonstaff');assert.equal(report.reload.mounted,'moonstaff');
 const video=page.video();await context.close();context=null;report.videoPath=video?await video.path():null;report.success=true;
 console.log(JSON.stringify({label,success:true,video:report.videoPath,casts:report.casts.map(c=>({before:c.before.enemies.map(e=>e.hp),after:c.after.enemies.map(e=>e.hp),encounter:c.after.encounter})),maxVisible:Math.max(...report.frames.map(f=>f.visible)),hits:report.hits.length}));
} catch(error){report.failure=String(error);throw error;} finally {
 if(page&&!page.isClosed()){try{report.contextEvents=await page.evaluate(()=>window.contextEvents);if(!report.frames)report.frames=await page.evaluate(()=>window.hitFrames);if(!report.hits)report.hits=await page.evaluate(()=>window.hitEvents);}catch{}}
 if(context)await context.close();if(page?.video())report.videoPath=await page.video().path();if(browser)await browser.close();api.kill('SIGTERM');vite.kill('SIGTERM');
 await writeFile(`/tmp/${label}-evidence.json`,JSON.stringify(report,null,2));await writeFile(`/tmp/${label}-server.log`,logs.join(''));
 await writeFile('/tmp/rpg-hit-window.json',JSON.stringify({label,active:false,success:report.success??false,finishedAt:new Date().toISOString()}));
}
