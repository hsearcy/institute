import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createHitReaction, sampleHitReaction } from '../src/rpg/world/hitReactions';
const input = { at: 10, x: 3, z: 4, sourceX: 0, sourceZ: 0, phase: .7, heavy: false, maxHp: 100, element: 'fire' as const };

test('Authoritative survivors recoil away from the source and recover without erosion', () => {
  const hit = { damage: 35, hpBefore: 100, hpAfter: 65 };
  const reaction = createHitReaction({ ...input, hit });
  assert.equal(reaction.lethal, false); assert.equal(reaction.dx, .6); assert.equal(reaction.dz, .8);
  assert(sampleHitReaction(reaction, 10.08).recoil > .6);
  assert(sampleHitReaction(reaction, 10.15).displacement > .1);
  assert.equal(sampleHitReaction(reaction, 11.2).displacement, 0);
  assert.equal(sampleHitReaction(reaction, 11.2).control, 0);
  for (const age of [0, .05, .2, .5, 1, 4]) assert.equal(sampleHitReaction(reaction, 10 + age).erosion, 0);
  assert.deepEqual(hit, { damage: 35, hpBefore: 100, hpAfter: 65 });
});

test('Fatal impacts retain full-size settled bodies before independent late cleanup', () => {
  const reaction = createHitReaction({ ...input, hit: { damage: 30, hpBefore: 30, hpAfter: 0 } });
  assert.equal(reaction.lethal, true);
  assert.equal(sampleHitReaction(reaction, 10.09).collapseAge, 0);
  assert.equal(sampleHitReaction(reaction, 11.1).erosion, 0);
  assert(sampleHitReaction(reaction, 11.6).erosion > 0);
  assert.equal(sampleHitReaction(reaction, 10 + reaction.duration + .001).erosion, 1);
  assert.equal(sampleHitReaction(reaction, 10 + reaction.duration + .001).complete, true);
  assert.notEqual(reaction.duration, createHitReaction({ ...input, phase: 2.2 }).duration);
});

test('Repeated hits replace presentation without sharing state or introducing invalid vectors', () => {
  const first = createHitReaction({ ...input, x: 0, z: 0 });
  const later = createHitReaction({ ...input, at: 11, hit: { damage: 5, hpBefore: 10, hpAfter: 5 }, element: 'electric' });
  assert.equal(first.element, 'fire'); assert.equal(later.element, 'electric');
  assert.equal(sampleHitReaction(later, 11).erosion, 0);
  assert.equal(Math.hypot(first.dx, first.dz), 1);
  for (const value of Object.values(sampleHitReaction(first, 10.3))) if (typeof value === 'number') assert(Number.isFinite(value));
});

test('Rear foot plants before the pelvis finishes absorbing the impact', () => {
  const reaction = createHitReaction({ ...input, hit: { damage: 6, hpBefore: 8, hpAfter: 2 } });
  const planted = sampleHitReaction(reaction, 10.28), caught = sampleHitReaction(reaction, 10.40);
  assert(Math.abs(planted.footLift) < 1e-6); assert(Math.abs(caught.footLift) < 1e-6);
  assert(Math.abs(planted.footOffset - caught.footOffset) < 1e-6, 'The foot target holds while the pelvis moves');
  assert(caught.displacement > planted.displacement + .04, 'There is a visible weight transfer after planting');
  assert(sampleHitReaction(reaction, 10.18).footLift > .06);
});
