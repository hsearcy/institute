import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Object3D, Vector3 } from 'three';
import { EnemyAnimator } from '../src/rpg/world/EnemyAnimator';

function exportedRig(kind: string): { root: Object3D; nodes: Object3D[]; soles: { node: Object3D; vertices: Vector3[] }[] } {
  const bytes = readFileSync(new URL(`../public/assets/rpg/${kind}.glb`, import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const nodes: Object3D[] = gltf.nodes.map((node: any) => {
    const object = new Object3D(); object.name = node.name; object.userData = node.extras ?? {};
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
    if (node.mesh === undefined || !node.name.startsWith('LegLower')) return;
    const vertices: Vector3[] = [];
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION], view = gltf.bufferViews[accessor.bufferView];
      assert.equal(accessor.componentType, 5126);
      for (let vertex = 0; vertex < accessor.count; vertex++) {
        const offset = binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + vertex * (view.byteStride ?? 12);
        vertices.push(new Vector3(bytes.readFloatLE(offset), bytes.readFloatLE(offset + 4), bytes.readFloatLE(offset + 8)));
      }
    }
    soles.push({ node: nodes[index], vertices });
  });
  return { root, nodes, soles };
}

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
