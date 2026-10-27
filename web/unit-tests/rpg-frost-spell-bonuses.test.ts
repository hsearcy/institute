import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { createDiamondDrill, glacialHammerLayout, playFrostSpellBonus } from '../src/rpg/world/frostSpellBonuses';
import type { SpellBonusContext } from '../src/rpg/world/spellBonusTypes';
import { spikeTravel } from '../src/rpg/world/frostGuardian';

describe('frost bonus presentation', () => {
  for (const shape of ['crystal-bloom', 'frozen-fault', 'glacial-hammer', 'whiteout'] as const) {
    it(`${shape} is finite, bounded, and owns independent resources at ten targets`, () => {
      const effects: { mesh: THREE.Mesh; duration: number; update?: (t: number, dt: number) => void }[] = [];
      const scheduled: (() => void)[] = [];
      const ctx = {
        shape, spellId: 'frost', origin: new THREE.Vector3(), target: new THREE.Vector3(0, 0, -4), view: new THREE.Vector3(0, 0, 1),
        targets: Array.from({ length: 10 }, (_, i) => ({ id: String(i), position: new THREE.Vector3(i % 4 - 2, 0, -3 - Math.floor(i / 4)), height: 2.2 })),
        time: () => 1, castOrigin: () => new THREE.Vector3(),
        slams: [{ at: new THREE.Vector3(-1, .04, -2), delay: 1.38, targets: Array.from({ length: 9 }, (_, i) => new THREE.Vector3(i % 4 - 2, 0, -3 - Math.floor(i / 4))) }],
        effect: (mesh, duration, update) => { effects.push({ mesh, duration, update }); return mesh; },
        schedule: (_delay, action) => { scheduled.push(action); }, emit: () => {},
      } as SpellBonusContext;
      playFrostSpellBonus(ctx);
      while (scheduled.length) scheduled.shift()!();
      expect(effects.length).toBeLessThanOrEqual(11);
      expect(new Set(effects.map(e => e.mesh.geometry)).size).toBe(effects.length);
      expect(new Set(effects.map(e => e.mesh.material)).size).toBe(effects.length);
      for (const effect of effects) {
        expect(effect.duration).toBeLessThanOrEqual(2.5);
        for (const t of [0, .1, .5, .9, 1]) {
          effect.update?.(t, .016);
          expect(Array.from(effect.mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
        }
        effect.mesh.geometry.dispose(); (effect.mesh.material as THREE.Material).dispose();
      }
    });
  }
  it('drill follows the real spear tip and expands at contact', () => {
    const drill = createDiamondDrill();
    const tip = new THREE.Vector3(3, 2, -5), direction = new THREE.Vector3(0, 0, -1);
    drill.update(tip, direction, new THREE.Vector3(0, 1, 0), 1);
    expect(drill.mesh.position.distanceTo(tip)).toBe(0);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(drill.mesh.quaternion);
    expect(up.distanceTo(direction)).toBeLessThan(.0001);
    drill.mesh.geometry.computeBoundingBox(); const initial = drill.mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).x;
    drill.update(tip, direction, new THREE.Vector3(0, 1, 0), 1, .1);
    drill.mesh.geometry.computeBoundingBox(); expect(drill.mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).x).toBeGreaterThan(initial);
    drill.mesh.geometry.dispose(); drill.mesh.material.dispose();
  });
});

it('guardian fault starts at the real slam, runs to its furthest victim, and arrives with the hits', () => {
  const origin = new THREE.Vector3(0, 0, 0), slam = new THREE.Vector3(-1.5, .04, -3);
  const targets = Array.from({ length: 10 }, (_, i) => new THREE.Vector3(i % 3 - 1, 0, -5 - i * .4));
  const layout = glacialHammerLayout(origin, [{ at: slam, delay: 1.38, targets }]);
  expect(layout[0].at.x).toBe(-1.5);
  expect(layout[0].at.z).toBe(-3);
  expect(layout[0].delay).toBe(1.38);
  expect(layout.length).toBeLessThanOrEqual(20);
  expect(layout.every(c => c.height <= 1.15)).toBe(true);
  for (const crystal of layout) {
    expect(crystal.delay).toBeGreaterThanOrEqual(1.38);
    expect(crystal.delay).toBeLessThanOrEqual(1.38 + spikeTravel(slam.distanceTo(crystal.at)) + 1e-3);
    if (Math.hypot(crystal.at.x, crystal.at.z) < 2) expect(crystal.height).toBeLessThanOrEqual(.32);
    if (targets.some(t => Math.hypot(crystal.at.x - t.x, crystal.at.z - t.z) < .8)) expect(crystal.height).toBeLessThanOrEqual(.6);
  }
  expect(glacialHammerLayout(origin, [{ at: slam, delay: 1.38, targets: [] }])).toEqual([]);
});
