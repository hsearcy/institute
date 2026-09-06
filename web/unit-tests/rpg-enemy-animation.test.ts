import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BufferGeometry, Float32BufferAttribute, Mesh, Object3D, Vector3 } from 'three';
import { EnemyAnimator } from '../src/rpg/world/EnemyAnimator';

function exportedRig(kind: string): { root: Object3D; nodes: Object3D[]; soles: { node: Object3D; vertices: Vector3[] }[] } {
  const bytes = readFileSync(new URL(`../public/assets/rpg/${kind}.glb`, import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const nodes: Object3D[] = gltf.nodes.map((node: any) => {
    const object = node.mesh === undefined ? new Object3D() : new Mesh(new BufferGeometry()); object.name = node.name; object.userData = node.extras ?? {};
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    if (node.matrix) { object.matrix.fromArray(node.matrix); object.matrix.decompose(object.position, object.quaternion, object.scale); }
    return object;
  });
  gltf.nodes.forEach((node: any, index: number) => node.children?.forEach((child: number) => nodes[index].add(nodes[child])));
  const root = new Object3D(); gltf.scenes[gltf.scene ?? 0].nodes.forEach((index: number) => root.add(nodes[index]));
  const binaryStart = 20 + bytes.readUInt32LE(12) + 8;
  const soles: { node: Object3D; vertices: Vector3[] }[] = [];
  gltf.nodes.forEach((node: any, index: number) => {
    if (node.mesh === undefined) return;
    const vertices: Vector3[] = [];
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION], view = gltf.bufferViews[accessor.bufferView];
      assert.equal(accessor.componentType, 5126);
      for (let vertex = 0; vertex < accessor.count; vertex++) {
        const offset = binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + vertex * (view.byteStride ?? 12);
        vertices.push(new Vector3(bytes.readFloatLE(offset), bytes.readFloatLE(offset + 4), bytes.readFloatLE(offset + 8)));
      }
    }
    if (nodes[index] instanceof Mesh) (nodes[index] as Mesh).geometry.setAttribute('position', new Float32BufferAttribute(vertices.flatMap(v => v.toArray()), 3));
    if (node.name.startsWith('LegLower')) soles.push({ node: nodes[index], vertices });
  });
  return { root, nodes, soles };
}

for (const kind of ['skeleton', 'guardian', 'revenant', 'wraith']) test(`${kind} survivor shoulder recoil retains connected joints and resets into guard`, () => {
  const { root, nodes } = exportedRig(kind), animator = new EnemyAnimator(root, { kind, phase: .7 });
  const positions = nodes.map(node => node.position.clone());
  animator.update(2, { moving: 0, threat: 0 });
  const baseline = nodes.map(node => node.quaternion.clone());
  animator.update(2, { moving: 0, threat: 0, recoil: .8, impactSide: -1, brace: .5, injury: .35 });
  const struck = nodes.map(node => node.quaternion.clone());
  assert(nodes.some((node, i) => !node.quaternion.equals(baseline[i])), 'The body must visibly react');
  nodes.forEach((node, i) => { if (!['Body', 'LegUpperL', 'LegUpperR'].includes(node.userData.enemyJoint)) assert(node.position.equals(positions[i]), 'Only the supported hips/torso move; limb attachments stay intact'); });
  animator.update(2, { moving: 0, threat: 0, injury: .35 });
  assert(nodes.some((node, i) => !node.quaternion.equals(struck[i])), 'Recoil recovers rather than freezing');
  root.updateMatrixWorld(true); nodes.forEach(node => assert(node.matrixWorld.elements.every(Number.isFinite)));
  animator.update(2, { moving: 0, threat: 0 });
  nodes.forEach((node, i) => assert(node.quaternion.equals(baseline[i]), 'Fresh-health state has no leaked injury pose'));
});

for (const kind of ['skeleton', 'guardian', 'revenant']) test(`${kind} asymmetric survivor catch keeps an actual support sole on the floor`, () => {
  const { root, soles } = exportedRig(kind), animator = new EnemyAnimator(root, { kind, phase: .7 }), point = new Vector3();
  for (const brace of [0, .1, .3, .6, .9]) for (const side of [-1, 1]) {
    animator.update(2, { moving: 0, threat: 0, brace, injury: .35, impactSide: side }); root.updateMatrixWorld(true);
    const lowest = Math.min(...soles.flatMap(sole => sole.vertices.map(vertex => point.copy(vertex).applyMatrix4(sole.node.matrixWorld).y)));
    assert(lowest >= -.025 && lowest <= .035, `Actual supporting sole must remain at floor, received ${lowest}`);
  }
});

for (const kind of ['skeleton', 'revenant']) for (const phase of [.7, 2.2]) test(`${kind} grounded fall ${phase} has a low rib support without buried geometry`, () => {
  const { root, nodes } = exportedRig(kind), animator = new EnemyAnimator(root, { kind, phase }), point = new Vector3();
  animator.update(2, { deathAge: .85, collapse: 'grounded' }); root.updateMatrixWorld(true);
  let floor = Infinity, rib = Infinity;
  for (const node of nodes) if (node instanceof Mesh) {
    const position = node.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld); floor = Math.min(floor, point.y);
      if (node.name.startsWith('Body')) rib = Math.min(rib, point.y);
    }
  }
  assert(floor > -.035, `Body must not be buried; minimum ${floor}`);
  assert(rib < .18, `Rib cage needs visible ground support, minimum ${rib}`);
});

for (const kind of ['guardian', 'wraith']) test(`${kind} body-specific settle keeps complete geometry above the floor`, () => {
  const { root, nodes } = exportedRig(kind), animator = new EnemyAnimator(root, { kind, phase: .7 }), point = new Vector3();
  for (const age of [.3, .5, .8, 1.2]) {
    animator.update(2, { deathAge: age, collapse: 'grounded' }); root.updateMatrixWorld(true);
    let floor = Infinity;
    for (const node of nodes) if (node instanceof Mesh) {
      const position = node.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) floor = Math.min(floor, node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld).y);
    }
    assert(floor >= -.04, `${kind} at ${age}: geometry below floor ${floor}`);
    nodes.forEach(node => assert.deepEqual(node.scale.toArray(), [1, 1, 1], 'Settling must not squash the rigid model'));
  }
});

test('Wraith cloth folds and rigid attachments reset independently on a new living pose', () => {
  const { root, nodes } = exportedRig('wraith'), animator = new EnemyAnimator(root, { kind: 'wraith', phase: .7 });
  const positions = nodes.map(node => node.position.clone());
  animator.update(2, { deathAge: 1, collapse: 'grounded' });
  const cloth = nodes.filter(node => node instanceof Mesh && node.morphTargetInfluences?.length) as Mesh[];
  assert.equal(cloth.length, 4, 'Long upper sleeve panels bend with the robe');
  assert(cloth.every(node => node.morphTargetInfluences![0] === 1));
  animator.update(2, { moving: 0, threat: 0 });
  assert(cloth.every(node => node.morphTargetInfluences![0] === 0));
  nodes.forEach((node, i) => assert(node.position.equals(positions[i]), 'Head and hands recover their exact rest attachment positions'));
});

test('Wraith staff hand releases below the bowed head after its failed brace', () => {
  const { root, nodes } = exportedRig('wraith'), animator = new EnemyAnimator(root, { kind: 'wraith', phase: .7 });
  const forearm = nodes.find(node => node.userData.enemyJoint === 'ArmLowerL')!, head = nodes.find(node => node.userData.enemyJoint === 'Head')!;
  // Measured source LeftHand joint relative to the actual exported forearm pivot.
  const wrist = new Vector3(.43951 - .26465, 1.29083 - 1.26101, .31233 - .14644);
  animator.update(2, { deathAge: .55, collapse: 'grounded' }); root.updateMatrixWorld(true);
  const braceY = wrist.clone().applyMatrix4(forearm.matrixWorld).y;
  animator.update(2, { deathAge: .95, collapse: 'grounded' }); root.updateMatrixWorld(true);
  const releasedY = wrist.clone().applyMatrix4(forearm.matrixWorld).y;
  assert(releasedY < braceY - .2, 'Holding hand must visibly lose support after its brace');
  assert(releasedY < head.getWorldPosition(new Vector3()).y - .12, 'Staff hand must hang below the bowed head');
});

test('Guardian fatal contact retains shoulder impulse against its planted lower mass', () => {
  const { root, nodes } = exportedRig('guardian'), animator = new EnemyAnimator(root, { kind: 'guardian', phase: .7 });
  const body = nodes.find(node => node.userData.enemyJoint === 'Body')!;
  const lowLeg = nodes.find(node => node.userData.enemyJoint === 'LegLowerL')!, legZ = lowLeg.position.z;
  const z = body.position.z;
  animator.update(2, { deathAge: .03, collapse: 'grounded', recoil: .8, impactSide: -1 });
  assert(body.position.z < z - .12, 'Early fall override must not erase the contact impulse');
  assert.equal(lowLeg.position.z, legZ, 'Shoulder displacement must not move the planted lower mass with it');
});

for (const kind of ['skeleton', 'guardian', 'revenant']) for (const phase of [.7, 2.2]) test(`${kind} electric variant ${phase} keeps actual sole geometry grounded through its hold`, () => {
  const { root, soles } = exportedRig(kind), animator = new EnemyAnimator(root, { kind, phase }), point = new Vector3();
  assert.equal(soles.length, 2, 'Both exported lower legs must be measured');
  for (let frame = 0; frame <= 66; frame++) {
    animator.update(4, { deathAge: frame / 60, collapse: 'electric' }); root.updateMatrixWorld(true);
    let soleY = Infinity;
    for (const sole of soles) for (const vertex of sole.vertices) soleY = Math.min(soleY, point.copy(vertex).applyMatrix4(sole.node.matrixWorld).y);
    assert(soleY >= -.025 && soleY <= .035, `${kind} soles at ${frame / 60}s must settle at the floor, received ${soleY}`);
  }
});

for (const kind of ['skeleton', 'guardian', 'revenant']) test(`${kind} electric collapse keeps attachments intact, lowers weight, and resets independently`, () => {
  const { root, nodes } = exportedRig(kind), untouched = root.clone(true);
  const animator = new EnemyAnimator(root, { kind, phase: .7 });
  const joints = nodes.filter(node => node.userData.enemyJoint);
  const attachments = joints.map(node => node.position.clone());
  animator.update(0, { moving: 0, threat: 0 }); root.updateMatrixWorld(true);
  const alive = nodes.map(node => ({ position: node.position.clone(), rotation: node.quaternion.clone() }));
  const head = joints.find(node => node.userData.enemyJoint === 'Head')!;
  const initialHeadY = head.matrixWorld.elements[13];
  for (const age of [0, .05, .24, .6, 1.1, 3]) {
    animator.update(4, { deathAge: age, collapse: 'electric' }); root.updateMatrixWorld(true);
    joints.forEach((joint, index) => {
      assert.equal(joint.position.x, attachments[index].x, 'Electrical collapse must not pull joints laterally apart');
      assert.equal(joint.position.z, attachments[index].z, 'Electrical collapse must not explode limbs forward');
    });
    for (const node of nodes) assert(node.matrixWorld.elements.every(Number.isFinite));
  }
  assert(head.matrixWorld.elements[13] < initialHeadY - .15, 'Head/torso weight must settle downward');
  const cloneJoints: Object3D[] = []; untouched.traverse(node => { if (node.userData.enemyJoint) cloneJoints.push(node); });
  cloneJoints.forEach((joint, index) => assert(joint.position.equals(attachments[joints.findIndex(node => node.name === joint.name)]), 'Other actors retain their own poses'));
  animator.update(0, { moving: 0, threat: 0 });
  nodes.forEach((node, index) => { assert(node.position.equals(alive[index].position)); assert(node.quaternion.equals(alive[index].rotation)); });
  animator.update(4, { deathAge: .7 });
  assert(joints.some((joint, index) => !joint.position.equals(attachments[index])), 'Other spells retain their existing breakup choreography');
});

test('An arm-only wraith rig animates its staff while an unrigged legacy wraith stays independent', () => {
  const root = new Object3D(), body = new Object3D(), arm = new Object3D(), forearm = new Object3D(), staff = new Object3D();
  body.userData.enemyJoint = 'Body'; arm.userData.enemyJoint = 'ArmUpperR'; forearm.userData.enemyJoint = 'ArmLowerR';
  root.add(body); body.add(arm); arm.add(forearm); forearm.add(staff); staff.position.set(.1, -.4, .1);
  const animator = new EnemyAnimator(root, { kind: 'wraith', phase: 0 });
  assert.equal(animator.articulated, true);
  root.updateMatrixWorld(true); const before = staff.matrixWorld.clone();
  animator.update(3.9); root.updateMatrixWorld(true); assert(!staff.matrixWorld.equals(before));
  animator.update(4, { deathAge: .6, collapse: 'electric' }); root.updateMatrixWorld(true);
  assert(staff.matrixWorld.elements.every(Number.isFinite));
  assert.equal(new EnemyAnimator(new Object3D(), { kind: 'wraith', phase: 0 }).articulated, false);
  assert.equal(new EnemyAnimator(root.clone(true), { kind: 'skeleton', phase: 0 }).articulated, false);
});

for (const kind of ['skeleton','guardian','revenant']) test(`${kind} exported joints animate shared instance sources independently`, () => {
 const bytes = readFileSync(new URL(`../public/assets/rpg/${kind}.glb`, import.meta.url));
 const gltf = JSON.parse(bytes.subarray(20,20 + bytes.readUInt32LE(12)).toString());
 const nodes=gltf.nodes.map((n:any)=> {const o=new Object3D();o.name=n.name;o.userData=n.extras??{};if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);if(n.matrix){o.matrix.fromArray(n.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);}return o;});
 gltf.nodes.forEach((n:any,i:number)=>n.children?.forEach((child:number)=>nodes[i].add(nodes[child])));
 const root=new Object3D();gltf.scenes[gltf.scene??0].nodes.forEach((i:number)=>root.add(nodes[i]));
 const other=root.clone(true),anim=new EnemyAnimator(root,{kind,phase:0}),cloneAnim=new EnemyAnimator(other,{kind,phase:1});
 assert.equal(anim.articulated,true);assert.equal(cloneAnim.articulated,true);
 root.updateMatrixWorld(true);const baseline=nodes.map((o:any)=>o.matrixWorld.clone());
 anim.update(4.2,{moving:.8});root.updateMatrixWorld(true);
 assert(nodes.some((o:any,i:number)=>!o.matrixWorld.equals(baseline[i])),'Pose must reach instance source matrices');
 const sword=nodes.find((o:any)=>o.userData.enemyJoint==='Sword');
 if(sword)assert(sword.parent.userData.enemyJoint==='ArmLowerR','Weapon follows forearm pivot');
 let cloneChanged=false;other.traverse((o:any)=>{if(o.quaternion.x||o.quaternion.y||o.quaternion.z)cloneChanged=true});assert(!cloneChanged,'Cloned actor pose stays independent');
 anim.update(5,{deathAge:.7});root.updateMatrixWorld(true);const arm=nodes.find((o:any)=>o.userData.enemyJoint==='ArmLowerR');const deadPosition=arm.position.clone();
 anim.update(0,{moving:0,threat:0});assert(!arm.position.equals(deadPosition),'Death offsets reset when alive');
 for(const age of [0,.05,.2,.8,1.1,3]){anim.update(3,{deathAge:age});root.updateMatrixWorld(true);for(const o of nodes)assert(o.matrixWorld.elements.every(Number.isFinite));}

});
