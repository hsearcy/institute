import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { enemyPositions, enemyScreenEnvelope, MAX_ROOM_ENEMIES, getRoomLayout, isCrossingChasm, boundsIntersectCrossingChasm, roomFloorPatches, ENEMY_FOOTPRINT_RADIUS, MIN_ENEMY_SPACING, type RoomBounds } from '../src/rpg/world/roomLayout';

for (let room = 0; room < 6; room++) {
  test(`${getRoomLayout(room).id}: ten-enemy formation respects floor occupancy and travel clearance`, () => {
    const layout = getRoomLayout(room), positions = enemyPositions(room, MAX_ROOM_ENEMIES), radius = ENEMY_FOOTPRINT_RADIUS;
    assert.equal(positions.length, 10);
    for (const [index, point] of positions.entries()) {
      assert(Number.isFinite(point.x) && Number.isFinite(point.z));
      // Check the whole circular footprint, not just whether its center is on the floor.
      assert(point.x - radius >= layout.walkable.minX && point.x + radius <= layout.walkable.maxX, `enemy${index} crosses side boundary`);
      assert(point.z - radius >= layout.walkable.minZ && point.z + radius <= layout.walkable.maxZ, `enemy${index} crosses end boundary`);
      const closestX = Math.max(layout.heroPath.minX, Math.min(point.x, layout.heroPath.maxX));
      const closestZ = Math.max(layout.heroPath.minZ, Math.min(point.z, layout.heroPath.maxZ));
      assert(Math.hypot(point.x - closestX, point.z - closestZ) >= radius, `enemy${index} enters incoming hero lane`);
      assert(Math.hypot(point.x - layout.heroX, point.z - layout.heroZ) >= radius + layout.heroClearance, `enemy${index} overlaps hero arrival`);
      for (const landmark of layout.landmarks) {
        assert(Math.hypot(point.x - landmark.x, point.z - landmark.z) >= radius + landmark.radius, `enemy${index} intersects ${landmark.id}`);
      }
      for (const other of positions.slice(index + 1)) {
        assert(Math.hypot(point.x - other.x, point.z - other.z) >= MIN_ENEMY_SPACING, `enemy${index} has overlapping floor occupancy`);
      }
    }
  });

  test(`${getRoomLayout(room).id}: reloads and bounded count changes preserve actor positions`, () => {
    const full = enemyPositions(room, MAX_ROOM_ENEMIES);
    // Persistent health and retries must not rearrange the surviving actors.
    for (const count of [0, 1, 2, 6, 7, 8, 9, 10]) {
      assert.deepEqual(enemyPositions(room, count), full.slice(0, count));
    }
    // Asking for a different room in between must not affect seeded layout state.
    enemyPositions((room + 1) % 6, 10);
    assert.deepEqual(enemyPositions(room, MAX_ROOM_ENEMIES), full);
    const first = enemyPositions(room, 1);
    (first[0] as { x: number }).x = 1000;
    assert.deepEqual(enemyPositions(room, 1), full.slice(0, 1), 'Returned position objects must not be shared');
  });

  test(`${getRoomLayout(room).id}: projected silhouettes retain clear space at the ten-enemy cap`, () => {
    const bodies = enemyPositions(room, 10).map((point, index) => enemyScreenEnvelope(point, index, room));
    for (const [index, body] of bodies.entries()) for (const other of bodies.slice(index + 1)) {
      assert(Math.abs(body.x - other.x) >= body.rx + other.rx + .18
        || Math.abs(body.y - other.y) >= body.ry + other.ry + .12,
      `Enemy ${index} overlaps another actor in the isometric view`);
    }
  });
}

test('Six silhouettes expose distinct architecture and retain the agreed landmark coordinates', () => {
  const layouts = Array.from({ length: 6 }, (_, index) => getRoomLayout(index));
  assert.equal(new Set(layouts.map(layout => layout.id)).size, 6);
  assert.equal(new Set(layouts.map(layout => `${layout.sideWallX}/${layout.wallHeights.left}/${layout.wallHeights.back}/${layout.doorX}`)).size, 6);
  assert.equal(new Set(layouts.map((_, index) => JSON.stringify(enemyPositions(index, 10)))).size, 6);
  const crossing = layouts[3];
  assert.equal(crossing.heroX, 0);
  assert.equal(crossing.walkable.minX, -4.5);
  assert.equal(crossing.walkable.maxX, 4.5);
  assert.deepEqual(layouts[1].landmarks, [{ id: 'furnace', x: -7.6, z: -3, radius: 1.8 }]);
  assert.deepEqual(layouts[2].landmarks, [{ id: 'reliquary', x: -7.3, z: -3.7, radius: 1.6 }]);
  assert.deepEqual(layouts[4].landmarks, [{ id: 'west-crystals', x: -7.6, z: -2, radius: 1.6 }, { id: 'east-crystals', x: 7.6, z: -4, radius: 1.6 }]);
  assert.deepEqual(enemyPositions(5, 1), [{ x: 0, z: -4 }], 'Boss has a stable, collision-checked index0 anchor');
});

test('Presentation inputs are bounded and never produce nonfinite coordinates', () => {
  assert.deepEqual(enemyPositions(0, 500), enemyPositions(0, 10));
  assert.deepEqual(enemyPositions(0, 1.9), enemyPositions(0, 1));
  for (const count of [-5, 0, NaN, Infinity]) assert.deepEqual(enemyPositions(0, count), []);
  assert.equal(getRoomLayout(-1).id, 'gate');
  assert.equal(getRoomLayout(NaN).id, 'gate');
  assert.equal(getRoomLayout(20).id, 'boss-sanctum');
});

const floorBounds = (room: number) => roomFloorPatches(room).map(patch => ({
  minX: patch.x - patch.width / 2, maxX: patch.x + patch.width / 2,
  minZ: patch.z - patch.depth / 2, maxZ: patch.z + patch.depth / 2,
}));
const contains = (bounds: RoomBounds, x: number, z: number) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;

/** Partition along every patch edge. A cell's midpoint completely determines
 * coverage of its interior because all patches are axis-aligned rectangles. */
function assertFloorCoversRectangle(room: number, rectangle: RoomBounds): void {
  const patches = floorBounds(room);
  const xs = [...new Set([rectangle.minX, rectangle.maxX, ...patches.flatMap(patch => [patch.minX, patch.maxX]).filter(x => x > rectangle.minX && x < rectangle.maxX)])].sort((a, b) => a - b);
  const zs = [...new Set([rectangle.minZ, rectangle.maxZ, ...patches.flatMap(patch => [patch.minZ, patch.maxZ]).filter(z => z > rectangle.minZ && z < rectangle.maxZ)])].sort((a, b) => a - b);
  for (let x = 1; x < xs.length; x++) for (let z = 1; z < zs.length; z++) {
    const px = (xs[x - 1] + xs[x]) / 2, pz = (zs[z - 1] + zs[z]) / 2;
    assert(patches.some(patch => contains(patch, px, pz)), `room${room} has unsupported floor at ${px},${pz}`);
  }
}

test('Crossing floor tiling removes exactly two6.2×8 openings and has no overlapping patches', () => {
  const patches = floorBounds(3);
  const xs = [...new Set([-23, -11, -4.8, 4.8, 11, 23, ...patches.flatMap(patch => [patch.minX, patch.maxX])])].sort((a, b) => a - b);
  const zs = [...new Set([-10, -4, 4, 10, ...patches.flatMap(patch => [patch.minZ, patch.maxZ])])].sort((a, b) => a - b);
  for (const patch of patches) {
    assert(patch.minX >= -23 && patch.maxX <= 23 && patch.minZ >= -10 && patch.maxZ <= 10);
    assert(patch.maxX > patch.minX && patch.maxZ > patch.minZ);
  }
  for (let x = 1; x < xs.length; x++) for (let z = 1; z < zs.length; z++) {
    const px = (xs[x - 1] + xs[x]) / 2, pz = (zs[z - 1] + zs[z]) / 2;
    const opening = ((px > -11 && px < -4.8) || (px > 4.8 && px < 11)) && pz > -4 && pz < 4;
    assert.equal(patches.filter(patch => contains(patch, px, pz)).length, opening ? 0 : 1, `Unexpected floor tiling at ${px},${pz}`);
    assert.equal(isCrossingChasm(3, px, pz), opening, 'Decoration filter and actual missing floor must agree');
  }
  const area = roomFloorPatches(3).reduce((sum, patch) => sum + patch.width * patch.depth, 0);
  assert(Math.abs(area - (46 * 20 - 2 * 6.2 * 8)) < 1e-9);
  // The bridge and outer rims own the hole boundaries; no numerical hairline gaps.
  for (const x of [-11, -4.8, 4.8, 11]) for (const z of [-4, -2, 0, 2, 4]) {
    assert.equal(isCrossingChasm(3, x, z), false);
    assert(patches.some(patch => contains(patch, x, z)));
  }
  for (const room of [0, 1, 2, 4, 5]) {
    assertFloorCoversRectangle(room, { minX: -23, maxX: 23, minZ: -10, maxZ: room === 0 ? 30 : 10 });
    for (const x of [-8, 8]) assert.equal(isCrossingChasm(room, x, 0), false, 'Other rooms must retain solid floors');
  }
});

test('Every enemy footprint and full declared hero lane are supported by actual floor patches', () => {
  for (let room = 0; room < 6; room++) {
    const layout = getRoomLayout(room);
    assertFloorCoversRectangle(room, layout.heroPath);
    assertFloorCoversRectangle(room, {
      minX: layout.heroX - layout.heroClearance, maxX: layout.heroX + layout.heroClearance,
      minZ: layout.heroZ - layout.heroClearance, maxZ: layout.heroZ + layout.heroClearance,
    });
    for (const point of enemyPositions(room, MAX_ROOM_ENEMIES)) {
      // Supporting the full circumscribed square is stronger than sampling a circle.
      assertFloorCoversRectangle(room, { minX: point.x - ENEMY_FOOTPRINT_RADIUS, maxX: point.x + ENEMY_FOOTPRINT_RADIUS,
        minZ: point.z - ENEMY_FOOTPRINT_RADIUS, maxZ: point.z + ENEMY_FOOTPRINT_RADIUS });
    }
  }
});

test('The renderer straight-line arrival remains inside each room’s reserved incoming lane', () => {
  for (let room = 1; room < 6; room++) {
    const previous = getRoomLayout(room - 1), next = getRoomLayout(room);
    for (const x of [previous.heroX, previous.doorX, next.heroX]) {
      assert(contains(next.heroPath, x, 10), 'Lane must include both direct travel and an optional doorway waypoint');
    }
    for (let step = 0; step <= 100; step++) {
      const fraction = step / 100;
      const x = previous.heroX + (next.heroX - previous.heroX) * fraction;
      const z = previous.heroZ + 20 + (next.heroZ - previous.heroZ - 20) * fraction;
      if (z > 10) continue;
      assert(contains(next.heroPath, x, z), `${next.id} arrival at ${x},${z} escapes its reserved lane`);
    }
  }
});

test('Transformed scenery bounds cannot cover a chasm even when their centers are on land', () => {
  for (const bounds of [
    { minX: 4, maxX: 5.5, minZ: -1, maxZ: 1 }, // Center is on the bridge.
    { minX: -12.5, maxX: -10, minZ: -1, maxZ: 1 }, // Center is on the outer rim.
    { minX: 6, maxX: 9, minZ: 3.5, maxZ: 6.5 }, // Center is beyond the opening's end.
    { minX: -12, maxX: 12, minZ: -5, maxZ: 5 }, // A large sheet spans both openings.
  ]) {
    assert.equal(isCrossingChasm(3, (bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2), false);
    assert.equal(boundsIntersectCrossingChasm(3, bounds), true);
  }
  for (const side of [-1, 1]) {
    assert.equal(boundsIntersectCrossingChasm(3, { minX: side * 8 - .5, maxX: side * 8 + .5, minZ: -1, maxZ: 1 }), true, 'Bounds entirely within a hole intersect');
  }
});

test('Chasm bounds allow exact rim contact, reject tiny overlaps, and affect only the crossing', () => {
  const supported: RoomBounds[] = [
    { minX: -4.8, maxX: 4.8, minZ: -4, maxZ: 4 },
    { minX: -15, maxX: -11, minZ: -4, maxZ: 4 },
    { minX: 11, maxX: 15, minZ: -4, maxZ: 4 },
    { minX: -20, maxX: 20, minZ: 4, maxZ: 8 },
    { minX: -20, maxX: 20, minZ: -8, maxZ: -4 },
  ];
  for (const bounds of supported) assert.equal(boundsIntersectCrossingChasm(3, bounds), false, 'Touching a supported rim is not an overlap');
  assert.equal(boundsIntersectCrossingChasm(3, { minX: -4.8, maxX: 4.800001, minZ: -1, maxZ: 1 }), true);
  assert.equal(boundsIntersectCrossingChasm(3, { minX: -9, maxX: -6, minZ: 3.999999, maxZ: 8 }), true);
  for (const room of [0, 1, 2, 4, 5]) assert.equal(boundsIntersectCrossingChasm(room, { minX: -23, maxX: 23, minZ: -10, maxZ: 10 }), false);
});
