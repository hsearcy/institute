import { expect, test } from 'bun:test';
import { RPG_ITEMS, rpgNormalizeLoot, rpgCampOffers, type RpgState, type State, type RpgCampState } from '@institute/shared';
import { renderCampWorkshop, renderLootCards, renderPinnedGoal, renderNextDungeonReward, goalSummary, collectionLootChoice } from '../src/rpg/campView';
import { renderVictoryView } from '../src/rpg/victoryView';

function fixture(): RpgState {
  return rpgNormalizeLoot({ profileId: 'test', xp: 90, level: 2, xpIntoLevel: 0, xpForNextLevel: 110, skillPoints: 1, skills: { ember_power: 1 }, inventory: ['apprentice', 'cinderwand'], equippedItemId: 'apprentice', selectedSpellId: 'ember', appearanceId: 'wayfarer', totalKills: 20, expeditionsCompleted: 1, expedition: null, forgeDust: 10, bestTier: 1, dungeonTier: 1 });
}
const legacy = { gems: 50, quests: [{ key: 'daily', label: 'Solve five problems', target: 5, progress: 5, reward: 25, done: true }], weeklyQuest: { key: 'weekly', label: 'Complete five daily boards', target: 5, progress: 2, reward: 250, done: false } } as State;
const camp = (state: RpgState): RpgCampState => ({ gems: 50, forgeDust: state.forgeDust ?? 0, offers: rpgCampOffers(state) });

test('quest board shows daily completion and separate weekly progress with earned gems', () => {
  const html = renderCampWorkshop(fixture(), camp(fixture()), legacy, 'quests');
  expect(html).toContain('aria-label="Daily quests"');
  expect(html).toContain('aria-label="Weekly quest"');
  expect(html).toContain('Earned · 25 gems');
  expect(html).toContain('2 / 5');
  expect(html).toContain('Reward · 250 gems');
  expect(html).toContain('ordinary play after the board is done');
});

test('merchant disables unaffordable and owned items while leaving a precise savings goal', () => {
  const state = fixture(); state.goal = { kind: 'item', id: 'cleaver' };
  const view = renderCampWorkshop(state, camp(state), legacy, 'merchant');
  expect(view).toMatch(/data-buy-item="cinderwand" disabled/);
  expect(view).toMatch(/data-buy-item="cleaver" disabled/);
  const offer = camp(state).offers.find(item => item.itemId === 'cleaver')!;
  expect(renderPinnedGoal(state, camp(state))).toContain(`${offer.price - 50} more gems`);
});

test('rolled gear compares actual spell damage and protects equipped and last copies', () => {
  const state = fixture();
  state.loot!.push({ id: 'better', itemId: 'apprentice', bonusPower: 4, bonusSkillId: 'frost_shards', bonusSkillRanks: 1, upgradeLevel: 1 });
  const html = renderLootCards(state, 100, true);
  expect(html).toContain('+6 power');
  expect(html).toContain('Crystal Shards (learn to activate)');
  expect(html).toContain('(+6 vs equipped)');
  expect(html).toMatch(/data-salvage-loot="legacy:apprentice" disabled/);
  expect(html).toMatch(/data-salvage-loot="legacy:cinderwand" disabled/);
  expect(html).toMatch(/data-salvage-loot="better"  title/);
  expect(html).not.toContain('data-confirm-salvage');
});

test('upgrade target shows exact missing resources and handles a completed forge ladder', () => {
  const state = fixture(); state.goal = { kind: 'upgrade', id: state.equippedLootId! };
  expect(goalSummary(state, 12)?.detail).toBe('13 more gems · 0 more forge dust');
  state.loot![0].upgradeLevel = 5;
  expect(goalSummary(state, 999)?.detail).toContain('Fully forged!');
});

test('maximum tier still offers exact repeatable materials without promising better random stats', () => {
  const state = fixture(); state.bestTier = 10; state.dungeonTier = 10; state.inventory = RPG_ITEMS.map(item => item.id);
  const html = renderNextDungeonReward(state);
  expect(html).toContain('100 forge dust');
  expect(html).toContain('data-tier="10"');
  expect(html).not.toContain('data-tier="11"');
  expect(html).toContain('chance of stronger power');
  expect(html).not.toContain('Next relic discovery:');
});

test('duplicate rolled treasure is kept, never described as converted out of inventory', () => {
  const state = fixture();
  const loot = { id: 'drop', itemId: 'cinderwand', bonusPower: 3, upgradeLevel: 0 };
  const html = renderVictoryView(state, { xp: 30, kills: 1, levelUp: false, levelsGained: 0, item: RPG_ITEMS.find(item => item.id === 'cinderwand')!, newItems: [], duplicateItem: true, bossDefeated: true, spellId: 'ember', loot, forgeDust: 13 }, 'Guardian');
  expect(html).toContain('NEW RELIC ROLL'); expect(html).toContain('+3 power');
  expect(html).toContain('+13 forge dust'); expect(html).not.toContain('Converted into');
});


test('clicking the equipped collection item preserves its selected forged roll', () => {
  const state = fixture();
  state.loot!.push({ id: 'favorite', itemId: 'apprentice', bonusPower: 2, upgradeLevel: 3 });
  state.loot!.push({ id: 'other', itemId: 'apprentice', bonusPower: 12, upgradeLevel: 0 });
  state.equippedLootId = 'favorite';
  expect(collectionLootChoice(state, 'apprentice')?.id).toBe('favorite');
  expect(state.equippedLootId).toBe('favorite');
});

test('switching collection items chooses the copy with best actual spell damage', () => {
  const state = fixture();
  state.loot!.push({ id: 'raw-power', itemId: 'cinderwand', bonusPower: 4, upgradeLevel: 0 });
  state.loot!.push({ id: 'skill-bonus', itemId: 'cinderwand', bonusPower: 1, bonusSkillId: 'ember_power', bonusSkillRanks: 2, upgradeLevel: 0 });
  expect(collectionLootChoice(state, 'cinderwand')?.id).toBe('skill-bonus');
  expect(collectionLootChoice(state, 'missing')).toBeUndefined();
  expect(state.equippedLootId).toBe('legacy:apprentice');
});
