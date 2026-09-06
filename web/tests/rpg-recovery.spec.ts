import { expect, test, type Page } from '@playwright/test';
import { observePopulationCap, expectPopulationCap, expectWorldHealth } from './rpg-combat-assertions';
import type { Problem, RpgState } from '../../shared/src/index';

const profile = 'rpg-playtest';
const state = async (page: Page): Promise<RpgState> => (await page.request.get(`/rpg/state?profileId=${profile}`)).json();
const legacy = async (page: Page) => (await page.request.get(`/state?profileId=${profile}`)).json();
const current = (page: Page): Promise<Problem> => page.evaluate(() => (window as any).__game.session.problem);
const status = async (page: Page, problem: Problem) => (await page.request.get(`/rpg/attempt-status?profileId=${profile}&problemId=${encodeURIComponent(problem.id)}`)).json();
async function ready(page: Page): Promise<void> {
  await expect.poll(async () => {
    const demo = page.getByRole('button', { name: 'Let me try', exact: true });
    if (await demo.isVisible()) await demo.click();
    return page.evaluate(() => { const game = (window as any).__game; return !!game?.session && !game.busy && !game.panel; });
  }, { timeout: 45_000 }).toBe(true);
}
async function continueAdventure(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => !!(window as any).__game)).toBe(true);
  // This suite verifies network recovery; the separate visual suite exercises
  // full rendering. Keep software Chromium inexpensive without changing clocks,
  // monsters, animations, input handlers, or server behavior.
  await page.evaluate(() => {
    const renderer = (window as any).__game.world.renderer;
    renderer.setPixelRatio(.3); renderer.shadowMap.enabled = false;
  });
  await page.getByRole('button', { name: /Continue adventure|Enter the dungeon/, exact: false }).first().click();
}
async function selectFlameSpell(page: Page, spellId: 'ember' | 'cleave'): Promise<void> {
  await page.getByRole('button', { name: 'Open spellbook', exact: true }).click();
  await page.locator('[data-school="ember"][data-view="spellbook"]').click();
  await page.locator(`#rpg-dialog-content [data-spell="${spellId}"]`).click();
  await expect.poll(async () => (await state(page)).selectedSpellId).toBe(spellId);
  await page.getByRole('button', { name: 'Return to dungeon', exact: true }).click();
  await ready(page);
}
async function answer(page: Page, value: number): Promise<void> {
  await page.getByRole('textbox', { name: 'Your answer' }).fill(String(value));
  await page.getByRole('button', { name: /Unleash/ }).click();
}

// Real tutor/database writes on a fresh scratch server. Only HTTP delivery is
// interrupted: route.fetch() lets the server commit, then abort loses its reply.
test('reloading and retrying every saved phase keeps learning, XP, shields, and skill points consistent', async ({ page }) => {
  await observePopulationCap(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('institute:rpg:muted', 'true'));
  let first: Problem | undefined;
  await page.route('**/tutor/first', async route => {
    const response = await route.fetch();
    const problem = await response.json();
    if (!first) { problem.newTopic = true; first = problem; }
    await route.fulfill({ response, json: problem });
  });
  let failedDemo = false;
  await page.route('**/tutor/demo', async route => {
    if (!failedDemo) { failedDemo = true; await route.abort('failed'); }
    else await route.continue();
  });
  await page.goto('/');
  await continueAdventure(page);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  expect(await status(page, first!)).toMatchObject({ recorded: false });
  expect(await page.evaluate(() => (window as any).__game.session.demoSeen)).toBe(false);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await ready(page);
  await page.unroute('**/tutor/first');
  await page.unroute('**/tutor/demo');

  // Thinking time survives a refresh of the same unsolved problem.
  await page.waitForTimeout(850);
  const originalId = (await current(page)).id;
  await page.reload(); await continueAdventure(page); await ready(page);
  expect((await current(page)).id).toBe(originalId);
  expect(await page.evaluate(() => (window as any).__game.session.elapsedMs)).toBeGreaterThan(700);

  const firstProblem = await current(page);
  let lostAttempt = false;
  await page.route('**/tutor/attempt', async route => {
    if (!lostAttempt) { lostAttempt = true; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await answer(page, firstProblem.answer);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  expect(await status(page, firstProblem)).toMatchObject({ recorded: true, correct: true, solved: true });
  expect((await state(page)).xp).toBe(0);
  const committedLearning = await (await page.request.get(`/mastery?profileId=${profile}`)).json();
  const committedLegacy = await legacy(page);
  await page.reload(); await continueAdventure(page); await ready(page);
  expect((await state(page)).xp).toBe(32);
  expect(await (await page.request.get(`/mastery?profileId=${profile}`)).json()).toEqual(committedLearning);
  expect(await legacy(page)).toEqual(committedLegacy);
  const wounded = await state(page);
  expect(wounded.expedition).toMatchObject({ encounterIndex: 0, combat: { casts: 1 } });
  expect(wounded.expedition!.combat!.enemies.some(enemy => enemy.hp > 0 && enemy.hp < enemy.maxHp)).toBe(true);
  await expectWorldHealth(page, wounded.expedition!.combat!.enemies);
  await page.unroute('**/tutor/attempt');
  // A narrow second strike leaves a survivor, so the lost-response replay must
  // recover within the same room instead of relying on a room reset.
  await selectFlameSpell(page, 'cleave');

  const second = await current(page);
  await expect.poll(() => page.evaluate(() => !!(window as any).__game.session.branches)).toBe(true);
  const expectedNextId = await page.evaluate(() => (window as any).__game.session.branches.right.id);
  let lostResolve = false;
  await page.route('**/rpg/resolve', async route => {
    if (!lostResolve) { lostResolve = true; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await answer(page, second.answer);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  const committed = await state(page), committedXp = committed.xp;
  expect(committed.expedition).toMatchObject({ encounterIndex: 0, combat: { casts: 2 } });
  expect(committed.expedition!.combat!.enemies.filter(enemy => enemy.hp > 0)).toHaveLength(1);
  const beforeRetryMastery = await (await page.request.get(`/mastery?profileId=${profile}`)).json();
  const beforeRetryLegacy = await legacy(page);
  await page.reload(); await continueAdventure(page); await ready(page);
  expect((await state(page)).xp).toBe(committedXp);
  expect(await state(page)).toEqual(committed);
  await expectWorldHealth(page, committed.expedition!.combat!.enemies);
  expect(await (await page.request.get(`/mastery?profileId=${profile}`)).json()).toEqual(beforeRetryMastery);
  expect(await legacy(page)).toEqual(beforeRetryLegacy);
  expect((await current(page)).id).toBe(expectedNextId);
  await page.unroute('**/rpg/resolve');

  // A third wrong answer applies the old shield behavior once, even when its
  // reply is lost and the worked-example screen is restored after a reload.
  const struggling = await current(page);
  const shields = (await legacy(page)).shields;
  let lostMiss = false;
  await page.route('**/rpg/miss', async route => {
    if (!lostMiss) { lostMiss = true; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  for (let n = 1; n <= 3; n++) {
    await answer(page, (struggling.answer + 1) % 1000);
    await expect.poll(() => page.evaluate(() => (window as any).__game.session.wrongCount)).toBe(n);
    if (n < 3) await ready(page);
  }
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await page.reload(); await continueAdventure(page);
  await expect(page.getByRole('button', { name: 'Cast together & continue', exact: true })).toBeVisible();
  expect((await legacy(page)).shields).toBe(shields - 1);
  expect(await status(page, struggling)).toMatchObject({ correct: false, solved: false, skipped: false });
  await page.getByRole('button', { name: 'Cast together & continue', exact: true }).click();
  await ready(page);
  expect((await state(page)).xp).toBe(96);
  await page.unroute('**/rpg/miss');

  await selectFlameSpell(page, 'ember');
  let checkedPartialBoss = false;
  for (let casts = 0; casts < 40 && !(await state(page)).expedition?.cleared; casts++) {
    await ready(page);
    const problem = await current(page), beforeCast = await state(page);
    await answer(page, problem.answer);
    await expect.poll(async () => (await state(page)).xp).toBeGreaterThan(beforeCast.xp);
    await expect.poll(async () => (await state(page)).expedition!.cleared || await page.getByRole('button', { name: 'Let me try', exact: true }).isVisible() || await page.evaluate(id => {
      const game = (window as any).__game;
      return !game.busy && game.session?.problem.id !== id;
    }, problem.id), { timeout: 45_000 }).toBe(true);
    if (!checkedPartialBoss && beforeCast.expedition!.encounterIndex === 5) {
      await ready(page);
      const partial = await state(page), boss = partial.expedition!.combat!.enemies.find(enemy => enemy.id === 'enemy-0')!;
      expect(boss.hp).toBeGreaterThan(0);
      expect(boss.hp).toBeLessThan(boss.maxHp);
      const meter = page.locator('#rpg-boss [role="progressbar"]');
      await expect(meter).toBeVisible();
      await expect(meter).toHaveAttribute('aria-valuenow', String(boss.hp));
      await expect(meter).toHaveAttribute('aria-valuemax', String(boss.maxHp));
      const masteryBeforeRetry = await (await page.request.get(`/mastery?profileId=${profile}`)).json();
      const legacyBeforeRetry = await legacy(page);
      const replay = await page.request.post('/rpg/resolve', { data: {
        profileId: profile, problemId: problem.id, expeditionId: beforeCast.expedition!.id,
        encounterIndex: 5, spellId: beforeCast.selectedSpellId,
      } });
      expect(replay.ok()).toBe(true);
      const replayed = await replay.json();
      expect(replayed).toMatchObject({ duplicate: true, reward: { bossDefeated: false, combat: { encounterCleared: false } } });
      expect(replayed.state).toEqual(partial);
      expect(await state(page)).toEqual(partial);
      expect(await (await page.request.get(`/mastery?profileId=${profile}`)).json()).toEqual(masteryBeforeRetry);
      expect(await legacy(page)).toEqual(legacyBeforeRetry);
      await expectWorldHealth(page, partial.expedition!.combat!.enemies);
      checkedPartialBoss = true;
    }
  }
  expect(checkedPartialBoss).toBe(true);
  expect((await state(page)).expedition?.cleared).toBe(true);
  await expect(page.getByRole('button', { name: 'Next adventure →', exact: true })).toBeVisible();
  await page.locator('#rpg-overlay [data-action="skills"]').click();
  const points = (await state(page)).skillPoints;
  let lostUpgrade = false;
  await page.route('**/rpg/upgrade', async route => {
    if (!lostUpgrade) { lostUpgrade = true; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await page.locator('[data-school="ember"][data-view="skills"]').click();
  await page.locator('[data-skill-select="ember_power"]').click();
  await page.locator('[data-skill="ember_power"]').click();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !(window as any).__game.busy)).toBe(true);
  expect((await state(page)).skills.ember_power).toBe(1);
  expect((await state(page)).skillPoints).toBe(points - 1);
  await page.unroute('**/rpg/upgrade');

  // Fail the transition after a successful reward and an unavailable prefetch.
  await page.getByRole('button', { name: 'Return to dungeon', exact: true }).click();
  await page.locator('#rpg-overlay [data-action="map"]').click();
  await page.route('**/tutor/branches', route => route.abort('failed'));
  await page.locator('[data-region="embercrypt"]').click(); await ready(page);
  let lostNext = false;
  await page.route('**/tutor/first', async route => {
    if (!lostNext) { lostNext = true; await route.abort('failed'); }
    else await route.continue();
  });
  await answer(page, (await current(page)).answer);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  const transitionXp = (await state(page)).xp;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await ready(page);
  expect((await state(page)).xp).toBe(transitionXp);
  expect(await page.locator('#rpg-answer-form').getAttribute('class')).not.toContain('correct');
  await expectPopulationCap(page);
  expect(errors).toEqual([]);
});
