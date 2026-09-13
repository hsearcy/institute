import assert from 'node:assert/strict';
import { test } from 'bun:test';
import * as THREE from 'three';
import { cloneErosionProgramMaterial, createElectricDissolve, createSkinnedDissolve } from '../src/rpg/world/electricDissolve';

test('Skinned erosion shares progress with its shadow after deformation and isolates actors', () => {
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const a = createSkinnedDissolve(geometry, material), b = createSkinnedDissolve(geometry, material);
  const compile = (surface: THREE.Material, depth = false) => {
    const shader = { ...(depth ? THREE.ShaderLib.depth : THREE.ShaderLib.standard), uniforms: {} as Record<string, THREE.IUniform> };
    surface.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    return shader;
  };
  // Set before compilation: a newly compiled burn/shadow variant must inherit it.
  a.set(.6);
  const shaders = [compile(a.material as THREE.Material), compile(a.materialFor('burn') as THREE.Material), compile(a.depth, true)];
  const other = compile(b.material as THREE.Material);
  for (const shader of shaders) {
    assert.equal(shader.uniforms.uElectricDissolve, shaders[0].uniforms.uElectricDissolve);
    assert.equal(shader.uniforms.uElectricDissolve.value, .6);
    assert(!shader.vertexShader.includes('instanceDissolve'), 'Skinned actors need no instance attribute');
    assert(shader.vertexShader.indexOf('vElectricDissolve=uElectricDissolve;') > shader.vertexShader.indexOf('#include <skinning_vertex>'));
    assert(shader.vertexShader.includes('vElectricWorld=(modelMatrix*vec4(transformed,1.)).xyz;'));
    assert(shader.fragmentShader.includes('if(vElectricDissolve>0.001 && electricField()<vElectricDissolve) discard;'));
  }
  assert.notEqual(other.uniforms.uElectricDissolve, shaders[0].uniforms.uElectricDissolve);
  assert.equal(other.uniforms.uElectricDissolve.value, 0);
  assert(!shaders[2].fragmentShader.includes('totalEmissiveRadiance+='));
  for (const [input, expected] of [[2, 1], [-1, 0], [NaN, 0], [Infinity, 0], [.3, .3]]) {
    a.set(input);
    for (const shader of shaders) assert.equal(shader.uniforms.uElectricDissolve.value, expected);
    assert.equal(other.uniforms.uElectricDissolve.value, 0);
  }
  assert.notEqual((a.material as THREE.Material).customProgramCacheKey(), a.depth.customProgramCacheKey());
  a.dispose(); b.dispose(); geometry.dispose(); material.dispose();
});

test('Skinned erosion preserves source skin attributes, maps and hooks and owns only its material copies', () => {
  const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture();
  const skinIndex = new THREE.Uint16BufferAttribute(new Uint16Array(geometry.getAttribute('position').count * 4), 4);
  geometry.setAttribute('skinIndex', skinIndex);
  const materials = [new THREE.MeshStandardMaterial({ map: texture }), new THREE.MeshStandardMaterial({ normalMap: texture })];
  materials[0].onBeforeCompile = shader => { shader.uniforms.existingHook = { value: 7 }; };
  const hook = materials[0].onBeforeCompile;
  const binding = createSkinnedDissolve(geometry, materials);
  let sourceDisposals = 0, ownedDisposals = 0;
  for (const source of [geometry, texture, ...materials]) source.addEventListener('dispose', () => sourceDisposals++);
  const electric = binding.material as THREE.MeshStandardMaterial[], burn = binding.materialFor('burn') as THREE.MeshStandardMaterial[];
  for (const owned of [...electric, ...burn, binding.depth]) owned.addEventListener('dispose', () => ownedDisposals++);
  assert.equal(binding.geometry, geometry);
  assert.equal(geometry.getAttribute('skinIndex'), skinIndex);
  assert.equal(geometry.getAttribute('instanceDissolve'), undefined);
  assert.equal(electric[0].map, texture); assert.equal(burn[1].normalMap, texture);
  assert.equal(materials[0].onBeforeCompile, hook);
  assert.equal(binding.materialFor('burn'), burn);
  assert.equal(binding.materialFor('electric'), electric);
  const shader = { ...THREE.ShaderLib.standard, uniforms: {} as Record<string, THREE.IUniform> };
  electric[0].onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.equal(shader.uniforms.existingHook.value, 7);
  binding.dispose(); assert.equal(ownedDisposals, 5); assert.equal(sourceDisposals, 0);
  geometry.dispose(); texture.dispose(); materials.forEach(material => material.dispose());
});

test('Prepared erosion programs retain exact shader hooks after an encounter releases its materials', () => {
  const geometry = new THREE.BoxGeometry(), source = new THREE.MeshStandardMaterial();
  const binding = createElectricDissolve(geometry, source, 2);
  const originals = [binding.materialFor('burn') as THREE.Material, binding.depth];
  const retained = originals.map(cloneErosionProgramMaterial);
  let retainedDisposals = 0;
  retained.forEach(material => material.addEventListener('dispose', () => retainedDisposals++));
  for (let index = 0; index < originals.length; index++) {
    const original = originals[index], material = retained[index];
    assert.notEqual(material, original);
    assert.equal(material.customProgramCacheKey(), original.customProgramCacheKey());
    const shader = index ? THREE.ShaderLib.depth : THREE.ShaderLib.standard;
    const a = { vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader, uniforms: {} };
    const b = { vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader, uniforms: {} };
    original.onBeforeCompile(a, {} as THREE.WebGLRenderer); material.onBeforeCompile(b, {} as THREE.WebGLRenderer);
    assert.equal(a.vertexShader, b.vertexShader); assert.equal(a.fragmentShader, b.fragmentShader);
    assert(b.fragmentShader.includes('electricField()'), 'A retained witness must compile the erosion variant, not a plain material');
  }
  binding.dispose(); assert.equal(retainedDisposals, 0);
  retained.forEach(material => material.dispose()); assert.equal(retainedDisposals, 2);
  geometry.dispose(); source.dispose();
});

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

test('Burn response caches only its surface variant and preserves electric and shadow erosion', () => {
  const source = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const binding = createElectricDissolve(source, material, 2);
  const electric = binding.material as THREE.Material, burn = binding.materialFor('burn') as THREE.Material;
  assert.equal(binding.materialFor('electric'), electric);
  assert.equal(binding.materialFor('burn'), burn, 'Repeated selection reuses the owned surface');
  assert.notEqual(burn, electric); assert.notEqual(burn.customProgramCacheKey(), electric.customProgramCacheKey());
  const shaders = [electric, burn].map(surface => {
    const shader = { ...THREE.ShaderLib.standard, uniforms: {} }; surface.onBeforeCompile(shader, {} as THREE.WebGLRenderer); return shader;
  });
  assert.equal(shaders[0].vertexShader, shaders[1].vertexShader);
  assert.equal(shaders[0].fragmentShader, shaders[1].fragmentShader.replace('vec3(.08,.026,.006)', 'vec3(.015,.05,.08)'), 'Burn changes only the residual hue, preserving accepted erosion');
  binding.set(0, .8); binding.set(1, .2); binding.set(0, 0); binding.set(1, 0);
  assert.deepEqual(Array.from(binding.amount.array), [0, 0], 'One shared reset clears both surface variants');
  let disposed = 0;
  for (const owned of [binding.geometry, electric, burn, binding.depth]) owned.addEventListener('dispose', () => disposed++);
  binding.dispose(); assert.equal(disposed, 4);
  source.dispose(); material.dispose();
});
