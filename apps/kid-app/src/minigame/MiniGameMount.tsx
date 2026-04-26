import { useEffect, useState } from "react";
import { plugin as spellCastPlugin } from "@institute/minigame-spell-cast";
import { register, getPlugin, validateParams, type RoundResult } from "@institute/plugin-engine";
import { Scene as SpellCastScene, type SpellCastSceneHandle } from "@institute/minigame-spell-cast";
import { FIXTURES } from "./fixtures";
import { PROFILE, TUTOR_BASE_URL, TUTOR_SECRET } from "../config";
import type { PortalId } from "../config";
import { openExpoDb, migrate, type Db } from "../persistence/db";
import { computeEligiblePool } from "../tutor/eligiblePool";
import { loadRecentAttempts } from "../persistence/attemptRepo";
import { getAvailablePlugins } from "../tutor/pluginSchemas";
import { requestNextRound, type TutorResponse } from "../tutor/client";

let registered = false;
function ensureRegistered() {
  if (registered) return;
  try { register(spellCastPlugin); }
  catch (e) { if (!(e instanceof Error) || !/already registered/i.test(e.message)) throw e; }
  registered = true;
}

let dbPromise: Promise<Db> | null = null;
function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => { const db = await openExpoDb(); migrate(db); return db; })();
  }
  return dbPromise;
}

type Props = {
  portalId: PortalId;
  onComplete: (r: RoundResult) => void;
  handleRef: React.MutableRefObject<SpellCastSceneHandle | null>;
};

export function MiniGameMount({ portalId, onComplete, handleRef }: Props) {
  ensureRegistered();
  const plugin = getPlugin(portalId);
  const [round, setRound] = useState<TutorResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!plugin) {
        onComplete({ status: "aborted", outcomes: [], durationMs: 0 });
        return;
      }
      const fallback = (): TutorResponse =>
        portalId === "spell-cast"
          ? { skillId: "skip_count_2", pluginId: "spell-cast", params: FIXTURES["spell-cast"] }
          : { skillId: "skip_count_2", pluginId: portalId, params: {} };

      let payload;
      try {
        const db = await getDb();
        const eligible = computeEligiblePool(db, PROFILE.id, new Date());
        const recent = loadRecentAttempts(db, PROFILE.id, 10).map((a) => ({
          skillId: a.skillId,
          correct: a.correct,
          occurredAt: a.occurredAt.toISOString(),
        }));
        payload = {
          profile: { id: PROFILE.id, name: PROFILE.name, age: PROFILE.age },
          currentZone: "hub",
          eligiblePool: eligible,
          recentHistory: recent,
          availablePlugins: getAvailablePlugins(),
        };
      } catch (e) {
        console.warn("MiniGameMount payload build failed; falling back", e);
        if (!cancelled) setRound(fallback());
        return;
      }

      const response = await requestNextRound({
        baseUrl: TUTOR_BASE_URL,
        bearerToken: TUTOR_SECRET || undefined,
        payload,
        fallback,
      });
      if (cancelled) return;

      const validated = validateParams(plugin, response.params);
      if (!validated.ok) {
        console.error("MiniGameMount: response.params failed schema validation; using fallback", validated.error);
        setRound(fallback());
        return;
      }
      setRound({ ...response, params: validated.value });
    })();
    return () => { cancelled = true; };
  }, [portalId, plugin, onComplete]);

  if (!plugin || !round) return null;

  // M2 expedient cast — Scene is generic per plugin. Refactor in M6.
  const Scene = plugin.Scene as unknown as typeof SpellCastScene;
  return (
    <Scene
      params={round.params as never}
      skillId={round.skillId}
      onComplete={onComplete}
      onHandleReady={(h) => { handleRef.current = h; }}
    />
  );
}
