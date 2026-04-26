import { useRef } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Mesh } from "three";
import type { PortalDef, PortalId } from "../../config";

type Props = {
  def: PortalDef;
  /** Phase offset in seconds so portals don't pulse in unison. */
  phaseOffsetS?: number;
  onTap?: (id: PortalDef["id"]) => void;
};

const PULSE_PERIOD_S = 1.0;
const PULSE_AMP = 0.02;

// Per-portal color so they're distinguishable at a glance until we wire
// real RN-overlay labels in M6. drei's <Text> uses troika-three-text,
// which calls `document` and crashes on React Native.
const PORTAL_COLORS: Record<PortalId, { body: string; emissive: string; flag: string }> = {
  "spell-cast":   { body: "#b07cf0", emissive: "#5b2ea0", flag: "#ffd84a" }, // purple+gold
  "block-tower":  { body: "#e07a3a", emissive: "#7a3812", flag: "#fff5e0" }, // orange+cream
  "cookie-share": { body: "#f4c28c", emissive: "#7a4a1f", flag: "#d63b3b" }, // tan+red
  "door-code":    { body: "#3a7d52", emissive: "#1a3d22", flag: "#a3e0b8" }, // green+mint
};

export function Portal({ def, phaseOffsetS = 0, onTap }: Props) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime + phaseOffsetS;
    const s = 1 + Math.sin((2 * Math.PI * t) / PULSE_PERIOD_S) * PULSE_AMP;
    ref.current.scale.set(s, s, s);
  });
  const colors = PORTAL_COLORS[def.id];
  return (
    <group position={def.position}>
      <mesh
        ref={ref}
        position={[0, 1.2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onTap?.(def.id);
        }}
      >
        <cylinderGeometry args={[0.5, 0.5, 2.4, 12]} />
        <meshStandardMaterial
          color={colors.body}
          emissive={colors.emissive}
          emissiveIntensity={0.4}
        />
      </mesh>
      {/* Flag floating above the portal — color-coded "label" for now. */}
      <mesh position={[0, 2.8, 0]}>
        <boxGeometry args={[0.8, 0.4, 0.05]} />
        <meshStandardMaterial color={colors.flag} />
      </mesh>
    </group>
  );
}
