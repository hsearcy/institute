import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lightningGeometry, lightningMaterial } from './lightning';
import type { SpellBonusContext } from './spellBonusTypes';

/** A broken pressure front, with a narrow white lip and a softer trailing band. */
export function pressureRingMaterial(dust = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { progress: { value: 0 }, dust: { value: Number(dust) } },
    vertexShader: `varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 p;uniform float progress;uniform float dust;
      void main(){float r=length(p),a=atan(p.y,p.x);
      float grain=sin(a*43.+r*80.)*.5+sin(a*79.-r*39.)*.25;
      float breaks=smoothstep(-.7,.3,sin(a*19.+grain));
      float lip=exp(-pow((r-.98)*180.,2.))*breaks;
      float wake=smoothstep(.78,.97,r)*(1.-smoothstep(.97,1.,r));
      float alpha=(lip*.9+wake*.13)*(1.-progress)*smoothstep(0.,.06,progress);
      vec3 tint=mix(vec3(.50,.70,1.05)+lip*.65,vec3(.30,.34,.39),dust);
      gl_FragColor=vec4(tint,alpha*mix(1.,.6,dust));}`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    blending:dust?THREE.NormalBlending:THREE.AdditiveBlending,toneMapped:false,
  });
}
function pressureRing(ctx: SpellBonusContext, at: THREE.Vector3, radius: number, duration: number, dust = false) {
  const material=pressureRingMaterial(dust),mesh=new THREE.Mesh(new THREE.RingGeometry(.77,1,96),material);
  mesh.name=dust?'resonance-dust':'resonance-front';mesh.rotation.x=-Math.PI/2;mesh.position.copy(at);mesh.position.y=.065+(dust?.045:0);
  ctx.effect(mesh,duration,t=>{material.uniforms.progress.value=t;mesh.scale.setScalar(.25+radius*(1-Math.pow(1-t,2)));});
}
function web(ctx: SpellBonusContext) {
  const points=ctx.targets.map(enemy=>enemy.position.clone().add(new THREE.Vector3(0,enemy.height*.55,0)));
  if(points.length===1) points.unshift(ctx.castOrigin());
  ctx.schedule(.12,()=>{
    const parts:THREE.BufferGeometry[]=[];
    for(let i=1;i<points.length;i++) {
      parts.push(lightningGeometry(points[i-1],points[i],.08,ctx.view,17+i));
      if(i>2 && i%2===0) parts.push(lightningGeometry(points[i-2],points[i],.045,ctx.view,51+i));
    }
    if(!parts.length)return;
    const geometry=mergeGeometries(parts)!;parts.forEach(part=>part.dispose());
    const material=lightningMaterial(0xa7caff),mesh=new THREE.Mesh(geometry,material);mesh.name='thunder-web';
    // Hold the filaments, give one common pulse, then let the whole web decay.
    ctx.effect(mesh,1.25,t=>{
      const pulse=Math.exp(-Math.pow((t-.43)*16,2));
      material.uniforms.progress.value=t<.56?.035*(1-pulse):.08+(t-.56)*2.1;
    });
  });
}
function overcharge(ctx: SpellBonusContext) {
  ctx.targets.forEach((enemy,index)=>ctx.schedule(.13+index*.065,()=>{
    const from=ctx.castOrigin(),to=enemy.position.clone().add(new THREE.Vector3(0,enemy.height*.55,0));
    const dir=to.clone().sub(from).normalize(),side=dir.clone().cross(ctx.view).normalize(),up=dir.clone().cross(side).normalize();
    const parts=[0,Math.PI].map(phase=>{
      const points=Array.from({length:41},(_,i)=>{const t=i/40,a=t*Math.PI*6+phase,w=Math.sin(t*Math.PI)*.24;
        return from.clone().lerp(to,t).addScaledVector(side,Math.cos(a)*w).addScaledVector(up,Math.sin(a)*w);});
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),56,.022,4,false);
    });
    const geometry=mergeGeometries(parts)!;parts.forEach(part=>part.dispose());
    const material=new THREE.MeshBasicMaterial({color:0x94bfff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    const mesh=new THREE.Mesh(geometry,material);mesh.name='overcharge-helix';
    ctx.effect(mesh,.40,t=>{material.opacity=Math.pow(1-t,1.5)*.85;});
    pressureRing(ctx,enemy.position,1.5,.42);
  }));
}
function pillars(ctx: SpellBonusContext) {
  ctx.targets.forEach((enemy,index)=>ctx.schedule(.15+index*.095,()=>{
    const floor=enemy.position.clone().setY(.07);
    ctx.bolt(floor.clone().add(new THREE.Vector3(Math.sin(index)*.7,9,Math.cos(index)*.6)),floor,0xc0dbff,.16,.38);
    const geometry=new THREE.BufferGeometry(),positions:number[]=[],uv:number[]=[],indices:number[]=[];
    // One mesh per pillar carries rising, tapered sparks instead of a solid tube.
    for(let i=0;i<16;i++) {
      const a=i*2.39996,r=.18+(i%5)*.12,y=(i%4)*.28,offset=positions.length/3;
      const center=floor.clone().add(new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r));
      const side=new THREE.Vector3(ctx.view.z,0,-ctx.view.x).normalize().multiplyScalar(.016);
      for(const [sign,height] of [[-1,0],[1,0],[-1,.35+i%3*.15],[1,.35+i%3*.15]]) {
        const p=center.clone().addScaledVector(side,sign);p.y+=height;positions.push(p.x,p.y,p.z);uv.push(sign,(height>0?1:0));
      }
      indices.push(offset,offset+1,offset+2,offset+1,offset+3,offset+2);
    }
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
    const material=new THREE.ShaderMaterial({uniforms:{progress:{value:0}},vertexShader:`uniform float progress;varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.y+=progress*2.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`uniform float progress;varying vec2 vUv;void main(){float a=(1.-abs(vUv.x))*sin(vUv.y*3.14159)*pow(1.-progress,2.);gl_FragColor=vec4(.85,1.05,1.45,a);}`,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
    const mesh=new THREE.Mesh(geometry,material);mesh.name='storm-pillar-sparks';
    ctx.effect(mesh,.8,t=>{material.uniforms.progress.value=t;});pressureRing(ctx,floor,1.0,.55);
  }));
}
export function playStormSpellBonus(ctx: SpellBonusContext): void {
  if(ctx.shape==='thunder-web')web(ctx);
  if(ctx.shape==='overcharge')overcharge(ctx);
  if(ctx.shape==='resonance')for(let i=0;i<3;i++)ctx.schedule(.14+i*.23,()=>{
    pressureRing(ctx,ctx.target,5.8+i*1.4,1.1-i*.12);
    pressureRing(ctx,ctx.target,5.3+i*1.4,1.2-i*.1,true);
    ctx.debris(ctx.target,5,false,.35+i*.1);
  });
  if(ctx.shape==='storm-pillars')pillars(ctx);
}

/** Dynamic link follows the actual two roaming orb positions, without allocations per frame. */
export function createOrbitLink(view: THREE.Vector3) {
  const positions=new Float32Array(34*3),uv=new Float32Array(34*2),strength=new Float32Array(34).fill(.8),indices:number[]=[];
  for(let i=0;i<17;i++){uv.set([i/16,0,i/16,1],i*4);if(i<16){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setAttribute('strength',new THREE.BufferAttribute(strength,1));geometry.setIndex(indices);
  const material=lightningMaterial(0xa6c8ff),mesh=new THREE.Mesh(geometry,material);mesh.name='twin-orbit-link';mesh.frustumCulled=false;
  const side=new THREE.Vector3(),point=new THREE.Vector3(),direction=new THREE.Vector3();
  return {mesh,update(from:THREE.Vector3,to:THREE.Vector3,time:number,opacity:number){
    direction.copy(to).sub(from);side.copy(direction).cross(view).normalize();
    for(let i=0;i<17;i++){
      const t=i/16,jitter=Math.sin(i*17.7+Math.floor(time*18))*Math.sin(t*Math.PI)*.14;
      point.copy(from).lerp(to,t).addScaledVector(side,jitter);
      for(let sign=0;sign<2;sign++){const at=(i*2+sign)*3,offset=(sign*2-1)*.035;
        positions[at]=point.x+side.x*offset;positions[at+1]=point.y+side.y*offset;positions[at+2]=point.z+side.z*offset;}
    }
    geometry.attributes.position.needsUpdate=true;mesh.visible=opacity>.01;material.uniforms.progress.value=.05+(1-opacity)*.6;
  }};
}
