/** Capture the live fresh-only hero studio. The parent task manages CDP/browser service. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { chromium } from '../web/node_modules/@playwright/test/index.mjs';

const args = process.argv.slice(2);
function option(name: string, fallback?: string) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value`);
  return value;
}
const pass = option('pass');
if (!pass || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(pass)) throw new Error('Usage: bun scripts/capture-teal-hero.ts --pass blockout-01 [--out directory] [--url http://localhost:5188/hero-study.html]');
const root = resolve(import.meta.dir, '..');
const output = resolve(option('out', resolve(root, 'docs/hero-img2threejs/review', pass))!);
const within = (parent: string, child: string) => { const path = relative(parent, child); return !path.startsWith('..') && !isAbsolute(path); };
if (!within(root, output) && !within('/tmp', output)) throw new Error('Capture output must be inside the repository or /tmp.');
const url = new URL(option('url', 'http://127.0.0.1:5188/hero-study.html')!);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Fresh hero captures require a local preview URL.');
url.searchParams.set('capture', '1');
const width = Number(option('width', '768')), height = Number(option('height', '1024'));
if (![width, height].every(value => Number.isInteger(value) && value >= 128 && value <= 4096)) throw new Error('Viewport dimensions must be integers from 128 to 4096.');
const cameraIds = ['hero', 'orbit-plus35', 'orbit-minus35', 'profile', 'rear-threequarter', 'rear', 'head-hero', 'head-threequarter'];
const diagnosticPasses = args.includes('--beauty-only') ? ['beauty'] : ['beauty', 'alpha-silhouette', 'semantic-id', 'depth', 'normal', 'roughness-material-id'];
const errors: string[] = [];
const report: Record<string, any> = { pass, url: url.toString(), startedAt: new Date().toISOString(), viewport: [width, height], devicePixelRatio: 1, status: 'running', captures: [], errors };
await mkdir(output, { recursive: true });
let browser: any, context: any;
const digest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
try {
  browser = await chromium.connectOverCDP(option('cdp', 'http://127.0.0.1:9222')!);
  context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (error: Error) => errors.push(String(error)));
  page.on('console', (message: any) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => (window as any).__IMG2THREEJS_READY__ === true, undefined, { timeout: 120000 });
  const canvas = page.locator('#hero-study-canvas');
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({ width: element.width, height: element.height }));
  if (!size.width || !size.height) throw new Error('Capture canvas has zero dimensions.');
  const presets = await page.evaluate(() => (window as any).__IMG2THREEJS_CAPTURE__.presets);
  await page.evaluate(() => {
    const api = (window as any).__IMG2THREEJS_CAPTURE__;
    api.setAnimation({ name: '', time: 0, playing: false }); api.isolatePart(null);
  });
  const views = [...cameraIds.map(id => ({ id, camera: { ...presets[id], id } })), ...[0, 90, 180, 270].map(angle => ({ id: `turntable-${angle}`, camera: { ...presets.hero, azimuthDegrees: angle } }))];
  for (const view of views) {
    const cameraResult = await page.evaluate(async (camera: any) => (window as any).__IMG2THREEJS_CAPTURE__.setCamera(camera), view.camera);
    if (!cameraResult.ok) throw new Error(`Camera failed: ${view.id}`);
    const record: Record<string, any> = { id: view.id, camera: cameraResult.camera, files: {} };
    // The four orthogonal turntable frames are beauty-only supplements to the
    // full eight-view diagnostic batch; no duplicated image substitutes for a view.
    for (const mode of view.id.startsWith('turntable-') ? ['beauty'] : diagnosticPasses) {
      const rendered = await page.evaluate(async (passId: string) => (window as any).__IMG2THREEJS_CAPTURE__.capturePass({ passId, mode: 'procedural' }), mode);
      if (!rendered?.ok) throw new Error(`Pass failed for ${view.id}/${mode}: ${rendered?.reason}`);
      if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
      const filename = `${view.id}-${mode}.png`;
      const bytes = await page.locator(rendered.selector ?? '#hero-study-canvas').screenshot({ path: resolve(output, filename), animations: 'disabled', timeout: 30000 });
      record.files[mode] = { path: filename, sha256: digest(bytes), capturedAt: new Date().toISOString(), bytes: bytes.length };
      report.passLegends ??= {}; report.passLegends[mode] = { passId: rendered.passId, regionColors: rendered.regionColors, materialIds: rendered.materialIds, silhouetteEncoding: rendered.silhouetteEncoding, roughnessEncoding: rendered.roughnessEncoding };
    }
    report.captures.push(record);
    console.log(`Captured ${view.id}`);
  }
  // Restore beauty/rest before extracting buffers, so exporter metadata names
  // authored materials rather than diagnostic replacements.
  await page.evaluate(async () => (window as any).__IMG2THREEJS_CAPTURE__.capturePass({ passId: 'beauty', mode: 'procedural' }));
  const geometry = await page.evaluate(() => (window as any).__IMG2THREEJS_CAPTURE__.getMeshBuffers({ space: 'world', posed: true }));
  const geometryText = JSON.stringify(geometry);
  await writeFile(resolve(output, 'mesh-buffers.json'), geometryText);
  report.geometry = { path: 'mesh-buffers.json', sha256: digest(geometryText), meshes: geometry.meshes.length, space: geometry.space, posed: geometry.posed };
  // Installed geometry_integrity/self_intersection expect vertices/normals as
  // triples. Keep raw buffers intact and emit a separate, explicit adapter file.
  const triples = (values: number[]) => Array.from({ length: values.length / 3 }, (_, index) => values.slice(index * 3, index * 3 + 3));
  const gateGeometry = { source: 'mesh-buffers.json', space: geometry.space, posed: geometry.posed,
    meshes: geometry.meshes.map((mesh: any) => ({ name: mesh.name, region: mesh.region, visible: mesh.visible, vertices: triples(mesh.positions), normals: triples(mesh.normals), indices: mesh.indices })) };
  const gateText = JSON.stringify(gateGeometry);
  await writeFile(resolve(output, 'geometry-gates.json'), gateText);
  report.gateGeometry = { path: 'geometry-gates.json', sha256: digest(gateText), meshes: gateGeometry.meshes.length, includesHiddenMeshes: true };

  report.runtime = await page.evaluate(() => {
    const viewer = (window as any).__IMG2THREEJS_VIEWER__, model = viewer.model;
    return { rootName: model.name, sculptRuntime: { present: !!model.userData.sculptRuntime, fields: Object.keys(model.userData.sculptRuntime ?? {}), partNames: Object.keys(model.userData.sculptRuntime?.meshes ?? {}) }, clips: model.animations.map((clip: any) => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })), renderer: { calls: viewer.renderer.info.render.calls, triangles: viewer.renderer.info.render.triangles }, canvas: { width: viewer.renderer.domElement.width, height: viewer.renderer.domElement.height }, meshNames: (() => { const result: string[] = []; model.traverse((node: any) => { if (node.isMesh) result.push(node.name); }); return result; })() };
  });
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  report.status = 'captured';
  report.visualReview = 'Pending image readback and reference comparison. Readiness and screenshots do not establish visual quality.';
} catch (error) {
  report.status = 'failed'; report.failure = String(error); throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  try { await writeFile(resolve(output, 'capture-metadata.json'), JSON.stringify(report, null, 2)); }
  finally { await context?.close(); await browser?.close(); }
}
console.log(JSON.stringify({ status: report.status, output, captures: report.captures.length, geometry: report.geometry }));
