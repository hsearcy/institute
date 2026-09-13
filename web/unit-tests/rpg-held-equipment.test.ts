import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Bone, BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';
import { authoredHeroGrip, HeldEquipment, legacyHeroEquipment } from '../src/rpg/world/HeldEquipment';

function fixture() {
  const hero = new Group(), hand = new Bone(); hero.add(hand);
  hero.position.set(4, 2, -8); hero.scale.setScalar(1.3); hero.rotation.y = .8;
  hand.position.set(-.4, 1, .1); hand.rotation.set(.4, -.3, .2);
  const blade = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  blade.userData.sourcePart = 'equipped_sword'; hero.add(blade);
  const source = new Group(), root = new Group(), grip = new Group();
  source.add(root); root.add(grip); grip.name = 'Grip.029';
  root.userData = { itemId: 'apprentice', attachment: 'hand.R', gripNode: grip.name };
  // Nontrivial export transforms exercise the full grip contract.
  root.position.set(.2, -.1, .3); root.rotation.z = .2;
  grip.position.set(.03, .04, -.02); grip.rotation.x = -.5;
  const material = new MeshStandardMaterial(), mesh = new Mesh(new BoxGeometry(), material); root.add(mesh);
  return { hero, hand, blade, source, grip, mesh, material };
}

test('Bell and orb replace the sword at the animated hand rather than the belt', () => {
  for (const id of ['thunderbell', 'stormorbit']) {
    const f = fixture(); f.source.children[0].userData.itemId = id;
    f.source.children[0].userData.attachment = 'belt';
    const equipment = new HeldEquipment(f.hero, f.hand, authoredHeroGrip());
    assert(equipment.replace(f.source)); assert.equal(f.blade.visible, false);
    for (const angle of [0, .7, 1.4]) {
      f.hand.rotation.x = angle; f.hero.updateMatrixWorld(true); equipment.update(angle);
      const mount = f.hand.getObjectByName('HeldEquipment')!;
      assert.equal(mount.userData.attachment, 'hand.R');
      const actual = f.hand.getObjectByName(f.grip.name)!.getWorldPosition(new Vector3());
      const palm = f.hand.localToWorld(new Vector3().setFromMatrixPosition(authoredHeroGrip()));
      assert(id === 'thunderbell' ? actual.distanceTo(palm) < 1e-7 : actual.distanceTo(palm) > .2);
      assert.equal(equipment.sampleWorldBlade(new Vector3(), new Vector3()), false, 'Relics do not create sword trails');
    }
    equipment.clear(); assert.equal(f.blade.visible, true);
  }
});

test('Nested item grip tracks the measured palm through parent animation and model scale', () => {
  const f = fixture(), socket = authoredHeroGrip(), equipment = new HeldEquipment(f.hero, f.hand, socket);
  assert(equipment.replace(f.source));
  for (const rotation of [0, .7, 1.9]) {
    f.hand.rotation.y = rotation; f.hero.updateMatrixWorld(true);
    const actual = f.hand.getObjectByName(f.grip.name)!.matrixWorld;
    const expected = new Matrix4().multiplyMatrices(f.hand.matrixWorld, socket);
    assert(actual.elements.every((value, index) => Math.abs(value - expected.elements[index]) < 1e-7));
  }
  assert.equal(f.blade.visible, false);
  assert.equal(f.source.parent, null, 'A cached source never becomes an actor instance');
  const basis = new Matrix4().extractRotation(socket);
  assert(Math.abs(basis.determinant() - 1) < 1e-6, 'The measured frame must not mirror the item');
});

test('Failed replacement preserves the item; clearing restores original visibility without disposing cached materials', () => {
  const f = fixture(), equipment = new HeldEquipment(f.hero, f.hand, authoredHeroGrip());
  f.blade.visible = false;
  let disposed = false; f.material.addEventListener('dispose', () => { disposed = true; });
  assert(equipment.replace(f.source));
  const count = f.hand.children.length;
  assert.equal(equipment.replace(new Group()), false);
  assert.equal(equipment.itemId, 'apprentice'); assert.equal(f.hand.children.length, count);
  equipment.clear(); equipment.clear();
  assert.equal(f.hand.children.length, 0); assert.equal(f.blade.visible, false); assert.equal(disposed, false);
  assert.equal(f.mesh.material, f.material);
});

test('Replacing the held model removes its old instance and accepts suffixed grip role metadata', () => {
  const f = fixture(), equipment = new HeldEquipment(f.hero, f.hand, authoredHeroGrip());
  assert(equipment.replace(f.source));
  const next = f.source.clone(true), root = next.children[0];
  root.userData.itemId = 'cinderbranch'; root.userData.gripNode = 'old-export-name';
  root.children[0].userData.attachmentRole = 'Grip';
  assert(equipment.replace(next));
  assert.equal(equipment.itemId, 'cinderbranch'); assert.equal(f.hand.children.length, 1);
  assert.equal(f.blade.visible, false);
  equipment.clear(); assert.equal(f.blade.visible, true);
});

test('Blade samples follow actual tip/grip role nodes through animation and clear with the mount', () => {
  const f = fixture(), tip = new Group(); tip.position.set(.06, 1.1, -.03); tip.userData.attachmentRole = 'Tip';
  f.source.children[0].add(tip); f.grip.userData.attachmentRole = 'Grip';
  const equipment = new HeldEquipment(f.hero, f.hand, authoredHeroGrip()), gripWorld = new Vector3(), tipWorld = new Vector3();
  assert(equipment.replace(f.source));
  for (const angle of [-.4, .3, 1.2]) {
    f.hand.rotation.z = angle; f.hero.updateMatrixWorld(true);
    assert(equipment.sampleWorldBlade(gripWorld, tipWorld));
    const actualTip = f.hand.getObjectByName('HeldEquipment')!.children[0].children[0].children.find(node => node.userData.attachmentRole === 'Tip')!;
    assert(tipWorld.distanceTo(actualTip.getWorldPosition(new Vector3())) < 1e-8);
    assert(gripWorld.distanceTo(new Vector3().setFromMatrixPosition(new Matrix4().multiplyMatrices(f.hand.matrixWorld, authoredHeroGrip()))) < 1e-8);
  }
  equipment.clear(); assert.equal(equipment.sampleWorldBlade(gripWorld, tipWorld), false);
});

test('A rigid embedded sword caches its real endpoint and follows the hand without a replacement asset', () => {
  const hero = new Group(), hand = new Bone(); hero.add(hand);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, .9, 0, .03, .75, .01, 0, -.12, 0], 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(12).fill(0), 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const blade = new SkinnedMesh(geometry, new MeshStandardMaterial()); blade.userData.sourcePart = 'equipped_sword'; hero.add(blade);
  hero.updateMatrixWorld(true); blade.bind(new Skeleton([hand]));
  // Runtime normalizes the loaded actor before creating its equipment helper.
  hero.scale.setScalar(1.1); hero.position.set(2, .2, -3); hero.rotation.y = .4;
  const head = new Bone(); hero.add(head);
  const equipment = new HeldEquipment(hero, hand, new Matrix4(), { head: { parent: head, transform: new Matrix4() } }), grip = new Vector3(), tip = new Vector3();
  const crown = new Group(), anchor = new Group(), crownTip = new Group();
  anchor.userData.attachmentRole = 'Grip'; crownTip.userData.attachmentRole = 'Tip'; crownTip.position.y = .2;
  crown.userData = { attachment: 'head', itemId: 'inferno' }; crown.add(anchor, crownTip);
  assert(equipment.replace(crown)); assert.equal(blade.visible, true);
  hero.scale.setScalar(1.35); hero.position.set(3, .2, -4);
  for (const angle of [-.8, .1, 1.1]) {
    hand.rotation.x = angle; hand.position.set(.1, 1.2, -.15); hero.updateMatrixWorld(true);
    assert(equipment.sampleWorldBlade(grip, tip));
    assert(tip.distanceTo(blade.getVertexPosition(0, new Vector3()).applyMatrix4(blade.matrixWorld)) < 1e-7);
    assert(grip.distanceTo(hand.getWorldPosition(new Vector3())) < 1e-7);
    assert(tip.distanceTo(crownTip.getWorldPosition(new Vector3())) > .1, 'A worn crown does not replace the sword endpoint');
  }
  equipment.clear(); assert(equipment.sampleWorldBlade(grip, tip));
});

test('Wearables follow their own animated socket, retain the sword, and swap cleanly with held weapons', () => {
  for (const slot of ['head', 'chest', 'belt'] as const) {
    const f = fixture(), bone = new Bone(); f.hero.add(bone);
    const socket = new Matrix4().makeTranslation(.02, .16, .08);
    const equipment = new HeldEquipment(f.hero, f.hand, authoredHeroGrip(), { [slot]: { parent: bone, transform: socket } });
    assert(equipment.replace(f.source)); assert.equal(f.blade.visible, false);
    const relic = f.source.clone(true); relic.children[0].userData.attachment = slot;
    relic.children[0].userData.itemId = 'wearable';
    assert(equipment.replace(relic)); assert.equal(f.blade.visible, true);
    assert.equal(f.hand.children.length, 0); assert.equal(bone.children.length, 1);
    for (const angle of [-.7, .2, 1.1]) {
      bone.rotation.set(angle, .3, -.2); f.hero.updateMatrixWorld(true);
      const actual = bone.getObjectByName(f.grip.name)!.matrixWorld;
      const expected = new Matrix4().multiplyMatrices(bone.matrixWorld, socket);
      assert(actual.elements.every((value, i) => Math.abs(value - expected.elements[i]) < 1e-7));
    }
    assert.equal(equipment.sampleWorldBlade(new Vector3(), new Vector3()), false, 'A wearable marker is never a blade endpoint');
    assert(equipment.replace(f.source)); assert.equal(bone.children.length, 0); assert.equal(f.blade.visible, false);
    equipment.clear(); assert.equal(f.blade.visible, true);
  }
});

test('An unavailable wearable socket preserves the equipped weapon', () => {
  const f = fixture(), equipment = new HeldEquipment(f.hero, f.hand, authoredHeroGrip());
  assert(equipment.replace(f.source));
  const crown = f.source.clone(true); crown.children[0].userData.attachment = 'head';
  assert.equal(equipment.replace(crown), false);
  assert.equal(equipment.itemId, 'apprentice'); assert.equal(f.blade.visible, false);
  assert.equal(f.hand.children.length, 1);
});

test('Original armor rigs hide both imported sword parts and restore them after item removal', () => {
  const f = fixture(); f.hand.name = 'armR';
  const sword = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); sword.name = 'Sword_Baked';
  const glow = sword.clone(); glow.name = 'Sword_Glow003'; // GLTFLoader removes Blender's dot suffix.
  const armor = sword.clone(); armor.name = 'Body_Baked063';
  f.hero.add(sword, glow, armor);
  const equipment = legacyHeroEquipment(f.hero)!;
  assert(equipment); assert(equipment.replace(f.source));
  assert.equal(sword.visible, false); assert.equal(glow.visible, false); assert.equal(armor.visible, true);
  assert.equal(f.hand.children.length, 1);
  equipment.clear(); assert.equal(sword.visible, true); assert.equal(glow.visible, true);
  assert.equal(legacyHeroEquipment(new Group()), undefined);
});
