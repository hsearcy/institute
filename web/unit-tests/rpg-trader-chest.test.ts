import { describe, expect, test } from 'bun:test';
import type { Problem, RpgChestReward, RpgState } from '@institute/shared';
import { chestLockStory, chestRewardText } from '../src/rpg/chestLock';
import { TraderDesk, renderTrader } from '../src/rpg/traderView';

const state = (dust = 44, extra: Partial<RpgState> = {}) => ({
  forgeDust: dust, inventory: ['apprentice', 'cinderwand'], chestCharms: 0, bestTier: 1, dungeonTier: 1,
  expedition: { id: 'e', regionId: 'embercrypt', encounterIndex: 0, encountersTotal: 6, cleared: false, startedAt: 0, tier: 1 },
  ...extra,
} as unknown as RpgState);
const problem = (prompt: string, answer: number) => ({ id: 'p1', prompt, answer, skill: 'multiplication', spoken: 'x', difficulty: .5 } as Problem);

describe('chest lock', () => {
  test('tells a fitting problem as the chest’s story, and leaves others plain', () => {
    expect(chestLockStory(problem('3 × 4', 12), state())!.text).toContain('pouches');
    expect(chestLockStory(problem('Round 47 to nearest 10', 50), state())).toBeNull();
  });
  test('the expedition’s spent chests tell no treasure story', () => {
    const spent = state(44, { expedition: { ...state().expedition!, chestsOpened: 8 } });
    expect(chestLockStory(problem('3 × 4', 12), spent)).toBeNull();
  });
  test('the reward line repeats what he counted', () => {
    const base = { chestId: 'c', xp: 16, forgeDust: 12, levelUp: false, levelsGained: 0, item: null, newItems: [], duplicateItem: false, tier: 1 } as RpgChestReward;
    expect(chestRewardText({ ...base, counted: { treasure: 'dust', amount: 12 } })).toContain('You counted 12 forge dust');
    expect(chestRewardText({ ...base, forgeDust: 3, counted: { treasure: 'gold', amount: 59 } })).toContain('59 gold coins');
    expect(chestRewardText({ ...base, xp: 0, forgeDust: 0 })).toContain('empty');
  });
});

describe('trader desk', () => {
  test('a trade completes only with the right change; a wrong try gives a hint and clears the box', () => {
    const desk = new TraderDesk(), s = state(44);
    const ware = desk.begin(s, 'wisdom-potion')!;
    desk.type('9'); desk.type('9');
    expect(desk.check(s).correct).toBe(false);
    expect(desk.hint).toContain('44');
    expect(desk.entered).toBe('');
    for (const digit of String(44 - ware.price)) desk.type(digit);
    const ok = desk.check(s);
    expect(ok.correct).toBe(true);
    expect(ok.purchase).toMatchObject({ wareId: 'wisdom-potion', seenDust: 44, answer: 44 - ware.price });
    expect(ok.purchase!.requestId).toBeTruthy();
  });
  test('a blocked ware cannot be started', () => {
    expect(new TraderDesk().begin(state(3), 'lucky-charm')).toBeNull();
  });
  test('the stall shows the greeting, prices and the ledger for the trade', () => {
    const desk = new TraderDesk(), s = state(44);
    expect(renderTrader(s, desk)).toContain('Tobble');
    desk.begin(s, 'wisdom-potion');
    const html = renderTrader(s, desk);
    expect(html).toContain('You have 44 forge dust');
    expect(html).toContain('rpg-trader-ledger');
  });
});
