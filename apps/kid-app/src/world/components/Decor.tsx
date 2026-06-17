// apps/kid-app/src/world/components/Decor.tsx
// Pure-code low-poly ground detail: rounded rocks, grass tufts, and little
// flowers. No GLTF / 3rd-party art — everything is Three.js primitives so it
// runs identically on web and expo-gl. Kept tasteful and well within budget.
import { useMemo } from "react";
import { Float, RoundedBox } from "@react-three/drei/native";
import { PALETTE, flatStandard } from "../theme";
import { BlobShadow } from "./BlobShadow";

type V3 = readonly [number, number, number];

// --- Rocks: chunky rounded boxes, slightly squashed and tilted ---
const ROCKS: { pos: V3; scale: number; rotY: number; dark: boolean }[] = [
  { pos: [-4, 0, 9], scale: 1.1, rotY: 0.4, dark: false },
  { pos: [7, 0, 4], scale: 0.7, rotY: 1.5, dark: true },
  { pos: [-9, 0, -4], scale: 0.9, rotY: 2.3, dark: false },
  { pos: [5.5, 0, -9], scale: 0.55, rotY: 3.1, dark: true },
  { pos: [-6.5, 0, 4.5], scale: 0.5, rotY: 0.9, dark: false },
];

function Rock({ pos, scale, rotY, dark }: (typeof ROCKS)[number]) {
  return (
    <group position={pos as [number, number, number]} rotation={[0.12, rotY, 0.08]}>
      <RoundedBox
        args={[1.1 * scale, 0.7 * scale, 0.95 * scale]}
        radius={0.22 * scale}
        smoothness={3}
        position={[0, 0.32 * scale, 0]}
      >
        <meshStandardMaterial {...flatStandard(dark ? PALETTE.rockDark : PALETTE.rock, { roughness: 0.95 })} />
      </RoundedBox>
      <BlobShadow radius={0.8 * scale} opacity={0.28} position={[0, 0.02, 0]} />
    </group>
  );
}

// --- Grass tufts: a few thin cones fanned out from a point ---
const TUFTS: V3[] = [
  [-2.5, 0, 6], [-2.1, 0, 6.3], [3.5, 0, 5.5], [6.5, 0, -2],
  [-7.5, 0, 1], [2, 0, -8.5], [-3.5, 0, -7], [8, 0, 7],
  [-8.5, 0, 6.5], [4.5, 0, 8.5], [-5, 0, -2.5], [1.5, 0, 7.5],
];

function GrassTuft({ pos }: { pos: V3 }) {
  const blades = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2 + Math.random();
        const r = 0.06 + Math.random() * 0.08;
        const h = 0.32 + Math.random() * 0.18;
        return {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          h,
          tilt: (Math.random() - 0.5) * 0.5,
          rot: a,
        };
      }),
    [],
  );
  return (
    <group position={pos as [number, number, number]}>
      {blades.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} rotation={[b.tilt, b.rot, 0]}>
          <coneGeometry args={[0.05, b.h, 4]} />
          <meshStandardMaterial {...flatStandard(PALETTE.grassTuft, { roughness: 0.8 })} />
        </mesh>
      ))}
    </group>
  );
}

// --- Flowers: a tiny stem + a colored disc of petals with a bright core ---
const FLOWERS: { pos: V3; color: string }[] = [
  { pos: [-2.8, 0, 5.5], color: PALETTE.flowerPink },
  { pos: [3.2, 0, 6], color: PALETTE.flowerYellow },
  { pos: [-6.8, 0, 1.6], color: PALETTE.flowerWhite },
  { pos: [6, 0, -1.4], color: PALETTE.flowerPink },
  { pos: [-3, 0, -6.4], color: PALETTE.flowerYellow },
  { pos: [4.8, 0, 7.8], color: PALETTE.flowerWhite },
  { pos: [-8, 0, 6], color: PALETTE.flowerPink },
];

function Flower({ pos, color }: { pos: V3; color: string }) {
  const petals = useMemo(
    () => Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2),
    [],
  );
  return (
    <group position={pos as [number, number, number]}>
      {/* stem */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.02, 0.025, 0.36, 5]} />
        <meshStandardMaterial {...flatStandard(PALETTE.grassTuft, { roughness: 0.8 })} />
      </mesh>
      {/* petals */}
      <group position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {petals.map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0]}>
            <sphereGeometry args={[0.06, 6, 6]} />
            <meshStandardMaterial {...flatStandard(color, { roughness: 0.6 })} />
          </mesh>
        ))}
        {/* bright core */}
        <mesh>
          <sphereGeometry args={[0.07, 6, 6]} />
          <meshStandardMaterial {...flatStandard(PALETTE.flowerCore, { emissive: PALETTE.flowerCore, emissiveIntensity: 0.35 })} />
        </mesh>
      </group>
    </group>
  );
}

export function Decor() {
  return (
    <>
      {ROCKS.map((r, i) => (
        <Rock key={`rock${i}`} {...r} />
      ))}
      {TUFTS.map((p, i) => (
        <GrassTuft key={`tuft${i}`} pos={p} />
      ))}
      {FLOWERS.map((f, i) => (
        // a barely-there sway makes the field feel alive
        <Float key={`flower${i}`} speed={1.2} rotationIntensity={0} floatIntensity={0.15} floatingRange={[0, 0.04]}>
          <Flower pos={f.pos} color={f.color} />
        </Float>
      ))}
    </>
  );
}
