import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Object3D, Quaternion, Vector3 } from 'three';
import { AuthoredEnemyGuard } from '../src/rpg/world/AuthoredEnemyGuard';
import { EnemyAnimator } from '../src/rpg/world/EnemyAnimator';

function fixture() {
  const root = new Object3D(), joints = new Map<string, { object: Object3D; position: Vector3; rotation: Quaternion }>();
  const positions: Record<string, [number, number, number]> = { Body: [0, .96, 0], Head: [0, .58, 0], ArmUpperR: [.19, .51, .02], ArmUpperL: [-.19, .51, .02], ArmLowerR: [.158, -.286, -.035], ArmLowerL: [-.158, -.286, -.035], LegUpperR: [.105, .96, 0], LegUpperL: [-.105, .96, 0], LegLowerR: [.017, -.46, .018], LegLowerL: [-.017, -.46, .018] };
  for (const [name, position] of Object.entries(positions)) {
    const object = new Object3D(); object.name = name; object.position.fromArray(position);
    const parent = name.startsWith('ArmLower') ? 'ArmUpper' + name.at(-1) : name.startsWith('LegLower') ? 'LegUpper' + name.at(-1) : name === 'Head' || name.startsWith('ArmUpper') ? 'Body' : undefined;
    (parent ? joints.get(parent)!.object : root).add(object);
    joints.set(name, { object, position: object.position.clone(), rotation: object.quaternion.clone() });
  }
  const poses = Object.fromEntries(['Body', 'Head', 'ArmUpperR', 'ArmLowerR', 'ArmUpperL', 'ArmLowerL'].map((name, i) => [name, { position: [0, name === 'Body' ? -.028 : 0, 0], quaternion: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -.1 * (i + 1)).toArray() }]));
  root.userData = { authoredEnemy: true, guardPoseYUp: JSON.stringify(poses) };
  const point = new Vector3(), feet = [new Vector3(0, -.5, -.05), new Vector3(0, -.5, .1)];
  const toSpace = (node: Object3D, p: Vector3) => { root.updateMatrixWorld(true); return p.applyMatrix4(node.matrixWorld); };
  const legs = new Map(['L', 'R'].map(side => { const foot = new Vector3(0, -.5, .025); return [side, { foot, center: toSpace(joints.get('LegLower' + side)!.object, foot.clone()), sole: feet }]; }));
  const lowest = () => Math.min(...['L', 'R'].flatMap(side => feet.map(p => toSpace(joints.get('LegLower' + side)!.object, point.copy(p)).y)));
  const floor = lowest();
  return { root, joints, poses, support: { legs, toSpace, lowest, floor }, reset() { for (const joint of joints.values()) { joint.object.position.copy(joint.position); joint.object.quaternion.copy(joint.rotation); } } };
}

test('authored guard requires opt-in valid metadata and leaves legacy rigs alone', () => {
  const f = fixture(); delete f.root.userData.authoredEnemy;
  assert.equal(AuthoredEnemyGuard.create(f.root, f.joints), undefined);
  f.root.userData.authoredEnemy = true; f.root.userData.guardPoseYUp = '{invalid';
  assert.equal(AuthoredEnemyGuard.create(f.root, f.joints), undefined);
});

test('world grounded-pose ownership requires a valid authored rig', () => {
  const make = () => {
    const f = fixture();
    for (const [name, joint] of f.joints) joint.object.userData.enemyJoint = name;
    return f;
  };
  const authored = make();
  assert.equal(new EnemyAnimator(authored.root, { kind: 'skeleton', phase: .7 }).ownsGroundedPose, true);
  const legacy = make(); delete legacy.root.userData.authoredEnemy;
  assert.equal(new EnemyAnimator(legacy.root, { kind: 'skeleton', phase: .7 }).ownsGroundedPose, false);
  const incomplete = make(); incomplete.joints.get('LegLowerR')!.object.removeFromParent();
  assert.equal(new EnemyAnimator(incomplete.root, { kind: 'skeleton', phase: .7 }).ownsGroundedPose, false);
});

test('reviewed guard composes recoil without rewriting neutral joint bases', () => {
  const f = fixture(), guard = AuthoredEnemyGuard.create(f.root, f.joints)!;
  const joint = f.joints.get('ArmUpperR')!, recoil = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), .15);
  joint.object.quaternion.copy(recoil); guard.apply({}, f.support);
  const expected = new Quaternion().fromArray(f.poses.ArmUpperR.quaternion).multiply(recoil);
  assert(joint.object.quaternion.angleTo(expected) < 1e-6);
  assert(joint.rotation.equals(new Quaternion()), 'Stored neutral basis must stay unchanged');
  assert(joint.object.position.equals(joint.position), 'The shoulder joint stays attached');
});

test('guard hip drop uses a grounded stagger and repeats without accumulating transforms', () => {
  const f = fixture(), guard = AuthoredEnemyGuard.create(f.root, f.joints)!;
  let prior: number[][] | undefined;
  for (let frame = 0; frame < 5; frame++) {
    f.reset(); guard.apply({}, f.support);
    assert(Math.abs(f.support.lowest() - f.support.floor) < 1e-6, 'Actual sole extremes stay at the original floor');
    for (const side of ['L', 'R']) {
      const low = Math.min(...f.support.legs.get(side)!.sole.map(p => f.support.toSpace(f.joints.get('LegLower' + side)!.object, p.clone()).y));
      assert(Math.abs(low - f.support.floor) < .001, 'Each planted foot must contact the floor');
    }
    const state = [...f.joints.values()].map(j => [...j.object.position.toArray(), ...j.object.quaternion.toArray()]);
    if (prior) assert.deepEqual(state, prior); prior = state;
  }
  assert(!f.joints.get('LegLowerL')!.object.quaternion.equals(f.joints.get('LegLowerR')!.object.quaternion), 'Feet are staggered rather than locked to one identical knee pose');
});

test('settled defeat does not receive an additional guard or support correction', () => {
  const f = fixture(), guard = AuthoredEnemyGuard.create(f.root, f.joints)!;
  f.joints.get('Body')!.object.position.y = .2;
  const before = [...f.joints.values()].map(j => [...j.object.position.toArray(), ...j.object.quaternion.toArray()]);
  guard.apply({ deathAge: .85 }, f.support);
  assert.deepEqual([...f.joints.values()].map(j => [...j.object.position.toArray(), ...j.object.quaternion.toArray()]), before);
});

test('authored defeat repairs small shin penetration without lifting for deep weapon defects', () => {
  const f = fixture(), guard = AuthoredEnemyGuard.create(f.root, f.joints)!;
  for (const name of ['Body', 'LegUpperL', 'LegUpperR']) f.joints.get(name)!.object.position.y -= .071;
  guard.apply({ deathAge: .3 }, f.support);
  assert(Math.abs(f.support.lowest() - f.support.floor) < 1e-6);
  f.reset();
  for (const name of ['Body', 'LegUpperL', 'LegUpperR']) f.joints.get(name)!.object.position.y -= .314;
  guard.apply({ deathAge: .85 }, f.support);
  assert(f.support.lowest() < -.3, 'A deep source/weapon defect must not be disguised by lifting the whole corpse');
});

test('cached sole correction preserves a reaction catch foot above the floor', () => {
  const f = fixture(), guard = AuthoredEnemyGuard.create(f.root, f.joints)!;
  f.joints.get('LegUpperR')!.object.position.y += .06;
  guard.apply({ brace: .3 }, f.support);
  const low = Math.min(...f.support.legs.get('R')!.sole.map(p => f.support.toSpace(f.joints.get('LegLowerR')!.object, p.clone()).y));
  assert(Math.abs(low - f.support.floor - .06) < .002, 'The catch foot must not be pinned down by the guard overlay');
  assert(Math.abs(f.support.lowest() - f.support.floor) < .001, 'The opposite foot remains planted');
});
