export async function installFacadeStudy(w, THREE, getRoomLayout) {
 const {mergeGeometries}=await import('/node_modules/.vite/deps/three_examples_jsm_utils_BufferGeometryUtils__js.js');
 const {projectStoneUV}=await import('/src/rpg/world/masonry.ts');
 w.roomCutaway.clear();
 const removed={walls:0, arches:0, piers:0, bays:0, oldBackRuin:0};
 for(const o of [...w.floorGroup.children])if(o.userData.facadeStudyPart){w.floorGroup.remove(o);removed.walls++;}
 const geom=name=>{const result=new Set();w.models.get(name).traverse(o=>{if(o.isMesh)result.add(o.geometry);});return result;};
 const archGeom=geom('arch'),bayGeom=geom('wall-bay'),ruinGeom=geom('broken-wall');
 for(const o of [...w.propGroup.children]){
  const room=o.userData.room;if(!Number.isInteger(room))continue;
  const layout=getRoomLayout(room),back=-20*room-9.4;let arch=false,bay=false,ruin=false;
  o.traverse(c=>{if(c.isMesh&&archGeom.has(c.geometry))arch=true;if(c.isMesh&&bayGeom.has(c.geometry))bay=true;if(c.isMesh&&ruinGeom.has(c.geometry))ruin=true;});
  const pier=o.userData.authoredMasonryPier&&Math.abs(o.position.z-(back+.05))<.01&&Math.abs(Math.abs(o.position.x-layout.doorX)-3.4)<.01;
  if(arch||pier||((bay||ruin)&&Math.abs(o.position.z-back)<.01)){w.propGroup.remove(o);removed[arch?'arches':pier?'piers':ruin?'oldBackRuin':'bays']++;}
 }
 if(removed.arches!==6||removed.piers!==12||!removed.walls)throw Error('Unexpected removals '+JSON.stringify(removed));
 const sourceHeight=5.99362833053;
 const groups=[];
 for(let room=0;room<6;room++){
  const l=getRoomLayout(room),group=new THREE.Group(),parts=[];
  group.userData={room,occluder:true,facadeCandidate:true};group.position.set(l.doorX,0,-20*room-9.4);
  const openings=[{x:0,scale:Math.max(5.5,l.wallHeights.back+.15)/sourceHeight},{x:7.5,scale:.59,niche:true}];

  for(const opening of openings){const o=w.model(opening.niche?'__portalAlcove':'__portalCandidate',opening.scale*sourceHeight);o.position.x=opening.x;group.add(o);}
  function outside(opening,y){ return (opening.niche?2.425:4.7916)*opening.scale; }
  let seed=room*91+731;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const crown=x=>{
   const distance=Math.abs(x);
   return Math.max(1.7,Math.min(2.65,2.65-(distance-8.8)*.24));
  };
  const stone=(left,right,bottom,top,z=-.83,depth=1.06,fractured=false)=>{
   // Scribe the inside edge to the exact arch contour, including the spandrel.
   const shape=new THREE.Shape();const slices=4;
   const cap=(x,y)=>fractured?Math.max(bottom+.035,Math.min(y,crown(x))):y;
   shape.moveTo(left(bottom),bottom);
   shape.lineTo(right(bottom),bottom);
   for(let j=1;j<=slices;j++){const y=bottom+(top-bottom)*j/slices;shape.lineTo(right(y),cap(right(y),y));}
   for(let j=1;j<=slices;j++){const x=right(top)+(left(top)-right(top))*j/slices;shape.lineTo(x,cap(x,top));}
   for(let j=slices-1;j>=0;j--){const y=bottom+(top-bottom)*j/slices;shape.lineTo(left(y),cap(left(y),y));}
   const g=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelThickness:.024,bevelSize:.021,bevelSegments:2,curveSegments:1});
   projectStoneUV(g,rand()*3,rand()*3);g.translate(0,0,z);
   const colors=new Float32Array(g.attributes.position.count*3),shade=.88+rand()*.27;
   for(let i=0;i<g.attributes.position.count;i++){const damp=.77+.23*Math.min(1,g.attributes.position.getY(i)/1.1);colors[i*3]=shade*damp;colors[i*3+1]=shade*damp;colors[i*3+2]=shade*damp;}
   g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(g);
  };
  const gateScale=openings[0].scale;
  const beds=[0,.18,.31,.43,.75,1.14,1.49,1.89,2.23,2.53,2.70].map(h=>h*gateScale);
  while(beds.at(-1)<2.7)beds.push(Math.min(2.7,beds.at(-1)+.40));
  for(let row=0;row<beds.length-1;row++){
   const bottom=beds[row]+.029,top=beds[row+1]-.029;
   const cuts=[{x:-12.3,side:0},...openings.flatMap(o=>[{x:o.x,side:-1,o},{x:o.x,side:1,o}]),{x:12.3,side:0}];
   for(let span=0;span<cuts.length-1;span+=2){
    const a=cuts[span],b=cuts[span+1];
    const left=y=>a.o?a.x+outside(a.o,y)+.012:a.x;
    const right=y=>b.o?b.x-outside(b.o,y)-.012:b.x;
    const min=Math.max(left(bottom),left(top)),max=Math.min(right(bottom),right(top));
    if(max-min<.10)continue;
    const joints=[min];let x=min+(.57+(row%2)*.41);
    while(x<max-.34){joints.push(x);x+=.85+rand()*.32;}joints.push(max);
    // The face setback is one straight bonded return through all courses.
    for(const edge of [-3.7,3.7])if(edge>min+.3&&edge<max-.3){
     for(let j=joints.length-2;j>0;j--)if(Math.abs(joints[j]-edge)<.30)joints.splice(j,1);
     joints.push(edge);joints.sort((a,b)=>a-b);
    }
    for(let n=0;n<joints.length-1;n++){
     // Broken western crown keeps the room silhouette asymmetric.
     if(bottom+.08>Math.max(crown(joints[n]),crown(joints[n+1]),crown((joints[n]+joints[n+1])/2)))continue;
     const ll=n===0?left:()=>joints[n]+.029,rr=n===joints.length-2?right:()=>joints[n+1]-.029;
     const crownCourse=row===beds.length-2||beds[row+1]+.015>crown((joints[n]+joints[n+1])/2);
     const middle=(joints[n]+joints[n+1])/2;
     const bondedReturn=Math.abs(middle)<3.7;
     const belt=row===1||row===8;
     const offset=-.85;
     const depth=1.02+(bondedReturn?.18:0)+(belt?.12:0);
     const brokenTop=crown(middle)<l.wallHeights.back-.025;
     stone(ll,rr,bottom,top,offset,depth,brokenTop);
     if(false){
      const base=top+.022;stone(ll,rr,base+.029,base+.15+(rand()-.5)*.028,-.90,1.15);
     }
    }
   }
  }
  // A recessed niche is separate from the structural gate and has a real
  // dark backing, inset floor and localized crystal light.
  for(const o of openings.filter(o=>o.niche)){
   const backingMaterial=w.materials.wall.clone();backingMaterial.color.multiplyScalar(.36);
   const backing=new THREE.Mesh(new THREE.BoxGeometry(3.5*o.scale,5.4*o.scale,.25),backingMaterial);
   backing.position.set(o.x,2.7*o.scale,-.70);backing.castShadow=backing.receiveShadow=true;group.add(backing);
   for(let step=0;step<2;step++){
    const stair=new THREE.Mesh(new THREE.BoxGeometry(3.9*o.scale,.12,1.15-step*.35),w.materials.wall);
    stair.position.set(o.x,.06+step*.12,.20-step*.16);stair.castShadow=stair.receiveShadow=true;group.add(stair);
   }
   const crystal=w.model('crystal',1.15);if(crystal){crystal.position.set(o.x,.24,-.28);group.add(crystal);}
   if(room===0){const glow=new THREE.PointLight(0x36bdf5,2.1,3.8,2);glow.position.set(o.x,.9,.15);group.add(glow);}
  }
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  const material=w.materials.wall.clone();material.vertexColors=true;
  const wall=new THREE.Mesh(geometry,material);wall.castShadow=wall.receiveShadow=true;group.add(wall);
  w.propGroup.add(group);groups.push(group);
 }
 w.roomCutaway.prepare([...w.floorGroup.children,...w.propGroup.children]);w.roomCutaway.update(w.cameraTarget.z);w.scene.updateMatrixWorld(true);w.renderer.shadowMap.needsUpdate=true;w.composer.render(0);
 return {removed,groups:groups.length,uniformPortalScale:true,portalSourceHeight:sourceHeight,loweredOuterWings:true,rightRecessedAlcove:true,
   wallTriangles:groups.reduce((sum,g)=>sum+g.children.at(-1).geometry.attributes.position.count/3,0),
   gates:groups.map((g,room)=>({room,height:Math.max(5.5,getRoomLayout(room).wallHeights.back+.15),minimumPlinthOpening:2.8*Math.max(5.5,getRoomLayout(room).wallHeights.back+.15)/sourceHeight}))};
}
