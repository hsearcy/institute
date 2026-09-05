import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boundsIntersectCrossingChasm, getRoomLayout, type RoomBounds } from './roomLayout';

export type RuinKind = 'fallen-column' | 'column-stump' | 'arch-remnant';

/** The same conservative clearances used by scenery and optional prop swaps. */
export function isRuinFootprintClear(room: number, bounds: RoomBounds): boolean {
  if (boundsIntersectCrossingChasm(room, bounds)) return false;
  const layout = getRoomLayout(room), offset = layout.sideWallX - 12.2;
  const overlaps = (other: RoomBounds, gap = .12) => bounds.maxX > other.minX - gap && bounds.minX < other.maxX + gap && bounds.maxZ > other.minZ - gap && bounds.minZ < other.maxZ + gap;
  if (overlaps(layout.walkable) || overlaps(layout.heroPath, .3)) return false;
  if (layout.landmarks.some(mark => Math.hypot(Math.max(bounds.minX - mark.x, 0, mark.x - bounds.maxX), Math.max(bounds.minZ - mark.z, 0, mark.z - bounds.maxZ)) < mark.radius + .22)) return false;
  for (const side of [-1, 1]) {
    for (let tomb = 0; tomb < 3; tomb++) {
      const xs = [side * (8.6 + offset), side * (9.7 + offset)], z = -7 + tomb * 6.3;
      if (overlaps({ minX: Math.min(...xs) - 1.05, maxX: Math.max(...xs) + 1.05, minZ: z - 1.45, maxZ: z + 1.45 })) return false;
    }
    const x = side * (layout.walkable.maxX + 1.1), z = side < 0 ? -3.8 : 3.2;
    if (overlaps({ minX: x - .8, maxX: x + .8, minZ: z - .8, maxZ: z + .8 })) return false;
  }
  if ([0, 2, 5].includes(room)) {
    const x = layout.walkable.maxX + 1.1;
    if (overlaps({ minX: x - .95, maxX: x + .95, minZ: -6.05, maxZ: -4.15 })) return false;
  }
  return true;
}

const randomFor = (seed: number) => {
  let state = seed | 0;
  return () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
};

/** Shared vertices keep fracture faces attached; only lighting normals are split. */
class StoneShell {
  points: THREE.Vector3[] = [];
  indices: number[] = [];
  shades: number[] = [];
  point(x: number, y: number, z: number): number { this.points.push(new THREE.Vector3(x, y, z)); return this.points.length - 1; }
  triangle(a: number, b: number, c: number, shade = 1): void { this.indices.push(a, b, c); this.shades.push(shade); }
  geometry(seed: number): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.points.flatMap(point => point.toArray()), 3)); geometry.setIndex(this.indices);
    const flat = geometry.toNonIndexed(); geometry.dispose(); flat.computeVertexNormals();
    const position = flat.getAttribute('position'), normal = flat.getAttribute('normal');
    const uv = new Float32Array(position.count * 2), color = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      uv[i * 2] = (nx > ny && nx > nz ? z : x) * .68 + seed * .173;
      uv[i * 2 + 1] = (ny > nx && ny > nz ? z : y) * .68 + seed * .117;
      const shade = this.shades[Math.floor(i / 3)] ?? 1;
      color.set([shade, shade * .985, shade * .945], i * 3);
    }
    flat.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); flat.setAttribute('color', new THREE.BufferAttribute(color, 3));
    return flat;
  }
}

function flutedDrum(radius: number, height: number, seed: number, mouldedBase: boolean): THREE.BufferGeometry {
  const random = randomFor(seed), shell = new StoneShell(), sides = 64;
  const profile = mouldedBase
    ? [[0, 1.3], [.07, 1.3], [.14, 1.15], [.22, 1.15], [.28, 1], [.45, 1], [height * .65, .95], [height, .93]]
    : [[0, 1.02], [.06, 1.08], [.12, 1.08], [.19, .98], [height * .55, .96], [height, .93]];
  const phase = random() * 6;
  for (let ring = 0; ring < profile.length; ring++) for (let side = 0; side < sides; side++) {
    const a = side / sides * Math.PI * 2, [level, spread] = profile[ring];
    const fluting = ring < (mouldedBase ? 4 : 3) ? 1 : 1 - (1 + Math.cos(a * 16)) * .062;
    const chips = 1 - Math.max(0, Math.sin(a * 5 + phase) - .66) * .12;
    const r = radius * spread * fluting * chips;
    const fracture = ring === profile.length - 1 ? Math.sin(a * 3 + phase) * .085 + Math.cos(a * 7 - phase) * .035 + Math.cos(a - phase) * .11 : 0;
    shell.point(Math.cos(a) * r, level + fracture, Math.sin(a) * r);
  }
  for (let ring = 0; ring < profile.length - 1; ring++) for (let side = 0; side < sides; side++) {
    const a = ring * sides + side, b = (ring + 1) * sides + side, next = (side + 1) % sides;
    const shade = ring < 2 ? .7 : .91 + Math.sin(side * 2.1) * .06;
    shell.triangle(a, b, ring * sides + next, shade); shell.triangle(ring * sides + next, b, (ring + 1) * sides + next, shade);
  }
  const bottom = shell.point(0, 0, 0);
  for (let side = 0; side < sides; side++) shell.triangle(bottom, side, (side + 1) % sides, .6);
  // Two rings of uneven fracture triangles expose the broken stone interior.
  const innerStart = shell.points.length;
  for (let side = 0; side < sides; side++) {
    const a = side / sides * Math.PI * 2, outer = shell.points[(profile.length - 1) * sides + side];
    shell.point(outer.x * .48, height - .065 + Math.sin(a * 5 + phase) * .048, outer.z * .48);
  }
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides, outer = (profile.length - 1) * sides;
    shell.triangle(outer + side, innerStart + next, outer + next, 1.1); shell.triangle(outer + side, innerStart + side, innerStart + next, 1.04);
  }
  const center = shell.point(.027, height - .1, -.032);
  for (let side = 0; side < sides; side++) shell.triangle(center, innerStart + (side + 1) % sides, innerStart + side, 1.08);
  return shell.geometry(seed);
}

/** One individually closed wedge, including its uneven exposed broken ends. */
function voussoir(start: number, end: number, inner: number, outer: number, depth: number, seed: number): THREE.BufferGeometry {
  const shell = new StoneShell(), segments = 4, radial = 2, row = segments + 1, faceSize = row * (radial + 1);
  for (let face = 0; face < 2; face++) for (let r = 0; r <= radial; r++) for (let step = 0; step <= segments; step++) {
    const u = step / segments, v = r / radial;
    const a = start + (end - start) * u + Math.sin(seed + v * 4 + face) * .012 * (step === 0 || step === segments ? 1 : .25);
    const radius = inner + (outer - inner) * v;
    const depression = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * .045;
    shell.point(Math.cos(a) * radius, Math.sin(a) * radius, (face ? 1 : -1) * (depth / 2 - depression));
  }
  for (let side = 0; side < 2; side++) for (let r = 0; r < radial; r++) for (let step = 0; step < segments; step++) {
    const a = side * faceSize + r * row + step;
    if (side === 0) { shell.triangle(a, a + 1, a + row, .92); shell.triangle(a + 1, a + row + 1, a + row, .92); }
    else { shell.triangle(a, a + row, a + 1, .92); shell.triangle(a + 1, a + row, a + row + 1, .92); }
  }
  const perimeter: number[] = [];
  for (let step = 0; step <= segments; step++) perimeter.push(step);
  for (let r = 1; r <= radial; r++) perimeter.push(r * row + segments);
  for (let step = segments - 1; step >= 0; step--) perimeter.push(radial * row + step);
  for (let r = radial - 1; r > 0; r--) perimeter.push(r * row);
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    shell.triangle(b, a, a + faceSize, i % 5 ? .82 : 1.08); shell.triangle(b, a + faceSize, b + faceSize, i % 5 ? .82 : 1.08);
  }
  return shell.geometry(seed);
}

/** Ground origin, +Y up. Arch lies in XY; fallen column's long axis is Z. */
export function ruinGeometry(kind: RuinKind, seed = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (kind === 'column-stump') parts.push(flutedDrum(.43, 1.35 + Math.sin(seed) * .18, seed, true));
  if (kind === 'fallen-column') {
    const drum = flutedDrum(.46, 2.0 + Math.sin(seed) * .18, seed, false);
    drum.rotateX(Math.PI / 2 - .16); drum.rotateZ(.055); parts.push(drum);
    const brokenCollar = voussoir(.08, 1.95, .39, .58, .2, seed + 1);
    brokenCollar.rotateX(Math.PI / 2); brokenCollar.rotateY(.3); brokenCollar.translate(.62, -.08, .5); parts.push(brokenCollar);
  }
  if (kind === 'arch-remnant') {
    const leg = flutedDrum(.31, 1.05, seed, true); leg.translate(-1.25, 0, 0); parts.push(leg);
    for (let wedge = 0; wedge < 7; wedge++) {
      const high = Math.PI - wedge * .22, low = high - .207;
      const g = voussoir(low, high, 1.02, 1.49 + Math.sin(seed + wedge) * .035, .58 + Math.sin(wedge * 1.7 + seed) * .045, seed + wedge);
      g.translate(0, 1.02, 0); parts.push(g);
    }
    // A narrow second stone course supplies carved depth along the old arch.
    for (let wedge = 0; wedge < 5; wedge++) {
      const high = Math.PI - wedge * .26;
      const g = voussoir(high - .24, high, 1.5, 1.64, .13, seed + 20 + wedge); g.translate(0, 1.02, -.29); parts.push(g);
    }
  }
  const geometry = mergeGeometries(parts, false)!; parts.forEach(part => part.dispose());
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.userData.ruinKind = kind;
  return geometry;
}

/** Caller owns geometry; material/maps are borrowed and never cloned/disposed. */
export function createArchitecturalRemnant(kind: RuinKind, material: THREE.Material, seed = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(ruinGeometry(kind, seed), material); mesh.castShadow = mesh.receiveShadow = true; return mesh;
}
