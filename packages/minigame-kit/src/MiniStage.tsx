// A cohesive ground-level stage for minigames: gradient sky, warm lighting
// rig (no realtime shadows — within the Fire-tablet budget), a fog-faded
// grassy field, and tasteful low-poly scatter (rocks / grass / flowers) ringed
// around the play area. Wrap a game's 3D content in <MiniStage> and it instantly
// matches the hub. All primitives + GLSL only → native-safe (web + expo-gl).
import { useEffect, useMemo, type ReactNode } from "react";
import { BufferAttribute, CircleGeometry, Color, PerspectiveCamera } from "three";
import { Environment, Float, Lightformer, RoundedBox } from "@react-three/drei/native";
import { useThree } from "@react-three/fiber/native";
import { PALETTE, flatStandard } from "./theme.ts";
import { BlobShadow } from "./BlobShadow.tsx";
import { SkyDome } from "./SkyDome.tsx";

// Minigame Scenes mount in the host Canvas WITHOUT the hub's SceneController, so
// the camera defaults to an eye-level [0,0,5] — objects float against the sky and
// the ground is edge-on. Frame a proper elevated 3/4 stage view here so every game
// looks composed. Restores prior camera state on unmount (back to the hub).
function StageCamera() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const prev = { pos: camera.position.clone(), fov: (camera as PerspectiveCamera).fov };
    camera.position.set(0, 6, 11.5);
    camera.lookAt(0, 2.2, 0);
    if ((camera as PerspectiveCamera).isPerspectiveCamera) {
      (camera as PerspectiveCamera).fov = 46;
      camera.updateProjectionMatrix();
    }
    return () => {
      camera.position.copy(prev.pos);
      if ((camera as PerspectiveCamera).isPerspectiveCamera) {
        (camera as PerspectiveCamera).fov = prev.fov;
        camera.updateProjectionMatrix();
      }
    };
  }, [camera, size.width, size.height]);
  return null;
}

const GROUND_RADIUS = 34;

function useGroundGeometry() {
  return useMemo(() => {
    const geo = new CircleGeometry(GROUND_RADIUS, 64);
    geo.rotateX(-Math.PI / 2);
    const center = new Color(PALETTE.grassCenter);
    const edge = new Color(PALETTE.grassEdge);
    const pos = geo.attributes.position!;
    const colors = new Float32Array(pos.count * 3);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.min(1, Math.sqrt(x * x + z * z) / GROUND_RADIUS);
      c.copy(center).lerp(edge, r * r);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new BufferAttribute(colors, 3));
    return geo;
  }, []);
}

type V3 = readonly [number, number, number];

// Scatter placed in an annulus around the play area (kept clear of the centre
// where gameplay happens). Deterministic so the field looks intentional.
const ROCKS: { pos: V3; scale: number; rotY: number; dark: boolean }[] = [
  { pos: [-9, 0, 2], scale: 1.2, rotY: 0.4, dark: false },
  { pos: [11, 0, -1], scale: 0.8, rotY: 1.5, dark: true },
  { pos: [-7, 0, -8], scale: 0.95, rotY: 2.3, dark: false },
  { pos: [8, 0, 6], scale: 0.6, rotY: 3.1, dark: true },
  { pos: [-12, 0, 7], scale: 0.7, rotY: 0.9, dark: false },
  { pos: [13, 0, 8], scale: 1.0, rotY: 2.0, dark: true },
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
      <BlobShadow radius={0.85 * scale} opacity={0.26} position={[0, 0.02, 0]} />
    </group>
  );
}

const TUFTS: V3[] = [
  [-6, 0, 5], [-5.4, 0, 5.4], [7, 0, 4], [9, 0, -5], [-10, 0, -3],
  [5, 0, -9], [-4, 0, -10], [12, 0, 3], [-13, 0, 2], [6.5, 0, 9], [-8, 0, 9],
];

function GrassTuft({ pos, seed }: { pos: V3; seed: number }) {
  const blades = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2 + seed;
        const r = 0.06 + ((seed * (i + 1)) % 1) * 0.08;
        const h = 0.34 + ((seed * 7 + i) % 1) * 0.2;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, h, tilt: (((seed + i) % 1) - 0.5) * 0.5, rot: a };
      }),
    [seed],
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

const FLOWERS: { pos: V3; color: string }[] = [
  { pos: [-5.5, 0, 6], color: PALETTE.flowerPink },
  { pos: [6.5, 0, 5], color: PALETTE.flowerYellow },
  { pos: [-9, 0, 0.5], color: PALETTE.flowerWhite },
  { pos: [9, 0, -2], color: PALETTE.flowerPink },
  { pos: [-5, 0, -8], color: PALETTE.flowerYellow },
  { pos: [7, 0, 8], color: PALETTE.flowerWhite },
  { pos: [-11, 0, 6], color: PALETTE.flowerPink },
];

function Flower({ pos, color }: { pos: V3; color: string }) {
  const petals = useMemo(() => Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2), []);
  return (
    <group position={pos as [number, number, number]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.02, 0.025, 0.36, 5]} />
        <meshStandardMaterial {...flatStandard(PALETTE.grassTuft, { roughness: 0.8 })} />
      </mesh>
      <group position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {petals.map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0]}>
            <sphereGeometry args={[0.06, 6, 6]} />
            <meshStandardMaterial {...flatStandard(color, { roughness: 0.6 })} />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[0.07, 6, 6]} />
          <meshStandardMaterial {...flatStandard(PALETTE.flowerCore, { emissive: PALETTE.flowerCore, emissiveIntensity: 0.35 })} />
        </mesh>
      </group>
    </group>
  );
}

type Props = {
  children?: ReactNode;
  /** Set false to omit the scatter (e.g. a very busy game). */
  scatter?: boolean;
};

/**
 * Drop-in environment for a minigame Scene. Provides sky, lights, fog, ground
 * and scatter; render your gameplay as children (positioned around the origin,
 * sitting on y=0).
 */
export function MiniStage({ children, scatter = true }: Props) {
  const geometry = useGroundGeometry();
  return (
    <>
      <StageCamera />
      <fog attach="fog" args={[PALETTE.fog, 18, 46]} />

      {/* Procedural studio IBL (baked once, no network HDR) so authored GLB
          characters/props get real reflections + soft fill — matches the hub. */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={2.2} color="#fff4dd" position={[2, 6, 3]} scale={[10, 10, 1]} />
        <Lightformer intensity={0.8} color="#bfe6ff" position={[-6, 3, 4]} scale={[8, 8, 1]} />
        <Lightformer intensity={1.4} color="#dbe7ff" position={[0, 4, -7]} scale={[10, 5, 1]} />
        <Lightformer intensity={0.6} color="#7fb056" rotation={[Math.PI / 2, 0, 0]} position={[0, -4, 0]} scale={[12, 12, 1]} />
      </Environment>

      {/* Direct rig over the IBL: warm key, cool back-rim, soft front fill. */}
      <hemisphereLight args={[PALETTE.hemiSky, PALETTE.hemiGround, 0.35]} />
      <directionalLight position={[6, 10, 4]} intensity={1.25} color={PALETTE.sun} />
      <directionalLight position={[-5, 6, -6]} intensity={0.7} color="#cfe0ff" />
      <directionalLight position={[0, 2, 9]} intensity={0.4} color="#fff0d0" />
      <ambientLight intensity={0.06} />
      <SkyDome />

      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors flatShading roughness={0.95} metalness={0} />
      </mesh>

      {scatter && (
        <>
          {ROCKS.map((r, i) => (
            <Rock key={`rock${i}`} {...r} />
          ))}
          {TUFTS.map((p, i) => (
            <GrassTuft key={`tuft${i}`} pos={p} seed={(i + 1) * 0.37} />
          ))}
          {FLOWERS.map((f, i) => (
            <Float key={`flower${i}`} speed={1.2} rotationIntensity={0} floatIntensity={0.15} floatingRange={[0, 0.04]}>
              <Flower pos={f.pos} color={f.color} />
            </Float>
          ))}
        </>
      )}

      {children}
    </>
  );
}
