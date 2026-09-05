import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Object3D } from 'three';
import { EnemyAnimator } from '../src/rpg/world/EnemyAnimator';
for (const kind of ['skeleton','guardian']) test(`${kind} exported joints animate shared instance sources independently`, () => {
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
