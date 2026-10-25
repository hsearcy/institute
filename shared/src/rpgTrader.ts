// The wandering trader: useful wares for forge dust. Every purchase is a real
// subtraction with the hero's own balance ("You have 44 forge dust. The potion
// costs 18. How much is left?"), and the trade completes when the child works
// out the change. These are economy questions, not tutor problems: they never
// enter the attempts table or topic mastery.
import { RPG_ITEMS, type RpgState } from './rpg';
import { rpgTier } from './rpgLoot';

export type RpgTraderWareId = 'wisdom-potion' | 'lucky-charm' | 'fresh-roll';
export const RPG_TRADER_WARE_IDS = ['wisdom-potion', 'lucky-charm', 'fresh-roll'] as const;
export interface RpgTraderWare { id: RpgTraderWareId; name: string; description: string; price: number }

export const RPG_WISDOM_POTION_XP = 30;
export const RPG_MAX_CHEST_CHARMS = 3;

/** A fresh roll costs a little more in deeper dungeons, where its bonuses are bigger. */
export function rpgFreshRollPrice(state: Pick<RpgState, 'bestTier'>): number {
  return 12 + 4 * rpgTier(Math.max(1, state.bestTier ?? 1));
}

export function rpgTraderWares(state: Pick<RpgState, 'bestTier'>): RpgTraderWare[] {
  return [
    { id: 'wisdom-potion', name: 'Wisdom potion', description: `Drink it for +${RPG_WISDOM_POTION_XP} XP right away.`, price: 18 },
    { id: 'lucky-charm', name: 'Lucky charm', description: 'The next chest you unlock holds a relic.', price: 24 },
    { id: 'fresh-roll', name: 'Fresh roll', description: 'A new copy of a relic you own, with brand-new bonuses. Your old copy stays.', price: rpgFreshRollPrice(state) },
  ];
}

/** Why a ware cannot be bought now, or null when it can. */
export function rpgTraderBlocked(state: RpgState, wareId: RpgTraderWareId, itemId?: string): string | null {
  const ware = rpgTraderWares(state).find(entry => entry.id === wareId);
  if (!ware) return 'The trader does not sell that.';
  const dust = state.forgeDust ?? 0;
  if (dust < ware.price) return `You need ${ware.price - dust} more forge dust.`;
  if (wareId === 'lucky-charm' && (state.chestCharms ?? 0) >= RPG_MAX_CHEST_CHARMS) return `Your pack holds ${RPG_MAX_CHEST_CHARMS} charms already. Open a chest first.`;
  if (wareId === 'fresh-roll') {
    if (!itemId || itemId === 'apprentice' || !RPG_ITEMS.some(item => item.id === itemId)) return 'Choose one of your relics.';
    if (!state.inventory.includes(itemId)) return 'Find this relic before asking for a fresh roll.';
  }
  return null;
}

export interface RpgTraderQuestion { text: string; spoken: string; answer: number }
/** The change question, always about his real balance and the real price. */
export function rpgTraderQuestion(dust: number, ware: Pick<RpgTraderWare, 'name' | 'price'>): RpgTraderQuestion {
  const text = `You have ${dust} forge dust. The ${ware.name.toLowerCase()} costs ${ware.price}. How much forge dust will you have left?`;
  return { text, spoken: text, answer: dust - ware.price };
}

/** Gentle steps after a wrong try: tens first, then ones. Never states the final answer. */
export function rpgTraderHint(dust: number, price: number, wrongCount: number): string {
  const tens = Math.floor(price / 10) * 10, ones = price % 10;
  if (price < 10) return `Count back ${price} from ${dust}, one at a time.`;
  if (wrongCount <= 1) return ones
    ? `Take away the tens first: ${dust} take away ${tens}. Then take away ${ones} more.`
    : `Count back ${price / 10} tens from ${dust}.`;
  const afterTens = dust - tens;
  return ones
    ? `${dust} − ${tens} = ${afterTens}. Now count back ${ones} more from ${afterTens}.`
    : `${dust} − ${tens - 10} = ${dust - tens + 10}. One more ten to take away.`;
}

export interface RpgTraderResult {
  state: RpgState;
  forgeDust: number;
  duplicate: boolean;
  wareId: RpgTraderWareId;
  xpGained?: number;
  levelsGained?: number;
  lootId?: string;
}
