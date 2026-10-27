import * as THREE from 'three';
import { iceShardGeometry, iceShardMaterial } from './ice';

/** Beats of one summon, in seconds after it begins. Hits land on `slam`. */
export const FROST_GUARDIAN = {
  height: 3.8, rise: .08, risen: .5, reveal: .55, lunge: .68, planted: 1.1,
  /** The authored attack clip meets its target .6 s in, as a brute's swing does. */
  swing: 1.38 - .6, slam: 1.38, crumble: 1.92, gone: 2.45,
  /** A twin with no victim of its own slams a beat behind the first. */
  twinDelay: .14,
} as const;

/** Sideways from the hero, so the summoning circle never lies under the caster. */
export const GUARDIAN_FLANK = 2.5;

export type GuardianPlan = { spawn: THREE.Vector3; primary: number; struck: number[]; strike: THREE.Vector3; slam: THREE.Vector3; delay: number };

/** How long the slam's ice takes to run along the floor to a further victim. */
export function spikeTravel(distance: number): number { return THREE.MathUtils.clamp(distance / 14, .08, .7); }

/** Where a guardian stands to strike `target`, and the floor point its fists meet. */
export function guardianReach(brute: boolean): number { return brute ? 2.45 : 2.05; }

export function guardianStrike(spawn: THREE.Vector3, target: THREE.Vector3, reach: number, out = new THREE.Vector3()): THREE.Vector3 {
  const dx = target.x - spawn.x, dz = target.z - spawn.z, gap = Math.hypot(dx, dz);
  if (gap <= reach + .25) return out.copy(spawn);
  return out.set(target.x - dx / gap * reach, spawn.y, target.z - dz / gap * reach);
}

/** Authored actors look along +Z, so yaw is atan2(dx, dz). Too close to tell keeps `current`. */
export function guardianYaw(from: THREE.Vector3, to: THREE.Vector3, current: number): number {
  const dx = to.x - from.x, dz = to.z - from.z;
  return dx * dx + dz * dz < 1e-6 ? current : Math.atan2(dx, dz);
}

/** The body a guardian should look at: its own victim while it stands, else the nearest standing enemy. */
export function guardianFocus<T extends { position: THREE.Vector3; dead: boolean }>(from: THREE.Vector3, primary: T, others: readonly T[]): T {
  if (!primary.dead) return primary;
  let best = primary, bestDistance = Infinity;
  for (const other of others) {
    if (other.dead) continue;
    const d = (other.position.x - from.x) ** 2 + (other.position.z - from.z) ** 2;
    if (d < bestDistance) { best = other; bestDistance = d; }
  }
  return best;
}

/**
 * One guardian per flank. Each rises beside the hero on its victims' side,
 * takes the nearest of them as the body it strikes, and its slam sends ice to
 * the rest. Twins with one victim both strike it, the second a beat later.
 */
export function planFrostGuardians(origin: THREE.Vector3, targets: readonly { position: THREE.Vector3; brute: boolean }[], twins: boolean, clear: (from: THREE.Vector3, to: THREE.Vector3) => boolean = () => true): GuardianPlan[] {
  if (!targets.length) return [];
  const center = targets.reduce((sum, t) => sum.add(t.position), new THREE.Vector3()).divideScalar(targets.length);
  const forward = center.clone().sub(origin).setY(0);
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  const side = new THREE.Vector3(forward.z, 0, -forward.x);
  const lateral = (i: number) => targets[i].position.clone().sub(origin).dot(side);
  const indices = targets.map((_, i) => i);
  let groups: { sign: number; members: number[] }[];
  if (twins && targets.length > 1) {
    const sorted = [...indices].sort((a, b) => lateral(a) - lateral(b));
    let split = sorted.findIndex(i => lateral(i) >= 0);
    if (split <= 0 || split >= sorted.length) split = Math.ceil(sorted.length / 2);
    groups = [{ sign: -1, members: sorted.slice(0, split) }, { sign: 1, members: sorted.slice(split) }];
  } else {
    // A lone guardian rises on the flank the pack leans toward.
    groups = [{ sign: centerSign(targets, origin, side) >= 0 ? 1 : -1, members: indices }];
    if (twins) groups.push({ sign: -groups[0].sign, members: [] });
  }
  const distance = (i: number) => targets[i].position.distanceToSquared(origin);
  const lead = groups[0].members.length ? groups[0].members : indices, placed: THREE.Vector3[] = [];
  return groups.map(({ sign, members }, g) => {
    const pool = members.length ? members : lead;
    const primary = pool.reduce((best, i) => distance(i) < distance(best) ? i : best, pool[0]);
    const target = targets[primary].position, reach = guardianReach(targets[primary].brute);
    // Flanks are measured across the pack's direction, so twins rise on opposite sides.
    // Room for a real lunge when the victim is far; clear of the hero's circle when near.
    const ahead = THREE.MathUtils.clamp(target.clone().sub(origin).dot(forward) - reach - 1.8, .4, 2.4);
    // Walls may close a flank: try nearer and further along it, then the far
    // flank, never on top of a twin already placed.
    const candidates = [[sign, ahead], [sign, ahead + 1.3], [sign * .8, Math.max(ahead, GUARDIAN_FLANK * .7)], [sign, ahead - 1.6], [-sign, ahead], [0, Math.max(ahead, GUARDIAN_FLANK)]]
      .map(([across, along]) => origin.clone().addScaledVector(forward, along).addScaledVector(side, across * GUARDIAN_FLANK).setY(0));
    const apart = (at: THREE.Vector3) => placed.every(other => other.distanceTo(at) > 3.2);
    const spawn = candidates.find(at => clear(origin, at) && apart(at)) ?? candidates.find(apart) ?? candidates[0];
    placed.push(spawn);
    const strike = guardianStrike(spawn, target, reach);
    const facing = target.clone().sub(strike).setY(0).normalize();
    const slam = strike.clone().addScaledVector(facing, Math.max(.6, Math.min(reach, strike.distanceTo(target)) - .55)).setY(.04);
    return { spawn, primary, struck: members, strike, slam, delay: FROST_GUARDIAN.slam + (g ? members.length ? .09 : FROST_GUARDIAN.twinDelay : 0) };
  });
}

function centerSign(targets: readonly { position: THREE.Vector3 }[], origin: THREE.Vector3, side: THREE.Vector3): number {
  return targets.reduce((sum, t) => sum + t.position.clone().sub(origin).dot(side), 0);
}

/** A drawn frost circle: two rings, rune ticks and a six-point star, inked in as `progress` rises. */
export function frostSigilMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { progress: { value: 0 }, opacity: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float progress,opacity,time;
      float line(float d,float w){return exp(-d*d/(w*w));}
      void main(){vec2 p=(vUv-.5)*2.;float r=length(p),a=atan(p.y,p.x),turn=fract(a/6.28318+.5);
        float drawn=step(turn,progress*1.25);
        float rings=line(r-.93,.022)+line(r-.78,.012)*.8+line(r-.36,.01)*.7;
        float tick=step(.55,fract(turn*36.))*step(.8,r)*step(r,.9)*(.5+.5*step(.5,fract(turn*6.)));
        float sector=mod(a+3.14159,1.0472)-.5236;
        float spoke=line(r*sin(sector),.014)*step(.12,r)*step(r,.76);
        float hexagon=line(r*cos(sector)-.58,.012)*step(r,.68);
        float branch=line(abs(r*sin(sector))-(r-.44)*.55,.012)*step(.44,r)*step(r,.64);
        float star=(spoke+hexagon*.8+branch*.8)*smoothstep(0.,1.,progress*1.6-r);
        float halo=exp(-r*r*2.6)*.18*(.8+.2*sin(time*5.));
        float ink=(rings+tick*.9)*drawn+star+halo;
        float shimmer=.82+.18*sin(time*7.+r*18.-a*3.);
        gl_FragColor=vec4(vec3(.42,.80,1.)*ink*shimmer*1.6,1.)*opacity*clamp(ink,0.,1.);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
  });
}

/** Broken ice chunks thrown from a body volume, one draw call. Chips spin, fall and settle on the floor. */
export function createIceShatter(seed: number, count: number, volume: { radius: number; height: number; size: number; speed: number; lift: number }) {
  const random = (n: number) => { const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  const base: number[] = [], colors: number[] = [], owner: number[] = [];
  const chips: { offset: THREE.Vector3; velocity: THREE.Vector3; axis: THREE.Vector3; spin: number; floor: number }[] = [];
  for (let i = 0; i < count; i++) {
    const size = volume.size * (.55 + random(i) * .9);
    const g = iceShardGeometry(size * .55, size * 1.6, seed + i * 3).translate(0, -size * .8, 0);
    const p = g.getAttribute('position'), c = g.getAttribute('color');
    for (let v = 0; v < p.count; v++) { base.push(p.getX(v), p.getY(v), p.getZ(v)); colors.push(c.getX(v), c.getY(v), c.getZ(v)); owner.push(i); }
    g.dispose();
    const angle = i * 2.39996 + random(i + 40) * .6, r = volume.radius * Math.sqrt(random(i + 9));
    const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    chips.push({
      offset: out.clone().multiplyScalar(r).setY(volume.height * (.12 + random(i + 17) * .85)),
      velocity: out.clone().multiplyScalar(volume.speed * (.5 + random(i + 23) * .8)).setY(volume.lift * (.3 + random(i + 31) * .9)),
      axis: new THREE.Vector3(random(i + 51) - .5, random(i + 52) - .5, random(i + 53) - .5).normalize(),
      spin: (4 + random(i + 61) * 9) * (random(i + 62) > .5 ? 1 : -1), floor: size * .35,
    });
  }
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.Float32BufferAttribute(new Float32Array(base), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = iceShardMaterial(); material.emissive.setHex(0x2a7ea3); material.emissiveIntensity = .35;
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.castShadow = false;
  const spin = new THREE.Quaternion(), local = new THREE.Vector3(), at = new THREE.Vector3();
  return {
    mesh,
    update(center: THREE.Vector3, age: number, opacity: number) {
      let chip = -1;
      for (let v = 0; v < owner.length; v++) {
        if (owner[v] !== chip) {
          chip = owner[v]; const c = chips[chip];
          at.copy(center).add(c.offset).addScaledVector(c.velocity, age); at.y -= 4.9 * age * age;
          // A chip that reaches the floor slides on it, its tumble damped.
          const landed = at.y < c.floor;
          if (landed) at.y = c.floor;
          spin.setFromAxisAngle(c.axis, (landed ? age * .45 : age) * c.spin);
        }
        local.set(base[v * 3], base[v * 3 + 1], base[v * 3 + 2]).applyQuaternion(spin);
        position.setXYZ(v, at.x + local.x, at.y + local.y, at.z + local.z);
      }
      position.needsUpdate = true;
      material.opacity = .94 * opacity;
    },
  };
}
