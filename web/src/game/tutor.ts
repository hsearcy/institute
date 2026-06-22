// Talks to the tutor server. The shared schema types flow across the boundary.
import type { Problem, Branches, Skill, Reward, State, ShopState, ShopItem } from '@institute/shared';
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

export function fetchFirst(): Promise<Problem> {
  return post<Problem>('/tutor/first', { profileId: PROFILE });
}

export function fetchBranches(current: Problem): Promise<Branches> {
  return post<Branches>('/tutor/branches', { profileId: PROFILE, current });
}

/** Record one first-try answer; returns the authoritative reward delta (gems,
 *  streak, milestone, completed quests, shield use). Never throws — on a network
 *  failure it resolves to null so gameplay is never blocked on telemetry. */
export async function recordAttempt(a: {
  problemId: string;
  skill: Skill;
  correct: boolean;
  solveMs: number;
  difficulty: number;
}): Promise<Reward | null> {
  try {
    const res = await post<{ ok: boolean; reward: Reward }>('/tutor/attempt', { profileId: PROFILE, ...a });
    return res.reward ?? null;
  } catch {
    return null;
  }
}

/** Credit a gem for a correct answer that wasn't his first try (no streak).
 *  Returns the reward delta, or null on failure. Never throws. */
export async function creditRetrySolve(): Promise<Reward | null> {
  try {
    const res = await post<{ ok: boolean; reward: Reward }>('/reward/retry-solve', { profileId: PROFILE });
    return res.reward ?? null;
  } catch {
    return null;
  }
}

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

/** Buy a streak shield (40 gems). Returns the new gem + shield counts, or a
 *  not-enough-gems result. Never throws. */
export async function buyShield(): Promise<
  { ok: true; gems: number; shields: number } | { ok: false; reason: string; gems: number; shields: number } | null
> {
  try {
    return await post('/shop/buy-shield', { profileId: PROFILE });
  } catch {
    return null;
  }
}

// ---- pickaxe-skin shop -------------------------------------------------------

/** Fetch the pickaxe shop: gem balance, equipped skin, and the full catalog in
 *  ladder order (wooden → legendary). Returns null on failure; never throws. */
export async function fetchShop(): Promise<ShopState | null> {
  try {
    const r = await fetch(`${API}/shop?profileId=${encodeURIComponent(PROFILE)}`);
    if (!r.ok) return null;
    return (await r.json()) as ShopState;
  } catch {
    return null;
  }
}

type BuyResult =
  | { ok: true; gems: number; equipped: string; item: Pick<ShopItem, 'key' | 'name' | 'price'> }
  | { ok: false; reason: string; gems: number }
  | null;

/** Buy a pickaxe skin. On success gems are already debited + the skin auto-equipped.
 *  Returns the server result (or a not-enough-gems failure). Never throws. */
export async function buyPickaxe(itemKey: string): Promise<BuyResult> {
  try {
    return await post('/shop/buy', { profileId: PROFILE, itemKey });
  } catch {
    return null;
  }
}

/** Equip an already-owned pickaxe skin. Returns the new equipped key, or a
 *  not-owned failure. Never throws. */
export async function equipPickaxe(
  itemKey: string,
): Promise<{ ok: true; equipped: string } | { ok: false; reason: string } | null> {
  try {
    return await post('/shop/equip', { profileId: PROFILE, itemKey });
  } catch {
    return null;
  }
}
