import { RPG_ITEMS, RPG_SPELLS, rpgSpellCombatStats, rpgNormalizeLoot, type RpgState } from '@institute/shared';
import { lootComparison, damageComparisonLabel, targetComparisonLabel, lootStats, itemBaseBonusLabel, renderRelicStats, newestLoot, alternateLootChoices } from './campView';
import { escapeHtml as esc, icon, relicArt } from './icons';

/** Equipment presentation uses the saved loadout and existing equip handlers. */
export function renderEquipmentView(state: RpgState, armor: string, playing: boolean): string {
  state = rpgNormalizeLoot(state);
  const equipped = RPG_ITEMS.find(item => item.id === state.equippedItemId) ?? RPG_ITEMS[0];
  const spell = RPG_SPELLS.find(entry => entry.id === state.selectedSpellId)!;
  const power = rpgSpellCombatStats(state, spell.id);
  const equippedCopy = state.loot?.find(copy => copy.id === state.equippedLootId);
  const alternatives = alternateLootChoices(state, equipped.id);
  const ownedCopies = newestLoot(state);
  const lockedItems = RPG_ITEMS.filter(item => !state.inventory.includes(item.id));
  return `<div class="rpg-armory">
    <header class="rpg-armory-heading"><p class="rpg-eyebrow">RELICS OF THE VAULT</p><h2 id="rpg-dialog-title">Your equipment <small>${state.inventory.length} / ${RPG_ITEMS.length} found</small></h2><p>Comparing <strong>${esc(spell.name)}</strong>. Power adds damage per target. Skill bonuses work while equipped. Attacks hit at most 10 targets.</p></header>
    <div class="rpg-armory-bench">
      <section class="rpg-armory-equipped ${equipped.rarity}" aria-label="Equipped relic">
        <div class="rpg-armory-display"><div class="rpg-armory-bezel">${relicArt(equipped.id)}</div><span aria-hidden="true">◆</span></div>
        <div class="rpg-armory-copy"><small>${equipped.rarity.toUpperCase()} · EQUIPPED</small><h3>${esc(equipped.name)}</h3>${renderRelicStats(equipped, equippedCopy, state)}</div>
        <div class="rpg-armory-power"><strong>${power.damage}</strong><span>damage per target<small>Up to ${power.targets} targets · ${esc(spell.name)}</small></span></div>
        ${alternatives.map(choice => `<a class="rpg-stronger-copy-link" href="#${encodeURIComponent(`rpg-loot-${choice.copy.id}`)}">Another copy: ${damageComparisonLabel(choice.delta)} · ${targetComparisonLabel(choice.targetDelta)}<small>View this copy</small></a>`).join('')}
        <button class="rpg-armory-spell-link" data-action="spellbook">Open spellbook <span aria-hidden="true">→</span></button>
      </section>
      <section class="rpg-armory-collection" aria-label="Relic collection"><div class="rpg-armory-collection-heading"><h3>Choose your relic</h3><span>Newest first · Using ${esc(spell.name)}</span></div>
        <p class="rpg-grid-note">Every copy has its own stats. Select a card to equip that copy.</p>
        <div class="rpg-inventory rpg-relic-slots">${ownedCopies.map(copy => {
          const item = RPG_ITEMS.find(item => item.id === copy.itemId)!;
          const selected = state.equippedLootId === copy.id;
          const copies = state.loot!.filter(loot => loot.itemId === item.id);
          const copyNumber = copies.findIndex(loot => loot.id === copy.id) + 1;
          const { damage, delta, targets, targetDelta, spellId } = lootComparison(state, item.id, copy);
          return `<button class="rpg-item ${item.rarity} ${selected ? 'equipped' : ''}" id="rpg-loot-${esc(copy.id)}" data-loot-card="${esc(copy.id)}" data-loot-equip="${esc(copy.id)}" aria-pressed="${selected}" aria-label="${esc(item.name)}, ${damage} damage with ${esc(RPG_SPELLS.find(spell => spell.id === spellId)!.name)}, ${damageComparisonLabel(delta)}, copy ${copyNumber} of ${copies.length}, ${selected ? 'equipped' : 'equip'}, ${targets} targets, ${targetComparisonLabel(targetDelta)}, ${esc(itemBaseBonusLabel(item))}${copy ? `, ${esc(lootStats(copy, state))}` : ''}">
            ${relicArt(item.id)}<span class="rpg-armory-slot-name">${esc(item.name)}</span>${spellId !== state.selectedSpellId ? `<span class="rpg-slot-switch">Switches to ${esc(RPG_SPELLS.find(spell => spell.id === spellId)!.name)}</span>` : ''}<span class="rpg-slot-strength"><strong>${damage}</strong> DAMAGE</span><span class="rpg-damage-delta ${delta > 0 ? 'better' : delta < 0 ? 'lower' : 'same'}">${selected ? '✓ Equipped' : damageComparisonLabel(delta)}</span><span class="rpg-slot-targets"><b>${targets}</b> targets</span><span class="rpg-damage-delta ${targetDelta > 0 ? 'better' : targetDelta < 0 ? 'lower' : 'same'}">${selected ? 'In use' : targetComparisonLabel(targetDelta)}</span><span class="rpg-slot-bonuses">${renderRelicStats(item, copy, state)}</span><span class="rpg-slot-copies">${copies.length > 1 ? `Copy ${copyNumber} of ${copies.length}` : 'Only copy'}</span>${selected ? '<span class="rpg-armory-slot-mark" aria-hidden="true">◆</span>' : ''}
          </button>`;
        }).join('')}</div>
        ${lockedItems.length ? `<details class="rpg-locked-gallery"><summary>Still to discover · ${lockedItems.length} relics</summary><div class="rpg-inventory rpg-relic-slots">${lockedItems.map(item => `<button class="rpg-item ${item.rarity} undiscovered" data-item="${item.id}" disabled>${relicArt(item.id)}<span class="rpg-armory-slot-name">${esc(item.name)}</span><span class="rpg-armory-slot-lock">${icon('lock')} Locked</span><span class="rpg-slot-affinity">${esc(itemBaseBonusLabel(item))}</span><span class="rpg-armory-slot-hint">${item.requiredClears > state.expeditionsCompleted ? `${item.requiredClears - state.expeditionsCompleted} more dungeon clears` : item.rarity === 'legendary' ? 'Guardian treasure' : 'Find in dungeons'}</span></button>`).join('')}</div></details>` : ''}
        <button class="rpg-armory-hunt" data-action="map">${icon('map')}<span>Find your next relic<small>Explore the vaults for rare treasures</small></span><span aria-hidden="true">→</span></button>
      </section>
    </div>
    ${RPG_ITEMS.some(item => !state.inventory.includes(item.id)) ? `<details class="rpg-collection-goals"><summary>Pin a relic to discover</summary><div>${RPG_ITEMS.filter(item => !state.inventory.includes(item.id)).map(item => `<button data-pin-kind="item" data-pin-id="${item.id}" aria-pressed="${state.goal?.kind === 'item' && state.goal.id === item.id}">${relicArt(item.id)}<span>${esc(item.name)}<small>${item.rarity === 'legendary' ? 'Guardian treasure' : 'Dungeon discovery or merchant'}</small></span></button>`).join('')}</div></details>` : ''}

    ${armor}
    <footer class="rpg-button-row rpg-armory-footer"><button data-action="forge">Upgrade or reclaim copies</button><button class="rpg-primary" data-action="close">${playing ? 'Return to dungeon' : 'Back to camp'}</button><a href="?mode=mine" class="rpg-text-button">Gem collection & original shop</a></footer>
  </div>`;
}
