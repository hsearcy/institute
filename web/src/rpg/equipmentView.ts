import { RPG_ITEMS, RPG_SCHOOLS, RPG_SPELLS, rpgSpellCombatStats, rpgItemApplies, type RpgState } from '@institute/shared';
import { renderLootCards } from './campView';
import { escapeHtml as esc, icon, relicArt } from './icons';

/** Equipment presentation uses the saved loadout and existing equip handlers. */
export function renderEquipmentView(state: RpgState, armor: string, playing: boolean): string {
  const equipped = RPG_ITEMS.find(item => item.id === state.equippedItemId) ?? RPG_ITEMS[0];
  const spell = RPG_SPELLS.find(entry => entry.id === state.selectedSpellId)!;
  const power = rpgSpellCombatStats(state, spell.id);
  const applies = rpgItemApplies(equipped, spell.id);
  const description = equipped.description;
  const scope = equipped.scope === 'all' ? 'Every spell' : equipped.scope === 'school'
    ? `${RPG_SCHOOLS.find(school => school.id === equipped.school)!.name} spells`
    : RPG_SPELLS.find(entry => entry.id === equipped.spellId)!.name;
  return `<div class="rpg-armory">
    <header class="rpg-armory-heading"><p class="rpg-eyebrow">RELICS OF THE VAULT</p><h2 id="rpg-dialog-title">Your equipment <small>${state.inventory.length} / ${RPG_ITEMS.length} found</small></h2><p>Choose a relic. Shape your magic.</p></header>
    <div class="rpg-armory-bench">
      <section class="rpg-armory-equipped ${equipped.rarity}" aria-label="Equipped relic">
        <div class="rpg-armory-display"><div class="rpg-armory-bezel">${relicArt(equipped.id)}</div><span aria-hidden="true">◆</span></div>
        <div class="rpg-armory-copy"><small>${equipped.rarity.toUpperCase()} · EQUIPPED</small><h3>${esc(equipped.name)}</h3><p>${esc(description)}</p><span class="rpg-armory-scope">${esc(scope)}</span></div>
        <div class="rpg-armory-power"><strong>${power.damage}</strong><span>damage per target<small>Up to ${power.targets} targets · ${esc(spell.name)}</small></span></div>
        ${!applies ? `<p class="rpg-armory-mismatch">This relic strengthens ${esc(scope)}. Choose a matching spell to use its power.</p>` : ''}
        <button class="rpg-armory-spell-link" data-action="spellbook">Open spellbook <span aria-hidden="true">→</span></button>
      </section>
      <section class="rpg-armory-collection" aria-label="Relic collection"><div class="rpg-armory-collection-heading"><h3>Your collection</h3><span>Select a relic to equip it</span></div>
        <div class="rpg-inventory rpg-relic-slots">${RPG_ITEMS.map(item => {
          const owned = state.inventory.includes(item.id), selected = state.equippedItemId === item.id;
          const clearsRemaining = Math.max(0, item.requiredClears - state.expeditionsCompleted);
          const hint = clearsRemaining > 0 ? `Clear ${clearsRemaining} more expedition${clearsRemaining === 1 ? '' : 's'}`
            : item.rarity === 'legendary' ? 'Guardian treasure' : 'Find in dungeons';
          return `<button class="rpg-item ${item.rarity} ${owned ? '' : 'undiscovered'} ${selected ? 'equipped' : ''}" data-item="${item.id}" aria-pressed="${selected}" aria-label="${esc(item.name)}, ${owned ? selected ? 'equipped' : 'equip' : `locked. ${hint}`}. ${esc(item.description)}" title="${esc(item.name)}${owned ? '' : ` — Locked. ${hint}. ${esc(item.description)}`}" ${!owned ? 'disabled' : ''}>
            ${relicArt(item.id)}<span class="rpg-armory-slot-name">${esc(item.name)}</span>${!owned ? `<span class="rpg-armory-slot-lock" aria-hidden="true">${icon('lock')} Locked</span><span class="rpg-armory-slot-hint">${hint}</span>` : ''}${selected ? '<span class="rpg-armory-slot-mark" aria-hidden="true">◆</span>' : ''}
          </button>`;
        }).join('')}</div>
        <button class="rpg-armory-hunt" data-action="map">${icon('map')}<span>Find your next relic<small>Explore the vaults for rare treasures</small></span><span aria-hidden="true">→</span></button>
      </section>
    </div>
    ${RPG_ITEMS.some(item => !state.inventory.includes(item.id)) ? `<details class="rpg-collection-goals"><summary>Pin a relic to discover</summary><div>${RPG_ITEMS.filter(item => !state.inventory.includes(item.id)).map(item => `<button data-pin-kind="item" data-pin-id="${item.id}" aria-pressed="${state.goal?.kind === 'item' && state.goal.id === item.id}">${relicArt(item.id)}<span>${esc(item.name)}<small>${item.rarity === 'legendary' ? 'Guardian treasure' : 'Dungeon discovery or merchant'}</small></span></button>`).join('')}</div></details>` : ''}
    <section class="rpg-loot-collection"><div class="rpg-workshop-heading"><h3>Your relic rolls</h3><button data-action="forge">Visit the blacksmith →</button></div><p>Compare extra power and skill bonuses. Each find can be different.</p>${renderLootCards(state)}</section>
    ${armor}
    <footer class="rpg-button-row rpg-armory-footer"><button class="rpg-primary" data-action="close">${playing ? 'Return to dungeon' : 'Back to camp'}</button><a href="?mode=mine" class="rpg-text-button">Gem collection & original shop</a></footer>
  </div>`;
}
