import { describe, expect, test } from 'bun:test';
import { TOPICS } from './topics.ts';
import { rpgChestStory, rpgChestDustCap, rpgShrineStory } from './chestStory';
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

  test('a prompt whose arithmetic disagrees with the answer, or that cannot be read, stays plain', () => {
    expect(rpgChestStory(p('3 × 4', 13), 1)).toBeNull();
    expect(rpgChestStory(p('What time is it?', 3), 1)).toBeNull();
  });

  test('a spent chest still tells a story, of old copper coins it does not pay', () => {
    const story = rpgChestStory(p('3 × 4', 12), 1, false)!;
    expect(story.text).toContain('old copper coins');
    expect(story).toMatchObject({ treasure: 'gold', counted: 12, forgeDust: null });
  });

  test('every topic\'s problems are told as a chest story, with the numbers the problem uses', () => {
    const forms: [string, number, string[]][] = [
      ['34, then?', 35, ['34']], ['15, 12, 9, ?', 6, ['15', '12', '9', 'shrink']], ['4 tens 6 ones', 46, ['4 bags', '6 loose']],
      ['2 hundreds 4 tens 9 ones', 249, ['2 big sacks', '4 bags', '9 loose']], ['? − 10 = 1', 11, ['10', '1']], ['38 − ? = 37', 1, ['38', '37']],
      ['3 × ? = 18', 6, ['3 pouches', '18']], ['40 ÷ ? = 8', 5, ['40', '8']], ['Smaller: 17 or 42?', 17, ['17', '42', 'fewer']],
      ['Even one: 3, 16, 1', 16, ['3, 16 and 1', 'none left over']], ['3 pennys + 1 dime = ?¢', 13, ['3 pennies and 1 dime']],
      ['1 quarter = ?¢', 25, ['1 quarter']], ['How many dimes make 40¢?', 4, ['40 cents', 'dimes']], ['10¢ + ?¢ = 60¢', 50, ['10 cents', '60 cents']],
      ['Round 59 to nearest 10', 60, ['59', 'nearest ten']], ['About 40 + 31?', 70, ['40', '31']], ['13 ÷ 4, leftover?', 1, ['13', 'piles of 4']],
      ['2/5 of 30', 12, ['30', '5 equal piles', 'take 2']], ['Pay 50¢ for 15¢, change?', 35, ['15 cents', '50 cents']],
      ['5:20 to 5:40, minutes?', 20, ['5:40', '5:20']], ['Minutes in 2 hours?', 120, ['2 hours']], ['Square, side 2, all around?', 8, ['square', '2 long']],
      ['Rectangle 5 by 8, all around?', 26, ['8 long and 5 wide']], ['3 rows of 7 tiles, total?', 21, ['3 rows', '7 coins in each']], ['8 + 7 = ?', 15, ['8', '7']],
    ];
    for (const [prompt, answer, words] of forms) {
      const story = rpgChestStory(p(prompt, answer), 2);
      expect(story, prompt).not.toBeNull();
      for (const word of words) expect(story!.text, prompt).toContain(word);
      expect(story!.text).not.toMatch(/\b(hard|tricky|tough|confusing)\b/i);
    }
  });

  test('one coin, sack or bag reads as one, not as many', () => {
    for (const id of ['a', 'b', 'c', 'd']) {
      const text = rpgChestStory({ id, prompt: '1 + 1', answer: 2 }, 1)!.text;
      expect(text).toContain('1 gold coin');
      expect(text).not.toMatch(/1 gold coins|1 more are/);
    }
    expect(rpgChestStory(p('1 hundreds 1 tens 1 ones', 111), 1)!.text).toContain('1 big sack of one hundred gold coins, 1 bag of ten, and 1 loose coin');
  });

  test('a story is told only when its numbers give the problem\'s answer', () => {
    expect(rpgChestStory(p('15, 12, 9, ?', 7), 1)).toBeNull();
    expect(rpgChestStory(p('Even one: 2, 16, 1', 2), 1)).toBeNull();
    expect(rpgChestStory(p('Round 59 to nearest 10', 50), 1)).toBeNull();
    expect(rpgChestStory(p('2 dragons = ?¢', 2), 1)).toBeNull();
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

describe('shrine word problems', () => {
  test('a shrine tells the same problem with its own numbers, in candles, runes and sparks', () => {
    for (const [prompt, answer, numbers] of [['3 × 4', 12, ['3', '4']], ['12 ÷ 3', 4, ['12', '3']], ['7 + 5', 12, ['7', '5']], ['9 - 4', 5, ['9', '4']], ['2 + 3 + 4', 9, ['2', '3', '4']], ['3 + ? = 8', 5, ['8', '3']], ['Double 6', 12, ['6']], ['Half of 10', 5, ['10']]] as const) {
      const story = rpgShrineStory(p(prompt, answer))!;
      expect(story.spoken).toBe(story.text);
      expect(story.text).toMatch(/candle|rune|spark/);
      expect(story.text).not.toMatch(/chest|coin|forge dust/);
      for (const number of numbers) expect(story.text).toContain(number);
    }
  });

  test('a prompt whose math disagrees with its answer, or a kind that reads badly as a story, stays plain', () => {
    expect(rpgShrineStory(p('3 × 4', 13))).toBeNull();
    expect(rpgShrineStory(p('What time is it?', 3))).toBeNull();
  });
});
