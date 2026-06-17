// apps/kid-app/src/world/components/Hero.tsx
// Rounded, friendly kid avatar built from RoundedBox + spheres. Gentle idle
// breathing/sway. Grounded with a fake blob shadow.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber/native";
import { RoundedBox } from "@react-three/drei/native";
import type { Group } from "three";
import { PALETTE, flatStandard } from "../theme";
import { BlobShadow } from "./BlobShadow";

export function Hero({ shirtColor = PALETTE.heroShirt }: { shirtColor?: string } = {}) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    // soft breathing bob + a slow sway so the hero feels alive but calm
    ref.current.position.y = Math.sin(t * 1.6) * 0.03;
    ref.current.rotation.y = Math.sin(t * 0.5) * 0.12;
  });

  return (
    <group>
      <BlobShadow radius={0.9} opacity={0.4} position={[0, 0.02, 0]} />
      <group ref={ref}>
        {/* shoes */}
        <RoundedBox args={[0.26, 0.18, 0.34]} radius={0.08} smoothness={3} position={[-0.16, 0.1, 0.03]}>
          <meshStandardMaterial {...flatStandard(PALETTE.heroShoe, { flatShading: false, roughness: 0.6 })} />
        </RoundedBox>
        <RoundedBox args={[0.26, 0.18, 0.34]} radius={0.08} smoothness={3} position={[0.16, 0.1, 0.03]}>
          <meshStandardMaterial {...flatStandard(PALETTE.heroShoe, { flatShading: false, roughness: 0.6 })} />
        </RoundedBox>

        {/* legs */}
        <RoundedBox args={[0.2, 0.55, 0.22]} radius={0.09} smoothness={3} position={[-0.16, 0.46, 0]}>
          <meshStandardMaterial {...flatStandard(PALETTE.heroPants, { flatShading: false, roughness: 0.7 })} />
        </RoundedBox>
        <RoundedBox args={[0.2, 0.55, 0.22]} radius={0.09} smoothness={3} position={[0.16, 0.46, 0]}>
          <meshStandardMaterial {...flatStandard(PALETTE.heroPants, { flatShading: false, roughness: 0.7 })} />
        </RoundedBox>

        {/* body */}
        <RoundedBox args={[0.58, 0.7, 0.36]} radius={0.16} smoothness={4} position={[0, 1.05, 0]}>
          <meshStandardMaterial {...flatStandard(shirtColor, { flatShading: false, roughness: 0.65 })} />
        </RoundedBox>

        {/* arms */}
        <RoundedBox args={[0.16, 0.5, 0.18]} radius={0.08} smoothness={3} position={[-0.36, 1.05, 0]} rotation={[0, 0, 0.18]}>
          <meshStandardMaterial {...flatStandard(shirtColor, { flatShading: false, roughness: 0.65 })} />
        </RoundedBox>
        <RoundedBox args={[0.16, 0.5, 0.18]} radius={0.08} smoothness={3} position={[0.36, 1.05, 0]} rotation={[0, 0, -0.18]}>
          <meshStandardMaterial {...flatStandard(shirtColor, { flatShading: false, roughness: 0.65 })} />
        </RoundedBox>
        {/* hands */}
        <mesh position={[-0.42, 0.78, 0]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial {...flatStandard(PALETTE.heroSkin, { flatShading: false, roughness: 0.7 })} />
        </mesh>
        <mesh position={[0.42, 0.78, 0]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial {...flatStandard(PALETTE.heroSkin, { flatShading: false, roughness: 0.7 })} />
        </mesh>

        {/* head */}
        <group position={[0, 1.66, 0]}>
          <RoundedBox args={[0.46, 0.44, 0.42]} radius={0.18} smoothness={4}>
            <meshStandardMaterial {...flatStandard(PALETTE.heroSkin, { flatShading: false, roughness: 0.7 })} />
          </RoundedBox>
          {/* hair cap */}
          <mesh position={[0, 0.14, -0.02]}>
            <sphereGeometry args={[0.26, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial {...flatStandard(PALETTE.heroHair, { flatShading: false, roughness: 0.8 })} />
          </mesh>
          {/* eyes (white + dark pupil) */}
          <mesh position={[-0.1, 0.0, 0.21]}>
            <sphereGeometry args={[0.055, 12, 12]} />
            <meshStandardMaterial {...flatStandard(PALETTE.white, { flatShading: false, roughness: 0.4 })} />
          </mesh>
          <mesh position={[0.1, 0.0, 0.21]}>
            <sphereGeometry args={[0.055, 12, 12]} />
            <meshStandardMaterial {...flatStandard(PALETTE.white, { flatShading: false, roughness: 0.4 })} />
          </mesh>
          <mesh position={[-0.1, 0.0, 0.255]}>
            <sphereGeometry args={[0.028, 10, 10]} />
            <meshStandardMaterial {...flatStandard(PALETTE.eyeDark, { flatShading: false, roughness: 0.4 })} />
          </mesh>
          <mesh position={[0.1, 0.0, 0.255]}>
            <sphereGeometry args={[0.028, 10, 10]} />
            <meshStandardMaterial {...flatStandard(PALETTE.eyeDark, { flatShading: false, roughness: 0.4 })} />
          </mesh>
          {/* rosy cheeks */}
          <mesh position={[-0.16, -0.08, 0.2]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial {...flatStandard(PALETTE.tutorCheek, { flatShading: false, roughness: 0.6 })} />
          </mesh>
          <mesh position={[0.16, -0.08, 0.2]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial {...flatStandard(PALETTE.tutorCheek, { flatShading: false, roughness: 0.6 })} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
