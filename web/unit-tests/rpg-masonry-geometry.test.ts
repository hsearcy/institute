import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Vector3 } from 'three';
import { masonryGeometry } from '../src/rpg/world/masonry';

function randomFor(seed: number) {
  let state = seed;
  return () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
}
const sizes = [[.95, .53, 1.11], [1.08, .54, .95], [1.17, .47, 1.17], [.44, .56, .97], [1.1, .63, 2.05]];

test('Inset masonry keeps outward winding, positive stone volume, and usable relief UVs', () => {
  for (const [width, height, depth] of sizes) for (let seed = 1; seed <= 16; seed++) {
    const geometry = masonryGeometry(width, height, depth, randomFor(seed));
    try {
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      assert.equal(positions.count % 3, 0);
      assert.equal(normals.count, positions.count);
      assert.equal(uv.count, positions.count);
      assert([...positions.array, ...normals.array, ...uv.array].every(Number.isFinite));
      const point = (index: number) => new Vector3().fromBufferAttribute(positions, index);
      let signedVolume = 0;
      for (let index = 0; index < positions.count; index += 3) {
        const a = point(index), b = point(index + 1), c = point(index + 2);
        const face = b.clone().sub(a).cross(c.clone().sub(a));
        assert(face.lengthSq() > 1e-15, 'Inset faces must not introduce zero-area triangles');
        // A concave face can legitimately point toward the stone's origin.
        // Opposite manifold edge directions (below) plus positive signed volume
        // establish consistent outward orientation without assuming convexity.
        signedVolume += a.dot(b.clone().cross(c)) / 6;
        const expected = face.normalize();
        for (let corner = 0; corner < 3; corner++) {
          const actual = new Vector3().fromBufferAttribute(normals, index + corner);
          assert(Math.abs(actual.length() - 1) < 1e-5);
          assert(actual.dot(expected) > .9999, 'Lighting normals must agree with the inset surface');
        }
        const du1 = uv.getX(index + 1) - uv.getX(index), dv1 = uv.getY(index + 1) - uv.getY(index);
        const du2 = uv.getX(index + 2) - uv.getX(index), dv2 = uv.getY(index + 2) - uv.getY(index);
        assert(Math.abs(du1 * dv2 - du2 * dv1) > 1e-10, 'Face projections must retain area for bump mapping');
      }
      assert(signedVolume > width * height * depth * .3, 'Insets must preserve a solid stone, not an inverted or collapsed shell');
      assert(signedVolume < (width + .05) * (height + .035) * (depth + .05), 'Insets must remain inside the authored outer bounds');
    } finally { geometry.dispose(); }
  }
});

test('Masonry depressions preserve a single closed manifold across every original face boundary', () => {
  for (const [width, height, depth] of sizes) for (let seed = 1; seed <= 16; seed++) {
    const geometry = masonryGeometry(width, height, depth, randomFor(seed));
    try {
      const positions = geometry.getAttribute('position'), vertexIds = new Map<string, number>();
      const edges = new Map<string, number[]>(), neighbors = new Map<number, Set<number>>();
      const vertex = (index: number) => {
        const key = `${positions.getX(index)},${positions.getY(index)},${positions.getZ(index)}`;
        if (!vertexIds.has(key)) vertexIds.set(key, vertexIds.size);
        return vertexIds.get(key)!;
      };
      for (let index = 0; index < positions.count; index += 3) {
        const face = [vertex(index), vertex(index + 1), vertex(index + 2)];
        assert.equal(new Set(face).size, 3, 'A triangle cannot reuse a vertex');
        for (let corner = 0; corner < 3; corner++) {
          const from = face[corner], to = face[(corner + 1) % 3], key = `${Math.min(from, to)}:${Math.max(from, to)}`;
          if (!edges.has(key)) edges.set(key, []);
          edges.get(key)!.push(from < to ? 1 : -1);
          if (!neighbors.has(from)) neighbors.set(from, new Set());
          neighbors.get(from)!.add(to);
        }
      }
      for (const [edge, directions] of edges) {
        assert.equal(directions.length, 2, `Seed${seed}: edge${edge} leaves a crack or nonmanifold seam`);
        assert.equal(directions[0] + directions[1], 0, 'Neighboring faces must traverse their shared edge oppositely');
      }
      const visited = new Set<number>(), pending = [0];
      while (pending.length) {
        const current = pending.pop()!;
        if (visited.has(current)) continue;
        visited.add(current); pending.push(...(neighbors.get(current) ?? []));
      }
      assert.equal(visited.size, vertexIds.size, 'Inset fragments must remain connected to the main stone');
      assert.equal(vertexIds.size - edges.size + positions.count / 3, 2, 'Stone must retain a closed shell without handles or holes');
    } finally { geometry.dispose(); }
  }
});
