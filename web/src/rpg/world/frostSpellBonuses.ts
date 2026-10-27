import * as THREE from 'three';
import { frostfallCrystalGeometry, frostfallCrystalMaterial, frostfallContactMaterial } from './frostfall';
import type { SpellBonusContext } from './spellBonusTypes';
import { spikeTravel } from './frostGuardian';

export interface Crystal {
  at: THREE.Vector3;
  height: number;
  radius: number;
  delay: number;
  lean?: number;
  /** Yaw of the lean; a positive lean then tips the crystal toward -X turned by this. */
  heading?: number;
  /** Shatter direction, else a golden-angle spread. */
  fling?: THREE.Vector3;
  /** Seconds to full height; a slam's spikes punch up faster than a bloom. */
  growth?: number;
}
export type CrystalFieldHost = Pick<SpellBonusContext, 'time' | 'effect'> & { shape: string };
const UP = new THREE.Vector3(0, 1, 0);

/** A single draw call for the whole field. Each mineral has its own growth and fracture timing. */
export function crystalField(ctx: CrystalFieldHost, crystals: Crystal[], duration: number, shatter = true): void {
  const positions: number[] = [], normals: number[] = [], uv: number[] = [];
  const spans: { start: number; end: number; crystal: Crystal; direction: THREE.Vector3 }[] = [];
  crystals.forEach((crystal, index) => {
    const source = frostfallCrystalGeometry(index + 71, crystal.radius, crystal.height);
    source.translate(0, crystal.height, 0);
    source.rotateZ(crystal.lean ?? Math.sin(index * 2.3) * .24);
    source.rotateY(crystal.heading ?? index * 2.399);
    const p = source.getAttribute('position'), n = source.getAttribute('normal'), tex = source.getAttribute('uv');
    const start = positions.length / 3;
    for (let v = 0; v < p.count; v++) {
      positions.push(p.getX(v), p.getY(v), p.getZ(v));
      normals.push(n.getX(v), n.getY(v), n.getZ(v)); uv.push(tex.getX(v), tex.getY(v));
    }
    spans.push({ start, end: positions.length / 3, crystal, direction: crystal.fling ?? new THREE.Vector3(Math.cos(index * 2.399), .8, Math.sin(index * 2.399)) });
    source.dispose();
  });
  const geometry = new THREE.BufferGeometry();
  const local = new Float32Array(positions);
  const position = new THREE.Float32BufferAttribute(local.slice(), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const material = frostfallCrystalMaterial(false, 71);
  const mesh = new THREE.Mesh(geometry, material); mesh.name = `spell-bonus:${ctx.shape}:crystals`; mesh.frustumCulled = false;
  const update = (t: number) => {
    const age = t * duration;
    for (const { start, end, crystal, direction } of spans) {
      const life = age - crystal.delay;
      const grow = THREE.MathUtils.smoothstep(life, 0, crystal.growth ?? .18);
      const breakAge = Math.max(0, life - .48);
      const shrink = 1 - THREE.MathUtils.smoothstep(life, .48, .91);
      const scale = grow * shrink;
      const throwDistance = shatter ? breakAge * 1.9 : 0;
      for (let v = start; v < end; v++) {
        position.setXYZ(v, crystal.at.x + local[v * 3] * scale + direction.x * throwDistance,
          crystal.at.y + Math.max(.018, local[v * 3 + 1] * grow * shrink + direction.y * throwDistance - (shatter ? breakAge * breakAge * 2 : 0)),
          crystal.at.z + local[v * 3 + 2] * scale + direction.z * throwDistance);
      }
    }
    position.needsUpdate = true;
    material.uniforms.time.value = ctx.time();
    material.uniforms.opacity.value = 1 - THREE.MathUtils.smoothstep(t, .84, 1);
  };
  update(0); ctx.effect(mesh, duration, update);
}

function frostMark(ctx: SpellBonusContext, at: THREE.Vector3, size: number, delay: number): void {
  ctx.schedule(delay, () => {
    const material = frostfallContactMaterial();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    mesh.name = `spell-bonus:${ctx.shape}:contact`; mesh.position.copy(at).y = .045; mesh.rotation.x = -Math.PI / 2;
    ctx.effect(mesh, .8, t => { material.uniforms.age.value = t; material.uniforms.opacity.value = Math.sin(t * Math.PI) * .9; });
  });
}

/** One shell mesh per real lance, with three facets orbiting its flight axis. */
export function createDiamondDrill(seed = 1) {
  const geometry = new THREE.BufferGeometry();
  const base: number[] = [], normals: number[] = [], uv: number[] = [], ids: number[] = [];
  for (let shard = 0; shard < 3; shard++) {
    const g = frostfallCrystalGeometry(seed + shard, .12, .95);
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), tex = g.getAttribute('uv');
    for (let v = 0; v < p.count; v++) { base.push(p.getX(v), p.getY(v), p.getZ(v)); normals.push(n.getX(v), n.getY(v), n.getZ(v)); uv.push(tex.getX(v), tex.getY(v)); ids.push(shard); }
    g.dispose();
  }
  const position = new THREE.Float32BufferAttribute(base.slice(), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const material = frostfallCrystalMaterial(false, seed), mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'spell-bonus:split-lance:diamond-drill'; mesh.frustumCulled = false;
  const axis = new THREE.Vector3();
  return { mesh, update(tip: THREE.Vector3, direction: THREE.Vector3, _view: THREE.Vector3, time: number, opacity = 1) {
    axis.copy(direction).normalize(); if (axis.lengthSq() < .001) axis.copy(UP);
    mesh.position.copy(tip); mesh.quaternion.setFromUnitVectors(UP, axis);
    const spread = .34 + (1 - opacity) * 1.1;
    for (let v = 0; v < ids.length; v++) {
      const angle = time * 13 + ids[v] * Math.PI * 2 / 3 + seed;
      position.setXYZ(v, base[v * 3] + Math.cos(angle) * spread, base[v * 3 + 1] - .35, base[v * 3 + 2] + Math.sin(angle) * spread);
    }
    position.needsUpdate = true; material.uniforms.time.value = time; material.uniforms.opacity.value = opacity;
  } };
}

/** Match summonGuardian's ground position at its .8-second slam, then use one shared fault. */
/** Spikes run from each guardian's slam to its furthest victim, arriving as its hits do. */
export function glacialHammerLayout(origin: THREE.Vector3, slams: readonly { at: THREE.Vector3; delay: number; targets: readonly THREE.Vector3[] }[]): Crystal[] {
  const crystals: Crystal[] = [];
  for (const slam of slams) {
    if (!slam.targets.length) continue;
    const from = slam.at.clone().setY(.035);
    const to = slam.targets.reduce((furthest, target) => target.distanceToSquared(from) > furthest.distanceToSquared(from) ? target : furthest, slam.targets[0]).clone().setY(.035);
    const length = from.distanceTo(to), steps = Math.min(9, Math.max(3, Math.ceil(length / 1.3)));
    for (let step = 0; step <= steps; step++) {
      const p = step / steps, at = from.clone().lerp(to, p);
      const nearBody = slam.targets.some(target => Math.hypot(at.x - target.x, at.z - target.z) < .8);
      const nearHero = Math.hypot(at.x - origin.x, at.z - origin.z) < 2;
      crystals.push({ at, height: nearHero ? .32 : nearBody ? .6 : .3 + Math.sin(p * Math.PI) * .85,
        radius: .22, delay: slam.delay + spikeTravel(length * p) * (step ? 1 : 0), lean: -.12 });
    }
    // Isolated victims get a low terminal fracture, without another full path through the caster.
    for (const target of slam.targets) {
      if (crystals.some(crystal => Math.hypot(crystal.at.x - target.x, crystal.at.z - target.z) < .85)) continue;
      crystals.push({ at: target.clone().setY(.035), height: .6, radius: .2, delay: slam.delay + spikeTravel(from.distanceTo(target)), lean: .18 });
    }
  }
  return crystals;
}

export function playFrostSpellBonus(ctx: SpellBonusContext): void {
  if (!ctx.targets.length) return;
  const crystals: Crystal[] = [];
  if (ctx.shape === 'crystal-bloom') {
    ctx.targets.forEach((target, index) => {
      const delay = .46 + index * .045;
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * 2.399 + index;
        crystals.push({ at: target.position.clone().setY(.035).add(new THREE.Vector3(Math.cos(angle) * .42, 0, Math.sin(angle) * .42)), height: .65 + petal % 3 * .17, radius: .19, delay });
      }
      frostMark(ctx, target.position, 2.2, delay);
      ctx.schedule(delay + .48, () => ctx.emit(target.position.clone().setY(.6), 0xc0e9f1, 7, 1.8, .3));
    });
    crystalField(ctx, crystals, 1.9); return;
  }
  if (ctx.shape === 'glacial-hammer') {
    const slams = ctx.slams ?? [];
    crystalField(ctx, glacialHammerLayout(ctx.origin, slams), 2.5, false);
    for (const slam of slams) for (const target of slam.targets) frostMark(ctx, target, 2.2, slam.delay + spikeTravel(slam.at.distanceTo(target)));
    return;
  }
  if (ctx.shape === 'frozen-fault') {
    ctx.targets.forEach(target => {
      const from = ctx.origin.clone().setY(.035), to = target.position.clone().setY(.035);
      const direction = to.clone().sub(from), length = direction.length(); direction.normalize();
      const side = new THREE.Vector3(-direction.z, 0, direction.x);
      const steps = Math.min(9, Math.max(3, Math.ceil(length / 1.4)));
      for (let step = 1; step <= steps; step++) {
        const p = step / steps;
        for (const row of [-1, 1]) {
          crystals.push({ at: from.clone().lerp(to, p).addScaledVector(side, row * (.25 + p * .5)),
            height: .45 + p * .75, radius: .2,
            delay: p * Math.min(.75, length / 14), lean: -.15 });
        }
      }
      frostMark(ctx, to, 2, Math.min(.75, length / 14));
    });
    crystalField(ctx, crystals, 1.7, false); return;
  }
  if (ctx.shape === 'whiteout') {
    const center = ctx.targets.reduce((sum, target) => sum.add(target.position), new THREE.Vector3()).divideScalar(ctx.targets.length).setY(.1);
    const radius = Math.min(5.5, Math.max(2.1, ...ctx.targets.map(t => t.position.distanceTo(center) + .65)));
    // A sparse ribbon of snow flecks, not a solid wall that hides the models.
    const geometry = new THREE.BufferGeometry(), vertices: number[] = [];
    for (let i = 0; i < 100; i++) {
      const angle = i * 2.399, r = radius * (.35 + .65 * (i % 13) / 12), y = .15 + (i % 17) / 17 * 1.65;
      const x = Math.cos(angle) * r, z = Math.sin(angle) * r, width = .035 + i % 3 * .017;
      vertices.push(x - width, y, z, x + width, y + .025, z, x, y + .1, z + width);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.MeshBasicMaterial({ color: 0xc6e2eb, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
    const snow = new THREE.Mesh(geometry, material); snow.position.copy(center); snow.name = 'spell-bonus:whiteout:snow';
    ctx.effect(snow, 1.65, t => { snow.rotation.y = t * 3.6; snow.position.y = center.y + Math.sin(t * Math.PI) * .25; material.opacity = Math.sin(t * Math.PI) * .55; });
    ctx.targets.forEach((target, index) => {
      ctx.schedule(.48 + index * .045, () => {
        const material = frostfallCrystalMaterial(false, index + 44);
        const mesh = new THREE.Mesh(frostfallCrystalGeometry(index + 44, .24, 1.35), material);
        mesh.name = 'spell-bonus:whiteout:strike';
        const at = target.position.clone().add(new THREE.Vector3(0, target.height * .45, 0));
        mesh.quaternion.setFromUnitVectors(UP, new THREE.Vector3(.22, -1, .1).normalize());
        ctx.effect(mesh, .32, t => { mesh.position.copy(at).add(new THREE.Vector3(-.5, 3, -.25).multiplyScalar(1 - Math.min(1, t * 1.4))); material.uniforms.opacity.value = 1 - THREE.MathUtils.smoothstep(t, .72, 1); });
        ctx.schedule(.23, () => ctx.emit(at, 0xd3f4ff, 5, 1.5, .2));
      });
    });
  }
}
