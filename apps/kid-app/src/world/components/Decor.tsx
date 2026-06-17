// apps/kid-app/src/world/components/Decor.tsx
// Pure-code low-poly ground detail for a lush storybook field: stylized trees,
// clustered bushes (some with berries), cute mushrooms (red and a glowing
// variant), small glowing crystal clusters, tall grass clumps and flowers.
// Everything is Three.js primitives + flat shading so it runs identically on
// web and expo-gl. Each ground-sitting object is grounded with a BlobShadow.
// Positions are deterministic; the play area (radius ~5 around origin) is left
// clear and detail lives in the mid/outer ring.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber/native";
import { Float, RoundedBox } from "@react-three/drei/native";
import type { Group } from "three";
import { PALETTE, flatStandard, glowStandard } from "../theme";
import { BlobShadow } from "./BlobShadow";

type V3 = readonly [number, number, number];

// =====================================================================
// Trees: tapered trunk + 1-3 chunky faceted foliage clusters, gentle sway.
// =====================================================================
type TreeDef = { pos: V3; scale: number; rotY: number; variant: 0 | 1 | 2 };

const TREES: TreeDef[] = [
  { pos: [-9.5, 0, 7.5], scale: 1.25, rotY: 0.4, variant: 0 },
  { pos: [10, 0, 5.5], scale: 1.05, rotY: 1.9, variant: 1 },
  { pos: [-11, 0, -3], scale: 1.4, rotY: 2.7, variant: 2 },
  { pos: [8.5, 0, -8], scale: 0.95, rotY: 0.9, variant: 1 },
  { pos: [-6.5, 0, -10], scale: 1.1, rotY: 3.4, variant: 0 },
  { pos: [2, 0, 11.5], scale: 1.2, rotY: 1.3, variant: 2 },
];

// foliage cluster layout per variant: [offsetX, offsetY, offsetZ, radius, leaf]
const TREE_FOLIAGE: Record<number, { o: V3; r: number; color: string }[]> = {
  // single round canopy
  0: [{ o: [0, 1.55, 0], r: 0.95, color: PALETTE.leafMid }],
  // tall conical pine-ish stack
  1: [
    { o: [0, 1.35, 0], r: 0.8, color: PALETTE.leafDeep },
    { o: [0, 1.95, 0], r: 0.6, color: PALETTE.leafMid },
    { o: [0, 2.4, 0], r: 0.42, color: PALETTE.leafLight },
  ],
  // bushy three-blob crown
  2: [
    { o: [-0.4, 1.5, 0.1], r: 0.7, color: PALETTE.leafMid },
    { o: [0.45, 1.7, -0.15], r: 0.62, color: PALETTE.leafLight },
    { o: [0.05, 2.05, 0.25], r: 0.55, color: PALETTE.leafLime },
  ],
};

function Tree({ pos, scale, rotY, variant }: TreeDef) {
  const swayRef = useRef<Group>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  useFrame(({ clock }) => {
    if (swayRef.current) {
      swayRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.8 + phase) * 0.025;
    }
  });

  const clusters = TREE_FOLIAGE[variant]!;

  return (
    <group position={pos as [number, number, number]} rotation={[0, rotY, 0]} scale={scale}>
      <BlobShadow radius={0.95} opacity={0.3} position={[0, 0.02, 0]} />
      {/* sway pivots at the base so the crown leans, not the roots */}
      <group ref={swayRef}>
        {/* tapered trunk */}
        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.16, 0.28, 1.4, 6]} />
          <meshStandardMaterial {...flatStandard(PALETTE.trunk, { roughness: 0.95 })} />
        </mesh>
        {clusters.map((c, i) => (
          <mesh key={i} position={c.o as [number, number, number]}>
            <icosahedronGeometry args={[c.r, 0]} />
            <meshStandardMaterial {...flatStandard(c.color, { roughness: 0.85 })} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// =====================================================================
// Bushes: rounded clustered spheres, some sprinkled with tiny berries.
// =====================================================================
type BushDef = { pos: V3; scale: number; berries: boolean; color: string };

const BUSHES: BushDef[] = [
  { pos: [-7.5, 0, 9.5], scale: 1, berries: true, color: PALETTE.leafMid },
  { pos: [11.5, 0, -1], scale: 0.85, berries: false, color: PALETTE.leafDeep },
  { pos: [-12, 0, 2], scale: 1.1, berries: true, color: PALETTE.leafMid },
  { pos: [6.5, 0, 10], scale: 0.8, berries: false, color: PALETTE.leafLight },
  { pos: [-3.5, 0, -11], scale: 0.9, berries: true, color: PALETTE.leafMid },
  { pos: [9.5, 0, 8.5], scale: 0.95, berries: false, color: PALETTE.leafDeep },
];

// 4 offset lobes forming a rounded shrub, plus deterministic berry spots
const BUSH_LOBES: { o: V3; r: number }[] = [
  { o: [0, 0.32, 0], r: 0.46 },
  { o: [-0.34, 0.26, 0.1], r: 0.34 },
  { o: [0.32, 0.3, -0.08], r: 0.36 },
  { o: [0.05, 0.4, 0.28], r: 0.3 },
];
const BERRY_SPOTS: V3[] = [
  [-0.18, 0.5, 0.28], [0.28, 0.46, 0.1], [0.05, 0.62, -0.1],
  [-0.34, 0.4, -0.05], [0.36, 0.56, -0.22],
];

function Bush({ pos, scale, berries, color }: BushDef) {
  return (
    <group position={pos as [number, number, number]} scale={scale}>
      <BlobShadow radius={0.6} opacity={0.28} position={[0, 0.02, 0]} />
      {BUSH_LOBES.map((l, i) => (
        <mesh key={i} position={l.o as [number, number, number]}>
          <icosahedronGeometry args={[l.r, 0]} />
          <meshStandardMaterial {...flatStandard(color, { roughness: 0.85 })} />
        </mesh>
      ))}
      {berries &&
        BERRY_SPOTS.map((b, i) => (
          <mesh key={`b${i}`} position={b as [number, number, number]}>
            <sphereGeometry args={[0.06, 6, 6]} />
            <meshStandardMaterial {...flatStandard(PALETTE.berry, { roughness: 0.5 })} />
          </mesh>
        ))}
    </group>
  );
}

// =====================================================================
// Mushrooms: stem + rounded cap. Red-with-spots and a glowing emissive kind.
// =====================================================================
type MushDef = { pos: V3; scale: number; glow: boolean };

const MUSHROOMS: MushDef[] = [
  { pos: [-5.5, 0, 8], scale: 1, glow: false },
  { pos: [-6.2, 0, 8.4], scale: 0.7, glow: false },
  { pos: [7.5, 0, 2.5], scale: 0.85, glow: false },
  { pos: [-10, 0, 4.5], scale: 1.1, glow: true },
  { pos: [5, 0, -10], scale: 0.9, glow: true },
  { pos: [-2.5, 0, 10], scale: 0.8, glow: false },
];

// deterministic spots on the red caps
const CAP_SPOTS: V3[] = [
  [0.14, 0.04, 0], [-0.1, 0.06, 0.12], [0.02, 0.1, -0.14], [-0.16, 0.02, -0.06],
];

function Mushroom({ pos, scale, glow }: MushDef) {
  const capColor = glow ? PALETTE.mushGlowCap : PALETTE.mushCap;
  const capMat = glow
    ? glowStandard(PALETTE.mushGlowCap, PALETTE.mushGlowEmissive, 0.8)
    : flatStandard(capColor, { roughness: 0.7 });
  return (
    <group position={pos as [number, number, number]} scale={scale}>
      <BlobShadow radius={0.34} opacity={0.24} position={[0, 0.02, 0]} />
      {/* stem */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.08, 0.11, 0.36, 7]} />
        <meshStandardMaterial {...flatStandard(PALETTE.mushStem, { roughness: 0.8 })} />
      </mesh>
      {/* rounded cap (top half of a sphere) */}
      <mesh position={[0, 0.36, 0]}>
        <sphereGeometry args={[0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial {...capMat} />
      </mesh>
      {/* spots — white on red caps, soft glow dots on the glowing kind */}
      {CAP_SPOTS.map((s, i) => (
        <mesh key={i} position={[s[0], 0.36 + s[1], s[2]]}>
          <sphereGeometry args={[0.045, 6, 6]} />
          <meshStandardMaterial
            {...(glow
              ? glowStandard(PALETTE.mushSpot, PALETTE.mushGlowEmissive, 1.1)
              : flatStandard(PALETTE.mushSpot, { roughness: 0.6 }))}
          />
        </mesh>
      ))}
    </group>
  );
}

// =====================================================================
// Crystals: small clusters of glowing faceted octahedrons, gently bobbing.
// =====================================================================
type CrystalDef = { pos: V3; color: string; emissive: string };

const CRYSTALS: CrystalDef[] = [
  { pos: [-8.5, 0, -7], color: PALETTE.crystalCyan, emissive: PALETTE.crystalCyanEmissive },
  { pos: [9, 0, -4.5], color: PALETTE.crystalViolet, emissive: PALETTE.crystalVioletEmissive },
  { pos: [3.5, 0, -11], color: PALETTE.crystalGold, emissive: PALETTE.crystalGoldEmissive },
  { pos: [-11.5, 0, -1], color: PALETTE.crystalViolet, emissive: PALETTE.crystalVioletEmissive },
];

// a cluster of a few gems of varied size around a point
const CRYSTAL_SHARDS: { o: V3; r: number; tilt: V3 }[] = [
  { o: [0, 0.34, 0], r: 0.34, tilt: [0.1, 0, 0.05] },
  { o: [-0.26, 0.22, 0.08], r: 0.22, tilt: [0.0, 0.6, -0.18] },
  { o: [0.24, 0.26, -0.06], r: 0.26, tilt: [-0.12, -0.4, 0.14] },
  { o: [0.05, 0.16, 0.26], r: 0.16, tilt: [0.18, 0.2, 0.1] },
];

function CrystalCluster({ pos, color, emissive }: CrystalDef) {
  const groupRef = useRef<Group>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  useFrame(({ clock }) => {
    if (groupRef.current) {
      const t = clock.elapsedTime + phase;
      groupRef.current.position.y = Math.sin(t * 1.4) * 0.05;
      groupRef.current.rotation.y = t * 0.25;
    }
  });
  return (
    <group position={pos as [number, number, number]}>
      <BlobShadow radius={0.4} opacity={0.22} color={emissive} position={[0, 0.02, 0]} />
      <group ref={groupRef}>
        {CRYSTAL_SHARDS.map((s, i) => (
          <mesh key={i} position={s.o as [number, number, number]} rotation={s.tilt as [number, number, number]}>
            <octahedronGeometry args={[s.r, 0]} />
            <meshStandardMaterial {...glowStandard(color, emissive, 0.95)} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// =====================================================================
// Tall grass clumps: thin cones fanned out from a point (taller than tufts).
// =====================================================================
const GRASS_CLUMPS: V3[] = [
  [-4, 0, 9.5], [4.5, 0, 9], [-9, 0, 5.5], [8.5, 0, 3.5],
  [-7, 0, -8.5], [6, 0, -7], [-2, 0, -10.5], [10.5, 0, 1.5],
  [-11, 0, 6], [3, 0, -9.5], [-5.5, 0, 6.5], [7.5, 0, -3.5],
  [-3, 0, 8.5], [9.5, 0, 7],
];

function GrassClump({ pos }: { pos: V3 }) {
  const blades = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2 + i * 0.7;
        const r = 0.07 + (i % 3) * 0.05;
        const h = 0.45 + (i % 4) * 0.12;
        return {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          h,
          tilt: ((i % 2 === 0 ? 1 : -1) * 0.35),
          rot: a,
        };
      }),
    [],
  );
  return (
    <group position={pos as [number, number, number]}>
      {blades.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} rotation={[b.tilt, b.rot, 0]}>
          <coneGeometry args={[0.045, b.h, 4]} />
          <meshStandardMaterial {...flatStandard(PALETTE.grassTuft, { roughness: 0.8 })} />
        </mesh>
      ))}
    </group>
  );
}

// =====================================================================
// Flowers: tiny stem + colored petal disc with a bright core. (More + varied.)
// =====================================================================
const FLOWERS: { pos: V3; color: string }[] = [
  { pos: [-4.5, 0, 8.6], color: PALETTE.flowerPink },
  { pos: [4.2, 0, 8.4], color: PALETTE.flowerYellow },
  { pos: [-8.2, 0, 6.2], color: PALETTE.flowerWhite },
  { pos: [7.8, 0, 4.2], color: PALETTE.flowerPink },
  { pos: [-6.5, 0, -7.8], color: PALETTE.flowerYellow },
  { pos: [5.5, 0, -6.2], color: PALETTE.flowerWhite },
  { pos: [-2.2, 0, -9.8], color: PALETTE.flowerPink },
  { pos: [9.8, 0, 2.2], color: PALETTE.flowerYellow },
  { pos: [-10.2, 0, 5.4], color: PALETTE.flowerWhite },
  { pos: [3.6, 0, -8.8], color: PALETTE.flowerPink },
  { pos: [-5.2, 0, 6.0], color: PALETTE.flowerYellow },
  { pos: [6.8, 0, 9.2], color: PALETTE.flowerWhite },
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
          <meshStandardMaterial
            {...flatStandard(PALETTE.flowerCore, { emissive: PALETTE.flowerCore, emissiveIntensity: 0.35 })}
          />
        </mesh>
      </group>
    </group>
  );
}

export function Decor() {
  return (
    <>
      {TREES.map((t, i) => (
        <Tree key={`tree${i}`} {...t} />
      ))}
      {BUSHES.map((b, i) => (
        <Bush key={`bush${i}`} {...b} />
      ))}
      {MUSHROOMS.map((m, i) => (
        <Mushroom key={`mush${i}`} {...m} />
      ))}
      {CRYSTALS.map((c, i) => (
        <CrystalCluster key={`crystal${i}`} {...c} />
      ))}
      {GRASS_CLUMPS.map((p, i) => (
        <GrassClump key={`grass${i}`} pos={p} />
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
