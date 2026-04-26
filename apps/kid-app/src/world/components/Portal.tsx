import { useRef } from "react";
import { useFrame } from "@react-three/fiber/native";
import { Text } from "@react-three/drei/native";
import type { Mesh } from "three";
import type { PortalDef } from "../../config";

type Props = {
  def: PortalDef;
  /** Phase offset in seconds so portals don't pulse in unison. */
  phaseOffsetS?: number;
  onTap?: (id: PortalDef["id"]) => void;
};

const PULSE_PERIOD_S = 1.0;
const PULSE_AMP = 0.02;

export function Portal({ def, phaseOffsetS = 0, onTap }: Props) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime + phaseOffsetS;
    const s = 1 + Math.sin((2 * Math.PI * t) / PULSE_PERIOD_S) * PULSE_AMP;
    ref.current.scale.set(s, s, s);
  });
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
        <meshStandardMaterial color="#b07cf0" emissive="#5b2ea0" emissiveIntensity={0.4} />
      </mesh>
      <Text
        position={[0, 2.8, 0]}
        fontSize={0.4}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor="#000000"
      >
        {def.label}
      </Text>
    </group>
  );
}
