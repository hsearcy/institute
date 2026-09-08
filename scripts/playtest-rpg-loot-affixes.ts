/** Real inventory equip/forge and tutor casts, using a disposable local save. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Database } from 'bun:sqlite';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { rpgSpellCombatStats } from '../shared/src/rpg';

const root = resolve(import.meta.dir, '..'), stamp = Date.now();
const output = process.env.QA_OUTPUT ?? `/tmp/rpg-loot-affixes-${stamp}`;
const dbPath = `/tmp/rpg-loot-affixes-${stamp}.db`, apiPort = 8967, webPort = 5267, profile = 'rpg-veteran';
await mkdir(output, { recursive: true });
process.env.TUTOR_PROXY_TARGET = `http://127.0.0.1:${apiPort}`; process.env.VITE_PROFILE_ID = profile;
const api = spawn('bun', ['--no-env-file', 'scripts/rpg-local-server.ts'], { cwd: root, env: { ...process.env, RPG_TEST_DB: dbPath, RPG_TEST_PORT: String(apiPort) }, stdio: 'ignore' });
let vite: Awaited<ReturnType<typeof createServer>> | undefined, context: any, browser: any;
const report: any = { output, dbPath, errors: [], casts: [], checks: [] };
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
  const seed = await state();
  seed.inventory = ['apprentice', 'moonstaff', 'icespear', 'cleaver', 'cinderwand'];
  seed.loot = seed.inventory.map((itemId: string) => ({ id: `qa:${itemId}`, itemId, bonusPower: itemId === 'moonstaff' ? 6 : 1, upgradeLevel: 0 }));
  seed.loot.push({ id: 'qa:wide', itemId: 'moonstaff', bonusPower: 3, bonusTargets: 2, upgradeLevel: 0 });
  seed.loot.push({ id: 'qa:spell', itemId: 'moonstaff', bonusPower: 3, bonusSpellId: 'ice_lance', bonusSpellPower: 6, upgradeLevel: 0 });
  seed.loot.push({ id: 'qa:school', itemId: 'moonstaff', bonusPower: 3, bonusSchoolId: 'frost', bonusSchoolPower: 4, upgradeLevel: 0 });
  seed.loot.push({ id: 'qa:unlearned', itemId: 'moonstaff', bonusPower: 3, bonusSkillId: 'frost_master', bonusSkillRanks: 2, upgradeLevel: 0 });
  seed.equippedItemId = 'moonstaff'; seed.equippedLootId = 'qa:moonstaff'; seed.selectedSpellId = 'ice_lance';
  seed.bestTier = 9; seed.dungeonTier = 10; seed.forgeDust = 50;
  const db = new Database(dbPath);
  db.query('UPDATE rpg_profiles SET state_json = ? WHERE profile_id = ?').run(JSON.stringify(seed), profile); db.close();
  const beforeLearning = learning(), baseStats = rpgSpellCombatStats(seed);
  vite = await createServer({ root: resolve(root, 'web'), server: { host: '127.0.0.1', port: webPort, strictPort: true, watch: null, hmr: false } });
  await vite.watcher.close(); await vite.listen();
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('institute:rpg:muted', 'true'));
  const page = await context.newPage();
  page.on('pageerror', (error: Error) => report.errors.push(String(error)));
  page.on('console', (message: any) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) report.errors.push(message.text()); });
  const loaded = () => page.waitForFunction(() => !!(window as any).__game?.world.loadedAt && !(window as any).__game.busy, undefined, { timeout: 90000 });
  await page.goto(`http://127.0.0.1:${webPort}`); await loaded();
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true }); if (await skip.isVisible()) await skip.click();
  await page.locator('#rpg-dialog-content [data-action="inventory"]').first().click();
  const shot = async (name: string) => page.screenshot({ path: resolve(output, `${name}.png`) });
  const top = () => page.locator('.rpg-dialog').evaluate((node: Element) => { node.scrollTop = 0; });
  await top(); await shot('inventory-desktop');
  assert.match(await page.locator('[data-item="icespear"]').textContent(), /Ice Lance/);
  assert.match(await page.locator('[data-item="cinderwand"]').textContent(), /Fire Nova/);
  for (const id of ['qa:wide', 'qa:spell', 'qa:school', 'qa:unlearned']) {
    await page.locator(`[data-loot-card="${id}"]`).scrollIntoViewIfNeeded(); await shot(`${id.replace('qa:', '')}-desktop`);
  }
  assert.match(await page.locator('[data-loot-card="qa:unlearned"]').textContent(), /Winter Crown/);
  assert.match(await page.locator('[data-loot-card="qa:unlearned"]').textContent(), /learn|inactive/i);
  await page.setViewportSize({ width: 390, height: 844 }); await top(); await shot('inventory-phone');
  await page.locator('[data-item="icespear"]').scrollIntoViewIfNeeded(); await shot('collection-phone');
  for (const id of ['qa:wide', 'qa:unlearned']) {
    await page.locator(`[data-loot-card="${id}"]`).scrollIntoViewIfNeeded(); await shot(`${id.replace('qa:', '')}-phone`);
  }
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 900 });
  const equip = async (id: string) => {
    const button = page.locator(`[data-loot-equip="${id}"]`); await button.scrollIntoViewIfNeeded(); if (!await button.isDisabled()) await button.click();
    await page.waitForFunction(id => (window as any).__game.state.equippedLootId === id && !(window as any).__game.busy, id);
  };
  await equip('qa:unlearned'); await top(); await shot('skill-affinity-desktop');
  assert.match(await page.locator('[data-item="moonstaff"] .rpg-slot-bonuses').textContent(), /Winter Crown.*Inactive.*Learn Winter Crown/);
  assert(await page.locator('.rpg-relic-slots .rpg-relic-art').evaluateAll((nodes: Element[]) => nodes.every(node => {
    const box = node.getBoundingClientRect(); return Math.abs(box.width - box.height) < 2;
  })), 'Collection thumbnails keep square frames when some copies have more bonuses');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-item="moonstaff"]').scrollIntoViewIfNeeded(); await shot('skill-affinity-phone');
  await page.setViewportSize({ width: 1440, height: 900 });
  await equip('qa:wide');
  const wide = await state(), wideStats = rpgSpellCombatStats(wide);
  assert.equal(wideStats.targets, baseStats.targets + 2); assert.equal(wideStats.damage, baseStats.damage - 3);
  assert.equal(wide.loot.length, seed.loot.length); assert.deepEqual(learning(), beforeLearning);
  await page.reload(); await loaded(); assert.equal((await state()).equippedLootId, 'qa:wide');
  assert.deepEqual((await state()).loot, seed.loot);
  report.checks.push('Extra-target copy can be equipped and survives reload without consuming copies or changing learning');
  if (!process.env.QA_UI_ONLY) {
  await page.locator('#rpg-dialog-content [data-action="begin"]').click();
  const ready = async () => {
    for (let i = 0; i < 450; i++) {
      const demo = page.getByRole('button', { name: 'Let me try', exact: true }); if (await demo.isVisible()) await demo.click();
      if (await page.evaluate(() => { const g = (window as any).__game; return !!g.session && !g.busy && !g.panel && !g.world.traveling; })) return;
      await page.waitForTimeout(100);
    }
    throw Error('Math question did not become ready');
  };
  await ready();
  for (const id of ['qa:wide', 'qa:spell', 'qa:school', 'qa:unlearned']) {
    await page.locator('[data-action="inventory"]').first().click(); await equip(id);
    await page.getByRole('button', { name: 'Close', exact: true }).click(); await ready();
    const expected = rpgSpellCombatStats(await state());
    // Time remains a combat multiplier; pin the fixture clock so the comparison
    // proves affix mechanics rather than browser/capture speed.
    const answer = await page.evaluate(() => { const g = (window as any).__game; g.answerClock.restore(0); g.startClock(); return String(g.session.problem.answer); });
    const response = page.waitForResponse((r: any) => r.url().endsWith('/rpg/resolve'));
    await page.locator('#rpg-answer').fill(answer); await page.locator('#rpg-cast').click();
    const receipt = await (await response).json(); await ready();
    assert.equal(receipt.reward.combat.damage, expected.damage); assert.equal(receipt.reward.combat.coverage, expected.targets);
    assert.equal(receipt.reward.combat.hits.length, Math.min(expected.targets, receipt.reward.combat.enemiesBefore.filter((enemy: any) => enemy.hp > 0).length));
    report.casts.push({ lootId: id, expected, combat: receipt.reward.combat });
  }
  assert.equal((await state()).skills.frost_master ?? 0, 0, 'Rolled skill must not learn the skill');
  await page.locator('[data-action="inventory"]').first().click();
  await page.locator('#rpg-dialog-content [data-action="forge"]').click();
  await page.waitForFunction(() => (window as any).__game.panel === 'forge' && !(window as any).__game.busy);
  const beforeForge = learning();
  await page.locator('[data-forge-loot="qa:wide"]').click();
  await page.waitForFunction(() => (window as any).__game.state.loot.find((copy: any) => copy.id === 'qa:wide').upgradeLevel === 1);
  const forged = (await state()).loot.find((copy: any) => copy.id === 'qa:wide');
  assert.equal(forged.bonusTargets, 2); assert.equal(forged.bonusPower, 3); assert.deepEqual(learning(), beforeForge);
  report.checks.push('Four genuine tutor casts match preview damage/coverage; inactive rank stays unlearned; forging keeps random affixes');
  }
  assert.deepEqual(report.errors, []); report.success = true;
} catch (error) { report.failure = String(error); throw error; }
finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await context?.close(); if (browser) await browser.close(); await vite?.close(); api.kill('SIGTERM');
}
console.log(JSON.stringify({ success: report.success, checks: report.checks, casts: report.casts.length, output }));
