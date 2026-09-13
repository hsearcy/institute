import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const ids=process.argv[2]?.split(',')||JSON.parse(await readFile('../scripts/blender/items/catalogue.json','utf8')).items.map(x=>x.id);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
const context=await browser.newContext({viewport:{width:1200,height:800}});
try{
 const page=await context.newPage();
 await page.route('**/@vite/client',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 await page.goto('http://127.0.0.1:5188/weapon-review.html?candidate=1');
 await page.waitForFunction(()=>window.__weaponReady);
 for(const id of ids){
  await page.evaluate(id=>window.__weaponReview.load(id),id);
  const data=await page.evaluate(()=>window.__weaponReview.thumbnail());
  await writeFile(`public/assets/rpg/items/candidates/${id}.png`,Buffer.from(data.split(',')[1],'base64'));
  console.log(id);
 }
}finally{await context.close();await browser.close()}
