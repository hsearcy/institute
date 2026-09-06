import { test, expect, type Page } from '@playwright/test';
import type { Problem, RpgState } from '../../shared/src/index';
import { rpgEncounterKills, rpgNextRelicHunt } from '../../shared/src/rpg';

const profile = 'rpg-playtest';
// Fault tests use the real renderer/simulation at a small software framebuffer;
// full-quality visuals and frame rate are inspected separately in live Chromium.
test.beforeEach(async ({page}) => {
  page.on('load', () => { void (async () => {
    await page.waitForFunction(() => !!(window as any).__game?.world, {timeout:20000});
    await page.evaluate(() => {
      const world = (window as any).__game.world;
      if (world.diagnostics.softwareRenderer) { world.renderer.setPixelRatio(.3); world.renderer.shadowMap.enabled = false; }
    });
  })().catch(() => {}); });
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
        attribute: document.querySelector<HTMLElement>('#rpg-ui')!.dataset.busy,
        castDisabled: document.querySelector<HTMLButtonElement>('#rpg-cast')!.disabled,
        overlayHidden: document.querySelector<HTMLElement>('#rpg-overlay')!.hidden,
        panel: game.panel,
      };
    });
  }, { timeout: 60_000 }).toEqual({ busy: false, attribute: 'false', castDisabled: false, overlayHidden: true, panel: '' });
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
  // Cosmetic milestones are visible to a legacy level-one learner, but cannot
  // be worn early; the two-column phone layout keeps every control reachable.
  const originalViewport = page.viewportSize()!;
  await page.locator('.rpg-camp-menu').getByRole('button', { name: 'Equipment', exact: true }).click();
  await expect(page.locator('.rpg-armor-card')).toHaveCount(4);
  await expect(page.locator('[data-appearance="wayfarer"]')).toHaveAttribute('aria-pressed', 'true');
  for (const [appearance, level] of [['cinder', 12], ['glacier', 15], ['tempest', 18]] as const) {
    await expect(page.locator(`[data-appearance="${appearance}"]`)).toBeDisabled();
    await expect(page.locator(`[data-armor="${appearance}"]`)).toContainText(`Level ${level}`);
  }
  await expect(page.locator('.rpg-armor-next')).toContainText('Level 12');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('.rpg-armor-grid').evaluate(grid => grid.scrollWidth <= grid.clientWidth + 1)).toBe(true);
  const armorBounds = await page.locator('.rpg-armor-card').evaluateAll(cards => cards.map(card => ({ x: card.getBoundingClientRect().x, y: card.getBoundingClientRect().y })));
  expect(armorBounds[0]!.y).toBe(armorBounds[1]!.y);
  expect(armorBounds[2]!.y).toBeGreaterThan(armorBounds[0]!.y);
  expect((await page.locator('[data-appearance="cinder"]').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.setViewportSize(originalViewport);
  await page.getByRole('button', { name: 'Back to camp', exact: true }).click();
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
  await expect.poll(() => page.evaluate(() => Number((window as any).__game.world.diagnostics.modelsLoaded)), { timeout: 30_000 }).toBeGreaterThanOrEqual(19);
  await expect.poll(() => page.evaluate(() => {
    const world = (window as any).__game.world;
    return ['revenant', 'wraith'].every(modelId => {
      const source = world.models.get(modelId);
      if (!source) return false;
      const geometries = new Set<unknown>();
      source.traverse((node: any) => { if (node.isMesh) geometries.add(node.geometry); });
      const actors = world.enemies.filter((enemy: any) => enemy.modelId === modelId);
      return actors.length > 0 && actors.every((enemy: any) => {
        let authored = false;
        enemy.visual.traverse((node: any) => {
          if (node.isMesh && geometries.has(node.geometry) && world.enemyInstances.some((batch: any) => batch.mesh.parent === world.enemyGroup && batch.mesh.visible && batch.sources.includes(node))) authored = true;
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
  expect(Object.values(roster.counts).reduce((sum, count) => sum + count, 0)).toBe(rpgEncounterKills(waiting, waiting.expedition!.encounterIndex));
  expect(roster.articulated).toBe((roster.counts.guardian ?? 0) + (roster.counts.skeleton ?? 0) + roster.counts.revenant! + (roster.counts.wraith ?? 0));
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
  for (let i = 0; i < 6 && !(await state(page)).expedition?.cleared; i++) await solve(page, problems);
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
  expect((await state(page)).xp).toBe(saved.xp);
  await page.unroute('**/rpg/resolve');

  await page.getByRole('button',{name:'Help me',exact:true}).click();
  await page.getByRole('button',{name:/I'm not sure yet/}).click();
  await expect(page.getByRole('button',{name:'Cast together & continue',exact:true})).toBeVisible();
  const assistedBefore = await state(page);
  await page.screenshot({path:info.outputPath('05-worked-help.png')});
  await page.getByRole('button',{name:'Cast together & continue',exact:true}).click();
  await expect.poll(async () => (await state(page)).xp).toBeGreaterThan(assistedBefore.xp);
  await ready(page);
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
