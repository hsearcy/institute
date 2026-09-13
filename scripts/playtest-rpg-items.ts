/** Real Chromium equipment coverage with a disposable seeded save.
 * Run with `bun --no-env-file scripts/playtest-rpg-items.ts` after asset install.
 * QA_ITEMS=id,id restricts a development run; default requires all 23 items.
 * No recording or existing tab/save mutation. Screenshots live in QA_OUTPUT.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { RPG_ITEMS } from '../shared/src/rpg';
import { ITEM_MODELS } from '../web/src/rpg/itemModels';

const root = resolve(import.meta.dir, '..'), stamp = Date.now();
const output = resolve(process.env.QA_OUTPUT ?? `/tmp/rpg-items-${stamp}`);
const ids = process.env.QA_ITEMS?.split(',') ?? RPG_ITEMS.map(item => item.id);
for (const id of ids) assert(ITEM_MODELS[id], `Install ${id} before browser coverage`);
const apiPort = 8963, webPort = 5263, profile = 'rpg-archmage';
const db = `/tmp/rpg-item-catalogue-${stamp}.db`;
await mkdir(output, { recursive: true });
process.env.TUTOR_PROXY_TARGET = `http://127.0.0.1:${apiPort}`;
process.env.VITE_PROFILE_ID = profile;
const api = spawn('bun', ['--no-env-file', 'scripts/rpg-local-server.ts'], {
  cwd: root, env: { ...process.env, RPG_TEST_DB: db, RPG_TEST_PORT: String(apiPort) }, stdio: ['ignore', 'pipe', 'pipe'],
});
const logs: string[] = [];
api.stdout.on('data', chunk => logs.push(String(chunk))); api.stderr.on('data', chunk => logs.push(String(chunk)));
const report: any = { db, output, items: [], errors: [], casts: [], scope: 'Actual installed assets, UI equip/save, all four armor mounts and representative solved-math combat. Visual scores are separate.' };
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
let context: Awaited<ReturnType<NonNullable<typeof browser>['newContext']>> | undefined;
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok) break; } catch {}
    assert(attempt < 150, `Fixture server unavailable: ${logs.join('')}`); await Bun.sleep(100);
  }
  vite = await createServer({ root: resolve(root, 'web'), server: { host: '127.0.0.1', port: webPort, strictPort: true, watch: null, hmr: false } });
  await vite.watcher.close(); await vite.listen();
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  report.preexistingTabs = browser.contexts().flatMap(ctx => ctx.pages()).map(page => page.url());
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, screen: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    (report.consoleErrors ??= []).push({ text: message.text(), location: message.location() });
    // HTTP failures are checked with their URL below; Chromium's duplicate
    // generic message would otherwise turn its optional favicon into a failure.
    if (!message.text().startsWith('Failed to load resource:')) report.errors.push(message.text());
  });
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  page.on('requestfailed', request => { if (!request.url().endsWith('/favicon.ico')) report.errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`); });
  await page.addInitScript(() => localStorage.setItem('institute:rpg:muted', 'true'));
  const loaded = () => page.waitForFunction(() => !!(window as any).__game?.world?.loadedAt && !(window as any).__game.busy, undefined, { timeout: 90000 });
  await page.goto(`http://127.0.0.1:${webPort}/`); await loaded();
  const guide = page.getByRole('button', { name: 'Skip guide', exact: true });
  if (await guide.isVisible()) await guide.click();
  const initial = await page.evaluate(() => (window as any).__game.state);
  report.initialProgress = { xp: initial.xp, skills: initial.skills, inventory: initial.inventory, kills: initial.totalKills };
  const ready = async () => {
    for (let i = 0; i < 300; i++) {
      const demo = page.getByRole('button', { name: 'Let me try', exact: true }); if (await demo.isVisible()) await demo.click();
      if (await page.evaluate(() => { const g = (window as any).__game; return !!g.session && !g.busy && !g.panel && !g.world.traveling; })) return;
      await page.waitForTimeout(100);
    }
    throw Error('Math question not ready');
  };
  await page.locator('#rpg-dialog-content [data-action="begin"]').click(); await ready();
  const equip = async (id: string) => {
    await page.locator('button[data-action="inventory"]').first().click();
    assert.equal(await page.locator('[data-appearance],.rpg-armor-card').count(), 0, 'Retired hero choices are still visible');
    const copyId = await page.evaluate(id => (window as any).__game.state.loot.find((copy: any) => copy.itemId === id).id, id);
    const button = page.locator(`button[data-loot-equip="${copyId}"]`); await button.scrollIntoViewIfNeeded();
    if (!await button.isDisabled()) await button.click();
    await page.waitForFunction(id => { const g = (window as any).__game; return !g.busy && g.state.equippedItemId === id && g.world.heldEquipment?.itemId === id; }, id);
  };
  for (const id of ids) {
    await equip(id);
    const card = await page.locator('.rpg-relic-art').evaluateAll((nodes, id) => nodes.filter(node => getComputedStyle(node).backgroundImage.includes(`/items/${id}.png`)).map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })), id);
    assert(card.length, `${id} has no model thumbnail in its inventory card`);
    await page.screenshot({ path: resolve(output, `${id}-inventory.png`) });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const mounts = [];
    for (const armor of ['wayfarer', 'cinder', 'glacier', 'tempest']) {
      const fit = await page.evaluate(({ id, armor }) => {
        const w = (window as any).__game.world; w.setAppearance(armor); w.hero.updateMatrixWorld(true);
        const mounts: any[] = []; w.heroVisual.traverse((node: any) => { if (node.name === 'HeldEquipment') mounts.push(node); });
        if (mounts.length !== 1 || w.heldEquipment?.itemId !== id) throw Error(`${id}/${armor}: mount count ${mounts.length}`);
        const mount = mounts[0], attachment = mount.userData.attachment;
        if (w.heroModelId !== 'hero') throw Error('Retired hero rig loaded');
        const expectedParent = attachment === 'hand.R' ? 'handR' : attachment === 'belt' ? 'pelvis' : attachment;
        if (mount.parent.name !== expectedParent) throw Error(`${id}/${armor}: wrong parent ${mount.parent.name}`);
        const embedded: boolean[] = []; w.heroVisual.traverse((node: any) => { if (node.userData.sourcePart === 'equipped_sword') embedded.push(node.visible); });
        if (!embedded.length || embedded.some(visible => visible !== (attachment !== 'hand.R'))) throw Error(`${id}/${armor}: embedded sword visibility ${embedded}`);
        let grip: any; mount.traverse((node: any) => { if (node.userData.attachmentRole === 'Grip') grip = node; });
        const position = grip?.getWorldPosition(w.hero.position.clone()).toArray();
        if (!position?.every(Number.isFinite)) throw Error(`${id}/${armor}: invalid grip position`);
        const original = mount.uuid; w.setEquipment(id);
        if (w.heroVisual.getObjectByName('HeldEquipment').uuid !== original) throw Error('Same item recreates mount');
        const center = w.hero.getWorldPosition(w.hero.position.clone()); center.y += .9; center.project(w.camera);
        return { armor, attachment, parent: mount.parent.name, position, embedded, sameInstance: true, center: { x: (center.x + 1) * 720, y: (1 - center.y) * 450 } };
      }, { id, armor });
      mounts.push(fit);
      if (armor === 'wayfarer' || fit.attachment !== 'hand.R') {
        await page.waitForTimeout(120);
        await page.screenshot({ path: resolve(output, `${id}-${armor}-native.png`) });
        if (fit.attachment !== 'hand.R') await page.screenshot({ path: resolve(output, `${id}-${armor}-fit.png`),
          clip: { x: Math.max(0, Math.min(1080, fit.center.x - 180)), y: Math.max(0, Math.min(450, fit.center.y - 225)), width: 360, height: 450 } });
        if (process.env.QA_FIT_CLOSE) {
          await page.evaluate(() => {
            const w = (window as any).__game.world;
            (window as any).__itemFitCamera = { position: w.camera.position.clone(), quaternion: w.camera.quaternion.clone(), zoom: w.camera.zoom, target: w.cameraTarget.clone(), frame: w.frame };
            if (w.frame) { cancelAnimationFrame(w.frame); w.frame = 0; }
            const target = w.hero.getWorldPosition(w.hero.position.clone()); target.y += 1.18;
            const offset = w.hero.position.clone().set(2.2, .5, 3.5).applyQuaternion(w.heroVisual.getWorldQuaternion(w.heroVisual.quaternion.clone()));
            w.camera.position.copy(target).add(offset); w.cameraTarget.copy(target); w.camera.lookAt(target); w.camera.zoom = 3.5;
            w.camera.updateProjectionMatrix(); w.camera.updateMatrixWorld(); w.composer.render();
          });
          try { await page.screenshot({ path: resolve(output, `${id}-${armor}-front-diagnostic.png`) }); }
          finally { await page.evaluate(() => {
            const w = (window as any).__game.world, prior = (window as any).__itemFitCamera;
            w.camera.position.copy(prior.position); w.camera.quaternion.copy(prior.quaternion); w.camera.zoom = prior.zoom; w.cameraTarget.copy(prior.target);
            w.camera.updateProjectionMatrix(); w.camera.updateMatrixWorld(); if (prior.frame) w.start(); delete (window as any).__itemFitCamera;
          }); }
        }
      }
    }
    await page.evaluate(() => (window as any).__game.world.setAppearance('wayfarer'));
    const saved = await (await fetch(`http://127.0.0.1:${apiPort}/rpg/state?profileId=${profile}`)).json();
    assert.equal(saved.equippedItemId, id); assert.equal(saved.xp, initial.xp); assert.deepEqual(saved.skills, initial.skills);
    report.items.push({ id, card, mounts, persisted: true });
  }
  await page.reload(); await loaded();
  report.reload = await page.evaluate(() => { const g = (window as any).__game; return { saved: g.state.equippedItemId, mounted: g.world.heldEquipment?.itemId, xp: g.state.xp, skills: g.state.skills }; });
  assert.equal(report.reload.saved, ids.at(-1)); assert.equal(report.reload.mounted, ids.at(-1)); assert.equal(report.reload.xp, initial.xp); assert.deepEqual(report.reload.skills, initial.skills);
  // A real solved question on a long weapon and a wearable exercises the same
  // learning/resolve path as normal play, without changing learning selection.
  await page.locator('#rpg-dialog-content [data-action="begin"]').click();
  await ready();
  for (const id of (process.env.QA_SKIP_COMBAT ? [] : (process.env.QA_COMBAT_ITEMS?.split(',') ?? ['apprentice', 'wintercrown', 'inferno'])).filter(id => ids.includes(id))) {
    await equip(id); await page.getByRole('button', { name: 'Close', exact: true }).click(); await ready();
    const before = await page.evaluate(() => { const g = (window as any).__game; return { xp: g.state.xp, problem: g.session.problem.id }; });
    await page.locator('#rpg-answer').fill(await page.evaluate(() => String((window as any).__game.session.problem.answer)));
    await page.locator('#rpg-cast').click(); await page.waitForFunction(xp => (window as any).__game.state.xp > xp, before.xp, { timeout: 30000 }); await ready();
    const after = await page.evaluate(() => { const g = (window as any).__game; return { xp: g.state.xp, problem: g.session.problem.id, mounted: g.world.heldEquipment?.itemId, visibleEnemies: g.world.enemies.filter((enemy: any) => enemy.root.visible).length }; });
    assert(after.xp > before.xp); assert.notEqual(after.problem, before.problem); assert.equal(after.mounted, id); assert(after.visibleEnemies <= 10);
    report.casts.push({ id, before, after });
  }
  // Display the real new-player fixture without altering the tested save.
  const newPlayer = await (await fetch(`http://127.0.0.1:${apiPort}/rpg/state?profileId=rpg-playtest`)).json();
  const beforeCollection = await page.evaluate(() => JSON.stringify((window as any).__game.state));
  await page.evaluate(state => { const g = (window as any).__game; (window as any).__priorItemState = g.state; g.state = state; g.showInventory(); }, newPlayer);
  try {
    report.lockedCollection = await page.locator('button[data-item],button[data-loot-card]').evaluateAll(nodes => nodes.map(node => ({
      id: (node as HTMLElement).dataset.item ?? (node.querySelector('.rpg-relic-art') as HTMLElement)?.style.backgroundImage.match(/items\/(.+)\.png/)?.[1], disabled: (node as HTMLButtonElement).disabled,
      thumbnail: !!node.querySelector('.rpg-relic-art'), name: node.querySelector('.rpg-armory-slot-name')?.textContent,
      lock: !!node.querySelector('.rpg-armory-slot-lock'), hint: node.querySelector('.rpg-armory-slot-hint')?.textContent,
    })));
    assert.equal(report.lockedCollection.length, RPG_ITEMS.length);
    for (const entry of report.lockedCollection) {
      assert(entry.thumbnail && entry.name !== 'Undiscovered');
      assert.equal(entry.disabled, !newPlayer.inventory.includes(entry.id));
      if (entry.disabled) assert(entry.lock && entry.hint);
    }
    await page.screenshot({ path: resolve(output, 'new-player-locked-collection.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve(output, 'new-player-locked-collection-phone.png') });
  } finally {
    await page.evaluate(() => { const g = (window as any).__game; g.state = (window as any).__priorItemState; delete (window as any).__priorItemState; g.closeDialog(); });
  }
  assert.equal(await page.evaluate(() => JSON.stringify((window as any).__game.state)), beforeCollection);
  assert.equal(report.errors.length, 0, report.errors.join('\n')); report.success = true;
} catch (error) { report.failure = String(error); throw error; }
finally {
  if (context) await context.close(); if (browser) await browser.close();
  if (vite) await vite.close(); api.kill('SIGTERM');
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(output, 'server.log'), logs.join(''));
}
console.log(JSON.stringify({ success: report.success, items: report.items.length, armorMounts: report.items.length * 4, casts: report.casts.length, output }));
