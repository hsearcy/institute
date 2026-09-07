/** Real insecure-HTTP browser coverage for learning and upgrading with two points. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Database } from 'bun:sqlite';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { rpgLevel } from '../shared/src/rpg';

const root = resolve(import.meta.dir, '..'), stamp = Date.now();
const output = process.env.QA_OUTPUT ?? `/tmp/rpg-skills-${stamp}`;
const dbPath = `/tmp/rpg-skills-${stamp}.db`, apiPort = 8965, webPort = 5265, profile = 'rpg-playtest';
const origin = `http://rpg-http.test:${webPort}`;
await mkdir(output, { recursive: true });
process.env.TUTOR_PROXY_TARGET = `http://127.0.0.1:${apiPort}`;
process.env.VITE_PROFILE_ID = profile;
const api = spawn('bun', ['--no-env-file', 'scripts/rpg-local-server.ts'], { cwd: root, env: { ...process.env, RPG_TEST_DB: dbPath, RPG_TEST_PORT: String(apiPort) }, stdio: 'ignore' });
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
let context: any, browser: any;
const report: any = { errors: [], upgrades: [], output, dbPath };
const state = async () => (await fetch(`http://127.0.0.1:${apiPort}/rpg/state?profileId=${profile}`)).json();
const learning = () => {
  const db = new Database(dbPath, { readonly: true });
  try { return Object.fromEntries(['attempts', 'topic_mastery', 'topic_demos', 'daily_solves'].map(table => [table, db.query(`SELECT * FROM ${table} WHERE profile_id = ? ORDER BY rowid`).all(profile)])); }
  finally { db.close(); }
};
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok) break; } catch {}
    assert(i < 150, 'Fixture server did not start'); await Bun.sleep(100);
  }
  const seed = await state(); seed.xp = 225; Object.assign(seed, rpgLevel(seed.xp)); seed.skillPoints = 2; seed.skills = {};
  const db = new Database(dbPath);
  db.query('INSERT OR REPLACE INTO rpg_profiles (profile_id,state_json,updated_at) VALUES (?,?,?)').run(profile, JSON.stringify(seed), Date.now()); db.close();
  const beforeLearning = learning();
  vite = await createServer({ root: resolve(root, 'web'), server: { host: '127.0.0.1', port: webPort, strictPort: true, watch: null, hmr: false } });
  await vite.watcher.close(); await vite.listen();
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('institute:rpg:muted', 'true'));
  // Reserved .test origin gives a genuine insecure context. All traffic is
  // fulfilled from the local fixture; there is no external server or DNS use.
  await context.route(`${origin}/**`, async (route: any) => {
    const response = await route.fetch({ url: route.request().url().replace(origin, `http://127.0.0.1:${webPort}`) });
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  page.on('pageerror', (error: Error) => report.errors.push(String(error)));
  page.on('request', (request: any) => { if (request.url().endsWith('/rpg/upgrade')) report.upgrades.push(request.postDataJSON()); });
  await page.goto(origin);
  await page.waitForFunction(() => !!(window as any).__game?.world.loadedAt && !(window as any).__game.busy, undefined, { timeout: 90000 });
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true }); if (await skip.isVisible()) await skip.click();
  report.browser = await page.evaluate(() => ({ secure: isSecureContext, uuid: typeof crypto.randomUUID, randomValues: typeof crypto.getRandomValues }));
  assert.equal(report.browser.secure, false); assert.equal(report.browser.uuid, 'undefined');
  await page.locator('#rpg-dialog-content button[data-action="skills"]').click();
  await page.locator('button[data-skill-select="ember_power"]').click();
  const learn = page.locator('button[data-skill="ember_power"]');
  assert.equal(await learn.isDisabled(), false);
  await learn.click();
  if (process.env.QA_EXPECT_FAILURE) {
    await page.waitForTimeout(300);
    assert(report.errors.some((e: string) => e.includes('randomUUID')));
    assert.equal(report.upgrades.length, 0); assert.equal((await state()).skillPoints, 2);
    report.reproduced = true;
  } else {
    await page.waitForFunction(() => (window as any).__game.state.skillPoints === 1 && !(window as any).__game.busy);
    await learn.click();
    await page.waitForFunction(() => (window as any).__game.state.skillPoints === 0 && !(window as any).__game.busy);
    const after = await state();
    assert.equal(after.skills.ember_power, 2); assert.equal(after.skillPoints, 0); assert.equal(after.xp, seed.xp);
    assert.equal(report.upgrades.length, 2);
    assert.equal(new Set(report.upgrades.map((r: any) => r.requestId)).size, 2);
    for (const request of report.upgrades) assert.match(request.requestId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    // The same request must remain safe to replay after an uncertain response.
    const replay = await fetch(`http://127.0.0.1:${apiPort}/rpg/upgrade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report.upgrades[0]) });
    assert(replay.ok); assert.equal((await replay.json()).skills.ember_power, 2);
    await page.reload();
    await page.waitForFunction(() => !!(window as any).__game?.world.loadedAt && !(window as any).__game.busy, undefined, { timeout: 90000 });
    assert.equal((await state()).skillPoints, 0); assert.deepEqual(learning(), beforeLearning);
    assert.deepEqual(report.errors, []); report.success = true;
  }
  await page.screenshot({ path: resolve(output, 'skills.png') });
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await context?.close(); if (browser) await browser.close(); await vite?.close(); api.kill('SIGTERM');
}
console.log(JSON.stringify(report, null, 2));
