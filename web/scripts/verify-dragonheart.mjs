// Visual verification for the Dragonheart gem: proves the real GLB (not the
// procedural fallback) is what lands on the mine target, and captures the shop
// shelf plus a turntable of the equipped gem in the live cavern.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const URL = process.argv[2] ?? 'http://127.0.0.1:5188';
const OUT = process.argv[3] ?? 'verify-out';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.pad .key-mine');
await page.waitForFunction(() => window.__game, null, { timeout: 30_000 });
// loadAssets() awaits the pickaxe, clusters and geode before it ever reaches the
// generated gems, so a fixed sleep races it and silently verifies the procedural
// fallback instead. Wait for the actual registration.
await page.waitForFunction(
  () => window.__game.gemStyleModels?.has('gem_dragonheart'),
  null,
  { timeout: 60_000 },
);

// Teaching/celebration overlays blur the whole canvas, so any screenshot taken
// under one shows the blur, not the gem. Dismiss whatever is up first.
for (let i = 0; i < 6; i++) {
  const cta = page.locator('button:visible', { hasText: /try one|got it|let's go|continue|ok/i }).first();
  if (!(await cta.count())) break;
  await cta.click().catch(() => {});
  await page.waitForTimeout(500);
}
await page.waitForTimeout(500);

// Equip the Dragonheart directly. `applyGemStyle` is TS-private, which is a
// compile-time fence only, so the running instance still exposes it.
const equipped = await page.evaluate(() => window.__game.applyGemStyle('gem_dragonheart'));

// The decisive check: walk the live hero and confirm the mine target is the
// generated mesh. The procedural fallback is a Group of primitives with no
// textures, so a 226k-triangle textured mesh can only be the GLB.
const heroInfo = await page.evaluate(() => {
  const hero = window.__game.hero;
  let tris = 0, meshes = 0, textured = 0, names = [];
  hero.traverse((o) => {
    if (o.name) names.push(o.name);
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const m of [o.material].flat()) if (m.map) textured++;
  });
  const box = new (window.__three?.Box3 ?? Object)();
  return { meshes, triangles: Math.round(tris), textured, names: names.slice(0, 6) };
});

await page.waitForTimeout(600);
await page.locator('#game-canvas').screenshot({ path: `${OUT}/mine-target.png` });

// Turntable in the live scene: spin the equipped model, not a preview rig.
for (let i = 0; i < 6; i++) {
  const yaw = (i / 6) * Math.PI * 2;
  await page.evaluate((y) => { window.__game.hero.children[0].rotation.y = y - Math.PI / 2; }, yaw);
  await page.waitForTimeout(220);
  await page.locator('#game-canvas').screenshot({ path: `${OUT}/turn${i}.png` });
}
await page.evaluate(() => { window.__game.hero.children[0].rotation.y = -Math.PI / 2; });

// Shop shelf, where the thumbnail render should appear on the Dragonheart row.
const shopToggle = page.locator('#shop-toggle, [data-toggle="shop"], .shop-toggle').first();
if (await shopToggle.count()) {
  await shopToggle.click();
  await page.waitForTimeout(900);
  const row = page.locator('.gem-style-row', { hasText: 'Dragonheart' }).first();
  if (await row.count()) {
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await row.screenshot({ path: `${OUT}/shop-row.png` });
  }
  await page.screenshot({ path: `${OUT}/shop.png` });
}

console.log(JSON.stringify({ equipped, heroInfo, errors }, null, 2));
await browser.close();
