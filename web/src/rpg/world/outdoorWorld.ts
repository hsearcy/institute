import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type OutdoorKind = 'forest' | 'coast' | 'quarry' | 'garden';
const outdoorKinds = new Map<string, OutdoorKind>([['mosswood','forest'],['tidebreak','coast'],['old-quarry','quarry'],['kingsgarden','garden']]);
export const outdoorKind = (id: string): OutdoorKind | undefined => outdoorKinds.get(id);
export const outdoorLight = {
  forest: {sky:0x748778, fog:0x788a7c, sun:0xffe3a5, ground:0x303b27, intensity:2.3},
  coast: {sky:0x8faab7, fog:0xa0b8bd, sun:0xffedc6, ground:0x536768, intensity:2.8},
  quarry: {sky:0xb8a48c, fog:0xb6a68e, sun:0xffd299, ground:0x4c3e32, intensity:2.4},
  garden: {sky:0x8a9a96, fog:0x9bac9e, sun:0xffe4b9, ground:0x344d36, intensity:2.4},
} satisfies Record<OutdoorKind, {sky:number;fog:number;sun:number;ground:number;intensity:number}>;

export type OutdoorMaterials = Record<'ground' | 'path' | 'rock' | 'stone' | 'bark' | 'leaves' | 'grass' | 'wood' | 'iron' | 'water' | 'foam' | 'flower', THREE.MeshStandardMaterial>;
export type OutdoorHelpers = {
  random: () => number;
  add: (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx?: number, sy?: number, sz?: number, turn?: number) => void;
  block: (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, turn?: number) => void;
  boulder: (x: number, z: number, w: number, h: number, d: number, y?: number) => void;
  branch: (a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number) => void;
  tuft: (x: number, z: number, size: number) => void;
  crown: (x: number, y: number, z: number, size: number) => void;
  tree: (x: number, z: number, height: number) => void;
  ruinedColumn: (x: number, z: number, h: number) => void;
  fence: (x: number, z: number, length: number) => void;
  arch: (x: number, z: number) => void;
  fountain: (x: number, z: number) => void;
  materials: OutdoorMaterials;
};
export type OutdoorKit = {
  readonly kind: OutdoorKind;
  readonly materials: OutdoorMaterials;
  /** Draws a piece of scenery with the kit and returns it merged by material. */
  build(seed: number, draw: (helpers: OutdoorHelpers) => void): THREE.Group;
  dispose(): void;
};

/** The materials and handmade scenery shapes of one outdoor region. Every
 * piece it builds shares the source textures; dispose() releases them. */
export function createOutdoorKit(regionId: string): OutdoorKit {
  const kind = outdoorKind(regionId)!;
  const textures: THREE.Texture[] = [], materials: THREE.Material[] = [];
  const loader = new THREE.TextureLoader();
  const texture = (name: string, srgb: boolean) => {
    const map = loader.load(`/assets/rpg/outdoors/${name}.jpg`);
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
    if (srgb) map.colorSpace = THREE.SRGBColorSpace;
    textures.push(map); return map;
  };
  const groundSource = kind === 'coast' ? 'coast_sand_rocks_02' : kind === 'quarry' ? 'aerial_ground_rock' : 'forrest_ground_01';
  const groundMap = texture(`${groundSource}-diffuse`,true), groundNormal = texture(`${groundSource}-normal`,false);
  const rockMap = kind === 'quarry' ? groundMap : texture('aerial_ground_rock-diffuse',true);
  const mat = (name: string,color:number, extra:THREE.MeshStandardMaterialParameters={}) => {
    const m = new THREE.MeshStandardMaterial({color,roughness:.93,...extra});m.name = name;materials.push(m);return m;
  };
  const ground = mat('trail-ground',kind === 'forest' ? 0x91a477 : kind === 'garden' ? 0xa4ad85 : 0xc4bda6,{map:groundMap,normalMap:groundNormal,normalScale:new THREE.Vector2(.45,.45),vertexColors:true});
  const rock = mat('weathered-rock',kind === 'quarry' ? 0xb6a188 : 0x8c9384,{map:rockMap,vertexColors:true});
  const stone = mat('old-limestone',kind === 'garden' ? 0xb3b49b : 0x848d77,{map:rockMap,vertexColors:true});
  const bark = mat('bark',0x514130,{map:rockMap,vertexColors:true});
  const leaves = mat('leaves',kind === 'garden' ? 0x758b4d : 0x6b854b,{vertexColors:true,side:THREE.DoubleSide});
  const grass = mat('undergrowth',kind === 'coast' ? 0x85805b : 0x67783b,{vertexColors:true,side:THREE.DoubleSide});
  const wood = mat('old-timber',0x77634a,{map:rockMap,vertexColors:true});
  const iron = mat('forged-iron',0x48433c,{metalness:.6,roughness:.67,vertexColors:true});
  const water = mat('water',kind === 'garden' ? 0x396c68 : 0x357a88,{roughness:.32,metalness:.28});
  const foam = mat('shore-foam',0xc6d6cc,{roughness:1,transparent:true,opacity:.45});
  // Worn trails and clearings: the walkable floor reads apart from the wild ground.
  const path = mat('worn-path',kind === 'forest' ? 0xa8956f : kind === 'garden' ? 0xc2b597 : kind === 'coast' ? 0xe0d3b4 : 0xc9ab86,{map:kind === 'coast' ? groundMap : rockMap,normalMap:groundNormal,normalScale:new THREE.Vector2(.3,.3),vertexColors:true});
  const flower = mat('wildflowers',kind === 'garden' ? 0xb2a1c0 : 0xc2b78e,{vertexColors:true});
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  let seed = 1;
  const random=()=>{seed=Math.imul(seed,1664525)+1013904223|0;return(seed>>>0)/4294967296;};
  const add=(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1,turn=0)=>{
    g.scale(sx,sy,sz);g.rotateY(turn);g.translate(x,y,z);
    if ((m as THREE.MeshStandardMaterial).vertexColors) {
      const p=g.getAttribute('position'),authoredColors=g.getAttribute('color'),colors=new Float32Array(p.count*3),shade=.82+random()*.32;
      for(let i=0;i<p.count;i++) {const v=shade*(.9+.1*Math.sin(p.getX(i)*3.2+p.getZ(i)*4.7));colors[i*3]=v*(authoredColors?.getX(i)??1);colors[i*3+1]=v*(authoredColors?.getY(i)??1);colors[i*3+2]=v*(authoredColors?.getZ(i)??1);}
      g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    }
    if(!batches.has(m))batches.set(m,[]);
    batches.get(m)!.push(g);
  };
  const block=(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,turn=0)=>add(new THREE.BoxGeometry(w,h,d),m,x,y,z,1,1,1,turn);
  const boulder=(x:number,z:number,w:number,h:number,d:number,y=0)=>{
    const g=new THREE.IcosahedronGeometry(1,1),p=g.getAttribute('position');
    for(let i=0;i<p.count;i++){const a=p.getX(i),b=p.getY(i),c=p.getZ(i);const warp=1+.13*Math.sin(a*9+c*6+b*5);p.setXYZ(i,a*warp,Math.max(-.72,b*warp),c*warp);}
    g.computeVertexNormals();
    // World-ish UVs give broken rock faces small texture detail.
    const uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,p.getX(i)*w*.35,p.getY(i)*h*.35+p.getZ(i)*d*.2);
    add(g,rock,x,y+h*.62,z,w,h,d,random()*6.28);
  };
  const branch=(a:THREE.Vector3,b:THREE.Vector3,r1:number,r2:number)=>{
    const g=new THREE.CylinderGeometry(r2,r1,a.distanceTo(b),7,3);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));
    const c=a.clone().add(b).multiplyScalar(.5);add(g,bark,c.x,c.y,c.z);
  };
  const tuft=(x:number,z:number,size:number)=>{
    for(let b=0;b<4;b++){
      const h=size*(.7+random()*.5),w=size*.18,turn=random()*6.28;
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-w,0,0,w,0,0,w*.6,h*.5,.1,0,h,.2],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,.5,.5,1],2));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();add(g,grass,x,.01,z,1,1,1,turn);
    }
  };
  const crown=(x:number,y:number,z:number,size:number)=>{
    // Short sprays form an irregular three-dimensional crown. Each pointed leaf
    // folds along its midrib, so sunlight reveals a curved surface at game scale.
    const positions:number[]=[],uvs:number[]=[],leafColors:number[]=[],indices:number[]=[];
    const transform=new THREE.Matrix4(),rotation=new THREE.Euler(),point=new THREE.Vector3();
    const shades=[new THREE.Color(0xabc37b),new THREE.Color(0x8fab63),new THREE.Color(0xc6cf83),new THREE.Color(0x789858)];
    for(let spray=0;spray<16;spray++){
      const angle=spray*2.39996+random()*.5, radius=size*(.45+random()*.55);
      const lift=(random()-.42)*size*.9;
      const start=new THREE.Vector3(x+Math.cos(angle)*radius*.18,y-.18,z+Math.sin(angle)*radius*.18);
      const end=new THREE.Vector3(x+Math.cos(angle)*radius,y+lift,z+Math.sin(angle)*radius);
      branch(start,end,.018,.004);
      for(let pair=0;pair<4;pair++)for(const side of [-1,1]){
        const along=.28+pair*.22,anchor=start.clone().lerp(end,along);
        const length=(.22+random()*.15)*Math.min(1.15,size),width=length*(.23+random()*.06);
        const vertices=[0,0,0,-width,.018,length*.34,-width*.63,.016,length*.72,
          0,-.025,length,width*.63,.016,length*.72,width,.018,length*.34,0,.05,length*.45];
        rotation.set((random()-.5)*.85,-angle+side*(.65+random()*.35)+Math.PI/2,side*(.15+random()*.45));
        transform.makeRotationFromEuler(rotation);transform.setPosition(anchor.x-x,anchor.y-y,anchor.z-z);
        const offset=positions.length/3;
        for(let v=0;v<7;v++){point.fromArray(vertices,v*3).applyMatrix4(transform);positions.push(point.x,point.y,point.z);}
        uvs.push(.5,0,0,.34,.15,.72,.5,1,.85,.72,1,.34,.5,.45);
        for(const index of [0,1,6,1,2,6,2,3,6,3,4,6,4,5,6,5,0,6])indices.push(offset+index);
        const tint=shades[Math.floor(random()*shades.length)];
        for(let v=0;v<7;v++){const light=(v===6?1.12:v===0?.68:.9)*(.85+random()*.3);leafColors.push(tint.r*light,tint.g*light,tint.b*light);}

      }
    }
    const foliage=new THREE.BufferGeometry();
    foliage.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    foliage.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    foliage.setAttribute('color',new THREE.Float32BufferAttribute(leafColors,3));
    foliage.setIndex(indices);foliage.computeVertexNormals();add(foliage,leaves,x,y,z);
  };
  const tree=(x:number,z:number,height:number)=>{
    const lean=(random()-.5)*1.2;
    branch(new THREE.Vector3(x,0,z),new THREE.Vector3(x+lean,height,z+.3),.48,.09);
    for(let n=0;n<5;n++){
      const a=n*2.4+random(),by=height*(.42+n*.095),end=new THREE.Vector3(x+Math.cos(a)*2.1,by+1.1,z+Math.sin(a)*1.5);
      branch(new THREE.Vector3(x+lean*.5,by-.5,z),end,.17,.025);crown(end.x,end.y,end.z,1.5);
      branch(new THREE.Vector3(x,.15,z),new THREE.Vector3(x+Math.cos(a)*1.3,.03,z+Math.sin(a)*1.3),.19,.025);
    }
    crown(x+lean,height,z+.3,1.7);
  };
  const ruinedColumn=(x:number,z:number,h:number)=>{
    block(stone,x,.16,z,1.35,.3,1.35);
    for(let i=0;i<Math.ceil(h/.46);i++)add(new THREE.CylinderGeometry(.42,.47,.43,8),stone,x,.52+i*.46,z,1,1,1,i*.07);
    if(h>2.2)block(stone,x,h+.35,z,1.12,.28,1.12,.04);
  };
  const fence=(x:number,z:number,length:number)=>{
    for(let n=0;n<4;n++)block(wood,x,.58,z+n*length/3,.17,1.3,.17,.06);
    for(const y of [.45,.98])block(wood,x,y,z+length/2,.12,.12,length+.3);
  };
  const arch=(x:number,z:number)=>{
    ruinedColumn(x-1.6,z,3);ruinedColumn(x+1.6,z,2.7);
    for(let n=0;n<9;n++){
      const a=n/8*Math.PI;const g=new THREE.BoxGeometry(.67,.6,.8);g.rotateZ(a-Math.PI/2);add(g,stone,x+Math.cos(a)*1.6,2.9+Math.sin(a)*1.3,z);
    }
  };
  const fountain=(x:number,z:number)=>{
    add(new THREE.CylinderGeometry(2.0,2.2,.28,16),stone,x,.14,z);
    add(new THREE.TorusGeometry(1.75,.21,5,24).rotateX(Math.PI/2),stone,x,.42,z);
    add(new THREE.CircleGeometry(1.55,24).rotateX(-Math.PI/2),water,x,.36,z);
    add(new THREE.CylinderGeometry(.24,.45,1.4,8),stone,x,.98,z);
    add(new THREE.CylinderGeometry(.95,.27,.35,12),stone,x,1.7,z);
    for(let n=0;n<4;n++){
      const a=n*Math.PI/2;const points=[new THREE.Vector3(x+Math.cos(a)*.6,1.85,z+Math.sin(a)*.6),new THREE.Vector3(x+Math.cos(a)*.9,1.55,z+Math.sin(a)*.9),new THREE.Vector3(x+Math.cos(a)*1.25,.42,z+Math.sin(a)*1.25)];
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),8,.025,3,false),water,0,0,0);
    }
  };
  const kitMaterials: OutdoorMaterials = {ground,path,rock,stone,bark,leaves,grass,wood,iron,water,foam,flower};
  const helpers: OutdoorHelpers = {random,add,block,boulder,branch,tuft,crown,tree,ruinedColumn,fence,arch,fountain,materials:kitMaterials};
  return {
    kind, materials: kitMaterials,
    build(pieceSeed, draw) {
      seed = pieceSeed | 0 || 1; batches.clear();
      draw(helpers);
      const group = new THREE.Group();
      for (const [material, geometries] of batches) {
        const geometry = mergeGeometries(geometries, false); geometries.forEach(g => g.dispose());
        if (!geometry) continue;
        const mesh = new THREE.Mesh(geometry, material); mesh.name = `${kind}-${material.name}`;
        mesh.castShadow = material !== ground && material !== path && material !== water && material !== foam && material !== grass; mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false; group.add(mesh);
      }
      batches.clear();
      return group;
    },
    dispose() { materials.forEach(material => material.dispose()); textures.forEach(map => map.dispose()); },
  };
}
