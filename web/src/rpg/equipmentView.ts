import { RPG_ITEMS, RPG_SCHOOLS, RPG_SPELLS, rpgSpellCombatStats, rpgItemApplies, type RpgState } from '@institute/shared';
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
          return `<button class="rpg-item ${item.rarity} ${owned ? '' : 'undiscovered'} ${selected ? 'equipped' : ''}" data-item="${item.id}" aria-pressed="${selected}" aria-label="${owned ? `${esc(item.name)}, ${selected ? 'equipped' : 'equip'}. ${esc(item.description)}` : `Undiscovered ${item.rarity} relic`}" title="${owned ? esc(item.name) : `Undiscovered ${item.rarity} relic`}" ${!owned ? 'disabled' : ''}>
            ${owned ? relicArt(item.id) : `<span class="rpg-armory-unknown">${icon('lock')}</span>`}<span class="rpg-armory-slot-name">${owned ? esc(item.name) : 'Undiscovered'}</span>${selected ? '<span class="rpg-armory-slot-mark" aria-hidden="true">◆</span>' : ''}
          </button>`;
        }).join('')}</div>
        <button class="rpg-armory-hunt" data-action="map">${icon('map')}<span>Find your next relic<small>Explore the vaults for rare treasures</small></span><span aria-hidden="true">→</span></button>
      </section>
    </div>
    ${armor}
    <footer class="rpg-button-row rpg-armory-footer"><button class="rpg-primary" data-action="close">${playing ? 'Return to dungeon' : 'Back to camp'}</button><a href="?mode=mine" class="rpg-text-button">Gem collection & original shop</a></footer>
  </div>`;
}
