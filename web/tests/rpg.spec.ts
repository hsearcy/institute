import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { Problem, RpgState } from '../../shared/src/index';
import { rpgEncounterCombat, rpgNextRelicHunt } from '../../shared/src/rpg';

import { observePopulationCap, expectPopulationCap, expectWorldHealth, autoEngage } from './rpg-combat-assertions';

const profile = 'rpg-playtest';
const shaderFailures = new WeakMap<Page, string[]>();
const assetFailures = new WeakMap<Page, string[]>();
// Fault tests use the real renderer/simulation at a small software framebuffer;
// full-quality visuals and frame rate are inspected separately in live Chromium.
test.beforeEach(async ({page}) => {
  await observePopulationCap(page); await autoEngage(page);
  const failures: string[] = [];
  shaderFailures.set(page, failures);
  const missingAssets: string[] = [];
  assetFailures.set(page, missingAssets);
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (response.status() >= 400 && path.startsWith('/assets/rpg/')) missingAssets.push(`${response.status()} ${path}`);
  });
  page.on('console', message => {
    const text = message.text();
    if (/THREE\.WebGLProgram: Shader Error|VALIDATE_STATUS false|WebGL: INVALID_(?:OPERATION|VALUE)|GL_INVALID_OPERATION:.*(?:program|shader)/i.test(text)) failures.push(text);
  });
  page.on('load', () => { void (async () => {
    await page.waitForFunction(() => !!(window as any).__game?.world, {timeout:20000});
    await page.evaluate(() => {
      const world = (window as any).__game.world;
      if (world.diagnostics.softwareRenderer) { world.renderer.setPixelRatio(.3); world.renderer.shadowMap.enabled = false; }
    });
  })().catch(() => {}); });
});
test.afterEach(async ({page}) => {
  await expectPopulationCap(page);
  expect(shaderFailures.get(page) ?? [], 'GPU shaders must compile while gameplay progresses').toEqual([]);
  expect(assetFailures.get(page) ?? [], 'Bundled RPG art must load without falling back to missing assets').toEqual([]);
});
async function state(page: Page): Promise<RpgState> {
  return (await page.request.get(`/rpg/state?profileId=${profile}`)).json();
}
async function ready(page: Page): Promise<void> {
  await page.evaluate(() => {
    const world = (window as any).__game.world;
    if (world.diagnostics.softwareRenderer) { world.renderer.setPixelRatio(.3); world.renderer.shadowMap.enabled = false; }
  });
  await expect.poll(async () => {
    const demo = page.getByRole('button', { name: 'Let me try', exact: true });
    if (await demo.isVisible()) await demo.click();
    return page.evaluate(() => {
      const game = (window as any).__game;
      return {
        busy: game.busy,
        seeking: game.seeking,
        attribute: document.querySelector<HTMLElement>('#rpg-ui')!.dataset.busy,
        castDisabled: document.querySelector<HTMLButtonElement>('#rpg-cast')!.disabled,
        overlayHidden: document.querySelector<HTMLElement>('#rpg-overlay')!.hidden,
        panel: game.panel,
      };
    });
  }, { timeout: 60_000 }).toEqual({ busy: false, seeking: false, attribute: 'false', castDisabled: false, overlayHidden: true, panel: '' });
}
function captureProblems(page: Page): Map<string, Problem> {
  const problems = new Map<string, Problem>();
  page.on('response', async response => {
    if (!/\/tutor\/(first|branches)$/.test(response.url()) || !response.ok()) return;
    const json = await response.json().catch(() => null);
    for (const p of [json, json?.right, json?.wrong]) if (p?.prompt && typeof p.answer === 'number') problems.set(p.id, p);
  });
  return problems;
}
async function currentProblem(page: Page, problems: Map<string, Problem>): Promise<Problem> {
  const id = (await page.locator('#rpg-answer-form').getAttribute('data-problem-id'))!;
  await expect.poll(() => problems.has(id)).toBe(true);
  return problems.get(id)!;
}
async function captureCombatLayouts(page: Page, info: TestInfo, phase: string): Promise<void> {
  if (process.env.RPG_CAPTURE_COMBAT_LAYOUT !== '1') return;
  const original = page.viewportSize()!;
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const name = `${phase}-${viewport.width}x${viewport.height}`;
      const geometry = await page.evaluate(() => {
        const game = (window as any).__game, world = game.world;
        const rectangles = Object.fromEntries(['#game-canvas', '.rpg-controls', '#rpg-toast', '#rpg-boss', '#rpg-discovery'].map(selector => {
          const element = document.querySelector(selector) as HTMLElement;
          const rect = element.getBoundingClientRect();
          return [selector, { hidden: element.hidden, text: element.textContent, x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
        }));
        const canvas = document.querySelector('#game-canvas')!.getBoundingClientRect();
        const enemies = world.enemies.map((enemy: any) => {
          const head = enemy.root.position.clone().add({ x: 0, y: enemy.height, z: 0 }).project(world.camera);
          return { id: enemy.id, hp: enemy.hp, maxHp: enemy.maxHp, dead: enemy.dead,
            head: { x: canvas.left + (head.x + 1) * canvas.width / 2, y: canvas.top + (1 - head.y) * canvas.height / 2 } };
        });
        return { browserTime: performance.now(), viewport: { width: innerWidth, height: innerHeight }, rectangles, enemies, state: game.state, diagnostics: world.diagnostics };
      });
      expect(geometry.rectangles['#rpg-discovery'].hidden, 'An earlier relic card must not cover the next cast').toBe(true);
      const notice = geometry.rectangles['#rpg-toast'], boss = geometry.rectangles['#rpg-boss'];
      if (!notice.hidden && !boss.hidden) {
        const overlapWidth = Math.min(notice.x + notice.width, boss.x + boss.width) - Math.max(notice.x, boss.x);
        const overlapHeight = Math.min(notice.y + notice.height, boss.y + boss.height) - Math.max(notice.y, boss.y);
        expect(overlapWidth <= 0 || overlapHeight <= 0, 'The combat notice must not overlap the boss name or health meter').toBe(true);
      }
      await page.screenshot({ path: info.outputPath(`${name}.png`) });
      await writeFile(info.outputPath(`${name}.json`), JSON.stringify(geometry, null, 2));
      await info.attach(`${name}-geometry`, { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
    }
  } finally { await page.setViewportSize(original); }
}
async function solve(page: Page, problems: Map<string, Problem>): Promise<void> {
  await ready(page);
  const before = await state(page);
  const p = await currentProblem(page, problems);
  await page.getByRole('textbox', {name:'Your answer'}).fill(String(p.answer));
  await page.getByRole('button', {name:/Unleash/}).click();
  await expect.poll(async () => (await state(page)).xp).toBeGreaterThan(before.xp);
  await expect.poll(async () => await page.getByRole('button', {name:'Next adventure →',exact:true}).isVisible() || (await page.locator('#rpg-cast').isEnabled() && await page.locator('#rpg-answer-form').getAttribute('data-problem-id') !== p.id) || await page.getByRole('button',{name:'Let me try',exact:true}).isVisible(), {timeout:45_000}).toBe(true);
}

test('legacy learner plays an expedition, gets loot and unlocks a spell without changing learning rules', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const problems = captureProblems(page);
  const originalMastery = await (await page.request.get(`/mastery?profileId=${profile}`)).json();
  const originalLegacy = await (await page.request.get(`/state?profileId=${profile}`)).json();
  expect(originalMastery.topics.filter((t: {state:string}) => t.state === 'mastered').length).toBeGreaterThan(0);
  expect(originalLegacy.gems).toBe(482);
  await page.goto('/');
  await page.locator('.rpg-starter-spells [data-spell="cleave"]').click();
  await expect.poll(async () => (await state(page)).selectedSpellId).toBe('cleave');
  await expect(page.locator('.rpg-starter-spells [data-spell="cleave"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('.rpg-starter-spells [data-spell="ember"]').click();
  await expect.poll(async () => (await state(page)).selectedSpellId).toBe('ember');
  // Retired hero models are no longer offered in equipment or camp.
  const originalViewport = page.viewportSize()!;
  await page.locator('.rpg-camp-menu').getByRole('button', { name: 'Equipment', exact: true }).click();
  await expect(page.locator('.rpg-armor-card,[data-appearance]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to camp', exact: true }).click();
  await expect(page.locator('.rpg-armor-progress')).toHaveCount(0);
  expect((await state(page)).appearanceId).toBe('wayfarer');
  expect(await (await page.request.get(`/mastery?profileId=${profile}`)).json()).toEqual(originalMastery);
  await page.getByRole('button',{name:'Choose an expedition',exact:true}).click();
  await expect(page.locator('[data-region="embercrypt"] [data-hunt-item="cinderwand"]')).toContainText('Cinderbranch');
  await expect(page.locator('[data-region="frostvault"] [data-hunt-item]')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('00-relic-hunt.png')});
  await page.getByRole('button',{name:'Back to camp',exact:true}).click();
  await page.getByRole('button',{name:/Enter the dungeon/}).click();
  await ready(page);
  await page.screenshot({path:info.outputPath('01-encounter.png')});
  const waiting = await state(page);
  await page.waitForTimeout(1200);
  expect(await state(page)).toEqual(waiting); // Thinking never damages or advances the encounter.

  // Roster labels alone would pass if either authored GLB silently fell back
  // to skeletons. Require the actual knight and wraith geometry in live batches.
  await expect.poll(() => page.evaluate(() => Number((window as any).__game.world.diagnostics.modelsLoaded)), { timeout: 30_000 }).toBeGreaterThanOrEqual(21);
  await expect.poll(() => page.evaluate(() => {
    const world = (window as any).__game.world, source = world.models.get('masonry-pier');
    if (!source) return false;
    const geometry = new Set<unknown>();
    source.traverse((node: any) => { if (node.isMesh) geometry.add(node.geometry); });
    const piers = world.propGroup.children.filter((node: any) => node.userData.authoredMasonryPier);
    const positions = new Set(piers.map((node: any) => `${node.userData.room}:${node.position.x}:${node.position.z}`));
    return piers.length > 0 && positions.size === piers.length
      && !world.floorGroup.children.some((node: any) => node.userData.fullPierFallback)
      && !world.propGroup.children.some((node: any) => node.userData.legacyPierProp)
      && piers.every((pier: any) => {
        let authored = false;
        pier.traverse((node: any) => { if (node.isMesh && geometry.has(node.geometry)) authored = true; });
        return authored;
      });
  }), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const world = (window as any).__game.world, source = world.models.get('masonry-post');
    if (!source) return false;
    const geometry = new Set<unknown>();
    source.traverse((node: any) => { if (node.isMesh) geometry.add(node.geometry); });
    const posts = world.propGroup.children.filter((node: any) => node.userData.authoredMasonryPost);
    const all = world.propGroup.children.filter((node: any) => node.userData.authoredMasonryPost || node.userData.authoredMasonryPier);
    const baseHeights = all.map((object: any) => {
      object.updateWorldMatrix(true, true);
      let lowest = Infinity;
      object.traverse((node: any) => {
        if (!node.isMesh) return;
        node.geometry.computeBoundingBox();
        const box = node.geometry.boundingBox;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const point = world.hero.position.clone().set(x, y, z).applyMatrix4(node.matrixWorld);
          lowest = Math.min(lowest, point.y);
        }
      });
      return lowest;
    });
    return posts.length === 19 && new Set(all.map((node: any) => `${node.userData.room}:${node.position.x}:${node.position.z}`)).size === all.length
      // Side-wall supports rest on the third aisle step. Other footings stay
      // at ground height. Check actual mesh bounds, not placement metadata.
      && baseHeights.filter((height: number) => Math.abs(height - .53) < .002).length === 33
      && baseHeights.filter((height: number) => Math.abs(height) < .002).length === 30
      && !world.floorGroup.children.some((node: any) => node.userData.shortPostFallback)
      && posts.every((post: any) => {
        let authored = false;
        post.traverse((node: any) => { if (node.isMesh && geometry.has(node.geometry)) authored = true; });
        return authored;
      });
  }), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const world = (window as any).__game.world;
    return ['skeleton', 'guardian', 'revenant', 'wraith'].every(modelId => {
      const source = world.models.get(modelId);
      if (!source) return false;
      const geometries = new Set<unknown>();
      source.traverse((node: any) => { if (node.isMesh) geometries.add(node.geometry); });
      const actors = world.enemies.filter((enemy: any) => enemy.modelId === modelId);
      return actors.length > 0 && actors.every((enemy: any) => {
        let authored = false;
        enemy.visual.traverse((node: any) => {
          if (!node.isMesh) return;
          const sourceGeometry = geometries.has(node.geometry) || [...geometries].some((g: any) => g.uuid === node.geometry.userData.enemySourceGeometry);
          const drawn = node.isSkinnedMesh ? enemy.visual.visible && world.skinnedEnemies.some((actor: any) => actor.mesh === node)
            : world.enemyInstances.some((batch: any) => batch.mesh.parent === world.enemyGroup && batch.mesh.visible && batch.sources.includes(node));
          if (sourceGeometry && drawn) authored = true;
        });
        return authored && enemy.animator.articulated;
      });
    });
  }), { timeout: 30_000 }).toBe(true);
  const roster = await page.evaluate(() => {
    const world = (window as any).__game.world;
    return { counts: world.diagnostics.enemyRoster as Record<string, number>, articulated: Number(world.diagnostics.articulatedEnemies) };
  });
  expect(roster.counts.revenant).toBeGreaterThan(0);
  expect(Object.values(roster.counts).reduce((sum, count) => sum + count, 0)).toBe(rpgEncounterCombat(waiting).enemies.length);
  expect(roster.articulated).toBe(Object.values(roster.counts).reduce((sum, count) => sum + count, 0));
  const masteryBeforeTarget = await (await page.request.get(`/mastery?profileId=${profile}`)).json();
  const targetProblem = await page.locator('#rpg-answer-form').getAttribute('data-problem-id');
  await page.getByRole('button', {name:'Open spellbook',exact:true}).click();
  await page.locator('#rpg-dialog-content [data-spell="meteor"]').click();
  await expect(page.locator('#rpg-dialog-content [data-skill-select="meteor"]')).toHaveClass(/rpg-target-skill/);
  await page.getByRole('button', {name:'Return to dungeon',exact:true}).click();
  await expect(page.locator('#rpg-next-spell')).toContainText('Meteor');
  expect(await state(page)).toEqual(waiting);
  expect(await (await page.request.get(`/mastery?profileId=${profile}`)).json()).toEqual(masteryBeforeTarget);
  await page.reload();
  await page.getByRole('button',{name:/Continue adventure/}).click(); await ready(page);
  await expect(page.locator('#rpg-next-spell')).toContainText('Meteor');
  await expect(page.locator('#rpg-answer-form')).toHaveAttribute('data-problem-id',targetProblem!);
  await page.locator('#rpg-next-spell').click();
  await expect(page.locator('#rpg-dialog-content [data-skill-select="ember_power"]')).toHaveClass(/rpg-target-skill/);
  await page.getByRole('button',{name:'Return to dungeon',exact:true}).click();

  const first = await currentProblem(page, problems);
  await page.getByRole('textbox',{name:'Your answer'}).fill(String((first.answer + 1) % 1000));
  await page.getByRole('button',{name:/Unleash/}).click();
  await expect(page.locator('#rpg-hint')).toContainText('Almost');
  expect((await state(page)).xp).toBe(waiting.xp);
  await solve(page, problems);
  const status = await (await page.request.get(`/rpg/attempt-status?profileId=${profile}&problemId=${encodeURIComponent(first.id)}`)).json();
  expect(status).toMatchObject({recorded:true,correct:false,solved:true});

  await ready(page);
  const wounded = await state(page);
  expect(wounded.expedition!.encounterIndex).toBe(waiting.expedition!.encounterIndex);
  expect(wounded.expedition!.combat!.casts).toBe(1);
  expect(wounded.expedition!.combat!.enemies.some(enemy => enemy.hp > 0 && enemy.hp < enemy.maxHp)).toBe(true);
  expect(wounded.totalKills).toBeGreaterThan(waiting.totalKills);
  expect(wounded.inventory).toEqual(waiting.inventory); // No room-clear relic yet.
  await expectWorldHealth(page, wounded.expedition!.combat!.enemies);
  await captureCombatLayouts(page, info, 'wounded-pack');
  const woundedPrompt = await page.locator('#rpg-answer-form').getAttribute('data-problem-id');
  await page.reload();
  await page.getByRole('button', { name: /Continue adventure/ }).click(); await ready(page);
  expect(await state(page)).toEqual(wounded);
  await expectWorldHealth(page, wounded.expedition!.combat!.enemies);
  await expect(page.locator('#rpg-answer-form')).toHaveAttribute('data-problem-id', woundedPrompt!);
  await solve(page, problems); // Finish this same persistent pack.
  await ready(page);
  expect((await state(page)).expedition!.encounterIndex).toBe(1);
  const masteryBeforeEquip = await (await page.request.get(`/mastery?profileId=${profile}`)).json();
  const rewardBeforeEquip = await state(page);
  await expect(page.getByRole('complementary',{name:'New relic'})).toBeVisible();
  await page.getByRole('button',{name:'Equip this relic',exact:true}).click();
  await expect.poll(async () => (await state(page)).equippedItemId).toBe('cinderwand');
  await expect(page.getByRole('complementary',{name:'New relic'})).toBeHidden();
  expect((await state(page)).xp).toBe(rewardBeforeEquip.xp);
  expect(await (await page.request.get(`/mastery?profileId=${profile}`)).json()).toEqual(masteryBeforeEquip);

  await ready(page);
  const resumePrompt = await page.locator('#rpg-problem').innerText();
  const resumeState = await state(page);
  await page.reload();
  await page.getByRole('button',{name:/Continue adventure/}).click();
  await ready(page);
  expect(await page.locator('#rpg-problem').innerText()).toBe(resumePrompt);
  expect((await state(page)).xp).toBe(resumeState.xp);
  let capturedBoss = false;
  for (let casts = 0; casts < 32 && !(await state(page)).expedition?.cleared; casts++) {
    await solve(page, problems);
    const current = await state(page);
    const boss = current.expedition!.combat!.enemies.find(enemy => enemy.id === 'enemy-0')!;
    if (!capturedBoss && current.expedition!.encounterIndex === 5 && boss.hp > 0 && boss.hp < boss.maxHp) {
      await ready(page);
      await captureCombatLayouts(page, info, 'wounded-boss');
      capturedBoss = true;
    }
  }
  expect((await state(page)).expedition?.cleared, 'A bounded series of real tutor answers must finish the expedition').toBe(true);
  await expect(page.getByRole('button',{name:'Next adventure →',exact:true})).toBeVisible();
  const completed = await state(page);
  expect(completed.expeditionsCompleted).toBe(1);
  expect(completed.level).toBeGreaterThanOrEqual(2);
  expect(completed.inventory.length).toBeGreaterThan(1);
  await page.screenshot({path:info.outputPath('02-victory.png')});

  await page.locator('#rpg-dialog-content [data-action="skills"]').click();
  await page.locator('[data-school="frost"][data-view="skills"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  const pointsBeforeSelecting = (await state(page)).skillPoints;
  await page.locator('[data-skill-select="frost"]').click();
  await expect(page.locator('.rpg-rune-summary')).toContainText('Frostfall');
  await expect(page.locator('.rpg-skill-detail')).toBeHidden();
  expect((await state(page)).skillPoints).toBe(pointsBeforeSelecting);
  await page.locator('[data-action="rune-detail"]').click();
  await expect(page.locator('.rpg-rune-tree')).toBeHidden();
  await expect(page.locator('.rpg-skill-detail')).toBeVisible();
  await page.screenshot({path:info.outputPath('03-phone-learn-rune.png')});
  await page.locator('[data-skill="frost"]').click();
  await expect.poll(async () => (await state(page)).skills.frost).toBe(1);
  expect((await state(page)).skillPoints).toBe(pointsBeforeSelecting - 1);
  await expect(page.locator('[data-skill="frost"]')).toHaveText('Mastered');
  await page.locator('[data-action="rune-detail"]').click();
  await expect(page.locator('.rpg-rune-tree')).toBeVisible();
  await page.setViewportSize(originalViewport);
  await page.screenshot({path:info.outputPath('03-skills.png')});
  await expect(page.locator('.rpg-learned-goal')).toContainText('Frostfall');
  await page.locator('.rpg-learned-goal').click();
  await expect.poll(async () => (await state(page)).selectedSpellId).toBe('frost');
  await page.locator('#rpg-dialog-content').getByRole('button', { name: 'Equipment', exact: true }).click();
  const ownedItem = completed.inventory.find(id => id !== 'apprentice')!;
  await page.locator(`[data-item="${ownedItem}"]`).click();
  await expect.poll(async () => (await state(page)).equippedItemId).toBe(ownedItem);
  await page.getByRole('button',{name:'Back to camp',exact:true}).click();
  await page.getByRole('button',{name:'Choose an expedition',exact:true}).click();
  const huntState = await state(page);
  const flameHunt = rpgNextRelicHunt(huntState, 'embercrypt')!;
  const frostHunt = rpgNextRelicHunt(huntState, 'frostvault')!;
  expect(flameHunt.itemId).not.toBe(frostHunt.itemId);
  for (const hunt of [flameHunt, frostHunt]) {
    await expect(page.locator(`[data-region="${hunt.regionId}"] [data-hunt-item="${hunt.itemId}"]`)).toBeVisible();
  }
  await page.screenshot({path:info.outputPath('03-regional-hunts.png')});
  await page.locator('[data-region="frostvault"]').click();
  await ready(page);
  await page.locator('[data-spell="frost"]').click();
  await expect.poll(async () => (await state(page)).selectedSpellId).toBe('frost');
  await solve(page, problems);
  expect((await state(page)).expedition?.regionId).toBe('frostvault');
  await page.screenshot({path:info.outputPath('04-frost-vault.png')});
  expect(errors).toEqual([]);
});

test('saved response recovery, worked help, and touch layout remain playable', async ({page}, info) => {
  const problems = captureProblems(page);
  await page.setViewportSize({width:768,height:1024});
  await page.goto('/');
  await page.getByRole('button',{name:/Continue adventure|Enter the dungeon/}).click();
  await ready(page);
  const p = await currentProblem(page, problems);
  const before = await state(page);
  let dropped = false;
  await page.route('**/rpg/resolve', async route => {
    if (dropped) { await route.continue(); return; }
    dropped = true;
    await route.fetch(); // server saves, but the response never reaches the game.
    await route.abort('failed');
  });
  await page.getByRole('textbox',{name:'Your answer'}).fill(String(p.answer));
  await page.getByRole('button',{name:/Unleash/}).click();
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
  const saved = await state(page);
  expect(saved.xp).toBeGreaterThan(before.xp);
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await ready(page);
  expect(await state(page)).toEqual(saved);
  await expectWorldHealth(page, saved.expedition!.combat!.enemies);
  await page.unroute('**/rpg/resolve');

  await page.locator('[data-action=walkthrough]').click();
  await expect(page.getByRole('button',{name:'Next question',exact:true})).toBeVisible();
  const assistedBefore = await state(page);
  await page.screenshot({path:info.outputPath('05-worked-help.png')});
  await page.getByRole('button',{name:'Next question',exact:true}).click();
  await ready(page);
  expect(await state(page)).toEqual(assistedBefore);
  const dismissRelic = page.getByRole('button',{name:'Dismiss new relic',exact:true});
  if (await dismissRelic.isVisible()) await dismissRelic.click();
  await page.getByRole('button',{name:'Toggle number pad',exact:true}).click();
  await expect(page.getByRole('button',{name:'Delete digit',exact:true})).toBeVisible();
  const touch = await currentProblem(page,problems);
  for (const digit of String(touch.answer)) await page.locator(`#rpg-keypad [data-digit="${digit}"]`).click();
  await expect(page.getByRole('textbox',{name:'Your answer'})).toHaveValue(String(touch.answer));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:info.outputPath('06-phone.png')});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const formBox = await page.locator('#rpg-answer-form').boundingBox();
  expect(formBox!.x).toBeGreaterThanOrEqual(0);
  expect(formBox!.x+formBox!.width).toBeLessThanOrEqual(390);
  await page.setViewportSize({width:844,height:390});
  await expect.poll(() => page.evaluate(() => {
    const world = (window as any).__game.world;
    const feet = world.hero.position.clone().project(world.camera);
    const canvas = document.querySelector('#game-canvas')!.getBoundingClientRect();
    const dock = document.querySelector('.rpg-controls')!.getBoundingClientRect();
    const feetX = canvas.left + (feet.x + 1) * canvas.width / 2;
    const feetY = canvas.top + (1 - feet.y) * canvas.height / 2;
    return canvas.right <= dock.left && feetX > canvas.left + 20 && feetX < canvas.right - 20
      && feetY > canvas.top + 20 && feetY < canvas.bottom - 20;
  })).toBe(true);
  const keypad = await page.locator('#rpg-keypad').boundingBox();
  expect(keypad!.y).toBeGreaterThan(60);
  expect(keypad!.x+keypad!.width).toBeLessThanOrEqual(844);
  await page.locator('#rpg-keypad [data-digit="0"]').click();
  await expect(page.getByRole('textbox',{name:'Your answer'})).toHaveValue(`${touch.answer}0`);
  await page.getByRole('button',{name:'Delete digit',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Your answer'})).toHaveValue(String(touch.answer));
  await page.screenshot({path:info.outputPath('07-landscape.png')});
  await page.getByRole('button',{name:'Pause and save',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Adventure saved'})).toBeVisible();
  await page.getByRole('button',{name:'Save & leave',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue adventure'})).toBeVisible();
});

test('Camp Records tab shows saved math stats on desktop and phone', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip guide', exact: true }).click();
  await page.locator('.rpg-camp-menu [data-action="quests"]').click();
  const tabs = page.getByRole('navigation', { name: 'Camp activities' });
  await tabs.getByRole('button', { name: 'Records', exact: true }).click();
  const records = page.getByRole('region', { name: 'Your Math Records' });
  await expect(records).toBeVisible();
  await expect(tabs.getByRole('button', { name: 'Records', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const saved = await (await page.request.get(`/state?profileId=${profile}`)).json();
  await expect(records.locator('.rpg-records-tile.today strong')).toHaveText(String(saved.daily.today));
  await expect(records.locator('.rpg-records-tile.lifetime strong')).toHaveText(String(saved.daily.stats.trackedSolves));
  await expect(records.getByRole('listitem')).toHaveCount(14);
  await expect(records.locator('.rpg-records-tile')).toHaveCount(6);
  await page.screenshot({ path: info.outputPath('camp-records-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await records.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await tabs.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('camp-records-phone.png') });
  await tabs.getByRole('button', { name: 'Quest board', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Daily quests', exact: true })).toBeVisible();
  await expect(records).toHaveCount(0);
});

test('free movement: the problem waits until the hero walks up to the horde', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__rpgWalkByHand = true; });
  await page.goto('/');
  const start = page.getByRole('button',{name:/Continue adventure|Enter the dungeon/}), guide = page.getByRole('button',{name:'Skip guide',exact:true});
  await expect(start.or(guide).first()).toBeVisible({ timeout: 60_000 });
  if (await guide.isVisible()) await guide.click();
  await start.click();
  await expect(page.locator('#rpg-explore')).toBeVisible();
  await expect(page.locator('#rpg-answer-form')).toBeHidden();
  const entry = await page.evaluate(() => (window as any).__game.world.diagnostics.hero);
  // Walk toward the nearest monster until a problem shows: the fight, or a chest's lock on the way.
  const problemShown = () => page.evaluate(() => { const game = (window as any).__game; return game.world.combatReady || !!game.session?.chest; });
  for (let i = 0; i < 14 && !await problemShown(); i++) {
    const point = await page.evaluate(() => {
      const world = (window as any).__game.world, hero = world.hero.position;
      const near = world.enemies.filter((e: any) => !e.dead).sort((a: any, b: any) => a.at.distanceTo(hero) - b.at.distanceTo(hero))[0];
      if (!near || !world.exploring) return null;
      // Click the floor a little way along the walking route, as a player would.
      const route = world.level.path({ x: hero.x, z: hero.z }, { x: near.at.x, z: near.at.z });
      const turn = route[0] ?? { x: near.at.x, z: near.at.z }, leg = Math.hypot(turn.x - hero.x, turn.z - hero.z);
      const step = leg > 8 ? { x: hero.x + (turn.x - hero.x) * 8 / leg, z: hero.z + (turn.z - hero.z) * 8 / leg } : turn;
      const at = hero.clone().set(step.x, 0, step.z).project(world.camera), box = world.renderer.domElement.getBoundingClientRect();
      return { x: box.left + (at.x + 1) / 2 * box.width, y: box.top + (1 - at.y) / 2 * box.height };
    });
    if (point) await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(1500);
  }
  await expect.poll(problemShown, { timeout: 30_000 }).toBe(true);
  await expect(page.locator('#rpg-explore')).toBeHidden();
  await expect(page.locator('#rpg-answer-form')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.world.diagnostics.hero)).not.toEqual(entry);
});
