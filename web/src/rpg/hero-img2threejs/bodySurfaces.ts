import * as THREE from 'three';

type Ring = [y: number, rx: number, rz: number, z: number, x?: number];
// Reference-only 2.2-unit scaffold. These rings are fresh; see hero-sculpt-spec.json.
function loft(rings: Ring[], segments = 40, warp?: (p: THREE.Vector3, theta: number) => void) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let j = 0; j < rings.length; j++) {
    const [y, rx, rz, z, x = 0] = rings[j];
    for (let i = 0; i <= segments; i++) {
      const theta = i / segments * Math.PI * 2;
      const p = new THREE.Vector3(x + Math.sin(theta) * rx, y, z + Math.cos(theta) * rz);
      warp?.(p, theta); positions.push(...p.toArray()); uvs.push(i / segments, j / (rings.length - 1));
      if (j && i) { const a = j * (segments + 1) + i, b = a - segments - 1; indices.push(a, b - 1, b, a, a - 1, b - 1); }
    }
  }
  // Explicit end fans, shared boundary positions; no near-zero rings used as fake caps.
  for (const end of [0, rings.length - 1]) {
    const [y, , , z, x = 0] = rings[end], center = positions.length / 3;
    positions.push(x, y, z); uvs.push(.5, end ? 1 : 0);
    for (let i = 0; i < segments; i++) {
      const a = end * (segments + 1) + i;
      indices.push(...(end ? [center, a, a + 1] : [center, a + 1, a]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}
function gauss(v: number, center: number, width: number) { return Math.exp(-(((v - center) / width) ** 2)); }
function head() {
  const sections: Ring[] = [
    [1.864,.042,.046,.025], [1.875,.058,.065,.020], [1.895,.072,.073,.010],
    [1.92,.080,.080,.006], [1.95,.090,.085,.004], [1.975,.098,.092,.003],
    [2,.099,.095,.004], [2.025,.096,.099,.003], [2.05,.098,.102,.001],
    [2.075,.100,.099,-.004], [2.10,.094,.092,-.007], [2.12,.081,.079,-.009],
    [2.137,.052,.051,-.008], [2.146,.008,.009,-.008],
  ];
  // More longitudinal samples preserve the continuously integrated nose/cheek field.
  const rings: Ring[] = [];
  for (let j=0;j<sections.length-1;j++) for (let k=0;k<4;k++) {
    rings.push(sections[j].map((v,i)=>THREE.MathUtils.lerp(v ?? 0, sections[j+1][i] ?? 0,k/4)) as Ring);
  }
  rings.push(sections.at(-1)!);
  return loft(rings,64,(p,t)=>{
    const front=Math.max(0,Math.cos(t)) ** 8;
    const nose=.042*gauss(p.x,0,.019)*gauss(p.y,1.994,.025)+.019*gauss(p.x,0,.012)*gauss(p.y,2.026,.045);
    const sockets=.018*(gauss(p.x,.041,.028)+gauss(p.x,-.041,.028))*gauss(p.y,2.026,.018);
    const cheek=.010*(gauss(p.x,.066,.025)+gauss(p.x,-.066,.025))*gauss(p.y,1.993,.025);
    const muzzle=.007*gauss(p.x,0,.038)*gauss(p.y,1.95,.026);
    p.z+=(nose-sockets+cheek+muzzle)*front;
  });
}
function limb(start: number[], end: number[], ra: number, rb: number, cloth: boolean) {
  const a=new THREE.Vector3().fromArray(start),b=new THREE.Vector3().fromArray(end);
  const dir=b.clone().sub(a), length=dir.length();
  const rings:Ring[]=[];
  for(let i=0;i<=22;i++) {
    const t=i/22, round=Math.min(1,Math.sin(Math.PI*t)*5+.80);
    const radius=THREE.MathUtils.lerp(ra,rb,t)*round;
    rings.push([t*length,radius,radius*.95,0]);
  }
  const g=loft(rings,32,cloth?(p,t)=>{
    const fold=.004*Math.sin(p.y*72+Math.sin(t)*2)*gauss(p.y,length*.72,length*.22);
    p.x+=Math.sin(t)*fold;p.z+=Math.cos(t)*fold;
  }:undefined);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()));
  g.translate(a.x,a.y,a.z);return g;
}
function boot(sign:number) {
  return loft([
    [.025,.089,.140,.090,sign*.205], [.043,.098,.154,.087,sign*.205],
    [.070,.098,.152,.085,sign*.204], [.105,.090,.132,.070,sign*.203],
    [.15,.079,.105,.038,sign*.202], [.20,.074,.077,.010,sign*.20],
    [.26,.074,.074,-.004,sign*.198], [.34,.083,.082,-.012,sign*.196],
    [.42,.093,.088,-.012,sign*.192], [.50,.097,.083,-.008,sign*.188],
    [.57,.089,.073,.002,sign*.184], [.625,.091,.073,.010,sign*.181],
  ],48);
}
function sword() {
  const grip=new THREE.Vector3(-.49,1.035,.075), tip=new THREE.Vector3(-1.20,.09,.16);
  const axis=tip.clone().sub(grip).normalize(), side=new THREE.Vector3(-axis.y,axis.x,0).normalize();
  const normal=side.clone().cross(axis).normalize(), origin=grip.clone().addScaledVector(axis,.15);
  const positions:number[]=[], indices:number[]=[];
  const bladeLength=grip.distanceTo(tip)-.15;
  for (const [t,w,d] of [[0,.045,.012],[bladeLength*.70,.037,.010],[bladeLength*.90,.022,.007],[bladeLength,.0001,.0001]]) {
    for(const [x,z] of [[-1,0],[-.52,1],[.52,1],[1,0],[.52,-1],[-.52,-1]]) {
      positions.push(...origin.clone().addScaledVector(axis,t).addScaledVector(side,x*w).addScaledVector(normal,z*d).toArray());
    }
  }
  for(let j=0;j<3;j++)for(let i=0;i<6;i++) {
    const a=j*6+i,b=j*6+(i+1)%6;indices.push(a,b,b+6,a,b+6,a+6);
  }
  for(const [offset,reverse] of [[0,true],[18,false]] as const)for(let i=1;i<5;i++)indices.push(...(reverse?[offset,offset+i+1,offset+i]:[offset,offset+i,offset+i+1]));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function createBodySurface(id:string):THREE.BufferGeometry|null {
  if(id==='head')return head();
  if(id==='cuirass')return loft([[1.275,.175,.12,0],[1.30,.178,.135,0],[1.37,.197,.15,0],[1.47,.233,.163,0],[1.59,.255,.169,0],[1.68,.252,.15,0],[1.745,.20,.127,0],[1.78,.15,.105,0]],48,(p,t)=>{p.z+=.035*Math.max(0,Math.cos(t))**12*gauss(p.y,1.52,.25);});
  if(id==='sword')return sword();
  for(const [side,sign] of [['l',1],['r',-1]] as const) {
    if(id==='upper-arm-'+side)return limb([sign*.29,1.73,0],[sign*.40,1.36,.025],.105,.081,true);
    if(id==='forearm-'+side)return limb([sign*.40,1.40,.025],[sign*.48,1.065,.06],.083,.060,false);
    if(id==='thigh-'+side)return limb([sign*.105,1.12,0],[sign*.18,.64,.01],.115,.091,true);
    if(id==='boot-'+side)return boot(sign);
    if(id==='pauldron-'+side) {
      const rings:Ring[]=[];
      for(let i=0;i<=18;i++) {
        const angle=THREE.MathUtils.lerp(Math.PI*.60,.015,i/18),radius=Math.sin(angle)*.155;
        rings.push([1.70+Math.cos(angle)*.124,radius,radius,0,sign*.29]);
      }
      return loft(rings,40);
    }
  }
  return null;
}
