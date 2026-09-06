import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Group, Vector3 } from 'three';
import { advanceHeroTravel, heroDoorwayRoute, HERO_STRIDE_DISTANCE, HERO_WALK_DURATION, setPlanarHeroHeading, settleHeroTravel } from '../src/rpg/world/heroLocomotion';
import { getRoomLayout } from '../src/rpg/world/roomLayout';

test('late appearance quaternion copies cannot reverse planar heading', () => {
  const prior = new Group(), replacement = new Group();
  for (const yaw of [-Math.PI, -2.4, -.2, .2, 2.4, Math.PI]) {
    prior.rotation.set(0, yaw, 0); replacement.quaternion.copy(prior.quaternion);
    setPlanarHeroHeading(replacement.rotation, yaw);
    const actual = new Vector3(0, 0, 1).applyQuaternion(replacement.quaternion);
    assert(actual.distanceTo(new Vector3(Math.sin(yaw), 0, Math.cos(yaw))) < 1e-10);
  }
});

test('authored travel caps speed and advances exactly one stride per measured cycle', () => {
  for (const delta of [1 / 60, 1 / 30, .06]) {
    let remaining = 20, speed = 0, advanced = 0, clipSeconds = 0, elapsed = 0;
    while (remaining > 1e-9 && elapsed < 12) {
      const step = advanceHeroTravel(remaining, speed, delta);
      assert(step.distance >= 0 && step.distance <= remaining);
      assert(step.distance / delta <= 3 + 1e-10);
      assert(step.speed >= 0 && step.speed <= 3);
      advanced += step.distance; clipSeconds += step.clipRate * delta;
      remaining -= step.distance; speed = step.speed; elapsed += delta;
    }
    assert(remaining < 1e-9); assert(elapsed < 8);
    assert(Math.abs(clipSeconds / HERO_WALK_DURATION * HERO_STRIDE_DISTANCE - advanced) < 1e-9);
    assert.equal(speed, 0);
  }
});

test('paused or already arrived travel does not advance the walk clip', () => {
  assert.deepEqual(advanceHeroTravel(0, 2, .03), { distance: 0, speed: 0, clipRate: 0 });
  assert.deepEqual(advanceHeroTravel(20, 2, 0), { distance: 0, speed: 0, clipRate: 0 });
});

test('a rapid answer stages hero and camera in the active encounter before casting', () => {
  const hero = new Vector3(0, 0, -7), target = new Vector3(0, 0, -5);
  const camera = target.clone().add(new Vector3(17, 25, 20)), destination = new Vector3(1, 0, -20);
  const offset = camera.clone().sub(target);
  assert(settleHeroTravel(hero, camera, target, destination));
  assert(hero.equals(destination)); assert(target.equals(destination));
  assert(camera.clone().sub(target).equals(offset));
  assert(!settleHeroTravel(hero, camera, target, destination));
});

test('each sequential route aligns before the stairs and stays inside the doorway through the pier depth', () => {
  for (let previous = 0; previous < 5; previous++) {
    const route = heroDoorwayRoute(previous, previous + 1), layout = getRoomLayout(previous);
    assert.equal(route.length, 2);
    assert(route.every(point => point.x === layout.doorX));
    assert(route[0]!.z > -20 * previous - 7.25);
    assert(route[1]!.z < -20 * previous - 10.5);
  }
  // The gallery's door is left of the direct hero-to-hero line; this is the
  // regression that previously sent the actor through the right gate pier.
  assert.equal(heroDoorwayRoute(4, 5)[0]!.x, -1.8);
  assert.deepEqual(heroDoorwayRoute(3, 0), []);
});
