import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { rpgShrineBoon, RPG_BOON_IDS } from '@institute/shared';
import { Level, rectCenter, type Biome } from '../src/rpg/world/levelGen';

const BIOMES: Biome[] = ['vault', 'forest', 'coast', 'quarry', 'garden'];

/** Explores like a player: walks to an open exit, lets the level grow, repeats. */
function explore(seed: number, biome: Biome, steps = 14): Level {
  const level = new Level(seed, biome);
  let at = level.start;
  level.expandAround(at.x, at.z);
  for (let step = 0; step < steps; step++) {
    const exits = level.openExits;
    if (!exits.length) break;
    const route = level.path(at, exits[(seed + step * 7) % exits.length]!);
    if (route.length) at = route[route.length - 1]!;
    level.expandAround(at.x, at.z);
  }
  return level;
}
let grown: { biome: Biome; seed: number; level: Level }[] | undefined;
/** Thirty explored levels, grown once; tests that change a level grow their own copy. */
const levels = (fresh = false) => {
  const made = () => BIOMES.flatMap(biome => [1, 2, 3, 4].map(seed => ({ biome, seed, level: explore(seed, biome) })));
  if (fresh) return made();
  return grown ??= made();
};

test('some levels grow sealed doors, each leading to a small treasury with a chest', () => {
  let doors = 0;
  for (const { biome, seed, level } of levels()) {
    for (const door of level.doors) {
      doors++;
      const corridor = level.corridors[door.corridor]!, room = level.areas[corridor.to]!;
      assert.equal(room.kind, 'treasury', `${biome}/${seed}: ${door.id} leads to a ${room.kind}`);
      assert.equal(room.exits.length, 0, 'a treasury is a dead end');
      assert.equal(room.features.filter(feature => feature.kind === 'chest').length, 1, 'a treasury holds one chest');
      assert.equal(corridor.from, door.area);
      assert.ok(!door.opened);
    }
    for (const area of level.areas.filter(area => area.kind === 'treasury')) assert.ok(level.doors.some(door => level.corridors[door.corridor]!.to === area.id), 'every treasury has a door');
    assert.equal(new Set(level.doors.map(door => door.id)).size, level.doors.length, 'door ids are unique');
  }
  assert.ok(doors >= 5, `only ${doors} doors`);
}, 30_000);

test('a closed door blocks every step and every route until it opens', () => {
  let checked = 0;
  for (const { biome, seed, level } of levels(true)) for (const door of level.doors) {
    const corridor = level.corridors[door.corridor]!, room = level.areas[corridor.to]!, hall = level.areas[door.area]!;
    const inside = rectCenter(room.rect), outside = rectCenter(hall.rect);
    assert.ok(!level.walkable(door.x, door.z), `${biome}/${seed}: the door slab is walkable`);
    // Across the whole width of the hallway, nothing slips past the slab.
    for (let t = -.45; t <= .45; t += .15) {
      const across = door.side === 'north' || door.side === 'south' ? { x: door.x + t * door.width, z: door.z } : { x: door.x, z: door.z + t * door.width };
      assert.ok(!level.walkable(across.x, across.z, .3), `${biome}/${seed}: a gap beside the door`);
    }
    const blockedRoute = level.path(outside, inside);
    assert.deepEqual(blockedRoute.filter(point => level.areaAt(point.x, point.z) === room), [], `${biome}/${seed}: a route reaches the treasury through a closed door`);
    // A click into the sealed room walks the hero up to the door instead.
    const end = blockedRoute[blockedRoute.length - 1]!, r = door.rect;
    assert.ok(end && Math.hypot(Math.max(r.minX - end.x, 0, end.x - r.maxX), Math.max(r.minZ - end.z, 0, end.z - r.maxZ)) < 1.2, `${biome}/${seed}: the hero stops short of the door`);
    assert.ok(!level.clearLine(outside, { x: door.x, z: door.z }) || !level.walkable(door.x, door.z));
    assert.equal(level.openDoor(door.id), true);
    assert.equal(level.openDoor(door.id), false, 'a door opens once');
    assert.ok(level.walkable(door.x, door.z), 'the doorway is walkable once open');
    const route = level.path(outside, inside);
    assert.ok(route.length, `${biome}/${seed}: the treasury cannot be reached through the open door`);
    let from = outside;
    for (const point of route) { assert.ok(level.clearLine(from, point), 'a leg crosses a wall'); from = point; }
    checked++;
  }
  assert.ok(checked > 0);
}, 30_000);

test('packs never grow into a treasury: growNearest skips locked exits', () => {
  for (const { level } of levels(true)) {
    const before = level.areas.filter(area => area.kind === 'treasury').length;
    for (let n = 0; n < 4; n++) level.growNearest(level.start.x, level.start.z, 'hall');
    const grown = level.areas.slice(-4);
    assert.ok(grown.every(area => area.kind !== 'treasury'));
    assert.ok(level.areas.filter(area => area.kind === 'treasury').length >= before);
  }
}, 30_000);

test('shrines stand in some halls, never block a doorway, and each gives a fixed boon', () => {
  const boons = new Set<string>();
  let shrines = 0;
  for (const { biome, seed, level } of levels()) for (const shrine of level.shrines) {
    shrines++;
    const area = level.areaAt(shrine.x, shrine.z)!;
    assert.equal(area.kind, 'hall', `${biome}/${seed}: a shrine in a ${area.kind}`);
    assert.ok(!level.walkable(shrine.x, shrine.z), 'a shrine is solid');
    assert.ok(!shrine.opened);
    boons.add(rpgShrineBoon(shrine.id));
    assert.equal(rpgShrineBoon(shrine.id), rpgShrineBoon(shrine.id));
    // The hero can walk up to it.
    const route = level.path(level.start, { x: shrine.x + shrine.radius + .6, z: shrine.z });
    assert.ok(route.length || level.doors.length, `${biome}/${seed}: no way to the shrine`);
  }
  assert.ok(shrines >= 6, `only ${shrines} shrines`);
  assert.deepEqual([...boons].sort(), [...RPG_BOON_IDS].sort(), 'every boon appears');
}, 30_000);

test('doors and shrines grow the same for the same seed', () => {
  const a = explore(77, 'vault'), b = explore(77, 'vault');
  assert.deepEqual(a.doors.map(door => [door.id, door.rect]), b.doors.map(door => [door.id, door.rect]));
  assert.deepEqual(a.shrines.map(shrine => shrine.id), b.shrines.map(shrine => shrine.id));
});
