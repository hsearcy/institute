// apps/kid-app/src/world/components/Hills.tsx
// Soft rolling low-poly hill mounds in the far ring, beyond the play area and
// the cliff ring (ground radius 16, cliff ring ~16.2). They give the world
// depth and a gentle horizon silhouette, and sit far enough out that the scene
// fog (16→44) softens them so they blend into the atmosphere.
// Pure primitives + flat shading: faceted spheres squashed into mounds.
import { useMemo } from "react";
import { PALETTE, flatStandard } from "../theme";

type V3 = readonly [number, number, number];

// Each hill: angle around the ring, distance out, footprint radius, height, tint.
type HillDef = { a: number; dist: number; r: number; h: number; deep: boolean };

const HILLS: HillDef[] = [
  { a: 0.3, dist: 22, r: 7.5, h: 0.42, deep: false },
  { a: 1.1, dist: 25, r: 6.0, h: 0.5, deep: true },
  { a: 2.0, dist: 21, r: 8.5, h: 0.38, deep: false },
  { a: 2.9, dist: 24, r: 6.5, h: 0.46, deep: true },
  { a: 3.7, dist: 23, r: 9.0, h: 0.4, deep: false },
  { a: 4.5, dist: 26, r: 6.2, h: 0.52, deep: true },
  { a: 5.3, dist: 22, r: 7.8, h: 0.44, deep: false },
];

function Hill({ a, dist, r, h, deep }: HillDef) {
  const pos = useMemo<V3>(
    () => [Math.cos(a) * dist, -r * 0.45, Math.sin(a) * dist],
    [a, dist, r],
  );
  // Squash a low-detail icosphere into a wide mound. Sitting partly below the
  // ground plane keeps the base hidden behind the cliff ring.
  return (
    <mesh position={pos as [number, number, number]} scale={[r, r * h, r]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial {...flatStandard(deep ? PALETTE.hillDeep : PALETTE.hill, { roughness: 0.95 })} />
    </mesh>
  );
}

export function Hills() {
  return (
    <>
      {HILLS.map((h, i) => (
        <Hill key={i} {...h} />
      ))}
    </>
  );
}
