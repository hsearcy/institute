import { RPG_ITEMS, RPG_SPELLS, rpgSpellCombatStats, rpgItemApplies, type RpgState } from '@institute/shared';
import { renderLootCards, collectionLootChoice, lootComparison, damageComparisonLabel, targetComparisonLabel, lootStats, itemAffinity, itemBaseBonusLabel, lootBonusLabels, alternateLootChoices } from './campView';
import { escapeHtml as esc, icon, relicArt } from './icons';

/** Equipment presentation uses the saved loadout and existing equip handlers. */
export function renderEquipmentView(state: RpgState, armor: string, playing: boolean): string {
  const equipped = RPG_ITEMS.find(item => item.id === state.equippedItemId) ?? RPG_ITEMS[0];
  const spell = RPG_SPELLS.find(entry => entry.id === state.selectedSpellId)!;
  const power = rpgSpellCombatStats(state, spell.id);
  const applies = rpgItemApplies(equipped, spell.id);
  const equippedCopy = state.loot?.find(copy => copy.id === state.equippedLootId);
  const alternatives = alternateLootChoices(state, equipped.id);
  const ownedItems = RPG_ITEMS.filter(item => state.inventory.includes(item.id));
  const lockedItems = RPG_ITEMS.filter(item => !state.inventory.includes(item.id));
  const scope = itemAffinity(equipped);
  return `<div class="rpg-armory">
    <header class="rpg-armory-heading"><p class="rpg-eyebrow">RELICS OF THE VAULT</p><h2 id="rpg-dialog-title">Your equipment <small>${state.inventory.length} / ${RPG_ITEMS.length} found</small></h2><p>Numbers below show <strong>${esc(spell.name)}</strong> with each relic equipped, at full attack power. Bonuses are already included. Each attack can hit at most 10 enemies.</p></header>
    <div class="rpg-armory-bench">
      <section class="rpg-armory-equipped ${equipped.rarity}" aria-label="Equipped relic">
        <div class="rpg-armory-display"><div class="rpg-armory-bezel">${relicArt(equipped.id)}</div><span aria-hidden="true">◆</span></div>
        <div class="rpg-armory-copy"><small>${equipped.rarity.toUpperCase()} · EQUIPPED</small><h3>${esc(equipped.name)}</h3><p>${esc(itemBaseBonusLabel(equipped))}</p>${equippedCopy ? `<div class="rpg-equipped-affixes">${lootBonusLabels(equippedCopy, state).map(label => `<p>${esc(label)}</p>`).join('')}</div>` : ''}</div>
        <div class="rpg-armory-power"><strong>${power.damage}</strong><span>damage per enemy<small>Hits up to ${power.targets} enemies · ${esc(spell.name)}</small></span></div>
        ${alternatives.map(choice => `<a class="rpg-stronger-copy-link" href="#${encodeURIComponent(`rpg-loot-${choice.copy.id}`)}">${damageComparisonLabel(choice.delta)} · ${targetComparisonLabel(choice.targetDelta)}<small>Compare another copy ↓</small></a>`).join('')}
        ${!applies ? `<p class="rpg-armory-mismatch">This relic strengthens ${esc(scope)}. See each copy bonus for the spells it helps.</p>` : ''}
        <button class="rpg-armory-spell-link" data-action="spellbook">Open spellbook <span aria-hidden="true">→</span></button>
      </section>
      <section class="rpg-armory-collection" aria-label="Relic collection"><div class="rpg-armory-collection-heading"><h3>Choose your relic</h3><span>Using ${esc(spell.name)}</span></div>
        <div class="rpg-inventory rpg-relic-slots rpg-owned-slots">${ownedItems.map(item => {
          const selected = state.equippedItemId === item.id;
          const copy = collectionLootChoice(state, item.id);
          const copies = state.loot?.filter(loot => loot.itemId === item.id).length || 1;
          const { damage, delta, targets, targetDelta } = lootComparison(state, item.id, copy);
          return `<button class="rpg-item ${item.rarity} ${selected ? 'equipped' : ''}" data-item="${item.id}" aria-pressed="${selected}" aria-label="${esc(item.name)}, ${damage} damage with ${esc(spell.name)}, ${damageComparisonLabel(delta)}, ${copies} ${copies === 1 ? 'copy' : 'copies'}, ${selected ? 'equipped' : 'equip'}${selected && alternatives.length ? ', alternative copies with more damage or targets below' : ''}, ${targets} targets, ${targetComparisonLabel(targetDelta)}, base bonus ${esc(itemAffinity(item))}${copy ? `, ${esc(lootStats(copy, state))}` : ''}">
            ${relicArt(item.id)}<span class="rpg-armory-slot-name">${esc(item.name)}<small>${esc(item.rarity)} relic · ${copies} ${copies === 1 ? 'copy' : 'copies'}</small></span>
            <span class="rpg-slot-preview"><span class="rpg-slot-preview-title">${esc(spell.name)} with this relic</span><span class="rpg-slot-preview-numbers"><span><strong>${damage}</strong> damage per enemy<small class="rpg-damage-delta ${delta > 0 ? 'better' : delta < 0 ? 'lower' : 'same'}">${selected ? '✓ Equipped' : damageComparisonLabel(delta)}</small></span><span>Hits up to <strong>${targets}</strong> enemies<small class="rpg-damage-delta ${targetDelta > 0 ? 'better' : targetDelta < 0 ? 'lower' : 'same'}">${selected ? 'In use' : targetComparisonLabel(targetDelta)}</small></span></span></span>
            <span class="rpg-slot-affinity"><small>RELIC EFFECT</small>${esc(itemBaseBonusLabel(item))}</span>${!rpgItemApplies(item, spell.id) ? `<span class="rpg-slot-inactive">That base bonus does not affect ${esc(spell.name)}.</span>` : ''}
            ${copy ? `<span class="rpg-slot-bonuses"><small>THIS COPY’S EXTRAS</small>${lootBonusLabels(copy, state).map(label => `<span>${esc(label)}</span>`).join('') || '<span>No extra bonuses on this copy.</span>'}</span>` : ''}${selected && alternatives.length ? `<span class="rpg-stronger-copy-badge">More damage or targets<small>Compare copies below ↓</small></span>` : ''}${selected ? '<span class="rpg-armory-slot-mark" aria-hidden="true">◆</span>' : ''}
          </button>`;
        }).join('')}</div>
        ${lockedItems.length ? `<details class="rpg-locked-gallery"><summary>Still to discover · ${lockedItems.length} relics</summary><div class="rpg-inventory rpg-relic-slots">${lockedItems.map(item => `<button class="rpg-item ${item.rarity} undiscovered" data-item="${item.id}" disabled>${relicArt(item.id)}<span class="rpg-armory-slot-name">${esc(item.name)}</span><span class="rpg-armory-slot-lock">${icon('lock')} Locked</span><span class="rpg-slot-affinity">${esc(itemBaseBonusLabel(item))}</span><span class="rpg-armory-slot-hint">${item.requiredClears > state.expeditionsCompleted ? `${item.requiredClears - state.expeditionsCompleted} more dungeon clears` : item.rarity === 'legendary' ? 'Guardian treasure' : 'Find in dungeons'}</span></button>`).join('')}</div></details>` : ''}
        <button class="rpg-armory-hunt" data-action="map">${icon('map')}<span>Find your next relic<small>Explore the vaults for rare treasures</small></span><span aria-hidden="true">→</span></button>
      </section>
    </div>
    ${RPG_ITEMS.some(item => !state.inventory.includes(item.id)) ? `<details class="rpg-collection-goals"><summary>Pin a relic to discover</summary><div>${RPG_ITEMS.filter(item => !state.inventory.includes(item.id)).map(item => `<button data-pin-kind="item" data-pin-id="${item.id}" aria-pressed="${state.goal?.kind === 'item' && state.goal.id === item.id}">${relicArt(item.id)}<span>${esc(item.name)}<small>${item.rarity === 'legendary' ? 'Guardian treasure' : 'Dungeon discovery or merchant'}</small></span></button>`).join('')}</div></details>` : ''}
    <section class="rpg-loot-collection"><div class="rpg-workshop-heading"><h3>Your individual copies</h3><button data-action="forge">Visit the blacksmith →</button></div><p class="rpg-copy-explainer"><strong>Found the same relic again?</strong> Every copy is saved with its own bonuses. Equip one copy at a time; their powers do not add together. Turn spare copies into forge dust at the blacksmith. Your equipped copy and last copy are protected.</p><p class="rpg-copy-sort">Equipped first, then damage with ${esc(spell.name)}. Compare damage and targets: some copies hit harder, others hit more monsters.</p>${renderLootCards(state)}</section>
    ${armor}
    <footer class="rpg-button-row rpg-armory-footer"><button class="rpg-primary" data-action="close">${playing ? 'Return to dungeon' : 'Back to camp'}</button><a href="?mode=mine" class="rpg-text-button">Gem collection & original shop</a></footer>
  </div>`;
}
