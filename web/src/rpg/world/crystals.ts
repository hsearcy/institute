import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { iceShardGeometry } from './ice';

/**
 * Five closed mineral shells in one draw, +Y up and all bases on the floor.
 * The centered footprint fits a .82m diameter circle; height is 1.1–1.45m.
 * Caller owns the returned geometry. No textures or shared GPU resources.
 */
export function crystalClusterGeometry(seed = 1): THREE.BufferGeometry {
  let state = (Number.isFinite(seed) ? Math.trunc(seed * 7919) : 7919) | 0;
  const random = () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
  const height = 1.1 + random() * .35, rotation = random() * Math.PI * 2;
  const palette = [0x275a63, 0x386c78, 0x447b86, 0x1c3d50, 0x527f86].map(hex => new THREE.Color(hex));
  const shards: THREE.BufferGeometry[] = [];
  for (let shard = 0; shard < 5; shard++) {
    const angle = rotation + shard * 2.4;
    const h = height * (shard === 0 ? 1 : .32 + random() * .39);
    const radius = shard === 0 ? .16 : .085 + random() * .035;
    const geometry = iceShardGeometry(radius, h, random() * 1000);
    const position = geometry.getAttribute('position');
    const offset = shard === 0 ? .015 : .17 + random() * .035;
    const lean = shard === 0 ? .055 : .045 + random() * .065;
    geometry.rotateY(angle);
    for (let i = 0; i < position.count; i++) {
      // Shear preserves grounded bases and attached faces; rotation around X/Z
      // would bury one edge while lifting the other off the floor.
      const distance = offset + lean * position.getY(i) / h;
      position.setX(i, position.getX(i) + Math.sin(angle) * distance);
      position.setZ(i, position.getZ(i) + Math.cos(angle) * distance);
    }
    const colors = geometry.getAttribute('color');
    for (let i = 0; i < colors.count; i += 3) {
      const color = palette[(Math.floor(i / 6) + shard * 2) % palette.length];
      for (let corner = 0; corner < 3; corner++) colors.setXYZ(i + corner, color.r, color.g, color.b);
    }
    shards.push(geometry);
  }
  const geometry = mergeGeometries(shards, false)!;
  shards.forEach(shard => shard.dispose());
  geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, 0, -center.z);
  const position = geometry.getAttribute('position');
  let extent = 0;
  for (let i = 0; i < position.count; i++) extent = Math.max(extent, Math.hypot(position.getX(i), position.getZ(i)));
  geometry.scale(.41 / extent, 1, .41 / extent);
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal'), uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = Math.abs(normal.getX(i)), y = Math.abs(normal.getY(i)), z = Math.abs(normal.getZ(i));
    uv[i * 2] = x > y && x > z ? position.getZ(i) : position.getX(i);
    uv[i * 2 + 1] = y > x && y > z ? position.getZ(i) : position.getY(i);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** New caller-owned material; region tints can multiply color and set emissive. */
export function crystalClusterMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true,
    roughness: .48, metalness: .13, emissive: 0x143b45, emissiveIntensity: .075,
    flatShading: true });
}
