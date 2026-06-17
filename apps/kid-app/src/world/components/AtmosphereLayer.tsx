// apps/kid-app/src/world/components/AtmosphereLayer.tsx
// Convenience wrapper that composes the whole magical golden-hour atmosphere:
// far drifting clouds, the warm sun anchor, circling birds, and ground-level
// pollen/firefly/mote life. The orchestrator drops a single <AtmosphereLayer/>
// into HubScene to light the world up.
import { Atmosphere } from "./Atmosphere";
import { Birds } from "./Birds";
import { Clouds } from "./Clouds";
import { Sun } from "./Sun";

export function AtmosphereLayer() {
  return (
    <>
      <Clouds />
      <Sun />
      <Birds />
      <Atmosphere />
    </>
  );
}

export default AtmosphereLayer;
