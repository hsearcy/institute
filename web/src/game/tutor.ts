// Talks to the tutor server. The shared schema types flow across the boundary.
import type { Problem, Branches, Skill, Reward, State, ShopState, ShopItem, Durability } from '@institute/shared';
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

/** 🎓 button: a spoken strategy explanation of THIS problem (never the answer).
 *  Never throws — null lets the caller fall back to the local hint. */
export async function fetchExplain(problem: Problem): Promise<string | null> {
  try {
    const r = await post<{ text: string }>('/tutor/explain', { profileId: PROFILE, problem });
    return r.text || null;
  } catch {
    return null;
  }
}

/** Record one first-try answer; returns the authoritative reward delta (gems,
 *  streak, milestone, completed quests, shield use). Never throws — on a network
 *  failure it resolves to null so gameplay is never blocked on telemetry. */
export async function recordAttempt(a: {
  problemId: string;
  skill: Skill;
  /** Curated-graph topic id — drives topic mastery + unlocks on the server. */
  topicId?: string;
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

/** Credit the flat hoard-meter bonus when the gem bar fills. Returns the reward
 *  delta (with the new authoritative total), or null on failure. Never throws. */
export async function creditHoardBonus(): Promise<Reward | null> {
  try {
    const res = await post<{ ok: boolean; reward: Reward }>('/reward/hoard-bonus', { profileId: PROFILE });
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

/** Buy a Crazy Coin (200 gems) — a real-world reward worth 15 minutes of shows,
 *  redeemed by a parent from the dashboard. Never throws. */
export async function buyCrazyCoin(): Promise<
  { ok: true; gems: number; crazyCoins: number } | { ok: false; reason: string; gems: number; crazyCoins: number } | null
> {
  try {
    return await post('/shop/buy-crazy-coin', { profileId: PROFILE });
  } catch {
    return null;
  }
}

/** Parent redeems one Crazy Coin (kid cashes it in for his 15 minutes).
 *  Returns the new coin count, or a no-coins failure. Never throws. */
export async function redeemCrazyCoin(): Promise<
  { ok: true; crazyCoins: number } | { ok: false; reason: string; crazyCoins: number } | null
> {
  try {
    return await post('/shop/redeem-crazy-coin', { profileId: PROFILE });
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
};

export type Mastery = { profileId: string; topics: MasteryTopic[]; crazyCoins: number };

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
  | { ok: true; gems: number; equipped: string; item: Pick<ShopItem, 'key' | 'name' | 'price'>; durability?: Durability | null }
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
 *  not-owned/broken failure. Never throws. */
export async function equipPickaxe(
  itemKey: string,
): Promise<{ ok: true; equipped: string; durability?: Durability | null } | { ok: false; reason: string } | null> {
  try {
    return await post('/shop/equip', { profileId: PROFILE, itemKey });
  } catch {
    return null;
  }
}

/** Repair an owned pickaxe (spends gems, refills durability, re-equips it).
 *  Returns the new balance + durability, or a failure. Never throws. */
export async function repairPickaxe(
  itemKey: string,
): Promise<{ ok: true; gems: number; equipped: string; durability?: Durability | null } | { ok: false; reason: string; gems: number } | null> {
  try {
    return await post('/shop/repair', { profileId: PROFILE, itemKey });
  } catch {
    return null;
  }
}
