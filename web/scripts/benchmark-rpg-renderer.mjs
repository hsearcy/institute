/** Renderer-only audit on an isolated scratch preview; never submits answers.
 * RPG_BENCH_URL=http://127.0.0.1:5239 node web/scripts/benchmark-rpg-renderer.mjs
 * Optional: RPG_BENCH_FRAMES=90 RPG_BENCH_WARMUP=30 RPG_BENCH_NO_VSYNC=1
 * RPG_BENCH_CASES=normal,boss,tempest,phoenix RPG_BENCH_OUTPUT=/tmp/bench.json
 * Headless visibility/focus are reported; they do NOT prove desktop foreground presentation.
 */
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { loadavg, cpus } from 'node:os';

const frames = Math.max(20, Number(process.env.RPG_BENCH_FRAMES) || 90);
const warmup = Math.max(5, Number(process.env.RPG_BENCH_WARMUP) || 25);
const noVsync = process.env.RPG_BENCH_NO_VSYNC === '1';
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=gl', '--mute-audio'];
if (noVsync) args.push('--disable-frame-rate-limit', '--disable-gpu-vsync');
const hostBefore = { loadAverage: loadavg(), logicalCpus: cpus().length };
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], mutations = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(process.env.RPG_BENCH_URL ?? 'http://127.0.0.1:5239/');
  await page.waitForFunction(() => window.__game?.world?.loadedAt > 0, undefined, { timeout: 60_000 });
  // Startup belongs to the existing scratch preview. Benchmark phases are read-only.
  await page.route('**/*', route => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      mutations.push({ method: route.request().method(), url: route.request().url() });
      return route.abort();
    }
    return route.continue();
  });
  const cdp = await page.context().newCDPSession(page);
  const browserCdp = await browser.newBrowserCDPSession();
  await cdp.send('Performance.enable');
  const beforeMetrics = await cdp.send('Performance.getMetrics');
  const beforeProcesses = await browserCdp.send('SystemInfo.getProcessInfo');
  const launchDetails = await browserCdp.send('Browser.getBrowserCommandLine').catch(() => ({ arguments: [], unavailable: true }));
  const environment = await page.evaluate(() => {
    const world = window.__game.world;
    cancelAnimationFrame(world.frame); world.frame = 0;
    world.paused = false; world.quality = 0; world.width = 0; world.resize();
    world.loadedAt = performance.now() + 3_600_000; // Prevent adaptive quality confounding A/B.
    const gl = world.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const percentile = (values, q) => values.length ? +[...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)].toFixed(3) : null;
    const stats = values => ({ samples: values.length, median: percentile(values, .5), p95: percentile(values, .95), max: values.length ? +Math.max(...values).toFixed(3) : null });
    const longTasks = [];
    const observer = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')
      ? new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })))) : null;
    observer?.observe({ type: 'longtask', buffered: false });
    // MessageChannel yields to the task queue without nested-setTimeout's 4ms clamp.
    const channel = new MessageChannel(), callbacks = [];
    channel.port1.onmessage = () => callbacks.shift()?.(performance.now());
    const nextTask = () => new Promise(resolve => { callbacks.push(resolve); channel.port2.postMessage(0); });
    const nextRaf = () => new Promise(requestAnimationFrame);
    window.__rpgBench = {
      async measure(config) {
        const { name, room = 0, count = 14, spell, mode = 'raf', hud = false, frames, warmup } = config;
        document.getElementById('rpg-ui').style.visibility = hud ? 'visible' : 'hidden';
        world.tick(8); world.elapsed = 5; world.lastShadowUpdate = -1;
        world.setEncounter(room, 'sunken-vault', count);
        world.hero.position.copy(world.destination); world.cameraTarget.copy(world.destination);
        [...world.warmLights, ...world.recessLights].forEach((light, i) => light.position.copy(world.lightAnchors[i]));
        world.tick(0);
        for (let frame = 0; frame < warmup; frame++) { await nextRaf(); world.tick(1 / 60); }
        gl.finish();
        // Any startup/deferred driver work should precede this case's samples.
        await nextTask();
        const pending = [], samples = [], restore = [];
        const unpaced = mode.startsWith('unpaced');
        let current = null, disjointQueries = 0;
        const renderOwner = world.softwareRenderer ? world.renderer : world.composer;
        const originalRender = renderOwner.render;
        renderOwner.render = function (...args) {
          if (mode === 'simulation') return;
          const start = performance.now();
          const query = timer && current ? gl.createQuery() : null;
          if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          try { return originalRender.apply(this, args); }
          finally {
            if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push({ query, sample: current }); }
            if (current) current.submissionMs += performance.now() - start;
          }
        };
        for (const enemy of world.enemies) {
          const original = enemy.animator.update;
          enemy.animator.update = function (...args) {
            const start = performance.now();
            try { return original.apply(this, args); }
            finally { if (current) current.enemyAnimationMs += performance.now() - start; }
          };
          restore.push(() => { enemy.animator.update = original; });
        }
        const collectQueries = () => {
          if (!timer) return;
          if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
            disjointQueries += pending.length;
            for (const item of pending) gl.deleteQuery(item.query);
            pending.length = 0;
          }
          while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
            const item = pending.shift();
            item.sample.gpuMs = gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6;
            gl.deleteQuery(item.query);
          }
        };
        const began = performance.now();
        let previousTimestamp, previousCallback = began, previousEnd = began;
        if (spell) void world.attack(spell, { kills: count });
        try {
          for (let frame = 0; frame < frames; frame++) {
            const timestamp = await (unpaced ? nextTask() : nextRaf());
            const callbackAt = performance.now();
            collectQueries();
            current = {
              active: !!world.attacking, submissionMs: 0, enemyAnimationMs: 0,
              intervalMs: previousTimestamp === undefined ? null : timestamp - previousTimestamp,
              callbackIntervalMs: frame ? callbackAt - previousCallback : null,
              callbackLatenessMs: unpaced ? null : callbackAt - timestamp,
              idleBetweenCallbacksMs: frame ? callbackAt - previousEnd : null,
              visibility: document.visibilityState, focused: document.hasFocus(),
            };
            // rAF modes follow real game wall time. Unpaced measures fixed-step throughput only.
            const delta = unpaced ? 1 / 60 : Math.max(0, (callbackAt - previousCallback) / 1000);
            previousTimestamp = timestamp; previousCallback = callbackAt;
            const start = performance.now();
            if (mode !== 'empty') world.tick(delta);
            current.tickMs = performance.now() - start;
            current.simulationMs = Math.max(0, current.tickMs - current.submissionMs);
            const finishAt = performance.now();
            if (mode === 'finish' || mode === 'unpaced') gl.finish();
            current.finishWaitMs = performance.now() - finishAt;
            current.tickPlusFinishMs = performance.now() - start;
            if (mode === 'unpaced-fence') {
              const fenceStarted = performance.now(), sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
              if (!sync) throw new Error('GPU fence allocation failed');
              gl.flush();
              try {
                let status;
                while ((status = gl.clientWaitSync(sync, 0, 0)) === gl.TIMEOUT_EXPIRED) {
                  if (performance.now() - fenceStarted > 5000) throw new Error('GPU fence did not signal within5seconds');
                  await nextTask();
                }
                if (status === gl.WAIT_FAILED) throw new Error('GPU fence wait failed');
                current.fenceCompletionMs = performance.now() - fenceStarted;
                current.tickToCompletionMs = performance.now() - start;
              } finally { gl.deleteSync(sync); }
            }
            samples.push(current); current = null;
            previousEnd = performance.now();
          }
          const ended = performance.now();
          gl.flush();
          const queryDeadline = performance.now() + 2000;
          while (pending.length && performance.now() < queryDeadline) { await nextTask(); collectQueries(); }
          const unresolvedQueries = pending.length;
          const summarize = subset => Object.fromEntries(['tickMs', 'simulationMs', 'enemyAnimationMs', 'submissionMs', 'finishWaitMs', 'tickPlusFinishMs', 'fenceCompletionMs', 'tickToCompletionMs', 'gpuMs', 'intervalMs', 'callbackIntervalMs', 'callbackLatenessMs', 'idleBetweenCallbacksMs']
            .map(key => [key, stats(subset.map(sample => sample[key]).filter(Number.isFinite))]));
          return {
            ...config, elapsedMs: +(ended - began).toFixed(2), callbackHz: +(samples.length * 1000 / (ended - began)).toFixed(2),
            measurements: summarize(samples), activeRelease: spell ? summarize(samples.filter(sample => sample.active)) : null,
            afterRelease: spell ? summarize(samples.filter(sample => !sample.active)) : null,
            disjointQueries, unresolvedQueries,
            visibilityStates: [...new Set(samples.map(sample => sample.visibility))], focusStates: [...new Set(samples.map(sample => sample.focused))],
            longTasks: longTasks.filter(task => task.start >= began && task.start < ended),
            diagnostics: world.diagnostics,
          };
        } finally {
          renderOwner.render = originalRender; restore.forEach(fn => fn());
          for (const item of pending) gl.deleteQuery(item.query);
        }
      },
      dispose() { observer?.disconnect(); channel.port1.close(); channel.port2.close(); },
    };
    return {
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      software: world.diagnostics.softwareRenderer, gpuTimerAvailable: !!timer,
      visibility: document.visibilityState, focused: document.hasFocus(), devicePixelRatio, framebuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    };
  });
  const selected = new Set((process.env.RPG_BENCH_CASES ?? 'normal,boss,tempest,phoenix').split(','));
  const specs = [
    { name: 'empty-rAF-hidden-HUD', mode: 'empty' },
    { name: 'empty-rAF-visible-HUD', mode: 'empty', hud: true },
    { name: 'normal-rAF', key: 'normal' },
    { name: 'normal-rAF-visible-HUD', key: 'normal', hud: true },
    { name: 'normal-finish', key: 'normal', mode: 'finish' },
    { name: 'normal-unpaced-finish', key: 'normal', mode: 'unpaced' },
    { name: 'normal-unpaced-GPU-fence', key: 'normal', mode: 'unpaced-fence' },
    { name: 'normal-simulation-only', key: 'normal', mode: 'simulation' },
    { name: 'boss-rAF', key: 'boss', room: 5, count: 24 },
    { name: 'tempest-rAF', key: 'tempest', room: 5, count: 48, spell: 'tempest' },
    { name: 'phoenix-rAF', key: 'phoenix', room: 0, count: 48, spell: 'phoenix_dive' },
  ].filter(spec => !spec.key || selected.has(spec.key));
  const cases = [];
  for (const spec of specs) {
    console.error(`Measuring ${spec.name} (${frames} samples)`);
    cases.push(await page.evaluate(config => window.__rpgBench.measure(config), { ...spec, frames, warmup }));
  }
  await page.evaluate(() => window.__rpgBench.dispose());
  const afterMetrics = await cdp.send('Performance.getMetrics');
  const afterProcesses = await browserCdp.send('SystemInfo.getProcessInfo');
  const metricBefore = Object.fromEntries(beforeMetrics.metrics.map(item => [item.name, item.value]));
  const cpuMetrics = Object.fromEntries(afterMetrics.metrics.filter(item => /Duration$/.test(item.name)).map(item => [item.name, +(item.value - (metricBefore[item.name] ?? 0)).toFixed(4)]));
  const processBefore = new Map(beforeProcesses.processInfo.map(info => [info.id, info.cpuTime]));
  const processCpuSeconds = afterProcesses.processInfo.map(info => ({ type: info.type, cpuSeconds: +(info.cpuTime - (processBefore.get(info.id) ?? 0)).toFixed(3) }));
  const report = {
    ...environment, noVsync, headless: true, browserVersion: browser.version(), viewport: [1440, 900], args,
    effectiveSchedulingArgs: launchDetails.arguments.filter(argument => /frame|background|headless|gpu|angle|ozone|raster/.test(argument)),
    hostBefore, hostAfter: { loadAverage: loadavg() }, cpuMetrics, processCpuSeconds, cases, errors, blockedMutations: mutations,
    method: 'rAF modes use real elapsed simulation time; unpaced MessageChannel modes use fixed1/60 steps plus either gl.finish or an asynchronously polled GPU fence. Fence latency includes driver queueing and JS polling delay; timer queries measure GL work when available. JS tick/submission/finish are separate. Empty rAF isolates scheduling and HUD cost. Headless focus does not establish desktop foreground or presented FPS. GL completion excludes final browser/OS compositing. Host load is contextual, not proof of GPU contention.',
  };
  const json = JSON.stringify(report, null, 2);
  if (process.env.RPG_BENCH_OUTPUT) await writeFile(process.env.RPG_BENCH_OUTPUT, json + '\n');
  console.log(json);
  if (errors.length || environment.software || mutations.length) process.exitCode = 1;
} finally {
  await browser.close(); // Only this isolated Playwright-owned browser.
}
