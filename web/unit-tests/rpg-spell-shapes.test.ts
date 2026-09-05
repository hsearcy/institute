import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Vector3, type BufferGeometry } from 'three';
import { phoenixTailGeometry, phoenixWingGeometry, stormFilamentsGeometry } from '../src/rpg/world/spellShapes';
import { phoenixFeatherMaterial, stormWispMaterial } from '../src/rpg/world/materials';

function checkRibbons(geometry: BufferGeometry, expectedComponents: number): void {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv'), phase = geometry.getAttribute('phase'), index = geometry.getIndex()!;
  assert(index, 'Effects must retain indexed geometry');
  for (const attribute of [position, normal, uv, phase]) {
    assert.equal(attribute.count, position.count, 'Shader attributes must cover every merged vertex');
    assert(Array.from(attribute.array).every(Number.isFinite), 'Ribbon data must remain finite');
  }
  assert(index.count / 3 < 1000, 'One merged effect must remain below 1,000 triangles');
  assert.equal(geometry.groups.length, 0, 'Ribbon merging must not create one draw group per feather');
  const neighbors = Array.from({ length: position.count }, () => new Set<number>());
  const edges = new Map<string, { from: number; to: number; uses: number; winding: number }>();
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    assert(ids.every(id => Number.isInteger(id) && id >= 0 && id < position.count));
    const [a, b, c] = ids.map(id => new Vector3().fromBufferAttribute(position, id));
    assert(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-14, 'A collapsed triangle can produce unstable normals');
    assert(ids.every(id => phase.getX(id) === phase.getX(ids[0])), 'A triangle must not bridge independently animated feathers');
    for (let j = 0; j < 3; j++) {
      const from = ids[j], to = ids[(j + 1) % 3], key = [from, to].sort((x, y) => x - y).join(':');
      const edge = edges.get(key) ?? { from, to, uses: 0, winding: 0 };
      edge.uses++; edge.winding += from < to ? 1 : -1; edges.set(key, edge);
      neighbors[from].add(to); neighbors[to].add(from);
    }
  }
  const visited = new Set<number>();
  let components = 0;
  for (let start = 0; start < position.count; start++) {
    assert(new Vector3().fromBufferAttribute(normal, start).lengthSq() > .99, 'Surface normals must survive merging');
    assert(uv.getX(start) >= 0 && uv.getX(start) <= 1 && uv.getY(start) >= 0 && uv.getY(start) <= 1);
    assert(geometry.boundingSphere!.center.distanceTo(new Vector3().fromBufferAttribute(position, start)) <= geometry.boundingSphere!.radius + 1e-6,
      'CPU bounds must contain every authored vertex');
    if (visited.has(start)) continue;
    components++;
    const pending = [start];
    while (pending.length) {
      const vertex = pending.pop()!;
      if (visited.has(vertex)) continue;
      visited.add(vertex); pending.push(...neighbors[vertex]);
    }
  }
  assert.equal(components, expectedComponents, 'Feathers and cloud arcs must remain disconnected open strips');
  const boundaryDegree = new Map<number, number>();
  for (const edge of edges.values()) {
    assert(edge.uses <= 2, 'Ribbons must not contain overlapping non-manifold faces');
    if (edge.uses === 2) assert.equal(edge.winding, 0, 'Adjacent ribbon triangles must agree on winding');
    else for (const vertex of [edge.from, edge.to]) boundaryDegree.set(vertex, (boundaryDegree.get(vertex) ?? 0) + 1);
  }
  assert(boundaryDegree.size > 0, 'Effect shapes are open ribbons, not closed solid volumes');
  assert([...boundaryDegree.values()].every(degree => degree === 2), 'Each open ribbon must have a continuous boundary');
}

test('Phoenix feathers retain separate, nondegenerate curved surfaces and shader attributes', () => {
  for (const side of [-1, 1]) {
    const wing = phoenixWingGeometry(side);
    try {
      checkRibbons(wing, 11);
      const bounds = wing.boundingBox!;
      assert(bounds.max.y - bounds.min.y > .8, 'A wing must have visible three-dimensional curvature');
      assert(side === 1 ? bounds.min.x > 0 : bounds.max.x < 0, 'Wing geometry must stay on its assigned side of the rider');
    } finally { wing.dispose(); }
  }
  const tail = phoenixTailGeometry();
  try { checkRibbons(tail, 4); } finally { tail.dispose(); }
});

test('Storm clouds and charged filaments remain valid for both actual spell orientations', () => {
  for (const [radius, height, horizontal] of [[7.5, 2.9, true], [5.5, 8, false]] as const) {
    for (let layer = 0; layer < 3; layer++) {
      const geometry = stormFilamentsGeometry(radius * (layer === 1 ? .82 : 1), height, horizontal, 1.7 + layer * 4.1, layer !== 2);
      try { checkRibbons(geometry, 8); } finally { geometry.dispose(); }
    }
  }
});

test('Repeated casts own independent geometry buffers with deterministic authored shapes', () => {
  for (const create of [() => phoenixWingGeometry(1), phoenixTailGeometry, () => stormFilamentsGeometry(5.5, 8, false, 1.7)]) {
    const first = create(), second = create();
    try {
      for (const name of ['position', 'normal', 'uv', 'phase']) {
        assert.notEqual(first.getAttribute(name).array, second.getAttribute(name).array);
        assert.deepEqual(first.getAttribute(name).array, second.getAttribute(name).array);
      }
      const original = second.getAttribute('position').getX(0);
      first.getAttribute('position').setX(0, original + 100);
      first.dispose();
      assert.equal(second.getAttribute('position').getX(0), original, 'Animating or disposing one cast must not corrupt another');
    } finally { second.dispose(); }
  }
});

test('Culling bounds contain maximum shader flutter, including the smoky Phoenix tail', () => {
  const shapes = [
    { geometry: phoenixWingGeometry(-1), flutter: .055 },
    { geometry: phoenixWingGeometry(1), flutter: .055 },
    { geometry: phoenixTailGeometry(), flutter: .09 },
    { geometry: stormFilamentsGeometry(7.5, 2.9, true, 1.7), flutter: .09 },
    { geometry: stormFilamentsGeometry(5.5, 8, false, 5.8), flutter: .09 },
  ];
  for (const { geometry, flutter } of shapes) {
    try {
      const position = geometry.getAttribute('position');
      for (let vertex = 0; vertex < position.count; vertex++) for (const direction of [-1, 1]) {
        const point = new Vector3().fromBufferAttribute(position, vertex);
        point.y += direction * flutter;
        assert(geometry.boundingBox!.containsPoint(point), 'Shader-displaced vertices must remain inside box bounds');
        assert(geometry.boundingSphere!.center.distanceTo(point) <= geometry.boundingSphere!.radius + 1e-6,
          'Shader flutter must remain visible at a frustum edge');
      }
    } finally { geometry.dispose(); }
  }
});

test('Additive ribbons use one pass while absorbing smoke preserves back/front ordering', () => {
  const flame = phoenixFeatherMaterial(), charged = stormWispMaterial(0xa9bdff, true), cloud = stormWispMaterial(0x7787a4);
  try {
    assert.equal(flame.forceSinglePass, true);
    assert.equal(charged.forceSinglePass, true);
    assert.equal(cloud.forceSinglePass, false);
  } finally { flame.dispose(); charged.dispose(); cloud.dispose(); }
});
