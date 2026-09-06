import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Vector3 } from 'three';
import { ballLightningFilamentGeometry, createBallLightning, createBallLightningContacts } from '../src/rpg/world/ballLightning';

test('Electrical volumes use finite, independently phased merged branches within budget', () => {
  for (const seed of [0, 1, 2, 3, 4, 71]) {
    const geometry = ballLightningFilamentGeometry(seed);
    try {
      const position = geometry.getAttribute('position'), index = geometry.getIndex()!;
      for (const name of ['position', 'normal', 'uv', 'power', 'phase']) {
        const attribute = geometry.getAttribute(name);
        assert.equal(attribute.count, position.count);
        assert(Array.from(attribute.array).every(Number.isFinite));
      }
      assert.equal(geometry.groups.length, 0, 'All channels must share one material submission');
      assert(index.count / 3 < 1600, 'Each electrical orb has a bounded branch geometry cost');
      assert(new Set(geometry.getAttribute('phase').array).size >= 6, 'Branches must not pulse in unison');
      for (let triangle = 0; triangle < index.count; triangle += 3) {
        const ids = [index.getX(triangle), index.getX(triangle + 1), index.getX(triangle + 2)];
        assert(ids.every(id => Number.isInteger(id) && id >= 0 && id < position.count));
        const [a, b, c] = ids.map(id => new Vector3().fromBufferAttribute(position, id));
        assert(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-18, 'Bent channels must not contain collapsed faces');
      }
      for (let vertex = 0; vertex < position.count; vertex++) {
        const point = new Vector3().fromBufferAttribute(position, vertex);
        assert(geometry.boundingBox!.containsPoint(point));
        assert(point.distanceTo(geometry.boundingSphere!.center) <= geometry.boundingSphere!.radius + 1e-6);
      }
    } finally { geometry.dispose(); }
  }
});

test('Orb layers share a moving origin and fade completely at charge and decay boundaries', () => {
  const orb = createBallLightning(2), other = createBallLightning(2);
  try {
    assert.equal(orb.layers.length, 2, 'The orbit upgrade must remain eight volume/filament draws');
    for (const progress of [0, .1, .5, .85, 1]) {
      const position = new Vector3(2 + progress, 1.5, -80), view = new Vector3(17, 25, 20).normalize();
      orb.update(position, view, progress, progress * 2.15, progress === .5 ? 1 : 0);
      for (const layer of orb.layers) {
        assert.deepEqual(layer.position, position);
        const direction = layer.material.uniforms.viewDirection.value as Vector3;
        assert(direction.toArray().every(Number.isFinite));
        assert(Math.abs(direction.length() - 1) < 1e-6);
        const opacity = layer.material.uniforms.opacity.value;
        assert(opacity >= 0 && opacity <= 1);
        if (progress === 0 || progress === 1) assert.equal(opacity, 0);
      }
    }
    orb.layers.forEach((layer, index) => {
      assert.notEqual(layer.geometry, other.layers[index].geometry);
      assert.notEqual(layer.material.uniforms.viewDirection.value, other.layers[index].material.uniforms.viewDirection.value);
      assert.equal(other.layers[index].material.uniforms.opacity.value, 0);
    });
  } finally {
    for (const layer of [...orb.layers, ...other.layers]) { layer.geometry.dispose(); layer.material.dispose(); }
  }
});

test('Electrical contacts pool finite directional fragments and floor haze for the full horde', () => {
  const contacts = createBallLightningContacts(48);
  try {
    assert.equal(contacts.layers.length, 2);
    assert.equal(contacts.layers[0].geometry.instanceCount, 48 * 4);
    assert.equal(contacts.layers[1].geometry.instanceCount, 48);
    for (let index = 0; index < 48; index++) {
      contacts.strike(index, new Vector3(index*.2, 1.1, -40), index % 2 ? new Vector3() : new Vector3(1,0,1), .65 + index*.01);
    }
    contacts.update(1.2);
    for (const layer of contacts.layers) {
      assert.equal(layer.material.uniforms.time.value, 1.2);
      assert.equal(layer.frustumCulled, false, 'Instance origins are shader attributes, outside base-primitive bounds');
      for (const attribute of Object.values(layer.geometry.attributes)) assert(Array.from(attribute.array).every(Number.isFinite));
      const geometry = layer.geometry;
      const source = geometry.getAttribute('source'), birth = geometry.getAttribute('birth'), velocity = geometry.getAttribute('velocity');
      for (let slot = 0; slot < geometry.instanceCount; slot++) {
        assert(birth.getX(slot) >= .65 - 1e-6 && birth.getX(slot) < 1.2);
        if (layer === contacts.layers[0]) assert(new Vector3().fromBufferAttribute(velocity,slot).lengthSq() > .01);
        else assert(Math.abs(source.getY(slot)-.045)<1e-6, 'Haze must stay at the floor, below airborne fragments');
      }
    }
  } finally { for (const layer of contacts.layers) { layer.geometry.dispose(); layer.material.dispose(); } }
});
