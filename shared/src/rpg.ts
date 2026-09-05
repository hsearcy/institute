/** Adventure content only. Never used by tutor selection, mastery, or review. */
export const RPG_SPELL_IDS = ['ember', 'cleave', 'meteor', 'phoenix_dive', 'firestorm', 'frost', 'ice_lance', 'glacial_surge', 'blizzard', 'frost_guardian', 'storm', 'arc_lance', 'thunderclap', 'ball_lightning', 'tempest'] as const;
export type RpgSpellId = typeof RPG_SPELL_IDS[number];
export type RpgSchoolId = 'ember' | 'frost' | 'storm';
export type RpgRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type RpgSpellEffect = 'nova' | 'cleave' | 'meteor' | 'phoenix-dive' | 'firestorm' | 'frostfall' | 'ice-lance' | 'glacial-surge' | 'blizzard' | 'frost-guardian' | 'chain-lightning' | 'arc-lance' | 'thunderclap' | 'ball-lightning' | 'tempest';
export type RpgModifier = 'burn' | 'ice-shards' | 'chain' | 'echo' | 'pierce' | 'wide' | 'orbit' | 'summon';
export const RPG_SCHOOLS: readonly { id: RpgSchoolId; name: string; description: string; color: string }[] = [
  { id: 'ember', name: 'Flame', description: 'Sweeping blades, falling stars, and phoenix fire.', color: '#ff994f' },
  { id: 'frost', name: 'Frost', description: 'Piercing lances, rolling glaciers, and ice guardians.', color: '#80ddff' },
  { id: 'storm', name: 'Storm', description: 'Leaping bolts, thunder rings, and roaming lightning.', color: '#c3a1ff' },
];
export interface RpgSpell { id: RpgSpellId; school: RpgSchoolId; name: string; description: string; color: string; skillId: string | null; effect: RpgSpellEffect; power: number }
export const RPG_SPELLS: readonly RpgSpell[] = [
  { id: 'ember', school: 'ember', name: 'Fire Nova', description: 'Send a ring of flame outward in every direction.', color: '#ff994f', skillId: null, effect: 'nova', power: 0 },
  { id: 'cleave', school: 'ember', name: 'Flame Cleave', description: 'Sweep your runeblade through a burning arc. Catch 2 extra monsters.', color: '#ffb46d', skillId: null, effect: 'cleave', power: 2 },
  { id: 'meteor', school: 'ember', name: 'Meteor', description: 'Call down a blazing rock that bursts on impact. Catch 6 extra monsters.', color: '#ff7849', skillId: 'meteor', effect: 'meteor', power: 6 },
  { id: 'phoenix_dive', school: 'ember', name: 'Phoenix Dive', description: 'Become a fiery phoenix and charge through the horde. Catch 8 extra monsters.', color: '#ffc264', skillId: 'phoenix_dive', effect: 'phoenix-dive', power: 8 },
  { id: 'firestorm', school: 'ember', name: 'Firestorm', description: 'Raise a field of flame pillars that erupt in sequence. Catch 12 extra monsters.', color: '#ff653d', skillId: 'firestorm', effect: 'firestorm', power: 12 },
  { id: 'frost', school: 'frost', name: 'Frostfall', description: 'Bring down ice crystals across the entire horde.', color: '#80ddff', skillId: 'frost', effect: 'frostfall', power: 0 },
  { id: 'ice_lance', school: 'frost', name: 'Ice Lance', description: 'Launch a long ice spear that pierces a row of monsters. Catch 3 extra monsters.', color: '#c0f4ff', skillId: 'ice_lance', effect: 'ice-lance', power: 3 },
  { id: 'glacial_surge', school: 'frost', name: 'Glacial Surge', description: 'Roll a wall of ice forward through the dungeon. Catch 6 extra monsters.', color: '#6dc9ff', skillId: 'glacial_surge', effect: 'glacial-surge', power: 6 },
  { id: 'blizzard', school: 'frost', name: 'Blizzard', description: 'Cover the battlefield in a swirling hailstorm. Catch 9 extra monsters.', color: '#b8ebff', skillId: 'blizzard', effect: 'blizzard', power: 9 },
  { id: 'frost_guardian', school: 'frost', name: 'Frost Guardian', description: 'Summon an ice giant to smash the horde for you. Catch 12 extra monsters.', color: '#62e0ec', skillId: 'frost_guardian', effect: 'frost-guardian', power: 12 },
  { id: 'storm', school: 'storm', name: 'Chain Lightning', description: 'Send lightning leaping from one monster to the next.', color: '#c3a1ff', skillId: 'storm', effect: 'chain-lightning', power: 0 },
  { id: 'arc_lance', school: 'storm', name: 'Arc Lance', description: 'Fire a focused lightning beam through the horde. Catch 3 extra monsters.', color: '#a9c9ff', skillId: 'arc_lance', effect: 'arc-lance', power: 3 },
  { id: 'thunderclap', school: 'storm', name: 'Thunderclap', description: 'Strike the ground and blast monsters with thunder rings. Catch 6 extra monsters.', color: '#e4bbff', skillId: 'thunderclap', effect: 'thunderclap', power: 6 },
  { id: 'ball_lightning', school: 'storm', name: 'Ball Lightning', description: 'Release a roaming orb that zaps monsters as it passes. Catch 9 extra monsters.', color: '#bcadff', skillId: 'ball_lightning', effect: 'ball-lightning', power: 9 },
  { id: 'tempest', school: 'storm', name: 'Tempest', description: 'Summon a storm overhead and rain down lightning bolts. Catch 12 extra monsters.', color: '#efcaff', skillId: 'tempest', effect: 'tempest', power: 12 },
];
export interface RpgSkill {
  id: string; name: string; description: string; school: RpgSchoolId; spellId: RpgSpellId;
  parentId: string | null; level: number; maxRank: number; kind: 'unlock' | 'power' | 'modifier';
  scope: 'school' | 'spell'; powerPerRank: number; effect?: RpgModifier;
}
/** Existing nine IDs retain their ranks; additions form two paths per school. */
export const RPG_SKILLS: readonly RpgSkill[] = [
  { id: 'ember_power', name: 'Wildfire', description: 'All Flame abilities catch 2 more monsters per rank.', school: 'ember', spellId: 'ember', parentId: null, level: 2, maxRank: 3, kind: 'power', scope: 'school', powerPerRank: 2 },
  { id: 'ember_echo', name: 'Twin Nova', description: 'Fire Nova erupts twice and catches 4 more monsters.', school: 'ember', spellId: 'ember', parentId: 'ember_power', level: 4, maxRank: 1, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'echo' },
  { id: 'ember_master', name: 'Phoenix Heart', description: 'All Flame abilities catch 6 more monsters per rank.', school: 'ember', spellId: 'ember', parentId: 'ember_echo', level: 6, maxRank: 2, kind: 'power', scope: 'school', powerPerRank: 6 },
  { id: 'cleave', name: 'Heavy Cleave', description: 'Flame Cleave catches 2 more monsters.', school: 'ember', spellId: 'cleave', parentId: null, level: 2, maxRank: 1, kind: 'power', scope: 'spell', powerPerRank: 2 },
  { id: 'cleave_sweep', name: 'Blazing Reach', description: 'Widen Flame Cleave. Catch 2 more monsters per rank.', school: 'ember', spellId: 'cleave', parentId: 'cleave', level: 3, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 2, effect: 'wide' },
  { id: 'meteor', name: 'Meteor', description: 'Unlock a falling star and its explosive impact.', school: 'ember', spellId: 'meteor', parentId: 'ember_power', level: 4, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'meteor_shower', name: 'Meteor Shower', description: 'Split Meteor into repeated impacts. Catch 3 more monsters per rank.', school: 'ember', spellId: 'meteor', parentId: 'meteor', level: 5, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 3, effect: 'echo' },
  { id: 'phoenix_dive', name: 'Phoenix Dive', description: 'Unlock a fiery charge through the dungeon.', school: 'ember', spellId: 'phoenix_dive', parentId: 'cleave', level: 6, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'phoenix_wings', name: 'Ashen Wings', description: 'Phoenix Dive leaves a burning trail. Catch 4 more monsters per rank.', school: 'ember', spellId: 'phoenix_dive', parentId: 'phoenix_dive', level: 8, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'burn' },
  { id: 'firestorm', name: 'Firestorm', description: 'Unlock a field of erupting flame pillars.', school: 'ember', spellId: 'firestorm', parentId: 'meteor', level: 10, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'firestorm_inferno', name: 'Living Inferno', description: 'Firestorm leaves a field of embers. Catch 4 more monsters per rank.', school: 'ember', spellId: 'firestorm', parentId: 'firestorm', level: 12, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'burn' },
  { id: 'frost', name: 'Frostfall', description: 'Unlock the Frostfall spell.', school: 'frost', spellId: 'frost', parentId: null, level: 2, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'frost_shards', name: 'Crystal Shards', description: 'All Frost abilities scatter shards and catch 3 more monsters per rank.', school: 'frost', spellId: 'frost', parentId: 'frost', level: 3, maxRank: 3, kind: 'power', scope: 'school', powerPerRank: 3, effect: 'ice-shards' },
  { id: 'frost_master', name: 'Winter Crown', description: 'All Frost abilities catch 6 more monsters per rank.', school: 'frost', spellId: 'frost', parentId: 'frost_shards', level: 6, maxRank: 2, kind: 'power', scope: 'school', powerPerRank: 6 },
  { id: 'ice_lance', name: 'Ice Lance', description: 'Unlock a spear that pierces a row of monsters.', school: 'frost', spellId: 'ice_lance', parentId: 'frost', level: 3, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'ice_lance_split', name: 'Splintering Lance', description: 'Ice Lance breaks into piercing splinters. Catch 2 more monsters per rank.', school: 'frost', spellId: 'ice_lance', parentId: 'ice_lance', level: 4, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 2, effect: 'pierce' },
  { id: 'glacial_surge', name: 'Glacial Surge', description: 'Unlock a rolling wall of ice.', school: 'frost', spellId: 'glacial_surge', parentId: 'frost_shards', level: 5, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'glacial_tide', name: 'Glacial Tide', description: 'Widen Glacial Surge. Catch 3 more monsters per rank.', school: 'frost', spellId: 'glacial_surge', parentId: 'glacial_surge', level: 6, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 3, effect: 'wide' },
  { id: 'blizzard', name: 'Blizzard', description: 'Unlock a swirling hailstorm.', school: 'frost', spellId: 'blizzard', parentId: 'ice_lance', level: 7, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'blizzard_hail', name: 'Diamond Hail', description: 'Blizzard rains larger crystal shards. Catch 4 more monsters per rank.', school: 'frost', spellId: 'blizzard', parentId: 'blizzard', level: 9, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'ice-shards' },
  { id: 'frost_guardian', name: 'Frost Guardian', description: 'Unlock an ice giant that fights beside you.', school: 'frost', spellId: 'frost_guardian', parentId: 'glacial_surge', level: 10, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'guardian_twins', name: 'Twin Guardians', description: 'Summon a second frost guardian. Catch 4 more monsters per rank.', school: 'frost', spellId: 'frost_guardian', parentId: 'frost_guardian', level: 12, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'summon' },
  { id: 'storm', name: 'Chain Lightning', description: 'Unlock the Chain Lightning spell.', school: 'storm', spellId: 'storm', parentId: null, level: 3, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'storm_chain', name: 'Thunder Web', description: 'All Storm abilities fork and catch 3 more monsters per rank.', school: 'storm', spellId: 'storm', parentId: 'storm', level: 4, maxRank: 3, kind: 'power', scope: 'school', powerPerRank: 3, effect: 'chain' },
  { id: 'storm_master', name: 'Tempest Mastery', description: 'All Storm abilities catch 6 more monsters per rank.', school: 'storm', spellId: 'storm', parentId: 'storm_chain', level: 6, maxRank: 2, kind: 'power', scope: 'school', powerPerRank: 6 },
  { id: 'arc_lance', name: 'Arc Lance', description: 'Unlock a focused lightning beam.', school: 'storm', spellId: 'arc_lance', parentId: 'storm', level: 4, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'arc_lance_fork', name: 'Forked Arc', description: 'Arc Lance forks into side bolts. Catch 2 more monsters per rank.', school: 'storm', spellId: 'arc_lance', parentId: 'arc_lance', level: 5, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 2, effect: 'chain' },
  { id: 'thunderclap', name: 'Thunderclap', description: 'Unlock ground-shaking thunder rings.', school: 'storm', spellId: 'thunderclap', parentId: 'storm_chain', level: 5, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'thunderclap_echo', name: 'Rolling Thunder', description: 'Thunderclap sends a second shockwave. Catch 3 more monsters per rank.', school: 'storm', spellId: 'thunderclap', parentId: 'thunderclap', level: 7, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 3, effect: 'echo' },
  { id: 'ball_lightning', name: 'Ball Lightning', description: 'Unlock a roaming orb of electricity.', school: 'storm', spellId: 'ball_lightning', parentId: 'arc_lance', level: 7, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'ball_lightning_orbit', name: 'Orbiting Sparks', description: 'Ball Lightning releases satellite orbs. Catch 4 more monsters per rank.', school: 'storm', spellId: 'ball_lightning', parentId: 'ball_lightning', level: 9, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'orbit' },
  { id: 'tempest', name: 'Tempest', description: 'Unlock a sky full of lightning strikes.', school: 'storm', spellId: 'tempest', parentId: 'thunderclap', level: 10, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'tempest_overcharge', name: 'Overcharge', description: 'Tempest strikes branch across the floor. Catch 4 more monsters per rank.', school: 'storm', spellId: 'tempest', parentId: 'tempest', level: 12, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'chain' },
];
export interface RpgRegion { id: string; name: string; subtitle: string; color: string; requiredClears: number; bossName: string }
export const RPG_REGIONS: readonly RpgRegion[] = [
  { id: 'embercrypt', name: 'The Embercrypt', subtitle: 'Break the curse beneath the old keep', color: '#ff9f51', requiredClears: 0, bossName: 'The Hollow King' },
  { id: 'frostvault', name: 'Frostbound Vault', subtitle: 'Awaken the frozen halls', color: '#74d9ff', requiredClears: 1, bossName: 'The Crystal Warden' },
  { id: 'stormspire', name: 'The Storm Spire', subtitle: 'Climb into the heart of the storm', color: '#bb9cff', requiredClears: 3, bossName: 'The Thunder Colossus' },
];
export interface RpgItem {
  id: string; name: string; rarity: RpgRarity; description: string; power: number;
  effect?: RpgModifier; spellId: RpgSpellId | null; school: RpgSchoolId | null;
  scope: 'all' | 'school' | 'spell'; requiredClears: number;
}
export const RPG_ITEMS: readonly RpgItem[] = [
  { id: 'apprentice', name: "Apprentice's Runeblade", rarity: 'common', description: 'Your first spark of adventure.', power: 0, spellId: null, school: null, scope: 'all', requiredClears: 0 },
  { id: 'cinderwand', name: 'Cinderbranch', rarity: 'rare', description: 'Fire Nova leaves burning embers and catches 3 more monsters.', power: 3, effect: 'burn', spellId: 'ember', school: 'ember', scope: 'spell', requiredClears: 0 },
  { id: 'glacier', name: 'Glacier Fang', rarity: 'rare', description: 'Frostfall scatters extra shards and catches 3 more monsters.', power: 3, effect: 'ice-shards', spellId: 'frost', school: 'frost', scope: 'spell', requiredClears: 0 },
  { id: 'thunderrod', name: 'Thunder Rod', rarity: 'rare', description: 'Chain Lightning forks and catches 3 more monsters.', power: 3, effect: 'chain', spellId: 'storm', school: 'storm', scope: 'spell', requiredClears: 0 },
  { id: 'moonstaff', name: 'Moonshard Staff', rarity: 'epic', description: 'Every ability catches 4 more monsters.', power: 4, spellId: null, school: null, scope: 'all', requiredClears: 1 },
  { id: 'phoenix', name: 'Phoenix Scepter', rarity: 'legendary', description: 'Fire Nova erupts twice and catches 8 more monsters.', power: 8, effect: 'echo', spellId: 'ember', school: 'ember', scope: 'spell', requiredClears: 2 },
  { id: 'wintercrown', name: 'Staff of Endless Winter', rarity: 'legendary', description: 'Frostfall rains giant shards and catches 8 more monsters.', power: 8, effect: 'ice-shards', spellId: 'frost', school: 'frost', scope: 'spell', requiredClears: 3 },
  { id: 'tempest', name: 'Tempest Caller', rarity: 'legendary', description: 'Chain Lightning arcs twice and catches 8 more monsters.', power: 8, effect: 'chain', spellId: 'storm', school: 'storm', scope: 'spell', requiredClears: 4 },
  { id: 'cleaver', name: 'Ashsplitter', rarity: 'rare', description: 'Flame Cleave cuts a wider arc and catches 4 more monsters.', power: 4, effect: 'wide', spellId: 'cleave', school: 'ember', scope: 'spell', requiredClears: 0 },
  { id: 'starfall', name: 'Starfall Edge', rarity: 'epic', description: 'Meteor splits into a shower and catches 8 more monsters.', power: 8, effect: 'echo', spellId: 'meteor', school: 'ember', scope: 'spell', requiredClears: 1 },
  { id: 'phoenix_talon', name: 'Phoenix Talon', rarity: 'epic', description: 'Phoenix Dive leaves burning ground and catches 7 more monsters.', power: 7, effect: 'burn', spellId: 'phoenix_dive', school: 'ember', scope: 'spell', requiredClears: 2 },
  { id: 'inferno', name: 'Crown of the Inferno', rarity: 'legendary', description: 'Firestorm leaves lasting embers and catches 12 more monsters.', power: 12, effect: 'burn', spellId: 'firestorm', school: 'ember', scope: 'spell', requiredClears: 5 },
  { id: 'sunforged', name: 'Sunforged Runeblade', rarity: 'epic', description: 'All Flame abilities leave embers and catch 5 more monsters.', power: 5, effect: 'burn', spellId: null, school: 'ember', scope: 'school', requiredClears: 2 },
  { id: 'icespear', name: 'Rimepiercer', rarity: 'rare', description: 'Ice Lance splinters through the horde and catches 4 more monsters.', power: 4, effect: 'pierce', spellId: 'ice_lance', school: 'frost', scope: 'spell', requiredClears: 0 },
  { id: 'tideglass', name: 'Tideglass Blade', rarity: 'epic', description: 'Glacial Surge widens and catches 7 more monsters.', power: 7, effect: 'wide', spellId: 'glacial_surge', school: 'frost', scope: 'spell', requiredClears: 1 },
  { id: 'hailcaller', name: 'Hailcaller', rarity: 'epic', description: 'Blizzard rains giant crystals and catches 8 more monsters.', power: 8, effect: 'ice-shards', spellId: 'blizzard', school: 'frost', scope: 'spell', requiredClears: 2 },
  { id: 'wardenheart', name: "Winter Warden's Heart", rarity: 'legendary', description: 'Frost Guardian calls a second giant and catches 12 more monsters.', power: 12, effect: 'summon', spellId: 'frost_guardian', school: 'frost', scope: 'spell', requiredClears: 5 },
  { id: 'winterbranch', name: 'Winterbranch', rarity: 'epic', description: 'All Frost abilities scatter shards and catch 5 more monsters.', power: 5, effect: 'ice-shards', spellId: null, school: 'frost', scope: 'school', requiredClears: 2 },
  { id: 'arcfang', name: 'Arc Fang', rarity: 'rare', description: 'Arc Lance splinters through the horde and catches 4 more monsters.', power: 4, effect: 'pierce', spellId: 'arc_lance', school: 'storm', scope: 'spell', requiredClears: 0 },
  { id: 'thunderbell', name: 'Bell of Thunder', rarity: 'epic', description: 'Thunderclap echoes a second time and catches 7 more monsters.', power: 7, effect: 'echo', spellId: 'thunderclap', school: 'storm', scope: 'spell', requiredClears: 1 },
  { id: 'stormorbit', name: 'Orb of the Stormkeeper', rarity: 'epic', description: 'Ball Lightning gains orbiting sparks and catches 8 more monsters.', power: 8, effect: 'orbit', spellId: 'ball_lightning', school: 'storm', scope: 'spell', requiredClears: 2 },
  { id: 'skybreaker', name: 'Skybreaker', rarity: 'legendary', description: 'Tempest forks its lightning strikes and catches 12 more monsters.', power: 12, effect: 'chain', spellId: 'tempest', school: 'storm', scope: 'spell', requiredClears: 5 },
  { id: 'stormsilver', name: 'Stormsilver Runeblade', rarity: 'epic', description: 'All Storm abilities fork their lightning and catch 5 more monsters.', power: 5, effect: 'chain', spellId: null, school: 'storm', scope: 'school', requiredClears: 2 },
];
export interface RpgExpedition { id: string; regionId: string; encounterIndex: number; encountersTotal: number; cleared: boolean; startedAt: number }
export interface RpgState {
  profileId: string; xp: number; level: number; xpIntoLevel: number; xpForNextLevel: number; skillPoints: number;
  skills: Record<string, number>; inventory: string[]; equippedItemId: string; selectedSpellId: RpgSpellId;
  totalKills: number; expeditionsCompleted: number; expedition: RpgExpedition | null;
}
export interface RpgReward { xp: number; kills: number; levelUp: boolean; levelsGained: number; item: RpgItem | null; newItems: RpgItem[]; duplicateItem: boolean; bossDefeated: boolean; spellId: RpgSpellId }
export interface RpgResolveResult { state: RpgState; reward: RpgReward; duplicate: boolean }
export function rpgLevel(xp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number } {
  let level = 1;
  let remaining = Math.max(0, xp);
  while (remaining >= 90 + (level - 1) * 45) { remaining -= 90 + (level - 1) * 45; level++; }
  return { level, xpIntoLevel: remaining, xpForNextLevel: 90 + (level - 1) * 45 };
}
export function rpgSpellSchool(spellId: RpgSpellId): RpgSchoolId {
  return RPG_SPELLS.find(spell => spell.id === spellId)?.school ?? 'ember';
}
export function rpgSpellUnlocked(spellId: RpgSpellId, skills: Record<string, number>): boolean {
  const spell = RPG_SPELLS.find((entry) => entry.id === spellId);
  return !!spell && (!spell.skillId || (skills[spell.skillId] ?? 0) > 0);
}
/** Fallback keeps old serialized reward items readable after upgrading. */
export function rpgItemApplies(item: Pick<RpgItem, 'spellId'> & Partial<Pick<RpgItem, 'scope' | 'school'>>, spellId: RpgSpellId): boolean {
  const scope = item.scope ?? (item.spellId ? 'spell' : 'all');
  return scope === 'all' || (scope === 'spell' ? item.spellId === spellId : item.school === rpgSpellSchool(spellId));
}
function skillApplies(skill: RpgSkill, spellId: RpgSpellId): boolean {
  return skill.scope === 'school' ? skill.school === rpgSpellSchool(spellId) : skill.spellId === spellId;
}
/** Modifiers are renderer instructions, shared so equipment and skill descriptions stay true. */
export function rpgSpellModifiers(state: Pick<RpgState, 'skills' | 'equippedItemId' | 'selectedSpellId'>, spellId = state.selectedSpellId): RpgModifier[] {
  const effects = RPG_SKILLS.filter(skill => skill.effect && (state.skills[skill.id] ?? 0) > 0 && skillApplies(skill, spellId)).map(skill => skill.effect!);
  const item = RPG_ITEMS.find(entry => entry.id === state.equippedItemId);
  if (item?.effect && rpgItemApplies(item, spellId)) effects.push(item.effect);
  return [...new Set(effects)];
}
/** Shared count keeps visible hordes and authoritative rewards aligned. */
export function rpgEncounterKills(state: Pick<RpgState, 'skills' | 'equippedItemId' | 'selectedSpellId'>, encounterIndex: number, spellId = state.selectedSpellId): number {
  const item = RPG_ITEMS.find(entry => entry.id === state.equippedItemId);
  const gearPower = item && rpgItemApplies(item, spellId) ? item.power : 0;
  const skillPower = RPG_SKILLS.filter(skill => skillApplies(skill, spellId)).reduce((total, skill) => total + (state.skills[skill.id] ?? 0) * skill.powerPerRank, 0);
  const abilityPower = RPG_SPELLS.find(spell => spell.id === spellId)?.power ?? 0;
  return (encounterIndex === 5 ? 36 : 24 + encounterIndex * 2) + abilityPower + gearPower + skillPower;
}
