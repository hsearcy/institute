import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Vector3 } from 'three';
import { ruinGeometry, type RuinKind } from '../src/rpg/world/ruins';

const kinds: RuinKind[] = ['column-stump', 'fallen-column', 'arch-remnant'];
test('Architectural fractures are closed, consistently wound solids with finite surface UVs', () => {
  for (const kind of kinds) for (let seed = 1; seed <= 8; seed++) {
    const geometry = ruinGeometry(kind, seed);
    try {
      const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), normals = geometry.getAttribute('normal');
      assert([...positions.array, ...uv.array, ...normals.array].every(Number.isFinite));
      const edges = new Map<string, number[]>();
      let volume = 0;
      for (let i = 0; i < positions.count; i += 3) {
        const points = [0, 1, 2].map(corner => new Vector3().fromBufferAttribute(positions, i + corner));
        const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
        assert(normal.lengthSq() > 1e-15, `${kind} seed${seed}: collapsed fracture face`);
        volume += points[0].dot(points[1].clone().cross(points[2])) / 6;
        const keys = points.map(point => point.toArray().join(','));
        for (let corner = 0; corner < 3; corner++) {
          const from = keys[corner], to = keys[(corner + 1) % 3], edge = [from, to].sort().join('|');
          if (!edges.has(edge)) edges.set(edge, []);
          edges.get(edge)!.push(from < to ? 1 : -1);
        }
      }
      for (const directions of edges.values()) {
        assert.equal(directions.length, 2, `${kind} seed${seed}: fracture leaves an open seam`);
        assert.equal(directions[0] + directions[1], 0, `${kind} seed${seed}: adjacent faces disagree on winding`);
      }
      assert(volume > .08, `${kind}: inverted solid`);
      assert(Math.abs(geometry.boundingBox!.min.y) < .00001, 'Remnants must rest on their ground origin');
      assert(positions.count / 3 < 3500, 'A remnant must stay within the geometry budget');
    } finally { geometry.dispose(); }
  }
});
