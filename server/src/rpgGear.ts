import { z } from 'zod';
import { RPG_GEAR_SLOTS, rpgGearSalvageValue, rpgGearSlotKind, type RpgGearSlot, type RpgState } from '@institute/shared';

/** A refused gear change; the route answers 400 with this child-facing message. */
export class RpgGearError extends Error {}

export const GearEquipSchema = z.object({ profileId: z.string().min(1).max(100), gearId: z.string().min(1).max(100), slot: z.enum(RPG_GEAR_SLOTS as [RpgGearSlot, ...RpgGearSlot[]]) });
export const GearSlotSchema = z.object({ profileId: z.string().min(1).max(100), slot: z.enum(RPG_GEAR_SLOTS as [RpgGearSlot, ...RpgGearSlot[]]) });
export const GearSalvageSchema = z.object({ profileId: z.string().min(1).max(100), gearId: z.string().min(1).max(100) });

/**
 * Puts an owned copy in a slot of its kind (a ring in either ring slot). A copy
 * worn in another slot moves, so one copy never fills two slots. Mutates `state`.
 */
export function rpgEquipGear(state: RpgState, gearId: string, slot: RpgGearSlot): RpgState {
  const item = state.gear?.find(entry => entry.id === gearId);
  if (!item) throw new RpgGearError('Find this gear before wearing it.');
  if (item.kind !== rpgGearSlotKind(slot)) throw new RpgGearError(`This ${item.kind} does not fit there.`);
  const equipped = { ...(state.equippedGear ?? {}) };
  for (const other of RPG_GEAR_SLOTS) if (equipped[other] === gearId) delete equipped[other];
  equipped[slot] = gearId;
  state.equippedGear = equipped;
  return state;
}

export function rpgUnequipGear(state: RpgState, slot: RpgGearSlot): RpgState {
  const equipped = { ...(state.equippedGear ?? {}) };
  delete equipped[slot];
  state.equippedGear = equipped;
  return state;
}

/** Breaks a spare copy into forge dust. A worn copy must come off first. */
export function rpgSalvageGear(state: RpgState, gearId: string): { state: RpgState; forgeDust: number } {
  const item = state.gear?.find(entry => entry.id === gearId);
  if (!item) throw new RpgGearError('This gear is not in your bag.');
  if (Object.values(state.equippedGear ?? {}).includes(gearId)) throw new RpgGearError('Take this gear off before breaking it into forge dust.');
  const forgeDust = rpgGearSalvageValue(item);
  state.gear = state.gear!.filter(entry => entry.id !== gearId);
  state.forgeDust = (state.forgeDust ?? 0) + forgeDust;
  return { state, forgeDust };
}
