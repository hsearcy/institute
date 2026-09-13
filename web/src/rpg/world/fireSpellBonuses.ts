import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fireNovaFrontMaterial } from './fireNova';
import { fireSheetMaterial } from './materials';
import type { SpellBonusContext } from './spellBonusTypes';

const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;

/** Thin, tapered fracture ribbons. UV.x is distance from the fracture root. */
function fractureGeometry(roots: THREE.Vector3[], length: number): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  roots.forEach((root, seed) => {
    for (let branch = 0; branch < 5; branch++) {
      const angle = branch * Math.PI * 2 / 5 + seed * 1.37 + Math.sin(branch * 3.7 + seed) * .34;
      let last = root.clone();
      for (let step = 1; step <= 5; step++) {
        const distance = step / 5 * length * (.75 + .25 * Math.sin(seed + branch + 1));
        const turn = angle + Math.sin(step * 7.3 + branch) * .19;
        const next = root.clone().add(new THREE.Vector3(Math.cos(turn) * distance, 0, Math.sin(turn) * distance));
        const width = (.035 - step * .004) * Math.min(1.4, length / 2);
        // Short gaps separate the exposed hot seams; their ends remain unequal.
        const segmentStart = last.clone().lerp(next, .08 + .09 * (step % 3));
        const side = new THREE.Vector3().subVectors(next, last).normalize(); side.set(-side.z, 0, side.x).multiplyScalar(width);
        const base = positions.length / 3;
        for (const p of [segmentStart.clone().sub(side), segmentStart.clone().add(side), next.clone().sub(side), next.clone().add(side)]) positions.push(p.x, .047, p.z);
        uv.push((step - 1) / 5, 0, (step - 1) / 5, 1, step / 5, 0, step / 5, 1);
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        last = next;
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function heatMaterial(fractured = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { age: { value: 0 }, opacity: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float age,opacity;
      void main(){
        float growth=1.-smoothstep(age*2.2-.08,age*2.2+.03,vUv.x);
        float core=pow(max(0.,1.-abs(vUv.y*2.-1.)),3.);
        float grain=.72+.28*sin(vUv.x*97.+sin(vUv.x*39.)*4.);
        float pulse=exp(-pow((vUv.x-fract(age*.75))*9.,2.));
        float broken=${fractured ? 'smoothstep(-.55,.25,sin(vUv.x*79.+sin(vUv.x*37.)*2.7))' : '1.'};
        vec3 color=mix(vec3(.65,.065,.009),vec3(2.4,.9,.12),core)*(grain+pulse*.24);
        gl_FragColor=vec4(color,growth*opacity*(.3+core*.45)*broken);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
}

function cracks(ctx: SpellBonusContext, roots: THREE.Vector3[], length: number, duration: number): void {
  const material = heatMaterial(true), mesh = new THREE.Mesh(fractureGeometry(roots, length), material);
  mesh.name = 'fire-bonus:floor-fractures';
  ctx.effect(mesh, duration, t => {
    material.uniforms.age.value = t * duration;
    material.uniforms.opacity.value = 1 - smooth(t, .54, 1);
  });
}

/** Dark rock remains lit by the scene; emission is confined to hot seams. */
function moltenRockMaterial(heat: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0x514035, roughness: .88,
    emissive: 0xff6518, emissiveIntensity: heat, flatShading: true, transparent: true });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vRockPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockPoint=position;');
    shader.fragmentShader = 'varying vec3 vRockPoint;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 rp=vRockPoint*9.;
      float grain=.5+.5*sin(rp.x*2.7+sin(rp.y*3.1))*sin(rp.z*3.9-rp.x);
      float seam=1.-smoothstep(.035,.16,abs(sin(rp.x+sin(rp.z*1.7)+rp.y*.8)));
      totalEmissiveRadiance*=.025+seam*(.5+grain*.5);
      diffuseColor.rgb*=.55+grain*.45;`);
  };
  material.customProgramCacheKey = () => 'molten-rock-seams-v1';
  return material;
}

function moltenRockGeometry(radius: number, detail: number): THREE.IcosahedronGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, detail), positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x=positions.getX(i), y=positions.getY(i), z=positions.getZ(i);
    const scale=1 + .12*Math.sin(x/radius*5.1+y/radius*3.7)*Math.cos(z/radius*4.3);
    positions.setXYZ(i,x*scale,y*scale,z*scale);
  }
  geometry.computeVertexNormals(); return geometry;
}

/** All fragments use one draw call; each cast owns its geometry and material. */
function fragmentBurst(ctx: SpellBonusContext, roots: THREE.Vector3[], count: number, duration: number, scale = 1): void {
  const material = moltenRockMaterial(.22);
  const mesh = new THREE.InstancedMesh(moltenRockGeometry(.16, 1), material, roots.length * count);
  mesh.name = 'fire-bonus:burning-fragments'; mesh.frustumCulled = false;
  const pose = new THREE.Object3D();
  const update = (t: number) => {
    roots.forEach((root, r) => {
      for (let i = 0; i < count; i++) {
        const a = i * 2.399 + r * .8, speed = (1.5 + (i % 4) * .43) * scale;
        const age = t * duration;
        pose.position.copy(root).add(new THREE.Vector3(Math.cos(a) * speed * age, Math.max(.055, .18 + (2.7 + i % 3 * .45) * scale * age - 4.8 * age * age), Math.sin(a) * speed * age));
        pose.rotation.set(a + age * 3, a * .7 + age * 2, age * 5);
        pose.scale.set(.6 + i % 3 * .22, 1.1 + i % 4 * .15, .65).multiplyScalar(scale * (1 - smooth(t, .7, 1)));
        pose.updateMatrix(); mesh.setMatrixAt(r * count + i, pose.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true; material.emissiveIntensity = .22 * (1 - t); material.opacity = 1 - smooth(t, .8, 1);
  };
  update(0); ctx.effect(mesh, duration, update);
}

function aftershock(ctx: SpellBonusContext): void {
  const ground = ctx.origin.clone().setY(.05);
  ctx.schedule(.4, () => cracks(ctx, [ground], 6.1, 1.55));
  ctx.schedule(.78, () => {
    const material = fireNovaFrontMaterial(), radius = 6.8;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.3, radius * 2.3), material);
    mesh.name = 'fire-bonus:aftershock-front'; mesh.position.copy(ground); mesh.rotation.x = -Math.PI / 2;
    material.uniforms.radius.value = radius; material.uniforms.heat.value = 1.25;
    ctx.effect(mesh, .85, t => { material.uniforms.progress.value = t; material.uniforms.time.value = ctx.time(); });
    fragmentBurst(ctx, [ground], 18, .95, .8);
  });
}

function crescentGeometry(): THREE.BufferGeometry {
  const points: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, angle = (t - .5) * Math.PI * 1.25;
    const thickness = Math.pow(Math.sin(t * Math.PI), .7) * .48;
    for (const edge of [0, 1]) {
      const r = 2.35 - thickness * edge;
      points.push(Math.sin(angle) * r, Math.sin(t * Math.PI) * .38, Math.cos(angle) * r);
      uv.push(t, edge);
    }
    if (i < 40) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function riftSlash(ctx: SpellBonusContext): void {
  const material = heatMaterial(), mesh = new THREE.Mesh(crescentGeometry(), material);
  mesh.name = 'fire-bonus:rift-crescent';
  const direction = ctx.target.clone().sub(ctx.origin).setY(0).normalize(), heading = Math.atan2(direction.x, direction.z);
  ctx.effect(mesh, .78, t => {
    const distance = ctx.origin.distanceTo(ctx.target) * smooth(t, 0, .8);
    mesh.position.copy(ctx.origin).addScaledVector(direction, distance).setY(.6);
    mesh.rotation.set(.15, heading, -.22); mesh.scale.setScalar(.65 + .7 * smooth(t, 0, .4));
    material.uniforms.age.value = .65 + t; material.uniforms.opacity.value = smooth(t, 0, .05) * (1 - smooth(t, .65, 1));
  });
  ctx.schedule(.58, () => {
    for (const hit of ctx.targets) ctx.emit(hit.position.clone().setY(hit.height * .55), 0xffaa45, 7, 1.2, .45);
  });
}

function moltenCore(ctx: SpellBonusContext): void {
  const target = ctx.target.clone().setY(.12), start = target.clone().add(new THREE.Vector3(-5, 11, -3));
  const coreMaterial = moltenRockMaterial(3.0); coreMaterial.color.setHex(0x967052);
  coreMaterial.transparent = false; // The solid core stays opaque until contact.
  const core = new THREE.Mesh(moltenRockGeometry(.68, 2), coreMaterial);
  core.name = 'fire-bonus:molten-core'; core.position.copy(start);
  ctx.effect(core, .65, t => { core.position.lerpVectors(start, target, t * t); core.rotation.set(t * 4, t * 3, t); });
  // A short, tapered flame tail follows the exact accelerated core flight.
  // It carries the motion cue without turning the crust into a glowing ball.
  const tailLength = 2.35;
  const tailGeometry = new THREE.CylinderGeometry(.045, .42, tailLength, 18, 8, true);
  tailGeometry.translate(0, tailLength * .5, 0);
  const tailMaterial = fireSheetMaterial(6.1), tail = new THREE.Mesh(tailGeometry, tailMaterial);
  tail.name = 'fire-bonus:molten-core-tail'; tail.position.copy(start);
  tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), start.clone().sub(target).normalize());
  ctx.effect(tail, .65, t => {
    tail.position.lerpVectors(start, target, t * t);
    tailMaterial.uniforms.time.value = ctx.time() * 1.5;
    tailMaterial.uniforms.opacity.value = smooth(t, 0, .12) * (1 - smooth(t, .94, 1)) * .72;
  });
  // Disconnected angular crust pieces reveal the hot core as they peel away.
  const crustMaterial = moltenRockMaterial(.12);
  const crust = new THREE.InstancedMesh(moltenRockGeometry(.46, 1), crustMaterial, 12);
  crust.name = 'fire-bonus:meteor-crust'; crust.frustumCulled = false;
  const pose = new THREE.Object3D(), center = new THREE.Vector3();
  const update = (t: number) => {
    const age = t * .94, flight = clamp(age / .65, 0, 1), split = smooth(age, .34, .65);
    center.lerpVectors(start, target, flight * flight);
    for (let i = 0; i < 12; i++) {
      const a = i * 2.399, y = 1 - 2 * (i + .5) / 12, radius = Math.sqrt(1 - y * y);
      const normal = new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
      pose.position.copy(center).addScaledVector(normal, .6 + split * 1.5);
      pose.position.y = Math.max(.1, pose.position.y - Math.max(0, age - .65) * 5);
      pose.rotation.set(a + age * 2, a * .7 + age, a * .3);
      pose.scale.set(1, .68, .82).multiplyScalar(1 - smooth(age, .72, .94)); pose.updateMatrix(); crust.setMatrixAt(i, pose.matrix);
    }
    crust.instanceMatrix.needsUpdate = true;
  };
  update(0); ctx.effect(crust, .94, update);
  ctx.schedule(.65, () => {
    ctx.meteorImpact(target, new THREE.Vector3(5, -11, 3), .4);
    cracks(ctx, [target], 3.7, 1.3);
  });
  ctx.schedule(.79, () => {
    fragmentBurst(ctx, [target], 24, 1.1, 1.1);
    ctx.ring(target, 0xffa03c, 3.5, .45);
  });
}

function blazingWake(ctx: SpellBonusContext): void {
  const landing = (ctx.targets[0]?.position ?? ctx.target).clone();
  const direction = landing.clone().sub(ctx.origin).setY(0), distance = direction.length(); direction.normalize();
  const side = new THREE.Vector3(-direction.z, 0, direction.x);
  const paths: THREE.BufferGeometry[] = [];
  // Two torn wake edges leave the centre of the path readable.
  for (const sign of [-1, 1]) {
    const points: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32, edge = .36 + Math.sin(t * 25) * .08;
      for (const width of [-.07, .07]) {
        const p = ctx.origin.clone().addScaledVector(direction, t * distance).addScaledVector(side, sign * edge + width);
        points.push(p.x, .06, p.z); uv.push(t, width < 0 ? 0 : 1);
      }
      if (i < 32) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); paths.push(geometry);
  }
  const geometry = mergeGeometries(paths)!; paths.forEach(p => p.dispose());
  const material = heatMaterial(), mesh = new THREE.Mesh(geometry, material); mesh.name = 'fire-bonus:blazing-wake';
  ctx.effect(mesh, 1.85, t => { material.uniforms.age.value = t * 1.85; material.uniforms.opacity.value = 1 - smooth(t, .55, 1); });
  for (let i = 0; i < 6; i++) ctx.schedule(.64 + i * .065, () => {
    const at = landing.clone().addScaledVector(direction, -distance * i / 6).setY(0);
    ctx.firePillar(at, 1.05 + (i % 2) * .3, .55);
  });
}

function volcanicGround(ctx: SpellBonusContext): void {
  const roots = ctx.targets.slice(0, 10).map(t => t.position.clone().setY(0));
  if (!roots.length) return;
  cracks(ctx, roots, 1.65, 1.95);
  ctx.schedule(.49, () => fragmentBurst(ctx, roots, 5, 1.2, .8));
  // Existing Firestorm owns the tall fire columns; these low contacts bind
  // the bonus cracks and dark fragments to those same target positions.
  roots.forEach((at, i) => ctx.schedule(.45 + i * .035, () => ctx.fireContact(at, .7)));
}

/** Presentation only: this module never changes damage or the hit list. */
export function playFireSpellBonus(ctx: SpellBonusContext): void {
  switch (ctx.shape) {
    case 'aftershock': aftershock(ctx); break;
    case 'rift-slash': riftSlash(ctx); break;
    case 'meteor-shower': moltenCore(ctx); break;
    case 'blazing-wake': blazingWake(ctx); break;
    case 'volcanic-ground': volcanicGround(ctx); break;
  }
}
