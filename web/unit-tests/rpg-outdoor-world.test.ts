import assert from 'node:assert/strict';
import { test, spyOn } from 'bun:test';
import * as THREE from 'three';
import { createOutdoorKit, outdoorKind, type OutdoorKit } from '../src/rpg/world/outdoorWorld';
import { Level, type Biome } from '../src/rpg/world/levelGen';
import { buildChunk, disposeChunk, type BuiltChunk, type ChunkContext } from '../src/rpg/world/levelChunks';

/** Only replace image loading; all geometry construction and disposal is real. */
function withKit(region: string, check: (kit: OutdoorKit, level: Level, textures: THREE.Texture[]) => void): void {
  const textures: THREE.Texture[] = [];
  const loader = spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => {
    const texture = new THREE.Texture(); textures.push(texture); return texture;
  });
  const errors = spyOn(console, 'error').mockImplementation(() => {});
  let kit: OutdoorKit | undefined;
  try {
    kit = createOutdoorKit(region);
    const level = new Level(7, outdoorKind(region)! as Biome);
    level.expandAround(level.start.x, level.start.z, 40);
    check(kit, level, textures);
    assert.equal(errors.mock.calls.length, 0, 'Geometry merge errors must not remove scenery batches');
  } finally {
    kit?.dispose();
    errors.mockRestore(); loader.mockRestore();
  }
}

const context = (kit: OutdoorKit, level: Level): ChunkContext => {
  const material = () => new THREE.MeshStandardMaterial();
  return { level, regionId: 'test', outdoor: kit, model: () => undefined, flame: new THREE.MeshBasicMaterial(), glowMap: new THREE.Texture(),
    materials: { floor: material(), wall: material(), trim: material(), dark: material(), crystalStone: material(), runeGold: material(), gold: material() } };
};

for (const region of ['mosswood', 'tidebreak', 'old-quarry', 'kingsgarden']) {
  test(`${region}: every chunk is valid geometry with a trail under its walkable floor`, () => {
    withKit(region, (kit, level) => {
      const built = level.chunks.map(chunk => ({ chunk, piece: buildChunk(context(kit, level), chunk) }));
      try {
        assert.ok(built.length >= 5);
        const ray = new THREE.Raycaster();
        for (const { chunk, piece } of built) {
          assert(piece.group.children.length >= 2, `${chunk.key} needs a trail and scenery`);
          let trail: THREE.Mesh | undefined;
          for (const object of piece.group.children) {
            assert(object instanceof THREE.Mesh);
            const geometry = object.geometry, positions = geometry.getAttribute('position');
            assert(positions.count > 0);
            for (const attribute of Object.values(geometry.attributes)) {
              assert.equal(attribute.count, positions.count, 'Merged shader attributes must cover every vertex');
              assert(attribute.array.every(Number.isFinite), 'Merged shader attributes must be finite');
            }
            if ((object.material as THREE.Material).name === 'worn-path') trail = object;
          }
          assert(trail, `${chunk.key} has no trail`);
          piece.group.updateMatrixWorld(true);
          for (const rect of chunk.rects) for (const [x, z] of [[rect.minX + .3, rect.minZ + .3], [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2], [rect.maxX - .3, rect.maxZ - .3]] as const) {
            ray.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
            const hit = ray.intersectObject(trail!, false)[0];
            assert(hit && Math.abs(hit.point.y) < .05, `${chunk.key} has no level trail at ${x},${z}`);
          }
        }
      } finally { built.forEach(({ piece }) => disposeChunk(piece)); }
    });
  });

  test(`${region}: releasing a chunk frees its geometry, and the kit frees its textures`, () => {
    const disposed = new Set<unknown>();
    let watched: THREE.BufferGeometry[] = [], textures: THREE.Texture[] = [];
    withKit(region, (kit, level, loaded) => {
      textures = loaded;
      for (const texture of loaded) texture.addEventListener('dispose', () => { disposed.add(texture); });
      const piece: BuiltChunk = buildChunk(context(kit, level), level.chunks[0]!);
      const parent = new THREE.Group(); parent.add(piece.group);
      piece.group.traverse(object => { if (object instanceof THREE.Mesh) watched.push(object.geometry); });
      for (const geometry of watched) geometry.addEventListener('dispose', () => { disposed.add(geometry); });
      disposeChunk(piece);
      assert.equal(parent.children.length, 0);
    });
    assert(textures.length >= 2, 'The kit must load its ground colour and normal maps');
    for (const resource of [...watched, ...textures]) assert(disposed.has(resource), 'Released pieces must free their GPU resources');
    watched = [];
  });
}

test('Unknown region IDs cannot select an outdoor environment through inherited object keys', () => {
  for (const region of ['sunken-vault', 'unknown', 'constructor', '__proto__', 'toString', '']) assert.equal(outdoorKind(region), undefined);
});
