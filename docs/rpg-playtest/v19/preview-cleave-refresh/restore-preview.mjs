import {chromium} from '../web/node_modules/@playwright/test/index.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='/home/houston/git/institute',report={errors:[]};
const expected=JSON.parse(readFileSync(root+'/tmp/installed-preview-refresh-recovered.json','utf8')).before.state;
let browser;
try{
 const response=await fetch('http://127.0.0.1:8839/rpg/state?profileId=rpg-playtest');
 assert(response.ok,'Existing local API must be healthy');
 report.before=await response.json();
 assert.deepEqual(report.before,expected,'Preserved local progress matches prior preview');
 assert((await fetch('http://127.0.0.1:5240/')).ok,'Existing preview server must be healthy');
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
 const pages=browser.contexts().flatMap(c=>c.pages());
 let page=pages.find(p=>p.url().startsWith('http://127.0.0.1:5240/'));
 report.reusedExistingPage=!!page;
 if(!page)page=await browser.contexts()[0].newPage();
 page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto('http://127.0.0.1:5240/');
 await page.waitForFunction(()=>!!window.__game?.world?.loadedAt&&!__game.busy,undefined,{timeout:90000});
 report.after=await page.evaluate(()=>({state:structuredClone(__game.state),moonstaffLoaded:__game.world.models.has('items/moonstaff'),frame:__game.world.frame,playing:__game.playing}));
 assert.deepEqual(report.after.state,report.before,'Preview load preserves all saved progress');
 assert(report.after.moonstaffLoaded&&report.after.frame>0);
 assert.equal(report.errors.length,0);
 await page.screenshot({path:root+'/tmp/preserved-preview-restored.png'});
 report.success=true;
 console.log(JSON.stringify({success:true,xp:report.after.state.xp,kills:report.after.state.totalKills,item:report.after.state.equippedItemId,reused:report.reusedExistingPage}));
}finally{
 writeFileSync(root+'/tmp/preserved-preview-restored.json',JSON.stringify(report,null,2));
 if(browser)await browser.close();
}
