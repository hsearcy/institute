import {RPG_REGIONS, rpgUnlockedTier, rpgTier, rpgBossBonusChance, rpgLootPowerRange, rpgDungeonForgeDust, type RpgState} from '@institute/shared';
import {escapeHtml as esc, icon} from './icons';

export interface NextAdventure {regionId: string; tier: number}
export function chooseNextAdventure(state: RpgState, random: () => number = Math.random): NextAdventure {
  const unlocked=RPG_REGIONS.filter(region=>state.expeditionsCompleted>=region.requiredClears);
  const different=unlocked.filter(region=>region.id!==state.expedition?.regionId);
  const choices=different.length?different:unlocked;
  const roll=random(), index=Math.floor((Number.isFinite(roll)?Math.max(0,Math.min(.999999,roll)):0)*choices.length);
  return {regionId:choices[index].id,tier:Math.min(rpgUnlockedTier(state),rpgTier(state.expedition?.tier??state.dungeonTier))};
}
export function tierRewards(tier: number): string {
  const range=rpgLootPowerRange(tier,true),chance=(rpgBossBonusChance(tier)*100).toFixed(1).replace(/\.0$/,'');
  return `Boss item: +${range.min}–${range.max} power · ${rpgDungeonForgeDust(tier)} forge dust per dungeon. Separate ${chance}% chances for a Crazy Coin and a dime.`;
}
export function tierSelect(state: RpgState, tier: number, id: string, disabled=false): string {
  return `<label class="rpg-tier-select" for="${id}">Dungeon tier <select id="${id}" ${disabled?'disabled':''}>${Array.from({length:rpgUnlockedTier(state)},(_,i)=>i+1).map(value=>`<option value="${value}"${value===tier?' selected':''}>Tier ${value}${value===(state.bestTier??0)+1?' · New challenge':''}</option>`).join('')}</select></label>`;
}
export function renderNextAdventure(state: RpgState, selected: NextAdventure): string {
  const regions=RPG_REGIONS.filter(region=>state.expeditionsCompleted>=region.requiredClears);
  const region=regions.find(region=>region.id===selected.regionId)??regions[0];
  return `<section id="rpg-next-adventure" class="rpg-next-adventure" aria-label="Next adventure"><h3>Where next?</h3><p>Pick an area, or go with this choice.</p>
    <div class="rpg-next-areas" role="group" aria-label="Next area">${regions.map(area=>`<button data-next-region="${area.id}" aria-pressed="${area.id===region.id}" style="--region-color:${area.color}">${icon(area.relicSchool??area.environment??'map')}<span>${esc(area.name)}</span></button>`).join('')}</div>
    ${tierSelect(state,selected.tier,'rpg-next-tier')}<p class="rpg-tier-reward">${tierRewards(selected.tier)}</p>
    </section>`;
}
