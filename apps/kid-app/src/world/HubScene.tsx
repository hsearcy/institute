// apps/kid-app/src/world/HubScene.tsx
import { Environment, Lightformer } from "@react-three/drei/native";
import { PORTAL_DEFS } from "../config";
import { AtmosphereLayer } from "./components/AtmosphereLayer";
import { Decor } from "./components/Decor";
import { Ground } from "./components/Ground";
import { Hero } from "./components/Hero";
import { Hills } from "./components/Hills";
import { Pet } from "./components/Pet";
import { Pond } from "./components/Pond";
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

      {/* Image-based lighting: a procedural studio env (no network HDR) baked once.
          Gives the PBR character/prop materials real reflections + soft, art-directed
          fill — the single biggest lift for the imported GLB characters. Cheap at runtime. */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={2.2} color="#fff4dd" position={[2, 6, 3]} scale={[10, 10, 1]} />
        <Lightformer intensity={0.8} color="#bfe6ff" position={[-6, 3, 4]} scale={[8, 8, 1]} />
        <Lightformer intensity={1.4} color="#dbe7ff" position={[0, 4, -7]} scale={[10, 5, 1]} />
        <Lightformer
          intensity={0.6}
          color="#7fb056"
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, -4, 0]}
          scale={[12, 12, 1]}
        />
      </Environment>

      {/* Direct rig over the IBL: warm key for form (matches blob-shadow direction),
          cool rim for silhouette separation, soft front fill to lift faces. */}
      <hemisphereLight args={["#bfe6ff", "#6f9a4d", 0.35]} />
      <directionalLight position={[6, 10, 4]} intensity={1.25} color="#fff2d6" />
      <directionalLight position={[-5, 6, -6]} intensity={0.7} color="#cfe0ff" />
      <directionalLight position={[0, 1.3, 8]} intensity={0.6} color="#fff0d0" />
      <ambientLight intensity={0.06} color="#fff2d6" />
      <SkyDome />
      <AtmosphereLayer />
      <Hills />
      <Ground />
      <Pond />
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
