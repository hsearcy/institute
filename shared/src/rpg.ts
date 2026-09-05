/** Presentation/game progression only. Never used by tutor selection or mastery. */
export type RpgSpellId = 'ember' | 'frost' | 'storm';
export type RpgRarity = 'common' | 'rare' | 'epic' | 'legendary';
export interface RpgSpell { id: RpgSpellId; name: string; description: string; color: string; skillId: string | null }
export const RPG_SPELLS: readonly RpgSpell[] = [
  { id: 'ember', name: 'Fire Nova', description: 'A ring of flame sweeps through the horde.', color: '#ff994f', skillId: null },
  { id: 'frost', name: 'Frostfall', description: 'Ice crystals burst across the dungeon.', color: '#80ddff', skillId: 'frost' },
  { id: 'storm', name: 'Chain Lightning', description: 'Lightning leaps from monster to monster.', color: '#c3a1ff', skillId: 'storm' },
];
export interface RpgSkill { id: string; name: string; description: string; spellId: RpgSpellId; parentId: string | null; level: number; maxRank: number }
export const RPG_SKILLS: readonly RpgSkill[] = [
  { id: 'ember_power', name: 'Wildfire', description: 'Fire Nova defeats 2 more monsters per rank.', spellId: 'ember', parentId: null, level: 2, maxRank: 3 },
  { id: 'ember_echo', name: 'Twin Nova', description: 'A second ring of fire. Defeat 4 more monsters.', spellId: 'ember', parentId: 'ember_power', level: 4, maxRank: 1 },
  { id: 'ember_master', name: 'Phoenix Heart', description: 'Golden fire. Defeat 6 more monsters per rank.', spellId: 'ember', parentId: 'ember_echo', level: 6, maxRank: 2 },
  { id: 'frost', name: 'Frostfall', description: 'Unlock the Frostfall spell.', spellId: 'frost', parentId: null, level: 2, maxRank: 1 },
  { id: 'frost_shards', name: 'Crystal Shards', description: 'Frostfall defeats 3 more monsters per rank.', spellId: 'frost', parentId: 'frost', level: 3, maxRank: 3 },
  { id: 'frost_master', name: 'Winter Crown', description: 'A towering ice burst. Defeat 6 more monsters per rank.', spellId: 'frost', parentId: 'frost_shards', level: 6, maxRank: 2 },
  { id: 'storm', name: 'Chain Lightning', description: 'Unlock the Chain Lightning spell.', spellId: 'storm', parentId: null, level: 3, maxRank: 1 },
  { id: 'storm_chain', name: 'Thunder Web', description: 'Lightning defeats 3 more monsters per rank.', spellId: 'storm', parentId: 'storm', level: 4, maxRank: 3 },
  { id: 'storm_master', name: 'Tempest', description: 'A storm of bolts. Defeat 6 more monsters per rank.', spellId: 'storm', parentId: 'storm_chain', level: 6, maxRank: 2 },
];
export interface RpgRegion { id: string; name: string; subtitle: string; color: string; requiredClears: number; bossName: string }
export const RPG_REGIONS: readonly RpgRegion[] = [
  { id: 'embercrypt', name: 'The Embercrypt', subtitle: 'Break the curse beneath the old keep', color: '#ff9f51', requiredClears: 0, bossName: 'The Hollow King' },
  { id: 'frostvault', name: 'Frostbound Vault', subtitle: 'Awaken the frozen halls', color: '#74d9ff', requiredClears: 1, bossName: 'The Crystal Warden' },
  { id: 'stormspire', name: 'The Storm Spire', subtitle: 'Climb into the heart of the storm', color: '#bb9cff', requiredClears: 3, bossName: 'The Thunder Colossus' },
];
export interface RpgItem { id: string; name: string; rarity: RpgRarity; description: string; power: number; effect?: 'burn' | 'ice-shards' | 'chain' | 'echo'; spellId: RpgSpellId | null }
export const RPG_ITEMS: readonly RpgItem[] = [
  { id: 'apprentice', name: "Apprentice's Runeblade", rarity: 'common', description: 'Your first spark of adventure.', power: 0, spellId: null },
  { id: 'cinderwand', name: 'Cinderbranch', rarity: 'rare', description: 'Fire Nova catches 3 more monsters.', power: 3, effect: 'burn', spellId: 'ember' },
  { id: 'glacier', name: 'Glacier Fang', rarity: 'rare', description: 'Frostfall catches 3 more monsters.', power: 3, effect: 'ice-shards', spellId: 'frost' },
  { id: 'thunderrod', name: 'Thunder Rod', rarity: 'rare', description: 'Lightning catches 3 more monsters.', power: 3, effect: 'chain', spellId: 'storm' },
  { id: 'moonstaff', name: 'Moonshard Staff', rarity: 'epic', description: 'Every spell catches 4 more monsters.', power: 4, spellId: null },
  { id: 'phoenix', name: 'Phoenix Scepter', rarity: 'legendary', description: 'Fire Nova catches 8 more monsters.', power: 8, effect: 'echo', spellId: 'ember' },
  { id: 'wintercrown', name: 'Staff of Endless Winter', rarity: 'legendary', description: 'Frostfall catches 8 more monsters.', power: 8, effect: 'ice-shards', spellId: 'frost' },
  { id: 'tempest', name: 'Tempest Caller', rarity: 'legendary', description: 'Lightning catches 8 more monsters.', power: 8, effect: 'chain', spellId: 'storm' },
];
export interface RpgExpedition { id: string; regionId: string; encounterIndex: number; encountersTotal: number; cleared: boolean; startedAt: number }
export interface RpgState {
  profileId: string; xp: number; level: number; xpIntoLevel: number; xpForNextLevel: number; skillPoints: number;
  skills: Record<string, number>; inventory: string[]; equippedItemId: string; selectedSpellId: RpgSpellId;
  totalKills: number; expeditionsCompleted: number; expedition: RpgExpedition | null;
}
export interface RpgReward { xp: number; kills: number; levelUp: boolean; levelsGained: number; item: RpgItem | null; newItems: RpgItem[]; duplicateItem: boolean; bossDefeated: boolean; spellId: RpgSpellId }
export interface RpgResolveResult { state: RpgState; reward: RpgReward; duplicate: boolean }
/** Increasing XP curve: first level after three encounters, no daily cap. */
export function rpgLevel(xp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number } {
  let level = 1;
  let remaining = Math.max(0, xp);
  while (remaining >= 90 + (level - 1) * 45) { remaining -= 90 + (level - 1) * 45; level++; }
  return { level, xpIntoLevel: remaining, xpForNextLevel: 90 + (level - 1) * 45 };
}
export function rpgSpellUnlocked(spellId: RpgSpellId, skills: Record<string, number>): boolean {
  const spell = RPG_SPELLS.find((entry) => entry.id === spellId);
  return !!spell && (!spell.skillId || (skills[spell.skillId] ?? 0) > 0);
}

/** Shared presentation count keeps visible hordes and authoritative rewards aligned. */
export function rpgEncounterKills(state: Pick<RpgState, 'skills' | 'equippedItemId' | 'selectedSpellId'>, encounterIndex: number, spellId = state.selectedSpellId): number {
  const item = RPG_ITEMS.find((entry) => entry.id === state.equippedItemId);
  const gearPower = item && (!item.spellId || item.spellId === spellId) ? item.power : 0;
  const skillPower = RPG_SKILLS.filter((skill) => skill.spellId === spellId).reduce((total, skill) => {
    const rank = state.skills[skill.id] ?? 0;
    const power = skill.id.endsWith('master') ? 6 : skill.id === 'ember_echo' ? 4 : skill.id === 'ember_power' ? 2 : skill.parentId ? 3 : 0;
    return total + rank * power;
  }, 0);
  return (encounterIndex === 5 ? 24 : 12 + encounterIndex * 2) + gearPower + skillPower;
}
