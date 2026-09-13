import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Bone, Group, Matrix4, Quaternion, Vector3 } from 'three';
import { tripoHeroEquipment } from '../src/rpg/world/HeldEquipment';

function freshRig() {
  const hero = new Group(), source = new Group(), right = new Bone(), left = new Bone(), head = new Bone();
  hero.add(source); source.add(right, left, head);
  hero.position.set(3, .2, -4); hero.scale.setScalar(1.8); hero.rotation.y = .7;
  source.scale.setScalar(.6); source.rotation.y = -.4;
  right.name = 'mixamorigRightHand'; left.name = 'mixamorigLeftHand';
  right.position.set(-.25, .5, .12); left.position.set(.25, .5, .12); head.position.y = .9;
  const grip = new Group(); grip.name = 'TripoGrip'; grip.position.set(.01, -.025, .015);
  grip.rotation.set(.25, -.6, .3); grip.scale.setScalar(.7); right.add(grip);
  const cast = new Group(); cast.name = 'TripoCastOrigin'; cast.position.set(.005, -.04, .012); left.add(cast);
  const crown = new Group(); crown.name = 'TripoHeadSocket'; crown.position.y = .04; head.add(crown);
  const sword = new Group(), tip = new Group(); sword.name = 'TripoDefaultSword'; sword.userData.sourcePart = 'equipped_sword';
  tip.name = 'Tip'; tip.position.set(-.08, -.6, .2); sword.add(tip); right.add(sword);
  return { hero, right, left, head, grip, cast, sword, tip };
}

function item(id: string, attachment = 'hand.R') {
  const root = new Group(), grip = new Group(), tip = new Group();
  root.userData = { itemId: id, attachment };
  grip.userData.attachmentRole = 'Grip'; tip.userData.attachmentRole = 'Tip';
  grip.position.set(.03, .12, -.02); grip.rotation.x = .35;
  tip.position.set(.02, .65, .04); root.add(grip, tip);
  return root;
}

test('Tripo items follow exported grip frames through source normalization and hand animation', () => {
  const f = freshRig(), equipment = tripoHeroEquipment(f.hero);
  assert(equipment?.replace(item('test-blade')));
  for (const angle of [-.8, 0, .9]) {
    f.right.rotation.set(angle, .3, -.2); f.hero.updateMatrixWorld(true);
    const mount = f.right.getObjectByName('HeldEquipment')!;
    const grip = mount.children[0].children.find(child => child.userData.attachmentRole === 'Grip')!;
    assert(grip.matrixWorld.elements.every((value, i) => Math.abs(value - f.grip.matrixWorld.elements[i]) < 1e-7));
  }
  assert.equal(f.sword.visible, false);
});

test('CastOrigin uses the new left-palm marker and setup does not duplicate it', () => {
  const f = freshRig(); tripoHeroEquipment(f.hero); tripoHeroEquipment(f.hero);
  assert.equal(f.cast.children.filter(node => node.name === 'CastOrigin').length, 1);
  const origin = f.hero.getObjectByName('CastOrigin')!;
  f.left.rotation.set(.5, .1, -.4); f.hero.updateMatrixWorld(true);
  assert(origin.getWorldPosition(new Vector3()).distanceTo(f.cast.getWorldPosition(new Vector3())) < 1e-8);
  assert.notEqual(origin.parent, f.right);
});

test('Rigid Tripo default sword restores after weapon replacement and remains the blade for a crown', () => {
  const f = freshRig(), equipment = tripoHeroEquipment(f.hero)!;
  const grip = new Vector3(), tip = new Vector3();
  assert(equipment.replace(item('replacement'))); assert.equal(f.sword.visible, false);
  assert(equipment.replace(item('crown', 'head'))); assert.equal(f.sword.visible, true);
  for (const angle of [-.5, .8]) {
    f.right.rotation.y = angle; f.hero.updateMatrixWorld(true);
    assert(equipment.sampleWorldBlade(grip, tip));
    assert(tip.distanceTo(f.tip.getWorldPosition(new Vector3())) < 1e-8);
    assert(grip.distanceTo(f.grip.getWorldPosition(new Vector3())) < 1e-8);
  }
  equipment.clear(); assert(equipment.sampleWorldBlade(grip, tip));
});

test('Tripo adapter rejects missing/invalid frames and respects explicitly authored socket matrices', () => {
  assert.equal(tripoHeroEquipment(new Group()), undefined);
  const f = freshRig(); f.grip.matrixAutoUpdate = false;
  f.grip.matrix.compose(new Vector3(.02, -.06, .04), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), .4), new Vector3(.5, .5, .5));
  const before = f.grip.matrix.clone(), equipment = tripoHeroEquipment(f.hero);
  assert(equipment); assert.deepEqual(f.grip.matrix.elements, before.elements);
  f.grip.matrix.copy(new Matrix4().makeScale(0, 0, 0));
  assert.equal(tripoHeroEquipment(f.hero), undefined);
});

 test('Hand relics retain the fresh rig socket scale and hide its default sword', () => {
  for (const id of ['thunderbell', 'stormorbit']) {
    const f = freshRig(), equipment = tripoHeroEquipment(f.hero)!;
    assert(equipment.replace(item(id, 'belt')));
    for (const angle of [-.5, .8]) {
      f.right.rotation.y = angle; equipment.update(0); f.hero.updateMatrixWorld(true);
      const mount = f.right.getObjectByName('HeldEquipment')!;
      const actualGrip = mount.children[0].children.find(child => child.userData.attachmentRole === 'Grip')!;
      const expectedScale = f.grip.getWorldScale(new Vector3()).multiplyScalar(id === 'stormorbit' ? 1.8 : 1.6);
      assert(actualGrip.getWorldScale(new Vector3()).distanceTo(expectedScale) < 1e-8);
      const gap = actualGrip.getWorldPosition(new Vector3()).distanceTo(f.grip.getWorldPosition(new Vector3()));
      if (id === 'thunderbell') assert(gap < 1e-8);
      else assert(Math.abs(gap - Math.hypot(.32, .25) * f.grip.getWorldScale(new Vector3()).x) < 1e-8);
      assert.equal(f.sword.visible, false);
    }
  }
});
