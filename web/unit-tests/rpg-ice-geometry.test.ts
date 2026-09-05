import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Vector3 } from 'three';
import { iceShardGeometry } from '../src/rpg/world/ice';

const dimensions = [{ radius: .12, height: 2.4 }, { radius: .7, height: .8 }, { radius: .45, height: 4.2 }];
const seeds = [-127.3, -.1, 0, .33, 1, 7.4, 42, 991.12];

test('Ice shards form finite, nondegenerate, outward-facing closed surfaces', () => {
  for (const { radius, height } of dimensions) for (const seed of seeds) {
    const geometry = iceShardGeometry(radius, height, seed);
    try {
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
      assert.equal(positions.count % 3, 0, 'Each face must be a complete triangle');
      assert.equal(normals.count, positions.count);
      assert([...positions.array, ...normals.array].every(Number.isFinite));
      assert(geometry.boundingSphere && Number.isFinite(geometry.boundingSphere.radius) && geometry.boundingSphere.radius > 0);
      const point = (index: number) => new Vector3().fromBufferAttribute(positions, index);
      // Normalize dimensions for robust geometric checks on both thin and broad shards.
      const normalized = (index: number) => point(index).divide(new Vector3(radius, height, radius));
      const interior = new Vector3(.08, .35, 0);
      let volume = 0;
      for (let index = 0; index < positions.count; index += 3) {
        const a = normalized(index), b = normalized(index + 1), c = normalized(index + 2);
        const faceNormal = b.clone().sub(a).cross(c.clone().sub(a));
        assert(faceNormal.length() > 1e-5, `Degenerate face for seed${seed}`);
        const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        assert(faceNormal.dot(center.sub(interior)) > 1e-6, `Inward-facing triangle for seed${seed}`);
        volume += a.dot(b.clone().cross(c)) / 6;
        const expectedNormal = point(index + 1).sub(point(index)).cross(point(index + 2).sub(point(index))).normalize();
        for (let corner = 0; corner < 3; corner++) {
          const actualNormal = new Vector3().fromBufferAttribute(normals, index + corner);
          assert(Math.abs(actualNormal.length() - 1) < 1e-5, 'Normals must be normalized');
          assert(actualNormal.dot(expectedNormal) > .9999, 'Lighting normals must agree with geometric winding');
        }
      }
      assert(volume > .2 && volume < 3, 'Shard must enclose a substantial positive volume');
    } finally { geometry.dispose(); }
  }
});

test('Welded ice faces have no holes, duplicate boundary edges, or disconnected shells', () => {
  for (const seed of seeds) {
    const geometry = iceShardGeometry(.37, 2.8, seed);
    try {
      const positions = geometry.getAttribute('position');
      const vertexIds = new Map<string, number>();
      const edges = new Map<string, { directions: number[]; vertices: [number, number] }>();
      const adjacency = new Map<number, Set<number>>();
      const vertex = (index: number) => {
        // Construction duplicates the same coordinates for flat-shaded faces.
        const key = `${positions.getX(index)},${positions.getY(index)},${positions.getZ(index)}`;
        if (!vertexIds.has(key)) vertexIds.set(key, vertexIds.size);
        return vertexIds.get(key)!;
      };
      for (let index = 0; index < positions.count; index += 3) {
        const face = [vertex(index), vertex(index + 1), vertex(index + 2)];
        assert.equal(new Set(face).size, 3, 'No face may repeat a welded vertex');
        for (let corner = 0; corner < 3; corner++) {
          const from = face[corner], to = face[(corner + 1) % 3];
          const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
          if (!edges.has(key)) edges.set(key, { directions: [], vertices: [from, to] });
          edges.get(key)!.directions.push(from < to ? 1 : -1);
          if (!adjacency.has(from)) adjacency.set(from, new Set());
          adjacency.get(from)!.add(to);
        }
      }
      for (const edge of edges.values()) {
        assert.equal(edge.directions.length, 2, `Edge${edge.vertices} must belong to exactly two faces`);
        assert.equal(edge.directions[0] + edge.directions[1], 0, 'Shared edges must have opposite winding');
      }
      const visited = new Set<number>(), pending = [0];
      while (pending.length) {
        const current = pending.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        pending.push(...(adjacency.get(current) ?? []));
      }
      assert.equal(visited.size, vertexIds.size, 'All surfaces must join one connected shard');
      assert.equal(vertexIds.size - edges.size + positions.count / 3, 2, 'Closed shard must have sphere topology');
    } finally { geometry.dispose(); }
  }
});

test('Ice shards are grounded, reach the requested height, and stay inside useful placement bounds', () => {
  for (const { radius, height } of dimensions) for (const seed of seeds) {
    const geometry = iceShardGeometry(radius, height, seed);
    try {
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      assert.equal(bounds.min.y, 0, 'Base must sit directly on the floor');
      assert(Math.abs(bounds.max.y - height) < height * 1e-6, 'Requested height must match the tip');
      assert(bounds.min.x < 0 && bounds.max.x > 0 && bounds.min.z < 0 && bounds.max.z > 0, 'Shard must straddle its placement origin');
      const positions = geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        assert(Math.hypot(positions.getX(index), positions.getZ(index)) <= radius * 1.22, 'Horizontal footprint must remain within the cluster placement allowance');
      }
    } finally { geometry.dispose(); }
  }
});

test('Seeds reproducibly vary actual outlines rather than only surface colors', () => {
  const outlines = seeds.map(seed => {
    const geometry = iceShardGeometry(.5, 2, seed);
    try {
      const positions = geometry.getAttribute('position');
      // Support distances sample the horizontal silhouette from several viewpoints.
      return Array.from({ length: 16 }, (_, direction) => {
        const angle = direction * Math.PI / 8;
        let maximum = -Infinity;
        for (let index = 0; index < positions.count; index++) maximum = Math.max(maximum, positions.getX(index) * Math.cos(angle) + positions.getZ(index) * Math.sin(angle));
        return maximum;
      });
    } finally { geometry.dispose(); }
  });
  for (let first = 0; first < outlines.length; first++) for (let second = first + 1; second < outlines.length; second++) {
    const difference = Math.max(...outlines[first].map((value, index) => Math.abs(value - outlines[second][index])));
    assert(difference > .015, 'Distinct seeds need a visible geometric outline difference');
  }
  const first = iceShardGeometry(.5, 2, 42), again = iceShardGeometry(.5, 2, 42);
  try { assert.deepEqual(first.getAttribute('position').array, again.getAttribute('position').array); }
  finally { first.dispose(); again.dispose(); }
});
