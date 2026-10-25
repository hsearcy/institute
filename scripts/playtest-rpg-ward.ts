/** Disposable Chromium QA for the ward bar, the kneel and gear floor drops. Uses already running servers:
 * WARD_API (tutor, default 8851) on WARD_DB, and WARD_WEB (vite, default 5251). Never touches the family DB. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import { getRpgState, saveRpgState } from '../server/src/rpg';

const dbPath = process.env.WARD_DB!, web = `http://127.0.0.1:${process.env.WARD_WEB ?? 5251}`, profile = 'rpg-playtest';
const output = resolve(process.env.QA_OUTPUT ?? `/tmp/rpg-ward-${Date.now()}`);
assert(dbPath, 'WARD_DB is required');
await mkdir(output, { recursive: true });
const edit = (change: (state: ReturnType<typeof getRpgState>) => void) => {
  const db = new Database(dbPath);
  try { const state = getRpgState(db, profile); change(state); saveRpgState(db, state); } finally { db.close(); }
};
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=gl'] });
const report: any = { output, errors: [], casts: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('institute:rpg:muted', 'true'));
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('response', async response => {
    if (response.status() >= 400) report.errors.push(`HTTP ${response.status()} ${response.url()}`);
    if (response.url().endsWith('/rpg/resolve')) { const body = await response.json(); report.casts.push({ ward: body.reward.ward, steady: body.reward.steadyDust, gear: body.reward.gear?.name, cleared: body.reward.combat?.encounterCleared }); }
  });
  const idle = () => page.waitForFunction(() => !!(window as any).__game?.state && !(window as any).__game.busy, undefined, { timeout: 60000 });
  const ready = async () => {
    for (let i = 0; i < 600; i++) {
      const demo = page.getByRole('button', { name: 'Let me try', exact: true }); if (await demo.isVisible()) await demo.click();
      if (await page.evaluate(() => { const g = (window as any).__game; return !!g.session && !g.busy && !g.panel && !g.world.traveling && !g.session.lock; })) {
        // The pack waits ahead; call it to the hero instead of walking there.
        if (await page.locator('#rpg-answer').isVisible()) return;
        await page.evaluate(() => { const w = (window as any).__game.world, e = w.enemies.find((e: any) => !e.dead); if (e && !w.engaged) w.walkTo(e.at.x, e.at.z); });
      }
      await page.waitForTimeout(100);
    }
    throw Error('Problem not ready');
  };
  const shot = (name: string) => page.screenshot({ path: resolve(output, `${name}.png`) });
  const answer = async () => {
    await page.locator('#rpg-answer').fill(await page.evaluate(() => String((window as any).__game.session.problem.answer)));
    await page.locator('#rpg-cast').click();
  };
  await page.goto(`${web}/`); await idle();
  const skip = page.getByRole('button', { name: 'Skip guide' });
  await page.waitForTimeout(1500); if (await skip.isVisible()) await skip.click();
  const begin = page.locator('[data-action=begin]');
  if (await begin.isVisible()) await begin.click();
  await ready();
  await shot('ward-full-before-fight');
  let sawDrain = false, sawKnelt = false, sawGear = false;
  for (let cast = 0; cast < 40 && !(sawDrain && sawKnelt && sawGear); cast++) {
    await ready();
    // Once the bar has drained, make the ward nearly empty so the next cast shows the kneel.
    if (sawDrain && !sawKnelt) edit(state => { const combat = state.expedition?.combat; if (combat) { combat.ward = 2; combat.enemies = combat.enemies.map(e => ({ ...e, hp: e.hp > 0 ? e.maxHp + 40 : 0 })); } });
    // After the kneel, let the next clear surely drop gear: weaken the pack and pre-roll odds by retrying packs.
    if (sawKnelt && !sawGear) edit(state => { const combat = state.expedition?.combat; if (combat) combat.enemies = combat.enemies.map(e => ({ ...e, hp: Math.min(e.hp, 1) })); });
    const before = report.casts.length;
    await answer();
    for (let i = 0; i < 100 && report.casts.length === before; i++) await page.waitForTimeout(100);
    const last = report.casts.at(-1);
    // A short series: the moment comes after the spell animation, which varies.
    const series = async (name: string) => { for (let i = 0; i < 6; i++) { await page.waitForTimeout(700); await shot(`${name}-${i}`); } };
    if (last?.ward?.knelt && !sawKnelt) { await series('ward-knelt'); sawKnelt = true; }
    else if (last?.gear && !sawGear) { await series('gear-floor-drop'); sawGear = true; }
    else if (last?.ward?.lost > 0 && !sawDrain) { await page.waitForTimeout(3900); await shot('ward-drain-fight'); sawDrain = true; }
    await idle();
  }
  report.bar = await page.evaluate(() => { const bar = document.querySelector('#rpg-ward') as HTMLElement; const r = bar.getBoundingClientRect(); return { hidden: bar.hidden, text: bar.textContent, rect: [r.x, r.y, r.width, r.height], aria: bar.getAttribute('aria-valuetext') }; });
  await context.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  await phone.goto(`${web}/`); await phone.waitForFunction(() => !!(window as any).__game?.state, undefined, { timeout: 60000 });
  await phone.waitForTimeout(1500); const skipGuide = phone.getByRole('button', { name: 'Skip guide' }); if (await skipGuide.isVisible()) await skipGuide.click();
  const resume = phone.locator('[data-action=begin]'); if (await resume.isVisible()) await resume.click();
  await phone.waitForTimeout(6000); await phone.screenshot({ path: resolve(output, 'ward-phone.png') });
  report.seen = { sawDrain, sawKnelt, sawGear };
} finally { await browser.close(); console.log(JSON.stringify(report, null, 1)); }
