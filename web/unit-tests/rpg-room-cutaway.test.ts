import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { BoxGeometry, Group, Material, Mesh, MeshDepthMaterial, MeshStandardMaterial, PointLight, ShaderMaterial, Texture } from 'three';
import { RoomCutaway, roomCutawayOpacity } from '../src/rpg/world/RoomCutaway';

test('Doorway fade is continuous, reversible, and leaves the next room opaque', () => {
  let previous = 1;
  for (let z = 0; z >= -15; z -= .01) {
    const alpha = roomCutawayOpacity(0, z);
    assert(alpha <= previous + 1e-10);
    assert(previous - alpha < .004, 'No one-frame room disappearance during ordinary travel');
    assert.equal(roomCutawayOpacity(1, z), 1);
    previous = alpha;
  }
  assert.equal(roomCutawayOpacity(0, -8.5), 1);
  assert.equal(roomCutawayOpacity(0, -10.5), .5);
  assert.equal(roomCutawayOpacity(0, -12.5), 0);
  assert.equal(roomCutawayOpacity(1, -30.5), .5);
});

test('Shared scenery maps and materials survive independent room fading and teardown', () => {
  const texture = new Texture(), source = new MeshStandardMaterial({ map: texture });
  const shaderHook = () => {}; source.onBeforeCompile = shaderHook;
  const rooms = [0, 1].map(room => {
    const root = new Group(); root.userData = { room, occluder: true };
    const mesh = new Mesh(new BoxGeometry(), source); mesh.castShadow = true;
    root.add(mesh); return { root, mesh };
  });
  const floor = new Mesh(new BoxGeometry(), source); floor.userData = { room: 0, occluder: false };
  const oldDepth = new MeshDepthMaterial(); rooms[0].mesh.customDepthMaterial = oldDepth;
  let sourceDisposals = 0, textureDisposals = 0, cloneDisposals = 0, depthDisposals = 0;
  source.addEventListener('dispose', () => sourceDisposals++); texture.addEventListener('dispose', () => textureDisposals++);
  const fade = new RoomCutaway('hash'); fade.prepare([...rooms.map(r => r.root), floor]);
  for (const { mesh } of rooms) {
    assert.notEqual(mesh.material, source); assert.equal(mesh.material.map, texture);
    assert.equal(mesh.material.onBeforeCompile, shaderHook); assert.equal(mesh.material.alphaHash, true);
    mesh.material.addEventListener('dispose', () => cloneDisposals++);
    mesh.customDepthMaterial!.addEventListener('dispose', () => depthDisposals++);
  }
  fade.update(-10.5);
  assert.equal(rooms[0].mesh.material.opacity, .5); assert.equal(rooms[1].mesh.material.opacity, 1);
  assert.equal(source.opacity, 1); assert.equal(floor.material, source); assert.equal(floor.visible, true);
  fade.update(-13); assert.equal(rooms[0].root.visible, false); assert.equal(rooms[1].root.visible, true);
  fade.update(-9); assert.equal(rooms[0].root.visible, true);
  fade.clear(); fade.clear();
  for (const { mesh } of rooms) assert.equal(mesh.material, source);
  assert.equal(rooms[0].mesh.customDepthMaterial, oldDepth);
  assert.equal(cloneDisposals, 2); assert.equal(depthDisposals, 2);
  assert.equal(sourceDisposals, 0); assert.equal(textureDisposals, 0);
});

test('Flame animation stays connected while light and packed shadows share a reversible fade', () => {
  const root = new Group(); root.userData = { room: 0, occluder: true };
  const time = { value: 3 };
  const material = new ShaderMaterial({ uniforms: { time }, transparent: true,
    fragmentShader: 'void main(){ gl_FragColor=vec4(1.); }' });
  const flame = new Mesh(new BoxGeometry(), material), stone = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  stone.castShadow = true; const light = new PointLight(0xffffff, 22); root.add(flame, stone, light);
  const fade = new RoomCutaway(); fade.prepare([root]); fade.update(-10.5); fade.update(-10.5);
  assert.equal(flame.material.uniforms.time, time);
  assert.equal(flame.material.uniforms.roomCutawayAlpha.value, .5);
  assert.equal(light.intensity, 11, 'Rendering again must not repeatedly multiply the light');
  const shader = { uniforms: {} as Record<string, { value: number }>, fragmentShader: '#include <alphahash_fragment>' };
  stone.customDepthMaterial!.onBeforeCompile(shader as never, {} as never);
  assert.equal(shader.uniforms.roomCutawayAlpha.value, .5);
  assert(shader.fragmentShader.indexOf('diffuseColor.a *= roomCutawayAlpha') < shader.fragmentShader.indexOf('#include <alphahash_fragment>'));
  fade.update(-8); assert.equal(light.intensity, 22); assert.equal(shader.uniforms.roomCutawayAlpha.value, 1);
  fade.clear(); assert.equal(flame.material, material);
});

test('Nearest-surface prepass exists only during fading and releases only owned resources', () => {
  const root = new Group(); root.userData = { room: 0, occluder: true };
  const geometry = new BoxGeometry(), source = new MeshStandardMaterial();
  const mesh = new Mesh(geometry, source); mesh.renderOrder = 7; root.add(mesh);
  let geometryDisposals = 0; geometry.addEventListener('dispose', () => geometryDisposals++);
  const fade = new RoomCutaway('prepass'); fade.prepare([root]); fade.update(0);
  const depth = mesh.children[0] as Mesh;
  assert.equal(depth.geometry, geometry); assert.equal(depth.visible, false);
  assert.equal(mesh.material, source); assert.equal(mesh.renderOrder, 7);
  fade.update(-10.5);
  assert.equal(depth.visible, true); assert.equal((depth.material as Material).colorWrite, false);
  assert.equal(mesh.material.opacity, .5); assert.equal(mesh.material.depthWrite, false);
  assert.equal(mesh.material.transparent, true); assert.equal(mesh.renderOrder, 100);
  fade.update(-13); assert.equal(depth.visible, false);
  fade.update(-8); assert.equal(mesh.material, source); assert.equal(mesh.renderOrder, 7);
  fade.clear(); assert.equal(mesh.children.length, 0); assert.equal(geometryDisposals, 0);
});
