/** Disposable Chromium QA for camp progression. Never uses the user's preview DB. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Database } from 'bun:sqlite';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { rpgLevel, rpgEncounterCombat } from '../shared/src/rpg';
import { getRpgState, saveRpgState } from '../server/src/rpg';

const root = resolve(import.meta.dir, '..'), stamp = Date.now();
const output = resolve(process.env.QA_OUTPUT ?? `/tmp/rpg-progression-${stamp}`);
const dbPath = `/tmp/rpg-progression-${stamp}.db`, profile = 'rpg-playtest';
const apiPort = 8974, webPort = 5274;
await mkdir(output, { recursive: true });
process.env.TUTOR_PROXY_TARGET = `http://127.0.0.1:${apiPort}`;
process.env.VITE_PROFILE_ID = profile;
const logs: string[] = [];
const api = spawn('bun', ['--no-env-file', 'scripts/rpg-local-server.ts'], {
  cwd: root, env: { ...process.env, RPG_TEST_DB: dbPath, RPG_TEST_PORT: String(apiPort) }, stdio: ['ignore', 'pipe', 'pipe'],
});
api.stdout.on('data', chunk => logs.push(String(chunk))); api.stderr.on('data', chunk => logs.push(String(chunk)));
const report: any = { output, dbPath, errors: [], checks: [] };
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
let context: Awaited<ReturnType<NonNullable<typeof browser>['newContext']>> | undefined;
const call = async (path: string) => {
  const response = await fetch(`http://127.0.0.1:${apiPort}${path}`);
  assert(response.ok, `HTTP ${response.status} ${path}`); return response.json() as Promise<any>;
};
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok) break; } catch {}
    assert(i < 150, logs.join('')); await Bun.sleep(100);
  }
  // Keep the legacy learning and wallet fixture intact. Seed only adventure
  // state, two different rolls, and a nearly defeated boss for bounded UI QA.
  const db = new Database(dbPath);
  try {
    const state = getRpgState(db, profile);
    state.xp = 1800; Object.assign(state, rpgLevel(state.xp));
    state.skills = { ember_power: 1, storm: 1, storm_chain: 1 };
    state.skillPoints = state.level - 4;
    state.inventory.push('thunderrod'); state.forgeDust = 40;
    state.loot!.push(
      { id: 'qa-thunder-strong', itemId: 'thunderrod', bonusPower: 4, bonusSkillId: 'storm_chain', bonusSkillRanks: 1, upgradeLevel: 0 },
      { id: 'qa-thunder-spare', itemId: 'thunderrod', bonusPower: 1, upgradeLevel: 0 },
    );
    state.expedition = { id: 'qa-final-room', regionId: 'embercrypt', encounterIndex: 5, encountersTotal: 6, cleared: false, startedAt: Date.now() };
    state.expedition.combat = rpgEncounterCombat(state);
    state.expedition.combat.enemies.forEach((enemy, index) => { enemy.hp = index === 0 ? 1 : 0; });
    state.totalKills = 49;
    saveRpgState(db, state);
  } finally { db.close(); }
  const learningBefore = await call(`/mastery?profileId=${profile}`);
  const legacyBefore = await call(`/state?profileId=${profile}`);
  vite = await createServer({ root: resolve(root, 'web'), server: { host: '127.0.0.1', port: webPort, strictPort: true, watch: null, hmr: false } });
  await vite.watcher.close(); await vite.listen();
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  report.preexistingTabs = browser.contexts().flatMap(ctx => ctx.pages()).map(page => page.url());
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`HTTP ${response.status()} ${response.url()}`); });
  await page.addInitScript(() => localStorage.setItem('institute:rpg:muted', 'true'));
  const idle = () => page.waitForFunction(() => !!(window as any).__game?.state && !(window as any).__game.busy);
  const state = () => call(`/rpg/state?profileId=${profile}`);
  const click = async (selector: string) => {
    const dialog = page.locator('#rpg-overlay');
    const target = await dialog.isVisible() && await dialog.locator(selector).count()
      ? dialog.locator(selector).first() : page.locator(selector).first();
    await target.click(); await idle();
  };
  const shot = (name: string) => page.screenshot({ path: resolve(output, `${name}.png`) });
  await page.goto(`http://127.0.0.1:${webPort}/`); await idle();
  await click('[data-action="quests"]');
  await page.locator('[data-quest="daily_quests_5_days"]').waitFor();
  assert.equal(await page.locator('[data-quest]').count(), 6);
  await shot('quests-desktop'); report.checks.push('Existing five daily and one weekly quest visible');
  await click('.rpg-workshop-tabs [data-action="merchant"]');
  await page.locator('[data-offer="cinderwand"]').waitFor();
  await click('[data-pin-kind="item"][data-pin-id="cinderwand"]');
  assert.equal((await state()).goal.id, 'cinderwand');
  await shot('merchant-desktop');
  // Commit the purchase, then lose only its response. Reload must replay the
  // stored intent and receipt instead of charging the original wallet twice.
  const purchaseRequests: string[] = [];
  await page.route('**/rpg/shop/buy', async route => {
    purchaseRequests.push(route.request().postDataJSON().requestId);
    if (purchaseRequests.length === 1) { await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await page.locator('[data-buy-item="cinderwand"]').click();
  await page.locator('#rpg-connection').waitFor();
  await page.reload(); await idle();
  await click('[data-action="merchant"]');
  const purchased = await state();
  assert(purchased.inventory.includes('cinderwand'));
  assert.equal(purchaseRequests.length, 2);
  assert.equal(purchaseRequests[0], purchaseRequests[1]);
  const legacyBought = await call(`/state?profileId=${profile}`);
  assert.equal(legacyBefore.gems - legacyBought.gems, 80);
  assert.deepEqual(legacyBought.quests, legacyBefore.quests);
  assert.deepEqual(legacyBought.weeklyQuest, legacyBefore.weeklyQuest);
  report.checks.push('Purchase response lost then reloaded/replayed the same request ID; legacy wallet debited once');
  await click('.rpg-workshop-tabs [data-action="forge"]');
  await page.locator('[data-forge-loot="qa-thunder-strong"]').waitFor();
  await click('[data-pin-kind="upgrade"][data-pin-id="qa-thunder-strong"]');
  await click('[data-forge-loot="qa-thunder-strong"]');
  assert.equal((await state()).loot.find((item: any) => item.id === 'qa-thunder-strong').upgradeLevel, 1);
  await click('[data-loot-equip="qa-thunder-strong"]');
  assert.equal((await state()).equippedLootId, 'qa-thunder-strong');
  await shot('blacksmith-desktop');
  await click('[data-salvage-loot="qa-thunder-spare"]');
  await click('[data-confirm-salvage="qa-thunder-spare"]');
  assert(!(await state()).loot.some((item: any) => item.id === 'qa-thunder-spare'));
  report.checks.push('Forge, rolled gear equip/comparison, and spare salvage persisted');
  assert.deepEqual(await call(`/mastery?profileId=${profile}`), learningBefore);
  const beforeReload = await state();
  await page.reload(); await idle();
  const browserSave = await page.evaluate(() => (window as any).__game.state);
  assert.deepEqual(browserSave, beforeReload);
  report.checks.push('Reload preserved loot rolls, upgrade, equipped model, dust and goal');
  await click('[data-action="begin"]');
  const ready = async () => {
    for (let i = 0; i < 350; i++) {
      const demo = page.getByRole('button', { name: 'Let me try', exact: true });
      if (await demo.isVisible()) await demo.click();
      if (await page.evaluate(() => { const g = (window as any).__game; return !!g.session && !g.busy && !g.panel && !g.world.traveling; })) return;
      await page.waitForTimeout(100);
    }
    throw Error('Problem not ready');
  };
  await ready();
  await page.locator('#rpg-answer').fill(await page.evaluate(() => String((window as any).__game.session.problem.answer)));
  await page.locator('#rpg-cast').click();
  await page.locator('.rpg-next-dungeon').waitFor({ timeout: 60000 });
  const won = await state();
  assert(won.expedition.cleared && won.bestTier === 1);
  assert(won.forgeDust > beforeReload.forgeDust);
  assert(won.loot.length > beforeReload.loot.length);
  await shot('victory-next-reward');
  await page.setViewportSize({ width: 390, height: 844 }); await shot('victory-phone');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 900 });
  report.checks.push('Actual solved problem defeated boss, granted rolled loot/dust and next-tier reward card');
  await click('.rpg-next-dungeon [data-region]'); await ready();
  assert.equal((await state()).expedition.tier, 2);
  report.checks.push('Next-reward button launched tier 2');
  await click('[data-action="quests"]'); await page.locator('[data-quest]').first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 }); await shot('quests-phone');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await click('.rpg-workshop-tabs [data-action="forge"]');
  await page.locator('[data-loot-card]').first().waitFor(); await shot('blacksmith-phone');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  report.checks.push('Phone quest board and blacksmith have no page overflow');
  const beforeRetreat = await state();
  await click('[data-action="close"]');
  await click('[data-action="pause"]');
  await click('[data-action="retreat"]');
  await click('[data-action="confirm-retreat"]');
  const retreated = await state();
  assert.equal(retreated.expedition, null);
  for (const key of ['xp', 'skills', 'loot', 'forgeDust', 'expeditionsCompleted', 'bestTier'])
    assert.deepEqual(retreated[key], beforeRetreat[key]);
  await page.locator('[data-select-tier="1"]').waitFor();
  report.checks.push('Retreat keeps all earned rewards and offers an easier tier without crediting a clear');
  assert.equal(report.errors.length, 0, report.errors.join('\n')); report.success = true;
} catch (error) { report.failure = String(error); throw error; }
finally {
  if (context) await context.close(); if (browser) await browser.close();
  if (vite) await vite.close(); api.kill('SIGTERM');
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(output, 'server.log'), logs.join(''));
}
console.log(JSON.stringify(report));
