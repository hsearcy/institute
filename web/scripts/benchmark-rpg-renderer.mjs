/** Renderer-only comparison on an isolated preview; never submits tutor answers.
 * RPG_BENCH_URL=http://127.0.0.1:5239 node web/scripts/benchmark-rpg-renderer.mjs
 * Use a preview configured with a scratch profile/database, not the child's game.
 */
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=gl', '--mute-audio'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(process.env.RPG_BENCH_URL ?? 'http://127.0.0.1:5239/');
  await page.waitForFunction(() => window.__game?.world?.loadedAt > 0, undefined, { timeout: 60_000 });
  const results = await page.evaluate(async () => {
    const world = window.__game.world;
    cancelAnimationFrame(world.frame); world.frame = 0;
    document.getElementById('rpg-ui').style.visibility = 'hidden';
    world.paused = false; world.quality = 0; world.width = 0; world.resize();
    world.loadedAt = performance.now() + 3_600_000; // Hold full quality for a fair comparison.
    const gl = world.renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const cases = [];
    const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
    const measure = async (room, count, spell) => {
      world.tick(8); world.elapsed = 5; world.lastShadowUpdate = -1; world.setEncounter(room, 'sunken-vault', count);
      world.hero.position.copy(world.destination); world.cameraTarget.copy(world.destination);
      [...world.warmLights, ...world.recessLights].forEach((light, index) => light.position.copy(world.lightAnchors[index]));
      world.tick(0);
      // Warm this room's material programs before measuring.
      for (let frame = 0; frame < 45; frame++) {
        await new Promise(requestAnimationFrame); world.tick(1 / 60); gl.finish();
      }
      if (spell) void world.attack(spell, { kills: count });
      const costs = [], intervals = [];
      let previous;
      for (let frame = 0; frame < 120; frame++) {
        const timestamp = await new Promise(requestAnimationFrame);
        if (previous !== undefined) intervals.push(timestamp - previous);
        previous = timestamp;
        const start = performance.now(); world.tick(1 / 60); gl.finish();
        costs.push(performance.now() - start);
      }
      return { room, count, spell: spell ?? null,
        medianRenderMs: +percentile(costs, .5).toFixed(2), p95RenderMs: +percentile(costs, .95).toFixed(2),
        medianFrameMs: +percentile(intervals, .5).toFixed(2), p95FrameMs: +percentile(intervals, .95).toFixed(2),
        diagnostics: world.diagnostics };
    };
    for (const [room, count, spell] of [[0, 14, null], [5, 24, null], [5, 48, 'tempest'], [0, 48, 'phoenix_dive']]) {
      cases.push(await measure(room, count, spell));
    }
    return { renderer, software: world.diagnostics.softwareRenderer, viewport: [1440, 900], cases };
  });
  const report = { ...results, errors, method: '45 warmup frames; 120 fixed simulation frames; gl.finish includes GPU work. Diagnostic renderer timings, not a player FPS guarantee.' };
  const json = JSON.stringify(report, null, 2);
  if (process.env.RPG_BENCH_OUTPUT) await writeFile(process.env.RPG_BENCH_OUTPUT, json + '\n');
  console.log(json);
  if (errors.length || results.software) process.exitCode = 1;
} finally {
  await browser.close();
}
