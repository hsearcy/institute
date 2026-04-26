import type { EligiblePoolEntry } from "./eligiblePool";
import type { AvailablePlugin } from "./pluginSchemas";
import type { AttemptOutcome } from "@institute/skill-engine";

export type TutorRequestPayload = {
  profile: { id: string; name: string; age: number };
  currentZone: string;
  eligiblePool: EligiblePoolEntry[];
  recentHistory: Array<Pick<AttemptOutcome, "skillId" | "correct"> & { occurredAt: string }>;
  availablePlugins: AvailablePlugin[];
};

export type TutorResponse = {
  skillId: string;
  pluginId: string;
  params: unknown;
};

export type RequestNextRoundOpts = {
  baseUrl: string;
  bearerToken?: string;
  payload: TutorRequestPayload;
  fallback: () => TutorResponse;
  /** Default 10s. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT = 10_000;

export async function requestNextRound(opts: RequestNextRoundOpts): Promise<TutorResponse> {
  if (!opts.baseUrl) {
    console.log("[tutor] no base URL → fixtures");
    return opts.fallback();
  }

  const url = `${opts.baseUrl}/tutor/next_round`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.bearerToken) headers["Authorization"] = `Bearer ${opts.bearerToken}`;

  console.log("[tutor] POST", url);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(`[tutor] non-2xx ${res.status} from backend → fixtures`);
      return opts.fallback();
    }
    const json = (await res.json()) as TutorResponse;
    if (!json || typeof json !== "object" || !json.pluginId || !json.skillId || json.params === undefined) {
      console.warn("[tutor] malformed response → fixtures", json);
      return opts.fallback();
    }
    console.log(`[tutor] got round: skill=${json.skillId} plugin=${json.pluginId}`);
    return json;
  } catch (e) {
    console.warn("[tutor] fetch failed → fixtures:", (e as Error)?.message ?? e);
    return opts.fallback();
  }
}
