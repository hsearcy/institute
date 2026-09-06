import assert from 'node:assert/strict';
import { test } from 'bun:test';
import * as THREE from 'three';
import { createVaultScenery } from '../src/rpg/world/scenery';
import { boundsIntersectCrossingChasm } from '../src/rpg/world/roomLayout';

test('Weathering stays registered to the floor and no scenery triangles span a crossing opening', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect() {}, createRadialGradient: () => ({ addColorStop() {} }) }) }) } });
  const map = new THREE.Texture();
  const base = { wall: new THREE.MeshStandardMaterial({ map }), trim: new THREE.MeshStandardMaterial({ map }), floor: new THREE.MeshStandardMaterial({ map }) };
  let scenery: THREE.Group | undefined;
  try {
    scenery = createVaultScenery(base);
    const gateFloor = scenery.userData.gateFloorMaterial as THREE.MeshStandardMaterial;
    assert(gateFloor instanceof THREE.MeshStandardMaterial, 'Room zero must receive a renderable floor on every scenery rebuild');
    assert.equal(gateFloor.map, map, 'Dry paving borrows the loaded floor texture');
    assert.equal(gateFloor.roughnessMap, null);
    assert(gateFloor.roughness > .9 && scenery.userData.ownedMaterials.includes(gateFloor));
    assert.notEqual(gateFloor, base.floor, 'Local weathering must not mutate other rooms');
    base.floor.color.setHex(0x919fa7);
    assert.equal(gateFloor.color.getHex(), 0x919fa7, 'Changing region must tint the dry gate floor too');
    const roomDraws = new Map<number, number>(), weatheredRooms = new Set<number>(), clothRooms = new Set<number>();
    for (const mesh of scenery.children as THREE.Mesh[]) {
      const room = mesh.userData.room as number, geometry = mesh.geometry, position = geometry.getAttribute('position');
      roomDraws.set(room, (roomDraws.get(room) ?? 0) + 1);
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.alphaMap?.channel === 1) {
        weatheredRooms.add(room); assert.equal(material.map, map, 'Floor map must be borrowed, not remapped to the patch');
        const uv = geometry.getAttribute('uv'); assert.equal(geometry.getAttribute('uv1').count, position.count);
        for (let i = 0; i < position.count; i++) {
          assert(Math.abs(uv.getX(i) - position.getX(i) / 4.8) < .00001);
          assert(Math.abs(uv.getY(i) - position.getZ(i) / 4.8) < .00001);
        }
      }
      if (material.name === 'Worn ceremonial cloth') {
        clothRooms.add(room);
        assert(material.alphaTest > 0 && !material.transparent, 'Torn edges must cut away without translucent sorting artifacts');
        for (const texture of [material.map, material.bumpMap]) assert(scenery.userData.ownedTextures.includes(texture), 'Runner maps must be owned by scenery cleanup');
        let minHeight = Infinity, maxHeight = -Infinity;
        for (let i = 0; i < position.count; i++) { minHeight = Math.min(minHeight, position.getY(i)); maxHeight = Math.max(maxHeight, position.getY(i)); }
        assert(maxHeight - minHeight > .015 && maxHeight < .08, 'Cloth needs shallow creases while remaining floor dressing');
        const pixels = (material.map as THREE.DataTexture).image.data;
        let solid = 0, cutout = 0;
        for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] === 0) cutout++; else solid++; }
        assert(cutout > solid * .05 && solid > cutout, 'Worn cloth must have visible tears/fraying and a substantial surviving center');
      }
      if (room === 3) for (let i = 0; i < position.count; i += 3) {
        const xs = [0, 1, 2].map(corner => position.getX(i + corner)), zs = [0, 1, 2].map(corner => position.getZ(i + corner) + 60);
        assert.equal(boundsIntersectCrossingChasm(room, { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }), false);
      }
    }
    assert.equal(weatheredRooms.size, 6);
    assert.equal(clothRooms.size, 3);
    assert([...roomDraws.values()].every(count => count <= 15), 'Scenery must remain merged by room/material');
    const mask = (scenery.userData.ownedTextures as THREE.Texture[]).find(texture => texture instanceof THREE.DataTexture) as THREE.DataTexture;
    const { data, width, height } = mask.image;
    for (let x = 0; x < width; x++) for (const y of [0, height - 1]) assert.equal(data[(y * width + x) * 4 + 1], 0, 'Mask border must vanish');
    for (let y = 0; y < height; y++) for (const x of [0, width - 1]) assert.equal(data[(y * width + x) * 4 + 1], 0, 'Mask border must vanish');
    assert(!(scenery.userData.ownedTextures as THREE.Texture[]).includes(map), 'Rebuilding scenery must not dispose the floor/stone map');
  } finally {
    if (scenery) { scenery.children.forEach(object => (object as THREE.Mesh).geometry.dispose()); scenery.userData.ownedMaterials.forEach((material: THREE.Material) => material.dispose()); scenery.userData.ownedTextures.forEach((texture: THREE.Texture) => texture.dispose()); }
    Object.values(base).forEach(material => material.dispose()); map.dispose();
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete (globalThis as { document?: unknown }).document;
  }
});
