import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { InstancedBufferGeometry, MathUtils, Vector3 } from 'three';
import { createFireNova, createFireNovaContacts, createNovaIgnition, fireNovaRadius } from '../src/rpg/world/fireNova';

test('Nova front reaches targets at the preserved radial contact time', () => {
  for (const radius of [8.8, 10.6, 10.8]) for (const distance of [.2, 2, 4.7, 7.3, radius * .96]) {
    const contact = 1.3 * (1 - Math.cbrt(1 - Math.min(.97, distance / (radius * 1.01))));
    assert(Math.abs(fireNovaRadius(radius, contact / 1.3) - distance) < 1e-10);
  }
});

test('Nova volume displacement stays within conservative culling bounds and bounded geometry', () => {
  const wave = createFireNova(10.8), origin = new Vector3(2, 0, -20), view = new Vector3(17, 25, 20).normalize();
  try {
    assert.equal(wave.layers.length, 2);
    const volume = wave.layers[1], geometry = volume.geometry as InstancedBufferGeometry, vertices = geometry.getAttribute('position');
    assert.equal(geometry.instanceCount, 30);
    const heat = Array.from(geometry.getAttribute('flameHeat').array);
    assert.equal(heat.filter(value => value > .7).length, 10, 'Only dominant spines carry peak heat');
    assert.equal(heat.filter(value => value < .25).length, 10, 'Low gas stays subordinate');
    assert(geometry.getIndex()!.count / 3 * geometry.instanceCount < 2500);
    for (const progress of [0, .01, .1, .4, .8, 1]) {
      const activeView = progress > .5 ? view.clone().negate() : view;
      wave.update(origin, activeView, progress, progress * 1.3);
      assert.equal(volume.material.uniforms.progress.value, progress);
      const front = Math.max(.18, fireNovaRadius(10.8, progress)), growth = MathUtils.smoothstep(front, .15, 1.8);
      let previousDepth = -Infinity;
      for (let instance = 0; instance < geometry.instanceCount; instance++) {
        const angle = geometry.getAttribute('flameAngle').getX(instance), seed = geometry.getAttribute('flameSeed').getX(instance);
        const width = Math.min(geometry.getAttribute('flameWidth').getX(instance), front * .14);
        const height = Math.min(geometry.getAttribute('flameHeight').getX(instance), .35 + front * .46) * (.9 + .1 * Math.sin(progress * 1.3 * 11 + seed * 19));
        const radius = front - geometry.getAttribute('flameLag').getX(instance) * growth;
        const depth = radius * (Math.cos(angle) * activeView.x + Math.sin(angle) * activeView.z) + height * .5 * activeView.y;
        assert(depth >= previousDepth - 1e-5, 'Overlapping absorbing volumes must be submitted back-to-front'); previousDepth = depth;
        const tangent = new Vector3(Math.sin(angle), 0, -Math.cos(angle)), radial = new Vector3(Math.cos(angle), 0, Math.sin(angle));
        assert(tangent.clone().cross(new Vector3(0, 1, 0)).dot(radial) > .999, 'Ray-entry box must preserve front-face winding');
        const bounds = new Vector3(width + .65 * Math.min(1, front * .35), height * .5 + .025, width * .78 + (geometry.getAttribute('flameLean').getX(instance) + .37) * growth);
        // A curved tip must remain inside its own ray-entry box, including
        // the first small-radius frames where growth and lean differ.
        for (let rise = 0; rise < 1; rise += .05) {
          const narrow = Math.max(.014, width * Math.pow(1 - rise, 1.05) * (1 - MathUtils.smoothstep(rise, .6, .98) * .7) * (.6 + .4 * MathUtils.smoothstep(rise, 0, .22)));
          const side = ((seed - .5) * .75 * rise + Math.sin(rise * 8 - progress * 1.3 * 8 + seed * 13) * .24 * Math.pow(rise, 1.5)) * Math.min(1, front * .35);
          const out = (geometry.getAttribute('flameLean').getX(instance) * rise + .33 * Math.sin(rise * Math.PI - progress * 1.3 * 5 + seed * 4) * rise) * growth;
          assert(Math.abs(side) + narrow <= bounds.x + 1e-6);
          assert(Math.abs(out) + narrow * .78 <= bounds.z + 1e-6);
        }
        for (let i = 0; i < vertices.count; i++) {
          const local = new Vector3().fromBufferAttribute(vertices, i).multiply(bounds).multiplyScalar(2); local.y += bounds.y;
          const point = new Vector3(Math.cos(angle) * (radius + local.z) + Math.sin(angle) * local.x, local.y, Math.sin(angle) * (radius + local.z) - Math.cos(angle) * local.x);
          assert(geometry.boundingBox!.containsPoint(point)); assert(geometry.boundingSphere!.containsPoint(point));
        }
      }
    }
  } finally { for (const layer of wave.layers) { layer.geometry.dispose(); layer.material.dispose(); } }
});

test('Nova contacts pool whole-horde submissions and preserve each independent strike time', () => {
  const contacts = createFireNovaContacts(48);
  try {
    assert.equal(contacts.layers.length, 4);
    contacts.strike(0, new Vector3(1, 0, 2), new Vector3(0, 0, 1), .4, .9);
    contacts.strike(47, new Vector3(-2, 0, 8), new Vector3(-1, 0, 0), 1.1, 1.3);
    contacts.update(1.2);
    for (const layer of contacts.layers) {
      const pieces = layer.userData.pieces as number;
      assert.equal(layer.geometry.instanceCount, 48 * pieces);
      const start = layer.geometry.getAttribute('contactStart'), at = layer.geometry.getAttribute('contactOrigin');
      assert(Math.abs(start.getX(0) - .4) < 1e-6); assert(Math.abs(start.getX(47 * pieces) - 1.1) < 1e-6);
      assert(start.getX(pieces) < 0, 'Unstruck targets stay inactive');
      assert.equal(at.getX(47 * pieces), -2); assert.equal(at.getZ(47 * pieces), 8);
      assert.equal(layer.material.uniforms.time.value, 1.2);
      for (const attribute of Object.values(layer.geometry.attributes)) assert(Array.from(attribute.array).every(Number.isFinite));
    }
  } finally { for (const layer of contacts.layers) { layer.geometry.dispose(); layer.material.dispose(); } }
});

test('Crossing floor masks use room-local coordinates for traveling beds and world-space contacts', () => {
  const wave = createFireNova(8.8, 1, 3), contacts = createFireNovaContacts(2, false, 3);
  const ordinary = createFireNova(8.8, 1, 2);
  try {
    wave.update(new Vector3(.35, 0, -58.6), new Vector3(17, 25, 20), .4, 1);
    for (const layer of wave.layers) {
      const mask = layer.material.uniforms.floorMask.value as Vector3;
      assert.equal(mask.x, 1); assert.equal(mask.y, .35); assert(Math.abs(mask.z - 1.4) < 1e-10);
    }
    for (const layer of contacts.layers) assert.deepEqual(layer.material.uniforms.floorMask.value.toArray(), [1, 0, 60]);
    ordinary.update(new Vector3(0, 0, -38.6), new Vector3(17, 25, 20), .4, 1);
    for (const layer of ordinary.layers) assert.equal(layer.material.uniforms.floorMask.value.x, 0, 'Other rooms retain the accepted full front');
  } finally {
    for (const layer of [...wave.layers, ...contacts.layers, ...ordinary.layers]) { layer.geometry.dispose(); layer.material.dispose(); }
  }
});


test('Nova ignition follows copied world-space hand anchors with bounded strands, seed and owned resources', () => {
  const ignition = createNovaIgnition(), hand = new Vector3(2, 1.7, -58), ground = new Vector3(1, .06, -58.6);
  assert.equal(ignition.mesh.geometry.instanceCount, 2);
  assert(ignition.mesh.geometry.getIndex()!.count / 3 * 3 <= 700);
  for (const age of [0, .04, .08, .13, .18, .23, .29]) {
    ignition.update(hand, ground, age);
    assert.deepEqual(ignition.mesh.material.uniforms.hand.value.toArray(), hand.toArray());
    assert.deepEqual(ignition.mesh.material.uniforms.ground.value.toArray(), ground.toArray());
    assert.equal(ignition.mesh.material.uniforms.age.value, age);
    assert.deepEqual(ignition.seed.position.toArray(), ground.toArray());
    assert.equal(ignition.seed.material.uniforms.age.value, age);
    assert.notEqual(ignition.mesh.material.uniforms.hand.value, hand, 'Updating the marker later must not mutate an earlier draw input');
    hand.x += .03;
  }
  for (const attribute of Object.values(ignition.mesh.geometry.attributes)) assert(Array.from(attribute.array).every(Number.isFinite));
  const bend = new Vector3(.6, 0, -.3);
  ignition.update(hand, ground, .13, bend); bend.set(99, 99, 99);
  assert.deepEqual(ignition.mesh.material.uniforms.bend.value.toArray(), [.6, 0, -.3]);
  ignition.update(hand, ground, .13);
  assert.deepEqual(ignition.mesh.material.uniforms.bend.value.toArray(), [0, 0, 0], 'A reused helper must not retain the previous camera-side bend');
  let disposed = 0;
  for (const layer of [ignition.mesh, ignition.seed]) {
    layer.geometry.addEventListener('dispose', () => disposed++); layer.material.addEventListener('dispose', () => disposed++);
    layer.geometry.dispose(); layer.material.dispose();
  }
  assert.equal(disposed, 4);
});
