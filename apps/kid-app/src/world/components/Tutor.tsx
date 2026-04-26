import { useRef } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group } from "three";

const BASE_POS: readonly [number, number, number] = [-1.4, 1.5, 0];
const BOB_AMP = 0.1;
const BOB_PERIOD_S = 1.5;

export function Tutor() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    const bob = Math.sin((2 * Math.PI * t) / BOB_PERIOD_S) * BOB_AMP;
    ref.current.position.y = BASE_POS[1] + bob;
  });
  return (
    <group ref={ref} position={[BASE_POS[0], BASE_POS[1], BASE_POS[2]]}>
      {/* body capsule (approximate with cylinder + spheres) */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.5, 12]} />
        <meshStandardMaterial color="#b07cf0" />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.32, 12, 12]} />
        <meshStandardMaterial color="#b07cf0" />
      </mesh>
      <mesh position={[0, -0.25, 0]}>
        <sphereGeometry args={[0.32, 12, 12]} />
        <meshStandardMaterial color="#b07cf0" />
      </mesh>
      {/* eyes */}
      <mesh position={[-0.1, 0.05, 0.3]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.1, 0.05, 0.3]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}
