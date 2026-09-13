import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
const out=process.argv[2]||'/tmp/game-startup';await mkdir(out,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.__startupLongTasks=[];new PerformanceObserver(list=>window.__startupLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true})});
const cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
try{
 await page.goto(process.env.STARTUP_URL||'http://127.0.0.1:5188/');
 await page.waitForFunction(()=>window.__game?.world?.loadedAt&&!window.__game.busy,undefined,{timeout:120000});
 const result=await page.evaluate(()=>({marks:performance.getEntriesByType('mark').map(e=>({name:e.name,time:e.startTime})),resources:performance.getEntriesByType('resource').map(e=>({name:e.name,start:e.startTime,end:e.responseEnd,duration:e.duration,bytes:e.transferSize})),longTasks:window.__startupLongTasks,ready:performance.now(),warmup:window.__game.world.drawWarmup,text:document.body.innerText.slice(-400)}));
 const profile=await cdp.send('Profiler.stop');await writeFile(out+'/cpu.json',JSON.stringify(profile));await writeFile(out+'/report.json',JSON.stringify({...result,errors},null,2));await page.screenshot({path:out+'/ready.png'});
 console.log(JSON.stringify({ready:result.ready,marks:result.marks,warmup:result.warmup,errors}));
}finally{await context.close();await browser.close()}
