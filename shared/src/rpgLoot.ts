import { RPG_ITEMS, RPG_SKILLS, RPG_SPELLS, RPG_SCHOOLS, type RpgState, type RpgLoadout, type RpgLootInstance, type RpgSpellId, type RpgSchoolId } from './rpg';

export const RPG_MAX_ITEM_UPGRADE = 5;
export const RPG_MAX_DUNGEON_TIER = 10;
export const RPG_UPGRADE_POWER = 2;
export const RPG_MAX_LOOT_TARGETS = 2;
export const RPG_MAX_LOOT_SPELL_POWER = 12;
export const RPG_MAX_LOOT_SCHOOL_POWER = 8;

const boundedBonus = (value: number | undefined, cap: number): number => Number.isFinite(value) ? Math.max(0, Math.min(cap, Math.floor(value!))) : 0;

export interface RpgLootAffixes {
  targets: number; spellId?: RpgSpellId; spellPower: number; schoolId?: RpgSchoolId; schoolPower: number;
}
/** Shared display/combat interpretation. Read-only: old copies never gain
 * rolls, and malformed or mismatched named bonuses cannot affect a spell. */
export function rpgLootAffixes(loot?: RpgLootInstance): RpgLootAffixes {
  const result: RpgLootAffixes = { targets: 0, spellPower: 0, schoolPower: 0 };
  const item = RPG_ITEMS.find(item => item.id === loot?.itemId);
  if (!item || !loot) return result;
  result.targets = boundedBonus(loot.bonusTargets, RPG_MAX_LOOT_TARGETS);
  const spell = RPG_SPELLS.find(spell => spell.id === loot.bonusSpellId && (!item.school || item.school === spell.school));
  if (spell && boundedBonus(loot.bonusSpellPower, RPG_MAX_LOOT_SPELL_POWER)) {
    result.spellId = spell.id; result.spellPower = boundedBonus(loot.bonusSpellPower, RPG_MAX_LOOT_SPELL_POWER);
  }
  const school = RPG_SCHOOLS.find(school => school.id === loot.bonusSchoolId && (!item.school || item.school === school.id));
  if (school && boundedBonus(loot.bonusSchoolPower, RPG_MAX_LOOT_SCHOOL_POWER)) {
    result.schoolId = school.id; result.schoolPower = boundedBonus(loot.bonusSchoolPower, RPG_MAX_LOOT_SCHOOL_POWER);
  }
  return result;
}

export function rpgTier(value?: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(RPG_MAX_DUNGEON_TIER, Math.floor(value!))) : 1;
}
export function rpgUnlockedTier(state: Pick<RpgState, 'bestTier'>): number {
  return rpgTier((state.bestTier ?? 0) + 1);
}
export function rpgRoomForgeDust(tier: number, boss = false): number {
  return boss ? 10 + 3 * rpgTier(tier) : 2 + rpgTier(tier);
}
export function rpgDungeonForgeDust(tier: number): number {
  return 5 * rpgRoomForgeDust(tier) + rpgRoomForgeDust(tier, true);
}

/** Reading an old save creates stable, zero-bonus instances in memory only.
 * Item discovery IDs, XP, learned ranks, and all tutor state remain untouched. */
export function rpgNormalizeLoot(state: RpgState): RpgState {
  const loot = (state.loot ?? []).map(item => ({ ...item }));
  for (const itemId of state.inventory) {
    if (RPG_ITEMS.some(item => item.id === itemId) && !loot.some(item => item.itemId === itemId)) {
      loot.push({ id: `legacy:${itemId}`, itemId, bonusPower: 0, upgradeLevel: 0 });
    }
  }
  const equipped = loot.find(item => item.id === state.equippedLootId && item.itemId === state.equippedItemId)
    ?? loot.find(item => item.itemId === state.equippedItemId);
  const bestTier = Math.max(0, Math.min(RPG_MAX_DUNGEON_TIER, Math.floor(state.bestTier ?? (state.expeditionsCompleted > 0 ? 1 : 0))));
  return { ...state, loot, equippedLootId: equipped?.id ?? null, forgeDust: state.forgeDust ?? 0,
    bestTier, dungeonTier: Math.min(rpgTier(state.dungeonTier), rpgTier(bestTier + 1)), goal: state.goal ?? null };
}

/** Randomness is called only by the server while committing a drop receipt.
 * Power applies to every spell; the optional skill is drawn from this relic's school. */
export function rpgCreateLoot(itemId: string, tier = 1, random: () => number = Math.random): RpgLootInstance {
  const item = RPG_ITEMS.find(entry => entry.id === itemId);
  if (!item) throw new Error('Unknown relic.');
  const unit = () => { const value = random(); return Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0; };
  const level = rpgTier(tier);
  const bonusPower = Math.min(12, 1 + Math.floor(unit() * (3 + level)) + Math.floor((level - 1) / 3));
  const result: RpgLootInstance = { id: crypto.randomUUID(), itemId, bonusPower, upgradeLevel: 0 };
  if (unit() < 0.45 + (level - 1) * 0.025) {
    const skills = RPG_SKILLS.filter(skill => skill.kind !== 'unlock' && (!item.school || skill.school === item.school));
    const skill = skills[Math.floor(unit() * skills.length)];
    if (skill) { result.bonusSkillId = skill.id; result.bonusSkillRanks = level >= 4 && unit() < 0.25 ? 2 : 1; }
  }
  // Append new draws after the original power/rank sequence. Existing rolls
  // remain intact, and each new copy gets at most one specialized extra.
  if (unit() < Math.min(.9, .55 + (level - 1) * .04)) {
    const kind = Math.floor(unit() * 3);
    if (kind === 0) result.bonusTargets = level >= 5 && unit() < .12 + (level - 5) * .02 ? 2 : 1;
    else if (kind === 1) {
      const spells = RPG_SPELLS.filter(spell => (!item.school || spell.school === item.school) && (!item.spellId || item.spellId === spell.id));
      result.bonusSpellId = spells[Math.floor(unit() * spells.length)]!.id;
      result.bonusSpellPower = Math.min(RPG_MAX_LOOT_SPELL_POWER, 2 + Math.floor(unit() * (4 + level)));
    } else {
      const schools = RPG_SCHOOLS.filter(school => !item.school || school.id === item.school);
      result.bonusSchoolId = schools[Math.floor(unit() * schools.length)]!.id;
      result.bonusSchoolPower = Math.min(RPG_MAX_LOOT_SCHOOL_POWER, 1 + Math.floor(unit() * (2 + Math.ceil(level * .6))));
    }
  }
  return result;
}

export function rpgEquippedLoot(state: Pick<RpgLoadout, 'equippedItemId' | 'loot' | 'equippedLootId'>): RpgLootInstance | undefined {
  return state.loot?.find(item => item.id === state.equippedLootId && item.itemId === state.equippedItemId);
}
export function rpgLootPower(item?: RpgLootInstance): number {
  return item ? boundedBonus(item.bonusPower, 12) + boundedBonus(item.upgradeLevel, RPG_MAX_ITEM_UPGRADE) * RPG_UPGRADE_POWER : 0;
}

/** Bonus ranks may exceed a learned skill's normal cap by two. They cannot
 * unlock a skill, satisfy a tree prerequisite, or be refunded as skill points. */
export function rpgEffectiveSkills(state: Pick<RpgLoadout, 'skills' | 'equippedItemId' | 'loot' | 'equippedLootId'>): Record<string, number> {
  const ranks = Object.fromEntries(RPG_SKILLS.map(skill => [skill.id, Math.max(0, Math.min(skill.maxRank, state.skills[skill.id] ?? 0))]));
  const item = rpgEquippedLoot(state);
  const skill = RPG_SKILLS.find(entry => entry.id === item?.bonusSkillId && entry.kind !== 'unlock');
  if (skill && ranks[skill.id] > 0) ranks[skill.id] += Math.max(0, Math.min(2, item?.bonusSkillRanks ?? 0));
  return ranks;
}
export function rpgForgeCost(instance: Pick<RpgLootInstance, 'upgradeLevel'>): { gems: number; dust: number } {
  const next = Math.max(0, Math.min(RPG_MAX_ITEM_UPGRADE, instance.upgradeLevel)) + 1;
  return { gems: 25 * next, dust: 5 * next };
}
