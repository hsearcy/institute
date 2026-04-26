// apps/kid-app/src/world/components/SkyDome.tsx
import { BackSide } from "three";

export function SkyDome() {
  return (
    <mesh>
      <sphereGeometry args={[100, 16, 16]} />
      <meshBasicMaterial color="#7ec0ee" side={BackSide} />
    </mesh>
  );
}
