import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { CylinderGeometry, InstancedMesh, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { bendWraithPoint, wraithGatherGeometry } from '../src/rpg/world/wraithGather';
test('Gathered garment anchors its hem, lowers its top, and preserves source geometry',()=>{
 const source=new CylinderGeometry(.22,.6,1.4,16,12,true).translate(0,.7,0),original=source.getAttribute('position').array.slice();
 const geometry=wraithGatherGeometry(source),position=geometry.getAttribute('position'),delta=geometry.morphAttributes.position[0];
 let topDrop=0,radialChange=0;
 for(let i=0;i<position.count;i++){
  if(position.getY(i)<.001)assert(Math.abs(delta.getX(i))+Math.abs(delta.getY(i))+Math.abs(delta.getZ(i))<1e-6);
  if(position.getY(i)>1.39)topDrop=Math.max(topDrop,-delta.getY(i));
  radialChange=Math.max(radialChange,Math.hypot(delta.getX(i),delta.getZ(i)));
  assert(position.getY(i)+delta.getY(i)>=-1e-6);
 }
 assert(topDrop>.5&&radialChange>.15);assert.deepEqual(source.getAttribute('position').array,original);
 assert.equal(wraithGatherGeometry(source),geometry);
 assert([...geometry.morphAttributes.normal[0].array].every(Number.isFinite));
 source.dispose();geometry.dispose();
});
test('Compacted instanced garments retain each actor morph independently',()=>{
 const source=new CylinderGeometry(.22,.6,1.4,12,8,true).translate(0,.7,0),geometry=wraithGatherGeometry(source),material=new MeshStandardMaterial();
 const first=new Mesh(geometry,material),second=new Mesh(geometry,material);first.morphTargetInfluences![0]=1;second.morphTargetInfluences![0]=0;
 const batch=new InstancedMesh(geometry,material,2);batch.setMorphAt(0,first);batch.setMorphAt(1,second);
 const read=new Mesh(geometry,material);batch.getMorphAt(0,read);assert.equal(read.morphTargetInfluences![0],1);
 batch.setMorphAt(0,second);batch.count=1;batch.getMorphAt(0,read);assert.equal(read.morphTargetInfluences![0],0);
 assert.equal(first.morphTargetInfluences![0],1);assert.equal(second.morphTargetInfluences![0],0);
 const point=new Vector3();first.getVertexPosition(0,point);assert(Number.isFinite(point.y));
 batch.dispose();geometry.dispose();source.dispose();material.dispose();
});
test('Short cape and full robe use one continuous bend with preserved centerline length',()=>{
 const robe=new CylinderGeometry(.22,.6,1.6,12,32,true).translate(0,.8,0),cape=new CylinderGeometry(.22,.4,.8,12,16,true).translate(0,.4,0);
 const envelope={hem:0,height:1.6},a=wraithGatherGeometry(robe,envelope),b=wraithGatherGeometry(cape,envelope);
 for(const g of [a,b]){const p=g.getAttribute('position'),d=g.morphAttributes.position[0];for(let i=0;i<p.count;i++){const expected=new Vector3(p.getX(i),p.getY(i),p.getZ(i));bendWraithPoint(expected,0,1.6);expected.y=Math.max(0,expected.y);assert(expected.distanceTo(new Vector3(p.getX(i)+d.getX(i),p.getY(i)+d.getY(i),p.getZ(i)+d.getZ(i)))<1e-6);}}
 let length=0,last=new Vector3();for(let i=1;i<=160;i++){const next=new Vector3(0,i/100,0);bendWraithPoint(next,0,1.6);length+=next.distanceTo(last);last=next;}assert(Math.abs(length-1.6)<.005,'Cloth centerline bends instead of shortening into a skirt');
 a.dispose();b.dispose();robe.dispose();cape.dispose();
});
