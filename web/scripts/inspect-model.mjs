// Turntable + spec report for a GLB, rendered through the cavern's real lighting
// rig (see model-inspect.html). Judging a gem from one flattering angle hides the
// side that is broken, so this always sweeps a full rotation.
//
//   node scripts/inspect-model.mjs /assets/models/gems/dragonheart/model.glb out/dh [rotY]
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const [modelUrl, outDir, rotY = '0', frames = '8'] = process.argv.slice(2);
if (!modelUrl || !outDir) {
  console.error('usage: inspect-model.mjs <modelUrl> <outDir> [rotY] [frames]');
  process.exit(1);
}
const BASE = process.env.INSPECT_URL ?? 'http://127.0.0.1:5188';

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let report = null;
const n = Number(frames);
for (let i = 0; i < n; i++) {
  const yaw = (i / n) * Math.PI * 2;
  const url = `${BASE}/model-inspect.html?model=${encodeURIComponent(modelUrl)}&rotY=${rotY}&yaw=${yaw}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__inspect, null, { timeout: 60_000 });
  report ??= await page.evaluate(() => window.__inspect);
  if (report.error) break;
  await page.locator('canvas').screenshot({ path: `${outDir}/yaw${String(i).padStart(2, '0')}.png` });
}

await writeFile(`${outDir}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
console.log(JSON.stringify({ ...report, errors }, null, 2));
await browser.close();
