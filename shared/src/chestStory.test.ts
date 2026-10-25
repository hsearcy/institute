import { describe, expect, test } from 'bun:test';
import { TOPICS } from './topics.ts';
import { rpgChestStory, rpgChestDustCap } from './chestStory';
import { rpgRoomForgeDust } from './rpgLoot';
import { RPG_TRADER_WARE_IDS, rpgTraderHint, rpgTraderQuestion, rpgTraderWares, rpgTraderBlocked } from './rpgTrader';
import type { RpgState } from './rpg';

const p = (prompt: string, answer: number, topicId?: string) => ({ id: `id-${prompt}`, prompt, answer, topicId });
const kindTopic = (kind: string) => TOPICS.find(topic => topic.gen.kind === kind)!.id;

describe('chest word problems', () => {
  test('a times fact becomes pouches in the chest, and a fitting answer is paid as forge dust', () => {
    const story = rpgChestStory(p('3 × 4', 12, kindTopic('mul')), 1)!;
    expect(story.text).toContain('3');
    expect(story.text).toContain('4 forge dust');
    expect(story).toMatchObject({ treasure: 'dust', counted: 12, forgeDust: 12 });
    expect(story.spoken).toBe(story.text);
  });

  test('a big count becomes gold coins and the chest pays its usual dust', () => {
    const story = rpgChestStory(p('34 + 25', 59), 1)!;
    expect(story).toMatchObject({ treasure: 'gold', counted: 59, forgeDust: null });
    expect(story.text).toContain('gold coins');
    expect(rpgChestDustCap(1)).toBeLessThan(59);
  });

  test('answers below a room’s usual dust never shrink the reward', () => {
    expect(rpgChestStory(p('1 + 1', 2), 1)!.forgeDust).toBeNull();
    expect(rpgRoomForgeDust(1)).toBeGreaterThan(2);
  });

  test('a split or a gap is told as gold: the answer is not the chest’s treasure', () => {
    expect(rpgChestStory(p('12 ÷ 3', 4), 1)).toMatchObject({ treasure: 'gold', counted: null, forgeDust: null });
    expect(rpgChestStory(p('5 + ? = 12', 7), 1)).toMatchObject({ treasure: 'gold', counted: null, forgeDust: null });
    expect(rpgChestStory(p('Half of 18', 9), 1)!.text).toContain('18 gold coins');
  });

  test('subtraction, three addends and doubles are counted treasure', () => {
    expect(rpgChestStory(p('15 − 6', 9), 1)!.text).toMatch(/imp|crack/);
    expect(rpgChestStory(p('2 + 3 + 4', 9), 1)!.text).toContain('three pouches');
    expect(rpgChestStory(p('Double 6', 12), 1)).toMatchObject({ counted: 12, forgeDust: 12 });
  });

  test('a prompt whose arithmetic disagrees with the answer, or an unfit shape or topic, stays plain', () => {
    expect(rpgChestStory(p('3 × 4', 13), 1)).toBeNull();
    expect(rpgChestStory(p('Round 47 to nearest 10', 50), 1)).toBeNull();
    expect(rpgChestStory(p('3 + 4', 7, kindTopic('compare_pick')), 1)).toBeNull();
  });

  test('an empty chest tells no treasure story', () => {
    expect(rpgChestStory(p('3 × 4', 12), 1, false)).toBeNull();
  });

  test('the same problem always gets the same words (client and server agree)', () => {
    expect(rpgChestStory(p('6 × 7', 42), 3)).toEqual(rpgChestStory(p('6 × 7', 42), 3));
  });

  test('chest words never call a problem hard', () => {
    for (const [prompt, answer] of [['3 × 4', 12], ['12 ÷ 3', 4], ['8 + 5', 13], ['9 − 4', 5], ['2 + ? = 9', 7], ['Double 7', 14], ['Half of 10', 5], ['1 + 2 + 3', 6]] as const) {
      expect(rpgChestStory(p(prompt, answer), 1)!.text).not.toMatch(/hard|tricky|tough|confusing/i);
    }
  });
});

describe('the wandering trader', () => {
  const state = (dust: number) => ({ forgeDust: dust, inventory: ['apprentice', 'cinderwand'], chestCharms: 0, bestTier: 1 } as unknown as RpgState);
  test('the change question uses his real balance and the real price', () => {
    const potion = rpgTraderWares(state(44)).find(ware => ware.id === 'wisdom-potion')!;
    const question = rpgTraderQuestion(44, potion);
    expect(question.answer).toBe(44 - potion.price);
    expect(question.text).toContain('You have 44 forge dust');
    expect(question.text).toContain(`costs ${potion.price}`);
  });
  test('hints step through tens then ones without giving the answer', () => {
    const first = rpgTraderHint(44, 18, 1), second = rpgTraderHint(44, 18, 2);
    expect(first).toContain('44 take away 10');
    expect(second).toContain('44 − 10 = 34');
    for (const hint of [first, second]) expect(hint).not.toContain('26');
  });
  test('wares are blocked without enough dust, a relic, or room for charms', () => {
    expect(rpgTraderBlocked(state(5), 'wisdom-potion')).toContain('more forge dust');
    expect(rpgTraderBlocked(state(100), 'fresh-roll')).toContain('Choose');
    expect(rpgTraderBlocked(state(100), 'fresh-roll', 'apprentice')).toContain('Choose');
    expect(rpgTraderBlocked(state(100), 'fresh-roll', 'cinderwand')).toBeNull();
    expect(rpgTraderBlocked({ ...state(100), chestCharms: 3 }, 'lucky-charm')).toContain('charms already');
    expect(RPG_TRADER_WARE_IDS.every(id => rpgTraderWares(state(0)).some(ware => ware.id === id))).toBe(true);
  });
});
