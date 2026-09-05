import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { AdditiveBlending, DoubleSide, Vector3 } from 'three';
import { lightningGeometry, lightningMaterial } from '../src/rpg/world/lightning';

test('Lightning remains finite and indexed for horizontal, vertical and camera-parallel paths', () => {
  const from = new Vector3(2, .9, -70);
  const directions = [new Vector3(8, 0, 0), new Vector3(0, 13, 0), new Vector3(0, -13, 0), new Vector3(0, 0, -8), new Vector3(4, 6, -3), new Vector3(.0011, 0, 0)];
  for (const direction of directions) for (const view of [new Vector3(17, 25, 20).normalize(), direction.clone().normalize(), direction.clone().normalize().negate(), new Vector3()]) {
    for (const seed of [0, 1, 2147483647]) {
      const to = from.clone().add(direction), originalFrom = from.clone(), originalTo = to.clone(), originalView = view.clone();
      const geometry = lightningGeometry(from, to, .055, view, seed);
      try {
        const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), strength = geometry.getAttribute('strength'), index = geometry.getIndex()!;
        assert(position.count > 0);
        assert.equal(uv.count, position.count); assert.equal(strength.count, position.count);
        for (const attribute of [position, uv, strength]) assert(Array.from(attribute.array).every(Number.isFinite));
        assert(index.count / 3 <= 120, 'Forks and long channels must remain bounded in complexity');
        assert.equal(geometry.groups.length, 0, 'Forks must share one mesh submission');
        for (let i = 0; i < index.count; i += 3) {
          const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
          assert(ids.every(id => Number.isInteger(id) && id >= 0 && id < position.count));
          const [a, b, c] = ids.map(id => new Vector3().fromBufferAttribute(position, id));
          assert(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-20, 'Camera-aligned channels must not collapse into zero-area triangles');
          assert(ids.every(id => strength.getX(id) === strength.getX(ids[0])), 'Indices must not bridge separate forks');
        }
        for (let vertex = 0; vertex < position.count; vertex++) {
          const point = new Vector3().fromBufferAttribute(position, vertex);
          assert(geometry.boundingBox!.containsPoint(point));
          assert(point.distanceTo(geometry.boundingSphere!.center) <= geometry.boundingSphere!.radius + 1e-6);
          assert(uv.getX(vertex) >= 0 && uv.getX(vertex) <= 1 && uv.getY(vertex) >= 0 && uv.getY(vertex) <= 1);
          assert(strength.getX(vertex) > 0 && strength.getX(vertex) <= 1);
        }
        const mainCount = Array.from(strength.array).filter(power => power === 1).length;
        const center = (first: number) => new Vector3().fromBufferAttribute(position, first).add(new Vector3().fromBufferAttribute(position, first + 1)).multiplyScalar(.5);
        assert(center(0).distanceTo(from) < 1e-5, 'The first flash must connect to its caster');
        assert(center(mainCount - 2).distanceTo(to) < 1e-5, 'The final flash must connect to its target');
        assert.deepEqual(from, originalFrom); assert.deepEqual(to, originalTo); assert.deepEqual(view, originalView);
      } finally { geometry.dispose(); }
    }
  }
});

test('Coincident and negligible endpoints create an empty disposable bolt without NaNs', () => {
  const from = new Vector3(3, .8, -130);
  for (const length of [0, .0001]) {
    const geometry = lightningGeometry(from, from.clone().add(new Vector3(0, length, 0)), .1, new Vector3(), 0);
    try {
      assert.equal(geometry.getAttribute('position').count, 0);
      assert.equal(geometry.getIndex()!.count, 0);
      assert(geometry.boundingBox!.isEmpty());
      assert(geometry.boundingSphere!.center.toArray().every(Number.isFinite));
      assert.equal(geometry.boundingSphere!.radius, 0);
    } finally { geometry.dispose(); }
  }
});

test('Bolt geometry is deterministic, independently owned, and capped for long channels', () => {
  const create = () => lightningGeometry(new Vector3(), new Vector3(0, 1000, 0), .2, new Vector3(1, 1, 1), 731);
  const first = create(), second = create();
  try {
    assert(first.getIndex()!.count / 3 <= 120);
    for (const name of ['position', 'uv', 'strength']) {
      assert.notEqual(first.getAttribute(name).array, second.getAttribute(name).array);
      assert.deepEqual(first.getAttribute(name).array, second.getAttribute(name).array);
    }
    const x = second.getAttribute('position').getX(0);
    first.getAttribute('position').setX(0, 9999);
    assert.equal(second.getAttribute('position').getX(0), x);
  } finally { first.dispose(); second.dispose(); }
});

test('Independent lightning shaders have bounded state and do not occlude later effects', () => {
  const first = lightningMaterial(0x91bcff), second = lightningMaterial(0x91bcff);
  try {
    assert.equal(first.transparent, true); assert.equal(first.blending, AdditiveBlending);
    assert.equal(first.depthWrite, false); assert.equal(first.side, DoubleSide);
    assert.equal(first.toneMapped, false);
    assert.notEqual(first.uniforms.progress, second.uniforms.progress);
    assert.notEqual(first.uniforms.tint.value, second.uniforms.tint.value);
    first.uniforms.progress.value = .9;
    first.uniforms.tint.value.set(0xff0000);
    assert.equal(second.uniforms.progress.value, 0);
    assert.equal(second.uniforms.tint.value.getHex(), 0x91bcff);
    assert(Object.values(first.uniforms).every(uniform => !uniform.value?.isTexture), 'Bolt lifetimes must not own shared texture resources');
  } finally { first.dispose(); second.dispose(); }
});
