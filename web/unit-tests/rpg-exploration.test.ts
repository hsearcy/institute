import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Texture, Vector3 } from 'three';
import { slideStep } from '../src/rpg/world/exploration';
import { FloorLoot } from '../src/rpg/world/floorLoot';
import { Level } from '../src/rpg/world/levelGen';

test('walls stop the hero and he slides along them', () => {
  const level = new Level(3, 'vault'), walkable = (x: number, z: number) => level.walkable(x, z);
  const entry = level.areas[0]!.rect;
  // A solid stretch of the entry's south wall: no exit is ever made on that side.
  const atWall = { x: entry.minX + 1.5, z: entry.maxZ - .4 };
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
