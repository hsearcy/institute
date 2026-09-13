import { test as base, expect, chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// A new context owns all test pages. Closing a CDP Browser disconnects this
// client; it does not close the user's existing browser or contexts.
const test = base.extend({
  browser: [async ({ browserName }, use) => {
    const endpoint = process.env.RPG_TEST_CDP_URL;
    const browser = endpoint ? await chromium.connectOverCDP(endpoint) : await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    expect(browserName).toBe('chromium');
    if (endpoint) {
      const session = await browser.newBrowserCDPSession();
      const version = await session.send('Browser.getVersion');
      expect(version.userAgent).toContain('Windows');
      expect(version.userAgent).not.toContain('HeadlessChrome');
      await session.detach();
    }
    try { await use(browser); } finally { await browser.close(); }
  }, { scope: 'worker' }],
});

test('real dungeon enemy clones, interrupted hits, deaths and cleanup', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Shader Error|VALIDATE_STATUS false|GL_INVALID_OPERATION|WebGL: INVALID/i.test(message.text())) errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/assets/rpg/')) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__game?.world, {}, { timeout: 60_000 });
  await page.waitForFunction(() => ['skeleton', 'revenant', 'guardian', 'vault-guardian-boss', 'wraith'].every(kind => (window as any).__game.world.models.has(kind)), {}, { timeout: 90_000 });
  const learningBefore = await (await page.request.get('/rpg/state?profileId=rpg-playtest')).json();
  await page.bringToFront();
  await page.evaluate(() => {
    const world = (window as any).__game.world;
    world.setEncounter(5, 'storm-vault', 10); world.setPaused(false);
    // The test drives presentation, not the lesson/onboarding state machine.
    (window as any).__enemyQaTicks = [];
    const original = world.tick.bind(world);
    world.tick = (delta: number) => { (window as any).__enemyQaTicks.push(performance.now()); original(delta); };
  });
  await page.waitForTimeout(3000); // Let skin/depth programs compile before sampling.
  const performanceSample = await page.evaluate(async () => {
    const world = (window as any).__game.world;
    (window as any).__enemyQaTicks = [];
    await new Promise(resolve => setTimeout(resolve, 4000));
    const samples: number[] = (window as any).__enemyQaTicks;
    const span = samples.at(-1)! - samples[0];
    return { method: 'Actual foreground DungeonWorld ticks over four seconds', frames: samples.length, fps: (samples.length - 1) * 1000 / span, diagnostics: world.diagnostics, viewport: [innerWidth, innerHeight], hidden: document.hidden };
  });
  expect(performanceSample.hidden).toBe(false);
  expect(performanceSample.frames).toBeGreaterThan(3);
  await page.screenshot({ path: testInfo.outputPath('active-dungeon.png'), style: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
  const audit = await page.evaluate(() => {
    const world = (window as any).__game.world;
    cancelAnimationFrame(world.frame); world.frame = 0;
    const meshOf = (enemy: any) => { let mesh: any; enemy.visual.traverse((node: any) => { if (node.isSkinnedMesh) mesh = node; }); return mesh; };
    const pose = (enemy: any) => { const values: number[] = []; enemy.visual.traverse((node: any) => { if (node.isBone || node.userData.enemyJoint) values.push(...node.position.toArray(), ...node.quaternion.toArray()); }); return values; };
    world.setEncounter(0, 'storm-vault', 10); world.tick(.016);
    const twins = world.enemies.filter((e: any) => e.modelId === 'skeleton');
    const a = meshOf(twins[0]), b = meshOf(twins[1]);
    const untouched = pose(twins[1]);
    twins[0].animator.update(world.elapsed, { recoil: 1, brace: .5 });
    const independent = a.skeleton !== b.skeleton && a.skeleton.bones[0] !== b.skeleton.bones[0] && JSON.stringify(untouched) === JSON.stringify(pose(twins[1]));
    const textureEvents: string[] = [];
    const skeletons = new Set<any>();
    world.enemies.forEach((enemy: any) => enemy.visual.traverse((node: any) => { if (node.isSkinnedMesh) skeletons.add(node.skeleton); }));
    skeletons.forEach(skeleton => { skeleton.computeBoneTexture(); skeleton.boneTexture.addEventListener('dispose', () => textureEvents.push(skeleton.uuid)); });
    const oldRoots = world.enemies.map((e: any) => e.root);
    world.setEncounter(5, 'storm-vault', 10);
    const cleanup = { textures: skeletons.size, disposed: textureEvents.length, detached: oldRoots.every((root: any) => !root.parent) };
    const results = [];
    for (const kind of ['skeleton', 'revenant', 'guardian', 'vault-guardian-boss', 'wraith']) {
      world.setEncounter(kind === 'wraith' ? 0 : 5, 'storm-vault', 10); world.tick(.016);
      const enemy = world.enemies.find((e: any) => e.modelId === kind);
      if (!enemy) throw new Error(`Missing runtime enemy ${kind}`);
      const idleBefore = pose(enemy);
      world.tick(.7);
      const idleAfter = pose(enemy);
      const idleChanged = idleBefore.some((value, index) => Math.abs(value - idleAfter[index]) > 1e-5);
      const sides = [];
      for (const phase of [0, 2]) {
        enemy.phase = phase;
        world.hitEnemy(enemy, 0xffffff, { damage: 10, hpBefore: enemy.hp, hpAfter: enemy.hp - 10 });
        world.tick(.11);
        sides.push(enemy.root.userData.hitReaction.side);
        world.tick(1.1);
      }
      world.hitEnemy(enemy, 0xffffff, { damage: 10, hpBefore: enemy.hp, hpAfter: enemy.hp - 10 });
      world.tick(.45); // A second lethal contact must replace a live recovery.
      world.hitEnemy(enemy, 0xffffff, { damage: enemy.hp, hpBefore: enemy.hp, hpAfter: 0 });
      world.tick(0);
      const first = { dead: enemy.dead, visible: enemy.root.visible, finite: pose(enemy).every(Number.isFinite), erosion: enemy.root.userData.electricDissolve };
      world.tick(1.5);
      const dissolving = { visible: enemy.root.visible, erosion: enemy.root.userData.electricDissolve, scale: enemy.root.scale.x };
      world.tick(.8);
      results.push({ kind, sides, idleChanged, articulated: enemy.animator.articulated, first, dissolving, removed: !enemy.root.visible, finite: pose(enemy).every(Number.isFinite) });
    }
    world.setEncounter(0, 'storm-vault', 10); world.tick(.016);
    return { independent, cleanup, results, resetLiving: world.enemies.every((enemy: any) => !enemy.dead && enemy.root.visible && !enemy.root.userData.hitReaction), diagnostics: { ...world.diagnostics, fps: undefined, note: 'Deterministic tick audit; FPS is invalid here. Use performanceSample for measured runtime FPS.' } };
  });
  const learningAfter = await (await page.request.get('/rpg/state?profileId=rpg-playtest')).json();
  const learningUnchanged = JSON.stringify(learningBefore) === JSON.stringify(learningAfter);
  await writeFile(testInfo.outputPath('runtime-audit.json'), JSON.stringify({ performanceSample, audit, learningUnchanged, errors }, null, 2));
  expect(learningAfter, 'Presentation must not change authoritative learning state').toEqual(learningBefore);
  expect(audit.independent).toBe(true);
  expect(audit.cleanup.textures).toBeGreaterThan(0);
  expect(audit.cleanup.disposed).toBe(audit.cleanup.textures);
  expect(audit.cleanup.detached).toBe(true);
  expect(audit.resetLiving).toBe(true);
  for (const result of audit.results) {
    expect(result.idleChanged, result.kind).toBe(true);
    expect(result.sides, result.kind).toEqual([1, -1]);
    expect(result.articulated, result.kind).toBe(true);
    expect(result.first, result.kind).toEqual({ dead: true, visible: true, finite: true, erosion: 0 });
    expect(result.dissolving.visible, result.kind).toBe(true);
    expect(result.dissolving.erosion, result.kind).toBeGreaterThan(0);
    expect(result.dissolving.erosion, result.kind).toBeLessThan(1);
    expect(result.dissolving.scale, result.kind).toBe(1);
    expect(result.removed && result.finite, result.kind).toBe(true);
  }
  expect(errors).toEqual([]);
});
