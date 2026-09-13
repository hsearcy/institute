// QA evidence: render the actual scene at exact simulation times, then encode
// those frames at 30 fps. This does not measure the browser's runtime frame rate.
// Start the session in OpenMontage and read its guide before video capture.
// Usage: node /absolute/path/to/this/script.mjs OUT_DIR KINDS STATES
// Env: MOTION_VIEW=game MOTION_SIDE=1 MOTION_DISSOLVE=0 MOTION_IDLE_SECONDS=20
// Optional: MOTION_CDP_URL=http://127.0.0.1:9222 after running brave-debug.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';

const out = resolve(process.argv[2] || '/tmp/enemy-playback');
const kinds = (process.argv[3] || 'skeleton,revenant,guardian,vault-guardian-boss').split(',');
const states = (process.argv[4] || 'idle,hit').split(',');
const view = process.env.MOTION_VIEW || 'game', side = process.env.MOTION_SIDE || '1';
const dissolve = process.env.MOTION_DISSOLVE === '1', fps = 30;
const idleSeconds = Number(process.env.MOTION_IDLE_SECONDS || 20);
if (!(idleSeconds > 0 && idleSeconds <= 60)) throw new Error('Idle duration must be 0–60 seconds.');
await mkdir(out, { recursive: true });
const cdpUrl = process.env.MOTION_CDP_URL;
const browser = cdpUrl ? await chromium.connectOverCDP(cdpUrl) : await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 900, height: 760 } });
let encoder;
try {
  const page = await context.newPage(), capture = await context.newCDPSession(page);
  const version = await capture.send('Browser.getVersion');
  if (cdpUrl && (!version.userAgent.includes('Windows') || version.userAgent.includes('HeadlessChrome'))) throw new Error('The capture browser must be the Windows Brave debug profile.');
  await page.route('**/@vite/client', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  for (const kind of kinds) {
    await page.goto(`http://127.0.0.1:5191/enemy-animation-review.html?model=${encodeURIComponent(kind)}`);
    await page.waitForFunction(() => window.__review?.ok, {}, { timeout: 60000 });
    const model = await page.evaluate(() => window.__review);
    for (const state of states) {
      const seconds = state === 'idle' ? idleSeconds : 2.2, frames = Math.round(seconds * fps);
      const name = `${kind}-${state}-${view}-${side === '-1' ? 'left' : 'right'}-${dissolve ? 'dissolve' : 'solid'}-sampled30`;
      const output = resolve(out, `${name}.mp4`), started = Date.now();
      encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'mjpeg', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { stdio: ['pipe', 'ignore', 'pipe'] });
      let stderr = ''; encoder.stderr.on('data', data => { stderr += data; });
      const finished = once(encoder, 'close');
      for (let frame = 0; frame < frames; frame++) {
        await page.evaluate(async ({ state, t, view, side, dissolve }) => {
          document.getElementById('side').value = side;
          document.getElementById('dissolve').checked = dissolve;
          document.getElementById('pose').value = state;
          document.getElementById('view').value = view;
          document.getElementById('view').dispatchEvent(new Event('change'));
          window.__motionReview.setTime(t);
          let label = document.getElementById('qa-sample-label');
          if (!label) { label = document.createElement('div'); label.id = 'qa-sample-label'; label.style.cssText = 'position:fixed;right:8px;bottom:4px;color:#fff;background:#10161bcc;padding:4px;font:12px monospace;z-index:10'; document.body.append(label); }
          label.textContent = `QA · sampled 30 fps · t=${t.toFixed(3)}s`;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, { state, t: frame / fps, view, side, dissolve });
        const image = Buffer.from((await capture.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false })).data, 'base64');
        if (!encoder.stdin.write(image)) await once(encoder.stdin, 'drain');
        if (frame % 150 === 0) console.log(`${name}: ${frame}/${frames}`);
      }
      encoder.stdin.end();
      const [code] = await finished; encoder = undefined;
      if (code !== 0) throw new Error(`FFmpeg failed: ${stderr}`);
      const evidence = { method: 'Deterministic time samples of the actual browser scene; not a runtime FPS measurement', browser: version.userAgent, model, state, view, side, dissolve, fps, frames, seconds, captureWallSeconds: (Date.now() - started) / 1000, browserErrors: [...errors], output };
      await writeFile(resolve(out, `${name}.json`), JSON.stringify(evidence, null, 2) + '\n');
      console.log(JSON.stringify(evidence));
    }
  }
} finally {
  encoder?.kill();
  await context.close();
  await browser.close();
}
