import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Level, isBreakable, BREAKABLE_RADIUS, type Biome } from '../src/rpg/world/levelGen';

const BIOMES: Biome[] = ['vault', 'forest', 'coast', 'quarry', 'garden'];

/** Grows a level by walking to its open exits, as a player does. */
function grow(seed: number, biome: Biome): Level {
  const level = new Level(seed, biome);
  let at = level.start;
  level.expandAround(at.x, at.z);
  for (let step = 0; step < 12; step++) {
    const exits = level.openExits; if (!exits.length) break;
    const route = level.path(at, exits[(seed + step * 5) % exits.length]!);
    if (route.length) at = route[route.length - 1]!;
    level.expandAround(at.x, at.z);
  }
  return level;
}

test('levels grow breakables in areas and hallways, with unique ids the server accepts', () => {
  for (const biome of BIOMES) {
    let inHalls = 0, total = 0;
    for (const seed of [3, 58, 1201]) {
      const level = grow(seed, biome), ids = new Set<string>();
      for (const feature of level.breakables) {
        assert.ok(/^[\w:-]{1,80}$/.test(feature.id), `${biome}/${seed}: id ${feature.id}`);
        assert.ok(!ids.has(feature.id), `${biome}/${seed}: duplicate ${feature.id}`); ids.add(feature.id);
        assert.equal(feature.radius, BREAKABLE_RADIUS[feature.kind as keyof typeof BREAKABLE_RADIUS]);
      }
      total += level.breakables.length;
      inHalls += level.corridors.reduce((sum, corridor) => sum + corridor.features.filter(isBreakable).length, 0);
      // The guardian's sanctum is kept clear for the fight.
      for (const area of level.areas) if (area.kind === 'sanctum') assert.equal(area.features.filter(isBreakable).length, 0);
    }
    assert.ok(total >= 12, `${biome}: only ${total} breakables`);
    assert.ok(inHalls >= 1, `${biome}: no breakables in hallways`);
  }
});

test('the same seed grows the same breakables', () => {
  const a = grow(77, 'vault').breakables.map(feature => [feature.id, feature.kind, feature.x, feature.z]);
  const b = grow(77, 'vault').breakables.map(feature => [feature.id, feature.kind, feature.x, feature.z]);
  assert.deepEqual(a, b);
});

test('vaults keep urns; quarries keep barrels and crates', () => {
  const kinds = (biome: Biome) => new Set([1, 2, 3, 4].flatMap(seed => grow(seed, biome).breakables.map(feature => feature.kind)));
  assert.ok(kinds('vault').has('urn'));
  assert.ok(!kinds('quarry').has('urn'));
});

test('a breakable is solid until it breaks, then the hero walks through its spot', () => {
  const level = grow(42, 'vault');
  const feature = level.breakables.find(entry => level.areaAt(entry.x, entry.z)) ?? level.breakables[0]!;
  assert.equal(level.walkable(feature.x, feature.z), false);
  assert.equal(level.breakFeature(feature.id), true);
  assert.equal(feature.opened, true);
  assert.equal(level.walkable(feature.x, feature.z), true);
  // A second break, or an unknown id, does nothing.
  assert.equal(level.breakFeature(feature.id), false);
  assert.equal(level.breakFeature('no-such-thing'), false);
});

test('breakables in a hallway never close it', () => {
  for (const biome of BIOMES) for (const seed of [9, 314, 77, 1201, 5150]) {
    const level = grow(seed, biome);
    // Sealed doors close their hallways on purpose; only breakables are under test.
    for (const door of level.doors) level.openDoor(door.id);
    for (const corridor of level.corridors) {
      const first = corridor.rects[0]!, last = corridor.rects[corridor.rects.length - 1]!;
      const from = { x: (first.minX + first.maxX) / 2, z: (first.minZ + first.maxZ) / 2 }, to = { x: (last.minX + last.maxX) / 2, z: (last.minZ + last.maxZ) / 2 };
      if (!level.walkable(from.x, from.z) || !level.walkable(to.x, to.z)) continue;
      assert.ok(level.path(from, to).length > 0, `${biome}/${seed}: corridor ${corridor.id} blocked`);
    }
  }
});
