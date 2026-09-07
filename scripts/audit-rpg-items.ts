/** Check the actual installed catalogue, rather than counting Blender sources.
 * Run: bun scripts/audit-rpg-items.ts [--allow-missing]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RPG_ITEMS } from '../shared/src/rpg';
import { ITEM_MODELS } from '../web/src/rpg/itemModels';

const root = resolve(import.meta.dir, '..');
const assetRoot = resolve(root, 'web/public/assets/rpg/items');
const manifest = JSON.parse(readFileSync(resolve(assetRoot, 'manifest.json'), 'utf8'));
const catalogue = JSON.parse(readFileSync(resolve(root, 'scripts/blender/items/catalogue.json'), 'utf8'));
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const installed = [], missing = [], errors = [];
const geometryHashes = new Map<string, string>();
assert.deepEqual(new Set(catalogue.items.map((item: any) => item.id)), new Set(RPG_ITEMS.map(item => item.id)));
for (const id of Object.keys(ITEM_MODELS)) assert(RPG_ITEMS.some(item => item.id === id), `Unknown saved item ID: ${id}`);
for (const item of RPG_ITEMS) {
  if (!ITEM_MODELS[item.id]) { missing.push(item.id); continue; }
  try {
    const entry = ITEM_MODELS[item.id];
    assert.equal(entry.model, `items/${item.id}`);
    assert.equal(entry.thumbnail, `/assets/rpg/items/${item.id}.png`);
    const entries = manifest.items.filter((entry: any) => entry.id === item.id);
    assert.equal(entries.length, 1, 'Exactly one manifest receipt is required');
    const receipt = entries[0];
    const glb = readFileSync(resolve(assetRoot, `${item.id}.glb`));
    const png = readFileSync(resolve(assetRoot, `${item.id}.png`));
    assert.equal(digest(glb), receipt.sha256, 'Model hash differs from installation receipt');
    assert.equal(digest(png), receipt.thumbnailSha256, 'Thumbnail hash differs from installation receipt');
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert(png.readUInt32BE(16) >= 256 && png.readUInt32BE(20) >= 256, 'Thumbnail too small');
    const result = Bun.spawnSync(['python3', 'scripts/blender/items/validate_candidate.py', resolve(assetRoot, `${item.id}.glb`), item.id], { cwd: root });
    assert.equal(result.exitCode, 0, result.stderr.toString());
    const structural = JSON.parse(result.stdout.toString());
    const jsonLength = glb.readUInt32LE(12), doc = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
    const binary = glb.subarray(28 + jsonLength);
    // Only position/index bytes contribute: changing names or materials cannot
    // disguise a reused generic item as a unique model.
    const geometry = createHash('sha256');
    for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
      for (const accessorIndex of [primitive.attributes.POSITION, primitive.indices]) {
        if (accessorIndex === undefined) continue;
        const accessor = doc.accessors[accessorIndex], view = doc.bufferViews[accessor.bufferView];
        geometry.update(binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
      }
    }
    const geometrySha256 = geometry.digest('hex');
    assert(!geometryHashes.has(geometrySha256), `Geometry duplicated from ${geometryHashes.get(geometrySha256)}`);
    geometryHashes.set(geometrySha256, item.id);
    installed.push({ ...structural, geometrySha256, attachment: catalogue.items.find((spec: any) => spec.id === item.id).attachment });
  } catch (error) { errors.push({ id: item.id, error: String(error) }); }
}
console.log(JSON.stringify({ total: RPG_ITEMS.length, installed: installed.length, missing, errors, items: installed,
  scope: 'Catalogue, payload, unique geometry, attachment metadata and thumbnail checks. Visual quality is reviewed separately.' }, null, 2));
if (errors.length || (missing.length && !process.argv.includes('--allow-missing'))) process.exitCode = 1;
