import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222'),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
const errors=[],frames=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5188');await page.waitForFunction(()=>window.__game?.world?.loadedAt&&!window.__game.busy,undefined,{timeout:90000});
 const guide=page.getByRole('button',{name:'Skip guide',exact:true});if(await guide.isVisible())await guide.click();
 for(const region of ['mosswood','tidebreak','old-quarry','kingsgarden']){
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(region=>{const g=window.__game,w=g.world;g.state=structuredClone(g.state);g.state.expedition={id:'visual-only',regionId:region,encounterIndex:5,encountersTotal:6,cleared:false,startedAt:0};g.playing=true;g.panel='';g.root.dataset.panel='';document.querySelector('#rpg-overlay').hidden=true;document.querySelector('#rpg-controls').hidden=false;g.renderState();g.setEncounter();w.hero.position.copy(w.destination);w.cameraTarget.copy(w.destination);w.heroTravelWaypoints=[];w.setPaused(false);},region);
  await page.waitForTimeout(2200);await page.screenshot({path:`docs/concepts/destination-variety/browser/${region}-phone.png`});frames.push(await page.evaluate(()=>window.__game.world.diagnostics));
  await page.setViewportSize({width:960,height:600});await page.waitForTimeout(250);
  const pixels=await page.evaluate(()=>{const w=window.__game.world;w.renderer.render(w.scene,w.camera);return w.renderer.domElement.toDataURL('image/jpeg',.85).split(',')[1];});
  await writeFile(`web/public/assets/rpg/outdoors/${region}-preview.jpg`,Buffer.from(pixels,'base64')); 
 }
 await writeFile('docs/concepts/destination-variety/browser/framing.json',JSON.stringify({frames,errors},null,2));if(errors.length)throw Error(errors.join('\n'));console.log('4 final phone frames, no page errors');
}finally{await context.close();await browser.close()}
