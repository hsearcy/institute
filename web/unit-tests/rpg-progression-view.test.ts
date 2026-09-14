import { expect, test } from 'bun:test';
import { RPG_ITEMS, rpgSpellCombatStats, rpgNormalizeLoot, rpgCampOffers, RPG_MAX_DUNGEON_TIER, rpgDungeonForgeDust, type RpgState, type State, type RpgCampState } from '@institute/shared';
import { renderCampWorkshop, renderLootCards, renderPinnedGoal, renderNextDungeonReward, goalSummary, collectionLootChoice, lootComparison, lootStats, lootBonusLabels, itemBaseBonusLabel, relicStatLabels, alternateLootChoices } from '../src/rpg/campView';
import { renderEquipmentView } from '../src/rpg/equipmentView';
import { renderVictoryView } from '../src/rpg/victoryView';

function fixture(): RpgState {
  return rpgNormalizeLoot({ profileId: 'test', xp: 90, level: 2, xpIntoLevel: 0, xpForNextLevel: 110, skillPoints: 1, skills: { ember_power: 1 }, inventory: ['apprentice', 'cinderwand'], equippedItemId: 'apprentice', selectedSpellId: 'ember', appearanceId: 'wayfarer', totalKills: 20, expeditionsCompleted: 1, expedition: null, forgeDust: 10, bestTier: 1, dungeonTier: 1 });
}
const legacy = { gems: 50, quests: [{ key: 'daily', label: 'Solve five problems', target: 5, progress: 5, reward: 25, done: true }], weeklyQuest: { key: 'weekly', label: 'Complete five daily boards', target: 5, progress: 2, reward: 250, done: false } } as State;
const camp = (state: RpgState): RpgCampState => ({ gems: 50, forgeDust: state.forgeDust ?? 0, offers: rpgCampOffers(state) });

test('Camp records show saved math history and all six totals', () => {
  const daily: NonNullable<State['daily']> = {
    day: '2026-09-08', timeZone: 'America/New_York', today: 146, record: 146,
    recordDay: '2026-09-08', isRecord: true,
    history: Array.from({ length: 14 }, (_, i) => ({ day: i < 6 ? `2026-08-${26 + i}` : `2026-09-0${i - 5}`, count: i === 13 ? 146 : 0 })),
    stats: { last7Total: 284, last7Average: 40.6, bestDay: { day: '2026-09-08', count: 146 }, daysPlayed: 51, trackedSolves: 1126, currentStreakDays: 2 },
    tracking: { completeSince: '2026-08-08', backfilled: true }, pendingEvents: [],
  };
  const html = renderCampWorkshop(fixture(), camp(fixture()), { ...legacy, daily }, 'records');
  expect(html).toContain('data-action="records" aria-pressed="true"');
  expect(html).toContain('Your Math Records');
  expect(html).toContain('Problems right each day (last 14 days)');
  expect(html.match(/role="listitem"/g)).toHaveLength(14);
  for (const text of ['Right today', 'Best day ever', 'Last 7 days', 'Days in a row', 'Days played', 'Tracked solves', '284', '40.6', '51', '1126', '146 today, that is your best day EVER!', 'Tuesday 8 Sep (today, best day): 146 right', 'Saturday 8 Aug']) expect(html).toContain(text);
  expect(html).not.toContain('aria-label="Daily quests"');
});

test('Camp records explain missing data without inventing totals', () => {
  const html = renderCampWorkshop(fixture(), camp(fixture()), legacy, 'records');
  expect(html).toContain('Records are unavailable');
  expect(html).not.toContain('Tracked solves');
});

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
  expect(html).toContain('+1 Crystal Shards');
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
  const state = fixture(); state.bestTier = RPG_MAX_DUNGEON_TIER; state.dungeonTier = RPG_MAX_DUNGEON_TIER; state.inventory = RPG_ITEMS.map(item => item.id);
  const html = renderNextDungeonReward(state);
  expect(html).toContain(`${rpgDungeonForgeDust(RPG_MAX_DUNGEON_TIER)} forge dust`);
  expect(html).toContain(`data-tier="${RPG_MAX_DUNGEON_TIER}"`);
  expect(html).not.toContain(`data-tier="${RPG_MAX_DUNGEON_TIER+1}"`);
  expect(html).toContain('chance of stronger power');
  expect(html).not.toContain('Next relic discovery:');
});

test('duplicate rolled treasure is kept, never described as converted out of inventory', () => {
  const state = fixture();
  const loot = { id: 'drop', itemId: 'cinderwand', bonusPower: 3, upgradeLevel: 0 };
  const html = renderVictoryView(state, { xp: 30, kills: 1, levelUp: false, levelsGained: 0, item: RPG_ITEMS.find(item => item.id === 'cinderwand')!, newItems: [], duplicateItem: true, bossDefeated: true, spellId: 'ember', loot, forgeDust: 13 }, 'Guardian');
  expect(html).toContain('BOSS RELIC ROLL'); expect(html).toContain('+3 power');
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
  // Cinderbranch adds 3 Flame power plus rolled +6 to Fire Nova and Heavy Cleave.
  expect(lootComparison(state, 'cinderwand', copy).delta).toBe(9);
  expect(lootComparison({ ...state, selectedSpellId: 'cleave' }, 'cinderwand', copy).delta).toBe(9);
  const html = renderEquipmentView(state, '', true);
  expect(html).toContain('↑ +9 damage');
  expect(html).toContain('Copy 2 of 2');
  expect(html).toContain('Every copy has its own stats');
  expect(html).toContain('Upgrade or reclaim copies');
  expect(html).not.toContain('Your individual copies');
  expect(JSON.stringify(state)).toBe(before);
});

test('an equipped relic advertises a stronger owned copy without silently equipping it', () => {
  const state = fixture();
  state.loot!.push({ id: 'upgrade-copy', itemId: 'apprentice', bonusPower: 2, upgradeLevel: 2 });
  const originalId = state.equippedLootId;
  const html = renderEquipmentView(state, '', true);
  expect(html).toContain('Another copy:');
  expect(html).not.toContain('More damage or targets');
  expect(html).toContain('↑ +6 damage · Same enemy count');
  expect(html).toContain('href="#rpg-loot-upgrade-copy"');
  expect(html).toContain('id="rpg-loot-upgrade-copy"');
  expect(collectionLootChoice(state, 'apprentice')?.id).toBe(originalId);
  expect(state.equippedLootId).toBe(originalId);
  state.equippedLootId = 'upgrade-copy';
  expect(renderEquipmentView(state, '', true)).not.toContain('Another copy:');
});


test('loot shows base affinity and named random modifiers, including inactive skill scope', () => {
  const state = fixture();
  state.inventory.push('moonstaff');
  const copy = { id: 'named', itemId: 'moonstaff', bonusPower: 2, upgradeLevel: 0, bonusSpellId: 'ice_lance' as const, bonusSpellPower: 6, bonusSkillId: 'frost_master', bonusSkillRanks: 2 };
  state.loot!.push(copy);
  const stats = lootStats(copy, state);
  expect(stats).toContain('Ice Lance: +6 damage per target');
  expect(stats).toContain('+2 Winter Crown');
  expect(stats).toContain('+2 power');
  const html = renderEquipmentView(state, '', true);
  expect(html).toContain('+3 Flame power');
  expect(html).toContain('+6 power');
  expect(html).toContain('Ice Lance: +6 damage per target');
  expect(lootStats({ ...copy, bonusSpellId: undefined, bonusSchoolId: 'frost', bonusSchoolPower: 4 }, state)).toContain('+4 Frost power');
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
  expect(html).toContain('+2 targets');
  expect(collectionLootChoice(state, 'apprentice')?.id).toBe('legacy:apprentice');
  state.equippedItemId = 'cinderwand'; state.equippedLootId = 'legacy:cinderwand';
  state.loot![0].bonusPower = 3;
  expect(collectionLootChoice(state, 'apprentice')?.id).toBe('wide');
});


test('Skybreaker compact stats separate element power, immediately active skill ranks and a rare spell roll', () => {
  const state = fixture(), item = RPG_ITEMS.find(item => item.id === 'skybreaker')!;
  const copy = { id: 'skybreaker-copy', itemId: item.id, bonusPower: 2, upgradeLevel: 0, bonusSkillId: 'tempest_overcharge', bonusSkillRanks: 1, bonusTargets: 1 };
  state.inventory.push(item.id); state.loot!.push(copy); state.equippedItemId = item.id; state.equippedLootId = copy.id;
  const original = JSON.stringify(state);
  expect(itemBaseBonusLabel(item)).toBe('+12 Storm power');
  expect(relicStatLabels(item, copy, state)).toEqual(['+12 Storm power', '+2 power', '+1 Overcharge', '+1 target']);
  expect(relicStatLabels(item, { ...copy, bonusSpellId: 'tempest', bonusSpellPower: 8 }, state)).toEqual(['+12 Storm power', '+2 power', '+1 Overcharge', 'Tempest: +8 damage per target', '+1 target']);
  const baseline = { ...state, loot: state.loot!.map(entry => entry.id === copy.id ? { ...entry, bonusSkillRanks: 0 } : entry) };
  expect(rpgSpellCombatStats(state, 'tempest').damage - rpgSpellCombatStats(baseline, 'tempest').damage).toBe(4);
  const html = renderEquipmentView(state, '', true);
  expect(html).not.toContain('Inactive'); expect(html).not.toContain('learn to activate');
  expect(html).not.toContain('fork'); expect(html).not.toContain('Tempest:');
  expect(html).toContain('role="listitem">+1 Overcharge');
  expect(JSON.stringify(state)).toBe(original);
});

test('compact stat labels normalize ranks and allow directly granted spells', () => {
  const state = fixture();
  const copy = { id: 'bonus', itemId: 'skybreaker', bonusPower: 0, upgradeLevel: 0, bonusSkillId: 'tempest', bonusSkillRanks: 2 };
  const original = JSON.stringify(state);
  expect(lootBonusLabels(copy, state)).toEqual(['+2 Tempest']);
  expect(lootBonusLabels({ ...copy, bonusSkillId: 'not-a-skill' }, state)).toEqual([]);
  expect(lootBonusLabels({ ...copy, bonusSkillId: 'tempest_overcharge', bonusSkillRanks: NaN }, state)).toEqual([]);
  expect(lootBonusLabels({ ...copy, bonusSkillId: 'tempest_overcharge', bonusSkillRanks: 99 }, state)).toEqual(['+2 Overcharge']);
  expect(JSON.stringify(state)).toBe(original);
});


test('unequipping a borrowed spell previews the fallback attack on the candidate copy', () => {
  const state = fixture();
  const borrowed = { id: 'borrowed', itemId: 'apprentice', bonusPower: 2, bonusSkillId: 'tempest_overcharge', bonusSkillRanks: 1, upgradeLevel: 0 };
  state.loot!.push(borrowed); state.equippedLootId = borrowed.id; state.selectedSpellId = 'tempest';
  const plain = state.loot!.find(copy => copy.id === 'legacy:cinderwand')!;
  const comparison = lootComparison(state, 'cinderwand', plain);
  expect(comparison.spellId).toBe('cleave');
  expect(comparison.damage).toBe(rpgSpellCombatStats({ ...state, equippedItemId: 'cinderwand', equippedLootId: plain.id }, 'cleave').damage);
  const html = renderEquipmentView(state, '', true);
  expect(html).toContain('Switches to Heavy Cleave');
  expect(html).toContain(`${comparison.damage} damage with Heavy Cleave`);
  expect(state.selectedSpellId).toBe('tempest');
});

test('victory offers unlocked destinations, one selected area, and all lower tiers', () => {
  const state=fixture();state.bestTier=5;state.dungeonTier=5;
  const reward={xp:30,kills:1,levelUp:false,levelsGained:0,item:null,newItems:[],duplicateItem:false,bossDefeated:true,spellId:'ember' as const};
  const html=renderVictoryView(state,reward,'Guardian',null,{regionId:'mosswood',tier:3});
  expect(html).toContain('data-next-region="mosswood" aria-pressed="true"');
  expect(html).toContain('id="rpg-next-tier"');
  expect(html).toContain('value="1"');
  expect(html).toContain('value="3" selected');
  expect(html).not.toContain('value="7"');
  expect(html).toContain('data-action="next-adventure"');
  expect(html).toContain('3%');
});


test('the default next area changes with the random draw, excludes the cleared area, and stays at the played tier', async () => {
  const {chooseNextAdventure}=await import('../src/rpg/nextAdventureView');
  const state=fixture();state.expedition={id:'done',regionId:'embercrypt',tier:1,encounterIndex:5,encountersTotal:6,startedAt:0,cleared:true};
  const first=chooseNextAdventure(state,()=>0),last=chooseNextAdventure(state,()=>.99999);
  expect(first.regionId).not.toBe('embercrypt');expect(last.regionId).not.toBe(first.regionId);
  expect(first.tier).toBe(1);expect(state.expedition.regionId).toBe('embercrypt');
});
