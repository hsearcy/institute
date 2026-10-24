import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { RPG_SPELLS, RPG_SCHOOLS, RPG_SKILLS, rpgSpellUnlocked, rpgEncounterCombat, rpgEncounterKills, rpgSpellModifiers, type RpgResolveResult, type RpgSpellId, type RpgAppearanceId, type RpgState } from '../../shared/src/rpg';
import type { Problem } from '../../shared/src/index';
import { observePopulationCap, expectPopulationCap, expectWorldHealth } from './rpg-combat-assertions';

const profile = 'rpg-archmage';
const captureSequences = process.env.RPG_CAPTURE_SEQUENCE === '1';
const state = async (page: Page): Promise<RpgState> => (await page.request.get(`/rpg/state?profileId=${profile}`)).json();

async function captureTelemetry(page: Page) {
  return page.evaluate(() => {
    const game = (window as any).__game, world = game.world;
    return { timestamp: new Date().toISOString(), browserEpochMs: performance.timeOrigin + performance.now(), browserMonotonicMs: performance.now(),
      attackAge: world.attackAge, diagnostics: world.diagnostics, panel: game.panel,
      viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio },
      rendererBuffer: { width: world.renderer.domElement.width, height: world.renderer.domElement.height } };
  });
}

async function captureMenu(page: Page, info: TestInfo, name: string): Promise<void> {
  if (!captureSequences) return;
  await expect.poll(() => page.evaluate(() => !(window as any).__game.busy)).toBe(true);
  if (name !== 'inventory-relics') await page.locator('#rpg-dialog-title').scrollIntoViewIfNeeded();
  const before = await captureTelemetry(page), path = info.outputPath(`menu-still-${name}.png`);
  await page.screenshot({ path });
  const after = await captureTelemetry(page), metadata = info.outputPath(`menu-still-${name}.json`);
  await writeFile(metadata, JSON.stringify({ evidence: 'Still image, not video', name, before, after }, null, 2));
  await info.attach(`menu-still-${name}`, { path, contentType: 'image/png' });
  await info.attach(`menu-still-${name}-metadata`, { path: metadata, contentType: 'application/json' });
}

/** Observe a real cast without freezing clocks or changing the renderer/game.
 * Screenshot readback takes time: record actual before/after times and lateness,
 * rather than treating requested beats as the moment the pixels were captured.
 */
async function captureCastSequence(page: Page, info: TestInfo, index: number, spellId: RpgSpellId): Promise<void> {
  const observed = await page.waitForFunction(id => {
    const world = (window as any).__game.world;
    return world.diagnostics.attacking && world.diagnostics.lastAttack?.spellId === id
      ? { start: performance.now() - world.attackAge * 1000, observedAge: world.attackAge, observedAt: performance.timeOrigin + performance.now() } : false;
  }, spellId, { timeout: 15000, polling: 'raf' });
  const origin = await observed.jsonValue() as { start: number; observedAge: number; observedAt: number };
  await observed.dispose();
  const beats = [['anticipation', .12], ['release', .4], ['peak', .8], ['aftermath', 1.6], ['travel', 3.6]] as const;
  const frames = [];
  for (const [label, targetSeconds] of beats) {
    // attackAge stops at cast completion, so the travel still must use elapsed
    // browser wall time from the observed cast origin, not an impossible age3.6.
    const threshold = await page.waitForFunction(at => performance.now() >= at, origin.start + targetSeconds * 1000, { timeout: 10000, polling: 'raf' });
    await threshold.dispose();
    const before = await captureTelemetry(page);
    const filename = `sequence-still-${String(index + 1).padStart(2, '0')}-${spellId}-${label}.png`;
    const path = info.outputPath(filename);
    await page.screenshot({ path });
    const after = await captureTelemetry(page);
    frames.push({ label, filename, path, targetSeconds,
      actualSecondsBefore: (before.browserMonotonicMs - origin.start) / 1000,
      actualSecondsAfter: (after.browserMonotonicMs - origin.start) / 1000,
      latenessMs: before.browserMonotonicMs - origin.start - targetSeconds * 1000,
      before, after });
  }
  const metadata = info.outputPath(`sequence-stills-${String(index + 1).padStart(2, '0')}-${spellId}.json`);
  await writeFile(metadata, JSON.stringify({ evidence: 'Timed still images, not video; do not establish continuous animation quality or uncaptured frame rate.',
    spellId, encounterOrdinal: index + 1, origin, frames }, null, 2));
  await info.attach(`sequence-stills-${index + 1}-${spellId}-metadata`, { path: metadata, contentType: 'application/json' });
  for (const frame of frames) await info.attach(`sequence-still-${index + 1}-${spellId}-${frame.label}`, { path: frame.path, contentType: 'image/png' });
}
async function configureRenderer(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => !!(window as any).__game?.world)).toBe(true);
  await page.evaluate(() => {
    const world = (window as any).__game.world;
    // Full-quality screenshots have their own visual suite. Exercise the actual
    // animations cheaply in software Chromium; game timing is never replaced.
    if (world.diagnostics.softwareRenderer) { world.renderer.setPixelRatio(.3); world.renderer.shadowMap.enabled = false; }
  });
}
async function ready(page: Page): Promise<void> {
  await expect.poll(async () => {
    const demo = page.getByRole('button', { name: 'Let me try', exact: true });
    if (await demo.isVisible()) await demo.click();
    return page.evaluate(() => {
      const game = (window as any).__game;
      return !!game?.session && !game.busy && !game.panel;
    });
  }, { timeout: 60_000 }).toBe(true);
}
async function choose(page: Page, spellId: RpgSpellId, info: TestInfo): Promise<void> {
  const spell = RPG_SPELLS.find(entry => entry.id === spellId)!;
  await page.locator('button[data-action="spellbook"]:visible').first().click();
  await page.locator(`[data-school="${spell.school}"][data-view="spellbook"]`).click();
  await expect(page.locator('#rpg-dialog-content .rpg-spell-card')).toHaveCount(5);
  await page.locator(`#rpg-dialog-content [data-spell="${spellId}"]`).click();
  await expect.poll(async () => (await state(page)).selectedSpellId).toBe(spellId);
  await expect(page.locator(`#rpg-dialog-content [data-spell="${spellId}"]`)).toHaveClass(/selected/);
  if (['ember', 'frost', 'storm'].includes(spellId)) await captureMenu(page, info, `spellbook-${spell.school}`);
  await page.getByRole('button', { name: 'Return to dungeon', exact: true }).click();
  await ready(page);
  await expect(page.locator(`#rpg-spellbar [data-spell="${spellId}"]`)).toHaveAttribute('aria-pressed', 'true');
}
async function equip(page: Page, itemId: string, info: TestInfo): Promise<void> {
  await page.getByRole('navigation', { name: 'Adventure menu' }).getByRole('button', { name: 'Equipment', exact: true }).click();
  await page.locator(`#rpg-dialog-content [data-item="${itemId}"]`).click();
  await expect.poll(async () => (await state(page)).equippedItemId).toBe(itemId);
  if (itemId === 'starfall') await captureMenu(page, info, 'inventory-relics');
  await page.getByRole('button', { name: 'Return to dungeon', exact: true }).click();
  await ready(page);
}

async function wear(page: Page, appearanceId: RpgAppearanceId): Promise<void> {
  const before = await state(page);
  const learning = await (await page.request.get(`/mastery?profileId=${profile}`)).json();
  const problem = await page.evaluate(() => (window as any).__game.session.problem);
  await page.getByRole('navigation', { name: 'Adventure menu' }).getByRole('button', { name: 'Equipment', exact: true }).click();
  await expect(page.locator('.rpg-armor-card')).toHaveCount(4);
  await expect(page.locator(`[data-appearance="${before.appearanceId}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`[data-appearance="${appearanceId}"]`)).toBeEnabled();
  await expect.poll(() => page.locator(`[data-armor="${appearanceId}"] img`).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await page.locator(`[data-armor="${appearanceId}"] img`).evaluate(image => {
    const imageBounds = image.getBoundingClientRect(), preview = image.parentElement!.getBoundingClientRect();
    return imageBounds.left >= preview.left - 1 && imageBounds.right <= preview.right + 1 && imageBounds.top >= preview.top - 1 && imageBounds.bottom <= preview.bottom + 1;
  })).toBe(true);
  await page.locator(`[data-appearance="${appearanceId}"]`).click();
  await expect.poll(async () => (await state(page)).appearanceId).toBe(appearanceId);
  await expect(page.locator(`[data-appearance="${appearanceId}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => (window as any).__game.world.diagnostics.appearance)).toBe(appearanceId);
  await expect.poll(() => page.evaluate(() => [...(window as any).__game.world.diagnostics.heroClips].sort())).toEqual(['cast', 'cleave', 'dodge', 'hit', 'hit-heavy', 'hit-side', 'idle', 'idle-look', 'knockdown', 'run', 'victory', 'walk']);
  expect(await state(page)).toEqual({ ...before, appearanceId });
  expect(await (await page.request.get(`/mastery?profileId=${profile}`)).json()).toEqual(learning);
  expect(await page.evaluate(() => (window as any).__game.session.problem)).toEqual(problem);
  await page.getByRole('button', { name: 'Return to dungeon', exact: true }).click();
  await ready(page);
}

test('all fifteen spellbook abilities cast distinct effects, honor equipment, and persist across three expeditions', async ({ page }, info) => {
  await observePopulationCap(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('institute:rpg:muted', 'true'));
  await page.goto('/'); await configureRenderer(page);
  const before = await state(page);
  expect(before.inventory.length).toBeGreaterThanOrEqual(20);
  const learningBefore = await (await page.request.get(`/mastery?profileId=${profile}`)).json();
  // Respec only RPG points, then learn every branch through the actual skill UI.
  // This proves the expanded abilities are earnable, not merely fixture grants.
  await page.locator('#rpg-dialog-content [data-action="skills"]').click();
  await page.locator('#rpg-dialog-content [data-action="respec"]').click();
  await expect.poll(async () => Object.keys((await state(page)).skills).length).toBe(0);
  for (const school of RPG_SCHOOLS) {
    await page.locator(`[data-school="${school.id}"][data-view="skills"]`).click();
    for (const skill of RPG_SKILLS.filter(skill => skill.school === school.id)) {
      await page.locator(`[data-skill-select="${skill.id}"]`).click();
      await page.locator(`[data-skill="${skill.id}"]`).click();
      await expect.poll(async () => (await state(page)).skills[skill.id]).toBe(1);
      await expect.poll(() => page.evaluate(() => !(window as any).__game.busy)).toBe(true);
    }
    await captureMenu(page, info, `skills-${school.id}`);
  }
  const learned = await state(page);
  expect(RPG_SPELLS.filter(spell => rpgSpellUnlocked(spell.id, learned.skills))).toHaveLength(15);
  expect(learned.skillPoints).toBe(learned.level - 1 - RPG_SKILLS.length);
  expect(await (await page.request.get(`/mastery?profileId=${profile}`)).json()).toEqual(learningBefore);
  await page.getByRole('button', { name: 'Back to camp', exact: true }).click();
  await page.locator('#rpg-dialog-content [data-action="begin"]').click(); await ready(page);

  const seenEffects = new Set<string>();
  const seenSpells = new Set<string>();
  // Three complete runs, covering every ability plus a repeat of each school's
  // finale. Each rotation entry clears one room with as many actual tutor
  // outcomes as needed; a cast no longer implies an instant room clear.
  const rotation: RpgSpellId[] = [...RPG_SPELLS.map(spell => spell.id), 'firestorm', 'blizzard', 'tempest'];
  const regions = ['embercrypt', 'frostvault', 'stormspire'];
  for (let index = 0; index < rotation.length; index++) {
    const spellId = rotation[index]!;
    await test.step(`Encounter ${index + 1}: ${spellId}`, async () => {
    if (index > 0 && index % 6 === 0) {
      await expect(page.getByRole('button', { name: 'Next adventure →', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Next adventure →', exact: true }).click();
      if (index === 6) await captureMenu(page, info, 'expedition-map');
      await page.locator(`[data-region="${regions[index / 6]}"]`).click(); await ready(page);
    }
    await choose(page, spellId, info);
    if (spellId === 'meteor') await equip(page, 'starfall', info);
    if (spellId === 'frost') await equip(page, 'wintercrown', info);
    if (spellId === 'arc_lance') await equip(page, 'arcfang', info);
    if (spellId === 'frost_guardian') await equip(page, 'wardenheart', info);
    if (spellId === 'ball_lightning') await equip(page, 'stormorbit', info);

    // Selection and the unsolved problem both survive a full reload.
    if (index === 2 || index === 8 || index === 13) {
      const appearanceId: RpgAppearanceId = index === 2 ? 'cinder' : index === 8 ? 'glacier' : 'tempest';
      await wear(page, appearanceId);
      const learning = await (await page.request.get(`/mastery?profileId=${profile}`)).json();
      const exactProblem = await page.evaluate(() => (window as any).__game.session.problem);
      const problemId = await page.locator('#rpg-answer-form').getAttribute('data-problem-id');
      const saved = await state(page);
      const favorites = await page.locator('#rpg-spellbar [data-spell]').evaluateAll(elements => elements.map(element => element.getAttribute('data-spell')));
      await page.reload(); await configureRenderer(page);
      await page.locator('#rpg-dialog-content [data-action="begin"]').click(); await ready(page);
      expect((await state(page)).selectedSpellId).toBe(spellId);
      expect((await state(page)).xp).toBe(saved.xp);
      expect((await state(page)).appearanceId).toBe(appearanceId);
      await expect.poll(() => page.evaluate(() => (window as any).__game.world.diagnostics.appearance)).toBe(appearanceId);
      await expect.poll(() => page.evaluate(() => [...(window as any).__game.world.diagnostics.heroClips].sort())).toEqual(['cast', 'cleave', 'dodge', 'hit', 'hit-heavy', 'hit-side', 'idle', 'idle-look', 'knockdown', 'run', 'victory', 'walk']);
      expect(await page.evaluate(() => (window as any).__game.session.problem)).toEqual(exactProblem);
      expect(await (await page.request.get(`/mastery?profileId=${profile}`)).json()).toEqual(learning);
      await expect(page.locator('#rpg-answer-form')).toHaveAttribute('data-problem-id', problemId!);
      await expect(page.locator(`#rpg-spellbar [data-spell="${spellId}"]`)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.locator('#rpg-spellbar [data-spell]').evaluateAll(elements => elements.map(element => element.getAttribute('data-spell')))).toEqual(favorites);
    }

    const current = await state(page);
    const problem = await page.evaluate(() => (window as any).__game.session.problem) as Problem;
    const effect = RPG_SPELLS.find(spell => spell.id === spellId)!.effect;
    const resultPromise = page.waitForResponse(response => new URL(response.url()).pathname === '/rpg/resolve' && response.request().postDataJSON()?.problemId === problem.id);
    const captureAge: Partial<Record<RpgSpellId, number>> = {
      cleave: .42, meteor: .85, ember: .6, phoenix_dive: .55,
      firestorm: .95, frost_guardian: .85, blizzard: .9, tempest: .9,
    };
    // Observe before the click: API/assertion round trips must not delay the
    // requested animation beat. Screenshots remain evidence for manual review.
    const sequencePromise = captureSequences ? captureCastSequence(page, info, index, spellId) : null;
    void sequencePromise?.catch(() => {});
    const captureReady = process.env.RPG_CAPTURE_SPELLS === '1' && !captureSequences
      ? page.waitForFunction(({ spellId, age }) => {
        const world = (window as any).__game.world;
        return world.diagnostics.attacking && world.diagnostics.lastAttack?.spellId === spellId && world.attackAge >= age;
      }, { spellId, age: captureAge[spellId] ?? .55 }, { timeout: 15000, polling: 'raf' }) : null;
    const capturePromise = captureReady?.then(() => page.screenshot({ path: info.outputPath(`cast-${index + 1}-${spellId}.png`) }));
    // Preserve the failure for the explicit await below without an unhandled
    // rejection if an earlier gameplay assertion fails first.
    void capturePromise?.catch(() => {});
    await page.getByRole('textbox', { name: 'Your answer' }).fill(String(problem.answer));
    await page.getByRole('button', { name: /Unleash/ }).click();
    const result = await (await resultPromise).json() as RpgResolveResult;
    expect(result.duplicate).toBe(false);
    expect(result.reward.spellId).toBe(spellId);
    expect(result.reward.kills).toBe(rpgEncounterKills(current, current.expedition!.encounterIndex));
    expect(result.reward.combat!.enemiesBefore).toEqual(rpgEncounterCombat(current).enemies);
    expect(result.reward.combat!.enemiesAfter.length).toBeLessThanOrEqual(10);
    await expect.poll(() => page.evaluate(() => (window as any).__game.world.diagnostics.lastAttack?.spellId)).toBe(spellId);
    const dispatched = await page.evaluate(() => (window as any).__game.world.diagnostics.lastAttack);
    await info.attach(`encounter-${index + 1}-${spellId}`, { body: JSON.stringify({ reward: result.reward, attack: dispatched }, null, 2), contentType: 'application/json' });
    expect(dispatched.effect).toBe(effect);
    expect(dispatched.options.kills).toBe(result.reward.kills);
    const expectedModifiers = rpgSpellModifiers(current);
    const optionFor = { burn: 'burning', 'ice-shards': 'shards', chain: 'chains', echo: 'echo', pierce: 'pierce', wide: 'wide', orbit: 'orbit', summon: 'summon' } as const;
    for (const [modifier, option] of Object.entries(optionFor)) expect(!!dispatched.options[option]).toBe(expectedModifiers.includes(modifier as keyof typeof optionFor));
    seenEffects.add(dispatched.effect); seenSpells.add(spellId);
    // Ambient particles and an older loot beam do not prove this spell rendered.
    // Require a mesh created during the current release, attached to the scene.
    await expect.poll(() => page.evaluate(() => {
      const world = (window as any).__game.world;
      return world.diagnostics.attacking && world.effects.some((effect: any) =>
        effect.mesh.parent === world.effectsGroup && effect.age <= world.attackAge + .01);
    })).toBe(true);
    if (spellId === 'frost_guardian') {
      await expect.poll(() => page.evaluate(() => {
        const world = (window as any).__game.world;
        return world.summoned.filter((summon: any) => summon.root.parent === world.effectsGroup && summon.root.visible).length;
      })).toBe(expectedModifiers.includes('summon') ? 2 : 1);
    }
    if (capturePromise) {
      await info.attach(`cast-${index + 1}-${spellId}`, { body: await capturePromise, contentType: 'image/png' });
    } else if (!captureSequences && ['meteor', 'frost_guardian', 'ball_lightning'].includes(spellId)) {
      await page.screenshot({ path: info.outputPath(`cast-${spellId}.png`) });
    }
    if (!result.reward.bossDefeated) await ready(page);
    // Gameplay assertions and effect checks run concurrently with observation;
    // only wait for the travel still after the cast/receipt checks have passed.
    if (sequencePromise) await sequencePromise;
    let completedRoom = result;
    for (let extraCast = 0; extraCast < 12 && !completedRoom.reward.combat!.encounterCleared; extraCast++) {
      await ready(page);
      await expectWorldHealth(page, completedRoom.reward.combat!.enemiesAfter);
      const nextProblem = await page.evaluate(() => (window as any).__game.session.problem) as Problem;
      const response = page.waitForResponse(reply => new URL(reply.url()).pathname === '/rpg/resolve' && reply.request().method() === 'POST');
      await page.getByRole('textbox', { name: 'Your answer' }).fill(String(nextProblem.answer));
      await page.getByRole('button', { name: /Unleash/ }).click();
      const nextCast = await (await response).json() as RpgResolveResult;
      expect(nextCast.reward.combat!.enemiesBefore).toEqual(completedRoom.reward.combat!.enemiesAfter);
      expect(nextCast.reward.spellId).toBe(spellId);
      expect(nextCast.duplicate).toBe(false);
      completedRoom = nextCast;
      if (!completedRoom.reward.bossDefeated) await ready(page);
    }
    expect(completedRoom.reward.combat!.encounterCleared, 'The chosen spell must finish its persistent room').toBe(true);
    if (completedRoom.reward.bossDefeated) {
      await expect(page.getByRole('button', { name: 'Next adventure →', exact: true })).toBeVisible();
      const rewardCard = page.locator('.rpg-victory-reward');
      if (completedRoom.reward.duplicateItem) {
        await expect(rewardCard).toContainText('DUPLICATE RELIC');
        await expect(rewardCard).toContainText(completedRoom.reward.item!.name);
        await expect(rewardCard).toContainText('Converted into +16 bonus XP');
        await expect(rewardCard).toContainText(`+${completedRoom.reward.xp} XP total from this guardian`);
        expect((await state(page)).inventory).toEqual(current.inventory);
      } else {
        await expect(rewardCard).not.toContainText('DUPLICATE RELIC');
      }
    }

    });
  }
  expect(seenSpells.size).toBe(15); expect(seenEffects.size).toBe(15);
  const after = await state(page);
  expect(after.expeditionsCompleted).toBe(before.expeditionsCompleted + 3);
  expect(after.expedition).toMatchObject({ regionId: 'stormspire', cleared: true });
  expect(after.xp).toBeGreaterThan(before.xp);
  await expectPopulationCap(page);
  expect(errors).toEqual([]);
  // All three school tabs remain available after the larger content set.
  await page.locator('#rpg-dialog-content [data-action="skills"]').click();
  for (const school of RPG_SCHOOLS) {
    await page.locator(`[data-school="${school.id}"][data-view="skills"]`).click();
    await expect(page.locator('#rpg-dialog-content [data-skill-select]')).toHaveCount(11);
  }
});
