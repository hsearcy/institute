/** Compact loot descriptions and an unlearned spell granted by equipment, on an isolated save. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Database } from 'bun:sqlite';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { rpgSpellCombatStats } from '../shared/src/rpg';
const root = resolve(import.meta.dir, '..'), output = process.env.QA_OUTPUT ?? '/tmp/rpg-compact-loot-review';
const dbPath = `/tmp/compact-loot-${Date.now()}.db`, profile = 'rpg-veteran';
await mkdir(output, { recursive: true });
process.env.TUTOR_PROXY_TARGET = 'http://127.0.0.1:8970'; process.env.VITE_PROFILE_ID = profile;
const api = spawn('bun', ['--no-env-file', 'scripts/rpg-local-server.ts'], { cwd: root, env: { ...process.env, RPG_TEST_DB: dbPath, RPG_TEST_PORT: '8970' }, stdio: 'ignore' });
let vite: Awaited<ReturnType<typeof createServer>> | undefined, browser: any, context: any;
const report: any = { errors: [], checks: [], dbPath };
const state = async () => (await fetch(`http://127.0.0.1:8970/rpg/state?profileId=${profile}`)).json();
const learning = () => {
  const db = new Database(dbPath, { readonly: true });
  try { return Object.fromEntries(['attempts', 'topic_mastery', 'topic_demos', 'daily_solves'].map(table => [table, db.query(`SELECT * FROM ${table} WHERE profile_id=? ORDER BY rowid`).all(profile)])); }
  finally { db.close(); }
};
try {
  for (let i = 0; ; i++) { try { if ((await fetch('http://127.0.0.1:8970/health')).ok) break; } catch {} assert(i < 150); await Bun.sleep(100); }
  const seed = await state();
  seed.inventory = ['skybreaker', 'moonstaff', 'apprentice', 'cinderwand']; seed.skills = { cleave: 1 };
  seed.loot = seed.inventory.map((itemId: string) => ({ id: `qa:${itemId}`, itemId, bonusPower: 2, upgradeLevel: 0 }));
  Object.assign(seed.loot[0], { bonusSkillId: 'tempest_overcharge', bonusSkillRanks: 1, bonusTargets: 1, bonusSpellId: 'tempest', bonusSpellPower: 8 });
  seed.loot.push({ id: 'qa:plain', itemId: 'skybreaker', bonusPower: 2, upgradeLevel: 0 });
  seed.selectedSpellId = 'cleave'; seed.equippedItemId = 'skybreaker'; seed.equippedLootId = 'qa:skybreaker';
  const db = new Database(dbPath); db.query('UPDATE rpg_profiles SET state_json=? WHERE profile_id=?').run(JSON.stringify(seed), profile); db.close();
  const originalLearning = learning();
  vite = await createServer({ root: resolve(root, 'web'), server: { host: '127.0.0.1', port: 5270, strictPort: true, watch: null, hmr: false } });
  await vite.watcher.close(); await vite.listen();
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('institute:rpg:muted', 'true'));
  const page = await context.newPage(); page.on('pageerror', (e: Error) => report.errors.push(String(e)));
  const loaded = () => page.waitForFunction(() => !!(window as any).__game?.world.loadedAt && !(window as any).__game.busy, undefined, { timeout: 90000 });
  await page.goto('http://127.0.0.1:5270'); await loaded();
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true }); if (await skip.isVisible()) await skip.click();
  assert.equal(await page.locator('.rpg-hotbar [data-spell="tempest"]:not(.locked)').count(), 1, 'Gear spell appears immediately in the hotbar');
  assert.equal((await state()).selectedSpellId, 'cleave');
  await page.locator('#rpg-dialog-content [data-action="inventory"]').first().click();
  const card = page.locator('[data-item="skybreaker"]');
  for (const [name, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]] as const) {
    await page.setViewportSize({ width, height }); await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, `${name}-equipment.png`) });
    assert.equal(await card.getAttribute('title'), null);
    assert.deepEqual(await card.locator('[role="listitem"]').allTextContents(), ['+12 Storm power', '+2 power', '+1 Overcharge', 'Tempest: +8 damage per target', '+1 target']);
    assert.doesNotMatch(await card.innerText(), /Inactive|learn to activate|fork/i);
    assert(await page.locator('.rpg-dialog').evaluate((el: Element) => el.scrollWidth <= el.clientWidth + 1));
    await page.locator('[data-loot-card="qa:plain"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, `${name}-plain-copy.png`) });
    assert.doesNotMatch(await page.locator('[data-loot-card="qa:plain"] .rpg-compact-stats').innerText(), /Tempest|Overcharge/);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#rpg-dialog-content [data-action="spellbook"]').click(); await page.locator('#rpg-dialog-content [data-school="storm"]').click();
  await page.locator('#rpg-dialog-content [data-spell="tempest"]').click();
  await page.waitForFunction(() => (window as any).__game.state.selectedSpellId === 'tempest' && !(window as any).__game.busy);
  for (const [name, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]] as const) {
    await page.setViewportSize({ width, height }); await page.locator('.rpg-dialog').evaluate((el: Element) => { el.scrollTop = 0; });
    await page.screenshot({ path: resolve(output, `${name}-borrowed-spell.png`) });
    assert.match(await page.locator('#rpg-dialog-content [data-spell="tempest"]').innerText(), /From relic/);
  }
  assert.deepEqual((await state()).skills, seed.skills); assert.deepEqual(learning(), originalLearning);
  await page.reload(); await loaded(); assert.equal((await state()).selectedSpellId, 'tempest');
  if (!process.env.QA_UI_ONLY) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#rpg-dialog-content [data-action="begin"]').click();
    const ready = async () => {
      for (let i = 0; i < 450; i++) {
        const demo = page.getByRole('button', { name: 'Let me try', exact: true }); if (await demo.isVisible()) await demo.click();
        if (await page.evaluate(() => { const g = (window as any).__game; return !!g.session && !g.busy && !g.panel && !g.world.traveling; })) return;
        await page.waitForTimeout(100);
      }
      throw Error('Tutor did not become ready');
    };
    await ready();
    const expected = rpgSpellCombatStats(await state());
    const answer = await page.evaluate(() => { const g = (window as any).__game; g.answerClock.restore(0); g.startClock(); return String(g.session.problem.answer); });
    const response = page.waitForResponse((r: any) => r.url().endsWith('/rpg/resolve'));
    await page.locator('#rpg-answer').fill(answer); await page.locator('#rpg-cast').click();
    const receipt = await (await response).json(); assert.equal(receipt.reward.spellId, 'tempest');
    assert.equal(receipt.reward.combat.damage, expected.damage); assert.equal(receipt.reward.combat.coverage, expected.targets);
    report.cast = { expected, combat: receipt.reward.combat };
    await ready();
  }
  const beforeUnequip = learning();
  const campInventory = page.locator('#rpg-dialog-content [data-action="inventory"]').first();
  if (await campInventory.isVisible()) await campInventory.click();
  else await page.locator('[data-action="inventory"]').first().click();
  await page.locator('[data-loot-equip="qa:plain"]').click();
  await page.waitForFunction(() => (window as any).__game.state.equippedLootId === 'qa:plain' && !(window as any).__game.busy);
  assert.equal((await state()).selectedSpellId, 'cleave'); assert.deepEqual((await state()).skills, seed.skills);
  assert.deepEqual(learning(), beforeUnequip);
  await page.locator('#rpg-dialog-content [data-action="spellbook"]').click(); await page.locator('#rpg-dialog-content [data-school="storm"]').click();
  assert.doesNotMatch(await page.locator('#rpg-dialog-content [data-spell="tempest"]').innerText(), /From relic/);
  assert.match(await page.locator('#rpg-dialog-content [data-spell="tempest"]').getAttribute('class'), /locked/);
  report.checks.push('Compact stats and rare-only spell bonus visible on desktop and phone', 'Unlearned Tempest is usable from gear and survives reload', 'Unequipping borrowed skill falls back to Cleave without changing permanent skills or learning');
  assert.deepEqual(report.errors, []); report.success = true;
} catch (error) { report.failure = String(error); throw error; }
finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await context?.close(); await browser?.close(); await vite?.close(); api.kill('SIGTERM');
}
console.log(JSON.stringify(report));
