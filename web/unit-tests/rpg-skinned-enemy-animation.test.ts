import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Bone, Group, Object3D, SkinnedMesh, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { EnemyPoseState } from '../src/rpg/world/EnemyAnimator';
import { EnemyAnimator } from '../src/rpg/world/EnemyAnimator';

async function loadRig(kind: string) {
  const input = readFileSync(new URL(`../public/assets/rpg/${kind}.glb`, import.meta.url));
  const length = input.readUInt32LE(12), data = JSON.parse(input.subarray(20, 20 + length).toString());
  // Geometry and skeleton are real exports. Skip browser-only image decoding.
  data.images = []; data.textures = []; data.materials = [{}];
  for (const mesh of data.meshes) for (const p of mesh.primitives) p.material = 0;
  const json = Buffer.from(JSON.stringify(data).padEnd(Math.ceil(JSON.stringify(data).length / 4) * 4, ' '));
  const binary = input.subarray(20 + length), bytes = Buffer.alloc(20 + json.length + binary.length);
  input.copy(bytes, 0, 0, 20); bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(json.length, 12);
  json.copy(bytes, 20); binary.copy(bytes, 20 + json.length);
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

for (const kind of ['skeleton', 'revenant', 'guardian', 'vault-guardian-boss']) {
  test(`${kind}: real skin remains finite, settles, and resets after death`, async () => {
    const root = await loadRig(kind), animator = new EnemyAnimator(root, { kind, phase: 1 });
    assert(animator.articulated && animator.ownsGroundedPose);
    const meshes: SkinnedMesh[] = []; root.traverse(o => { if (o instanceof SkinnedMesh) meshes.push(o); });
    const pose = (t: number, dead: boolean) => {
      animator.update(t, dead ? { deathAge: t, collapse: 'grounded' } : { moving: 0, threat: 0 });
      root.updateMatrixWorld(true); meshes.forEach(m => m.skeleton.update());
      return meshes.flatMap(m => m.skeleton.bones.flatMap(b => [...b.position.toArray(), ...b.quaternion.toArray()]));
    };
    const idle = pose(0, false);
    for (const t of [0, .1, .3, .6, 1, 1.6, 2.5]) {
      assert(pose(t, true).every(Number.isFinite));
      for (const mesh of meshes) for (let i = 0; i < mesh.geometry.attributes.position.count; i += 997) {
        assert(mesh.getVertexPosition(i, new Vector3()).toArray().every(Number.isFinite));
      }
    }
    assert.deepEqual(pose(4, true), pose(5, true), 'Settled bodies must not continue idle motion');
    assert.deepEqual(pose(0, false), idle, 'A living pose must not retain death transforms');
  });
}

function bonePose(root: Object3D): number[] {
  const values: number[] = [];
  root.traverse(object => {
    if (object instanceof Bone) values.push(...object.position.toArray(), ...object.quaternion.toArray());
  });
  return values;
}

function assertPoseNear(actual: number[], expected: number[], message: string) {
  assert.equal(actual.length, expected.length);
  const error = Math.max(...actual.map((value, index) => Math.abs(value - expected[index])));
  assert(error < 1e-6, `${message}: largest component change ${error}`);
}

function skinMeshes(root: Object3D): SkinnedMesh[] {
  const meshes: SkinnedMesh[] = [];
  root.traverse(object => { if (object instanceof SkinnedMesh) meshes.push(object); });
  return meshes;
}

for (const kind of ['skeleton', 'revenant', 'guardian', 'vault-guardian-boss']) {
  test(`${kind}: lethal age zero retains the last living or recoil pose`, async () => {
    const root = await loadRig(kind), animator = new EnemyAnimator(root, { kind, phase: .7 });
    for (const living of [{}, { recoil: .8, brace: .3, catchStep: .4, footOffset: -.08, footLift: .02, impactSide: -1 }]) {
      animator.update(2.3, living);
      const before = bonePose(root);
      animator.update(2.31, { deathAge: 0, recoil: .5, impactSide: 1, collapse: 'grounded' });
      assertPoseNear(bonePose(root), before, 'The first lethal frame must not snap back to rest');
      animator.update(2.37, { deathAge: .06, collapse: 'grounded' });
      animator.update(2.4, { deathAge: 0, collapse: 'grounded' });
      assertPoseNear(bonePose(root), before, 'Death sampling must not overwrite the stored living pose');
    }
  });

  test(`${kind}: cached support samples preserve independent clone poses`, async () => {
    const source = await loadRig(kind), first = cloneSkeleton(source), second = cloneSkeleton(source);
    const sourceRest = bonePose(source), firstAnimator = new EnemyAnimator(first, { kind, phase: .4 });
    const state: EnemyPoseState = { recoil: .65, brace: .2, footLift: .025, impactSide: -1 };
    firstAnimator.update(1.7, state);
    const secondAnimator = new EnemyAnimator(second, { kind, phase: .4 });
    const cold = await loadRig(kind), coldAnimator = new EnemyAnimator(cold, { kind, phase: .4 });
    assert.equal(skinMeshes(first)[0].geometry, skinMeshes(second)[0].geometry, 'Clones share geometry');
    assert.notEqual(skinMeshes(first)[0].skeleton, skinMeshes(second)[0].skeleton, 'Each clone owns its skin');
    assert.notEqual(skinMeshes(first)[0].skeleton.bones[0], skinMeshes(second)[0].skeleton.bones[0]);
    for (const pose of [state, { deathAge: .35 }, { deathAge: 1.6 }, {}]) {
      secondAnimator.update(2, pose); coldAnimator.update(2, pose);
      assertPoseNear(bonePose(second), bonePose(cold), 'Warm and cold support sampling must agree');
    }
    const secondBefore = bonePose(second);
    firstAnimator.update(3, { deathAge: 1.8 });
    assert.deepEqual(bonePose(second), secondBefore, 'Posing one clone must not move another');
    assert.deepEqual(bonePose(source), sourceRest, 'Posing clones must not modify the cached source');
  });

  test(`${kind}: actual deformed death surfaces remain at the floor`, async () => {
    const model = await loadRig(kind), root = new Group();
    model.scale.multiplyScalar(1.35); root.add(model); root.position.set(3, 1.7, -2); root.rotation.y = .63; root.scale.setScalar(1.2);
    const animator = new EnemyAnimator(root, { kind, phase: .2 }), meshes = skinMeshes(root), point = new Vector3();
    const tolerance = .006 * 1.35 * 1.2;
    animator.update(0, {});
    for (const age of [.3, .65, 1.1, 1.6, 2.2]) {
      animator.update(age, { deathAge: age, collapse: 'grounded' }); root.updateMatrixWorld(true);
      let minimum = Infinity, bodyMinimum = Infinity;
      for (const mesh of meshes) {
        mesh.skeleton.update();
        const ids = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
        for (let i = 0; i < ids.count; i++) {
          const y = mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).y;
          assert(Number.isFinite(y)); minimum = Math.min(minimum, y);
          let slot = 0;
          for (let j = 1; j < 4; j++) if (weights.getComponent(i, j) > weights.getComponent(i, slot)) slot = j;
          if (mesh.skeleton.bones[ids.getComponent(i, slot)].name !== 'WeaponR') bodyMinimum = Math.min(bodyMinimum, y);
        }
      }
      assert(minimum >= root.position.y - tolerance, `At ${age}s the mesh penetrates the floor by ${root.position.y - minimum}m`);
      assert(bodyMinimum <= root.position.y + tolerance, `At ${age}s the body floats ${bodyMinimum - root.position.y}m above the floor`);
    }
  });
}
