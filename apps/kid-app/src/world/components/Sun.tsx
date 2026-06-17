// apps/kid-app/src/world/components/Sun.tsx
// A warm golden-hour sun: a crisp bright disc placed high toward the key-light
// direction ([6,10,4]-ish), wrapped in a couple of faint additive halo shells
// for a soft bloom read. fog={false} everywhere so it stays sharp at distance.
import { AdditiveBlending } from "three";
import { PALETTE } from "../theme";

// Far down the key-light axis so the sun visually anchors the warm light.
const SUN_POS: readonly [number, number, number] = [17, 16, -34];

export function Sun() {
  return (
    <group position={SUN_POS as [number, number, number]}>
      {/* bright core disc — basic material so it always reads full-bright */}
      <mesh>
        <sphereGeometry args={[3.2, 24, 24]} />
        <meshBasicMaterial color={PALETTE.sunCore} fog={false} toneMapped={false} />
      </mesh>

      {/* inner glow */}
      <mesh scale={1.7}>
        <sphereGeometry args={[3.2, 20, 20]} />
        <meshBasicMaterial
          color={PALETTE.sunHalo}
          transparent
          opacity={0.4}
          depthWrite={false}
          blending={AdditiveBlending}
          fog={false}
          toneMapped={false}
        />
      </mesh>

      {/* wide soft golden bloom */}
      <mesh scale={3.0}>
        <sphereGeometry args={[3.2, 16, 16]} />
        <meshBasicMaterial
          color={PALETTE.sunHalo}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={AdditiveBlending}
          fog={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export default Sun;
