// apps/kid-app/src/world/HubScene.tsx
import { Decor } from "./components/Decor";
import { Ground } from "./components/Ground";
import { SkyDome } from "./components/SkyDome";

export function HubScene() {
  return (
    <>
      <fog attach="fog" args={["#7ec0ee", 12, 28]} />
      <ambientLight intensity={0.4} color="#b8d8ff" />
      <directionalLight position={[6, 10, 4]} intensity={1.0} color="#fff5e0" />
      <SkyDome />
      <Ground />
      <Decor />
    </>
  );
}
