import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { AnimationClip, AnimationMixer, Bone, Group, QuaternionKeyframeTrack } from 'three';
import { HeroAnimator, gaitSpeed, locomotionWeights } from '../src/rpg/world/heroAnimator';

test('locomotion weights always sum to one and move idle → walk → run with speed', () => {
  let previousRun = 0;
  for (let speed = 0; speed <= 8; speed += .25) {
    const w = locomotionWeights(speed, 1.4, 4);
    assert(Math.abs(w.idle + w.walk + w.run - 1) < 1e-9);
    assert(w.run >= previousRun); previousRun = w.run;
  }
  assert.deepEqual(locomotionWeights(0, 1.4, 4), { idle: 1, walk: 0, run: 0 });
  assert.deepEqual(locomotionWeights(1.4, 1.4, 4), { idle: 0, walk: 1, run: 0 });
  assert.deepEqual(locomotionWeights(9, 1.4, 4), { idle: 0, walk: 0, run: 1 });
  assert.equal(gaitSpeed({ strideDistance: 1.4, duration: .7 }), 2);
  assert.equal(gaitSpeed(undefined), 0);
});

function rig() {
  const root = new Group(), hip = new Bone(), arm = new Bone();
  hip.name = 'Hip'; arm.name = 'R_Upperarm'; root.add(hip); hip.add(arm);
  const clip = (name: string, duration = 1) => new AnimationClip(name, duration, [
    new QuaternionKeyframeTrack('Hip.quaternion', [0, duration], [0, 0, 0, 1, 0, 0, 0, 1]),
    new QuaternionKeyframeTrack('R_Upperarm.quaternion', [0, duration], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const clips = ['idle', 'walk', 'run', 'cast', 'cleave', 'hit', 'victory'].map(name => clip(name));
  const animator = new HeroAnimator(new AnimationMixer(root), clips, {
    walk: { strideDistance: 1.4, duration: 1 }, run: { strideDistance: 4, duration: 1 } });
  return animator;
}

test('a cast while running keeps the legs in the gait; a cast while standing is full body', () => {
  const animator = rig();
  animator.update(.1, 4); animator.play('cast');
  assert.equal(animator.current, 'cast');
  assert.equal((animator as any).shot.upper, true);
  animator.update(.1, 0); animator.play('cast');
  assert.equal((animator as any).shot.upper, false);
});

test('one-shots end and return to locomotion; unknown clips are ignored', () => {
  const animator = rig();
  assert.equal(animator.play('missing'), false);
  animator.play('hit');
  for (let i = 0; i < 15; i++) animator.update(.1, 0);
  assert.equal(animator.current, 'idle');
  animator.update(.1, 4);
  assert.equal(animator.current, 'run');
  assert.equal(animator.runSpeed, 4); assert.equal(animator.walkSpeed, 1.4);
});
