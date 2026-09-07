import * as THREE from 'three';

/** A slim luminous spine plus a soft, tapering slipstream; never a solid beam. */
export function createIceLanceWake() {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float opacity;
      void main(){float d=abs(vUv.y-.5)*2.;float tail=pow(vUv.x,1.35)*(1.-smoothstep(.84,1.,vUv.x));
        float core=exp(-d*d*125.)*.56;float halo=exp(-d*d*8.)*.23;
        gl_FragColor=vec4(vec3(.19,.60,.88)+vec3(.85,1.,1.)*core,opacity*tail*(core+halo));}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material), across = new THREE.Vector3(), midpoint = new THREE.Vector3();
  const points = geometry.getAttribute('position');
  return {
    mesh,
    update(tip: THREE.Vector3, direction: THREE.Vector3, view: THREE.Vector3, opacity: number, travelled: number) {
      across.crossVectors(direction, view).normalize();
      if (across.lengthSq() < .01) across.set(1, 0, 0);
      // Plane X goes from fading tail to its tip, sitting inside the crystal.
      for (let i = 0; i < points.count; i++) {
        const uv = geometry.getAttribute('uv'), t = uv.getX(i);
        midpoint.copy(tip).addScaledVector(direction, -Math.min(3.1, travelled) * (1 - t))
          .addScaledVector(across, (uv.getY(i) - .5) * .26);
        points.setXYZ(i, midpoint.x, midpoint.y, midpoint.z);
      }
      points.needsUpdate = true; geometry.computeBoundingSphere(); material.uniforms.opacity.value = opacity;
    },
  };
}

/** A taut directional discharge: narrow straight backbone with small forks.
 * All body-contact endpoints remain exactly where the server victim is drawn. */
export function arcLanceGeometry(from: THREE.Vector3, to: THREE.Vector3, view: THREE.Vector3, seed: number): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], strengths: number[] = [], indices: number[] = [];
  const direction = to.clone().sub(from).normalize(), side = direction.clone().cross(view).normalize();
  if (side.lengthSq() < .01) side.set(1, 0, 0);
  const span = from.distanceTo(to), segments = Math.max(8, Math.ceil(span * 5));
  const random = (n: number) => Math.sin(seed * 3.71 + n * 61.37);
  const path = (start: THREE.Vector3, end: THREE.Vector3, steps: number, width: number, strength: number, scatter: number) => {
    const base = positions.length / 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, center = start.clone().lerp(end, t).addScaledVector(side, Math.sin(t * Math.PI) * random(i + base) * scatter);
      for (const sign of [-1, 1]) {
        const at = center.clone().addScaledVector(side, sign * width * (strength === 1 ? 1 : 1 - t * .8));
        positions.push(at.x, at.y, at.z); uv.push(t, (sign + 1) / 2); strengths.push(strength);
      }
      if (i < steps) { const k = base + i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  };
  path(from, to, segments, .115, 1, .018);
  for (let fork = 0; fork < 4; fork++) {
    const start = from.clone().lerp(to, .22 + fork * .18);
    const end = start.clone().addScaledVector(direction, .36 + Math.abs(random(fork + 20)) * .5).addScaledVector(side, (fork % 2 ? -1 : 1) * (.18 + Math.abs(random(fork + 40)) * .28));
    path(start, end, 6, .045, .45, .075);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('strength', new THREE.Float32BufferAttribute(strengths, 1)); geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}

export function arcLanceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { progress: { value: 0 } },
    vertexShader: `attribute float strength;varying vec2 vUv;varying float vStrength;void main(){vUv=uv;vStrength=strength;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float vStrength;uniform float progress;
      void main(){float d=abs(vUv.y-.5)*2.;float core=exp(-d*d*30.);float glow=exp(-d*d*6.)*.52;
        float pulse=(1.-smoothstep(.36,1.,progress))*(.94+.06*cos(progress*32.));
        vec3 tint=mix(vec3(.32,.20,.95),vec3(.17,.49,1.),vUv.x);
        gl_FragColor=vec4(tint*.85+vec3(1.55,1.8,2.1)*core,(core+glow)*pulse*vStrength);}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}
