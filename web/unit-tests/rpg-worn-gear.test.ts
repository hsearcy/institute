import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Bone, Box3, BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';
import { pairHalves, sourceOrigin, WornGear } from '../src/rpg/world/wornGear';

/** A blocky hero: one skinned mesh with a box of vertices fully weighted to each part bone. */
function hero() {
  const root = new Bone(); root.name = 'Root';
  const bones: Bone[] = [root];
  const parts: [string, [number, number, number], [number, number, number]][] = [
    ['Spine02', [0, 1.2, 0], [.4, .5, .25]], ['Head', [0, 1.7, 0], [.25, .3, .25]],
    ['L_Hand', [.35, .8, 0], [.08, .12, .06]], ['R_Hand', [-.35, .8, 0], [.08, .12, .06]],
    ['L_Foot', [.12, .05, .05], [.1, .1, .2]], ['R_Foot', [-.12, .05, .05], [.1, .1, .2]],
  ];
  const positions: number[] = [], indices: number[] = [], weights: number[] = [];
  for (const [name, at, extent] of parts) {
    const bone = new Bone(); bone.name = name; bone.position.set(...at); root.add(bone); bones.push(bone);
    for (const corner of [[-1, -1, -1], [1, 1, 1], [-1, 1, 1], [1, -1, -1]]) {
      positions.push(...corner.map((sign, axis) => at[axis] + sign * extent[axis] / 2));
      indices.push(bones.length - 1, 0, 0, 0); weights.push(1, 0, 0, 0);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.add(root); mesh.bind(new Skeleton(bones));
  const model = new Group(); model.add(mesh);
  // Placement and scale like the game's normalised Tripo instance.
  model.position.set(3, 0, -2); model.scale.setScalar(1.4); model.rotation.y = .6;
  model.updateMatrixWorld(true);
  return { model, bone: (name: string) => bones.find(bone => bone.name === name)! };
}

function gear(width: number, height: number, side?: 'original') {
  const source = new Group(), mesh = new Mesh(new BoxGeometry(width, height, width), new MeshStandardMaterial());
  mesh.userData = { sourceOrigin: [0, 0, 0], ...(side ? { gearSide: side } : {}) };
  source.add(mesh);
  return source;
}

const worldCentre = (node: { updateWorldMatrix(a: boolean, b: boolean): void }) => new Box3().setFromObject(node as never).getCenter(new Vector3());

test('a helm rides on the head bone above the measured head', () => {
  const { model, bone } = hero(), worn = new WornGear(model);
  assert.equal(worn.ready, true);
  worn.wear('helm', 'iron_helm', gear(.3, .3));
  const head = bone('Head'), mount = head.children.find(child => child.name === 'Worn_helm');
  assert.ok(mount, 'the helm mounts under the head bone');
  model.updateMatrixWorld(true);
  const helm = worldCentre(mount!), skull = head.getWorldPosition(new Vector3());
  assert.ok(Math.hypot(helm.x - skull.x, helm.z - skull.z) < .02, 'centred over the head');
  assert.ok(helm.y > skull.y, 'sits at the top of the head');
  // It follows the bone through animation.
  const before = helm.clone().sub(skull);
  head.position.x += .3; model.updateMatrixWorld(true);
  const after = worldCentre(mount!).sub(head.getWorldPosition(new Vector3()));
  assert.ok(after.distanceTo(before) < 1e-6);
  assert.deepEqual(worn.worn(), { helm: 'iron_helm' });
  worn.remove('helm');
  assert.equal(head.children.includes(mount!), false);
});

test('gloves and boots put one side on each bone, the right side reflected', () => {
  const { model, bone } = hero(), worn = new WornGear(model);
  worn.wear('boots', 'soft_boots', gear(.1, .2, 'original'));
  worn.wear('gloves', 'cloth_wraps', gear(.08, .2, 'original'));
  for (const name of ['L_Foot', 'R_Foot', 'L_Hand', 'R_Hand']) assert.equal(bone(name).children.filter(child => child.name.startsWith('Worn_')).length, 1, name);
  model.updateMatrixWorld(true);
  const left = worldCentre(bone('L_Foot').children[0]), right = worldCentre(bone('R_Foot').children[0]);
  assert.ok(Math.abs(left.y - right.y) < 1e-6, 'both boots stand on the same floor');
  const foot = bone('L_Foot').getWorldPosition(new Vector3());
  assert.ok(Math.hypot(left.x - foot.x, left.z - foot.z) < .02, 'the left boot is centred on the left foot');
  worn.clear();
  assert.deepEqual(worn.worn(), {});
});

test('pair halves reflect the authored side about its own centre', () => {
  const source = gear(.1, .2, 'original'); source.children[0].position.x = .3;
  const [left, right] = pairHalves(source)!;
  assert.ok(left.box.min.distanceTo(right.box.min) < 1e-9 && left.box.max.distanceTo(right.box.max) < 1e-9);
  assert.ok(right.mesh.matrix.determinant() < 0);
  assert.equal(pairHalves(gear(.1, .2)), undefined, 'a model without sides is not worn as a pair');
});

test('the source origin converts Blender axes to glTF axes', () => {
  const mesh = new Mesh(); mesh.userData.sourceOrigin = [.1, .2, .3]; mesh.updateMatrixWorld(true);
  assert.deepEqual(sourceOrigin(mesh).toArray(), [.1, .3, -.2]);
});

test('a hero without a skin wears nothing', () => {
  const worn = new WornGear(new Group());
  assert.equal(worn.ready, false);
  worn.wear('helm', 'iron_helm', gear(.3, .3));
  assert.deepEqual(worn.worn(), {});
});
