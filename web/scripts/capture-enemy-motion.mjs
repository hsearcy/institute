import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const out = process.argv[2] || '/tmp/enemy-motion';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:900,height:760}});
await page.route('**/@vite/client', route=>route.fulfill({contentType:'application/javascript',body:''}));
page.on('pageerror', e=>console.error(e.message));
for (const kind of (process.argv[3] || 'skeleton,revenant,guardian,vault-guardian-boss,wraith').split(',')) {
  await page.goto(`http://127.0.0.1:5191/enemy-animation-review.html?model=${kind}`);
  await page.waitForFunction(()=>window.__review?.ok,{},{timeout:60000});
  console.log(kind, await page.evaluate(()=>window.__review));
  for (const state of (process.argv[4] || 'idle,hit,death').split(',')) {
    for (const t of (process.env.MOTION_TIMES ? process.env.MOTION_TIMES.split(',').map(Number) : state === 'idle' ? [0,1.5,3,4.5,6,7.5,9,10.5,12,13.5,15,17,18] : [0,.045,.11,.2,.35,.5,.7,.9,1.1,1.35,1.6,1.85,2.2])) {
      await page.evaluate(({state,t,view,side,dissolve})=>{document.getElementById('side').value=side;document.getElementById('dissolve').checked=dissolve;document.getElementById('pose').value=state;document.getElementById('view').value=view;document.getElementById('view').dispatchEvent(new Event('change'));window.__motionReview.setTime(t);},{state,t,view:process.env.MOTION_VIEW || 'quarter',side:process.env.MOTION_SIDE || '1',dissolve:process.env.MOTION_DISSOLVE==='1'});
      await page.waitForTimeout(60);
      console.log(kind,state,t);
      await page.screenshot({timeout:15000,animations:'disabled',path:`${out}/${kind}-${state}-${t}.png`});
    }
  }
}
await browser.close();
