// Fetches a tutor round for a portal (LLM-backed, ~3.5s) and validates it,
// falling back to fixtures on any failure. Adds a small per-portal cache so the
// hub can PREFETCH rounds in the background — by the time the kid taps a portal
// the round is usually already in hand, hiding the LLM latency.
import {
  register, getPlugin, validateParams,
} from "@institute/plugin-engine";
import { plugin as spellCastPlugin } from "@institute/minigame-spell-cast";
import { plugin as blockTowerPlugin } from "@institute/minigame-block-tower";
import { plugin as cookieSharePlugin } from "@institute/minigame-cookie-share";
import { plugin as doorCodePlugin } from "@institute/minigame-door-code";
import { FIXTURES } from "../minigame/fixtures";
import { PROFILE, TUTOR_BASE_URL, TUTOR_SECRET, type PortalId } from "../config";
import { getDb } from "../persistence/db";
import { computeEligiblePool } from "./eligiblePool";
import { loadRecentAttempts } from "../persistence/attemptRepo";
import { getAvailablePlugins } from "./pluginSchemas";
import { requestNextRound, type TutorResponse } from "./client";

/** Fallback skill per portal when the tutor backend is unavailable (must exist in TAXONOMY). */
const FALLBACK_SKILL: Record<PortalId, string> = {
  "spell-cast": "skip_count_2",
  "block-tower": "add_within_10",
  "cookie-share": "equal_sharing",
  "door-code": "sub_within_10",
};

let registered = false;
export function ensureRegistered(): void {
  if (registered) return;
  const safe = (fn: () => void) => {
    try { fn(); }
    catch (e) { if (!(e instanceof Error) || !/already registered/i.test(e.message)) throw e; }
  };
  safe(() => register(spellCastPlugin));
  safe(() => register(blockTowerPlugin));
  safe(() => register(cookieSharePlugin));
  safe(() => register(doorCodePlugin));
  registered = true;
}

/** Fetch + validate a round for `portalId`. Always resolves (fixtures on error). */
export async function fetchRound(portalId: PortalId): Promise<TutorResponse> {
  ensureRegistered();
  const plugin = getPlugin(portalId);
  const fallback = (): TutorResponse => ({
    skillId: FALLBACK_SKILL[portalId],
    pluginId: portalId,
    params: FIXTURES[portalId],
  });
  if (!plugin) return fallback();

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
    console.warn("roundService: payload build failed; using fixtures", e);
    return fallback();
  }

  const response = await requestNextRound({
    baseUrl: TUTOR_BASE_URL,
    bearerToken: TUTOR_SECRET || undefined,
    payload,
    fallback,
  });

  const validated = validateParams(plugin, response.params);
  if (!validated.ok) {
    console.error("roundService: params failed schema validation; using fixtures", validated.error);
    return fallback();
  }
  return { ...response, params: validated.value };
}

// ---- Prefetch cache -------------------------------------------------------

const cache = new Map<PortalId, Promise<TutorResponse>>();

/** Warm a round for `portalId` in the background. Idempotent (no-op if one is
 *  already cached/in-flight). */
export function prefetchRound(portalId: PortalId): void {
  if (cache.has(portalId)) return;
  const p = fetchRound(portalId).catch((e) => {
    cache.delete(portalId); // let a later attempt retry
    throw e;
  });
  cache.set(portalId, p);
}

/** Take the prefetched round for `portalId` (removing it from the cache), or
 *  fetch fresh if none was warmed. */
export function consumeRound(portalId: PortalId): Promise<TutorResponse> {
  const cached = cache.get(portalId);
  if (cached) {
    cache.delete(portalId);
    return cached;
  }
  return fetchRound(portalId);
}
