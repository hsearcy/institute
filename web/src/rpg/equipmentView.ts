import { RPG_ITEMS, RPG_SCHOOLS, RPG_SPELLS, rpgSpellCombatStats, rpgItemApplies, type RpgState } from '@institute/shared';
import { renderLootCards, collectionLootChoice, lootComparison, damageComparisonLabel, lootStats } from './campView';
import { escapeHtml as esc, icon, relicArt } from './icons';

/** Equipment presentation uses the saved loadout and existing equip handlers. */
export function renderEquipmentView(state: RpgState, armor: string, playing: boolean): string {
  const equipped = RPG_ITEMS.find(item => item.id === state.equippedItemId) ?? RPG_ITEMS[0];
  const spell = RPG_SPELLS.find(entry => entry.id === state.selectedSpellId)!;
  const power = rpgSpellCombatStats(state, spell.id);
  const applies = rpgItemApplies(equipped, spell.id);
  const description = equipped.description;
  const equippedCopy = state.loot?.find(copy => copy.id === state.equippedLootId);
  const strongerCopy = state.loot?.filter(copy => copy.itemId === equipped.id)
    .map(copy => ({ copy, ...lootComparison(state, equipped.id, copy) }))
    .filter(copy => copy.delta > 0).sort((a, b) => b.damage - a.damage)[0];
  const ownedItems = RPG_ITEMS.filter(item => state.inventory.includes(item.id));
  const lockedItems = RPG_ITEMS.filter(item => !state.inventory.includes(item.id));
  const scope = equipped.scope === 'all' ? 'Every spell' : equipped.scope === 'school'
    ? `${RPG_SCHOOLS.find(school => school.id === equipped.school)!.name} spells`
    : RPG_SPELLS.find(entry => entry.id === equipped.spellId)!.name;
  return `<div class="rpg-armory">
    <header class="rpg-armory-heading"><p class="rpg-eyebrow">RELICS OF THE VAULT</p><h2 id="rpg-dialog-title">Your equipment <small>${state.inventory.length} / ${RPG_ITEMS.length} found</small></h2><p>Compare damage for <strong>${esc(spell.name)}</strong>. Numbers show a full-power hit.</p></header>
    <div class="rpg-armory-bench">
      <section class="rpg-armory-equipped ${equipped.rarity}" aria-label="Equipped relic">
        <div class="rpg-armory-display"><div class="rpg-armory-bezel">${relicArt(equipped.id)}</div><span aria-hidden="true">◆</span></div>
        <div class="rpg-armory-copy"><small>${equipped.rarity.toUpperCase()} · EQUIPPED</small><h3>${esc(equipped.name)}</h3><p>${esc(description)}</p>${equippedCopy ? `<p class="rpg-equipped-affixes">${esc(lootStats(equippedCopy, state))}</p>` : ''}<span class="rpg-armory-scope">${esc(scope)}</span></div>
        <div class="rpg-armory-power"><strong>${power.damage}</strong><span>damage per target<small>Up to ${power.targets} targets · ${esc(spell.name)}</small></span></div>
        ${strongerCopy ? `<a class="rpg-stronger-copy-link" href="#${encodeURIComponent(`rpg-loot-${strongerCopy.copy.id}`)}">↑ +${strongerCopy.delta} damage waiting<small>See your stronger copy ↓</small></a>` : ''}
        ${!applies ? `<p class="rpg-armory-mismatch">This relic strengthens ${esc(scope)}. Bonus power on a copy helps every spell.</p>` : ''}
        <button class="rpg-armory-spell-link" data-action="spellbook">Open spellbook <span aria-hidden="true">→</span></button>
      </section>
      <section class="rpg-armory-collection" aria-label="Relic collection"><div class="rpg-armory-collection-heading"><h3>Choose your relic</h3><span>Damage with ${esc(spell.name)}</span></div>
        <div class="rpg-inventory rpg-relic-slots">${ownedItems.map(item => {
          const selected = state.equippedItemId === item.id;
          const copy = collectionLootChoice(state, item.id);
          const copies = state.loot?.filter(loot => loot.itemId === item.id).length || 1;
          const { damage, delta } = lootComparison(state, item.id, copy);
          return `<button class="rpg-item ${item.rarity} ${selected ? 'equipped' : ''}" data-item="${item.id}" aria-pressed="${selected}" aria-label="${esc(item.name)}, ${damage} damage with ${esc(spell.name)}, ${damageComparisonLabel(delta)}, ${copies} ${copies === 1 ? 'copy' : 'copies'}, ${selected ? 'equipped' : 'equip'}${selected && strongerCopy ? `, stronger copy available below with ${strongerCopy.delta} more damage` : ''}" title="${esc(item.description)}">
            ${relicArt(item.id)}<span class="rpg-armory-slot-name">${esc(item.name)}</span><span class="rpg-slot-strength"><strong>${damage}</strong> DAMAGE</span><span class="rpg-damage-delta ${delta > 0 ? 'better' : delta < 0 ? 'lower' : 'same'}">${selected ? '✓ Equipped' : damageComparisonLabel(delta)}</span>${selected && strongerCopy ? `<span class="rpg-stronger-copy-badge">↑ +${strongerCopy.delta} damage<small>Stronger copy below</small></span>` : ''}<span class="rpg-slot-copies">${copies} ${copies === 1 ? 'copy' : 'copies'}</span>${selected ? '<span class="rpg-armory-slot-mark" aria-hidden="true">◆</span>' : ''}
          </button>`;
        }).join('')}</div>
        ${lockedItems.length ? `<details class="rpg-locked-gallery"><summary>Still to discover · ${lockedItems.length} relics</summary><div class="rpg-inventory rpg-relic-slots">${lockedItems.map(item => `<button class="rpg-item ${item.rarity} undiscovered" data-item="${item.id}" disabled title="${esc(item.description)}">${relicArt(item.id)}<span class="rpg-armory-slot-name">${esc(item.name)}</span><span class="rpg-armory-slot-lock">${icon('lock')} Locked</span><span class="rpg-armory-slot-hint">${item.requiredClears > state.expeditionsCompleted ? `${item.requiredClears - state.expeditionsCompleted} more dungeon clears` : item.rarity === 'legendary' ? 'Guardian treasure' : 'Find in dungeons'}</span></button>`).join('')}</div></details>` : ''}
        <button class="rpg-armory-hunt" data-action="map">${icon('map')}<span>Find your next relic<small>Explore the vaults for rare treasures</small></span><span aria-hidden="true">→</span></button>
      </section>
    </div>
    ${RPG_ITEMS.some(item => !state.inventory.includes(item.id)) ? `<details class="rpg-collection-goals"><summary>Pin a relic to discover</summary><div>${RPG_ITEMS.filter(item => !state.inventory.includes(item.id)).map(item => `<button data-pin-kind="item" data-pin-id="${item.id}" aria-pressed="${state.goal?.kind === 'item' && state.goal.id === item.id}">${relicArt(item.id)}<span>${esc(item.name)}<small>${item.rarity === 'legendary' ? 'Guardian treasure' : 'Dungeon discovery or merchant'}</small></span></button>`).join('')}</div></details>` : ''}
    <section class="rpg-loot-collection"><div class="rpg-workshop-heading"><h3>Your individual copies</h3><button data-action="forge">Visit the blacksmith →</button></div><p class="rpg-copy-explainer"><strong>Found the same relic again?</strong> Every copy is saved with its own bonuses. Equip one copy at a time; their powers do not add together. Turn spare copies into forge dust at the blacksmith. Your equipped copy and last copy are protected.</p><p class="rpg-copy-sort">Equipped first, then highest damage with ${esc(spell.name)}. Compare each copy below.</p>${renderLootCards(state)}</section>
    ${armor}
    <footer class="rpg-button-row rpg-armory-footer"><button class="rpg-primary" data-action="close">${playing ? 'Return to dungeon' : 'Back to camp'}</button><a href="?mode=mine" class="rpg-text-button">Gem collection & original shop</a></footer>
  </div>`;
}
