// apps/kid-app/src/world/HubScene.tsx
import { PORTAL_DEFS } from "../config";
import { Decor } from "./components/Decor";
import { Ground } from "./components/Ground";
import { Hero } from "./components/Hero";
import { Pet } from "./components/Pet";
import { Portal } from "./components/Portal";
import { SkyDome } from "./components/SkyDome";
import { Tutor } from "./components/Tutor";
import type { PortalId } from "../config";
import { PALETTE } from "./theme";

/** Equipped-cosmetic colors/ids the hub renders (resolved from the catalog by App). */
export type HubCosmetics = {
  heroColor?: string;
  hatId?: string;
  hatSwatch?: string;
  petId?: string;
  petSwatch?: string;
};

export function HubScene({
  onPortalTap,
  cosmetics = {},
}: {
  onPortalTap?: (id: PortalId) => void;
  cosmetics?: HubCosmetics;
}) {
  return (
    <>
      <fog attach="fog" args={[PALETTE.fog, 16, 44]} />
      {/* Lighting rig (no shadows): hemisphere bounce + warm key + low fill */}
      <hemisphereLight args={["#bfe6ff", "#6f9a4d", 0.9]} />
      <directionalLight position={[6, 10, 4]} intensity={1.6} color="#fff2d6" />
      <ambientLight intensity={0.12} color="#fff2d6" />
      <SkyDome />
      <Ground />
      <Decor />
      <Hero shirtColor={cosmetics.heroColor} />
      <Tutor hatId={cosmetics.hatId} hatSwatch={cosmetics.hatSwatch} />
      {cosmetics.petId ? <Pet id={cosmetics.petId} swatch={cosmetics.petSwatch} /> : null}
      {PORTAL_DEFS.map((def, i) => (
        <Portal key={def.id} def={def} phaseOffsetS={i * 0.25} onTap={onPortalTap} />
      ))}
    </>
  );
}
