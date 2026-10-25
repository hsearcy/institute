import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Group, Vector3 } from 'three';
import { advanceHeroTravel, setPlanarHeroHeading } from '../src/rpg/world/heroLocomotion';

test('late appearance quaternion copies cannot reverse planar heading', () => {
  const prior = new Group(), replacement = new Group();
  for (const yaw of [-Math.PI, -2.4, -.2, .2, 2.4, Math.PI]) {
    prior.rotation.set(0, yaw, 0); replacement.quaternion.copy(prior.quaternion);
    setPlanarHeroHeading(replacement.rotation, yaw);
    const actual = new Vector3(0, 0, 1).applyQuaternion(replacement.quaternion);
    assert(actual.distanceTo(new Vector3(Math.sin(yaw), 0, Math.cos(yaw))) < 1e-10);
  }
});

test('travel caps speed and advances exactly one stride per supplied measured cycle', () => {
  const cycle = { strideDistance: 1.3, duration: .95 };
  for (const delta of [1 / 60, 1 / 30, .06]) {
    let remaining = 20, speed = 0, advanced = 0, clipSeconds = 0, elapsed = 0;
    while (remaining > 1e-9 && elapsed < 12) {
      const step = advanceHeroTravel(remaining, speed, delta, cycle);
      assert(step.distance >= 0 && step.distance <= remaining);
      assert(step.distance / delta <= 3 + 1e-10);
      assert(step.speed >= 0 && step.speed <= 3);
      advanced += step.distance; clipSeconds += step.clipRate * delta;
      remaining -= step.distance; speed = step.speed; elapsed += delta;
    }
    assert(remaining < 1e-9); assert(elapsed < 8);
    assert(Math.abs(clipSeconds / cycle.duration * cycle.strideDistance - advanced) < 1e-9);
    assert.equal(speed, 0);
  }
});

test('paused or already arrived travel does not advance the walk clip', () => {
  assert.deepEqual(advanceHeroTravel(0, 2, .03), { distance: 0, speed: 0, clipRate: 0 });
  assert.deepEqual(advanceHeroTravel(20, 2, 0), { distance: 0, speed: 0, clipRate: 0 });
});
