import assert from 'node:assert/strict';
import { test } from 'bun:test';
import * as THREE from 'three';
import { createElectricDissolve } from '../src/rpg/world/electricDissolve';

test('Electric erosion owns its batch resources and leaves cached asset surfaces unchanged', () => {
  const source = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial({ color: 0x86949b });
  const texture = new THREE.DataTexture(new Uint8Array([100, 120, 140, 255]), 1, 1); material.map = texture;
  const compile = material.onBeforeCompile, binding = createElectricDissolve(source, material, 4);
  let sourceDisposals = 0, textureDisposals = 0, ownedDisposals = 0;
  source.addEventListener('dispose', () => sourceDisposals++); texture.addEventListener('dispose', () => textureDisposals++);
  for (const resource of [binding.geometry, binding.material as THREE.Material, binding.depth]) resource.addEventListener('dispose', () => ownedDisposals++);
  assert.notEqual(binding.geometry, source); assert.notEqual(binding.material, material);
  assert.equal(source.getAttribute('instanceDissolve'), undefined);
  assert.equal((binding.material as THREE.MeshStandardMaterial).map, texture);
  assert.equal(material.onBeforeCompile, compile);
  binding.dispose(); assert.equal(ownedDisposals, 3); assert.equal(sourceDisposals, 0); assert.equal(textureDisposals, 0);
  source.dispose(); material.dispose(); texture.dispose();
});

test('Compacted erosion values reset to the new visible order and reject nonfinite progress', () => {
  const source = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial(), binding = createElectricDissolve(source, material, 4);
  for (const [index, progress] of [0, .25, .8, 1].entries()) binding.set(index, progress);
  binding.set(0, .8); binding.set(1, .1); // Earlier victims leave the batch.
  assert(Math.abs(binding.amount.getX(0) - .8) < 1e-6); assert(Math.abs(binding.amount.getX(1) - .1) < 1e-6);
  for (const [index, progress] of [NaN, Infinity, -1, 2].entries()) binding.set(index, progress);
  assert.deepEqual(Array.from(binding.amount.array), [0, 0, 0, 1]);
  for (let index = 0; index < 4; index++) binding.set(index, 0);
  assert(Array.from(binding.amount.array).every(value => value === 0));
  binding.dispose(); source.dispose(); material.dispose();
});

test('Surface and shadow shaders discard the same world-space erosion and guard non-instanced warmups', () => {
  const source = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial(), binding = createElectricDissolve(source, material, 1);
  const shaders = [THREE.ShaderLib.standard, THREE.ShaderLib.depth].map(shader => ({ vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader, uniforms: {} }));
  (binding.material as THREE.Material).onBeforeCompile(shaders[0], {} as THREE.WebGLRenderer);
  binding.depth.onBeforeCompile(shaders[1], {} as THREE.WebGLRenderer);
  for (const shader of shaders) {
    assert(shader.vertexShader.includes('#ifdef USE_INSTANCING\n  attribute float instanceDissolve;'));
    assert(shader.vertexShader.includes('vElectricDissolve=0.;'), 'Ordinary meshes have a safe no-dissolve path');
    assert(shader.fragmentShader.includes('if(vElectricDissolve>0.001 && electricField()<vElectricDissolve) discard;'));
    assert(!shader.fragmentShader.includes('gl_FragCoord'), 'Erosion follows surfaces instead of a screen checker pattern');
  }
  assert(shaders[0].fragmentShader.includes('totalEmissiveRadiance+='));
  assert(!shaders[1].fragmentShader.includes('totalEmissiveRadiance+='));
  binding.dispose(); source.dispose(); material.dispose();
});
