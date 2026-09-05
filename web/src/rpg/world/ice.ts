import * as THREE from 'three';

/** A closed, uneven mineral shard, authored along +Y with its base at zero. */
export function iceShardGeometry(radius: number, height: number, seed: number): THREE.BufferGeometry {
  const random = (n: number) => { const x = Math.sin(seed * 17.31 + n * 79.13) * 43758.5453; return x - Math.floor(x); };
  const sides = 5, vertices: THREE.Vector3[] = [];
  for (let ring = 0; ring < 3; ring++) {
    const y = [0, .22, .74][ring], width = [.58, 1, .49][ring];
    for (let side = 0; side < sides; side++) {
      const a = side / sides * Math.PI * 2 + .13;
      const r = radius * width * (.78 + random(side + ring * 9) * .35);
      vertices.push(new THREE.Vector3(Math.sin(a) * r + radius * y * .26,
        height * (y + (ring ? (random(side + 45) - .5) * .12 : 0)), Math.cos(a) * r));
    }
  }
  vertices.push(new THREE.Vector3(radius * .52, height, radius * -.18));
  const positions: number[] = [], colors: number[] = [];
  const face = (a: number, b: number, c: number, tint: THREE.Color) => {
    for (const index of [a, b, c]) { const p = vertices[index]; positions.push(p.x, p.y, p.z); colors.push(tint.r, tint.g, tint.b); }
  };
  const palette = [0x326f8e, 0x538fa8, 0x82bfd0, 0xb0d9df, 0x477e9a].map(c => new THREE.Color(c));
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides, tint = palette[(side + Math.floor(random(81) * 5)) % 5];
    for (let ring = 0; ring < 2; ring++) {
      const a = ring * sides + side, b = ring * sides + next;
      face(a, b, b + sides, tint); face(a, b + sides, a + sides, tint);
    }
    face(10 + side, 10 + next, 15, tint);
  }
  for (let side = 1; side < sides - 1; side++) face(0, side + 1, side, palette[0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export function iceShardMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff,
    emissive: 0x163b51, emissiveIntensity: .12, roughness: .25, metalness: .06,
    transparent: true, opacity: .94, flatShading: true });
}
