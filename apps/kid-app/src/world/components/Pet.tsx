// apps/kid-app/src/world/components/Pet.tsx
// A small equippable companion that floats near the hero. Shape varies by id
// (slime / bird), color from the cosmetic swatch. Grounded with a blob shadow.
import { Float } from "@react-three/drei/native";
import { PALETTE, flatStandard } from "../theme";
import { BlobShadow } from "./BlobShadow";

const BASE: readonly [number, number, number] = [0.95, 0.95, 0.55];

export function Pet({ id, swatch = "#7fc7d9" }: { id: string; swatch?: string }) {
  const isBird = id === "pet_bird";
  return (
    <group position={BASE as [number, number, number]}>
      <BlobShadow radius={0.3} opacity={0.24} position={[0, -BASE[1] + 0.02, 0]} />
      <Float speed={2.2} rotationIntensity={0.3} floatIntensity={0.7} floatingRange={[-0.08, 0.12]}>
        {/* body */}
        <mesh>
          <sphereGeometry args={[0.22, 20, 18]} />
          <meshStandardMaterial {...flatStandard(swatch, { flatShading: false, roughness: 0.5 })} />
        </mesh>
        {/* eyes */}
        <mesh position={[-0.07, 0.05, 0.18]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial {...flatStandard(PALETTE.white, { flatShading: false, roughness: 0.3 })} />
        </mesh>
        <mesh position={[0.07, 0.05, 0.18]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial {...flatStandard(PALETTE.white, { flatShading: false, roughness: 0.3 })} />
        </mesh>
        <mesh position={[-0.07, 0.05, 0.22]}>
          <sphereGeometry args={[0.025, 10, 10]} />
          <meshStandardMaterial {...flatStandard(PALETTE.eyeDark, { flatShading: false, roughness: 0.3 })} />
        </mesh>
        <mesh position={[0.07, 0.05, 0.22]}>
          <sphereGeometry args={[0.025, 10, 10]} />
          <meshStandardMaterial {...flatStandard(PALETTE.eyeDark, { flatShading: false, roughness: 0.3 })} />
        </mesh>
        {isBird ? (
          <>
            {/* beak */}
            <mesh position={[0, -0.02, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.05, 0.12, 8]} />
              <meshStandardMaterial {...flatStandard(PALETTE.flowerYellow, { flatShading: false, roughness: 0.5 })} />
            </mesh>
            {/* wings */}
            <mesh position={[-0.2, 0, 0]} rotation={[0, 0, 0.5]}>
              <sphereGeometry args={[0.12, 10, 8]} />
              <meshStandardMaterial {...flatStandard(swatch, { flatShading: false, roughness: 0.5 })} />
            </mesh>
            <mesh position={[0.2, 0, 0]} rotation={[0, 0, -0.5]}>
              <sphereGeometry args={[0.12, 10, 8]} />
              <meshStandardMaterial {...flatStandard(swatch, { flatShading: false, roughness: 0.5 })} />
            </mesh>
          </>
        ) : (
          /* slime: a soft glossy bloom */
          <mesh scale={1.14}>
            <sphereGeometry args={[0.22, 14, 14]} />
            <meshBasicMaterial color={swatch} transparent opacity={0.12} depthWrite={false} />
          </mesh>
        )}
      </Float>
    </group>
  );
}
