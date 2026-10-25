import { rpgDepthSteps, type RpgCombatEnemy, type RpgCombatState, type RpgRarity, type RpgState } from './rpg';
import { rpgTier } from './rpgLoot';
import { RPG_GEAR_BASES, rpgEquippedGear, rpgGearSalvageValue, rpgGearStats, rpgMaxWard, type RpgGearInstance, type RpgGearLoadout, type RpgGearSlot } from './rpgGear';

/**
 * The hero's ward: a calm shield instead of health. Only a cast lets the
 * monsters that are still standing strike back, once each. A wrong answer, a
 * slow answer, a hint or "I don't know" never touch it. When the ward runs
 * out, the hero kneels and it refills; nothing is ever lost.
 */
export const RPG_WARD_STRIKE = { normal: 8, brute: 13 } as const;
export const RPG_WARD_ELITE = 1.5;
export const RPG_WARD_GUARDIAN = 2;
/** A ward tonic from the trader: the next fights start with this much more ward. */
export const RPG_WARD_TONIC = 25;
export const RPG_WARD_TONIC_FIGHTS = 3;
/** A fight ended with more than this share of the ward pays the steady bonus. */
export const RPG_STEADY_SHARE = .5;
export const RPG_STEADY_DUST = 2;
/** Gear the hero can keep; past it, the weakest spare copy is broken into forge dust. */
export const RPG_GEAR_STORE_CAP = 60;
/** A cleared pack drops gear this often; elites and guardians always drop it. */
export const RPG_GEAR_PACK_CHANCE = .35;
export const RPG_GEAR_CHEST_CHANCE = .4;

export interface RpgWardResult { value: number; max: number; lost: number; knelt: boolean }

/** Matches the client roster: every seventh monster is a brute; the guardian is the first of room five. */
export function rpgEnemyStrike(enemy: Pick<RpgCombatEnemy, 'id' | 'elite'>, encounterIndex: number, tier = 1, depth?: number): number {
  const index = Number(enemy.id.replace(/\D/g, '')) || 0;
  const guardian = encounterIndex === 5 && index === 0;
  const base = index % 7 === 0 ? RPG_WARD_STRIKE.brute : RPG_WARD_STRIKE.normal;
  const kind = guardian ? RPG_WARD_GUARDIAN : enemy.elite ? RPG_WARD_ELITE : 1;
  // Grows gently: 6% a tier and 10% a depth step.
  return base * kind * (1 + (rpgTier(tier) - 1) * .06 + rpgDepthSteps(depth) * .1);
}

/** The ward's most in this fight: gear, plus a tonic taken when the fight began. */
export function rpgWardMax(state: RpgGearLoadout, combat?: Pick<RpgCombatState, 'wardBonus'>): number {
  return rpgMaxWard(state) + Math.max(0, combat?.wardBonus ?? 0);
}

/** The ward to show now: a fight not yet begun starts full (with a waiting tonic). */
export function rpgWardNow(state: RpgGearLoadout & Pick<RpgState, 'expedition' | 'wardTonics'>): { value: number; max: number } {
  const combat = state.expedition && !state.expedition.cleared ? state.expedition.combat : undefined;
  if (combat?.ward !== undefined) { const max = rpgWardMax(state, combat); return { value: Math.max(0, Math.min(max, combat.ward)), max }; }
  const max = rpgMaxWard(state) + ((state.wardTonics ?? 0) > 0 ? RPG_WARD_TONIC : 0);
  return { value: max, max };
}

/**
 * The survivors strike once each after a cast. Warding softens every strike,
 * mending restores a little, and an empty ward refills to full (knelt).
 */
export function rpgWardCounterstrike(input: {
  ward: number; max: number; survivors: readonly Pick<RpgCombatEnemy, 'id' | 'elite' | 'hp'>[];
  encounterIndex: number; tier?: number; depth?: number; warding?: number; wardMend?: number;
}): RpgWardResult {
  const max = Math.max(1, Math.round(input.max));
  const ward = Math.max(0, Math.min(max, Math.round(input.ward)));
  const living = input.survivors.filter(enemy => enemy.hp > 0);
  if (!living.length) return { value: ward, max, lost: 0, knelt: false };
  const soften = 1 - Math.max(0, Math.min(50, input.warding ?? 0)) / 100;
  const raw = living.reduce((total, enemy) => total + rpgEnemyStrike(enemy, input.encounterIndex, input.tier, input.depth), 0);
  const lost = Math.max(1, Math.round(raw * soften));
  if (ward - lost <= 0) return { value: max, max, lost, knelt: true };
  return { value: Math.min(max, ward - lost + Math.max(0, Math.round(input.wardMend ?? 0))), max, lost, knelt: false };
}

/** Forge dust for a fight cleared with more than half the ward. */
export function rpgSteadyDust(ward: number, max: number, depth?: number): number {
  return ward > max * RPG_STEADY_SHARE ? RPG_STEADY_DUST + rpgDepthSteps(depth) : 0;
}

/** Dust found grows with gear (capped in rpgGearStats). Returns the extra only. */
export function rpgDustFindBonus(state: RpgGearLoadout, dust: number): number {
  return dust > 0 ? Math.round(dust * rpgGearStats(state).dustFind / 100) : 0;
}

/** Run speed multiplier from boots and other gear (client only). */
export function rpgGearRunSpeed(state: RpgGearLoadout): number { return 1 + rpgGearStats(state).speed / 100; }

/** Old saves have no gear: they load with an empty bag; stale or mismatched slots are dropped. Returns a copy. */
export function rpgNormalizeGear<T extends RpgGearLoadout>(state: T): T {
  const gear = Array.isArray(state.gear)
    ? state.gear.filter(item => item && typeof item.id === 'string' && RPG_GEAR_BASES.some(base => base.id === item.baseId)).map(item => ({ ...item, stats: { ...item.stats } }))
    : [];
  const equippedGear: Partial<Record<RpgGearSlot, string>> = {};
  for (const [slot, item] of Object.entries(rpgEquippedGear({ gear, equippedGear: state.equippedGear ?? {} })) as [RpgGearSlot, RpgGearInstance][]) equippedGear[slot] = item.id;
  return { ...state, gear, equippedGear };
}

const RARITY_ORDER: Record<RpgRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

/**
 * Adds a new copy to the bag. When the bag is full, the oldest spare copy of
 * the lowest rarity is broken into forge dust first, so a new find always
 * fits. Never touches worn copies. Mutates `state`.
 */
export function rpgStoreGear(state: RpgGearLoadout & { forgeDust?: number }, item: RpgGearInstance, cap = RPG_GEAR_STORE_CAP): { salvaged?: RpgGearInstance; dust: number } {
  state.gear ??= [];
  let salvaged: RpgGearInstance | undefined, dust = 0;
  if (state.gear.length >= cap) {
    const worn = new Set(Object.values(state.equippedGear ?? {}));
    const spare = state.gear.filter(entry => !worn.has(entry.id));
    const lowest = Math.min(...spare.map(entry => RARITY_ORDER[entry.rarity] ?? 0));
    salvaged = spare.find(entry => (RARITY_ORDER[entry.rarity] ?? 0) === lowest);
    if (salvaged) {
      const gone = salvaged.id;
      state.gear = state.gear.filter(entry => entry.id !== gone);
      dust = rpgGearSalvageValue(salvaged);
      state.forgeDust = (state.forgeDust ?? 0) + dust;
    }
  }
  state.gear.push(item);
  return { salvaged, dust };
}
