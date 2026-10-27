import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { createIceShatter, FROST_GUARDIAN, GUARDIAN_FLANK, guardianFocus, guardianStrike, guardianYaw, planFrostGuardians, spikeTravel } from '../src/rpg/world/frostGuardian';

const body = (x: number, z: number, brute = false) => ({ position: new THREE.Vector3(x, 0, z), brute });

describe('frost guardian', () => {
  it('turns an authored +Z actor to look straight at its target from every side', () => {
    const actor = new THREE.Object3D(), from = new THREE.Vector3(1, 0, -2), look = new THREE.Vector3();
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2, to = from.clone().add(new THREE.Vector3(Math.cos(angle) * 3, 0, Math.sin(angle) * 3));
      actor.position.copy(from); actor.rotation.set(0, guardianYaw(from, to, 0), 0); actor.updateMatrixWorld();
      actor.getWorldDirection(look);
      expect(look.dot(to.clone().sub(from).normalize())).toBeGreaterThan(.9999);
    }
    expect(guardianYaw(from, from.clone(), 1.25)).toBe(1.25);
  });

  it('keeps looking at its victim while it stands, else at the nearest standing enemy', () => {
    const at = new THREE.Vector3();
    const near = { position: new THREE.Vector3(1, 0, 1), dead: false }, far = { position: new THREE.Vector3(6, 0, 0), dead: false };
    const victim = { position: new THREE.Vector3(3, 0, 0), dead: false };
    expect(guardianFocus(at, victim, [near, far, victim])).toBe(victim);
    victim.dead = true;
    expect(guardianFocus(at, victim, [far, near, victim])).toBe(near);
    near.dead = far.dead = true;
    expect(guardianFocus(at, victim, [far, near, victim])).toBe(victim);
  });

  it('assigns every victim once, rises clear of the hero, and strikes from reach', () => {
    const origin = new THREE.Vector3(2, 0, 3);
    const cases: [ReturnType<typeof body>[], boolean][] = [
      [[body(5.5, -1)], false], [[body(-1, 7, true)], true],
      [[body(2, -1.5), body(6.5, 3), body(-2, 5), body(5.4, -.4), body(-3, 0)], false],
      [[body(-2, 1), body(-1, 6), body(4, 7), body(6, 0)], true],
    ];
    for (const [targets, twins] of cases) {
      const plans = planFrostGuardians(origin, targets, twins);
      expect(plans.length).toBe(twins ? 2 : 1);
      expect(plans.flatMap(plan => plan.struck).sort()).toEqual(targets.map((_, i) => i));
      for (const plan of plans) {
        expect(Math.hypot(plan.spawn.x - origin.x, plan.spawn.z - origin.z)).toBeGreaterThanOrEqual(GUARDIAN_FLANK - 1e-6);
        const target = targets[plan.primary].position;
        expect(plan.strike.distanceTo(target)).toBeLessThanOrEqual(Math.max(plan.spawn.distanceTo(target), 2.46));
        expect(plan.delay).toBeGreaterThanOrEqual(FROST_GUARDIAN.slam);
        expect(plan.delay).toBeLessThan(FROST_GUARDIAN.crumble);
      }
      if (twins) expect(plans[0].spawn.distanceTo(plans[1].spawn)).toBeGreaterThan(3);
    }
    // One victim, two guardians: both strike it, the second a beat behind and without a second hit.
    const [first, second] = planFrostGuardians(origin, [body(2, -3)], true);
    expect(second.primary).toBe(first.primary);
    expect(second.struck).toEqual([]);
    expect(second.delay).toBeCloseTo(FROST_GUARDIAN.slam + FROST_GUARDIAN.twinDelay);
  });

  it('stops short of its victim and never steps back when already in reach', () => {
    const spawn = new THREE.Vector3(0, 0, 0);
    expect(guardianStrike(spawn, new THREE.Vector3(0, 0, -6), 2).distanceTo(new THREE.Vector3(0, 0, -4))).toBeLessThan(1e-9);
    expect(guardianStrike(spawn, new THREE.Vector3(0, 0, -2.1), 2)).toEqual(spawn);
  });

  it('runs its ice outward at a bounded pace', () => {
    expect(spikeTravel(0)).toBe(.08);
    expect(spikeTravel(7)).toBeCloseTo(.5);
    expect(spikeTravel(40)).toBe(.7);
  });

  it('shatters into finite chunks that come to rest on the floor', () => {
    const shatter = createIceShatter(3, 16, { radius: 1, height: 3.3, size: .34, speed: 3.4, lift: 2.4 });
    const center = new THREE.Vector3(4, 0, -2), position = shatter.mesh.geometry.getAttribute('position');
    for (const age of [0, .1, .4, .95, 3]) {
      shatter.update(center, age, 1 - age / 3);
      const values = Array.from(position.array as Float32Array);
      expect(values.every(Number.isFinite)).toBe(true);
      for (let i = 1; i < values.length; i += 3) expect(values[i]).toBeGreaterThan(-.35);
    }
    shatter.mesh.geometry.dispose(); shatter.mesh.material.dispose();
  });
});
