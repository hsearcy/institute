import assert from 'node:assert/strict';
import { test, spyOn } from 'bun:test';
import * as THREE from 'three';
import { createOutdoorWorld, disposeOutdoorWorld, outdoorKind } from '../src/rpg/world/outdoorWorld';

/** Only replace image loading; all geometry construction and disposal is real. */
function withOutdoor(region: string, check: (world: THREE.Group, textures: THREE.Texture[]) => void): void {
  const textures: THREE.Texture[] = [];
  const loader = spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => {
    const texture = new THREE.Texture(); textures.push(texture); return texture;
  });
  const errors = spyOn(console, 'error').mockImplementation(() => {});
  let world: THREE.Group | undefined;
  try {
    world = createOutdoorWorld(region);
    assert.equal(errors.mock.calls.length, 0, 'Geometry merge errors must not remove scenery batches');
    check(world, textures);
  } finally {
    if (world) disposeOutdoorWorld(world);
    errors.mockRestore(); loader.mockRestore();
  }
}

for (const region of ['mosswood', 'tidebreak', 'old-quarry', 'kingsgarden']) {
  test(`${region}: scene geometry is valid, supports all encounters, and can be culled by room`, () => {
    withOutdoor(region, world => {
      const rooms = new Set<number>(), floors = new Map<number, THREE.Mesh>();
      assert(world.children.length > 6, 'Each destination needs scenery as well as floor');
      for (const object of world.children) {
        assert(object instanceof THREE.Mesh);
        const room = object.userData.room;
        assert(Number.isInteger(room) && room >= 0 && room < 6, 'Every batch must have a valid room for distance culling');
        rooms.add(room);
        const geometry = object.geometry, positions = geometry.getAttribute('position');
        assert(positions.count > 0);
        for (const attribute of Object.values(geometry.attributes)) {
          assert.equal(attribute.count, positions.count, 'Merged shader attributes must cover every vertex');
          assert(attribute.array.every(Number.isFinite), 'Merged shader attributes must be finite');
        }
        if (geometry.index) for (const index of geometry.index.array) assert(index >= 0 && index < positions.count);
        geometry.computeBoundingBox();
        assert(geometry.boundingBox && !geometry.boundingBox.isEmpty());
        if ((object.material as THREE.Material).name === 'trail-ground') floors.set(room, object);
      }
      assert.equal(rooms.size, 6);
      assert.equal(floors.size, 6, 'Every encounter must retain its own floor batch');
      const ray = new THREE.Raycaster(); world.updateMatrixWorld(true);
      // Check the real triangles, including the former indoor crossing room.
      for (let room = 0; room < 6; room++) for (const x of [-6.8, 0, 6.8]) for (const z of [-7.4, 1.4, 7.6]) {
        ray.set(new THREE.Vector3(x, 10, z - room * 20), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObject(floors.get(room)!, false);
        assert(hits.length > 0, `Room ${room} has no floor at ${x},${z}`);
        assert(Math.abs(hits[0]!.point.y) < .05, 'Combat ground must remain level with actor feet');
      }
      assert(floors.get(5)!.geometry.boundingBox!.min.z <= -125, 'Ground must extend behind the boss rather than end in the camera view');
    });
  });

  test(`${region}: removing a destination releases all source textures and rendered resources`, () => {
    withOutdoor(region, (world, textures) => {
      const parent = new THREE.Group(); parent.add(world);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      world.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      const disposed = new Set<THREE.Texture | THREE.Material | THREE.BufferGeometry>();
      for (const resource of [...textures, ...materials, ...geometries]) resource.addEventListener('dispose', () => { disposed.add(resource); });
      assert(textures.length >= 2, 'The scene must load its ground colour and normal maps');
      disposeOutdoorWorld(world);
      assert.equal(parent.children.length, 0);
      for (const resource of [...textures, ...materials, ...geometries]) assert(disposed.has(resource), 'A removed destination must release its GPU resources');
    });
  });
}

test('The sea is above the sloped coastal ground, while the combat shore remains dry', () => {
  withOutdoor('tidebreak', world => {
    for (let room = 0; room < 6; room++) {
      const meshes = world.children.filter(object => object.userData.room === room) as THREE.Mesh[];
      const floor = meshes.find(mesh => (mesh.material as THREE.Material).name === 'trail-ground')!;
      const sea = meshes.find(mesh => (mesh.material as THREE.Material).name === 'water')!;
      sea.geometry.computeBoundingBox();
      const seaHeight = sea.geometry.boundingBox!.max.y;
      const points = floor.geometry.getAttribute('position');
      let submerged = 0;
      for (let i = 0; i < points.count; i++) {
        if (points.getX(i) >= 13) {
          assert(points.getY(i) < seaHeight, 'The ground must not hide the sea or foam'); submerged++;
        } else if (Math.abs(points.getX(i)) <= 6.8) {
          assert(points.getY(i) > seaHeight, 'Enemies and hero need a dry combat floor');
        }
      }
      assert(submerged > 0);
    }
  });
});

test('Unknown region IDs cannot select an outdoor environment through inherited object keys', () => {
  for (const region of ['sunken-vault', 'unknown', 'constructor', '__proto__', 'toString', '']) assert.equal(outdoorKind(region), undefined);
});
