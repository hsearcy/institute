import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Vector3 } from 'three';
import { crystalClusterGeometry, crystalClusterMaterial } from '../src/rpg/world/crystals';

const seeds = [-81.3, -.1, 0, .1, 1, 3, 7, 42, 991.2];

test('Mineral clusters have finite lighting/UVs and each shell is closed with outward winding', () => {
  for (const seed of seeds) {
    const geometry = crystalClusterGeometry(seed);
    try {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      for (const attribute of Object.values(geometry.attributes)) assert([...attribute.array].every(Number.isFinite));
      const ids = new Map<string, number>(), adjacency = new Map<number, Set<number>>();
      const edges = new Map<string, number[]>(), faces: { vertex: number; volume: number }[] = [];
      const point = (i: number) => new Vector3().fromBufferAttribute(p, i);
      const vertex = (i: number) => {
        const key = `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
        if (!ids.has(key)) ids.set(key, ids.size);
        return ids.get(key)!;
      };
      for (let i = 0; i < p.count; i += 3) {
        const a = point(i), b = point(i + 1), c = point(i + 2), normal = b.clone().sub(a).cross(c.clone().sub(a));
        assert(normal.length() > 1e-6, 'Facets must have nonzero area');
        normal.normalize();
        for (let j = 0; j < 3; j++) {
          const actual = new Vector3().fromBufferAttribute(n, i + j);
          assert(Math.abs(actual.length() - 1) < 1e-5 && actual.dot(normal) > .9999, 'Flat normals must match geometric winding');
        }
        const uvArea = (uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) - (uv.getY(i + 1) - uv.getY(i)) * (uv.getX(i + 2) - uv.getX(i));
        assert(Math.abs(uvArea) > 1e-7, 'Facets need usable projected UV area');
        const vertices = [vertex(i), vertex(i + 1), vertex(i + 2)];
        faces.push({ vertex: vertices[0], volume: a.dot(b.clone().cross(c)) / 6 });
        for (let j = 0; j < 3; j++) {
          const from = vertices[j], to = vertices[(j + 1) % 3], key = `${Math.min(from, to)}:${Math.max(from, to)}`;
          if (!edges.has(key)) edges.set(key, []);
          edges.get(key)!.push(from < to ? 1 : -1);
          if (!adjacency.has(from)) adjacency.set(from, new Set());
          adjacency.get(from)!.add(to);
        }
      }
      for (const directions of edges.values()) assert(directions.length === 2 && directions[0] + directions[1] === 0, 'Every edge needs exactly two oppositely wound faces');
      const visited = new Set<number>();
      let shells = 0;
      for (const first of ids.values()) {
        if (visited.has(first)) continue;
        const component = new Set<number>(), pending = [first];
        while (pending.length) {
          const v = pending.pop()!; if (component.has(v)) continue;
          component.add(v); visited.add(v); pending.push(...adjacency.get(v)!);
        }
        const enclosed = faces.filter(face => component.has(face.vertex)).reduce((total, face) => total + face.volume, 0);
        assert(enclosed > .001, 'Every disconnected shard must enclose positive volume, not be an inverted or open shell');
        shells++;
      }
      assert(shells > 1, 'The outline should be a cluster of mineral shells');
      assert.equal(geometry.groups.length, 0, 'The cluster uses one material draw');
    } finally { geometry.dispose(); }
  }
});

test('Seeded mineral silhouettes stay grounded within their placement allowance', () => {
  const silhouettes = new Set<string>();
  for (const seed of seeds) {
    const geometry = crystalClusterGeometry(seed), again = crystalClusterGeometry(seed);
    try {
      const p = geometry.getAttribute('position'), bounds = geometry.boundingBox!;
      assert.equal(bounds.min.y, 0);
      assert(bounds.max.y >= 1.1 && bounds.max.y <= 1.45);
      assert(Math.abs(bounds.min.x + bounds.max.x) < 1e-6 && Math.abs(bounds.min.z + bounds.max.z) < 1e-6);
      for (let i = 0; i < p.count; i++) assert(Math.hypot(p.getX(i), p.getZ(i)) <= .410001);
      const supports = Array.from({ length: 12 }, (_, direction) => {
        const angle = direction * Math.PI / 6;
        let furthest = -Infinity;
        for (let i = 0; i < p.count; i++) furthest = Math.max(furthest, p.getX(i) * Math.sin(angle) + p.getZ(i) * Math.cos(angle));
        return furthest.toFixed(3);
      });
      silhouettes.add(supports.join(','));
      assert.deepEqual(p.array, again.getAttribute('position').array);
    } finally { geometry.dispose(); again.dispose(); }
  }
  assert.equal(silhouettes.size, seeds.length, 'Seeds must change visible outlines, not just surface colors');
});

test('Crystal material ownership is independent and avoids transparent sorting or neon emission', () => {
  const first = crystalClusterMaterial(), second = crystalClusterMaterial();
  try {
    assert.notEqual(first, second);
    assert(first.vertexColors && first.depthWrite && !first.transparent);
    assert(first.emissiveIntensity > 0 && first.emissiveIntensity < .2);
    assert(first.roughness >= .4 && first.roughness < .8);
    first.color.setHex(0x193544);
    assert.equal(second.color.getHex(), 0xffffff, 'Region tinting one material cannot affect another world');
    assert(!first.map && !first.normalMap && !first.emissiveMap, 'No hidden texture ownership');
  } finally { first.dispose(); second.dispose(); }
});
