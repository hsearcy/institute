// apps/kid-app/src/world/components/Hero.tsx
// The hero is a real generated GLB character (Tripo) — a young apprentice wizard
// in an orange robe cupping a magic orb. Gentle idle bob + sway; grounded with a
// fake blob shadow. `shirtColor` is kept for API compatibility (recoloring the
// textured GLB outfit is a follow-up).
import { useRef } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group } from "three";
import { GltfModel } from "./GltfModel";
import { BlobShadow } from "./BlobShadow";

const HERO_GLB = require("../../../assets/models/wizard/wizard.glb");

export function Hero(_props: { shirtColor?: string } = {}) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    // soft breathing bob + slow sway so the hero feels alive
    ref.current.position.y = Math.sin(t * 1.6) * 0.04;
    ref.current.rotation.y = Math.sin(t * 0.5) * 0.1;
    ref.current.rotation.z = Math.sin(t * 0.4) * 0.02;
  });

  return (
    <group>
      <BlobShadow radius={0.85} opacity={0.4} position={[0, 0.02, 0]} />
      <group ref={ref}>
        <GltfModel src={HERO_GLB} height={2.0} rotation={[0, Math.PI, 0]} />
      </group>
    </group>
  );
}
