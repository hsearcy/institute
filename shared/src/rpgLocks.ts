/**
 * Locks the hero opens with a solved problem, beside chests: shrines that
 * grant a short boon, and sealed doors to small side rooms. The server decides
 * every outcome; this module only holds the shared rules and names.
 */
import type { RpgState } from './rpg';

export type RpgLockKind = 'chest' | 'shrine' | 'door';
export type RpgBoonId = 'fury' | 'swiftness' | 'bounty';
export const RPG_BOON_IDS = ['fury', 'swiftness', 'bounty'] as const satisfies readonly RpgBoonId[];

export const RPG_BOONS: Record<RpgBoonId, { name: string; blurb: string; color: string }> = {
  fury: { name: 'Fury', blurb: 'Your spells hit harder', color: '#ff8a3d' },
  swiftness: { name: 'Swiftness', blurb: 'You run faster', color: '#5fe0c8' },
  bounty: { name: 'Bounty', blurb: 'More forge dust from the next fight', color: '#ffd166' },
};

/** Seconds a boon lasts while the hero explores. The clock waits while a problem is shown. */
export const RPG_BOON_SECONDS = 30;
/** Fury: spell damage multiplier. */
export const RPG_FURY_DAMAGE = 1.5;
/**
 * Server slack for each problem solved while a boon lasts: reading, the cast
 * and the trip to the server. The client clock waits for all of these, so the
 * server allows them generously; extra slack only ever favours the child.
 */
export const RPG_BOON_PROBLEM_SLACK_MS = 20_000;

/** A boon on the current expedition, as the server keeps it. */
export interface RpgBoon { id: RpgBoonId; shrineId: string; grantedAt: number; pausedMs: number }

/** The boon a shrine gives is fixed by its id, so the server and the world always agree. */
export function rpgShrineBoon(shrineId: string): RpgBoonId {
  let hash = 2166136261;
  for (let i = 0; i < shrineId.length; i++) hash = Math.imul(hash ^ shrineId.charCodeAt(i), 16777619);
  return RPG_BOON_IDS[(hash >>> 0) % RPG_BOON_IDS.length]!;
}

/** True while a boon still covers a problem answered now that took `answerMs`. */
export function rpgBoonActive(boon: RpgBoon | undefined, now: number, answerMs = 0): boolean {
  if (!boon) return false;
  const allowance = RPG_BOON_SECONDS * 1000 + boon.pausedMs + Math.max(0, answerMs) + RPG_BOON_PROBLEM_SLACK_MS;
  return now - boon.grantedAt <= allowance;
}

export interface RpgShrineResult { state: RpgState; boon: RpgBoon; duplicate: boolean }
export interface RpgDoorResult { state: RpgState; doorId: string; duplicate: boolean }
