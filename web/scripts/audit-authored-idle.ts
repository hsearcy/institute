// Actual candidate idle support/projection audit. Representative game headings, not a visual score.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {BufferGeometry,Float32BufferAttribute,Mesh,Object3D,Vector3,OrthographicCamera} from '../node_modules/three/build/three.module.js';
import {EnemyAnimator} from '../src/rpg/world/EnemyAnimator';
function exportedRig(kind: string): { root: Object3D; nodes: Object3D[]; soles: { node: Object3D; vertices: Vector3[] }[] } {
  const bytes = readFileSync(kind);
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


const file=process.argv[2];assert(file,'Usage: bun web/scripts/audit-authored-idle.ts candidate.glb [report.json]');
const {root}=exportedRig(file),a:any=new EnemyAnimator(root,{kind:'skeleton',phase:1.77});
assert(a.authoredGuard,'The real authored hook must be active');
const support=a.authoredGuardSupport,cam=new OrthographicCamera(-18,18,11.25,-11.25,.1,180);
cam.position.set(17,25,20);cam.lookAt(0,.2,-1.8);cam.updateMatrixWorld();
const orient=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const crosses=(a:number[],b:number[],c:number[],d:number[])=>orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0;
const rows:any[]=[];
for(const yaw of [-1,-.85,-.7,-.55,-.2,0,.2,.5])for(const time of [1,2,3,4]){
 root.rotation.y=yaw;a.update(time,{moving:.65,threat:.8});root.updateMatrixWorld(true);
 const legs=['L','R'].map(side=>{
  const lower=a.joints.get('LegLower'+side).object,upper=a.joints.get('LegUpper'+side).object,leg=support.legs.get(side);
  const sole=Math.min(...leg.sole.map((p:Vector3)=>support.toSpace(lower,p.clone()).y));
  const path=[new Vector3().applyMatrix4(upper.matrixWorld),new Vector3().applyMatrix4(lower.matrixWorld),leg.foot.clone().applyMatrix4(lower.matrixWorld)].map(p=>{p.project(cam);return[p.x*720,p.y*450];});
  assert(Math.abs(sole-support.floor)<.001,'Each actual sole stays planted');return{side,sole,path};
 });
 const intersections=[0,1].flatMap(i=>[0,1].filter(j=>crosses(legs[0].path[i],legs[0].path[i+1],legs[1].path[j],legs[1].path[j+1])).map(j=>[i,j]));
 rows.push({yaw,time,legs,intersections});
}
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify({file,scope:'Representative eight headings and four animation times at gameplay camera elevation; actual mesh sole support; no native visual approval',rows}));
assert(rows.every(r=>r.intersections.length===0),'Projected leg centerlines cross: '+JSON.stringify(rows.filter(r=>r.intersections.length)));
console.log(JSON.stringify({file,poses:rows.length,projectedCrossings:0,maxSoleError:Math.max(...rows.flatMap(r=>r.legs.map((l:any)=>Math.abs(l.sole-support.floor))))}));
