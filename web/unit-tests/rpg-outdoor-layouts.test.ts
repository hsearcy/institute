import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { getRoomLayout, enemyPositions, enemyScreenEnvelope, ENEMY_FOOTPRINT_RADIUS, MIN_ENEMY_SPACING } from '../src/rpg/world/roomLayout';
import { heroDoorwayRoute } from '../src/rpg/world/heroLocomotion';

const regions = ['mosswood', 'tidebreak', 'old-quarry', 'kingsgarden'];

test('Outdoor areas each have six distinct encounters and no interior room names', () => {
  const ids = regions.flatMap(region => Array.from({ length: 6 }, (_, index) => getRoomLayout(index, region).id));
  assert.equal(new Set(ids).size, 24);
  for (const region of regions) {
    assert.notDeepEqual(enemyPositions(0, 10, region), enemyPositions(0, 10));
    for (let index = 0; index < 6; index++) {
      const room = getRoomLayout(index, region);
      assert(room.id.startsWith(region));
      assert.equal(room.wallHeight, 0);
      assert.equal(room.heroZ, 1.4);
    }
  }
});

for (const region of regions) for (let index = 0; index < 6; index++) {
  test(`${region} encounter ${index}: all ten actors fit, remain readable, and have a safe arrival route`, () => {
    const room = getRoomLayout(index, region), positions = enemyPositions(index, 10, region), r = ENEMY_FOOTPRINT_RADIUS;
    assert.equal(positions.length, 10);
    for (const [i, point] of positions.entries()) {
      assert(point.x - r >= room.walkable.minX && point.x + r <= room.walkable.maxX);
      assert(point.z - r >= room.walkable.minZ && point.z + r <= room.walkable.maxZ);
      const lane = room.heroPath;
      assert(Math.hypot(Math.max(lane.minX - point.x, 0, point.x - lane.maxX), Math.max(lane.minZ - point.z, 0, point.z - lane.maxZ)) >= r);
      assert(Math.hypot(point.x - room.heroX, point.z - room.heroZ) >= room.heroClearance + r);
      for (const mark of room.landmarks) assert(Math.hypot(point.x - mark.x, point.z - mark.z) >= mark.radius + r);
      for (const [j, other] of positions.entries()) if (j > i) {
        assert(Math.hypot(point.x - other.x, point.z - other.z) >= MIN_ENEMY_SPACING);
        const a = enemyScreenEnvelope(point, i, index), b = enemyScreenEnvelope(other, j, index);
        assert(Math.abs(a.x - b.x) >= a.rx + b.rx + .18 || Math.abs(a.y - b.y) >= a.ry + b.ry + .12);
      }
    }
    for (const count of [0, 1, 4, 8, 10]) assert.deepEqual(enemyPositions(index, count, region), positions.slice(0, count));
    if (!index) return;
    const prior = getRoomLayout(index - 1, region), route = heroDoorwayRoute(index - 1, index, region);
    assert(route.every(point => point.x === prior.doorX));
    const start = route[1]!;
    for (let step = 0; step <= 100; step++) {
      const t = step / 100, x = start.x + (room.heroX - start.x) * t;
      const z = start.z + 20 * index + (room.heroZ - start.z - 20 * index) * t;
      assert(x >= room.heroPath.minX && x <= room.heroPath.maxX && z >= room.heroPath.minZ && z <= room.heroPath.maxZ);
    }
  });
}

test('Unknown and legacy areas retain the original dungeon layout', () => {
  for (const region of ['ruins', 'unknown', '__proto__', 'constructor']) for (let index = 0; index < 6; index++) {
    assert.deepEqual(getRoomLayout(index, region), getRoomLayout(index));
    assert.deepEqual(enemyPositions(index, 10, region), enemyPositions(index, 10));
  }
});
