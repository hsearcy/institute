// apps/kid-app/src/world/components/Birds.tsx
// A few tiny low-poly birds (a body + two wing cones) that slowly circle the
// sky on useFrame with a gentle wing-flap. Small, distant, muted — charming
// silhouettes rather than detailed models. Pure primitives, native-safe.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group, Mesh } from "three";
import { PALETTE, flatStandard } from "../theme";

type BirdDef = {
  radius: number; // circle radius around its center
  center: readonly [number, number, number];
  height: number; // gentle vertical bob amplitude
  speed: number; // radians/sec around the circle
  flap: number; // wing-flap speed
  phase: number; // starting angle
  scale: number;
};

const BIRDS: BirdDef[] = [
  { radius: 13, center: [-6, 10, -16], height: 1.0, speed: 0.12, flap: 4.5, phase: 0, scale: 1.1 },
  { radius: 10, center: [10, 12, -20], height: 1.3, speed: 0.16, flap: 5.2, phase: 2.1, scale: 0.9 },
  { radius: 15, center: [2, 9, -12], height: 0.9, speed: 0.09, flap: 4.0, phase: 4.0, scale: 1.25 },
];

function Bird({ def }: { def: BirdDef }) {
  const group = useRef<Group>(null);
  const leftWing = useRef<Mesh>(null);
  const rightWing = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const a = def.phase + t * def.speed;
    const g = group.current;
    if (g) {
      g.position.set(
        def.center[0] + Math.cos(a) * def.radius,
        def.center[1] + Math.sin(t * def.speed * 1.5) * def.height,
        def.center[2] + Math.sin(a) * def.radius,
      );
      // face along the tangent of the circle so it banks into the turn
      g.rotation.y = -a + Math.PI / 2;
    }
    // symmetric flap
    const flap = Math.sin(t * def.flap) * 0.5;
    if (leftWing.current) leftWing.current.rotation.z = 0.2 + flap;
    if (rightWing.current) rightWing.current.rotation.z = -0.2 - flap;
  });

  return (
    <group ref={group} scale={def.scale}>
      {/* body */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.12, 0.5, 6]} />
        <meshStandardMaterial {...flatStandard(PALETTE.bird, { roughness: 0.9 })} />
      </mesh>
      {/* wings — flat thin cones that pivot at the body */}
      <mesh ref={leftWing} position={[0, 0, 0.02]}>
        <coneGeometry args={[0.07, 0.55, 4]} />
        <meshStandardMaterial {...flatStandard(PALETTE.bird, { roughness: 0.9 })} />
      </mesh>
      <mesh ref={rightWing} position={[0, 0, -0.02]}>
        <coneGeometry args={[0.07, 0.55, 4]} />
        <meshStandardMaterial {...flatStandard(PALETTE.bird, { roughness: 0.9 })} />
      </mesh>
    </group>
  );
}

export function Birds() {
  return (
    <>
      {BIRDS.map((b, i) => (
        <Bird key={i} def={b} />
      ))}
    </>
  );
}

export default Birds;
