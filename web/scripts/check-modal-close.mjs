import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='/tmp/modal-close-check';await mkdir(out,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage(),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5188/');
 await page.waitForFunction(()=>window.__game?.world?.loadedAt&&!window.__game.busy,undefined,{timeout:60000});
 const guide=page.getByRole('button',{name:'Skip guide',exact:true});if(await guide.isVisible())await guide.click();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:900});
  for(const panel of ['inventory','skills','spellbook','quests','parent']){
   await page.locator(`.rpg-camp-menu button[data-action="${panel}"]`).click();
   await page.waitForFunction(()=>!window.__game.busy);
   const close=page.getByRole('button',{name:'Close',exact:true});await close.waitFor({state:'visible'});
   const before=await close.boundingBox();
   const scroll=await page.locator('#rpg-dialog-content').evaluate(el=>{el.scrollTop=el.scrollHeight;return {top:el.scrollTop,height:el.clientHeight,total:el.scrollHeight}});
   const after=await close.boundingBox();assert(before&&after);assert(Math.abs(before.y-after.y)<1,'Close button moved during scroll');
   assert(after.y>=0&&after.y+after.height<=(width===390?844:900));
   await page.screenshot({path:`${out}/${panel}-${width}.png`});await close.click();
   results.push({panel,width,scroll,button:after});
  }
 }
 assert.equal(errors.length,0);await writeFile(out+'/report.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({checks:results.length,errors}));
}finally{await context.close();await browser.close()}
