import { expect, test } from 'bun:test';
import { RPG_ITEMS, rpgSpellCombatStats, rpgNormalizeLoot, rpgCampOffers, type RpgState, type State, type RpgCampState } from '@institute/shared';
import { renderCampWorkshop, renderLootCards, renderPinnedGoal, renderNextDungeonReward, goalSummary, collectionLootChoice, lootComparison, lootStats, lootBonusLabels, itemBaseBonusLabel, alternateLootChoices } from '../src/rpg/campView';
import { renderEquipmentView } from '../src/rpg/equipmentView';
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
  expect(html).toContain('+6 damage to each enemy with every attack.');
  expect(html).toContain('Learn Crystal Shards in the skill tree to activate this bonus.');
  expect(html).toContain('↑ +6 damage');
  expect(html).toContain('Copy 2 of 2');
  expect(html).toContain('Copy 1 of 2');
  expect(html).toContain('Only copy');
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
  expect(html).toContain('NEW RELIC ROLL'); expect(html).toContain('+3 damage to each enemy with every attack.');
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


test('equipment preview respects spell affinity and copy bonuses without mutating saved loadout', () => {
  const state = fixture();
  state.loot!.push({ id: 'duplicate', itemId: 'cinderwand', bonusPower: 4, upgradeLevel: 1 });
  const before = JSON.stringify(state), copy = state.loot!.at(-1)!;
  // Cinderbranch adds 3 Fire Nova power; its rolled +6 also works with Heavy Cleave.
  expect(lootComparison(state, 'cinderwand', copy).delta).toBe(9);
  expect(lootComparison({ ...state, selectedSpellId: 'cleave' }, 'cinderwand', copy).delta).toBe(6);
  const html = renderEquipmentView(state, '', true);
  expect(html).toContain('↑ +9 damage');
  expect(html).toContain('2 copies');
  expect(html).toContain('their powers do not add together');
  expect(html).toContain('Your equipped copy and last copy are protected');
  expect(JSON.stringify(state)).toBe(before);
});

test('an equipped relic advertises a stronger owned copy without silently equipping it', () => {
  const state = fixture();
  state.loot!.push({ id: 'upgrade-copy', itemId: 'apprentice', bonusPower: 2, upgradeLevel: 2 });
  const originalId = state.equippedLootId;
  const html = renderEquipmentView(state, '', true);
  expect(html).toContain('Compare copies below ↓');
  expect(html).toContain('↑ +6 damage · Same enemy count');
  expect(html).toContain('href="#rpg-loot-upgrade-copy"');
  expect(html).toContain('id="rpg-loot-upgrade-copy"');
  expect(collectionLootChoice(state, 'apprentice')?.id).toBe(originalId);
  expect(state.equippedLootId).toBe(originalId);
  state.equippedLootId = 'upgrade-copy';
  expect(renderEquipmentView(state, '', true)).not.toContain('Compare copies below ↓');
});


test('loot shows base affinity and named random modifiers, including inactive skill scope', () => {
  const state = fixture();
  state.inventory.push('moonstaff');
  const copy = { id: 'named', itemId: 'moonstaff', bonusPower: 2, upgradeLevel: 0, bonusSpellId: 'ice_lance' as const, bonusSpellPower: 6, bonusSkillId: 'frost_master', bonusSkillRanks: 2 };
  state.loot!.push(copy);
  const stats = lootStats(copy, state);
  expect(stats).toContain('+6 damage to each enemy with your Ice Lance spell.');
  expect(stats).toContain('Winter Crown upgrade for all Frost attacks: +12 damage to each enemy (2 bonus ranks). Inactive.');
  expect(stats).toContain('+2 damage to each enemy with every attack.');
  const html = renderEquipmentView(state, '', true);
  expect(html).toContain('Your Fire Nova spell leaves burning embers and deals 3 more damage to each enemy.');
  expect(html).toContain('Every attack deals 4 more damage to each enemy.');
  expect(html).toContain('+6 damage to each enemy with your Ice Lance spell.');
  expect(lootStats({ ...copy, bonusSpellId: undefined, bonusSchoolId: 'frost', bonusSchoolPower: 4 }, state)).toContain('+4 damage to each enemy with all Frost attacks.');
});

test('lower-damage wider copies remain discoverable with both sides of the tradeoff', () => {
  const state = fixture();
  state.selectedSpellId = 'cleave';
  state.loot![0].bonusPower = 6;
  const wide = { id: 'wide', itemId: 'apprentice', bonusPower: 3, upgradeLevel: 0, bonusTargets: 2 };
  state.loot!.push(wide);
  expect(lootComparison(state, 'apprentice', wide)).toMatchObject({ delta: -3, targetDelta: 2, targets: 5 });
  expect(alternateLootChoices(state, 'apprentice').map(choice => choice.copy.id)).toEqual(['wide']);
  const html = renderEquipmentView(state, '', true);
  expect(html).toContain('↓ -3 damage · ↑ +2 enemies');
  expect(html).toContain('href="#rpg-loot-wide"');
  expect(html).toContain('Each attack can hit 2 extra enemies, up to 10 total.');
  expect(collectionLootChoice(state, 'apprentice')?.id).toBe('legacy:apprentice');
  state.equippedItemId = 'cinderwand'; state.equippedLootId = 'legacy:cinderwand';
  state.loot![0].bonusPower = 3;
  expect(collectionLootChoice(state, 'apprentice')?.id).toBe('wide');
});


test('Skybreaker explains Tempest and Overcharge bonuses while respecting active rank and enemy caps', () => {
  const state = fixture();
  const skybreaker = RPG_ITEMS.find(item => item.id === 'skybreaker')!;
  const copy = { id: 'skybreaker-copy', itemId: skybreaker.id, bonusPower: 0, upgradeLevel: 0, bonusSkillId: 'tempest_overcharge', bonusSkillRanks: 1, bonusTargets: 1 };
  state.inventory.push(skybreaker.id); state.loot!.push(copy); state.selectedSpellId = 'tempest';
  state.equippedItemId = skybreaker.id; state.equippedLootId = copy.id;
  expect(itemBaseBonusLabel(skybreaker)).toBe('Your Tempest spell forks its lightning strikes and deals 12 more damage to each enemy.');
  const original = JSON.stringify(state), inactive = lootBonusLabels(copy, state).join(' ');
  expect(inactive).toContain('Overcharge upgrade for your Tempest spell: +4 damage to each enemy (1 bonus rank).');
  expect(inactive).toContain('Inactive. Learn Overcharge in the skill tree to activate this bonus.');
  expect(inactive).toContain('Each attack can hit 1 extra enemy, up to 10 total.');
  expect(inactive).not.toContain('can hit 1 extra enemy (1 bonus rank)');
  const baseline = { ...state, loot: state.loot!.map(item => item.id === copy.id ? { ...item, bonusSkillId: undefined, bonusSkillRanks: undefined } : item) };
  expect(rpgSpellCombatStats(state)).toEqual(rpgSpellCombatStats(baseline));
  expect(JSON.stringify(state)).toBe(original);
  state.skills.tempest = 1; state.skills.tempest_overcharge = 1;
  const beforeActive = JSON.stringify(state), active = lootBonusLabels(copy, state).join(' ');
  const actual = rpgSpellCombatStats(state), without = rpgSpellCombatStats({ ...baseline, skills: state.skills });
  expect(actual.damage - without.damage).toBe(4); expect(actual.targets).toBe(10); expect(without.targets).toBe(10);
  expect(active).toContain('+4 damage to each enemy'); expect(active).toContain('The extra-enemy limit is already reached.');
  expect(active).not.toContain('Inactive'); expect(JSON.stringify(state)).toBe(beforeActive);
  copy.bonusTargets = 0;
  const wider = lootBonusLabels(copy, state).join(' ');
  const beforeRanks = rpgSpellCombatStats({ ...state, loot: state.loot!.map(item => item.id === copy.id ? { ...item, bonusSkillRanks: 0 } : item) });
  expect(rpgSpellCombatStats(state).targets - beforeRanks.targets).toBe(1);
  expect(wider).toContain('+4 damage to each enemy and can hit 1 extra enemy');
  state.skills.tempest_overcharge = 2; copy.bonusSkillRanks = 99;
  expect(lootBonusLabels(copy, state).join(' ')).toContain('+8 damage to each enemy (2 bonus ranks).');
  expect(lootBonusLabels(copy, state).join(' ')).toContain('The extra-enemy limit is already reached.');
});

test('invalid or unlock-only bonus ranks never advertise an inactive or free ability', () => {
  const state = fixture();
  const copy = { id: 'malformed', itemId: 'skybreaker', bonusPower: 0, upgradeLevel: 0, bonusSkillId: 'tempest', bonusSkillRanks: 2 };
  const original = JSON.stringify(state);
  expect(lootBonusLabels(copy, state)).toEqual([]);
  expect(lootBonusLabels({ ...copy, bonusSkillId: 'not-a-skill' }, state)).toEqual([]);
  expect(lootBonusLabels({ ...copy, bonusSkillId: 'tempest_overcharge', bonusSkillRanks: NaN }, state)).toEqual([]);
  expect(lootBonusLabels({ ...copy, bonusSkillId: 'tempest_overcharge', bonusSkillRanks: 0 }, state)).toEqual([]);
  expect(JSON.stringify(state)).toBe(original);
});
