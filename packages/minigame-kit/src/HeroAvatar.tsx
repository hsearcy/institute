// The player's wizard hero, shared by the hub and every minigame so the kid's
// character is present everywhere. Loads the wizard GLB, faces the camera, does
// a soft idle bob/sway, grounds with a blob shadow, and — when an outfit color
// is equipped — wears a gently-swaying magic cape in that color (the heroOutfit
// cosmetic, which a textured GLB can't recolor directly).
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber/native";
import { DoubleSide, PlaneGeometry, type Group } from "three";
import { GltfModel } from "./GltfModel.tsx";
import { BlobShadow } from "./BlobShadow.tsx";

const WIZARD_GLB = require("../assets/wizard.glb");

/** A curved cloth that wraps slightly around the hero's back and flares at the hem. */
function useCapeGeometry(height: number) {
  return useMemo(() => {
    const topW = height * 0.34;
    const h = height * 0.5;
    const geo = new PlaneGeometry(topW, h, 4, 10);
    const pos = geo.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const yn = (y + h / 2) / h; // 0 hem .. 1 collar
      const widthScale = 0.7 + (1 - yn) * 0.6; // flare toward the hem
      const sx = x * widthScale;
      pos.setX(i, sx);
      // Bow backward (wrap around the body) + push the hem out a touch.
      pos.setZ(i, -1.4 * sx * sx - 0.05 * (1 - yn) * height);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [height]);
}

function Cape({ color, height }: { color: string; height: number }) {
  const ref = useRef<Group>(null);
  const geo = useCapeGeometry(height);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    // gentle wind sway
    ref.current.rotation.x = 0.12 + Math.sin(clock.elapsedTime * 1.4) * 0.05;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.1) * 0.03;
  });
  return (
    <group ref={ref} position={[0, height * 0.6, -height * 0.06]}>
      {/* clasp at the collar */}
      <mesh position={[0, height * 0.02, height * 0.05]}>
        <sphereGeometry args={[height * 0.04, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.5} />
      </mesh>
      {/* the cloth, hanging from the collar */}
      <mesh geometry={geo} position={[0, -height * 0.24, 0]}>
        <meshStandardMaterial color={color} side={DoubleSide} roughness={0.7} metalness={0} />
      </mesh>
    </group>
  );
}

type Props = {
  /** Total world height of the wizard (incl. hat). */
  height?: number;
  /** Equipped heroOutfit swatch — renders a cape in this color when set. */
  outfitColor?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Shadow radius under the feet (scales with the avatar). */
  shadow?: boolean;
};

export function HeroAvatar({ height = 2.0, outfitColor, position, rotation, shadow = true }: Props) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = Math.sin(t * 1.6) * 0.04;
    ref.current.rotation.y = Math.sin(t * 0.5) * 0.1;
    ref.current.rotation.z = Math.sin(t * 0.4) * 0.02;
  });
  return (
    <group position={position} rotation={rotation}>
      {shadow && <BlobShadow radius={height * 0.45} opacity={0.4} position={[0, 0.02, 0]} />}
      <group ref={ref}>
        {/* Tripo model faces -Z; turn it to face the camera. */}
        <GltfModel src={WIZARD_GLB} height={height} rotation={[0, Math.PI, 0]} />
        {outfitColor && <Cape color={outfitColor} height={height} />}
      </group>
    </group>
  );
}
