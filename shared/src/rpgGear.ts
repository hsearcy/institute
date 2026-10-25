import type { RpgRarity, RpgSchoolId } from './rpg';
import { rpgTier } from './rpgLoot';

/**
 * Armour and jewellery: the hero's Diablo-style paper doll. The weapon stays a
 * relic (rpg.ts / rpgLoot.ts); gear fills seven more slots. Gear never makes a
 * problem harder or timed: it changes how much the hero's ward holds, how fast
 * the hero runs, how hard spells hit and how much forge dust falls.
 */
export type RpgGearKind = 'helm' | 'chest' | 'gloves' | 'boots' | 'amulet' | 'ring';
export type RpgGearSlot = 'helm' | 'chest' | 'gloves' | 'boots' | 'amulet' | 'ring1' | 'ring2';
export const RPG_GEAR_SLOTS: readonly RpgGearSlot[] = ['helm', 'chest', 'gloves', 'boots', 'amulet', 'ring1', 'ring2'];
export const rpgGearSlotKind = (slot: RpgGearSlot): RpgGearKind => slot === 'ring1' || slot === 'ring2' ? 'ring' : slot;

/**
 * - ward: more ward (the shield monsters wear down); flat points.
 * - warding: percent less ward lost to each monster strike (capped in total).
 * - wardMend: ward restored after each cast; flat points.
 * - speed: percent faster running (capped in total).
 * - power: damage added to every attack, per enemy hit.
 * - ember / frost / storm: damage added to that school's attacks, per enemy hit.
 * - dustFind: percent more forge dust from fights and chests.
 */
export type RpgGearStat = 'ward' | 'warding' | 'wardMend' | 'speed' | 'power' | RpgSchoolId | 'dustFind';
export type RpgGearStats = Partial<Record<RpgGearStat, number>>;
export const RPG_GEAR_STAT_IDS: readonly RpgGearStat[] = ['ward', 'warding', 'wardMend', 'speed', 'power', 'ember', 'frost', 'storm', 'dustFind'];

/** Child-facing wording for each stat, as "+12 ward". */
export const RPG_GEAR_STAT_LABELS: Readonly<Record<RpgGearStat, { label: string; percent: boolean }>> = {
  ward: { label: 'ward', percent: false },
  warding: { label: 'less ward lost', percent: true },
  wardMend: { label: 'ward mended each spell', percent: false },
  speed: { label: 'run speed', percent: true },
  power: { label: 'damage to every attack', percent: false },
  ember: { label: 'Flame damage', percent: false },
  frost: { label: 'Frost damage', percent: false },
  storm: { label: 'Storm damage', percent: false },
  dustFind: { label: 'forge dust found', percent: true },
};

/** Totals the whole doll can reach; more gear past these does nothing. */
export const RPG_GEAR_CAPS: Readonly<Partial<Record<RpgGearStat, number>>> = { warding: 50, speed: 30, dustFind: 100 };

export const RPG_WARD_BASE = 100;

export interface RpgGearBase {
  id: string; kind: RpgGearKind; name: string;
  /** The lowest dungeon tier it drops at. */
  minTier: number;
  /** Stats every copy has, at tier 1; they grow with tier. */
  implicit: RpgGearStats;
}

export const RPG_GEAR_BASES: readonly RpgGearBase[] = [
  { id: 'leather_cap', kind: 'helm', name: 'Leather Cap', minTier: 1, implicit: { ward: 8 } },
  { id: 'iron_helm', kind: 'helm', name: 'Iron Helm', minTier: 3, implicit: { ward: 14 } },
  { id: 'rune_circlet', kind: 'helm', name: 'Rune Circlet', minTier: 5, implicit: { ward: 10, power: 1 } },
  { id: 'padded_tunic', kind: 'chest', name: 'Padded Tunic', minTier: 1, implicit: { ward: 14 } },
  { id: 'scale_mail', kind: 'chest', name: 'Scale Mail', minTier: 3, implicit: { ward: 22, warding: 3 } },
  { id: 'warden_plate', kind: 'chest', name: 'Warden Plate', minTier: 6, implicit: { ward: 30, warding: 5 } },
  { id: 'cloth_wraps', kind: 'gloves', name: 'Cloth Wraps', minTier: 1, implicit: { power: 1 } },
  { id: 'iron_gauntlets', kind: 'gloves', name: 'Iron Gauntlets', minTier: 3, implicit: { ward: 6, power: 1 } },
  { id: 'spellweave_gloves', kind: 'gloves', name: 'Spellweave Gloves', minTier: 5, implicit: { power: 2 } },
  { id: 'soft_boots', kind: 'boots', name: 'Soft Boots', minTier: 1, implicit: { speed: 4 } },
  { id: 'traveler_boots', kind: 'boots', name: "Traveler's Boots", minTier: 3, implicit: { speed: 6, ward: 4 } },
  { id: 'windstep_boots', kind: 'boots', name: 'Windstep Boots', minTier: 5, implicit: { speed: 9 } },
  { id: 'bone_charm', kind: 'amulet', name: 'Bone Charm', minTier: 1, implicit: { wardMend: 2 } },
  { id: 'star_pendant', kind: 'amulet', name: 'Star Pendant', minTier: 3, implicit: { power: 1, wardMend: 2 } },
  { id: 'heart_amulet', kind: 'amulet', name: 'Heartstone Amulet', minTier: 6, implicit: { ward: 12, wardMend: 3 } },
  { id: 'copper_ring', kind: 'ring', name: 'Copper Ring', minTier: 1, implicit: { dustFind: 5 } },
  { id: 'silver_band', kind: 'ring', name: 'Silver Band', minTier: 3, implicit: { power: 1 } },
  { id: 'moon_signet', kind: 'ring', name: 'Moon Signet', minTier: 5, implicit: { dustFind: 8, power: 1 } },
];

/** Extra stats a magic, rare or legendary copy rolls; `max` is at tier 1 and grows by `perTier`. */
export interface RpgGearAffix { stat: RpgGearStat; kinds: readonly RpgGearKind[]; min: number; max: number; perTier: number; prefix: string; suffix: string }
export const RPG_GEAR_AFFIXES: readonly RpgGearAffix[] = [
  { stat: 'ward', kinds: ['helm', 'chest', 'gloves', 'boots', 'amulet', 'ring'], min: 4, max: 10, perTier: 2, prefix: 'Sturdy', suffix: 'of the Bulwark' },
  { stat: 'warding', kinds: ['helm', 'chest', 'amulet'], min: 2, max: 5, perTier: .5, prefix: 'Warded', suffix: 'of Shelter' },
  { stat: 'wardMend', kinds: ['chest', 'amulet', 'ring'], min: 1, max: 3, perTier: .5, prefix: 'Mending', suffix: 'of Renewal' },
  { stat: 'speed', kinds: ['boots'], min: 3, max: 6, perTier: .5, prefix: 'Swift', suffix: 'of the Wind' },
  { stat: 'power', kinds: ['gloves', 'amulet', 'ring', 'helm'], min: 1, max: 2, perTier: .3, prefix: 'Mighty', suffix: 'of Might' },
  { stat: 'ember', kinds: ['gloves', 'amulet', 'ring', 'helm'], min: 1, max: 3, perTier: .4, prefix: 'Burning', suffix: 'of Embers' },
  { stat: 'frost', kinds: ['gloves', 'amulet', 'ring', 'helm'], min: 1, max: 3, perTier: .4, prefix: 'Frozen', suffix: 'of Winter' },
  { stat: 'storm', kinds: ['gloves', 'amulet', 'ring', 'helm'], min: 1, max: 3, perTier: .4, prefix: 'Crackling', suffix: 'of Storms' },
  { stat: 'dustFind', kinds: ['ring', 'amulet', 'gloves'], min: 4, max: 10, perTier: 1, prefix: 'Lucky', suffix: 'of Fortune' },
];

/** A dropped copy of a base. Saved as rolled; never rerolled by reading it. */
export interface RpgGearInstance {
  id: string; baseId: string; kind: RpgGearKind; rarity: RpgRarity; tier: number; name: string;
  /** Implicit and rolled stats together. */
  stats: RpgGearStats;
}

/** Saved on RpgState: owned gear and which copy fills each slot. */
export interface RpgGearLoadout { gear?: RpgGearInstance[]; equippedGear?: Partial<Record<RpgGearSlot, string>> }

/** Affix count by rarity: common none, rare one or two, epic two or three, legendary three or four. */
const AFFIXES: Record<RpgRarity, [number, number]> = { common: [0, 0], rare: [1, 2], epic: [2, 3], legendary: [3, 4] };

/** Rarity odds; elites and bosses roll better. */
export function rpgRollGearRarity(random: () => number, tier: number, better = false): RpgRarity {
  const roll = random(), lift = Math.min(.12, (rpgTier(tier) - 1) * .012) + (better ? .15 : 0);
  return roll < .03 + lift * .5 ? 'legendary' : roll < .14 + lift ? 'epic' : roll < .45 + lift ? 'rare' : 'common';
}

/** Creates one copy of a gear base at a tier. `random` must return [0, 1). */
export function rpgCreateGear(baseId: string, tier = 1, random: () => number = Math.random, rarity: RpgRarity = rpgRollGearRarity(random, tier)): RpgGearInstance {
  const base = RPG_GEAR_BASES.find(entry => entry.id === baseId);
  if (!base) throw new Error('Unknown gear.');
  const unit = () => { const value = random(); return Number.isFinite(value) ? Math.max(0, Math.min(.999999999, value)) : 0; };
  const level = rpgTier(tier), growth = 1 + (level - 1) * .12;
  const stats: RpgGearStats = {};
  for (const [stat, value] of Object.entries(base.implicit) as [RpgGearStat, number][]) stats[stat] = Math.max(1, Math.round(value * growth));
  const [least, most] = AFFIXES[rarity];
  const count = least + Math.floor(unit() * (most - least + 1));
  const pool = RPG_GEAR_AFFIXES.filter(affix => affix.kinds.includes(base.kind));
  const chosen: RpgGearAffix[] = [];
  while (chosen.length < count && chosen.length < pool.length) {
    const affix = pool[Math.floor(unit() * pool.length)]!;
    if (!chosen.includes(affix)) chosen.push(affix);
  }
  for (const affix of chosen) {
    const top = affix.max + affix.perTier * (level - 1);
    const value = Math.max(1, Math.round(affix.min + unit() * (top - affix.min)));
    stats[affix.stat] = (stats[affix.stat] ?? 0) + value;
  }
  // Names read like Diablo's: "Swift Soft Boots of the Wind"; legendary copies keep their base name with a title.
  const first = chosen[0], second = chosen[1];
  const name = rarity === 'legendary' ? `${base.name} of Legend`
    : `${first ? `${first.prefix} ` : ''}${base.name}${second ? ` ${second.suffix}` : ''}`;
  return { id: crypto.randomUUID(), baseId, kind: base.kind, rarity, tier: level, name, stats };
}

/** A random base of a kind (or any kind) that drops at this tier. */
export function rpgPickGearBase(random: () => number, tier: number, kind?: RpgGearKind): RpgGearBase {
  const level = rpgTier(tier);
  const pool = RPG_GEAR_BASES.filter(base => base.minTier <= level && (!kind || base.kind === kind));
  return pool[Math.floor(Math.max(0, Math.min(.999999999, random())) * pool.length)] ?? RPG_GEAR_BASES[0]!;
}

/** Equipped copies by slot; stale ids and wrong kinds are ignored. */
export function rpgEquippedGear(state: RpgGearLoadout): Partial<Record<RpgGearSlot, RpgGearInstance>> {
  const result: Partial<Record<RpgGearSlot, RpgGearInstance>> = {}, used = new Set<string>();
  for (const slot of RPG_GEAR_SLOTS) {
    const id = state.equippedGear?.[slot], item = id ? state.gear?.find(entry => entry.id === id) : undefined;
    // One copy fills one slot: the same ring cannot be worn on both hands.
    if (item && item.kind === rpgGearSlotKind(slot) && !used.has(item.id)) { result[slot] = item; used.add(item.id); }
  }
  return result;
}

/** Totals of every equipped stat, after caps. */
export function rpgGearStats(state: RpgGearLoadout): Record<RpgGearStat, number> {
  const totals = Object.fromEntries(RPG_GEAR_STAT_IDS.map(stat => [stat, 0])) as Record<RpgGearStat, number>;
  for (const item of Object.values(rpgEquippedGear(state))) for (const [stat, value] of Object.entries(item!.stats) as [RpgGearStat, number][]) totals[stat] += value;
  for (const [stat, cap] of Object.entries(RPG_GEAR_CAPS) as [RpgGearStat, number][]) totals[stat] = Math.min(cap, totals[stat]);
  return totals;
}

export function rpgMaxWard(state: RpgGearLoadout): number { return RPG_WARD_BASE + rpgGearStats(state).ward; }
