import { chooseNextAdventure, renderNextAdventure, type NextAdventure } from './nextAdventureView';
import { RPG_REGIONS, RPG_DUPLICATE_ITEM_XP, type RpgReward, type RpgState, type RpgCampState } from '@institute/shared';
import { lootStats } from './campView';
import { escapeHtml as esc, relicArt, spellArt } from './icons';

/** Reward presentation consumes the recorded receipt, never infers another drop. */
export function renderVictoryView(state: RpgState, reward: RpgReward, bossName: string, _camp?: RpgCampState | null, next: NextAdventure = chooseNextAdventure(state)): string {
  const item = reward.item, converted = !!item && reward.duplicateItem && !reward.loot;
  const label = reward.loot ? 'BOSS RELIC ROLL' : converted ? 'DUPLICATE RELIC' : item ? `${item.rarity.toUpperCase()} RELIC DISCOVERED` : 'GUARDIAN REWARD';
  const description = reward.loot ? lootStats(reward.loot, state) : converted
    ? `Already in your collection. Converted into +${RPG_DUPLICATE_ITEM_XP} bonus XP. +${reward.xp} XP total from this guardian.`
    : item?.description ?? 'One step closer to your next spell.';
  const progress = Math.min(100, Math.max(0, state.xpIntoLevel / state.xpForNextLevel * 100));
  return `<div class="rpg-treasure" data-rarity="${item?.rarity ?? 'rare'}">
    <header class="rpg-treasure-heading"><p class="rpg-eyebrow">EXPEDITION COMPLETE</p><h2 id="rpg-dialog-title">${esc(bossName)} <em>defeated.</em></h2><p>The halls are yours.</p></header>
    <section class="rpg-victory-reward rpg-treasure-reward" aria-label="Guardian treasure">
      <div class="rpg-treasure-display"><div class="rpg-treasure-bezel">${item ? relicArt(item.id) : spellArt(reward.spellId)}</div><span class="rpg-treasure-gem" aria-hidden="true">◆</span></div>
      <div class="rpg-treasure-copy"><small>${esc(label)}</small><strong>${esc(item?.name ?? 'Magic grows stronger')}</strong><span>${esc(description)}</span>${item && !converted ? '<p class="rpg-treasure-saved">Saved in your equipment</p>' : ''}${reward.forgeDust ? `<p>+${reward.forgeDust} forge dust from this guardian</p>` : ''}</div>
    </section>
    ${reward.bossCrazyCoins || reward.bossDimes ? `<section class="rpg-boss-bonus" aria-label="Bonus boss rewards"><strong>BONUS TREASURE!</strong>${reward.bossCrazyCoins ? '<p>+1 Crazy Coin</p>' : ''}${reward.bossDimes ? '<p>+1 dime · $0.10 earned</p>' : ''}<small>Saved for redemption in the parent journal</small></section>` : ''}
    <section class="rpg-treasure-growth" aria-label="Experience earned">
      <div class="rpg-treasure-xp"><strong>+${reward.xp}</strong><span>EXPERIENCE</span></div>
      <div class="rpg-treasure-level"><div><b>${reward.levelUp ? 'LEVEL UP · ' : ''}Level ${state.level}</b><span>${state.xpIntoLevel} / ${state.xpForNextLevel} XP</span></div><div class="rpg-treasure-progress" role="progressbar" aria-label="Experience toward next level" aria-valuemin="0" aria-valuemax="${state.xpForNextLevel}" aria-valuenow="${state.xpIntoLevel}"><i style="width:${progress}%"></i></div><small>${state.xpForNextLevel - state.xpIntoLevel} XP to level ${state.level + 1}</small></div>
    </section>
    ${state.skillPoints ? `<button class="rpg-treasure-skill" data-action="skills"><span class="rpg-treasure-point">${state.skillPoints}</span><span><strong>Shape your next spell</strong><small>Spend ${state.skillPoints} skill point${state.skillPoints > 1 ? 's' : ''}</small></span><span aria-hidden="true">→</span></button>` : ''}
    ${renderNextAdventure(state, next)}
    <footer class="rpg-treasure-actions"><button class="rpg-primary rpg-next-start" data-action="next-adventure">Go to ${esc(RPG_REGIONS.find(region=>region.id===next.regionId)?.name??'next area')} →</button><div><button data-action="inventory">Inspect loot</button><button data-action="camp">Save & leave</button></div><small>Adventure saved</small></footer>
  </div>`;
}
