import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Open effect ribbons, not solid volumes. Caller owns the merged geometry. */
function ribbon(points: THREE.Vector3[], width: number, seed: number, upright = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points), positions: number[] = [], uv: number[] = [], phases: number[] = [], indices: number[] = [];
  const segments = 28;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, point = curve.getPoint(t), tangent = curve.getTangent(t);
    const across = upright ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
    const taper = .12 + Math.pow(Math.sin(t * Math.PI), .7) * (.83 + Math.sin(t * 15 + seed) * .12);
    for (const side of [-1, 1]) {
      const p = point.clone().addScaledVector(across, side * width * taper);
      positions.push(p.x, p.y, p.z); uv.push(t, (side + 1) / 2); phases.push(seed);
    }
    if (i < segments) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function join(parts: THREE.BufferGeometry[], shaderDisplacement: number): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts, false)!; parts.forEach(part => part.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  // GPU-only vertical flutter must not leave the CPU frustum-culling bounds.
  geometry.boundingBox!.min.y -= shaderDisplacement;
  geometry.boundingBox!.max.y += shaderDisplacement;
  geometry.boundingSphere!.radius += shaderDisplacement;
  return geometry;
}

/** Bent shoulder and separated trailing feathers, local origin at the rider. */
export function phoenixWingGeometry(side: number): THREE.BufferGeometry {
  const p = (x: number, y: number, z: number) => new THREE.Vector3(x * side, y, z);
  const shoulder = new THREE.CatmullRomCurve3([p(.14, 1.35, -.05), p(1.1, 2.03, -.8), p(2.35, 2.18, -.46), p(3.55, 1.42, .55)]);
  const parts = [ribbon(shoulder.getPoints(8), .16, 1 + side)];
  for (let feather = 0; feather < 10; feather++) {
    const u = .12 + feather * .077, base = shoulder.getPoint(u), span = .8 + feather * .085;
    parts.push(ribbon([base,
      base.clone().add(p(.23, .1 + Math.sin(feather) * .08, .25)),
      base.clone().add(p(.5 + feather * .018, -.13, span * .65)),
      base.clone().add(p(.65 + feather * .026, -.48 - u * .28, span))], .12 + Math.sin(u * Math.PI) * .045, feather * 1.73 + side));
  }
  return join(parts, .055);
}

/** Slender forward neck and three curved tail streamers leave the rider visible. */
export function phoenixTailGeometry(): THREE.BufferGeometry {
  const parts = [ribbon([new THREE.Vector3(0, 1.3, .25), new THREE.Vector3(.04, 1.6, -.5), new THREE.Vector3(0, 1.9, -1.25), new THREE.Vector3(.03, 1.7, -1.6)], .17, 3, true)];
  for (let i = -1; i <= 1; i++) parts.push(ribbon([
    new THREE.Vector3(i * .12, 1.3, .15), new THREE.Vector3(i * .24, 1.18, 1.05),
    new THREE.Vector3(i * .5 + .12, .94, 2.1), new THREE.Vector3(i * .74, 1.04, 3.15 - Math.abs(i) * .35)], .15 - Math.abs(i) * .02, i * 2.7 + 8));
  // The same tail geometry also carries the smoke shader's larger flutter.
  return join(parts, .09);
}

/** Disconnected arcs at uneven heights: no closed rings or conical silhouette. */
export function stormFilamentsGeometry(radius: number, height: number, horizontal: boolean, seed: number, clouds = true): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let band = 0; band < 8; band++) {
    const phase = seed + band * 2.399, start = phase * 1.3;
    const sweep = .65 + (.5 + Math.sin(phase * 3.1) * .5) * 1.25;
    const level = .09 + band * .105;
    const width = clouds ? (horizontal ? .32 : .48) + (band % 3) * .12 : .028 + band % 3 * .008;
    const points = Array.from({ length: 12 }, (_, i) => {
      const t = i / 11, angle = start + sweep * t;
      const r = radius * (.28 + level * .62 + Math.sin(angle * 2.7 + phase) * .07);
      return new THREE.Vector3(Math.sin(angle) * r + Math.sin(level * 5 + seed) * radius * .10,
        height * (horizontal ? .14 + level * .29 : level) + Math.sin(angle * 2 + phase) * height * .05 + t * height * .06,
        Math.cos(angle) * r);
    });
    parts.push(ribbon(points, width, phase, true));
  }
  return join(parts, .09);
}
