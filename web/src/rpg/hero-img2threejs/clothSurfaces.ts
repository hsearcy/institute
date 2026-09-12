import * as THREE from 'three';

// World-reference parameters transcribed from hero-sculpt-spec.json / heroSurface.
// Additional inferred control values and topology decisions are recorded in
// docs/hero-img2threejs/cloth-surface-decisions.json. No runtime material is created.
const HOOD = {
  opening: [[0, 2.2, 0.08], [0.105, 2.14, 0.14], [0.157, 1.91, 0.125], [0.095, 1.82, 0.08]],
  depth: 0.3, thickness: 0.009,
} as const;
const CAPE = {
  topY: 1.82, bottomY: 0.33, topWidth: 0.54, bottomWidth: 1.02,
  sweepX: -0.38, sweepZ: -0.33, foldAmplitude: 0.055, foldCount: 5, thickness: 0.008,
} as const;
const COWL = { foldCount: 3, diagonalDrop: 0.1 } as const;
const TABARD = {
  topY: 1.22, bottomY: 0.68, topWidth: 0.24, bottomWidth: 0.2,
  z: 0.19, foldAmplitude: 0.023,
} as const;
const TAU = Math.PI * 2;
type SurfacePoint = (u: number, v: number) => THREE.Vector3;

/** Add a true inner surface and connect every boundary; no double-sided cards. */
function thicken(geometry: THREE.BufferGeometry, thickness: number, id: string, sheetAxis?: THREE.Vector3): THREE.BufferGeometry {
  geometry.computeVertexNormals();
  const p = geometry.getAttribute('position');
  const n = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const source = geometry.getIndex()!;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const direction of [1, -1]) {
    for (let i = 0; i < p.count; i++) {
      const offset = thickness * direction * 0.5;
      // Graph-like sheets extrude along their graph axis, keeping acute hem
      // corners and fold troughs from crossing under a normal-offset miter.
      positions.push(p.getX(i) + (sheetAxis?.x ?? n.getX(i)) * offset,
        p.getY(i) + (sheetAxis?.y ?? n.getY(i)) * offset,
        p.getZ(i) + (sheetAxis?.z ?? n.getZ(i)) * offset);
      uvs.push(uv.getX(i), uv.getY(i));
    }
  }
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (let i = 0; i < source.count; i += 3) {
    const a = source.getX(i), b = source.getX(i + 1), c = source.getX(i + 2);
    indices.push(a, b, c, c + p.count, b + p.count, a + p.count);
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      const key = `${Math.min(start, end)}:${Math.max(start, end)}`;
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a: start, b: end, count: 1 });
    }
  }
  for (const { a, b, count } of edges.values()) {
    if (count === 1) indices.push(b, a, a + p.count, b, a + p.count, b + p.count);
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  result.setIndex(indices);
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  result.name = `hero-cloth-${id}`;
  result.userData = { referenceCoordinates: true, componentId: id, thickness, thicknessAxis: sheetAxis?.toArray() ?? 'normal', stage: 'blockout', continuousShell: true };
  geometry.dispose();
  return result;
}

/** Indexed rectangular/annular surface; wrapped U shares the actual seam vertices. */
function surfaceGrid(columns: number, rows: number, point: SurfacePoint, wrapU = false): THREE.BufferGeometry {
  const width = wrapU ? columns : columns + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column < width; column++) {
      const u = column / columns, v = row / rows;
      positions.push(...point(u, v).toArray());
      uvs.push(u, 1 - v);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * width + column;
      const b = row * width + (column + 1) % width;
      const c = a + width, d = b + width;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function hood(): THREE.BufferGeometry {
  const opening = HOOD.opening.map(p => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3([
    ...opening, new THREE.Vector3(0, 1.80, 0.07),
    ...opening.slice(1).reverse().map(p => new THREE.Vector3(-p.x, p.y, p.z)),
  ], true, 'centripetal');
  const columns = 80, rings = 26;
  // Front opening is never capped. The rear closes with one fan, avoiding a
  // coincident ring of pole vertices and preserving a single connected shell.
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row < rings; row++) {
    const v = row / rings;
    const radial = Math.cos(v * Math.PI / 2) + 0.15 * Math.sin(v * Math.PI);
    for (let column = 0; column < columns; column++) {
      const u = column / columns;
      const rim = curve.getPoint(u);
      const sideFold = 0.008 * Math.sin(u * TAU * 3 + v * 2) * Math.sin(v * Math.PI) * Math.abs(rim.x / 0.16);
      positions.push(
        rim.x * radial,
        2.005 + (rim.y - 2.005) * radial - 0.018 * v,
        THREE.MathUtils.lerp(rim.z, HOOD.opening[0][2] - HOOD.depth, v)
          - 0.043 * Math.sin(v * Math.PI) + sideFold,
      );
      uvs.push(u, 1 - v);
    }
  }
  for (let row = 0; row < rings - 1; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * columns + column, b = row * columns + (column + 1) % columns;
      indices.push(a, b, a + columns, b, b + columns, a + columns);
    }
  }
  const pole = positions.length / 3;
  positions.push(0, 2.005 - 0.018, HOOD.opening[0][2] - HOOD.depth);
  uvs.push(0.5, 0);
  for (let column = 0; column < columns; column++) {
    indices.push((rings - 1) * columns + column, (rings - 1) * columns + (column + 1) % columns, pole);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return thicken(geometry, HOOD.thickness, 'hood');
}

function cowl(): THREE.BufferGeometry {
  const geometry = surfaceGrid(64, 32, (u, v) => {
    const angle = u * TAU;
    const front = Math.max(0, Math.cos(angle));
    const fold = Math.sin(v * Math.PI * 2 * COWL.foldCount + 0.65 * Math.sin(angle))
      * Math.sin(v * Math.PI) * 0.004;
    // Monotonic elliptical radii: the former oscillating radial coordinates
    // doubled back at troughs and intersected the adjacent fold's volume.
    const radiusX = THREE.MathUtils.lerp(0.083, 0.29, v);
    const radiusZ = THREE.MathUtils.lerp(0.079, 0.17, v);
    return new THREE.Vector3(
      Math.sin(angle) * radiusX,
      THREE.MathUtils.lerp(1.876, 1.78, v) - COWL.diagonalDrop * front * v
        + 0.025 * Math.sin(angle) * v + fold,
      0.025 + Math.cos(angle) * radiusZ,
    );
  }, true);
  return thicken(geometry, 0.009, 'cowl', new THREE.Vector3(0, -1, 0));
}

function hemHeight(u: number): number {
  // Unequal broad angular hems and two V notches: cut from one connected panel.
  const points = [[0, 0.12], [0.14, 0.015], [0.30, 0.065], [0.34, 0.10], [0.39, 0.035],
    [0.59, 0], [0.69, 0.075], [0.73, 0.10], [0.79, 0.04], [1, 0.10]];
  for (let i = 1; i < points.length; i++) {
    if (u <= points[i][0]) {
      const [a, yA] = points[i - 1], [b, yB] = points[i];
      return THREE.MathUtils.lerp(yA, yB, (u - a) / (b - a));
    }
  }
  return 0.10;
}

function cape(): THREE.BufferGeometry {
  const geometry = surfaceGrid(64, 36, (u, v) => {
    const across = u * 2 - 1;
    const width = THREE.MathUtils.lerp(CAPE.topWidth, CAPE.bottomWidth, Math.pow(v, 0.78));
    const fold = Math.sin((u * CAPE.foldCount + 0.25 * v + 0.09 * Math.sin(v * Math.PI)) * TAU)
      * CAPE.foldAmplitude * (0.28 + 0.72 * v);
    // Source tip (45,627) projects near world (-1.13,.82). Distribute the
    // silhouette lift across the panel rather than pulling its last rows back
    // into their neighbors. Gentle V notches preserve an embedded XY graph.
    const wind = Math.pow(Math.max(0, 1 - u / 0.63), 1.15);
    return new THREE.Vector3(
      across * width / 2 + CAPE.sweepX * Math.pow(v, 1.15) - 0.24 * wind * Math.pow(v, 1.15),
      THREE.MathUtils.lerp(CAPE.topY, CAPE.bottomY, v) + hemHeight(u) * v
        + 0.37 * wind * Math.pow(v, 1.35),
      -0.16 + CAPE.sweepZ * Math.pow(v, 0.9) - 0.07 * Math.sin(v * Math.PI)
        + 0.085 * across * across * (1 - 0.3 * v) + fold,
    );
  });
  return thicken(geometry, CAPE.thickness, 'cape', new THREE.Vector3(0, 0, -1));
}

function tabard(): THREE.BufferGeometry {
  const geometry = surfaceGrid(24, 28, (u, v) => {
    const across = u * 2 - 1;
    const width = THREE.MathUtils.lerp(TABARD.topWidth, TABARD.bottomWidth, v);
    return new THREE.Vector3(
      across * width / 2,
      THREE.MathUtils.lerp(TABARD.topY, TABARD.bottomY + Math.abs(across) * 0.135, v),
      TABARD.z + TABARD.foldAmplitude * Math.cos(across * Math.PI * 1.5) * (0.3 + 0.7 * v)
        + 0.015 * Math.sin(v * Math.PI),
    );
  });
  return thicken(geometry, 0.007, 'tabard');
}

/** +Z faces the viewer; +Y is up. Caller converts into the component's local frame. */
export function createClothSurface(id: string): THREE.BufferGeometry | null {
  switch (id) {
    case 'hood': return hood();
    case 'cowl': return cowl();
    case 'cape': return cape();
    case 'tabard': return tabard();
    default: return null;
  }
}
