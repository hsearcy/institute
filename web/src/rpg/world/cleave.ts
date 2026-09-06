import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, ShaderMaterial, Vector3 } from 'three';
import { bladeWakeMaterial } from './materials';

// The authored hero's strike is frame 10 at 50 fps: (10 - 1) / 50 = .18s.
export const CLEAVE_RELEASE = .18;
export const CLEAVE_SPEED = 10;
const SAMPLES = 16, HISTORY = 12;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const relativeAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const put = (values: Float32Array, offset: number, x: number, y: number, z: number) => {
  values[offset] = x; values[offset + 1] = y; values[offset + 2] = z;
};

export type CleaveTarget = { position: Vector3; height: number; contact: (at: Vector3, origin: Vector3) => void };
type CleaveBlocker = { position: Vector3; height: number };
type Ray = { angle: number; left: number; right: number; distance: number; y: number; target: CleaveTarget; hit: boolean };

/** A continuous cutting lip carries the silhouette; broken heat stays behind it. */
export function cleaveEdgeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 1 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float time;uniform float opacity;
      float tongue(float u,float v,float root,float reach,float bend,float width){
        float q=(.88-v)/reach;if(q<0.||q>1.)return 0.;
        float center=root+bend*q*q,halfWidth=width*(1.-q);
        return (1.-smoothstep(halfWidth,halfWidth+.018,abs(u-center)))
          *smoothstep(0.,.09,q)*(1.-smoothstep(.72,1.,q));
      }
      void main(){float u=vUv.x,v=vUv.y;
        float taper=smoothstep(0.,.22,u)*(1.-smoothstep(.55,1.,u));
        float aa=max(fwidth(v)*.6,.018),width=mix(.012,.11,taper);
        float lip=1.-smoothstep(width*.3,width+aa,abs(v-(1.-width)));
        float hot=exp(-pow((u-.38)/.17,2.));
        float tail=tongue(u,v,.16,.67,.14,.047)
          +tongue(u,v,.46,.43,.09,.082)*.8
          +tongue(u,v,.76,.55,.12,.035)*.6;
        float ends=smoothstep(0.,.055,u)*(1.-smoothstep(.91,1.,u));
        float edge=lip*(.12+.88*taper)*(.65+.2*hot);
        float a=(edge+tail*.18)*ends*opacity;
        vec3 ember=vec3(.65,.105,.008);
        vec3 steelHeat=mix(vec3(1.,.34,.055),vec3(1.75,1.03,.3),hot);
        gl_FragColor=vec4(mix(ember,steelHeat,lip),a);}`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false,
  });
}

function ribbon(segments: number, cutting = false) {
  const geometry = new BufferGeometry(), positions = new Float32Array((segments + 1) * 6), uv = new Float32Array((segments + 1) * 4), indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    uv.set([i / segments, 0, i / segments, 1], i * 4);
    if (i < segments) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2)); geometry.setIndex(indices);
  const mesh = new Mesh(geometry, cutting ? cleaveEdgeMaterial() : bladeWakeMaterial()); mesh.frustumCulled = false; mesh.visible = false;
  return { mesh, positions, upload: () => { geometry.attributes.position.needsUpdate = true; } };
}

/** A short trace sampled from the real mounted blade, followed by one traveling
 * cutting edge. Target callbacks report visual arrival only; damage is supplied
 * by the server and this effect never chooses targets or rolls outcomes.
 */
export function createCleaveStrike(targets: CleaveTarget[], blockers: CleaveBlocker[] = []) {
  const blade = ribbon(HISTORY - 1), front = ribbon(Math.max(1, targets.length) * (SAMPLES + 1) - 1, true);
  const frontUV = front.mesh.geometry.attributes.uv;
  for (let i = 0; i < frontUV.count; i++) frontUV.setXY(i, (Math.floor(i / 2) % (SAMPLES + 1)) / SAMPLES, i % 2);
  const origin = new Vector3(), average = new Vector3(), offset = new Vector3();
  const starts = Array.from({ length: HISTORY }, () => new Vector3()), tips = Array.from({ length: HISTORY }, () => new Vector3());
  const ages = new Float64Array(HISTORY), rays: Ray[] = [];
  let count = 0, released = false, heading = 0, farthest = 0;

  function release(grip: Vector3, tip: Vector3) {
    released = true;
    // The front leaves the distal edge, not the hero's feet or room center.
    origin.copy(grip).lerp(tip, .84);
    average.set(0, 0, 0); targets.forEach(target => average.add(target.position));
    if (targets.length) average.multiplyScalar(1 / targets.length);
    average.sub(origin); heading = Math.atan2(average.x, average.z);
    for (const target of targets) {
      offset.copy(target.position).sub(origin);
      const distance = Math.hypot(offset.x, offset.z);
      const half = Math.atan2(Math.min(1.2, Math.max(.8, target.height * .5)), Math.max(.1, distance));
      rays.push({ angle: relativeAngle(Math.atan2(offset.x, offset.z) - heading), left: half, right: half, distance, y: target.position.y + Math.min(1.15, target.height * .6), target, hit: false });
      farthest = Math.max(farthest, distance);
    }
    rays.sort((a, b) => a.angle - b.angle);
    for (const ray of rays) for (const blocker of blockers) {
      offset.copy(blocker.position).sub(origin);
      const distance = Math.hypot(offset.x, offset.z), delta = relativeAngle(Math.atan2(offset.x, offset.z) - heading - ray.angle);
      // A nearly collinear rear enemy is protected by depth termination. For a
      // distinct adjacent direction, shorten only the crowded side of the arc.
      if (Math.abs(delta) < .06 && distance > ray.distance + .6) continue;
      const margin = Math.atan2(Math.min(.7, Math.max(.28, blocker.height * .22)), Math.max(.1, distance)) + .025;
      const available = Math.max(.035, Math.abs(delta) - margin);
      if (delta < 0) ray.left = Math.min(ray.left, available);
      else ray.right = Math.min(ray.right, available);
    }
  }

  function contact(ray: Ray) {
    if (ray.hit) return;
    ray.hit = true; offset.copy(ray.target.position); offset.y = ray.y;
    ray.target.contact(offset, origin);
  }

  return {
    layers: [blade.mesh, front.mesh],
    // A tab can resume after the whole mesh lifetime. Scheduled presentation
    // reconciliation must still apply the supplied outcomes exactly once.
    finish(grip: Vector3, tip: Vector3) {
      if (!released) release(grip, tip);
      rays.forEach(contact);
    },
    update(grip: Vector3, tip: Vector3, age: number, time: number) {
      if (age >= .045 && age <= .26) {
        for (let i = HISTORY - 1; i > 0; i--) { starts[i].copy(starts[i - 1]); tips[i].copy(tips[i - 1]); ages[i] = ages[i - 1]; }
        starts[0].copy(grip).lerp(tip, .28); tips[0].copy(tip); ages[0] = age; count = Math.min(HISTORY, count + 1);
      }
      for (let i = 0; i < HISTORY; i++) {
        const source = Math.min(i, Math.max(0, count - 1));
        const fade = clamp(1 - (age - ages[source]) / .15);
        offset.copy(starts[source]).lerp(tips[source], 1 - fade);
        put(blade.positions, i * 6, offset.x, offset.y, offset.z);
        put(blade.positions, i * 6 + 3, tips[source].x, tips[source].y, tips[source].z);
      }
      blade.mesh.visible = count > 1 && age < .42;
      blade.mesh.material.uniforms.time.value = time; blade.mesh.material.uniforms.opacity.value = clamp((age - .045) / .035) * clamp((.42 - age) / .15);
      blade.upload();
      if (!released && age >= CLEAVE_RELEASE) release(grip, tip);
      if (!released || !rays.length) return;
      const radius = Math.max(0, age - CLEAVE_RELEASE) * CLEAVE_SPEED;
      front.mesh.visible = radius < farthest + .65;
      for (let rayIndex = 0; rayIndex < rays.length; rayIndex++) {
        const ray = rays[rayIndex];
        // The released edge separates into short cutting segments aimed at the
        // supplied targets. Do not bridge an empty angle with a room-wide line
        // that appears to strike an unaffected actor between those targets.
        const remaining = clamp((ray.distance + .4 - radius) / .4);
        for (let i = 0; i <= SAMPLES; i++) {
          const u = i / SAMPLES, angle = heading + ray.angle - ray.left + u * (ray.left + ray.right);
          const index = rayIndex * (SAMPLES + 1) + i;
          // Zero-width ends also make the indexed join between segments
          // degenerate, so no hidden connector spans their independent paths.
          const width = Math.pow(Math.sin(u * Math.PI), .7) * .38 * remaining;
          for (let side = 0; side < 2; side++) {
            const r = Math.max(0, radius - (1 - side) * width), blend = clamp(r / Math.max(.01, ray.distance));
            put(front.positions, index * 6 + side * 3, origin.x + Math.sin(angle) * r, origin.y + (ray.y - origin.y) * blend, origin.z + Math.cos(angle) * r);
          }
        }
      }
      front.mesh.material.uniforms.time.value = time;
      front.mesh.material.uniforms.opacity.value = clamp(radius / .35) * clamp((farthest + .65 - radius) / .65) * .95;
      front.upload();
      for (const ray of rays) if (radius >= ray.distance) contact(ray);
    },
  };
}
