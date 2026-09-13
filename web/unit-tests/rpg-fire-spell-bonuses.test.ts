import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import type { RpgSpellShape } from '@institute/shared';
import { playFireSpellBonus } from '../src/rpg/world/fireSpellBonuses';
import type { SpellBonusContext } from '../src/rpg/world/spellBonusTypes';

function cast(shape: RpgSpellShape, targetCount = 10) {
  const meshes: { mesh: THREE.Mesh; duration: number; update?: (t: number, delta: number) => void }[] = [];
  const actions: { at: number; action: () => void }[] = [];
  let now = 0, impacts = 0; const impactScales: number[] = [];
  const targets = Array.from({ length: targetCount }, (_, i) => ({ id: `enemy-${i}`, position: new THREE.Vector3(i % 3 - 1, 0, -4 - Math.floor(i / 3)), height: 2 }));
  const ctx: SpellBonusContext = {
    shape, spellId: 'ember', origin: new THREE.Vector3(), target: new THREE.Vector3(0, 0, -6), targets,
    view: new THREE.Vector3(0, 1, 1).normalize(), time: () => now, castOrigin: () => new THREE.Vector3(0, 1.2, 0),
    effect(mesh, duration, update) { meshes.push({ mesh, duration, update }); return mesh; },
    schedule(delay, action) { actions.push({ at: now + delay, action }); },
    emit() {}, debris() {}, bolt() {}, ring() {}, firePillar() {}, fireContact() {}, meteorImpact(_at, _incoming, scale) { impacts++; impactScales.push(scale); },
  };
  playFireSpellBonus(ctx);
  while (actions.length) {
    actions.sort((a, b) => a.at - b.at);
    const action = actions.shift()!; now = action.at; action.action();
  }
  return { meshes, impacts, impactScales };
}

describe('fire spell bonus resource ownership', () => {
  for (const shape of ['aftershock', 'rift-slash', 'meteor-shower', 'blazing-wake', 'volcanic-ground'] as const) {
    test(`${shape}: bounded unique resources and finite animated geometry`, () => {
      const { meshes } = cast(shape);
      expect(meshes.length).toBeGreaterThan(0); expect(meshes.length).toBeLessThanOrEqual(6);
      const geometries = new Set(), materials = new Set();
      for (const { mesh, duration, update } of meshes) {
        expect(duration).toBeLessThanOrEqual(2);
        expect(geometries.has(mesh.geometry)).toBe(false); geometries.add(mesh.geometry);
        const ownMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of ownMaterials) { expect(materials.has(material)).toBe(false); materials.add(material); }
        const positions = mesh.geometry.getAttribute('position');
        expect(positions.count).toBeGreaterThan(0);
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        for (const t of [0, .1, .4, .8, 1]) {
          update?.(t, 1 / 60); mesh.updateMatrix();
          expect(mesh.matrix.elements.every(Number.isFinite)).toBe(true);
          if (mesh instanceof THREE.InstancedMesh) expect(Array.from(mesh.instanceMatrix.array).every(Number.isFinite)).toBe(true);
        }
        let disposed = false;
        mesh.geometry.addEventListener('dispose', () => { disposed = true; }); mesh.geometry.dispose(); expect(disposed).toBe(true);
        for (const material of ownMaterials) material.dispose();
      }
    });
  }
  test('Molten Core has one primary presentation impact', () => {
    const result = cast('meteor-shower');
    expect(result.impacts).toBe(1);
    expect(result.impactScales[0] * 10).toBeLessThanOrEqual(4);
  });
  test('Molten Core tail stays attached throughout the accelerated flight', () => {
    const result = cast('meteor-shower');
    const core = result.meshes.find(entry => entry.mesh.name === 'fire-bonus:molten-core')!;
    const tail = result.meshes.find(entry => entry.mesh.name === 'fire-bonus:molten-core-tail')!;
    for (const t of [0, .25, .6, .9]) {
      core.update?.(t, 1 / 60); tail.update?.(t, 1 / 60);
      expect(core.mesh.position.distanceTo(tail.mesh.position)).toBeLessThan(.00001);
    }
  });
  test('empty volcanic targets do not allocate effects', () => {
    expect(cast('volcanic-ground', 0).meshes.length).toBe(0);
  });
});
