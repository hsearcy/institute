// apps/kid-app/src/world/components/Tutor.tsx
// Floating purple companion blob — round, cute, softly glowing, with a face
// and a few magical sparkles. Gentle Float bob (calm, not frantic).
import { Float, Sparkles } from "@react-three/drei/native";
import { PALETTE, flatStandard, glowStandard } from "../theme";
import { BlobShadow } from "./BlobShadow";

const BASE_POS: readonly [number, number, number] = [-1.4, 1.55, 0];

// An equippable cosmetic hat that sits atop the tutor blob. Shape varies by id;
// color comes from the cosmetic swatch.
function Hat({ id, color = "#ffd84a" }: { id: string; color?: string }) {
  if (id === "hat_crown") {
    return (
      <group position={[0, 0.46, 0]}>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.27, 0.29, 0.12, 18]} />
          <meshStandardMaterial {...glowStandard(color, color, 0.5)} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.25, 0.17, Math.sin(a) * 0.25]}>
              <coneGeometry args={[0.05, 0.13, 6]} />
              <meshStandardMaterial {...glowStandard(color, color, 0.5)} />
            </mesh>
          );
        })}
      </group>
    );
  }
  const tall = id === "hat_wizard";
  return (
    <group position={[0, 0.44, 0]}>
      {tall && (
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.36, 0.36, 0.03, 22]} />
          <meshStandardMaterial {...flatStandard(color, { flatShading: false, roughness: 0.6 })} />
        </mesh>
      )}
      <mesh position={[0, tall ? 0.36 : 0.24, 0]}>
        <coneGeometry args={[0.27, tall ? 0.72 : 0.46, 18]} />
        <meshStandardMaterial {...flatStandard(color, { flatShading: false, roughness: 0.6 })} />
      </mesh>
      <mesh position={[0, tall ? 0.72 : 0.48, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={PALETTE.white} />
      </mesh>
    </group>
  );
}

export function Tutor({ hatId, hatSwatch }: { hatId?: string; hatSwatch?: string } = {}) {
  return (
    <group position={BASE_POS as [number, number, number]}>
      {/* shadow sits on the ground beneath the floating blob */}
      <BlobShadow radius={0.5} opacity={0.22} position={[0, -BASE_POS[1] + 0.02, 0]} />

      <Float speed={1.6} rotationIntensity={0.25} floatIntensity={0.6} floatingRange={[-0.08, 0.08]}>
        {hatId && <Hat id={hatId} color={hatSwatch} />}
        {/* glowing body */}
        <mesh>
          <sphereGeometry args={[0.42, 24, 24]} />
          <meshStandardMaterial {...glowStandard(PALETTE.tutorBody, PALETTE.tutorGlow, 0.7)} />
        </mesh>
        {/* a soft larger halo shell for a magical bloom-ish read */}
        <mesh scale={1.18}>
          <sphereGeometry args={[0.42, 16, 16]} />
          <meshBasicMaterial color={PALETTE.tutorGlow} transparent opacity={0.12} depthWrite={false} />
        </mesh>

        {/* eyes */}
        <mesh position={[-0.13, 0.05, 0.36]}>
          <sphereGeometry args={[0.1, 14, 14]} />
          <meshStandardMaterial {...flatStandard(PALETTE.white, { flatShading: false, roughness: 0.35 })} />
        </mesh>
        <mesh position={[0.13, 0.05, 0.36]}>
          <sphereGeometry args={[0.1, 14, 14]} />
          <meshStandardMaterial {...flatStandard(PALETTE.white, { flatShading: false, roughness: 0.35 })} />
        </mesh>
        <mesh position={[-0.13, 0.05, 0.43]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial {...flatStandard(PALETTE.eyeDark, { flatShading: false, roughness: 0.35 })} />
        </mesh>
        <mesh position={[0.13, 0.05, 0.43]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial {...flatStandard(PALETTE.eyeDark, { flatShading: false, roughness: 0.35 })} />
        </mesh>
        {/* tiny catchlight highlights */}
        <mesh position={[-0.1, 0.09, 0.47]}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshBasicMaterial color={PALETTE.white} />
        </mesh>
        <mesh position={[0.16, 0.09, 0.47]}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshBasicMaterial color={PALETTE.white} />
        </mesh>

        {/* rosy cheeks */}
        <mesh position={[-0.24, -0.08, 0.32]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial {...flatStandard(PALETTE.tutorCheek, { flatShading: false, roughness: 0.6 })} />
        </mesh>
        <mesh position={[0.24, -0.08, 0.32]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial {...flatStandard(PALETTE.tutorCheek, { flatShading: false, roughness: 0.6 })} />
        </mesh>

        {/* magical sparkles orbiting the companion */}
        <Sparkles count={14} scale={1.4} size={3} speed={0.4} color={PALETTE.flowerCore} opacity={0.8} />
      </Float>
    </group>
  );
}
