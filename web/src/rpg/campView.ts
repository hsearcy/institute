import { RPG_ITEMS, RPG_SCHOOLS, RPG_SPELLS, RPG_SKILLS, rpgLootAffixes, RPG_REGIONS, RPG_MAX_ITEM_UPGRADE, rpgForgeCost, rpgLootPower, rpgEquippedLoot, rpgSalvageValue, rpgUnlockedTier, rpgDungeonForgeDust, rpgNextRelicHunt, rpgSpellCombatStats, type RpgItem, type RpgState, type RpgLootInstance, type RpgCampState, type State, type Quest } from '@institute/shared';
import { escapeHtml as esc, relicArt, icon } from './icons';

export type CampTab = 'quests' | 'merchant' | 'forge';
export function itemAffinity(item: RpgItem): string {
  return item.scope === 'all' ? 'Every spell' : item.scope === 'school'
    ? `All ${RPG_SCHOOLS.find(school => school.id === item.school)!.name} spells`
    : RPG_SPELLS.find(spell => spell.id === item.spellId)!.name;
}
/** Keep the action and its benefit together; these sentences are visible on
 * inventory cards, discovery rewards and forge comparisons. */
export function itemBaseBonusLabel(item: RpgItem): string {
  if (!item.power && !item.effect) return 'Starter blade. No extra damage bonuses.';
  const spell = RPG_SPELLS.find(spell => spell.id === item.spellId);
  let label = item.description.replace(/damage per target/g, 'damage to each enemy')
    .replace(/Every ability/g, 'Every attack').replace(/ abilities/g, ' attacks');
  if (spell) label = label.replace(spell.name, `Your ${spell.name} ${spell.id === 'cleave' ? 'attack' : 'spell'}`);
  return label;
}
function bonusAttackScope(spellId?: string, schoolId?: string): string {
  if (schoolId) return `all ${RPG_SCHOOLS.find(school => school.id === schoolId)!.name} attacks`;
  if (!spellId) return 'every attack';
  const spell = RPG_SPELLS.find(spell => spell.id === spellId)!;
  return `your ${spell.name} ${spell.id === 'cleave' ? 'attack' : 'spell'}`;
}
export function lootBonusLabels(loot: RpgLootInstance, state: RpgState, includePower = true): string[] {
  const skill = RPG_SKILLS.find(skill => skill.id === loot.bonusSkillId && skill.kind !== 'unlock');
  const affixes = rpgLootAffixes(loot);
  const labels: string[] = [];
  if (includePower && rpgLootPower(loot)) labels.push(`+${rpgLootPower(loot)} damage to each enemy with every attack.`);
  const ranks = Number.isFinite(loot.bonusSkillRanks) ? Math.max(0, Math.min(2, loot.bonusSkillRanks!)) : 0;
  if (skill && ranks) {
    const learned = (state.skills[skill.id] ?? 0) > 0;
    const scope = bonusAttackScope(skill.scope === 'spell' ? skill.spellId : undefined, skill.scope === 'school' ? skill.school : undefined);
    // Compare this copy against itself without the bonus ranks, keeping all
    // other rolls. For an inactive bonus, show the benefit after learning its
    // first rank without treating the item as a free skill unlock.
    const previewSkills = learned ? state.skills : { ...state.skills, [skill.id]: 1 };
    const preview = (copy: RpgLootInstance) => rpgSpellCombatStats({ ...state, skills: previewSkills,
      equippedItemId: loot.itemId, equippedLootId: loot.id,
      loot: [...(state.loot ?? []).filter(item => item.id !== loot.id), copy],
    }, skill.spellId);
    const without = preview({ ...loot, bonusSkillId: undefined, bonusSkillRanks: undefined });
    const withBonus = preview({ ...loot, bonusSkillRanks: ranks });
    const damage = withBonus.damage - without.damage, enemies = withBonus.targets - without.targets;
    const benefits = [`+${damage} damage to each enemy`];
    if (enemies > 0) benefits.push(`can hit ${enemies} extra ${enemies === 1 ? 'enemy' : 'enemies'}`);
    let label = `${skill.name} upgrade for ${scope}: ${benefits.join(' and ')} (${ranks} bonus ${ranks === 1 ? 'rank' : 'ranks'}).`;
    if (!learned) label += ` Inactive. Learn ${skill.name} in the skill tree to activate this bonus.`;
    else if (skill.kind === 'modifier' && !enemies) label += ' The extra-enemy limit is already reached.';
    labels.push(label);
  }
  if (affixes.targets) labels.push(`Each attack can hit ${affixes.targets} extra ${affixes.targets === 1 ? 'enemy' : 'enemies'}, up to 10 total.`);
  if (affixes.spellId) labels.push(`+${affixes.spellPower} damage to each enemy with ${bonusAttackScope(affixes.spellId)}.`);
  if (affixes.schoolId) labels.push(`+${affixes.schoolPower} damage to each enemy with ${bonusAttackScope(undefined, affixes.schoolId)}.`);
  return labels;
}
export function lootStats(loot: RpgLootInstance, state: RpgState): string {
  return [...lootBonusLabels(loot, state), ...(loot.upgradeLevel ? [`Forged ${Math.min(RPG_MAX_ITEM_UPGRADE, loot.upgradeLevel)} of ${RPG_MAX_ITEM_UPGRADE} times.`] : [])].join(' ') || 'Original copy. No extra bonuses.';
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
export function renderCampWorkshop(state: RpgState, camp: RpgCampState, legacy: State, tab: CampTab): string {
  let body = '';
  if (tab === 'quests') body = `<section aria-label="Daily quests"><div class="rpg-workshop-heading"><h3>Today’s adventures</h3><span>${legacy.quests.filter(quest => quest.done).length} / ${legacy.quests.length} complete</span></div><div class="rpg-quest-grid">${legacy.quests.map(questCard).join('')}</div><p class="rpg-workshop-note">Complete every daily quest to earn a Crazy Coin. Your gems keep growing through ordinary play after the board is done.</p></section><section aria-label="Weekly quest"><h3>This week</h3>${questCard(legacy.weeklyQuest)}</section><button class="rpg-primary" data-action="map">Choose an adventure →</button>`;
  if (tab === 'merchant') body = `<p>Save your gems for a relic you choose. Dungeon finds can also carry extra power and skill ranks.</p><div class="rpg-merchant-grid">${camp.offers.map(offer => {
    const item = RPG_ITEMS.find(item => item.id === offer.itemId)!;
    const pinned = state.goal?.kind === 'item' && state.goal.id === item.id;
    return `<article class="rpg-market-card ${item.rarity}" data-offer="${item.id}">${relicArt(item.id)}<div><small>${item.rarity.toUpperCase()} RELIC</small><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><b>${offer.price} gems</b><small>${offer.owned ? 'In your collection' : !offer.available ? `${Math.max(0, offer.requiredClears - state.expeditionsCompleted)} more dungeon clears to unlock` : camp.gems < offer.price ? `${offer.price - camp.gems} more gems to save` : 'Ready to buy'}</small></div><div class="rpg-market-actions"><button class="rpg-primary" data-buy-item="${item.id}" ${offer.owned || !offer.available || camp.gems < offer.price ? 'disabled' : ''}>${offer.owned ? 'Owned' : `Buy · ${offer.price} gems`}</button>${!offer.owned ? `<button data-pin-kind="item" data-pin-id="${item.id}" aria-pressed="${pinned}">${pinned ? '✓ Your goal' : 'Save toward this'}</button>` : ''}</div></article>`;
  }).join('')}</div><p class="rpg-workshop-note">Legendary relics await in guardian treasure. See every discovery in Equipment.</p>`;
  if (tab === 'forge') body = `<p>Keep the rolls you love. Every forge rank adds +2 power. Reclaim extra copies for dust; your equipped relic and last copy are protected.</p><div class="rpg-forge-list">${renderLootCards(state, camp.gems, true)}</div>`;
  return `<div class="rpg-workshop"><p class="rpg-eyebrow">A FIRE TO RETURN TO</p><h2 id="rpg-dialog-title">Camp</h2><div class="rpg-wallet" aria-label="Your currencies"><span>◆ <b>${camp.gems}</b> gems</span><span>✦ <b>${state.forgeDust ?? 0}</b> forge dust</span></div><nav class="rpg-workshop-tabs" aria-label="Camp activities">${(['quests', 'merchant', 'forge'] as CampTab[]).map(key => `<button data-action="${key}" aria-pressed="${tab === key}">${key === 'quests' ? 'Quest board' : key === 'merchant' ? 'Merchant' : 'Blacksmith'}</button>`).join('')}</nav>${renderPinnedGoal(state, camp)}${body}<footer class="rpg-button-row"><button data-action="inventory">Equipment</button><button data-action="close">Back to adventure</button></footer></div>`;
}
/** Collection switches preserve the chosen copy, then prefer actual spell damage.
 * This avoids replacing a child's forged roll with the legacy base instance. */
export function collectionLootChoice(state: RpgState, itemId: string): RpgLootInstance | undefined {
  const copies = state.loot?.filter(loot => loot.itemId === itemId) ?? [];
  const selected = copies.find(loot => loot.id === state.equippedLootId);
  if (state.equippedItemId === itemId && selected) return selected;
  return copies.reduce<RpgLootInstance | undefined>((best, loot) => {
    if (!best) return loot;
    const stats = (copy: RpgLootInstance) => rpgSpellCombatStats({ ...state, equippedItemId: itemId, equippedLootId: copy.id });
    const candidate = stats(loot), current = stats(best);
    return candidate.damage > current.damage || (candidate.damage === current.damage && candidate.targets > current.targets) ? loot : best;
  }, undefined);
}
/** Compare real combat output, including scoped relic bonuses and learned bonus ranks. */
export function lootComparison(state: RpgState, itemId: string, loot?: RpgLootInstance) {
  const preview = rpgSpellCombatStats({ ...state, equippedItemId: itemId, equippedLootId: loot?.id ?? null });
  const current = rpgSpellCombatStats(state);
  return { ...preview, delta: preview.damage - current.damage, targetDelta: preview.targets - current.targets };
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
export function renderLootCards(state: RpgState, gems?: number, forge = false): string {
  const equipped = rpgEquippedLoot(state);
  const spellName = RPG_SPELLS.find(spell => spell.id === state.selectedSpellId)!.name;
  return [...(state.loot ?? [])].sort((a, b) => Number(b.id === state.equippedLootId) - Number(a.id === state.equippedLootId) || lootComparison(state, b.itemId, b).damage - lootComparison(state, a.itemId, a).damage || lootComparison(state, b.itemId, b).targets - lootComparison(state, a.itemId, a).targets).map(loot => {
    const item = RPG_ITEMS.find(item => item.id === loot.itemId)!;
    const selected = equipped?.id === loot.id;
    const cost = rpgForgeCost(loot), maxed = loot.upgradeLevel >= RPG_MAX_ITEM_UPGRADE;
    const copies = state.loot!.filter(other => other.itemId === loot.itemId);
    const copyNumber = copies.findIndex(other => other.id === loot.id) + 1;
    const canSalvage = !selected && copies.length > 1;
    const { damage: preview, delta, targets, targetDelta } = lootComparison(state, loot.itemId, loot);
    const pinned = state.goal?.kind === 'upgrade' && state.goal.id === loot.id;
    return `<article class="rpg-loot-card ${item.rarity} ${selected ? 'equipped' : ''}" id="rpg-loot-${esc(loot.id)}" data-loot-card="${esc(loot.id)}">${relicArt(item.id)}<div><small>${selected ? '✓ EQUIPPED' : item.rarity.toUpperCase()} <span class="rpg-copy-label">${copies.length > 1 ? `Copy ${copyNumber} of ${copies.length}` : 'Only copy'}</span></small><h3>${esc(item.name)}</h3><p class="rpg-base-affinity">${esc(itemBaseBonusLabel(item))}</p><div class="rpg-copy-strength"><strong>${preview}<span>DAMAGE PER ENEMY</span></strong><span class="rpg-damage-delta ${delta > 0 ? 'better' : delta < 0 ? 'lower' : 'same'}">${selected ? 'In use' : damageComparisonLabel(delta)}</span></div><div class="rpg-copy-targets">Hits up to <strong>${targets}</strong> enemies <span class="rpg-damage-delta ${targetDelta > 0 ? 'better' : targetDelta < 0 ? 'lower' : 'same'}">${selected ? 'In use' : targetComparisonLabel(targetDelta)}</span></div><small>${esc(spellName)} with this copy · bonuses already included</small><div class="rpg-affixes"><small>COPY BONUSES</small>${lootBonusLabels(loot, state).map(label => `<p>${esc(label)}</p>`).join('') || '<p>No extra bonuses</p>'}${loot.upgradeLevel ? `<p>Forge ${loot.upgradeLevel}/${RPG_MAX_ITEM_UPGRADE}</p>` : ''}</div>${forge ? `<small>${maxed ? 'Fully forged · 5/5' : `Next forge: ${cost.gems} gems + ${cost.dust} dust → +2 power`}</small>` : ''}</div><div class="rpg-loot-actions"><button data-loot-equip="${esc(loot.id)}" ${selected ? 'disabled' : ''}>${selected ? '✓ Equipped' : 'Equip this copy'}</button>${forge ? `<button class="rpg-primary" data-forge-loot="${esc(loot.id)}" ${maxed || gems === undefined || gems < cost.gems || (state.forgeDust ?? 0) < cost.dust ? 'disabled' : ''}>${maxed ? 'Maxed' : `Upgrade to +${loot.upgradeLevel + 1}<small>${cost.gems} gems · ${cost.dust} dust</small>`}</button>${!maxed ? `<button data-pin-kind="upgrade" data-pin-id="${esc(loot.id)}" aria-pressed="${pinned}">${pinned ? '✓ Your goal' : 'Work toward upgrade'}</button>` : ''}<button data-salvage-loot="${esc(loot.id)}" ${canSalvage ? '' : 'disabled'} title="${selected ? 'Your equipped relic is protected' : !canSalvage ? 'Keep the last copy of each relic' : 'Review before reclaiming'}">Reclaim · ${rpgSalvageValue(loot)} dust</button>` : ''}</div></article>`;
  }).join('');
}
export function renderNextDungeonReward(state: RpgState, camp?: RpgCampState | null): string {
  const tier = Math.min(rpgUnlockedTier(state), (state.dungeonTier ?? 1) + 1);
  const region = RPG_REGIONS.find(region => region.id === state.expedition?.regionId) ?? RPG_REGIONS[0];
  const hunt = rpgNextRelicHunt(state, region.id);
  const item = RPG_ITEMS.find(item => item.id === hunt?.itemId);
  return `<section class="rpg-next-dungeon" aria-label="Your next adventure reward"><small>BEYOND THE NEXT GATE · TIER ${tier}</small><h3>${tier > (state.dungeonTier ?? 1) ? 'A deeper vault is open' : 'Another treasure awaits'}</h3><p><strong>${rpgDungeonForgeDust(tier)} forge dust</strong> for a full clear · Two fresh relic rolls with a chance of stronger power or a bonus skill.</p>${item ? `<p>${hunt?.duplicate ? 'Another roll on' : 'Next relic discovery:'} <strong>${esc(item.name)}</strong></p>` : ''}${renderPinnedGoal(state, camp)}<button class="rpg-primary" data-region="${region.id}" data-tier="${tier}">Explore tier ${tier} →</button><small>Your reward is saved. Come back whenever you like.</small></section>`;
}
