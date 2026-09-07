/** Real CDP tour coverage with an isolated save and browser context. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Database } from 'bun:sqlite';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { RPG_TUTORIAL_PAGES } from '../web/src/rpg/tutorial';

const root = resolve(import.meta.dir, '..'), stamp = Date.now();
const output = resolve(process.env.QA_OUTPUT ?? `/tmp/rpg-tutorial-${stamp}`);
const dbPath = `/tmp/rpg-tutorial-${stamp}.db`, apiPort = 8964, webPort = 5264, profile = 'rpg-playtest';
await mkdir(output, { recursive: true });
process.env.TUTOR_PROXY_TARGET = `http://127.0.0.1:${apiPort}`; process.env.VITE_PROFILE_ID = profile;
const logs: string[] = [], report: any = { output, dbPath, errors: [], pages: [], checks: [], tourMutations: [], requests: [] };
const api = spawn('bun', ['--no-env-file', 'scripts/rpg-local-server.ts'], { cwd: root,
  env: { ...process.env, RPG_TEST_DB: dbPath, RPG_TEST_PORT: String(apiPort) }, stdio: ['ignore', 'pipe', 'pipe'] });
api.stdout.on('data', c => logs.push(String(c))); api.stderr.on('data', c => logs.push(String(c)));
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
let context: Awaited<ReturnType<NonNullable<typeof browser>['newContext']>> | undefined;
let inTour = true;
const get = async (path: string) => {
  const r = await fetch(`http://127.0.0.1:${apiPort}${path}?profileId=${profile}`); assert(r.ok); return await r.json();
};
const snapshot = async () => {
  const [hero, legacy, mastery, camp] = await Promise.all(['/rpg/state', '/state', '/mastery', '/rpg/camp'].map(get));
  const db = new Database(dbPath, { readonly: true });
  try {
    const learning = Object.fromEntries(['attempts', 'topic_mastery', 'topic_demos', 'daily_solves'].map(table => [table,
      db.query(`SELECT * FROM ${table} WHERE profile_id = ? ORDER BY rowid`).all(profile)]));
    return { hero, legacy, mastery, camp, learning };
  } finally { db.close(); }
};
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok) break; } catch {}
    assert(i < 150, logs.join('')); await Bun.sleep(100);
  }
  const before = await snapshot();
  vite = await createServer({ root: resolve(root, 'web'), server: { host: '127.0.0.1', port: webPort, strictPort: true, watch: null, hmr: false } });
  await vite.watcher.close(); await vite.listen();
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  report.preexistingTabs = browser.contexts().flatMap(c => c.pages()).map(p => p.url());
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    localStorage.setItem('institute:rpg:muted', 'true');
    // A deterministic offline voice path; unavailable speech never blocks Next.
    if (window.speechSynthesis) window.speechSynthesis.getVoices = () => [];
  });
  await context.route('**/favicon.ico', r => r.fulfill({ status: 204 }));
  await context.route('**/tts', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline QA voice"}' }));
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/tts')) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('request', r => {
    const url = new URL(r.url()), method = r.method();
    if (!/^\/(?:api\/)?(?:rpg(?:\/|$)|tutor(?:\/|$)|reward(?:\/|$)|state$|mastery$|tts$)/.test(url.pathname)) return;
    const entry = { method, path: url.pathname, inTour }; report.requests.push(entry);
    if (inTour && method !== 'GET' && !url.pathname.endsWith('/tts')) report.tourMutations.push(entry);
  });
  const current = () => page.locator('.rpg-tutorial').getAttribute('data-page');
  const waitPage = (id: string) => page.waitForFunction(id => document.querySelector('.rpg-tutorial')?.getAttribute('data-page') === id, id);
  const next = () => page.locator('[data-tutorial-action="next"]').click();
  const shot = async (name: string) => { const path = resolve(output, `${name}.png`); await page.screenshot({ path }); console.log(`SCREENSHOT ${path}`); };
  await page.goto(`http://127.0.0.1:${webPort}/`);
  await waitPage('story-vault'); report.checks.push('First local visit automatically opens the story');
  await page.locator('[data-tutorial-action="speak"]').click();
  await page.waitForFunction(() => document.getElementById('rpg-toast')?.textContent?.includes('voice is resting'));
  report.checks.push('Unavailable read-aloud voice shows a message and does not block the tour');
  // Native Back and Next traverse the story without creating a tutor problem.
  await next(); await waitPage('story-hero'); await page.locator('[data-tutorial-action="back"]').click(); await waitPage('story-vault');
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => !!document.activeElement?.closest('.rpg-tutorial-card')), 'Tab escaped the guide');
  }
  report.checks.push('Keyboard focus stays in the guide; Back returns to the previous page');
  const captures = new Set(['story-vault', 'answer', 'xp', 'skills', 'learn-skill', 'merchant', 'forge', 'quests']);
  const criticalTargets: Record<string, string[]> = {
    skills: ['.rpg-rune-node'],
    'learn-skill': ['.rpg-skill-detail h3', '.rpg-detail-requirement', '.rpg-learn-rune'],
    forge: ['.rpg-loot-card h3', '[data-forge-loot]'],
  };
  for (const entry of RPG_TUTORIAL_PAGES) {
    await waitPage(entry.id);
    for (const [size, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
      await page.setViewportSize(viewport); await page.waitForTimeout(150);
      const geometry = await page.evaluate(focus => {
        const node = focus ? document.querySelector<HTMLElement>(focus) : null;
        const box = node?.getBoundingClientRect(), ring = document.querySelector<HTMLElement>('.rpg-tutorial-ring');
        const card = document.querySelector<HTMLElement>('.rpg-tutorial-card')!.getBoundingClientRect();
        return { anchor: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
          anchorVisible: !!box && box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth,
          ringVisible: ring ? !ring.hidden : false, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          cardInside: card.left >= -1 && card.right <= innerWidth + 1 && card.top >= -1 && card.bottom <= innerHeight + 1 };
      }, entry.focus ?? null);
      assert(geometry.cardInside, `${entry.id}/${size}: guide card outside viewport`);
      assert(!geometry.horizontalOverflow, `${entry.id}/${size}: horizontal overflow`);
      if (entry.focus) assert(geometry.anchorVisible && geometry.ringVisible, `${entry.id}/${size}: actual anchor missing ${JSON.stringify(geometry)}`);
      report.pages.push({ id: entry.id, size, ...geometry });
      if (captures.has(entry.id)) await shot(`${entry.id}-${size}`);
      const targets = await page.evaluate(selectors => {
        const card = document.querySelector<HTMLElement>('.rpg-tutorial-card')!.getBoundingClientRect();
        return selectors.map(selector => {
          const node = document.querySelector<HTMLElement>(selector);
          if (!node) return { selector, uncovered: 0 };
          const bounds = node.getBoundingClientRect();
          let left = Math.max(0, bounds.left), right = Math.min(innerWidth, bounds.right);
          let top = Math.max(0, bounds.top), bottom = Math.min(innerHeight, bounds.bottom);
          for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
          }
          const area = Math.max(0, right - left) * Math.max(0, bottom - top);
          const covered = Math.max(0, Math.min(right, card.right) - Math.max(left, card.left))
            * Math.max(0, Math.min(bottom, card.bottom) - Math.max(top, card.top));
          return { selector, uncovered: bounds.width * bounds.height ? (area - covered) / (bounds.width * bounds.height) : 0 };
        });
      }, criticalTargets[entry.id] ?? []);
      report.pages.at(-1).criticalTargets = targets;
      for (const target of targets) assert(target.uncovered >= .7,
        `${entry.id}/${size}: guide covers key content ${target.selector} (${Math.round(target.uncovered * 100)}% visible)`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    if (entry.id === 'answer') {
      await page.locator('.rpg-tutorial-card').focus(); await page.keyboard.type('123'); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#rpg-answer').inputValue(), '');
      const box = await page.locator('#rpg-cast').boundingBox(); assert(box);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      assert.equal(await current(), entry.id); assert.equal(await page.evaluate(() => (window as any).__game.session), null);
      report.checks.push('Typing, Enter, and clicking through the attack spotlight cannot submit or start a lesson');
    }
    if (entry.id === 'merchant') {
      const button = page.locator('[data-buy-item]:not(:disabled)').first(), box = await button.boundingBox();
      if (box && box.y >= 0 && box.y < 900) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        assert.equal(await current(), entry.id);
      }
    }
    await next();
  }
  await page.waitForFunction(() => !(window as any).__game.tutorialState && (window as any).__game.panel === 'camp');
  assert.deepEqual(await snapshot(), before, 'Tour changed saved hero, currencies, quests or learning history');
  assert(report.requests.some((entry: any) => entry.path.endsWith('/rpg/state')), 'API request observation must be active');
  assert.deepEqual(report.tourMutations, []); report.checks.push('All 15 pages complete without creating problems, changing progress, or making mutation requests');
  await page.reload(); await page.waitForFunction(() => !!(window as any).__game?.state && !(window as any).__game.busy);
  assert.equal(await page.locator('.rpg-tutorial').count(), 0);
  await page.locator('[data-action="tutorial"]').click(); await waitPage('story-vault');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.rpg-tutorial').count(), 0);
  assert.equal(await page.evaluate(() => (window as any).__game.panel), 'camp');
  assert.deepEqual(await snapshot(), before);
  report.checks.push('Completion survives refresh; How to play replays the story, and Escape skips back to camp');
  inTour = false;
  const ready = async () => {
    for (let i = 0; i < 350; i++) {
      const demo = page.getByRole('button', { name: 'Let me try', exact: true }); if (await demo.isVisible()) await demo.click();
      if (await page.evaluate(() => { const g = (window as any).__game; return !!g?.session && !g.busy && !g.panel && !g.world.traveling; })) return;
      await page.waitForTimeout(100);
    }
    throw Error('Live question unavailable');
  };
  await page.locator('[data-action="begin"]').click(); await ready();
  await page.locator('#rpg-answer').fill('12');
  await page.locator('[data-action="pause"]').click();
  const problemBefore = await page.evaluate(() => { const g = (window as any).__game; return { problem: g.session.problem, wrongCount: g.session.wrongCount, elapsed: g.answerClock.elapsed(), value: (document.getElementById('rpg-answer') as HTMLInputElement).value }; });
  const progressBeforeReplay = await snapshot(); inTour = true;
  await page.locator('[data-action="tutorial"]').click(); await waitPage('story-vault');
  await page.waitForTimeout(1250);
  await next(); await next(); await next(); await waitPage('answer');
  const pausedClock = await page.evaluate(() => (window as any).__game.answerClock.elapsed());
  assert.equal(pausedClock, problemBefore.elapsed, 'Tour consumed the live answer-power clock');
  await page.locator('[data-tutorial-action="skip"]').click();
  assert.equal(await page.evaluate(() => (window as any).__game.panel), 'pause');
  const problemAfter = await page.evaluate(() => { const g = (window as any).__game; return { problem: g.session.problem, wrongCount: g.session.wrongCount, elapsed: g.answerClock.elapsed(), value: (document.getElementById('rpg-answer') as HTMLInputElement).value }; });
  assert.deepEqual(problemAfter, problemBefore); assert.deepEqual(await snapshot(), progressBeforeReplay);
  assert.deepEqual(report.tourMutations, []);
  await page.getByRole('button', { name: 'Keep exploring', exact: true }).click();
  assert.equal(await page.locator('#rpg-answer').inputValue(), '12');
  await page.waitForTimeout(150); assert(await page.evaluate(before => (window as any).__game.answerClock.elapsed() > before, pausedClock));
  report.checks.push('Replay from Pause freezes the answer clock and restores the exact question and typed answer; play resumes afterward');
  assert.deepEqual(report.errors, []); report.success = true;
} catch (error) {
  report.failure = String(error);
  await context?.pages()[0]?.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  throw error;
}
finally {
  if (context) await context.close(); if (browser) await browser.close();
  if (vite) await vite.close(); api.kill('SIGTERM');
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(output, 'server.log'), logs.join(''));
}
console.log(JSON.stringify({ success: report.success, checks: report.checks, output }));
