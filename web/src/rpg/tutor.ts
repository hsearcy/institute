// Talks to the tutor server. The shared schema types flow across the boundary.
import type { State } from '@institute/shared';
import { API, PROFILE } from './config';

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

export type Demo = {
  kidLabel: string; name: string;
  example: { prompt: string; spoken: string; answer: number; hint?: string };
  script: string;
};

/** Fetch the persisted reward state (gems, streak, shields, daily quests). */
export async function fetchState(): Promise<State | null> {
  try {
    const r = await fetch(`${API}/state?profileId=${encodeURIComponent(PROFILE)}`);
    if (!r.ok) return null;
    return (await r.json()) as State;
  } catch {
    return null;
  }
}

/** Parent redeems one Crazy Coin.
 *  Returns the new coin count, or a no-coins failure. Never throws. */
export async function redeemCrazyCoin(requestId?: string): Promise<
  { ok: true; crazyCoins: number } | { ok: false; reason: string; crazyCoins: number } | null
> {
  try {
    return await post('/shop/redeem-crazy-coin', { profileId: PROFILE, requestId });
  } catch {
    return null;
  }
}

// ---- parent mastery dashboard --------------------------------------------------

export type MasteryTopic = {
  id: string;
  name: string;
  kidLabel: string;
  domain: string;
  prereqs: string[];
  unlocked: boolean;
  attempts: number;
  correct: number;
  state: 'unstarted' | 'practicing' | 'mastered';
  fluentMs: number | null;
  assessmentPrompt: string;
  skips?: number;
};

export type Mastery = { profileId: string; topics: MasteryTopic[]; crazyCoins: number; dimes?: number };

/** Fetch the topic-mastery graph for the parent dashboard. Returns null on
 *  failure so the overlay can show a gentle notice; never throws. */
export async function fetchMastery(): Promise<Mastery | null> {
  try {
    const name = PROFILE.charAt(0).toUpperCase() + PROFILE.slice(1);
    const r = await fetch(`${API}/mastery?profileId=${encodeURIComponent(PROFILE)}&name=${encodeURIComponent(name)}`);
    if (!r.ok) return null;
    return (await r.json()) as Mastery;
  } catch {
    return null;
  }
}

/** Records one parent payout. The caller retains requestId after a lost response. */
export async function redeemDime(requestId: string): Promise<{ ok: boolean; dimes: number; reason?: string } | null> {
  try { return await post('/shop/redeem-dime', { profileId: PROFILE, requestId }); }
  catch { return null; }
}
