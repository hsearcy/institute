import type { RpgState } from './rpg';

/**
 * Elite packs and breakable props. Pure rules shared by the server, which
 * decides them, and the client, which only shows them.
 */

/** Rooms that may hold an elite. The first room stays gentle; the guardian's room has the boss. */
export const RPG_ELITE_ROOMS: readonly number[] = [1, 2, 3, 4];
/** An elite has this much more health than the enemy it replaces. */
export const RPG_ELITE_HP_MULTIPLIER = 2.2;

/** Stable 32-bit hash of a string, so an expedition always has the same elites. */
function hashText(text: string): number {
  let n = 2166136261;
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
  n ^= n >>> 13; n = Math.imul(n, 0x5bd1e995); n ^= n >>> 15;
  return n >>> 0;
}

/** True when this room of this expedition holds an elite: about half of rooms 1 to 4. */
export function rpgEliteRoom(expeditionId: string | undefined, room: number): boolean {
  if (!expeditionId || !RPG_ELITE_ROOMS.includes(room)) return false;
  return hashText(`${expeditionId}:elite:${room}`) % 100 < 50;
}

export function rpgEliteMaxHp(baseHp: number): number {
  return Math.ceil(baseHp * RPG_ELITE_HP_MULTIPLIER);
}

/** Breakables pay forge dust only rarely, and only up to these limits. Math stays the main source. */
export const RPG_BREAKABLE_DUST = 1;
export const RPG_BREAKABLE_DUST_CHANCE = .3;
export const RPG_BREAKABLE_DUST_PER_EXPEDITION = 5;
export const RPG_BREAKABLE_DUST_PER_DAY = 15;
/** Receipts kept for one expedition; later breaks still shatter but pay nothing and store nothing. */
export const RPG_BREAKABLES_PER_EXPEDITION = 60;

export interface RpgBreakReward { breakableId: string; forgeDust: number }
export interface RpgBreakResult { state: RpgState; reward: RpgBreakReward; duplicate: boolean }
