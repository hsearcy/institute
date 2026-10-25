import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Level, rectCenter, type Biome, type Rect } from '../src/rpg/world/levelGen';
import { MIN_ENEMY_SPACING, packPositions } from '../src/rpg/world/formation';

const BIOMES: Biome[] = ['vault', 'forest', 'coast', 'quarry', 'garden'];

/** Explores like a player: walks to an open exit, lets the level grow, repeats. */
function explore(seed: number, biome: Biome, steps = 14): Level {
  const level = new Level(seed, biome);
  let at = level.start;
  level.expandAround(at.x, at.z);
  for (let step = 0; step < steps; step++) {
    const exits = level.openExits;
    if (!exits.length) break;
    const target = exits[(seed + step * 7) % exits.length]!;
    const route = level.path(at, target);
    if (route.length) at = route[route.length - 1]!;
    level.expandAround(at.x, at.z);
  }
  return level;
}

const touching = (a: Rect, b: Rect) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
const overlapping = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

test('levels grow in every direction without overlap, and every area can be reached', () => {
  for (const biome of BIOMES) for (const seed of [1, 42, 977]) {
    const level = explore(seed, biome);
    assert.ok(level.areas.length >= 6, `${biome}/${seed}: only ${level.areas.length} areas`);
    const rects = [...level.areas.map(area => ({ rect: area.rect, owner: `a${area.id}` })), ...level.corridors.flatMap(corridor => corridor.rects.map(rect => ({ rect, owner: `c${corridor.id}` })))];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      assert.ok(!overlapping(rects[i]!.rect, rects[j]!.rect), `${biome}/${seed}: ${rects[i]!.owner} overlaps ${rects[j]!.owner}`);
    }
    // Every hallway joins its two areas.
    for (const corridor of level.corridors) {
      assert.ok(touching(corridor.rects[0]!, level.areas[corridor.from]!.rect) && touching(corridor.rects[corridor.rects.length - 1]!, level.areas[corridor.to]!.rect));
    }
    const start = level.start;
    // Treasuries wait behind sealed doors; rpg-locks.test.ts covers the closed doors.
    for (const door of level.doors) level.openDoor(door.id);
    for (const area of level.areas.slice(1)) {
      const goal = rectCenter(area.rect);
      const route = level.path(start, goal);
      assert.ok(route.length, `${biome}/${seed}: ${area.name} cannot be reached`);
      let from = start;
      for (const point of route) { assert.ok(level.clearLine(from, point), `${biome}/${seed}: a leg to ${area.name} crosses a wall`); from = point; }
    }
    const xs = level.areas.map(area => rectCenter(area.rect).x), zs = level.areas.map(area => rectCenter(area.rect).z);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 20 || Math.max(...zs) - Math.min(...zs) > 20, `${biome}/${seed}: the level does not spread`);
  }
}, 30_000);

test('walls stop the hero and features block their floor', () => {
  const level = explore(5, 'vault');
  const entry = level.areas[0]!.rect;
  assert.ok(level.walkable(level.start.x, level.start.z));
  assert.ok(!level.walkable(entry.maxX + .2, (entry.minZ + entry.maxZ) / 2 + 3.7) || level.openings(level.areas[0]!).some(opening => opening.side === 'east'));
  for (const area of level.areas) for (const feature of area.features) assert.ok(!level.walkable(feature.x, feature.z), `${feature.kind} in ${area.name}`);
});

test('every hall fits a full pack and a sanctum fits the guardian and its guard', () => {
  for (const biome of BIOMES) {
    const level = explore(11, biome, 10);
    const sanctum = level.growNearest(level.start.x, level.start.z, 'sanctum');
    assert.ok(sanctum, `${biome}: no room for a sanctum`);
    for (const area of level.areas.filter(area => area.kind !== 'entry' && area.kind !== 'treasury')) {
      const formation = packPositions(level, area, 10);
      assert.equal(formation.length, 10);
      for (const [i, point] of formation.entries()) {
        assert.ok(level.walkable(point.x, point.z, .48), `${biome}: ${area.name} body ${i} off the floor`);
        for (const other of formation.slice(0, i)) assert.ok(Math.hypot(point.x - other.x, point.z - other.z) >= MIN_ENEMY_SPACING - 1e-9);
      }
      if (area.kind === 'sanctum') {
        // The guardian waits on the far side from the arrival doorway.
        const center = rectCenter(area.rect), door = level.openings(area)[0]!;
        const doorAt = door.side === 'north' ? { x: 0, z: area.rect.minZ } : door.side === 'south' ? { x: 0, z: area.rect.maxZ } : door.side === 'east' ? { x: area.rect.maxX, z: 0 } : { x: area.rect.minX, z: 0 };
        const axis = door.side === 'north' || door.side === 'south' ? 'z' : 'x';
        assert.ok(Math.sign(formation[0]![axis] - center[axis]) === -Math.sign(doorAt[axis] - center[axis]), 'the guardian stands at the far side');
      }
    }
  }
});

test('the same seed and the same exploration grow the same level', () => {
  const a = explore(321, 'forest'), b = explore(321, 'forest');
  assert.deepEqual(a.areas.map(area => [area.rect, area.name, area.features.length]), b.areas.map(area => [area.rect, area.name, area.features.length]));
  assert.notDeepEqual(a.areas.map(area => area.rect), explore(322, 'forest').areas.map(area => area.rect));
});

test('every feature has its own id, and chests stand in dungeons and in the wild', () => {
  for (const biome of BIOMES) {
    const ids = new Set<string>(), chests = [1, 2, 3, 4].flatMap(seed => {
      const level = explore(seed, biome, 10);
      for (const feature of level.areas.flatMap(area => area.features)) { assert.ok(!ids.has(feature.id), `${biome}: ${feature.id} repeats`); ids.add(feature.id); }
      return level.chests;
    });
    assert.ok(chests.length > 0, `${biome}: no chests`);
    assert.ok(chests.every(chest => !chest.opened));
  }
});

test('a guardian that follows the hero grows its sanctum near him and never seals the level shut', () => {
  for (const biome of BIOMES) for (const seed of [3, 8, 21]) {
    const level = explore(seed, biome, 12);
    const at = level.start;
    // Tries that fail to fit a sanctum leave their exits open for halls.
    const before = level.openExits.length;
    const sanctum = level.growNearest(at.x, at.z, 'sanctum', 24);
    if (!sanctum) assert.equal(level.openExits.length, before, `${biome}/${seed}: a failed sanctum sealed exits`);
    else {
      const route = level.path(at, rectCenter(sanctum.rect));
      assert.ok(route.length, `${biome}/${seed}: the sanctum cannot be reached`);
    }
    // Many tries far away never use up every exit.
    for (let n = 0; n < 6; n++) level.growNearest(at.x + 200, at.z + 200, 'sanctum');
    assert.ok(level.openExits.length > 0 || level.areas.some(area => area.kind === 'hall' && area.exits.some(exit => exit.state === 'open')) || level.areas.length > 20, `${biome}/${seed}: the level has no way on`);
  }
}, 30_000);
