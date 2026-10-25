import { rpgLootSpellShape, rpgLootCombatAffix, RPG_ITEMS, rpgSpellAvailable, rpgLootSkillBonus, RPG_SCHOOLS, RPG_SPELLS, RPG_SKILLS, rpgLootAffixes, RPG_REGIONS, RPG_MAX_ITEM_UPGRADE, rpgForgeCost, rpgLootPower, rpgEquippedLoot, rpgSalvageValue, rpgUnlockedTier, rpgDungeonForgeDust, rpgNextRelicHunt, rpgSpellCombatStats, type RpgItem, type RpgState, type RpgLootInstance, type RpgCampState, type State, type Quest } from '@institute/shared';
import { renderMathRecords } from './recordsView';
import { escapeHtml as esc, relicArt, icon } from './icons';
import { renderTrader, type TraderDesk } from './traderView';

export type CampTab = 'quests' | 'merchant' | 'trader' | 'forge' | 'records';
export function itemAffinity(item: RpgItem): string {
  return item.scope === 'all' ? 'Every spell' : item.scope === 'school'
    ? `All ${RPG_SCHOOLS.find(school => school.id === item.school)!.name} spells`
    : RPG_SPELLS.find(spell => spell.id === item.spellId)!.name;
}
/** Compact stat lines. Specific spell damage only appears on copies that rolled it. */
export function itemBaseBonusLabel(item: RpgItem): string {
  const school = item.scope === 'school' ? RPG_SCHOOLS.find(school => school.id === item.school)?.name : undefined;
  return item.power ? `+${item.power} ${school ? school + ' ' : ''}power` : 'No bonus power';
}
export function lootBonusLabels(loot: RpgLootInstance, _state: RpgState, includePower = true): string[] {
  const affixes = rpgLootAffixes(loot), bonus = rpgLootSkillBonus(loot);
  const labels: string[] = [];
  if (includePower && rpgLootPower(loot)) labels.push(`+${rpgLootPower(loot)} power`);
  if (bonus) labels.push(`+${bonus.ranks} ${RPG_SKILLS.find(skill => skill.id === bonus.skillId)!.name}`);
  if (affixes.spellId) labels.push(`${RPG_SPELLS.find(spell => spell.id === affixes.spellId)!.name}: +${affixes.spellPower} damage per target`);
  if (affixes.schoolId) labels.push(`+${affixes.schoolPower} ${RPG_SCHOOLS.find(school => school.id === affixes.schoolId)!.name} power`);
  if (affixes.targets) labels.push(`+${affixes.targets} ${affixes.targets === 1 ? 'target' : 'targets'}`);
  const shape = rpgLootSpellShape(loot), trait = rpgLootCombatAffix(loot);
  if (shape) labels.push(shape.name + ': ' + shape.label + ' · Grants spell while equipped');
  if (trait === 'opening-strike') labels.push('Opening strike: +25% damage on the first cast in each room');
  if (trait === 'boss-slayer') labels.push('Boss slayer: +30% damage to the guardian');
  return labels;
}
export function relicStatLabels(item: RpgItem, loot: RpgLootInstance | undefined, state: RpgState): string[] {
  if (item.scope === 'all') {
    const power = item.power + rpgLootPower(loot);
    return [...(power ? [`+${power} power`] : []), ...(loot ? lootBonusLabels(loot, state, false) : [])];
  }
  return [...(item.power ? [itemBaseBonusLabel(item)] : []), ...(loot ? lootBonusLabels(loot, state) : [])];
}
export function renderRelicStats(item: RpgItem, loot: RpgLootInstance | undefined, state: RpgState): string {
  const labels = relicStatLabels(item, loot, state);
  return `<span class="rpg-compact-stats" role="list" aria-label="Relic stats">${(labels.length ? labels : ['No bonus stats']).map(label => `<span role="listitem">${esc(label)}</span>`).join('')}</span>`;
}
export function lootStats(loot: RpgLootInstance, state: RpgState): string {
  return [...lootBonusLabels(loot, state), ...(loot.upgradeLevel ? [`Forge ${loot.upgradeLevel}/${RPG_MAX_ITEM_UPGRADE}`] : [])].join(' · ') || 'Original copy · no extra bonuses';
}
export function goalSummary(state: RpgState, gems?: number): { title: string; detail: string; action: string } | null {
  const goal = state.goal;
  if (!goal) return null;
  if (goal.kind === 'item') {
    const item = RPG_ITEMS.find(item => item.id === goal.id); if (!item) return null;
    const found = state.inventory.includes(item.id);
    return { title: item.name, detail: found ? 'Goal reached! Choose your next treasure.' : `Find in dungeons${Math.max(0, item.requiredClears - state.expeditionsCompleted) ? ` · ${item.requiredClears - state.expeditionsCompleted} more clears to unlock` : ''}`, action: found ? 'inventory' : item.rarity === 'legendary' ? 'map' : 'merchant' };
  }
  if (goal.kind === 'upgrade') {
    const loot = state.loot?.find(loot => loot.id === goal.id); if (!loot) return null;
    const item = RPG_ITEMS.find(item => item.id === loot.itemId)!;
    if (loot.upgradeLevel >= RPG_MAX_ITEM_UPGRADE) return { title: item.name, detail: 'Fully forged! Hunt a new roll or strengthen another relic.', action: 'forge' };
    const cost = rpgForgeCost(loot);
    return { title: `${item.name} · Forge ${loot.upgradeLevel + 1}`, detail: gems !== undefined && gems >= cost.gems && (state.forgeDust ?? 0) >= cost.dust ? `✓ Ready to forge · ${cost.gems} gems + ${cost.dust} dust` : `${gems === undefined ? `${cost.gems} gems` : `${Math.max(0, cost.gems - gems)} more gems`} · ${Math.max(0, cost.dust - (state.forgeDust ?? 0))} more forge dust`, action: 'forge' };
  }
  const skill = RPG_SKILLS.find(skill => skill.id === goal.id); if (!skill) return null;
  const rank = state.skills[skill.id] ?? 0;
  return { title: skill.name, detail: rank >= skill.maxRank ? 'Mastered! Pick your next goal.' : `${rank}/${skill.maxRank} ranks · ${state.level < skill.level ? `Level ${skill.level}` : skill.parentId && !state.skills[skill.parentId] ? `First learn ${RPG_SKILLS.find(entry => entry.id === skill.parentId)!.name}` : state.skillPoints ? 'Ready to spend a skill point' : `${state.xpForNextLevel - state.xpIntoLevel} XP to another skill point`}`, action: 'skills' };
}
export function renderPinnedGoal(state: RpgState, camp?: RpgCampState | null, compact = false): string {
  const goal = goalSummary(state, camp?.gems); if (!goal) return '';
  if (state.goal?.kind === 'item' && !state.inventory.includes(state.goal.id)) {
    const offer = camp?.offers.find(offer => offer.itemId === state.goal!.id);
    if (offer) goal.detail = offer.available && camp!.gems >= offer.price ? `✓ Ready to buy · ${offer.price} gems` : `${Math.max(0, offer.price - camp!.gems)} more gems${offer.requiredClears > state.expeditionsCompleted ? ` · ${offer.requiredClears - state.expeditionsCompleted} more clears` : ' · Merchant'}`;
  }
  return `${!compact ? '<div class="rpg-pinned-wrap">' : ''}<button class="${compact ? '' : 'rpg-pinned-goal'}" data-action="${goal.action}">${icon('ring')}<span><small>YOUR GOAL</small><strong>${esc(goal.title)}</strong><span>${esc(goal.detail)}</span></span></button>${!compact ? '<button class="rpg-text-button rpg-goal-clear" data-action="clear-goal" aria-label="Unpin goal">Unpin</button></div>' : ''}`;
}
function questCard(quest: Quest): string {
  const progress = Math.min(quest.target, quest.progress);
  return `<article class="rpg-quest-card ${quest.done ? 'complete' : ''}" data-quest="${esc(quest.key)}"><div><h3>${esc(quest.label)}</h3><span>${quest.done ? '✓ Complete' : `${progress} / ${quest.target}`}</span></div><progress max="${quest.target}" value="${progress}" aria-label="${esc(quest.label)}"></progress><small>${quest.done ? 'Earned' : 'Reward'} · ${quest.reward} gems</small></article>`;
}
export function renderCampWorkshop(state: RpgState, camp: RpgCampState, legacy: State, tab: CampTab, trader?: TraderDesk): string {
  let body = '';
  if (tab === 'trader' && trader) body = renderTrader(state, trader);
  if (tab === 'quests') body = `<section aria-label="Daily quests"><div class="rpg-workshop-heading"><h3>Today’s adventures</h3><span>${legacy.quests.filter(quest => quest.done).length} / ${legacy.quests.length} complete</span></div><div class="rpg-quest-grid">${legacy.quests.map(questCard).join('')}</div><p class="rpg-workshop-note">Complete every daily quest to earn a Crazy Coin. Your gems keep growing through ordinary play after the board is done.</p></section><section aria-label="Weekly quest"><h3>This week</h3>${questCard(legacy.weeklyQuest)}</section><button class="rpg-primary" data-action="map">Choose an adventure →</button>`;
  if (tab === 'merchant') body = `<p>Save your gems for a relic you choose. Dungeon finds can also carry extra power and skill ranks.</p><div class="rpg-merchant-grid">${camp.offers.map(offer => {
    const item = RPG_ITEMS.find(item => item.id === offer.itemId)!;
    const pinned = state.goal?.kind === 'item' && state.goal.id === item.id;
    return `<article class="rpg-market-card ${item.rarity}" data-offer="${item.id}">${relicArt(item.id)}<div><small>${item.rarity.toUpperCase()} RELIC</small><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><b>${offer.price} gems</b><small>${offer.owned ? 'In your collection' : !offer.available ? `${Math.max(0, offer.requiredClears - state.expeditionsCompleted)} more dungeon clears to unlock` : camp.gems < offer.price ? `${offer.price - camp.gems} more gems to save` : 'Ready to buy'}</small></div><div class="rpg-market-actions"><button class="rpg-primary" data-buy-item="${item.id}" ${offer.owned || !offer.available || camp.gems < offer.price ? 'disabled' : ''}>${offer.owned ? 'Owned' : `Buy · ${offer.price} gems`}</button>${!offer.owned ? `<button data-pin-kind="item" data-pin-id="${item.id}" aria-pressed="${pinned}">${pinned ? '✓ Your goal' : 'Save toward this'}</button>` : ''}</div></article>`;
  }).join('')}</div><p class="rpg-workshop-note">Legendary relics await in guardian treasure. See every discovery in Equipment.</p>`;
  if (tab === 'records') body = renderMathRecords(legacy.daily);
  if (tab === 'forge') body = `<p>Keep the rolls you love. Every forge rank adds +2 power. Reclaim extra copies for dust; your equipped relic and last copy are protected.</p><div class="rpg-forge-list">${renderLootCards(state, camp.gems, true)}</div>`;
  return `<div class="rpg-workshop"><p class="rpg-eyebrow">A FIRE TO RETURN TO</p><h2 id="rpg-dialog-title">Camp</h2><div class="rpg-wallet" aria-label="Your currencies"><span>◆ <b>${camp.gems}</b> gems</span><span>✦ <b>${state.forgeDust ?? 0}</b> forge dust</span></div><nav class="rpg-workshop-tabs" aria-label="Camp activities">${(['quests', 'merchant', 'trader', 'forge', 'records'] as CampTab[]).map(key => `<button data-action="${key}" aria-pressed="${tab === key}">${key === 'quests' ? 'Quest board' : key === 'merchant' ? 'Merchant' : key === 'trader' ? 'Trader' : key === 'forge' ? 'Blacksmith' : 'Records'}</button>`).join('')}</nav>${renderPinnedGoal(state, camp)}${body}<footer class="rpg-button-row"><button data-action="inventory">Equipment</button><button data-action="close">Back to adventure</button></footer></div>`;
}
/** Collection switches preserve the chosen copy, then prefer actual spell damage.
 * This avoids replacing a child's forged roll with the legacy base instance. */
export function collectionLootChoice(state: RpgState, itemId: string): RpgLootInstance | undefined {
  const copies = state.loot?.filter(loot => loot.itemId === itemId) ?? [];
  const selected = copies.find(loot => loot.id === state.equippedLootId);
  if (state.equippedItemId === itemId && selected) return selected;
  return copies.reduce<RpgLootInstance | undefined>((best, loot) => {
    if (!best) return loot;
    const stats = (copy: RpgLootInstance) => lootComparison(state, itemId, copy);
    const candidate = stats(loot), current = stats(best);
    return candidate.damage > current.damage || (candidate.damage === current.damage && candidate.targets > current.targets) ? loot : best;
  }, undefined);
}
/** Compare real combat output, including scoped relic bonuses and learned bonus ranks. */
export function lootComparison(state: RpgState, itemId: string, loot?: RpgLootInstance) {
  const loadout = { ...state, equippedItemId: itemId, equippedLootId: loot?.id ?? null };
  const spellId = rpgSpellAvailable(loadout) ? state.selectedSpellId : 'cleave';
  const preview = rpgSpellCombatStats(loadout, spellId), current = rpgSpellCombatStats(state);
  return { ...preview, spellId, delta: preview.damage - current.damage, targetDelta: preview.targets - current.targets };
}
export function damageComparisonLabel(delta: number): string {
  return delta > 0 ? `↑ +${delta} damage` : delta < 0 ? `↓ ${delta} damage` : 'Same damage';
}
export function targetComparisonLabel(delta: number): string {
  return delta > 0 ? `↑ +${delta} ${delta === 1 ? 'enemy' : 'enemies'}` : delta < 0 ? `↓ ${delta} ${delta === -1 ? 'enemy' : 'enemies'}` : 'Same enemy count';
}
export function alternateLootChoices(state: RpgState, itemId: string) {
  const copies = (state.loot ?? []).filter(copy => copy.itemId === itemId && copy.id !== state.equippedLootId)
    .map(copy => ({ copy, ...lootComparison(state, itemId, copy) }));
  const damage = copies.filter(copy => copy.delta > 0).sort((a, b) => b.damage - a.damage || b.targets - a.targets)[0];
  const targets = copies.filter(copy => copy.targetDelta > 0).sort((a, b) => b.targets - a.targets || b.damage - a.damage)[0];
  return [damage, targets].filter((copy, index, all) => copy && all.findIndex(other => other?.copy.id === copy.copy.id) === index) as NonNullable<typeof damage>[];
}
/** Saves append real finds in acquisition order. Synthetic migration copies have
 * no acquisition time and must stay behind real finds even when appended later. */
export function newestLoot(state: RpgState): RpgLootInstance[] {
  const newest = [...(state.loot ?? [])].reverse();
  return [...newest.filter(copy => !copy.id.startsWith('legacy:')), ...newest.filter(copy => copy.id.startsWith('legacy:'))];
}

export function renderLootCards(state: RpgState, gems?: number, forge = false): string {
  const equipped = rpgEquippedLoot(state);
  return newestLoot(state).map(loot => {
    const item = RPG_ITEMS.find(item => item.id === loot.itemId)!;
    const selected = equipped?.id === loot.id;
    const cost = rpgForgeCost(loot), maxed = loot.upgradeLevel >= RPG_MAX_ITEM_UPGRADE;
    const copies = state.loot!.filter(other => other.itemId === loot.itemId);
    const copyNumber = copies.findIndex(other => other.id === loot.id) + 1;
    const canSalvage = !selected && copies.length > 1;
    const { damage: preview, delta, targets, targetDelta, spellId } = lootComparison(state, loot.itemId, loot);
    const spellName = RPG_SPELLS.find(spell => spell.id === spellId)!.name;
    const pinned = state.goal?.kind === 'upgrade' && state.goal.id === loot.id;
    return `<article class="rpg-loot-card ${item.rarity} ${selected ? 'equipped' : ''}" id="rpg-loot-${esc(loot.id)}" data-loot-card="${esc(loot.id)}">${relicArt(item.id)}<div><small>${selected ? '✓ EQUIPPED' : item.rarity.toUpperCase()} <span class="rpg-copy-label">${copies.length > 1 ? `Copy ${copyNumber} of ${copies.length}` : 'Only copy'}</span></small><h3>${esc(item.name)}</h3><div class="rpg-copy-strength"><strong>${preview}<span>DAMAGE PER ENEMY</span></strong><span class="rpg-damage-delta ${delta > 0 ? 'better' : delta < 0 ? 'lower' : 'same'}">${selected ? 'In use' : damageComparisonLabel(delta)}</span></div><div class="rpg-copy-targets">Hits up to <strong>${targets}</strong> enemies <span class="rpg-damage-delta ${targetDelta > 0 ? 'better' : targetDelta < 0 ? 'lower' : 'same'}">${selected ? 'In use' : targetComparisonLabel(targetDelta)}</span></div><small>${spellId !== state.selectedSpellId ? 'Switches to ' : ''}${esc(spellName)} · bonuses included</small><div class="rpg-affixes"><small>THIS COPY’S STATS</small>${renderRelicStats(item, loot, state)}${loot.upgradeLevel ? `<p>Forge ${loot.upgradeLevel}/${RPG_MAX_ITEM_UPGRADE}</p>` : ''}</div>${forge ? `<small>${maxed ? 'Fully forged · 5/5' : `Next forge: ${cost.gems} gems + ${cost.dust} dust → +2 power`}</small>` : ''}</div><div class="rpg-loot-actions"><button data-loot-equip="${esc(loot.id)}" ${selected ? 'disabled' : ''}>${selected ? '✓ Equipped' : 'Equip this copy'}</button>${forge ? `<button class="rpg-primary" data-forge-loot="${esc(loot.id)}" ${maxed || gems === undefined || gems < cost.gems || (state.forgeDust ?? 0) < cost.dust ? 'disabled' : ''}>${maxed ? 'Maxed' : `Upgrade to +${loot.upgradeLevel + 1}<small>${cost.gems} gems · ${cost.dust} dust</small>`}</button>${!maxed ? `<button data-pin-kind="upgrade" data-pin-id="${esc(loot.id)}" aria-pressed="${pinned}">${pinned ? '✓ Your goal' : 'Work toward upgrade'}</button>` : ''}<button data-salvage-loot="${esc(loot.id)}" ${canSalvage ? '' : 'disabled'} title="${selected ? 'Your equipped relic is protected' : !canSalvage ? 'Keep the last copy of each relic' : 'Review before reclaiming'}">Reclaim · ${rpgSalvageValue(loot)} dust</button>` : ''}</div></article>`;
  }).join('');
}
export function renderNextDungeonReward(state: RpgState, camp?: RpgCampState | null): string {
  const tier = Math.min(rpgUnlockedTier(state), (state.dungeonTier ?? 1) + 1);
  const region = RPG_REGIONS.find(region => region.id === state.expedition?.regionId) ?? RPG_REGIONS[0];
  const hunt = rpgNextRelicHunt(state, region.id);
  const item = RPG_ITEMS.find(item => item.id === hunt?.itemId);
  return `<section class="rpg-next-dungeon" aria-label="Your next adventure reward"><small>BEYOND THE NEXT GATE · TIER ${tier}</small><h3>${tier > (state.dungeonTier ?? 1) ? 'A deeper vault is open' : 'Another treasure awaits'}</h3><p><strong>${rpgDungeonForgeDust(tier)} forge dust</strong> for a full clear · Two fresh relic rolls with a chance of stronger power. Boss loot can change a spell.</p>${item ? `<p>${hunt?.duplicate ? 'Another roll on' : 'Next relic discovery:'} <strong>${esc(item.name)}</strong></p>` : ''}${renderPinnedGoal(state, camp)}<button class="rpg-primary" data-region="${region.id}" data-tier="${tier}">Explore tier ${tier} →</button><small>Your reward is saved. Come back whenever you like.</small></section>`;
}
