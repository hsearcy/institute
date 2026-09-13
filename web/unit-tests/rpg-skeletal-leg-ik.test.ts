import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Bone, Object3D, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { solveTwoBoneWorld } from '../src/rpg/world/skeletalLegIK';

async function loadRig(kind: string) {
  const input = readFileSync(new URL(`../public/assets/rpg/${kind}.glb`, import.meta.url));
  const length = input.readUInt32LE(12), data = JSON.parse(input.subarray(20, 20 + length).toString());
  data.images = []; data.textures = []; data.materials = [{}];
  for (const mesh of data.meshes) for (const p of mesh.primitives) p.material = 0;
  const text = JSON.stringify(data), json = Buffer.from(text.padEnd(Math.ceil(Buffer.byteLength(text) / 4) * 4, ' '));
  const binary = input.subarray(20 + length), bytes = Buffer.alloc(20 + json.length + binary.length);
  input.copy(bytes, 0, 0, 20); bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(json.length, 12);
  json.copy(bytes, 20); binary.copy(bytes, 20 + json.length);
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

for (const kind of ['skeleton', 'revenant', 'guardian', 'vault-guardian-boss']) {
  test(`${kind}: exported leg chains hold both feet through pelvis drop, pitch and actor scale`, async () => {
    const root = await loadRig(kind), wrapper = new Object3D(); wrapper.add(root);
    wrapper.position.set(7, .4, -3); wrapper.rotation.set(.04, .78, -.02); wrapper.scale.setScalar(1.7);
    root.updateWorldMatrix(true, true);
    const pelvis = root.getObjectByName('Pelvis') as Bone;
    const bones: Bone[] = []; root.traverse(o => { if (o instanceof Bone) bones.push(o); });
    const rest = bones.map(b => ({ bone: b, p: b.position.clone(), q: b.quaternion.clone(), scale: b.scale.clone() }));
    const legs = ['L', 'R'].map(side => {
      const hip = root.getObjectByName(`Thigh${side}`) as Bone, shin = root.getObjectByName(`Shin${side}`) as Bone, foot = root.getObjectByName(`Foot${side}`) as Bone;
      const target = foot.getWorldPosition(new Vector3()), rotation = foot.getWorldQuaternion(new Quaternion()).normalize();
      const length = hip.getWorldPosition(new Vector3()).distanceTo(shin.getWorldPosition(new Vector3())) + shin.getWorldPosition(new Vector3()).distanceTo(target);
      return { hip, shin, foot, target, rotation, length };
    });
    const frame = wrapper.getWorldQuaternion(new Quaternion()), down = new Vector3(0, -1, 0).applyQuaternion(frame), forward = new Vector3(0, 0, 1).applyQuaternion(frame);
    let repeated: number[] | undefined;
    for (const [drop, pitch, roll] of [[.05, .04, 0], [.22, .3, .09], [.4, .55, -.1], [.22, .3, .09], [.22, .3, .09]]) {
      for (const r of rest) { r.bone.position.copy(r.p); r.bone.quaternion.copy(r.q); }
      root.updateWorldMatrix(true, true);
      const world = pelvis.getWorldPosition(new Vector3()).addScaledVector(down, legs[0].length * drop);
      pelvis.position.copy(pelvis.parent!.worldToLocal(world));
      const turn = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0).applyQuaternion(frame), pitch)
        .multiply(new Quaternion().setFromAxisAngle(forward, roll)).multiply(pelvis.getWorldQuaternion(new Quaternion()));
      pelvis.quaternion.copy(pelvis.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(turn));
      root.updateWorldMatrix(true, true);
      for (const leg of legs) {
        const pole = leg.hip.getWorldPosition(new Vector3()).addScaledVector(forward, leg.length * 2);
        assert(solveTwoBoneWorld(leg.hip, leg.shin, leg.foot, leg.target, pole, leg.rotation));
        assert(leg.foot.getWorldPosition(new Vector3()).distanceTo(leg.target) < 1e-5, 'Foot position must stay at the held world target');
        assert(leg.foot.getWorldQuaternion(new Quaternion()).normalize().angleTo(leg.rotation) < 1e-5, `Foot orientation error ${leg.foot.getWorldQuaternion(new Quaternion()).normalize().angleTo(leg.rotation)} scale ${leg.foot.getWorldScale(new Vector3()).toArray()}`);
      }
      for (const r of rest) {
        if (r.bone !== pelvis) assert(r.bone.position.equals(r.p), 'IK must not translate or stretch joints');
        assert(r.bone.scale.equals(r.scale));
      }
      if (drop === .22) {
        const current = bones.flatMap(b => b.quaternion.toArray());
        if (repeated) assert.deepEqual(current, repeated, 'Reset and repeat must be deterministic');
        repeated = current;
      }
    }
  });
}

test('unreachable and degenerate leg targets stay finite without stretching', () => {
  const hip = new Bone(), shin = new Bone(), foot = new Bone(); hip.add(shin); shin.add(foot);
  shin.position.y = -1; foot.position.y = -1;
  assert.equal(solveTwoBoneWorld(hip, shin, foot, new Vector3(0, -10, 0), new Vector3(0, -20, 0)), false);
  assert(Math.abs(foot.getWorldPosition(new Vector3()).length() - 2) < 1e-8);
  solveTwoBoneWorld(hip, shin, foot, new Vector3(), new Vector3());
  assert([...hip.quaternion.toArray(), ...shin.quaternion.toArray()].every(Number.isFinite));
  assert.equal(shin.position.y, -1); assert.equal(foot.position.y, -1);
  assert.equal(solveTwoBoneWorld(hip, shin, foot, new Vector3(NaN, 0, 0), new Vector3()), false);
});
