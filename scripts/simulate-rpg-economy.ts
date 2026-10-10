/** Run: bun scripts/simulate-rpg-economy.ts
 * Gameplay-only pacing estimates: use authoritative combat/cost helpers, never
 * mutate a profile or alter tutor difficulty. Gem scenarios exclude daily and
 * weekly bonuses so the report describes continuing after quests are finished.
 */
import {
  RPG_ITEMS, RPG_SKILLS, rpgApplyCombat, rpgEncounterCombat, rpgDungeonForgeDust,
  rpgForgeCost, rpgMerchantPrice, rpgSpellCombatStats, type RpgState,
} from '../shared/src/index';

function profile(itemId: string, bonusPower: number, upgradeLevel: number,
  skills: Record<string, number> = {}, selectedSpellId: RpgState['selectedSpellId'] = 'ember'): RpgState {
  return {
    profileId: 'pacing-simulation', xp: 0, level: 1 + Object.values(skills).reduce((sum, rank) => sum + rank, 0), xpIntoLevel: 0, xpForNextLevel: 100,
    skillPoints: 0, skills, inventory: [itemId], equippedItemId: itemId, selectedSpellId,
    appearanceId: 'wayfarer', totalKills: 0, expeditionsCompleted: 0, expedition: null,
    loot: [{ id: 'gear', itemId, bonusPower, upgradeLevel }], equippedLootId: 'gear',
  };
}

const loadouts = [
  { name: 'Starter Heavy Cleave', state: profile('apprentice', 0, 0, {}, 'cleave') },
  { name: 'Early Cinderbranch +2 roll, forge +1', state: profile('cinderwand', 2, 1, { ember_power: 1 }) },
  { name: 'Mid Flame specialist', state: profile('sunforged', 4, 2, { ember_power: 3, ember_echo: 1, ember_master: 1, meteor: 1, meteor_shower: 1 }, 'meteor') },
  { name: 'Maximum Flame build', state: profile('inferno', 12, 5,
    Object.fromEntries(RPG_SKILLS.filter(skill => skill.school === 'ember').map(skill => [skill.id, skill.maxRank])), 'firestorm') },
  { name: 'Maximum Frost build', state: profile('wardenheart', 12, 5,
    Object.fromEntries(RPG_SKILLS.filter(skill => skill.school === 'frost').map(skill => [skill.id, skill.maxRank])), 'frost_guardian') },
  { name: 'Maximum Storm build', state: profile('skybreaker', 12, 5,
    Object.fromEntries(RPG_SKILLS.filter(skill => skill.school === 'storm').map(skill => [skill.id, skill.maxRank])), 'tempest') },
];
for (const loadout of loadouts.filter(loadout => loadout.name.startsWith('Maximum'))) {
  const school = loadout.name.includes('Flame') ? 'ember' : loadout.name.includes('Frost') ? 'frost' : 'storm';
  Object.assign(loadout.state.loot![0]!, { bonusSkillId: `${school}_master`, bonusSkillRanks: 2 });
}

function simulate(state: RpgState, tier: number) {
  let casts = 0, singleCastRooms = 0;
  const perRoom: number[] = [];
  for (let room = 0; room < 6; room++) {
    const expedition = { id: 'simulation', regionId: 'embercrypt', tier, encounterIndex: room, encountersTotal: 6, cleared: false, startedAt: 0 };
    let combat = rpgEncounterCombat({ expedition, level: state.level });
    let roomCasts = 0;
    while (combat.enemies.some(enemy => enemy.hp > 0) && roomCasts < 1000) {
      combat = rpgApplyCombat(state, combat).combat;
      roomCasts++;
    }
    if (combat.enemies.some(enemy => enemy.hp > 0)) throw new Error('Simulation exceeded 1,000 casts in one room.');
    if (roomCasts === 1) singleCastRooms++;
    casts += roomCasts; perRoom.push(roomCasts);
  }
  return { tier, casts, perRoom, singleCastRooms, dust: rpgDungeonForgeDust(tier),
    // Existing tutor: a solved retry earns one gem; sustained first-try streaks
    // earn roughly three per solve after ten. These are bounds/scenarios, not a
    // promise about the child's accuracy. Quests are omitted.
    gemsWithoutStreak: casts, gemsSustainedStreakApprox: casts * 3 };
}

const costs = Array.from({ length: 5 }, (_, upgradeLevel) => ({ level: upgradeLevel + 1, ...rpgForgeCost({ upgradeLevel }) }));
const totalGems = costs.reduce((sum, cost) => sum + cost.gems, 0);
const totalDust = costs.reduce((sum, cost) => sum + cost.dust, 0);
const rows = loadouts.map(({ name, state }) => ({ name, stats: rpgSpellCombatStats(state), tiers: [1, 4, 7, 10].map(tier => simulate(state, tier)) }));
console.log(JSON.stringify({ assumptions: 'Six-room Embercrypt; fixed loadouts and levels (one plus spent skill ranks), without mid-run leveling; existing HP, costs and dust; no quest or hoard gems; one fast correct solve per full-power cast. Skips do not cast; slower answers and wrong attempts need more casts.',
  merchant: RPG_ITEMS.flatMap(item => { const gems = rpgMerchantPrice(item); return gems === null ? [] : [{ item: item.name, gems }]; }),
  upgradeCosts: costs, completeForgeLadder: { gems: totalGems, dust: totalDust,
    solvesAtOneGem: totalGems, solvesAtSustainedStreakApprox: Math.ceil(totalGems / 3),
    tierOneClearsForDust: Math.ceil(totalDust / rpgDungeonForgeDust(1)) },
  combat: rows,
}, null, 2));
