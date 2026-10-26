import { rpgEquippedGear, rpgEquippedLoot, rpgForgeCost, rpgGearReinforceCost, rpgGearReinforceLevel, RPG_MAX_GEAR_REINFORCE, RPG_MAX_ITEM_UPGRADE, type RpgGearInstance, type RpgState } from '@institute/shared';

type ForgeLoadout = Pick<RpgState, 'loot' | 'equippedItemId' | 'equippedLootId' | 'forgeDust'>;

/** Use the same copy, rank limit, and prices as the blacksmith. */
export function equippedForgeReady(state: ForgeLoadout, gems?: number): boolean {
  const copy = rpgEquippedLoot(state);
  if (!copy || copy.upgradeLevel >= RPG_MAX_ITEM_UPGRADE || gems === undefined || !Number.isFinite(gems)) return false;
  const cost = rpgForgeCost(copy);
  return gems >= cost.gems && (state.forgeDust ?? 0) >= cost.dust;
}

/** The first worn armour or jewellery piece the wallet can reinforce now, if any. */
export function equippedGearReinforceReady(state: Pick<RpgState, 'gear' | 'equippedGear' | 'forgeDust'>, gems?: number): RpgGearInstance | undefined {
  if (gems === undefined || !Number.isFinite(gems)) return undefined;
  return Object.values(rpgEquippedGear(state)).find(item => {
    const cost = rpgGearReinforceCost(item!);
    return rpgGearReinforceLevel(item!) < RPG_MAX_GEAR_REINFORCE && gems >= cost.gems && (state.forgeDust ?? 0) >= cost.dust;
  });
}
