import { rpgLootSpellShape, rpgLootCombatAffix, rpgEffectiveSkills, rpgEquippedLoot, rpgLootAffixes, rpgLootSkillBonus, rpgLootPower, rpgTier } from './rpgLoot';
import type { RpgBoon, RpgBoonId } from './rpgLocks';

/** Adventure content only. Never used by tutor selection, mastery, or review. */
export const RPG_DUPLICATE_ITEM_XP = 16;
export const RPG_APPEARANCE_IDS = ['wayfarer', 'cinder', 'glacier', 'tempest'] as const;
export type RpgAppearanceId = typeof RPG_APPEARANCE_IDS[number];
export interface RpgAppearance {
  id: RpgAppearanceId; name: string; description: string; requiredLevel: number;
  modelId: string; thumbnail: string | null;
}
/** Cosmetic milestones use existing experience; they never alter combat or learning. */
export const RPG_APPEARANCES: readonly RpgAppearance[] = [
  { id: 'wayfarer', name: 'Wayfarer', description: 'Your familiar hood and runeblade, ready for another adventure.', requiredLevel: 1, modelId: 'hero', thumbnail: '/assets/rpg/appearances/wayfarer.png' },
  { id: 'cinder', name: 'Cinder Knight', description: 'Wear ember-forged armor and the colors of a seasoned Flame adventurer.', requiredLevel: 12, modelId: 'hero-cinder', thumbnail: '/assets/rpg/appearances/cinder.png' },
  { id: 'glacier', name: 'Glacier Warden', description: 'Wear crystal-trimmed armor and the mantle of a Frost guardian.', requiredLevel: 15, modelId: 'hero-glacier', thumbnail: '/assets/rpg/appearances/glacier.png' },
  { id: 'tempest', name: 'Tempest Weaver', description: 'Wear storm-marked armor and the mantle of a master of lightning.', requiredLevel: 18, modelId: 'hero-tempest', thumbnail: '/assets/rpg/appearances/tempest.png' },
];
export function rpgAppearanceUnlocked(appearanceId: string, level: number): boolean {
  const appearance = RPG_APPEARANCES.find(entry => entry.id === appearanceId);
  return !!appearance && Number.isFinite(level) && level >= appearance.requiredLevel;
}
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
  { id: 'cleave', school: 'ember', name: 'Heavy Cleave', description: 'Swing your sword through up to three nearby monsters. Deal 2 extra damage per target.', color: '#e8d9b7', skillId: null, effect: 'cleave', power: 2 },
  { id: 'meteor', school: 'ember', name: 'Meteor', description: 'Call down a blazing rock that bursts on impact. Deal 6 extra damage per target.', color: '#ff7849', skillId: 'meteor', effect: 'meteor', power: 6 },
  { id: 'phoenix_dive', school: 'ember', name: 'Phoenix Dive', description: 'Become a fiery phoenix and charge through the horde. Deal 8 extra damage per target.', color: '#ffc264', skillId: 'phoenix_dive', effect: 'phoenix-dive', power: 8 },
  { id: 'firestorm', school: 'ember', name: 'Firestorm', description: 'Raise a field of flame pillars that erupt in sequence. Deal 12 extra damage per target.', color: '#ff653d', skillId: 'firestorm', effect: 'firestorm', power: 12 },
  { id: 'frost', school: 'frost', name: 'Frostfall', description: 'Bring down ice crystals across nearby monsters.', color: '#80ddff', skillId: 'frost', effect: 'frostfall', power: 0 },
  { id: 'ice_lance', school: 'frost', name: 'Ice Lance', description: 'Launch piercing ice spears toward monsters. Deal 3 extra damage per target.', color: '#c0f4ff', skillId: 'ice_lance', effect: 'ice-lance', power: 3 },
  { id: 'glacial_surge', school: 'frost', name: 'Glacial Surge', description: 'Send a surge of ice erupting toward monsters. Deal 6 extra damage per target.', color: '#6dc9ff', skillId: 'glacial_surge', effect: 'glacial-surge', power: 6 },
  { id: 'blizzard', school: 'frost', name: 'Blizzard', description: 'Cover the battlefield in a swirling hailstorm. Deal 9 extra damage per target.', color: '#b8ebff', skillId: 'blizzard', effect: 'blizzard', power: 9 },
  { id: 'frost_guardian', school: 'frost', name: 'Frost Guardian', description: 'Summon an ice giant to smash the horde for you. Deal 12 extra damage per target.', color: '#62e0ec', skillId: 'frost_guardian', effect: 'frost-guardian', power: 12 },
  { id: 'storm', school: 'storm', name: 'Chain Lightning', description: 'Send lightning leaping from one monster to the next.', color: '#c3a1ff', skillId: 'storm', effect: 'chain-lightning', power: 0 },
  { id: 'arc_lance', school: 'storm', name: 'Arc Lance', description: 'Fire a focused lightning beam through the horde. Deal 3 extra damage per target.', color: '#a9c9ff', skillId: 'arc_lance', effect: 'arc-lance', power: 3 },
  { id: 'thunderclap', school: 'storm', name: 'Thunderclap', description: 'Strike the ground and blast monsters with thunder rings. Deal 6 extra damage per target.', color: '#e4bbff', skillId: 'thunderclap', effect: 'thunderclap', power: 6 },
  { id: 'ball_lightning', school: 'storm', name: 'Ball Lightning', description: 'Release a roaming orb that zaps monsters as it passes. Deal 9 extra damage per target.', color: '#bcadff', skillId: 'ball_lightning', effect: 'ball-lightning', power: 9 },
  { id: 'tempest', school: 'storm', name: 'Tempest', description: 'Summon a storm overhead and rain down lightning bolts. Deal 12 extra damage per target.', color: '#efcaff', skillId: 'tempest', effect: 'tempest', power: 12 },
];
export interface RpgSkill {
  id: string; name: string; description: string; school: RpgSchoolId; spellId: RpgSpellId;
  parentId: string | null; level: number; maxRank: number; kind: 'unlock' | 'power' | 'modifier';
  scope: 'school' | 'spell'; powerPerRank: number; effect?: RpgModifier;
}
/** Existing nine IDs retain their ranks; additions form two paths per school. */
export const RPG_SKILLS: readonly RpgSkill[] = [
  { id: 'ember_power', name: 'Wildfire', description: 'All Flame abilities deal 2 more damage per target per rank.', school: 'ember', spellId: 'ember', parentId: null, level: 2, maxRank: 3, kind: 'power', scope: 'school', powerPerRank: 2 },
  { id: 'ember_echo', name: 'Twin Nova', description: 'Fire Nova erupts twice and deals 4 more damage per target.', school: 'ember', spellId: 'ember', parentId: 'ember_power', level: 4, maxRank: 1, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'echo' },
  { id: 'ember_master', name: 'Phoenix Heart', description: 'All Flame abilities deal 6 more damage per target per rank.', school: 'ember', spellId: 'ember', parentId: 'ember_echo', level: 6, maxRank: 2, kind: 'power', scope: 'school', powerPerRank: 6 },
  { id: 'cleave', name: 'Sharpened Edge', description: 'Heavy Cleave deals 2 more damage per target.', school: 'ember', spellId: 'cleave', parentId: null, level: 2, maxRank: 1, kind: 'power', scope: 'spell', powerPerRank: 2 },
  { id: 'cleave_sweep', name: 'Blazing Reach', description: 'Widen Heavy Cleave. Deal 2 more damage per target per rank.', school: 'ember', spellId: 'cleave', parentId: 'cleave', level: 3, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 2, effect: 'wide' },
  { id: 'meteor', name: 'Meteor', description: 'Unlock a falling star and its explosive impact.', school: 'ember', spellId: 'meteor', parentId: 'ember_power', level: 4, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'meteor_shower', name: 'Meteor Shower', description: 'Split Meteor into repeated impacts. Deal 3 more damage per target per rank.', school: 'ember', spellId: 'meteor', parentId: 'meteor', level: 5, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 3, effect: 'echo' },
  { id: 'phoenix_dive', name: 'Phoenix Dive', description: 'Unlock a fiery charge through the dungeon.', school: 'ember', spellId: 'phoenix_dive', parentId: 'cleave', level: 6, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'phoenix_wings', name: 'Ashen Wings', description: 'Phoenix Dive leaves a burning trail. Deal 4 more damage per target per rank.', school: 'ember', spellId: 'phoenix_dive', parentId: 'phoenix_dive', level: 8, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'burn' },
  { id: 'firestorm', name: 'Firestorm', description: 'Unlock a field of erupting flame pillars.', school: 'ember', spellId: 'firestorm', parentId: 'meteor', level: 10, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'firestorm_inferno', name: 'Living Inferno', description: 'Firestorm leaves a field of embers. Deal 4 more damage per target per rank.', school: 'ember', spellId: 'firestorm', parentId: 'firestorm', level: 12, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'burn' },
  { id: 'frost', name: 'Frostfall', description: 'Unlock the Frostfall spell.', school: 'frost', spellId: 'frost', parentId: null, level: 2, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'frost_shards', name: 'Crystal Shards', description: 'All Frost abilities scatter shards and deal 3 more damage per target per rank.', school: 'frost', spellId: 'frost', parentId: 'frost', level: 3, maxRank: 3, kind: 'power', scope: 'school', powerPerRank: 3, effect: 'ice-shards' },
  { id: 'frost_master', name: 'Winter Crown', description: 'All Frost abilities deal 6 more damage per target per rank.', school: 'frost', spellId: 'frost', parentId: 'frost_shards', level: 6, maxRank: 2, kind: 'power', scope: 'school', powerPerRank: 6 },
  { id: 'ice_lance', name: 'Ice Lance', description: 'Unlock a spear that pierces a row of monsters.', school: 'frost', spellId: 'ice_lance', parentId: 'frost', level: 3, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'ice_lance_split', name: 'Splintering Lance', description: 'Ice Lance breaks into piercing splinters. Deal 2 more damage per target per rank.', school: 'frost', spellId: 'ice_lance', parentId: 'ice_lance', level: 4, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 2, effect: 'pierce' },
  { id: 'glacial_surge', name: 'Glacial Surge', description: 'Unlock a surge of erupting ice.', school: 'frost', spellId: 'glacial_surge', parentId: 'frost_shards', level: 5, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'glacial_tide', name: 'Glacial Tide', description: 'Widen Glacial Surge. Deal 3 more damage per target per rank.', school: 'frost', spellId: 'glacial_surge', parentId: 'glacial_surge', level: 6, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 3, effect: 'wide' },
  { id: 'blizzard', name: 'Blizzard', description: 'Unlock a swirling hailstorm.', school: 'frost', spellId: 'blizzard', parentId: 'ice_lance', level: 7, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'blizzard_hail', name: 'Diamond Hail', description: 'Blizzard rains larger crystal shards. Deal 4 more damage per target per rank.', school: 'frost', spellId: 'blizzard', parentId: 'blizzard', level: 9, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'ice-shards' },
  { id: 'frost_guardian', name: 'Frost Guardian', description: 'Unlock an ice giant that fights beside you.', school: 'frost', spellId: 'frost_guardian', parentId: 'glacial_surge', level: 10, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'guardian_twins', name: 'Twin Guardians', description: 'Summon a second frost guardian. Deal 4 more damage per target per rank.', school: 'frost', spellId: 'frost_guardian', parentId: 'frost_guardian', level: 12, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'summon' },
  { id: 'storm', name: 'Chain Lightning', description: 'Unlock the Chain Lightning spell.', school: 'storm', spellId: 'storm', parentId: null, level: 3, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'storm_chain', name: 'Thunder Web', description: 'All Storm abilities fork and deal 3 more damage per target per rank.', school: 'storm', spellId: 'storm', parentId: 'storm', level: 4, maxRank: 3, kind: 'power', scope: 'school', powerPerRank: 3, effect: 'chain' },
  { id: 'storm_master', name: 'Tempest Mastery', description: 'All Storm abilities deal 6 more damage per target per rank.', school: 'storm', spellId: 'storm', parentId: 'storm_chain', level: 6, maxRank: 2, kind: 'power', scope: 'school', powerPerRank: 6 },
  { id: 'arc_lance', name: 'Arc Lance', description: 'Unlock a focused lightning beam.', school: 'storm', spellId: 'arc_lance', parentId: 'storm', level: 4, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'arc_lance_fork', name: 'Forked Arc', description: 'Arc Lance forks into side bolts. Deal 2 more damage per target per rank.', school: 'storm', spellId: 'arc_lance', parentId: 'arc_lance', level: 5, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 2, effect: 'chain' },
  { id: 'thunderclap', name: 'Thunderclap', description: 'Unlock ground-shaking thunder rings.', school: 'storm', spellId: 'thunderclap', parentId: 'storm_chain', level: 5, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'thunderclap_echo', name: 'Rolling Thunder', description: 'Thunderclap sends a second shockwave. Deal 3 more damage per target per rank.', school: 'storm', spellId: 'thunderclap', parentId: 'thunderclap', level: 7, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 3, effect: 'echo' },
  { id: 'ball_lightning', name: 'Ball Lightning', description: 'Unlock a roaming orb of electricity.', school: 'storm', spellId: 'ball_lightning', parentId: 'arc_lance', level: 7, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'ball_lightning_orbit', name: 'Orbiting Sparks', description: 'Ball Lightning releases satellite orbs. Deal 4 more damage per target per rank.', school: 'storm', spellId: 'ball_lightning', parentId: 'ball_lightning', level: 9, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'orbit' },
  { id: 'tempest', name: 'Tempest', description: 'Unlock a sky full of lightning strikes.', school: 'storm', spellId: 'tempest', parentId: 'thunderclap', level: 10, maxRank: 1, kind: 'unlock', scope: 'spell', powerPerRank: 0 },
  { id: 'tempest_overcharge', name: 'Overcharge', description: 'Tempest gains follow-up chain lightning. Deal 4 more damage per target per rank.', school: 'storm', spellId: 'tempest', parentId: 'tempest', level: 12, maxRank: 2, kind: 'modifier', scope: 'spell', powerPerRank: 4, effect: 'chain' },
];
export type RpgEnvironment = 'vault' | 'forest' | 'coast' | 'quarry' | 'garden';
export interface RpgRegion { id: string; name: string; subtitle: string; color: string; requiredClears: number; bossName: string; relicSchool: RpgSchoolId | null; environment?: RpgEnvironment; combatDifficulty?: number }
export const RPG_REGIONS: readonly RpgRegion[] = [
  { id: 'embercrypt', name: 'The Embercrypt', subtitle: 'Break the curse beneath the old keep', color: '#ff9f51', requiredClears: 0, bossName: 'The Hollow King', relicSchool: 'ember', environment: 'vault', combatDifficulty: 0 },
  { id: 'frostvault', name: 'Frostbound Vault', subtitle: 'Awaken the frozen halls', color: '#74d9ff', requiredClears: 1, bossName: 'The Crystal Warden', relicSchool: 'frost', environment: 'vault', combatDifficulty: 1 },
  { id: 'stormspire', name: 'The Storm Spire', subtitle: 'Climb into the heart of the storm', color: '#bb9cff', requiredClears: 3, bossName: 'The Thunder Colossus', relicSchool: 'storm', environment: 'vault', combatDifficulty: 2 },
  { id: 'mosswood', name: 'Mosswood Ruins', subtitle: 'Follow the forest trail through fallen stone arches', color: '#91be75', requiredClears: 0, bossName: 'The Rootbound King', relicSchool: null, environment: 'forest', combatDifficulty: 0 },
  { id: 'tidebreak', name: 'Tidebreak Coast', subtitle: 'Cross the rocky shore beneath the open sky', color: '#78c6c8', requiredClears: 0, bossName: 'The Tidemark Warden', relicSchool: null, environment: 'coast', combatDifficulty: 0 },
  { id: 'old-quarry', name: 'The Old Quarry', subtitle: 'Descend between broken cliffs and abandoned workings', color: '#c3a16e', requiredClears: 0, bossName: 'The Iron Overseer', relicSchool: null, environment: 'quarry', combatDifficulty: 0 },
  { id: 'kingsgarden', name: 'The King’s Garden', subtitle: 'Walk the wild courtyards of a ruined palace', color: '#b0b983', requiredClears: 0, bossName: 'The Thorn Regent', relicSchool: null, environment: 'garden', combatDifficulty: 0 },
];
export interface RpgItem {
  id: string; name: string; rarity: RpgRarity; description: string; power: number;
  effect?: RpgModifier; spellId: RpgSpellId | null; school: RpgSchoolId | null;
  scope: 'all' | 'school' | 'spell'; requiredClears: number;
}
export const RPG_ITEMS: readonly RpgItem[] = [
  { id: 'apprentice', name: "Apprentice's Runeblade", rarity: 'common', description: 'A trusty starter blade. Your first dungeon treasures can make it stronger.', power: 0, spellId: null, school: null, scope: 'all', requiredClears: 0 },
  { id: 'cinderwand', name: 'Cinderbranch', rarity: 'rare', description: 'All Flame attacks deal 3 more damage to each enemy.', power: 3, spellId: null, school: 'ember', scope: 'school', requiredClears: 0 },
  { id: 'glacier', name: 'Glacier Fang', rarity: 'rare', description: 'All Frost attacks deal 3 more damage to each enemy.', power: 3, spellId: null, school: 'frost', scope: 'school', requiredClears: 0 },
  { id: 'thunderrod', name: 'Thunder Rod', rarity: 'rare', description: 'All Storm attacks deal 3 more damage to each enemy.', power: 3, spellId: null, school: 'storm', scope: 'school', requiredClears: 0 },
  { id: 'moonstaff', name: 'Moonshard Staff', rarity: 'epic', description: 'Every attack deals 4 more damage to each enemy.', power: 4, spellId: null, school: null, scope: 'all', requiredClears: 1 },
  { id: 'phoenix', name: 'Phoenix Scepter', rarity: 'legendary', description: 'All Flame attacks deal 8 more damage to each enemy.', power: 8, spellId: null, school: 'ember', scope: 'school', requiredClears: 2 },
  { id: 'wintercrown', name: 'Staff of Endless Winter', rarity: 'legendary', description: 'All Frost attacks deal 8 more damage to each enemy.', power: 8, spellId: null, school: 'frost', scope: 'school', requiredClears: 3 },
  { id: 'tempest', name: 'Tempest Caller', rarity: 'legendary', description: 'All Storm attacks deal 8 more damage to each enemy.', power: 8, spellId: null, school: 'storm', scope: 'school', requiredClears: 4 },
  { id: 'cleaver', name: 'Ashsplitter', rarity: 'rare', description: 'All Flame attacks deal 4 more damage to each enemy.', power: 4, spellId: null, school: 'ember', scope: 'school', requiredClears: 0 },
  { id: 'starfall', name: 'Starfall Edge', rarity: 'epic', description: 'All Flame attacks deal 8 more damage to each enemy.', power: 8, spellId: null, school: 'ember', scope: 'school', requiredClears: 1 },
  { id: 'phoenix_talon', name: 'Phoenix Talon', rarity: 'epic', description: 'All Flame attacks deal 7 more damage to each enemy.', power: 7, spellId: null, school: 'ember', scope: 'school', requiredClears: 2 },
  { id: 'inferno', name: 'Crown of the Inferno', rarity: 'legendary', description: 'All Flame attacks deal 12 more damage to each enemy.', power: 12, spellId: null, school: 'ember', scope: 'school', requiredClears: 5 },
  { id: 'sunforged', name: 'Sunforged Runeblade', rarity: 'epic', description: 'All Flame attacks deal 5 more damage to each enemy.', power: 5, spellId: null, school: 'ember', scope: 'school', requiredClears: 2 },
  { id: 'icespear', name: 'Rimepiercer', rarity: 'rare', description: 'All Frost attacks deal 4 more damage to each enemy.', power: 4, spellId: null, school: 'frost', scope: 'school', requiredClears: 0 },
  { id: 'tideglass', name: 'Tideglass Blade', rarity: 'epic', description: 'All Frost attacks deal 7 more damage to each enemy.', power: 7, spellId: null, school: 'frost', scope: 'school', requiredClears: 1 },
  { id: 'hailcaller', name: 'Hailcaller', rarity: 'epic', description: 'All Frost attacks deal 8 more damage to each enemy.', power: 8, spellId: null, school: 'frost', scope: 'school', requiredClears: 2 },
  { id: 'wardenheart', name: "Winter Warden's Heart", rarity: 'legendary', description: 'All Frost attacks deal 12 more damage to each enemy.', power: 12, spellId: null, school: 'frost', scope: 'school', requiredClears: 5 },
  { id: 'winterbranch', name: 'Winterbranch', rarity: 'epic', description: 'All Frost attacks deal 5 more damage to each enemy.', power: 5, spellId: null, school: 'frost', scope: 'school', requiredClears: 2 },
  { id: 'arcfang', name: 'Arc Fang', rarity: 'rare', description: 'All Storm attacks deal 4 more damage to each enemy.', power: 4, spellId: null, school: 'storm', scope: 'school', requiredClears: 0 },
  { id: 'thunderbell', name: 'Bell of Thunder', rarity: 'epic', description: 'All Storm attacks deal 7 more damage to each enemy.', power: 7, spellId: null, school: 'storm', scope: 'school', requiredClears: 1 },
  { id: 'stormorbit', name: 'Orb of the Stormkeeper', rarity: 'epic', description: 'All Storm attacks deal 8 more damage to each enemy.', power: 8, spellId: null, school: 'storm', scope: 'school', requiredClears: 2 },
  { id: 'skybreaker', name: 'Skybreaker', rarity: 'legendary', description: 'All Storm attacks deal 12 more damage to each enemy.', power: 12, spellId: null, school: 'storm', scope: 'school', requiredClears: 5 },
  { id: 'stormsilver', name: 'Stormsilver Runeblade', rarity: 'epic', description: 'All Storm attacks deal 5 more damage to each enemy.', power: 5, spellId: null, school: 'storm', scope: 'school', requiredClears: 2 },
];
export interface RpgCombatEnemy { id: string; hp: number; maxHp: number }
export interface RpgCombatState { version: 1; encounterIndex: number; casts: number; enemies: RpgCombatEnemy[] }
export interface RpgCombatResult {
  enemiesBefore: RpgCombatEnemy[]; enemiesAfter: RpgCombatEnemy[];
  hits: { enemyId: string; damage: number; hpBefore: number; hpAfter: number }[];
  defeatedIds: string[]; encounterCleared: boolean; remainingEnemies: number;
  damage: number; coverage: number; powerPercent?: number;
}
export interface RpgExpedition { id: string; regionId: string; encounterIndex: number; encountersTotal: number; cleared: boolean; startedAt: number; combat?: RpgCombatState; tier?: number; boon?: RpgBoon }
export type RpgSpellShape = 'twin-orb' | 'meteor-shower' | 'split-lance'
  | 'aftershock' | 'rift-slash' | 'blazing-wake' | 'volcanic-ground' | 'crystal-bloom'
  | 'frozen-fault' | 'whiteout' | 'glacial-hammer' | 'thunder-web' | 'overcharge' | 'resonance' | 'storm-pillars';
export type RpgCombatAffix = 'opening-strike' | 'boss-slayer';
export interface RpgLootInstance {
  spellShape?: RpgSpellShape; combatAffix?: RpgCombatAffix;
  id: string; itemId: string; bonusPower: number; bonusSkillId?: string; bonusSkillRanks?: number; upgradeLevel: number;
  bonusTargets?: number; bonusSpellId?: RpgSpellId; bonusSpellPower?: number;
  bonusSchoolId?: RpgSchoolId; bonusSchoolPower?: number;
}
export interface RpgGoal { kind: 'item' | 'upgrade' | 'skill'; id: string }
export interface RpgState {
  profileId: string; xp: number; level: number; xpIntoLevel: number; xpForNextLevel: number; skillPoints: number;
  skills: Record<string, number>; inventory: string[]; equippedItemId: string; selectedSpellId: RpgSpellId; appearanceId: RpgAppearanceId;
  totalKills: number; expeditionsCompleted: number; expedition: RpgExpedition | null;
  loot?: RpgLootInstance[]; equippedLootId?: string | null; forgeDust?: number;
  dungeonTier?: number; bestTier?: number; goal?: RpgGoal | null;
}
export interface RpgReward { xp: number; kills: number; levelUp: boolean; levelsGained: number; item: RpgItem | null; newItems: RpgItem[]; duplicateItem: boolean; bossDefeated: boolean; spellId: RpgSpellId; combat?: RpgCombatResult; loot?: RpgLootInstance; forgeDust?: number; tier?: number; bossCrazyCoins?: number; bossDimes?: number; spellShape?: RpgSpellShape; boon?: RpgBoonId; bountyDust?: number }
export interface RpgResolveResult { state: RpgState; reward: RpgReward; duplicate: boolean }
/** A chest opened with a solved problem: smaller than a fight's reward, sometimes a relic. */
export interface RpgChestReward { chestId: string; xp: number; forgeDust: number; levelUp: boolean; levelsGained: number; item: RpgItem | null; newItems: RpgItem[]; duplicateItem: boolean; loot?: RpgLootInstance; tier: number }
export interface RpgChestResult { state: RpgState; reward: RpgChestReward; duplicate: boolean }
/** Chests one expedition can pay out; more may stand in a big level, but they are empty. */
export const RPG_CHESTS_PER_EXPEDITION = 8;
export const RPG_CHEST_XP = 16;

type RelicProgress = Pick<RpgState, 'inventory' | 'expeditionsCompleted' | 'totalKills'>;
export interface RpgRelicHunt { regionId: string; itemId: string; encounterIndex: number; regional: boolean; duplicate: boolean }

/** Receives progress BEFORE this encounter's kills/reward. Never mutates it.
 * Region specialties give the destination meaning without withholding any relic
 * from a player who prefers to keep revisiting one dungeon.
 */
export function rpgRelicDrop(state: RelicProgress, regionId: string, encounterIndex: number): RpgItem | null {
  const region = RPG_REGIONS.find(entry => entry.id === regionId);
  if (!region || !Number.isInteger(encounterIndex) || encounterIndex < 0 || encounterIndex > 5) return null;
  if (state.totalKills === 0) return RPG_ITEMS.find(item => item.id === 'cinderwand')!;
  const boss = encounterIndex === 5;
  if (encounterIndex !== 2 && !boss) return null;
  const pool = RPG_ITEMS.filter(item => item.id !== 'apprentice' && item.requiredClears <= state.expeditionsCompleted
    && (boss || item.rarity !== 'legendary'));
  const missing = pool.filter(item => !state.inventory.includes(item.id));
  // Open-air areas share every school. Prefer an uncollected relic, with no
  // elemental bias. Keep the same rule in forecasts and server rewards.
  if (!region.relicSchool) {
    const choices = missing.length ? missing : pool;
    return choices[(state.expeditionsCompleted + encounterIndex) % choices.length] ?? null;
  }
  return missing.find(item => item.school === region.relicSchool)
    ?? missing.find(item => item.scope === 'all')
    ?? missing[0]
    ?? pool[(state.expeditionsCompleted + encounterIndex) % pool.length]
    ?? null;
}

/** Exact next new relic in the remaining expedition, or its next duplicate if
 * nothing new can drop. Completed expeditions preview a fresh six-room trip.
 */
export function rpgNextRelicHunt(state: RpgState, regionId: string): RpgRelicHunt | null {
  const region = RPG_REGIONS.find(entry => entry.id === regionId);
  if (!region || state.expeditionsCompleted < region.requiredClears) return null;
  const active = state.expedition && !state.expedition.cleared && state.expedition.regionId === regionId;
  const firstRoom = active ? state.expedition!.encounterIndex : 0;
  const priorRoomKills = active ? rpgEncounterCombat(state).enemies.filter(enemy => enemy.hp === 0).length : 0;
  const progress: RelicProgress = { inventory: [...state.inventory], expeditionsCompleted: state.expeditionsCompleted, totalKills: state.totalKills - priorRoomKills };
  let nextDuplicate: RpgRelicHunt | null = null;
  for (let room = firstRoom; room < 6; room++) {
    const item = rpgRelicDrop(progress, regionId, room);
    if (item) {
      const duplicate = progress.inventory.includes(item.id);
      const hunt = { regionId, itemId: item.id, encounterIndex: room, regional: !!region.relicSchool && item.school === region.relicSchool, duplicate };
      if (!duplicate) return hunt;
      nextDuplicate ??= hunt;
    }
    // Only the first-ever drop predicate needs simulated kills; no combat,
    // experience, mastery or real save state participates in this forecast.
    progress.totalKills++;
  }
  return nextDuplicate;
}

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
/** Gear can lend its associated spell without purchasing or changing a tree
 * rank. Availability disappears when that exact bonus copy is unequipped. */
export function rpgSpellAvailable(state: RpgLoadout, spellId: RpgSpellId = state.selectedSpellId): boolean {
  if (rpgSpellUnlocked(spellId, state.skills)) return true;
  if (rpgLootSpellShape(rpgEquippedLoot(state))?.spellId === spellId) return true;
  const bonus = rpgLootSkillBonus(rpgEquippedLoot(state));
  return !!bonus && RPG_SKILLS.some(skill => skill.id === bonus.skillId && skill.spellId === spellId);
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
export function rpgSpellModifiers(state: RpgLoadout, spellId = state.selectedSpellId): RpgModifier[] {
  const skills = rpgEffectiveSkills(state);
  const effects = RPG_SKILLS.filter(skill => skill.effect && (skills[skill.id] ?? 0) > 0 && skillApplies(skill, spellId)).map(skill => skill.effect!);
  const item = RPG_ITEMS.find(entry => entry.id === state.equippedItemId);
  if (item?.effect && rpgItemApplies(item, spellId)) effects.push(item.effect);
  return [...new Set(effects)];
}
export type RpgLoadout = Pick<RpgState, 'skills' | 'equippedItemId' | 'selectedSpellId'> & Partial<Pick<RpgState, 'loot' | 'equippedLootId'>>;
/** A spell changes damage and coverage, never the number of monsters spawned. */
export function rpgSpellCombatStats(state: RpgLoadout, spellId = state.selectedSpellId): { damage: number; targets: number } {
  const item = RPG_ITEMS.find(entry => entry.id === state.equippedItemId);
  const equipped = rpgEquippedLoot(state), affixes = rpgLootAffixes(equipped);
  const namedPower = (affixes.spellId === spellId ? affixes.spellPower : 0)
    + (affixes.schoolId === rpgSpellSchool(spellId) ? affixes.schoolPower : 0);
  const gearPower = (item && rpgItemApplies(item, spellId) ? item.power : 0) + rpgLootPower(equipped) + namedPower;
  const skills = rpgEffectiveSkills(state);
  const skillPower = RPG_SKILLS.filter(skill => skillApplies(skill, spellId)).reduce((total, skill) => total + (skills[skill.id] ?? 0) * skill.powerPerRank, 0);
  const abilityPower = RPG_SPELLS.find(spell => spell.id === spellId)?.power ?? 0;
  const bases: Record<RpgSpellId, [number, number]> = {
    ember: [6, 6], cleave: [7, 3], meteor: [8, 5], phoenix_dive: [7, 6], firestorm: [7, 8],
    frost: [6, 6], ice_lance: [8, 3], glacial_surge: [7, 7], blizzard: [7, 8], frost_guardian: [9, 5],
    storm: [7, 4], arc_lance: [8, 4], thunderclap: [7, 7], ball_lightning: [8, 6], tempest: [8, 8],
  };
  const power = abilityPower + gearPower + skillPower, [damage, coverage] = bases[spellId];
  // Ordinary power still changes only damage. A specific rolled coverage affix
  // can reach up to two more victims, independently of learned modifiers.
  const extraTargets = Math.min(2, RPG_SKILLS.filter(skill => skill.kind === 'modifier' && skillApplies(skill, spellId))
    .reduce((total, skill) => total + (skills[skill.id] ?? 0), 0));
  const shape = rpgLootSpellShape(equipped);
  return { damage: Math.round((damage + power) * (shape?.spellId === spellId ? shape.damageMultiplier : 1)), targets: Math.min(10, coverage + extraTargets + affixes.targets + (shape?.spellId === spellId ? shape.extraTargets : 0)) };
}

/** Deterministic current-room health. Returns a copy and never rewrites a save. */
export function rpgEncounterCombat(state: Pick<RpgState, 'expedition'> & Partial<Pick<RpgState, 'level'>>, encounterIndex = state.expedition?.encounterIndex ?? 0): RpgCombatState {
  const room = Math.max(0, Math.min(5, Math.floor(encounterIndex)));
  const saved = state.expedition?.combat;
  if (saved?.version === 1 && saved.encounterIndex === room) {
    return { ...saved, enemies: saved.enemies.map(enemy => ({ ...enemy })) };
  }
  const difficulty = RPG_REGIONS.find(entry => entry.id === state.expedition?.regionId)?.combatDifficulty ?? 0;
  // Ease new heroes into a horde: three enemies at level one, then one more
  // per level. Saved rooms above return untouched, even after a level-up.
  const levelCap = state.level !== undefined && Number.isFinite(state.level)
    ? Math.max(3, Math.min(10, Math.floor(state.level) + 2)) : 10;
  const count = Math.min([6, 7, 8, 8, 9, 10][room], levelCap);
  return { version: 1, encounterIndex: room, casts: 0, enemies: Array.from({ length: count }, (_, index) => {
    const boss = room === 5 && index === 0;
    const baseHp = (boss ? 36 : index % 7 === 0 ? 12 : [6, 6, 8, 8, 10][index % 5]) + difficulty * (boss ? 8 : 2) + Math.floor(room / 2) * (boss ? 0 : 2);
    const tier = rpgTier(state.expedition?.tier);
    // Health and item power grow together; broad loot rolls can beat the next step.
    const maxHp = Math.ceil(baseHp * (tier + 3) / 4);
    return { id: `enemy-${index}`, hp: maxHp, maxHp };
  }) };
}

/** Combat-only response quality; learning time and mastery remain independent.
 * Reading finishes before this clock starts. Time alone never goes below 50%;
 * each wrong answer removes ten percentage points, with a combined 30% floor. */
export function rpgAnswerPower(answerMs = 0, wrongCount = 0): number {
  const elapsed = Number.isFinite(answerMs) ? Math.max(0, answerMs) : 0;
  const mistakes = Number.isFinite(wrongCount) ? Math.max(0, Math.floor(wrongCount)) : 0;
  const timedPower = Math.max(50, 100 - Math.floor(elapsed / 5000) * 10);
  return Math.max(30, timedPower - mistakes * 10);
}

/** Pure authoritative cast preview; callers persist the returned state atomically. */
export function rpgApplyCombat(state: RpgLoadout, combat: RpgCombatState, spellId = state.selectedSpellId, powerPercent = 100, damageMultiplier = 1): { combat: RpgCombatState; result: RpgCombatResult } {
  const stats = rpgSpellCombatStats(state, spellId);
  const power = Number.isFinite(powerPercent) ? Math.max(30, Math.min(100, powerPercent)) : 100;
  const boost = Number.isFinite(damageMultiplier) ? Math.max(1, Math.min(2, damageMultiplier)) : 1;
  const damage = Math.max(1, Math.round(stats.damage * power / 100 * boost));
  const affix = rpgLootCombatAffix(rpgEquippedLoot(state));
  const next: RpgCombatState = { ...combat, casts: combat.casts + 1, enemies: combat.enemies.map(enemy => ({ ...enemy })) };
  const hits = next.enemies.filter(enemy => enemy.hp > 0).slice(0, stats.targets).map(enemy => {
    const hpBefore = enemy.hp;
    const multiplier = affix === 'opening-strike' && combat.casts === 0 ? 1.25
      : affix === 'boss-slayer' && combat.encounterIndex === 5 && enemy.id === 'enemy-0' ? 1.3 : 1;
    enemy.hp = Math.max(0, enemy.hp - Math.round(damage * multiplier));
    return { enemyId: enemy.id, damage: hpBefore - enemy.hp, hpBefore, hpAfter: enemy.hp };
  });
  const remainingEnemies = next.enemies.filter(enemy => enemy.hp > 0).length;
  return { combat: next, result: { damage, powerPercent: power, coverage: stats.targets, enemiesBefore: combat.enemies.map(enemy => ({ ...enemy })), enemiesAfter: next.enemies.map(enemy => ({ ...enemy })), hits, defeatedIds: hits.filter(hit => hit.hpAfter === 0).map(hit => hit.enemyId), encounterCleared: remainingEnemies === 0, remainingEnemies } };
}

/** Legacy call sites receive a bounded preview of real defeats, not population. */
export function rpgEncounterKills(state: RpgLoadout & Partial<Pick<RpgState, 'expedition' | 'level'>>, encounterIndex: number, spellId = state.selectedSpellId): number {
  return rpgApplyCombat(state, rpgEncounterCombat({ expedition: state.expedition ?? null, level: state.level }, encounterIndex), spellId).result.defeatedIds.length;
}
