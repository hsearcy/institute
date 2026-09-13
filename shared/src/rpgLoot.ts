import { RPG_ITEMS, RPG_SKILLS, RPG_SPELLS, RPG_SCHOOLS, type RpgState, type RpgLoadout, type RpgLootInstance, type RpgSpellId, type RpgSchoolId, type RpgSpellShape, type RpgCombatAffix } from './rpg';

export const RPG_MAX_ITEM_UPGRADE = 5;
export const RPG_MAX_DUNGEON_TIER = 10;
export const RPG_UPGRADE_POWER = 2;
export const RPG_MAX_LOOT_TARGETS = 2;
export const RPG_MAX_LOOT_SPELL_POWER = 12;
export const RPG_MAX_LOOT_SCHOOL_POWER = 8;

const boundedBonus = (value: number | undefined, cap: number): number => Number.isFinite(value) ? Math.max(0, Math.min(cap, Math.floor(value!))) : 0;

/** A temporary equipment rank, including direct spell unlock ranks. The
 * original serialized roll is never changed by reading this normalized value. */
export function rpgLootSkillBonus(loot?: RpgLootInstance): { skillId: string; ranks: number } | undefined {
  if (!loot || !RPG_ITEMS.some(item => item.id === loot.itemId)) return undefined;
  const skill = RPG_SKILLS.find(skill => skill.id === loot.bonusSkillId);
  const ranks = boundedBonus(loot.bonusSkillRanks, 2);
  return skill && ranks ? { skillId: skill.id, ranks } : undefined;
}

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
export function rpgCreateLoot(itemId: string, tier = 1, random: () => number = Math.random, boss = false): RpgLootInstance {
  const item = RPG_ITEMS.find(entry => entry.id === itemId);
  if (!item) throw new Error('Unknown relic.');
  const unit = () => { const value = random(); return Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0; };
  const level = rpgTier(tier);
  const bonusPower = Math.min(12, (boss ? 4 : 1) + Math.floor(unit() * (3 + level)) + Math.floor((level - 1) / 3));
  const result: RpgLootInstance = { id: crypto.randomUUID(), itemId, bonusPower, upgradeLevel: 0 };
  const progress = (level - 1) / 9;
  if (unit() < .20 + progress * .10 && boss) {
    const skills = RPG_SKILLS.filter(skill => skill.kind === 'modifier' && (!item.school || skill.school === item.school));
    const skill = skills[Math.floor(unit() * skills.length)];
    if (skill) { result.bonusSkillId = skill.id; result.bonusSkillRanks = skill.kind !== 'unlock' && level >= 4 && unit() < 0.25 ? 2 : 1; }
  }
  // Normal drops keep broad power and coverage. Spell-changing traits and
  // temporary modifier ranks are boss-only. Saved receipts never reroll.
  const extra = unit(), targetChance = .25 + progress * .10, schoolChance = .25 + progress * .15;
  if (extra < targetChance) result.bonusTargets = level >= 5 && unit() < .12 + (level - 5) * .02 ? 2 : 1;
  else if (extra < targetChance + schoolChance) {
    const schools = RPG_SCHOOLS.filter(school => !item.school || school.id === item.school);
    result.bonusSchoolId = schools[Math.floor(unit() * schools.length)]!.id;
    result.bonusSchoolPower = Math.min(RPG_MAX_LOOT_SCHOOL_POWER, 1 + Math.floor(unit() * (2 + Math.ceil(level * .6))));
  }
  if (boss) {
    // Every boss copy has a useful non-power trait. Spell shapes are a separate
    // 40% roll, chosen within the weapon's school.
    result.combatAffix = unit() < .5 ? 'opening-strike' : 'boss-slayer';
    if (unit() < .4) {
      const shapes = RPG_SPELL_SHAPES.filter(shape => !item.school || shape.school === item.school);
      result.spellShape = shapes[Math.floor(unit() * shapes.length)]!.id;
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

/** Equipped ranks work immediately, including unlearned skills. They may
 * exceed a learned cap by two, but never purchase permanent tree ranks,
 * satisfy tree prerequisites, or become refundable skill points. */
export function rpgEffectiveSkills(state: Pick<RpgLoadout, 'skills' | 'equippedItemId' | 'loot' | 'equippedLootId'>): Record<string, number> {
  const ranks = Object.fromEntries(RPG_SKILLS.map(skill => [skill.id, boundedBonus(state.skills[skill.id], skill.maxRank)]));
  const bonus = rpgLootSkillBonus(rpgEquippedLoot(state));
  if (bonus) ranks[bonus.skillId] += bonus.ranks;
  return ranks;
}
export function rpgForgeCost(instance: Pick<RpgLootInstance, 'upgradeLevel'>): { gems: number; dust: number } {
  const next = Math.max(0, Math.min(RPG_MAX_ITEM_UPGRADE, instance.upgradeLevel)) + 1;
  return { gems: 25 * next, dust: 5 * next };
}


export const RPG_SPELL_SHAPES: readonly { id: RpgSpellShape; spellId: RpgSpellId; school: RpgSchoolId; label: string }[] = [
  { id: 'twin-orb', spellId: 'ball_lightning', school: 'storm', label: 'Ball Lightning: +1 orb · +30% spell damage' },
  { id: 'meteor-shower', spellId: 'meteor', school: 'ember', label: 'Meteor: +1 meteor · +30% spell damage' },
  { id: 'split-lance', spellId: 'ice_lance', school: 'frost', label: 'Ice Lance: twin spears · +30% spell damage' },
];
/** Validate saved traits in one place for combat, effects, and item labels. */
export function rpgLootSpellShape(loot?: RpgLootInstance) {
  const item = RPG_ITEMS.find(item => item.id === loot?.itemId);
  return item ? RPG_SPELL_SHAPES.find(shape => shape.id === loot?.spellShape && (!item.school || shape.school === item.school)) : undefined;
}
export function rpgLootCombatAffix(loot?: RpgLootInstance): RpgCombatAffix | undefined {
  return RPG_ITEMS.some(item => item.id === loot?.itemId) && (loot?.combatAffix === 'opening-strike' || loot?.combatAffix === 'boss-slayer') ? loot.combatAffix : undefined;
}

/** Independent rolls, made only when the server commits a boss clear. */
export function rpgRollBossBonus(random: () => number = Math.random): { bossCrazyCoins: number; bossDimes: number } {
  const wins = () => { const roll = random(); return Number.isFinite(roll) && roll >= 0 && roll < .1 ? 1 : 0; };
  return { bossCrazyCoins: wins(), bossDimes: wins() };
}
