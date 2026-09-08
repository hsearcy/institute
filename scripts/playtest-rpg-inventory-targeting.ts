/** Disposable CDP coverage: duplicate equipment, persistence, and directional casts. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Database } from 'bun:sqlite';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';

const root = resolve(import.meta.dir, '..'), stamp = Date.now();
const output = process.env.QA_OUTPUT ?? `/tmp/rpg-inventory-targeting-${stamp}`;
const dbPath = `/tmp/rpg-inventory-targeting-${stamp}.db`, apiPort = 8966, webPort = 5266, profile = 'rpg-veteran';
const visualSpells = process.env.QA_SPELLS?.split(',') ?? ['ice_lance', 'arc_lance', 'glacial_surge', 'phoenix_dive'];
await mkdir(output, { recursive: true });
process.env.TUTOR_PROXY_TARGET = `http://127.0.0.1:${apiPort}`;
process.env.VITE_PROFILE_ID = profile;
const api = spawn('bun', ['--no-env-file', 'scripts/rpg-local-server.ts'], { cwd: root, env: { ...process.env, RPG_TEST_DB: dbPath, RPG_TEST_PORT: String(apiPort) }, stdio: 'ignore' });
let vite: Awaited<ReturnType<typeof createServer>> | undefined, context: any, browser: any;
const report: any = { output, dbPath, errors: [], casts: [], diagnostics: [] };
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
  seed.loot = seed.inventory.map((itemId: string) => ({ id: `qa:${itemId}`, itemId, bonusPower: 1, upgradeLevel: 0 }));
  seed.loot.push({ id: 'qa:moonstaff-strong', itemId: 'moonstaff', bonusPower: 7, upgradeLevel: 1 });
  seed.loot.push({ id: 'qa:moonstaff-skill', itemId: 'moonstaff', bonusPower: 3, bonusSkillId: 'frost_shards', bonusSkillRanks: 1, upgradeLevel: 0 });
  seed.equippedItemId = 'moonstaff'; seed.equippedLootId = 'qa:moonstaff'; seed.selectedSpellId = 'ice_lance';
  seed.bestTier = 9; seed.dungeonTier = 10;
  const db = new Database(dbPath);
  db.query('UPDATE rpg_profiles SET state_json = ? WHERE profile_id = ?').run(JSON.stringify(seed), profile); db.close();
  const beforeLearning = learning();
  vite = await createServer({ root: resolve(root, 'web'), server: { host: '127.0.0.1', port: webPort, strictPort: true, watch: null, hmr: false } });
  await vite.watcher.close(); await vite.listen();
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('institute:rpg:muted', 'true'));
  const page = await context.newPage();
  page.on('pageerror', (error: Error) => report.errors.push(String(error)));
  page.on('console', (message: any) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) report.errors.push(message.text());
  });
  const loaded = () => page.waitForFunction(() => !!(window as any).__game?.world.loadedAt && !(window as any).__game.busy, undefined, { timeout: 90000 });
  await page.goto(`http://127.0.0.1:${webPort}`); await loaded();
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true }); if (await skip.isVisible()) await skip.click();
  if (!process.env.QA_VISUAL_ONLY) {
  await page.locator('#rpg-dialog-content [data-action="inventory"]').first().click();
  await page.screenshot({ path: resolve(output, 'inventory-desktop.png') });
  assert.deepEqual(await page.locator('.rpg-relic-slots [data-loot-equip]').evaluateAll((nodes: Element[]) => nodes.map(node => node.getAttribute('data-loot-equip'))), [...seed.loot].reverse().map((copy: any) => copy.id), 'Every copy appears once in the main grid, newest first');
  assert.equal(await page.locator('.rpg-loot-collection').count(), 0, 'There is no separate copies section');
  await page.locator('.rpg-stronger-copy-link[href="#rpg-loot-qa%3Amoonstaff-strong"]').click();
  assert(await page.locator('[data-loot-card="qa:moonstaff-strong"]').evaluate((node: Element) => {
    const card = node.getBoundingClientRect(), dialog = node.closest('.rpg-dialog')!.getBoundingClientRect();
    return card.top >= dialog.top && card.top < dialog.bottom;
  }), 'Copy comparison link must scroll to its exact grid card');
  const equip = page.locator('[data-loot-equip="qa:moonstaff-strong"]');
  await equip.scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, 'relic-grid-desktop.png') });
  await equip.click();
  await page.waitForFunction(() => (window as any).__game.state.equippedLootId === 'qa:moonstaff-strong' && !(window as any).__game.busy);
  assert.equal((await state()).equippedLootId, 'qa:moonstaff-strong');
  assert.equal((await state()).loot.length, seed.loot.length);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { (window as any).__game.showInventory(); document.querySelector('.rpg-dialog')!.scrollTop = 0; });
  await page.screenshot({ path: resolve(output, 'inventory-phone.png') });
  await page.locator('[data-loot-equip="qa:moonstaff-skill"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, 'relic-grid-phone.png') });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Phone page overflow');
  await page.reload(); await loaded();
  assert.equal(await page.evaluate(() => (window as any).__game.state.equippedLootId), 'qa:moonstaff-strong');
  assert.deepEqual(learning(), beforeLearning, 'Equipment changed learning progress');
  report.inventory = { copiesPreserved: true, equippedCopyPersisted: true, learningUnchanged: true };
  }
  await page.setViewportSize({ width: 1440, height: 900 });
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
  // These are genuine tutor submissions and persisted combat receipts.
  for (const spellId of process.env.QA_VISUAL_ONLY ? [] : ['ice_lance', 'arc_lance', 'glacial_surge', 'phoenix_dive']) {
    await page.evaluate(async spellId => { const g = (window as any).__game; await g.changeLoadout('spell', { spellId }, () => {}); }, spellId);
    await ready();
    await page.evaluate(() => {
      const w = (window as any).__game.world;
      if (!w.__originalHit) {
        w.__originalHit = w.hitEnemy.bind(w);
        w.hitEnemy = (enemy: any, color: number, hit: any, from: any) => {
          w.__contacts.push({ enemyId: enemy.id, age: w.attackAge, at: enemy.root.position.toArray(), from: from?.toArray() });
          return w.__originalHit(enemy, color, hit, from);
        };
      }
      w.__contacts = [];
    });
    const before = await page.evaluate(() => { const g = (window as any).__game; return { xp: g.state.xp, problemId: g.session.problem.id, answer: g.session.problem.answer }; });
    const receiptPromise = page.waitForResponse((r: any) => r.url().endsWith('/rpg/resolve'));
    await page.locator('#rpg-answer').fill(String(before.answer)); await page.locator('#rpg-cast').click();
    const receipt = await (await receiptPromise).json(); await ready();
    const contacts = await page.evaluate(() => (window as any).__game.world.__contacts);
    assert.deepEqual(contacts.map((c: any) => c.enemyId).sort(), receipt.reward.combat.hits.map((h: any) => h.enemyId).sort());
    assert((await state()).xp > before.xp);
    report.casts.push({ spellId, contacts, combat: receipt.reward.combat });
  }
  // Visual-only stress layout, all four quadrants. No synthetic result is sent
  // to the API. Fixed-step frames make projectile/impact review reproducible.
  const beforeDiagnostic = await state(), learningBeforeDiagnostic = learning();
  await page.evaluate(() => {
    const g = (window as any).__game, w = g.world;
    g.stopClock(); cancelAnimationFrame(w.frame); w.frame = 0;
    if (!w.__originalHit) {
      w.__originalHit = w.hitEnemy.bind(w);
      w.hitEnemy = (enemy: any, color: number, hit: any, from: any) => {
        w.__contacts.push({ enemyId: enemy.id, age: w.attackAge, at: enemy.root.position.toArray(), from: from?.toArray() });
        return w.__originalHit(enemy, color, hit, from);
      };
    }
  });
  for (const spellId of visualSpells) {
    await page.evaluate(spellId => {
      const g = (window as any).__game, w = g.world;
      const enemies = Array.from({ length: 5 }, (_, i) => ({ id: `enemy-${i}`, hp: 200, maxHp: 200 }));
      w.setEncounter(0, 'embercrypt', enemies.length, enemies);
      w.hero.position.copy(w.destination); w.heroTravelWaypoints.length = 0;
      const offsets = [[0, -4.5], [4.5, 0], [0, 4.5], [-4.5, 0], [3.4, -3.4]];
      w.enemies.forEach((enemy: any, i: number) => { enemy.origin.copy(w.hero.position); enemy.origin.x += offsets[i][0]; enemy.origin.z += offsets[i][1]; enemy.root.position.copy(enemy.origin); });
      w.tick(0); w.__contacts = []; w.__qaDrawCalls = [];
      // Fifth enemy is an unaffected bystander: visible, but no contact allowed.
      const hits = enemies.slice(0, 4).map(enemy => ({ enemyId: enemy.id, damage: 20, hpBefore: 200, hpAfter: 180 }));
      w.__qaStart = w.elapsed;
      void w.attack(spellId, { pierce: true, wide: true, combat: { enemiesBefore: enemies, enemiesAfter: enemies.map((enemy, i) => ({ ...enemy, hp: i < 4 ? 180 : 200 })), hits, defeatedIds: [], encounterCleared: false, remainingEnemies: 5, damage: 20, coverage: 4 } });
    }, spellId);
    for (const elapsed of [.2, .32, .4, .5, .6, .7, .8, 1, 1.2, 1.5]) {
      await page.evaluate(elapsed => { const w = (window as any).__game.world; while (w.elapsed - w.__qaStart < elapsed - .00001) w.tick(Math.min(1 / 60, elapsed - (w.elapsed - w.__qaStart))); }, elapsed);
      await page.evaluate(() => { const w = (window as any).__game.world; w.__qaDrawCalls.push(w.renderer.info.render.calls); });
      await page.screenshot({ path: resolve(output, `${spellId}-${Math.round(elapsed * 1000)}.png`) });
    }
    const diagnostic = await page.evaluate(() => {
      const w = (window as any).__game.world;
      while (w.attacking || w.scheduled.length) w.tick(1 / 60);
      for (let i = 0; i < 180; i++) w.tick(1 / 60);
      return { contacts: w.__contacts, drawCalls: w.__qaDrawCalls, enemies: w.enemies.map((enemy: any) => ({ id: enemy.id, hp: enemy.hp })) };
    });
    assert.deepEqual(diagnostic.contacts.map((contact: any) => contact.enemyId).sort(), ['enemy-0', 'enemy-1', 'enemy-2', 'enemy-3']);
    assert(diagnostic.contacts.every((contact: any) => contact.from?.every(Number.isFinite)), 'Directional contact must have a physical origin');
    report.diagnostics.push({ spellId, ...diagnostic });
    console.log(`Verified ${spellId}: four target contacts, no bystander contact`);
  }
  assert.deepEqual(await state(), beforeDiagnostic); assert.deepEqual(learning(), learningBeforeDiagnostic);
  assert.deepEqual(report.errors, []); report.success = true;
} catch (error) { report.failure = String(error); throw error; }
finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await context?.close(); if (browser) await browser.close(); await vite?.close(); api.kill('SIGTERM');
}
console.log(JSON.stringify({ success: report.success, inventory: report.inventory, casts: report.casts.length, diagnostics: report.diagnostics.length, output }));
