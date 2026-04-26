// apps/kid-app/src/world/HubScene.tsx
import { PORTAL_DEFS } from "../config";
import { Decor } from "./components/Decor";
import { Ground } from "./components/Ground";
import { Hero } from "./components/Hero";
import { Portal } from "./components/Portal";
import { SkyDome } from "./components/SkyDome";
import { Tutor } from "./components/Tutor";
import type { PortalId } from "../config";

export function HubScene({ onPortalTap }: { onPortalTap?: (id: PortalId) => void }) {
  return (
    <>
      <fog attach="fog" args={["#7ec0ee", 12, 28]} />
      <ambientLight intensity={0.4} color="#b8d8ff" />
      <directionalLight position={[6, 10, 4]} intensity={1.0} color="#fff5e0" />
      <SkyDome />
      <Ground />
      <Decor />
      <Hero />
      <Tutor />
      {PORTAL_DEFS.map((def, i) => (
        <Portal key={def.id} def={def} phaseOffsetS={i * 0.25} onTap={onPortalTap} />
      ))}
    </>
  );
}
