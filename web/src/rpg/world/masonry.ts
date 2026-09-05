import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

/** Unequal beveled corners produce real chips and planar fractured faces.
 * Each ashlar is built once, then merged into the existing static room batches. */
export function masonryGeometry(width: number, height: number, depth: number, random: () => number): BufferGeometry {
  const points: Vector3[] = [], smallest = Math.min(width, height, depth);
  const damagedCorner = Math.floor(random() * 8);
  let corner = 0;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const edge = smallest * (corner++ === damagedCorner ? .25 + random() * .12 : .07 + random() * .075);
    const px = x * (width / 2 + (random() - .5) * .05);
    const py = y * (height / 2 + (random() - .5) * .035);
    const pz = z * (depth / 2 + (random() - .5) * .05);
    points.push(new Vector3(px - x * edge, py, pz), new Vector3(px, py - y * edge, pz), new Vector3(px, py, pz - z * edge));
  }
  const hull = new ConvexGeometry(points), source = hull.getAttribute('position');
  const surface: number[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), center = new Vector3(), normal = new Vector3();
  for (let i = 0; i < source.count; i += 3) {
    a.fromBufferAttribute(source, i); b.fromBufferAttribute(source, i + 1); c.fromBufferAttribute(source, i + 2);
    normal.crossVectors(b.clone().sub(a), c.clone().sub(a));
    // Keep small edge chips intact; broad faces gain real shallow depressions.
    // Shared boundary vertices never move, so neighboring facets remain closed.
    if (normal.length() < smallest * smallest * .2) {
      for (const point of [a, b, c]) surface.push(point.x, point.y, point.z);
      continue;
    }
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const variation = .5 + .5 * Math.sin(center.x * 17.1 + center.y * 39.3 + center.z * 23.7);
    center.addScaledVector(normal.normalize(), -smallest * (.025 + variation * .065));
    for (const triangle of [[a, b, center], [b, c, center], [c, a, center]]) {
      for (const point of triangle) surface.push(point.x, point.y, point.z);
    }
  }
  hull.dispose();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(surface, 3));
  geometry.computeVertexNormals();
  projectStoneUV(geometry, random() * 3, random() * 3);
  return geometry;
}

/** The same grain scale on a small chip, a long stair, and a large tomb slab. */
export function projectStoneUV(geometry: BufferGeometry, u = 0, v = 0): void {
  const uv: number[] = [], pos = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
    const horizontal = ny >= Math.max(nx, nz);
    uv.push((!horizontal && nx > nz ? pos.getZ(i) : pos.getX(i)) / 1.7 + u, (horizontal ? pos.getZ(i) : pos.getY(i)) / 1.7 + v);
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
}
