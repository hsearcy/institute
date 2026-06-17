// The hub hero is the shared wizard avatar (also used in every minigame). The
// equipped heroOutfit swatch becomes a magic cape via `outfitColor`.
import { HeroAvatar } from "@institute/minigame-kit";

export function Hero({ shirtColor }: { shirtColor?: string } = {}) {
  return <HeroAvatar height={2.0} outfitColor={shirtColor} />;
}
