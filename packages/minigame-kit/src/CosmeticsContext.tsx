// Carries the equipped hero cosmetics into the minigame scene graph. R3F runs a
// separate reconciler, so the Provider must be rendered INSIDE the <Canvas>
// (App wraps the scene with it); MiniStage's HeroAvatar reads it.
import { createContext, useContext } from "react";

export type HubCosmeticsValue = {
  /** Equipped heroOutfit swatch (cape color), if any. */
  heroOutfitColor?: string;
};

const CosmeticsContext = createContext<HubCosmeticsValue>({});

export const CosmeticsProvider = CosmeticsContext.Provider;

export function useHeroCosmetics(): HubCosmeticsValue {
  return useContext(CosmeticsContext);
}
