import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SkinnedMesh, Vector3 } from 'three';
import { EnemyAnimator } from '../src/rpg/world/EnemyAnimator';
async function loadRig(kind: string) {
  const input = readFileSync(new URL(`../public/assets/rpg/animated/${kind}.glb`, import.meta.url));
  const length = input.readUInt32LE(12), data = JSON.parse(input.subarray(20, 20 + length).toString());
  // Geometry and skeleton are real exports. Skip browser-only image decoding.
  data.images = []; data.textures = []; data.materials = [{}];
  for (const mesh of data.meshes) for (const p of mesh.primitives) p.material = 0;
  const json = Buffer.from(JSON.stringify(data).padEnd(Math.ceil(JSON.stringify(data).length / 4) * 4, ' '));
  const binary = input.subarray(20 + length), bytes = Buffer.alloc(20 + json.length + binary.length);
  input.copy(bytes, 0, 0, 20); bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(json.length, 12);
  json.copy(bytes, 20); binary.copy(bytes, 20 + json.length);
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

for (const kind of ['skeleton','revenant','guardian','vault-guardian-boss']) {
 const root=await loadRig(kind), animator=new EnemyAnimator(root,{kind,phase:0});
 const meshes:SkinnedMesh[]=[];root.traverse(o=>{if(o instanceof SkinnedMesh)meshes.push(o)});
 for (const time of [0,.3,.65,1.1,1.6,2.2]) {
  animator.update(time,{deathAge:time});root.updateMatrixWorld(true);meshes.forEach(m=>m.skeleton.update());
  const lowest:Record<string,number>={};
  for(const mesh of meshes){ const ids=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
   for(let i=0;i<ids.count;i++){let slot=0;for(let j=1;j<4;j++)if(weights.getComponent(i,j)>weights.getComponent(i,slot))slot=j;
    const name=mesh.skeleton.bones[ids.getComponent(i,slot)].name;
    const y=mesh.localToWorld(mesh.getVertexPosition(i,new Vector3())).y;
    lowest[name]=Math.min(lowest[name]??Infinity,y);
   }
  }
  console.log(kind,time,JSON.stringify(Object.fromEntries(Object.entries(lowest).map(([n,y])=>[n,+y.toFixed(3)]))));
 }
}
