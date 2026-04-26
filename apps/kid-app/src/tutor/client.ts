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
  if (!opts.baseUrl) return opts.fallback();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.bearerToken) headers["Authorization"] = `Bearer ${opts.bearerToken}`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
    const res = await fetch(`${opts.baseUrl}/tutor/next_round`, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return opts.fallback();
    const json = (await res.json()) as TutorResponse;
    if (!json || typeof json !== "object" || !json.pluginId || !json.skillId || json.params === undefined) {
      return opts.fallback();
    }
    return json;
  } catch {
    return opts.fallback();
  }
}
