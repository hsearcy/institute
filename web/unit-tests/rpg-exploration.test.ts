import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Texture, Vector3 } from 'three';
import { ENGAGE_RADIUS, heroClickRoute, heroWalkable, roomEntry, slideStep, stagedEnemyPoint } from '../src/rpg/world/exploration';
import { FloorLoot } from '../src/rpg/world/floorLoot';
import { enemyPositions, getRoomLayout } from '../src/rpg/world/roomLayout';

/** Follows a click route with the same slide steps the world uses each frame. */
function walk(from: { x: number; z: number }, to: { x: number; z: number }, room: number, regionId?: string) {
  const walkable = heroWalkable(room, regionId);
  let at = from;
  for (const point of heroClickRoute(from, to, room, regionId)) {
    for (let i = 0; i < 400; i++) {
      const dx = point.x - at.x, dz = point.z - at.z, distance = Math.hypot(dx, dz);
      if (distance < .05) break;
      const step = Math.min(distance, .1);
      const next = slideStep(at, dx / distance * step, dz / distance * step, walkable);
      if (next.x === at.x && next.z === at.z) break;
      at = next;
    }
  }
  return at;
}

test('every room entry is walkable floor and starts outside the staged horde reach', () => {
  for (const regionId of [undefined, 'mosswood']) {
    for (let room = 0; room < 6; room++) {
      const entry = roomEntry(room, regionId);
      assert.ok(heroWalkable(room, regionId)(entry.x, entry.z), `room ${room} entry`);
      const staged = enemyPositions(room, 10, regionId).map(point => stagedEnemyPoint(room, point, regionId));
      const nearest = Math.min(...staged.map(point => Math.hypot(point.x - entry.x, point.z - (entry.z + 20 * room))));
      assert.ok(nearest > ENGAGE_RADIUS * .9, `room ${room} horde is ${nearest.toFixed(2)} from the entry`);
    }
  }
});

test('a staged horde waits behind its combat formation', () => {
  const layout = getRoomLayout(1);
  for (const point of enemyPositions(1, 10)) {
    const staged = stagedEnemyPoint(1, point);
    assert.equal(staged.x, point.x);
    assert.ok(staged.z <= point.z + 1e-9 && staged.z >= layout.walkable.minZ);
  }
});

test('a click in the next room routes the hero through the doorway', () => {
  for (let room = 1; room < 6; room++) {
    const previous = getRoomLayout(room - 1), next = getRoomLayout(room);
    const mark = { x: previous.heroX, z: -20 * (room - 1) + previous.heroZ };
    const goal = { x: next.heroX, z: -20 * room + 2 };
    const end = walk(mark, goal, room);
    assert.ok(Math.hypot(end.x - goal.x, end.z - goal.z) < .1, `room ${room}: stopped at ${end.x.toFixed(2)}, ${end.z.toFixed(2)}`);
  }
});

test('a click past the far wall still goes through the doorway', () => {
  const previous = getRoomLayout(1);
  const route = heroClickRoute({ x: previous.heroX, z: -20 + previous.heroZ }, { x: 3, z: -28.5 }, 2);
  assert.equal(route.length, 3);
  assert.equal(route[0]!.x, previous.doorX);
});

test('walls stop the hero and he slides along them', () => {
  const walkable = heroWalkable(1);
  const { walkable: bounds } = getRoomLayout(1);
  // The doorway from the gate is at x = 0; test a solid stretch of the wall.
  const atWall = { x: 4, z: -20 + bounds.maxZ - .4 };
  assert.deepEqual(slideStep(atWall, 0, .5, walkable), atWall);
  const slid = slideStep(atWall, .3, .5, walkable);
  assert.equal(slid.z, atWall.z); assert.ok(slid.x > atWall.x);
});

test('motes fly to a nearby hero and a relic waits until he is free to walk', () => {
  const loot = new FloorLoot(new Texture()), hero = new Vector3(0, 0, 0);
  // A small floor keeps every mote within the magnet reach.
  const open = (x: number, z: number) => Math.hypot(x, z) < 1.6;
  loot.dropMotes(new Vector3(1, 0, 0), 4, 0);
  loot.dropRelic(new Vector3(.5, 0, 0), 0xffffff, 0);
  let motes = 0, relic = 0;
  for (let t = 0; t < 4; t += 1 / 30) {
    for (const pickup of loot.update(1 / 30, t, hero, false, open)) if (pickup.kind === 'mote') motes++; else relic++;
  }
  assert.equal(motes, 4); assert.equal(relic, 0);
  assert.equal(loot.update(1 / 30, 4, hero, true, open).filter(pickup => pickup.kind === 'relic').length, 1);
  assert.deepEqual(loot.counts, { motes: 0, relic: false });
  loot.dispose();
});
