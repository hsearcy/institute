import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Bone, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { authoredHeroGrip, HeldEquipment } from '../src/rpg/world/HeldEquipment';

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
