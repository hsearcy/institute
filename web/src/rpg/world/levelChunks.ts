import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { masonryGeometry, projectStoneUV } from './masonry';
import { crystalClusterGeometry } from './crystals';
import { ruinGeometry } from './ruins';
import { applyHeroCutoutTo } from './heroCutout';
import { random, rectCenter, type Area, type Chunk, type Feature, type Level, type Side } from './levelGen';
import type { OutdoorHelpers, OutdoorKit } from './outdoorWorld';

export type ChunkTorch = { flame: THREE.Mesh; position: THREE.Vector3; phase: number };
/** A point that may borrow one of the world's few real lights. */
export type ChunkGlow = { position: THREE.Vector3; warm: boolean };
export type BuiltChunk = { readonly key: string; readonly group: THREE.Group; readonly torches: ChunkTorch[]; readonly glows: ChunkGlow[]; readonly runes: THREE.Object3D[] };
export type VaultMaterials = Record<'floor' | 'wall' | 'trim' | 'dark' | 'crystalStone' | 'runeGold' | 'gold', THREE.MeshStandardMaterial>;
export type ChunkContext = {
  readonly level: Level;
  readonly regionId: string;
  readonly materials: VaultMaterials;
  readonly outdoor?: OutdoorKit;
  /** A clone of a loaded model scaled to a height, or undefined while it loads. */
  model(name: string, height: number): THREE.Group | undefined;
  readonly flame: THREE.Material;
  readonly glowMap: THREE.Texture;
};

/** One straight stretch of wall on a rect's side, in metres along that side. */
type WallRun = { side: Side; line: number; from: number; to: number };
const OUTWARD: Record<Side, { x: number; z: number }> = { north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, east: { x: 1, z: 0 }, west: { x: -1, z: 0 } };
/** Far walls stand tall; walls on the camera's side stay low, so the floor is always in view. */
const TALL = (side: Side) => side === 'north' || side === 'west';

/** Wall edges of a chunk: floor cells whose neighbour is neither floor nor a doorway. */
export function wallRuns(level: Level, chunk: Chunk): WallRun[] {
  const doors = chunk.area ? level.openings(chunk.area) : [];
  const runs: WallRun[] = [];
  for (const rect of chunk.rects) {
    for (const side of ['north', 'south', 'east', 'west'] as Side[]) {
      const alongX = side === 'north' || side === 'south';
      const line = side === 'north' ? rect.minZ : side === 'south' ? rect.maxZ : side === 'east' ? rect.maxX : rect.minX;
      const [low, high] = alongX ? [rect.minX, rect.maxX] : [rect.minZ, rect.maxZ];
      let start: number | undefined;
      for (let at = low; at <= high; at++) {
        let wall = false;
        if (at < high) {
          const out = OUTWARD[side];
          const cellX = alongX ? at : side === 'east' ? rect.maxX : rect.minX - 1;
          const cellZ = alongX ? (side === 'south' ? rect.maxZ : rect.minZ - 1) : at;
          const doorway = doors.some(door => door.side === side && at + .5 > door.from && at + .5 < door.to);
          wall = !level.isFloor(cellX, cellZ) && !doorway && !!out;
        }
        if (wall && start === undefined) start = at;
        if (!wall && start !== undefined) { runs.push({ side, line, from: start, to: at }); start = undefined; }
      }
    }
  }
  return runs;
}

export function buildChunk(context: ChunkContext, chunk: Chunk): BuiltChunk {
  return context.outdoor ? buildOutdoorChunk(context, context.outdoor, chunk) : buildVaultChunk(context, chunk);
}

function chunkSeed(chunk: Chunk): number {
  return chunk.area?.seed ?? Math.imul(chunk.bounds.minX * 73856093 ^ chunk.bounds.minZ * 19349663, 83492791) | 0;
}

function buildVaultChunk(context: ChunkContext, chunk: Chunk): BuiltChunk {
  const { level, materials } = context, rng = random(chunkSeed(chunk));
  const group = new THREE.Group(); group.name = `chunk-${chunk.key}`;
  const torches: ChunkTorch[] = [], glows: ChunkGlow[] = [], runes: THREE.Object3D[] = [];
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const frost = context.regionId.includes('frost'), storm = context.regionId.includes('storm');
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, turn = 0) => {
    if (material === materials.wall || material === materials.trim) {
      // Damp mortar collects at the base instead of tinting every stone alike.
      const shade = .76 + rng() * .46, positions = geometry.getAttribute('position'), authored = geometry.getAttribute('color');
      const colors = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i++) {
        const damp = .67 + .33 * Math.min(1, Math.max(0, (positions.getY(i) + y) / 1.35));
        colors[i * 3] = shade * damp * (authored?.getX(i) ?? 1); colors[i * 3 + 1] = shade * damp * .99 * (authored?.getY(i) ?? 1); colors[i * 3 + 2] = shade * damp * .94 * (authored?.getZ(i) ?? 1);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      materials.wall.vertexColors = materials.trim.vertexColors = true;
    }
    geometry.rotateY(turn); geometry.translate(x, y, z);
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material)!.push(normalized);
  };
  const block = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, turn = 0, bevel = .065) => {
    const chipped = material === materials.wall && w < 3 && d < 3;
    const geometry = chipped ? masonryGeometry(w, h, d, rng) : new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, Math.min(w, h, d) * .2));
    if (!chipped && (material === materials.wall || material === materials.trim)) projectStoneUV(geometry, rng() * 3, rng() * 3);
    add(geometry, material, x, y, z, turn);
  };
  const prop = (name: string, height: number, x: number, z: number, turn = 0) => {
    const object = context.model(name, height); if (!object) return undefined;
    object.position.x = x; object.position.z = z; object.rotation.y = turn; object.userData.shared = true;
    group.add(object); return object;
  };
  const torch = (x: number, y: number, z: number) => {
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(.2, .12, .36, 8), materials.gold); holder.position.set(x, y, z); group.add(holder);
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(.55, .95), context.flame); flame.position.set(x, y + .55, z); flame.rotation.y = .7; group.add(flame);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff942b, map: context.glowMap, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.set(x, y + .42, z); halo.scale.set(1.65, 2.1, 1); halo.userData.ownedMaterial = true; group.add(halo);
    const position = new THREE.Vector3(x, y + .4, z);
    torches.push({ flame, position, phase: x + z }); glows.push({ position, warm: true });
  };
  const pier = (x: number, z: number, height: number) => {
    if (prop('masonry-pier', height + .89, x, z)) return;
    for (let tier = 0; tier < 3; tier++) block(1.8 - tier * .18, .19, 1.8 - tier * .18, materials.trim, x, .1 + tier * .18, z);
    for (let layer = 0; layer < Math.ceil(height / .49); layer++) {
      const spread = layer % 3 === 0 ? 1.17 : 1.04;
      block(spread, .47, spread, materials.wall, x + (rng() - .5) * .055, .72 + layer * .49, z + (rng() - .5) * .05, (rng() - .5) * .025);
    }
    block(1.55, .22, 1.55, materials.trim, x, height + .62, z);
    block(1.32, .14, 1.32, materials.wall, x, height + .82, z);
  };
  const stones = (x: number, z: number, spread: number, count: number, size: number) => {
    for (let n = 0; n < count; n++) {
      const radius = size * (.25 + rng() * .75), angle = rng() * Math.PI * 2, distance = Math.sqrt(rng()) * spread;
      const geometry = new THREE.DodecahedronGeometry(radius, 0);
      geometry.scale(1 + rng(), .32 + rng() * .7, .6 + rng()); geometry.rotateX(rng() * 2); geometry.rotateZ(rng() * 2);
      add(geometry, n % 4 === 0 ? materials.trim : materials.wall, x + Math.cos(angle) * distance, radius * .26, z + Math.sin(angle) * distance, rng() * 6);
    }
  };

  // Floors carry world-space texture coordinates, so neighbouring pieces share one worn surface.
  for (const rect of chunk.rects) {
    const width = rect.maxX - rect.minX, depth = rect.maxZ - rect.minZ, center = rectCenter(rect);
    const floor = new THREE.PlaneGeometry(width, depth, Math.max(1, width / 2), Math.max(1, depth / 2)); floor.rotateX(-Math.PI / 2);
    const uv = floor.getAttribute('uv'), position = floor.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (position.getX(i) + center.x) / 4.8, (position.getZ(i) + center.z) / 4.8);
    add(floor, materials.floor, center.x, -.05, center.z);
    block(width, .55, depth, materials.dark, center.x, -.38, center.z, 0, .015);
    // Grit and chips on the floor; none of it blocks a step.
    for (let n = 0; n < width * depth / 9; n++) {
      const shard = new THREE.DodecahedronGeometry(.045 + rng() * .1, 0); shard.scale(1.8, .2, 1);
      add(shard, materials.trim, rect.minX + rng() * width, .02, rect.minZ + rng() * depth, rng() * 6);
    }
  }

  for (const run of wallRuns(level, chunk)) {
    const out = OUTWARD[run.side], alongX = run.side === 'north' || run.side === 'south', length = run.to - run.from;
    const point = (along: number, offset: number) => alongX ? { x: along, z: run.line + out.z * offset } : { x: run.line + out.x * offset, z: along };
    const turn = alongX ? 0 : Math.PI / 2;
    if (TALL(run.side)) {
      const height = 3.3 + rng() * .9, thickness = 1.15;
      for (let row = 0; row < Math.ceil(height / .57); row++) {
        for (let along = run.from + .55 + (row % 2) * .5; along < run.to - .2; along += 1.16) {
          // A broken crown: upper courses stop at an irregular line.
          const crown = height - (Math.sin(along * 1.7 + run.line) * .5 + .5) * 1.4;
          if (row * .57 > crown || (row > 5 && rng() < .06)) continue;
          const at = point(along, thickness / 2);
          block(1.11, .53, thickness, materials.wall, at.x, .26 + row * .57, at.z, turn + (rng() - .5) * .023);
        }
      }
      // Piers carry the vault at the corners of an area and along long walls;
      // a hallway leaves its ends to the areas it joins. Torches hang between.
      const bays = Math.max(1, Math.round(length / 7.5));
      for (let bay = 0; bay <= bays; bay++) {
        const end = bay === 0 || bay === bays;
        if ((end && (!chunk.area || length < 3)) || (!end && length < 9)) continue;
        const at = point(run.from + length * bay / bays, .25);
        pier(at.x, at.z, height - .3 + rng() * .3);
      }
      for (let along = run.from + 3; along < run.to - 1.5; along += 6) {
        const at = point(along, -.55);
        torch(at.x, 2.1, at.z);
      }
      // Rubble gathers against the far side of the wall, breaking its silhouette.
      for (let n = 0; n < length * 1.5; n++) { const at = point(run.from + rng() * length, 1.3 + rng() * 2); stones(at.x, at.z, .4, 1, .4); }
      if (frost) for (let n = 0; n < length / 6; n++) {
        const at = point(run.from + 1 + rng() * Math.max(0, length - 2), .1);
        prop('ice_cluster', 1.4 + rng() * 1.8, at.x, at.z, rng() * 6);
      }
      if (storm && length > 6 && rng() < .7) {
        const at = point(run.from + length / 2, -.2);
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(.62, .86, .65, 6), materials.trim); pedestal.position.set(at.x, .33, at.z); group.add(pedestal);
        const rune = new THREE.Group(); rune.position.set(at.x, 2.4, at.z); rune.userData.baseY = 2.4;
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(.7, 0), materials.trim); core.scale.y = 1.5; rune.add(core);
        for (let band = 0; band < 3; band++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.49 + band * .025, .023, 4, 6), new THREE.MeshBasicMaterial({ color: 0x8d99fc })); ring.rotation.x = Math.PI / 2; ring.position.y = (band - 1) * .27; ring.userData.ownedMaterial = true; rune.add(ring); }
        group.add(rune); runes.push(rune);
      }
    } else {
      // Near walls are broken to knee height, with fallen blocks in front.
      for (let along = run.from; along < run.to; along += 1.08) {
        const courses = 1 + Math.floor((Math.sin(along * 1.3 + run.line * .7) * .5 + .5) * 2.2);
        for (let row = 0; row < courses; row++) {
          const at = point(along + .54 + (row % 2) * .2, .5);
          block(1.02, .5, .9, materials.wall, at.x, .25 + row * .52, at.z, turn + (rng() - .5) * .12);
        }
        if (rng() < .35) { const at = point(along + rng(), 1.4 + rng()); stones(at.x, at.z, .5, 2, .35); }
      }
    }
  }

  // Arches frame the doorways in far walls.
  if (chunk.area) for (const door of level.openings(chunk.area)) {
    if (!TALL(door.side)) continue;
    const r = chunk.area.rect, mid = (door.from + door.to) / 2;
    const at = door.side === 'north' ? { x: mid, z: r.minZ } : { x: r.minX, z: mid };
    prop('arch', 5.6, at.x, at.z, door.side === 'north' ? 0 : Math.PI / 2);
  }

  if (chunk.area) for (const feature of chunk.area.features) vaultFeature(feature, chunk.area);

  function vaultFeature(feature: Feature, area: Area): void {
    const { x, z } = feature;
    switch (feature.kind) {
      case 'pier': pier(x, z, 3.8 + feature.scale); break;
      case 'brazier': if (prop('brazier', 1.45, x, z)) torch(x, 1.02, z); break;
      case 'crystals':
        add(crystalClusterGeometry(Math.round(x * 13 + z * 7)), materials.crystalStone, x, 0, z, feature.turn);
        prop('crystal', 1.5 * feature.scale, x + .5, z - .3, feature.turn);
        glows.push({ position: new THREE.Vector3(x, 1.6, z), warm: false });
        break;
      case 'tomb':
        block(1.1, .63, 2.05, materials.wall, x, .32, z, feature.turn);
        block(1.22, .15, 2.22, materials.trim, x + .12, .71, z - .04, feature.turn + .09);
        for (let rib = -1; rib <= 1; rib++) block(.06, .045, 1.7, materials.dark, x + rib * .28, .8, z, feature.turn);
        break;
      case 'rubble': {
        for (let n = 0; n < 40; n++) {
          const angle = rng() * Math.PI * 2, radius = Math.sqrt(rng()) * feature.radius, mound = Math.max(0, 1 - radius / feature.radius) * .7;
          const stone = new THREE.DodecahedronGeometry(.13 + rng() * .3, 0); stone.scale(1.4, .6, .9); stone.rotateX(rng() * 2);
          add(stone, n % 3 ? materials.wall : materials.trim, x + Math.cos(angle) * radius, mound + .08, z + Math.sin(angle) * radius, rng() * 6);
        }
        const fallen = ruinGeometry('fallen-column', Math.round(x * 31 + z * 17));
        add(fallen, materials.trim, x, 0, z, feature.turn);
        break;
      }
      case 'chest': prop('chest', .82, x, z, feature.turn); break;
      case 'landmark':
        if ((area.id + Math.round(x)) % 2) { if (prop('furnace', 3.2, x, z, feature.turn)) torch(x, .35, z + .25); }
        else { prop('reliquary', 3.0, x, z, feature.turn); glows.push({ position: new THREE.Vector3(x, 1.8, z), warm: false }); }
        break;
      case 'altar': {
        prop('reliquary', 2.1, x, z, 0);
        const sigil = new THREE.TorusGeometry(4.1, .018, 3, 64); sigil.rotateX(Math.PI / 2);
        const center = rectCenter(area.rect);
        add(sigil, materials.runeGold, center.x, -.01, center.z);
        const portal = new THREE.Mesh(new THREE.CircleGeometry(2, 48), new THREE.MeshBasicMaterial({ color: 0x128bb8, map: context.glowMap, transparent: true, opacity: .5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        portal.position.set(x, 2.8, z); portal.lookAt(center.x, 2.8, center.z); portal.userData.ownedMaterial = true; group.add(portal);
        glows.push({ position: new THREE.Vector3(x, 2.4, z), warm: false });
        break;
      }
      default: break;
    }
  }

  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false); geometries.forEach(geometry => geometry.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = material !== materials.floor && material !== materials.dark; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix(); group.add(mesh);
  }
  applyHeroCutoutTo(group, [materials.floor, materials.dark]);
  return { key: chunk.key, group, torches, glows, runes };
}

function buildOutdoorChunk(context: ChunkContext, kit: OutdoorKit, chunk: Chunk): BuiltChunk {
  const { level } = context;
  const group = kit.build(chunkSeed(chunk), helpers => {
    const { random: rng, boulder, tree, tuft, ruinedColumn, crown } = helpers;
    for (const rect of chunk.rects) {
      // The trail: a worn floor with a ragged edge, just above the wild ground.
      const width = rect.maxX - rect.minX, depth = rect.maxZ - rect.minZ, center = rectCenter(rect);
      const floor = new THREE.PlaneGeometry(width + 1.2, depth + 1.2, Math.ceil(width), Math.ceil(depth)); floor.rotateX(-Math.PI / 2);
      const position = floor.getAttribute('position'), uv = floor.getAttribute('uv');
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), z = position.getZ(i);
        const edge = Math.abs(x) > width / 2 + .4 || Math.abs(z) > depth / 2 + .4;
        if (edge) position.setXYZ(i, x + (rng() - .5) * .9, 0, z + (rng() - .5) * .9);
        uv.setXY(i, (position.getX(i) + center.x) / 4, (position.getZ(i) + center.z) / 4);
      }
      helpers.add(floor, helpers.materials.path, center.x, -.02 - rng() * .004, center.z);
    }
    for (const run of wallRuns(level, chunk)) {
      const out = OUTWARD[run.side], alongX = run.side === 'north' || run.side === 'south';
      const point = (along: number, offset: number) => alongX ? { x: along, z: run.line + out.z * offset } : { x: run.line + out.x * offset, z: along };
      for (let along = run.from + .6; along < run.to; along += 1.8 + rng() * 1.2) {
        // A low hedge of rock and growth marks the edge of the open ground.
        const edge = point(along, .7 + rng() * .5);
        boulder(edge.x, edge.z, .5 + rng() * .5, .3 + rng() * .45, .5 + rng() * .5);
        for (let k = 0; k < 3; k++) tuft(edge.x + (rng() - .5) * 1.6, edge.z + (rng() - .5) * 1.6, .3 + rng() * .4);
        if (!TALL(run.side)) continue;
        // Far edges rise: trees, cliffs or ruins, by region.
        const back = point(along, 2.2 + rng() * 2.4);
        if (kit.kind === 'forest' || (kit.kind === 'garden' && rng() < .5)) { if (rng() < .32) tree(back.x, back.z, 3.8 + rng() * 2.6); else crown(back.x, .6, back.z, 1.2); }
        else if (kit.kind === 'garden') ruinedColumn(back.x, back.z, 1.4 + rng() * 2);
        else boulder(back.x, back.z, 1.6 + rng() * 1.4, 1.2 + rng() * (kit.kind === 'quarry' ? 2.6 : 1.6), 1.4 + rng());
      }
    }
    for (const rect of chunk.rects) {
      // A little growth on the open floor, never enough to read as a barrier.
      const width = rect.maxX - rect.minX, depth = rect.maxZ - rect.minZ;
      for (let n = 0; n < width * depth / 26; n++) tuft(rect.minX + rng() * width, rect.minZ + rng() * depth, .18 + rng() * .25);
    }
    if (chunk.area) for (const feature of chunk.area.features) outdoorFeature(helpers, feature, chunk.area);
  });
  group.name = `chunk-${chunk.key}`;
  applyHeroCutoutTo(group, [kit.materials.ground, kit.materials.path, kit.materials.water, kit.materials.foam, kit.materials.grass]);
  return { key: chunk.key, group, torches: [], glows: [], runes: [] };
}

function outdoorFeature(helpers: OutdoorHelpers, feature: Feature, area: Area): void {
  const { random: rng, boulder, tree, ruinedColumn, fountain, block, add, arch, materials } = helpers;
  const { x, z } = feature;
  switch (feature.kind) {
    case 'tree': tree(x, z, 2.8 + feature.scale * 1.2); break;
    case 'boulder': case 'rubble': boulder(x, z, feature.radius * 1.1, .5 + rng() * .7, feature.radius); break;
    case 'column': case 'pier': ruinedColumn(x, z, 1.2 + feature.scale * 1.8); break;
    case 'fountain': fountain(x, z); break;
    case 'wreck':
      // The ribs of a beached hull.
      for (let n = 0; n < 6; n++) block(materials.wood, x - 1.5 + n * .6, .5 + Math.sin(n * .5) * .2, z, .18, 1.2 + Math.sin(n) * .3, 2.6, .3 * Math.sin(n + feature.turn));
      block(materials.wood, x, .18, z, 3.6, .2, .5, feature.turn);
      break;
    case 'cart':
      block(materials.wood, x, .8, z, 1.5, .75, 2.0, feature.turn);
      for (const dx of [-.7, .7]) for (const dz of [-.65, .65]) add(new THREE.CylinderGeometry(.3, .3, .12, 9).rotateZ(Math.PI / 2), materials.iron, x + dx, .35, z + dz);
      break;
    case 'altar': {
      arch(x, z);
      const center = rectCenter(area.rect);
      for (let n = 0; n < 8; n++) { const a = n / 8 * Math.PI * 2; ruinedColumn(center.x + Math.cos(a) * 8.5, center.z + Math.sin(a) * 8.5, n % 2 ? 1.6 : 3.4); }
      break;
    }
    default: break;
  }
}

/** Releases what a chunk built. Shared model clones and kit materials stay. */
export function disposeChunk(built: BuiltChunk): void {
  built.group.removeFromParent();
  const release = (object: THREE.Object3D) => {
    if (object.userData.shared) return;
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
      object.geometry.dispose();
      if (object.userData.ownedMaterial) (object.material as THREE.Material).dispose();
    }
    object.children.forEach(release);
  };
  release(built.group);
}
