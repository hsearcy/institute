import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('/tmp/blacksmith-shortcut', { recursive: true });
try {
  await page.goto('http://127.0.0.1:5188');
  await page.waitForFunction(() => window.__game?.world?.loadedAt && !window.__game.busy, undefined, { timeout: 90000 });
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true });
  if (await skip.isVisible()) await skip.click();
  // Change only this browser's in-memory state. Do not write to the saved profile.
  await page.evaluate(() => {
    const g = window.__game;
    g.state = structuredClone(g.state);
    g.campState = structuredClone(g.campState);
    g.legacyState = structuredClone(g.legacyState);
    g.economyPending = null;
    const copy = g.state.loot.find(x => x.id === g.state.equippedLootId);
    copy.upgradeLevel = 0;
    g.state.forgeDust = 5;
    g.campState.gems = 25;
    g.playing = true;
    g.panel = ''; g.root.dataset.panel = '';
    document.querySelector('#rpg-overlay').hidden = true;
    g.renderState();
  });
  assert(await page.locator('#rpg-forge-ready').isVisible());
  assert.match(await page.locator('#rpg-blacksmith').getAttribute('aria-label'), /Upgrade available/);
  for (const [gems, dust, rank, expected] of [[24,5,0,false],[25,4,0,false],[1000,1000,5,false],[25,5,0,true]]) {
    await page.evaluate(({ gems, dust, rank }) => {
      const g = window.__game; g.campState.gems = gems; g.state.forgeDust = dust;
      g.state.loot.find(x => x.id === g.state.equippedLootId).upgradeLevel = rank;
      g.renderState();
    }, { gems, dust, rank });
    assert.equal(await page.locator('#rpg-forge-ready').isVisible(), expected);
  }
  for (const [width,height] of [[1280,800],[390,844],[320,740],[844,390]]) {
    await page.setViewportSize({width,height});
    await page.screenshot({path:`/tmp/blacksmith-shortcut/hud-${width}.png`});
    const buttons = await page.locator('.rpg-top nav button:visible').evaluateAll(nodes => nodes.map(n => {const r=n.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
    assert(buttons.every(r => r.left >= 0 && r.right <= width && r.top >= 0 && r.bottom <= height), `Menu bounds at ${width}`);
    for(let i=0;i<buttons.length;i++) for(let j=i+1;j<buttons.length;j++) {
      const a=buttons[i],b=buttons[j];
      assert(a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top, `Menu overlap at ${width}`);
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#rpg-blacksmith').click();
  await page.waitForFunction(() => !window.__game.busy && !!document.querySelector('.rpg-forge-list'), undefined, {timeout:20000});
  assert.equal(await page.evaluate(() => window.__game.panel), 'forge');
  const card = await page.locator('.rpg-forge-list .rpg-loot-card.equipped').boundingBox();
  const pane = await page.locator('#rpg-dialog-content').count() ? page.locator('#rpg-dialog-content') : page.locator('#rpg-dialog-contents');
  const frame = await pane.boundingBox();
  assert(card && frame && card.y < frame.y+frame.height && card.y+card.height > frame.y, 'Equipped item is in view');
  await page.screenshot({path:'/tmp/blacksmith-shortcut/forge-phone.png'});
  assert.deepEqual(errors, []);
  console.log('PASS: resource indicator, four screen sizes, direct forge opening, equipped item in view; no page errors.');
} finally { await context.close(); await browser.close(); }
