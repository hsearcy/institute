import * as THREE from 'three';

/** One camera-facing mesh contains a kinked main channel and short dying forks. */
export function lightningGeometry(from: THREE.Vector3, to: THREE.Vector3, width: number, view: THREE.Vector3, seed: number): THREE.BufferGeometry {
  let state = seed | 0;
  const random = () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
  const positions: number[] = [], uv: number[] = [], strengths: number[] = [], indices: number[] = [];
  const direction = to.clone().sub(from), length = direction.length(); direction.normalize();
  const axis = Math.abs(direction.y) < .85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const across = direction.clone().cross(axis).normalize(), depth = direction.clone().cross(across).normalize();
  const makePath = (start: THREE.Vector3, end: THREE.Vector3, steps: number, scatter: number) => Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, point = start.clone().lerp(end, t);
    if (i > 0 && i < steps) point.addScaledVector(across, (random() - .5) * scatter).addScaledVector(depth, (random() - .5) * scatter * .65);
    return point;
  });
  const addPath = (points: THREE.Vector3[], power: number) => {
    const offset = positions.length / 3, halfWidth = Math.max(.007, Math.min(.025, width * .18)) * 5 * power;
    for (let i = 0; i < points.length; i++) {
      const tangent = points[Math.min(points.length - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
      const side = tangent.clone().cross(view).normalize();
      if (side.lengthSq() < .01) side.copy(across);
      const taper = power < 1 ? 1 - i / points.length * .7 : 1;
      for (const sign of [-1, 1]) {
        const p = points[i].clone().addScaledVector(side, sign * halfWidth * taper);
        positions.push(p.x, p.y, p.z); uv.push(i / (points.length - 1), (sign + 1) / 2); strengths.push(power);
      }
      if (i < points.length - 1) { const k = offset + i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  };
  if (length > .001) {
    const path = makePath(from, to, Math.max(5, Math.min(40, Math.ceil(length * 2.8))), Math.min(.65, length * .1));
    addPath(path, 1);
    for (let fork = 0; fork < (length > 5 ? 3 : 2); fork++) {
      const index = Math.floor(path.length * (.24 + fork * .19)), start = path[index];
      const reach = Math.min(2, length * (.13 + random() * .08));
      const end = start.clone().addScaledVector(direction, reach * .6)
        .addScaledVector(across, (fork % 2 ? -1 : 1) * reach * .65)
        .addScaledVector(depth, (random() - .5) * reach * .7);
      addPath(makePath(start, end, 6, reach * .24), .42 + random() * .13);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('strength', new THREE.Float32BufferAttribute(strengths, 1));
  geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Independent caller-owned shader: no texture or shared-material lifetime. */
export function lightningMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { progress: { value: 0 }, tint: { value: new THREE.Color(color) } },
    vertexShader: `attribute float strength;varying vec2 vUv;varying float vStrength;
      void main(){vUv=uv;vStrength=strength;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float vStrength;uniform float progress;uniform vec3 tint;
      void main(){float d=abs(vUv.y-.5)*2.;
        float core=1.-smoothstep(.075,.21,d);float glow=exp(-d*d*7.)*.16;
        float flash=exp(-progress*17.)+.65*exp(-pow((progress-.26)*27.,2.))+.26*exp(-pow((progress-.53)*24.,2.));
        float channel=(.85+.15*sin(vUv.x*71.))*vStrength;
        float ends=smoothstep(0.,.016,vUv.x)*(1.-smoothstep(.94,1.,vUv.x));
        vec3 corona=mix(vec3(.13,.35,.95),tint,.3);
        vec3 c=vec3(1.65,1.85,2.15)*core+corona*glow;
        gl_FragColor=vec4(c,clamp((core+glow)*flash*channel*ends,0.,1.));}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
  });
}
