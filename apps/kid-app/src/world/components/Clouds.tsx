// apps/kid-app/src/world/components/Clouds.tsx
// Puffy low-poly clouds — each is a cluster of overlapping flat-shaded spheres,
// warm-cream and slightly emissive so they read against the gradient sky. They
// sit high and far, drifting VERY slowly across the dome on useFrame. No drei
// <Cloud> / textures — pure primitives, identical on web + expo-gl.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group } from "three";
import { PALETTE, flatStandard } from "../theme";

type V3 = readonly [number, number, number];

// Each puff: local offset + radius. Overlapping spheres make a billow.
type Puff = { pos: V3; r: number; shade: boolean };

type CloudDef = {
  pos: V3; // world anchor, placed high
  scale: number;
  drift: number; // x-units per second; tiny
  span: number; // wrap distance before recycling to the far side
  puffs: Puff[];
};

// A compact billow: a wide base lobe with a couple of stacked caps. The lower
// lobes use the golden underside shade for a touch of depth.
function billow(): Puff[] {
  return [
    { pos: [0, 0, 0], r: 1.0, shade: true },
    { pos: [1.2, -0.05, 0.2], r: 0.8, shade: true },
    { pos: [-1.15, -0.05, -0.1], r: 0.75, shade: true },
    { pos: [0.5, 0.55, 0.1], r: 0.7, shade: false },
    { pos: [-0.45, 0.5, 0.15], r: 0.62, shade: false },
    { pos: [0.05, 0.85, 0], r: 0.5, shade: false },
  ];
}

const CLOUDS: CloudDef[] = [
  { pos: [-20, 12, -28], scale: 2.4, drift: 0.18, span: 60, puffs: billow() },
  { pos: [14, 15, -34], scale: 3.0, drift: 0.12, span: 70, puffs: billow() },
  { pos: [26, 11, -16], scale: 1.9, drift: 0.22, span: 60, puffs: billow() },
  { pos: [-26, 13, -6], scale: 2.6, drift: 0.1, span: 70, puffs: billow() },
];

function Cloud({ def }: { def: CloudDef }) {
  const ref = useRef<Group>(null);
  const top = useMemo(() => flatStandard(PALETTE.cloud, { emissive: PALETTE.cloud, emissiveIntensity: 0.22, roughness: 1 }), []);
  const bottom = useMemo(() => flatStandard(PALETTE.cloudShade, { emissive: PALETTE.cloudShade, emissiveIntensity: 0.14, roughness: 1 }), []);

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    g.position.x += def.drift * delta;
    // wrap from far edge back to the start so the sky never empties
    if (g.position.x > def.pos[0] + def.span / 2) {
      g.position.x = def.pos[0] - def.span / 2;
    }
  });

  return (
    <group ref={ref} position={def.pos as [number, number, number]} scale={def.scale}>
      {def.puffs.map((p, i) => (
        <mesh key={i} position={p.pos as [number, number, number]}>
          {/* low-seg spheres keep the tri budget tiny and the silhouette chunky */}
          <sphereGeometry args={[p.r, 10, 8]} />
          <meshStandardMaterial {...(p.shade ? bottom : top)} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

export function Clouds() {
  return (
    <>
      {CLOUDS.map((c, i) => (
        <Cloud key={i} def={c} />
      ))}
    </>
  );
}

export default Clouds;
