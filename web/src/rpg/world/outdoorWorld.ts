import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getRoomLayout } from './roomLayout';

export type OutdoorKind = 'forest' | 'coast' | 'quarry' | 'garden';
const outdoorKinds = new Map<string, OutdoorKind>([['mosswood','forest'],['tidebreak','coast'],['old-quarry','quarry'],['kingsgarden','garden']]);
export const outdoorKind = (id: string): OutdoorKind | undefined => outdoorKinds.get(id);
export const outdoorLight = {
  forest: {sky:0x748778, fog:0x788a7c, sun:0xffe3a5, ground:0x303b27, intensity:2.3},
  coast: {sky:0x8faab7, fog:0xa0b8bd, sun:0xffedc6, ground:0x536768, intensity:2.8},
  quarry: {sky:0xb8a48c, fog:0xb6a68e, sun:0xffd299, ground:0x4c3e32, intensity:2.4},
  garden: {sky:0x8a9a96, fog:0x9bac9e, sun:0xffe4b9, ground:0x344d36, intensity:2.4},
} satisfies Record<OutdoorKind, {sky:number;fog:number;sun:number;ground:number;intensity:number}>;

/** A whole destination, with room batches culled by the main camera. Source
 * textures are shared within this destination and released when it is replaced. */
export function createOutdoorWorld(regionId: string): THREE.Group {
  const kind = outdoorKind(regionId)!;
  const world = new THREE.Group(); world.name = `Outdoor-${kind}`;
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
  const flower = mat('wildflowers',kind === 'garden' ? 0xb2a1c0 : 0xc2b78e,{vertexColors:true});
  const batches = new Map<string,{material:THREE.Material;geometries:THREE.BufferGeometry[];room:number}>();
  let seed = [...regionId].reduce((n,c)=>Math.imul(n,31)+c.charCodeAt(0)|0,1847);
  const random=()=>{seed=Math.imul(seed,1664525)+1013904223|0;return(seed>>>0)/4294967296;};
  let room = 0;
  const add=(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1,turn=0)=>{
    g.scale(sx,sy,sz);g.rotateY(turn);g.translate(x,y,z-room*20);
    if ((m as THREE.MeshStandardMaterial).vertexColors) {
      const p=g.getAttribute('position'),authoredColors=g.getAttribute('color'),colors=new Float32Array(p.count*3),shade=.82+random()*.32;
      for(let i=0;i<p.count;i++) {const v=shade*(.9+.1*Math.sin(p.getX(i)*3.2+p.getZ(i)*4.7));colors[i*3]=v*(authoredColors?.getX(i)??1);colors[i*3+1]=v*(authoredColors?.getY(i)??1);colors[i*3+2]=v*(authoredColors?.getZ(i)??1);}
      g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    }
    const key=`${room}:${m.uuid}`;
    if(!batches.has(key))batches.set(key,{material:m,geometries:[],room});
    batches.get(key)!.geometries.push(g);
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
  for(room=0;room<6;room++){
    const layout=getRoomLayout(room,regionId);
    const depth=room===0||room===5?80:20,centerZ=room===0?30:room===5?-30:0;
    const g=new THREE.PlaneGeometry(80,depth,80,depth);g.rotateX(-Math.PI/2);
    const p=g.getAttribute('position'),uv=g.getAttribute('uv');
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i)+centerZ;
      const edge=Math.max(0,Math.abs(x)-8.2);
      const shore = kind === 'coast' ? Math.max(0, x - (10 + Math.sin(z*.42)*.4)) * .8 : 0;
      p.setY(i,-.035+Math.min(edge,5)*.08*Math.sin(x*.6+z*.36)-shore);
      uv.setXY(i,x/5,(z-room*20)/5);
    }g.computeVertexNormals();add(g,ground,0,0,centerZ);
    // The open route stays empty; irregular scenery lies beyond the combat bounds.
    for(const side of [-1,1]){
      for(let n=0;n<8;n++){
        const z=-9+n*2.65+(random()-.5),x=side*(9.3+random()*3.4);
        boulder(x,z,.6+random(),.35+random()*.55,.6+random());
        for(let k=0;k<8;k++)tuft(x+(random()-.5)*2.8,z+(random()-.5)*2.1,.25+random()*.45);
      }
    }
    if(kind==='forest'){
      for(const side of [-1,1])for(let n=0;n<5;n++){
        const x=side*(12.2+random()*3.8),z=-8+n*4.3;
        tree(x,z,side<0?5.5+random()*2.8:3.3+random()*1.6);
        if(n%2===0)tree(x+side*5,z+1.6,7+random()*3);
      }
      // A different focal ruin at each stop.
      if(room%3===0)arch(-9,-4);
      else if(room%3===1){branch(new THREE.Vector3(-12,.6,-5),new THREE.Vector3(-9,.4,2),.7,.5);ruinedColumn(-10,4,2.4);}
      else{for(let n=0;n<3;n++)ruinedColumn(-10+n*.8,-5+n*2,1.4+n*.6);}
      for(let n=0;n<6;n++)crown(-9.5,.3,-8+n*3,.9);
    }else if(kind==='coast'){
      // The sea is open to the right; the walkable shore has a low broken edge.
      add(new THREE.PlaneGeometry(42,depth).rotateX(-Math.PI/2),water,31,-.48,centerZ);
      for(let n=0;n<9;n++){
        boulder(-12-random()*3,-9+n*2.5,2+random(),1.4+random()*2,1.8+random());
        boulder(10.5+random(),-9+n*2.5,.7+random(),.25+random()*.5,.9+random());
        const waveX=12.5+random()*10, waveZ=-8+n*2.4;
        const points=Array.from({length:9},(_,i)=>new THREE.Vector3(waveX+Math.sin(i*.6)*.25,-.46,waveZ+i*.55));
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,.025,3,false),foam,0,0,0);
      }
      if(room%2===0){
        // Weathered pier with slats and broken posts.
        for(let n=0;n<12;n++)block(wood,11.9+n*.3,.06,-4, .26,.16,2.2,.02*Math.sin(n));
        fence(11.3,-5.2,2.4);fence(15.6,-5.2,2.4);
      }else{for(let n=0;n<4;n++)block(wood,-9.3,.24+n*.13,-3+n*.6,2.8,.2,.24,.35+n*.12);}
      if(room===5){ruinedColumn(-10,-7,5);arch(-10,1);}
    }else if(kind==='quarry'){
      for(const side of [-1,1])for(let n=0;n<6;n++){
        const z=-9+n*3.7;
        for(let tier=0;tier<3;tier++)boulder(side*(11.8+tier*2.3),z,2.4,1.0+tier*.6,2.0,tier*1.4);
      }
      // Old cart rails and supports stop outside the combat lane.
      for(const x of [-10.7,-9.6])block(iron,x,.08,0,.09,.13,19);
      for(let n=0;n<14;n++)block(wood,-10.15,.02,-9+n*1.4,1.7,.1,.19);
      block(wood,-10.15,.8,room%2?-3:3,1.5,.75,2.0);
      for(const x of [-10.85,-9.45])for(const z of [-.65,.65])add(new THREE.CylinderGeometry(.3,.3,.12,9).rotateZ(Math.PI/2),iron,x,.35,(room%2?-3:3)+z);
      if(room%2===0){block(wood,-10,2,-6,.45,4,.5);block(wood,-10,3.8,-4,.45,.4,4.4);block(iron,-10,2.9,-2,.07,1.5,.07);}
    }else{
      for(const side of [-1,1]){
        for(let n=0;n<5;n++){
          const z=-8+n*4;ruinedColumn(side*10.7,z, n%2?1.5:3.3);
          block(stone,side*10.7,.35,z+1.6,.75,.6,2.2);
          crown(side*9.8,.8,z+1.4,1.0);
          for(let k=0;k<5;k++)add(new THREE.IcosahedronGeometry(.11,0),flower,side*(9.2+random()*1.1),.6+random()*.4,z+random()*2);
        }
        for(let n=0;n<3;n++)tree(side*(14+random()*2),-7+n*7,4.8+random()*1.5);
      }
      if(room%2===0)fountain(-9,-4);else arch(-10,-4);
      // Worn, missing paving stones threaded with grass, outside hero travel.
      for(let n=0;n<20;n++){const x=(n%2?-1:1)*(7.8+random()*.6),z=-8+random()*16;block(stone,x,.015,z,.55+random()*.5,.04,.6+random()*.4,random()*.15);}
    }
    // Route marker beyond each battle; geometry never crosses the travel lane.
    for(const side of [-1,1]){
      const x=layout.doorX+side*2.5;
      if(kind==='garden'||kind==='forest')ruinedColumn(x,-9.3,1.3);
      else{boulder(x,-9.3,.55,.7,.5);block(wood,x,1.15,-9.3,.11,.8,.13);}
    }
    if(room===5){
      // Tall, fractured stones frame the guardian, without hiding its body.
      for(const side of [-1,1]){ruinedColumn(side*6.2,-8.6,3.6);boulder(side*7.2,-8.7,.8,1.1,.65);}
    }
  }
  for(const {material,geometries,room:roomIndex} of batches.values()){
    const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
    if(!geometry)continue;
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`${kind}-${roomIndex}-${material.name}`;
    mesh.userData.room=roomIndex;mesh.userData.continuousGround=material===ground||material===water;mesh.castShadow=material!==ground&&material!==water&&material!==foam&&material!==grass;mesh.receiveShadow=true;
    world.add(mesh);
  }
  world.userData.ownedTextures=textures;world.userData.ownedMaterials=materials;
  return world;
}

export function disposeOutdoorWorld(world:THREE.Group):void {
  world.traverse(node=>{if(node instanceof THREE.Mesh)node.geometry.dispose();});
  for(const m of world.userData.ownedMaterials ?? [])m.dispose();
  for(const t of world.userData.ownedTextures ?? [])t.dispose();
  world.removeFromParent();
}
