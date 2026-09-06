// Actual exported vertex audit; candidate only, no browser or public mutation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {BufferGeometry,Float32BufferAttribute,Mesh,Object3D,Vector3} from '../node_modules/three/build/three.module.js';
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

const file=process.argv[2];
assert(file, 'Usage: bun web/scripts/audit-authored-enemy.ts candidate.glb [report.json] [phase] [grounded|electric]');
const phase=Number(process.argv[4] ?? .7), collapse=process.argv[5] ?? 'grounded';
assert(Number.isFinite(phase) && ['grounded','electric'].includes(collapse));
const {root,nodes,soles}=exportedRig(file),a:any=new EnemyAnimator(root,{kind:'skeleton',phase});
assert(a.footSupports.length>0,"The audit must load the same Three Mesh class as the runtime");
assert(a.authoredGuard && a.authoredGuardSupport, "The real animator must activate the authored hook");
const support=a.authoredGuardSupport;
const rows:any[]=[];const p=new Vector3();
for(const state of [{},{brace:.2,injury:.25},{brace:.7,recoil:.6,impactSide:-1,catchStep:.4,footOffset:-.12},...Array.from({length:67},(_,i)=>({deathAge:i/60,collapse}))]){
 a.update(2,{moving:0,threat:0,...state});root.updateMatrixWorld(true);
 const sole=Math.min(...soles.flatMap(s=>s.vertices.map(v=>p.copy(v).applyMatrix4(s.node.matrixWorld).y)));
 let floor=Infinity;const parts:any[]=[];for(const n of nodes)if(n instanceof Mesh){const v=n.geometry.getAttribute('position');let low=Infinity;for(let i=0;i<v.count;i++)low=Math.min(low,n.getVertexPosition(i,p).applyMatrix4(n.matrixWorld).y);floor=Math.min(floor,low);parts.push({name:n.name,low});}
 rows.push({state,sole,floor,supportFloor:support.floor,lowestParts:parts.sort((a,b)=>a.low-b.low).slice(0,3)});
 if(!('deathAge' in state))assert(Math.abs(sole-support.floor)<.001,JSON.stringify(rows.at(-1)));
 for(const n of nodes)assert(n.matrixWorld.elements.every(Number.isFinite));
}
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify({file,phase,collapse,rows},null,2));
console.log(JSON.stringify({file,phase,collapse,frames:rows.length,minGeometryY:Math.min(...rows.map(r=>r.floor)),supportFloor:support.floor}));

assert(rows.every(row=>row.floor >= support.floor-.002), JSON.stringify(rows.filter(row=>row.floor < support.floor-.002)));
