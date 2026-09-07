/** Disposable Chromium QA: real learning receipts drive celebrations; never touches the family or preview DB. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Database } from 'bun:sqlite';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { rpgLevel } from '../shared/src/rpg';
import { getRpgState, saveRpgState } from '../server/src/rpg';

const root = resolve(import.meta.dir, '..'), stamp = Date.now();
const output = resolve(process.env.QA_OUTPUT ?? `/tmp/rpg-rewards-${stamp}`);
const dbPath = `/tmp/rpg-rewards-${stamp}.db`, profile = 'rpg-playtest';
const apiPort = 8975, webPort = 5275;
await mkdir(output, { recursive: true });
process.env.TUTOR_PROXY_TARGET = `http://127.0.0.1:${apiPort}`;
process.env.VITE_PROFILE_ID = profile;
const logs: string[] = [], report: any = { output, dbPath, errors: [], checks: [], layouts: [], receipts: [] };
const api = spawn('bun', ['--no-env-file', 'scripts/rpg-local-server.ts'], {
  cwd: root, env: { ...process.env, RPG_TEST_DB: dbPath, RPG_TEST_PORT: String(apiPort) }, stdio: ['ignore', 'pipe', 'pipe'],
});
api.stdout.on('data', chunk => logs.push(String(chunk))); api.stderr.on('data', chunk => logs.push(String(chunk)));
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
let context: Awaited<ReturnType<NonNullable<typeof browser>['newContext']>> | undefined;
const call = async (path: string) => { const response = await fetch(`http://127.0.0.1:${apiPort}${path}`); assert(response.ok); return response.json() as Promise<any>; };
const snapshot = () => {
  const db = new Database(dbPath, { readonly: true });
  try { return { wallet: db.query('SELECT gems,lifetime_gems,streak,shields,crazy_coins FROM profile_state WHERE profile_id=?').get(profile), attempts: db.query('SELECT COUNT(*) AS count FROM attempts WHERE profile_id=?').get(profile), mastery: db.query('SELECT * FROM topic_mastery WHERE profile_id=? ORDER BY topic_id').all(profile) }; }
  finally { db.close(); }
};
try {
  for (let i = 0; ; i++) { try { if ((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok) break; } catch {} assert(i < 150, logs.join('')); await Bun.sleep(100); }
  await call(`/state?profileId=${profile}`); // Generate today's original quest rows first.
  const db = new Database(dbPath);
  try {
    const state = getRpgState(db, profile); state.xp = 58; Object.assign(state, rpgLevel(state.xp)); saveRpgState(db, state);
    db.query('UPDATE profile_state SET streak=9 WHERE profile_id=?').run(profile);
    for (const [key, progress] of [['mine_gems',49],['solve_10',19],['streak_5',9],['speed_8',4],['topic_explorer',4]] as const)
      db.query('UPDATE quests SET progress=?,done=? WHERE profile_id=? AND quest_key=?').run(progress,key==='topic_explorer'?1:0,profile,key);
  } finally { db.close(); }
  vite = await createServer({ root: resolve(root,'web'), server: {host:'127.0.0.1',port:webPort,strictPort:true,watch:null,hmr:false} }); await vite.watcher.close(); await vite.listen();
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  report.preexistingTabs = browser.contexts().flatMap(ctx => ctx.pages()).map(page => page.url());
  context = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await context.route('**/favicon.ico', route => route.fulfill({status:204}));
  await context.addInitScript(() => localStorage.setItem('institute:rpg:muted','true'));
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('response', async response => {
    if (response.status()>=400) report.errors.push(`HTTP ${response.status()} ${response.url()}`);
    if (response.url().endsWith('/tutor/attempt') || response.url().endsWith('/rpg/resolve')) report.receipts.push({url:response.url(),body:await response.json()});
  });
  const idle = () => page.waitForFunction(() => !!(window as any).__game?.state && !(window as any).__game.busy);
  const ready = async () => {
    for(let i=0;i<350;i++) { const demo=page.getByRole('button',{name:'Let me try',exact:true}); if(await demo.isVisible()) await demo.click(); if(await page.evaluate(()=>{const g=(window as any).__game;return !!g.session&&!g.busy&&!g.panel&&!g.world.traveling;})) return; await page.waitForTimeout(100); }
    throw Error('Problem not ready');
  };
  const shot = (name:string) => page.screenshot({path:resolve(output,`${name}.png`)});
  const layout = async (name:string) => {
    const value=await page.evaluate(()=>{
      const box=(s:string)=>{const el=document.querySelector(s)!;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,pointer:getComputedStyle(el).pointerEvents};};
      return {viewport:{width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth>innerWidth,xp:box('#rpg-xp-track'),hint:box('[data-action=explain]'),skip:box('[data-action=walkthrough]'),controls:box('#rpg-answer-form'),reward:document.querySelector('.rpg-reward-reveal')?box('.rpg-reward-reveal'):null};
    }); report.layouts.push({name,...value}); assert(!value.overflow,`${name}: horizontal overflow`);
    for(const key of ['hint','skip'] as const) {const b=value[key]; assert(b.x>=0&&b.y>=0&&b.right<=value.viewport.width&&b.bottom<=value.viewport.height,`${name}: ${key} clipped`);}
    if(value.viewport.height>500) assert(value.xp.height>=20,`${name}: XP too small`);
    if(value.reward) {
      assert.equal(value.reward.pointer,'none');
      const a=value.reward,b=value.controls; assert(a.right<=b.x||a.x>=b.right||a.bottom<=b.y||a.y>=b.bottom,`${name}: reward overlaps answer controls`);
    }
    return value;
  };
  await page.goto(`http://127.0.0.1:${webPort}/`); await idle(); await page.locator('[data-action=begin]').click(); await ready();
  assert(await page.getByRole('button',{name:'Hint',exact:true}).isVisible()); assert(await page.getByRole('button',{name:"I don't know",exact:true}).isVisible());
  const beforeHint=snapshot(); await page.getByRole('button',{name:'Hint',exact:true}).click(); await idle(); await page.locator('#rpg-hint').waitFor(); assert.deepEqual(snapshot(),beforeHint); await shot('help-and-xp-desktop'); await layout('desktop');
  report.checks.push('Hint is directly visible/clickable on actual problem and changes no wallet, attempts, or mastery');
  await page.locator('#rpg-answer').fill(await page.evaluate(()=>String((window as any).__game.session.problem.answer)));
  await page.locator('#rpg-cast').click();
  for(const kind of ['quest','daily-board','level']) {
    await page.locator(`.rpg-reward-reveal[data-kind="${kind}"]`).waitFor({timeout:60000}); await page.waitForTimeout(700); await shot(`actual-${kind}-desktop`); await layout(`actual-${kind}-desktop`); console.log(`SCREENSHOT ${resolve(output,`actual-${kind}-desktop.png`)}`);
  }
  await page.locator('.rpg-reward-reveal').waitFor({state:'detached',timeout:10000}); await ready();
  const state=await call(`/rpg/state?profileId=${profile}`), legacy=await call(`/state?profileId=${profile}`);
  assert.equal(state.level,2); assert.equal(state.xp,90); assert(legacy.quests.every((q:any)=>q.done));
  const attempt=report.receipts.find((r:any)=>r.url.endsWith('/tutor/attempt'))?.body;
  assert.equal(attempt.reward.questsCompleted.length,4); assert.equal(attempt.reward.allDailiesCrazyCoin,true);
  report.checks.push('One actual correct answer earned 32 XP, four quest receipts, daily-board Crazy Coin and level 2; queued cards each appeared');
  const diagnostic=async(kind:'quest'|'level',name:string)=>{
    await page.evaluate(({kind,name})=>(window as any).__game.celebrations.celebrate({id:`diagnostic-${name}`,kind,title:kind==='level'?'LEVEL UP!':'4 quests complete!',subtitle:kind==='level'?'Your magic is growing!':'Earn 50 gems today · Solve 20 problems · Reach a 10-streak · Lightning: 5 under 20 seconds',reward:kind==='level'?'+1 skill point':'+75 gems',level:2}),{kind,name});
    await page.locator('.rpg-reward-reveal').waitFor(); await page.waitForTimeout(700); await shot(name); await layout(name); console.log(`SCREENSHOT ${resolve(output,`${name}.png`)}`); await page.locator('.rpg-reward-reveal').waitFor({state:'detached'});
  };
  for(const [name,width,height] of [['phone',390,844],['landscape',844,390]] as const){await page.setViewportSize({width,height}); await diagnostic('quest',`diagnostic-quest-${name}`); await diagnostic('level',`diagnostic-level-${name}`);}
  await page.setViewportSize({width:390,height:844}); await page.emulateMedia({reducedMotion:'reduce'}); await diagnostic('level','diagnostic-level-reduced-motion');
  report.checks.push('Presentation-only replay verified portrait/landscape placement and reduced-motion static level card; no rewards issued by replay');
  const beforeSkip=snapshot(); const skipped=page.waitForResponse(r=>r.url().endsWith('/tutor/skip'));
  await page.getByRole('button',{name:"I don't know",exact:true}).click(); await skipped; await page.getByRole('button',{name:'Cast together & continue',exact:true}).waitFor(); await shot('walkthrough-phone');
  const afterSkip=snapshot(); assert.equal((afterSkip.wallet as any).streak,(beforeSkip.wallet as any).streak); assert.equal((afterSkip.wallet as any).shields,(beforeSkip.wallet as any).shields); assert.deepEqual(afterSkip.wallet,beforeSkip.wallet);
  assert.equal((afterSkip.attempts as any).count,(beforeSkip.attempts as any).count+1);
  report.checks.push("Direct I don't know uses existing tutor/skip and worked example; wallet, streak and shields preserved");
  await page.setViewportSize({width:844,height:390}); await shot('walkthrough-landscape');
  await page.getByRole('button',{name:'Cast together & continue',exact:true}).click(); await ready(); await layout('landscape-after-walkthrough');
  assert.equal(report.errors.length,0,report.errors.join('\n')); report.success=true;
} catch(error) {report.failure=String(error); throw error;}
finally {if(context)await context.close();if(browser)await browser.close();if(vite)await vite.close();api.kill('SIGTERM');await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));await writeFile(resolve(output,'server.log'),logs.join(''));}
console.log(JSON.stringify(report));
