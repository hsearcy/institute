// apps/kid-app/src/world/components/Tutor.tsx
// The tutor companion is a real generated GLB creature (Tripo) — a soft purple
// slime spirit. Gentle Float bob, drifting sparkles, a soft ground shadow, and
// the equippable cosmetic Hat on top.
import { Float, Sparkles } from "@react-three/drei/native";
import { PALETTE, flatStandard, glowStandard } from "../theme";
import { BlobShadow } from "./BlobShadow";
import { GltfModel } from "./GltfModel";

const BASE_POS: readonly [number, number, number] = [-1.4, 1.5, 0];
const TUTOR_GLB = require("../../../assets/models/tutor/tutor.glb");

// An equippable cosmetic hat that sits atop the tutor. Shape varies by id.
function Hat({ id, color = "#ffd84a" }: { id: string; color?: string }) {
  if (id === "hat_crown") {
    return (
      <group position={[0, 0.5, 0]}>
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
    <group position={[0, 0.48, 0]}>
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
      {/* shadow on the ground beneath the floating creature */}
      <BlobShadow radius={0.5} opacity={0.22} position={[0, -BASE_POS[1] + 0.02, 0]} />

      <Float speed={1.6} rotationIntensity={0.2} floatIntensity={0.6} floatingRange={[-0.08, 0.08]}>
        {/* the GLB creature, centered on the float origin */}
        <GltfModel src={TUTOR_GLB} height={0.95} position={[0, -0.47, 0]} />
        {hatId && <Hat id={hatId} color={hatSwatch} />}
        {/* magical sparkles orbiting the companion */}
        <Sparkles count={14} scale={1.4} size={3} speed={0.4} color={PALETTE.flowerCore} opacity={0.8} />
      </Float>
    </group>
  );
}
