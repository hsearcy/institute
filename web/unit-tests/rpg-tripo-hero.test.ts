import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { AnimationClip, Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3, VectorKeyframeTrack } from 'three';
import { createTripoHeroInstance, measureTripoWalkCycle, tintTripoHero } from '../src/rpg/world/tripoHeroRuntime';

test('new hero grounds and scales independently of its source root and owns cosmetic materials', () => {
  const source = new Group(); source.position.set(3, 4, -2);
  const material = new MeshStandardMaterial({ color: 0x70b6ac });
  const body = new Mesh(new BoxGeometry(2, 4, 1), material); body.name = 'new-atlas'; source.add(body);
  const instance = createTripoHeroInstance(source, 1.8);
  const bounds = new Box3().setFromObject(instance), center = bounds.getCenter(new Vector3());
  assert(Math.abs(bounds.min.y) < 1e-10);
  assert(Math.abs(bounds.max.y - 1.8) < 1e-10);
  assert(Math.abs(center.x) < 1e-10 && Math.abs(center.z) < 1e-10);
  assert.deepEqual(source.position.toArray(), [3, 4, -2]);
  const own = (instance.getObjectByName('new-atlas') as Mesh).material as MeshStandardMaterial;
  assert.notEqual(own, material);
  tintTripoHero(instance, 'cinder'); assert.notEqual(own.color.getHex(), material.color.getHex());
  tintTripoHero(instance, 'glacier'); tintTripoHero(instance, 'wayfarer');
  assert(own.color.equals(material.color)); assert(own.emissive.equals(material.emissive));
  assert.equal(own.emissiveIntensity, material.emissiveIntensity);
});

test('walk calibration measures the supplied fresh rig instead of a previous hero stride', () => {
  const rig = new Group(), hips = new Group(), foot = new Group();
  hips.name = 'mixamorigHips'; foot.name = 'mixamorigRightFoot'; rig.add(hips); hips.add(foot);
  rig.scale.setScalar(.5);
  const clip = new AnimationClip('walk', 2, [new VectorKeyframeTrack('mixamorigRightFoot.position', [0, 1, 2], [0, 0, -.4, 0, 0, .4, 0, 0, -.4])]);
  const cycle = measureTripoWalkCycle(rig, clip);
  assert(cycle); assert(Math.abs(cycle.strideDistance - .8) < 1e-6); assert.equal(cycle.duration, 2);
  assert.deepEqual(foot.position.toArray(), [0, 0, 0]);
  assert.equal(measureTripoWalkCycle(rig), undefined);
});


test('native Tripo gait uses Hip and L_Foot/R_Foot without confusing moving Pelvis', () => {
  const rig = new Group(), hip = new Group(), pelvis = new Group(), left = new Group(), right = new Group();
  hip.name = 'Hip'; pelvis.name = 'Pelvis'; left.name = 'L_Foot'; right.name = 'R_Foot';
  rig.add(hip); hip.add(pelvis, left, right);
  const clip = new AnimationClip('walk', 1, [
    new VectorKeyframeTrack('Hip.position', [0, .5, 1], [0, 0, 0, 0, 0, 1, 0, 0, 2]),
    new VectorKeyframeTrack('Pelvis.position', [0, .5, 1], [0, 0, 0, 0, 0, 4, 0, 0, 0]),
    new VectorKeyframeTrack('L_Foot.position', [0, .5, 1], [0, 0, -.3, 0, 0, .3, 0, 0, -.3]),
    new VectorKeyframeTrack('R_Foot.position', [0, .5, 1], [0, 0, .3, 0, 0, -.3, 0, 0, .3]),
  ]);
  const cycle = measureTripoWalkCycle(rig, clip);
  assert(cycle); assert(Math.abs(cycle.strideDistance - 1.2) < 1e-6); assert.equal(cycle.duration, 1);
  assert.deepEqual(hip.position.toArray(), [0, 0, 0]);
  assert.deepEqual(pelvis.position.toArray(), [0, 0, 0]);
});
