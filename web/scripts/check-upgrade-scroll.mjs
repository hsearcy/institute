import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = await browser.newContext();
const page = await context.newPage();
try {
  await page.goto('http://127.0.0.1:5188/');
  await page.waitForFunction(() => window.__game?.world?.loadedAt && !window.__game.busy, undefined, {timeout:60000});
  const guide = page.getByRole('button', {name:'Skip guide', exact:true});
  if (await guide.isVisible()) await guide.click();
  await page.locator('.rpg-camp-menu [data-action="forge"]').click();
  await page.waitForFunction(() => !window.__game.busy);
  // Intercept mutations so this check does not spend the player's saved resources.
  await page.route('**/rpg/forge/upgrade', async route => {
    const {lootId} = route.request().postDataJSON();
    const state = await page.evaluate(id => {
      const state = structuredClone(window.__game.state);
      state.loot.find(item => item.id === id).upgradeLevel++;
      return state;
    }, lootId);
    await route.fulfill({json:{state}});
  });
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    for (let repeat=0; repeat<2; repeat++) {
      const buttons = page.locator('[data-forge-loot]:not([disabled])');
      const button = buttons.last();
      await button.scrollIntoViewIfNeeded();
      const id = await button.getAttribute('data-forge-loot');
      const before = await page.locator('#rpg-dialog-content').evaluate(el => el.scrollTop);
      assert(before > 100, 'Expected an item further down the list');
      const level = await page.evaluate(id => window.__game.state.loot.find(item => item.id === id).upgradeLevel, id);
      await button.click();
      await page.waitForFunction(({id,level}) => !window.__game.busy && window.__game.state.loot.find(item => item.id === id).upgradeLevel === level+1, {id,level});
      const after = await page.locator('#rpg-dialog-content').evaluate(el => el.scrollTop);
      assert(Math.abs(after-before) <= 1, `Scroll moved from ${before} to ${after}`);
      console.log({width,repeat,before,after});
    }
  }
  await page.evaluate(() => window.__game.showInventory());
  assert.equal(await page.locator('#rpg-dialog-content').evaluate(el => el.scrollTop),0);
} finally { await context.close(); await browser.close(); }
