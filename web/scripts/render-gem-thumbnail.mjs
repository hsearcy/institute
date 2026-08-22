// Render a shop thumbnail straight from a gem's shipping GLB, so the shelf shows
// the real asset instead of a hand-drawn CSS approximation that drifts from it.
// Needs the vite dev server up (npm run dev).
//
//   node scripts/render-gem-thumbnail.mjs /assets/models/gems/dragonheart/model.glb \
//     public/assets/models/gems/dragonheart/preview.png -1.5707963
import { chromium } from '@playwright/test';

const [modelUrl, outPath, rotY = '0'] = process.argv.slice(2);
if (!modelUrl || !outPath) {
  console.error('usage: render-gem-thumbnail.mjs <modelUrl> <outPath> [rotY]');
  process.exit(1);
}
const BASE = process.env.INSPECT_URL ?? 'http://127.0.0.1:5188';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
const url = `${BASE}/model-inspect.html?model=${encodeURIComponent(modelUrl)}&rotY=${rotY}&size=512&alpha=1`;
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__inspect, null, { timeout: 60_000 });
const report = await page.evaluate(() => window.__inspect);
if (report.error) throw new Error(report.error);
await page.locator('canvas').screenshot({ path: outPath, omitBackground: true });
await browser.close();
console.log(`wrote ${outPath}`);
