import type { RpgLootInstance, RpgState } from '../shared/src/index';

/** Deliberate showcase rolls for local demos, never used by production drops. */
export function addDemoLoot(state: RpgState): void {
  const examples: RpgLootInstance[] = [
    { id: 'demo:skybreaker', itemId: 'skybreaker', bonusPower: 6, upgradeLevel: 0, bonusSkillId: 'tempest_overcharge', bonusSkillRanks: 1, bonusSpellId: 'tempest', bonusSpellPower: 8 },
    { id: 'demo:phoenix', itemId: 'phoenix', bonusPower: 5, upgradeLevel: 0, bonusSkillId: 'ember_echo', bonusSkillRanks: 1, bonusTargets: 1 },
    { id: 'demo:cleaver', itemId: 'cleaver', bonusPower: 4, upgradeLevel: 0, bonusSkillId: 'cleave_sweep', bonusSkillRanks: 1, bonusTargets: 2 },
    { id: 'demo:moonstaff', itemId: 'moonstaff', bonusPower: 6, upgradeLevel: 0, bonusSkillId: 'frost_master', bonusSkillRanks: 2, bonusSchoolId: 'frost', bonusSchoolPower: 4 },
    { id: 'demo:icespear', itemId: 'icespear', bonusPower: 5, upgradeLevel: 0, bonusSkillId: 'ice_lance', bonusSkillRanks: 1, bonusTargets: 1 },
  ];
  state.loot ??= [];
  for (const loot of examples) {
    if (state.inventory.includes(loot.itemId) && !state.loot.some(copy => copy.id === loot.id)) state.loot.push(loot);
  }
}
