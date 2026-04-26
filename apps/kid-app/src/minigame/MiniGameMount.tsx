import { plugin as spellCastPlugin } from "@institute/minigame-spell-cast";
import { register, getPlugin, validateParams, type RoundResult } from "@institute/plugin-engine";
import { Scene as SpellCastScene, type SpellCastSceneHandle } from "@institute/minigame-spell-cast";
import { FIXTURES } from "./fixtures";
import type { PortalId } from "../config";

// Register V1 plugins once at module load. New plugins added here in M6.
let registered = false;
function ensureRegistered() {
  if (registered) return;
  try {
    register(spellCastPlugin);
  } catch (e) {
    // Already-registered errors are fine in dev hot-reload; surface other errors.
    if (!(e instanceof Error) || !/already registered/i.test(e.message)) throw e;
  }
  registered = true;
}

type Props = {
  portalId: PortalId;
  onComplete: (r: RoundResult) => void;
  handleRef: React.MutableRefObject<SpellCastSceneHandle | null>;
};

/**
 * Renders the 3D Scene for the requested mini-game. Returns the imperative
 * handle (via ref param) so the parent App can wire NumberPad taps and the
 * BackButton to the Scene without React-tree coupling.
 */
export function MiniGameMount({ portalId, onComplete, handleRef }: Props) {
  ensureRegistered();
  const plugin = getPlugin(portalId);
  if (!plugin) {
    // M2 only wires spell-cast. Other portals shouldn't reach here.
    onComplete({ status: "aborted", outcomes: [], durationMs: 0 });
    return null;
  }
  const fixture = portalId === "spell-cast" ? FIXTURES["spell-cast"] : undefined;
  if (!fixture) {
    onComplete({ status: "aborted", outcomes: [], durationMs: 0 });
    return null;
  }
  const validated = validateParams(plugin, fixture);
  if (!validated.ok) {
    // This shouldn't happen — the fixture was authored against the schema.
    // Logging covers the dev case until M5's LLM path makes invalid params
    // a real possibility.
    console.error("MiniGameMount: fixture failed validation", validated.error);
    onComplete({ status: "aborted", outcomes: [], durationMs: 0 });
    return null;
  }
  // M2 expedient: this `unknown` cast collapses the generic `Plugin<P>` to
  // the SpellCastScene type because we know it's the only registered plugin
  // right now. M6 will add 3 more plugins with different param shapes; at
  // that point refactor MiniGameMount to be generic in P (or use a small
  // per-plugin dispatch table) so each portal gets its own typed render path.
  const Scene = plugin.Scene as unknown as typeof SpellCastScene;
  return (
    <Scene
      params={validated.value as never}
      onComplete={onComplete}
      onHandleReady={(h) => { handleRef.current = h; }}
    />
  );
}
