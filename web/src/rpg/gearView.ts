import {
  RPG_GEAR_BASES, RPG_GEAR_SLOTS, RPG_GEAR_STAT_IDS, RPG_GEAR_STAT_LABELS, RPG_GEAR_CAPS, RPG_WARD_BASE, RPG_ITEMS,
  rpgEquippedGear, rpgGearStats, rpgMaxWard, rpgGearSalvageValue, rpgGearSlotKind,
  type RpgGearInstance, type RpgGearKind, type RpgGearSlot, type RpgGearStat, type RpgGearStats, type RpgState,
} from '@institute/shared';
import { escapeHtml as esc, gearArt, relicArt } from './icons';

/** UI-only state for the character sheet; nothing here is saved on the server. */
export interface GearSheetUi {
  filter: RpgGearKind | 'all';
  /** A bag item or an equipped item being looked at. */
  selectedId: string | null;
  /** Inline "are you sure" for turning the selected item into dust. */
  confirmSalvage: boolean;
  /** Ids the child has already looked at; the rest wear a "new" badge. */
  seen: ReadonlySet<string>;
}
export const emptyGearUi = (): GearSheetUi => ({ filter: 'all', selectedId: null, confirmSalvage: false, seen: new Set() });

export const GEAR_SLOT_NAMES: Readonly<Record<RpgGearSlot, string>> = {
  helm: 'Helm', chest: 'Armor', gloves: 'Gloves', pants: 'Pants', boots: 'Boots', amulet: 'Amulet', ring1: 'Left ring', ring2: 'Right ring',
};
const KIND_NAMES: Readonly<Record<RpgGearKind, [string, string]>> = {
  helm: ['Helm', 'Helms'], chest: ['Armor', 'Armor'], gloves: ['Gloves', 'Gloves'], pants: ['Pants', 'Pants'], boots: ['Boots', 'Boots'], amulet: ['Amulet', 'Amulets'], ring: ['Ring', 'Rings'],
};
const KINDS: readonly RpgGearKind[] = ['helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring'];
const RARITY_NAMES = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' } as const;

/** "+12 ward", "+5% run speed". */
export function gearStatText(stat: RpgGearStat, value: number): string {
  const { label, percent } = RPG_GEAR_STAT_LABELS[stat];
  return `+${value}${percent ? '%' : ''} ${label}`;
}
export function gearStatLines(stats: RpgGearStats): { stat: RpgGearStat; value: number; text: string }[] {
  return RPG_GEAR_STAT_IDS.filter(stat => (stats[stat] ?? 0) > 0).map(stat => ({ stat, value: stats[stat]!, text: gearStatText(stat, stats[stat]!) }));
}

export interface GearCompareLine { stat: RpgGearStat; text: string; delta: number; direction: 'up' | 'down' | 'same' }
/** Each stat either item has, as the change from wearing `item` instead of `worn`. */
export function gearComparison(item: RpgGearInstance, worn?: RpgGearInstance): GearCompareLine[] {
  return RPG_GEAR_STAT_IDS.filter(stat => (item.stats[stat] ?? 0) || (worn?.stats[stat] ?? 0)).map(stat => {
    const delta = (item.stats[stat] ?? 0) - (worn?.stats[stat] ?? 0);
    const { label, percent } = RPG_GEAR_STAT_LABELS[stat];
    const amount = `${Math.abs(delta)}${percent ? '%' : ''}`;
    return { stat, delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
      text: delta > 0 ? `+${amount} ${label}` : delta < 0 ? `−${amount} ${label}` : `Same ${label}` };
  });
}

/** Slots a copy may go in; rings choose a hand. */
export const gearSlotsFor = (kind: RpgGearKind): RpgGearSlot[] => RPG_GEAR_SLOTS.filter(slot => rpgGearSlotKind(slot) === kind);

/** Unequipped copies, newest first (the server appends new drops). */
export function gearBag(state: Pick<RpgState, 'gear' | 'equippedGear'>, filter: GearSheetUi['filter'] = 'all'): RpgGearInstance[] {
  const worn = new Set(Object.values(rpgEquippedGear(state)).map(item => item!.id));
  return [...(state.gear ?? [])].reverse().filter(item => !worn.has(item.id) && (filter === 'all' || item.kind === filter));
}

const baseName = (item: RpgGearInstance) => RPG_GEAR_BASES.find(base => base.id === item.baseId)?.name ?? KIND_NAMES[item.kind][0];

function slotButton(slot: RpgGearSlot, item: RpgGearInstance | undefined, selected: boolean): string {
  const name = GEAR_SLOT_NAMES[slot];
  if (!item) return `<button class="rpg-doll-slot empty" style="grid-area:${slot}" data-gear-slot="${slot}" aria-label="${name}: empty. Show ${esc(KIND_NAMES[rpgGearSlotKind(slot)][1].toLowerCase())} in your bag"><span class="rpg-doll-ghost rpg-doll-ghost-${rpgGearSlotKind(slot)}" aria-hidden="true"></span><small>${name}</small></button>`;
  return `<button class="rpg-doll-slot ${item.rarity}${selected ? ' selected' : ''}" style="grid-area:${slot}" data-gear-slot="${slot}" aria-pressed="${selected}" aria-label="${name}: ${esc(item.name)}, ${RARITY_NAMES[item.rarity]}. ${esc(gearStatLines(item.stats).map(line => line.text).join(', '))}">${gearArt(item.baseId)}<small>${name}</small></button>`;
}

function renderTotals(state: RpgState): string {
  const totals = rpgGearStats(state), ward = rpgMaxWard(state);
  const lines = RPG_GEAR_STAT_IDS.filter(stat => stat !== 'ward' && totals[stat] > 0).map(stat => {
    const cap = RPG_GEAR_CAPS[stat];
    return `<li><b>${gearStatText(stat, totals[stat])}</b>${cap && totals[stat] >= cap ? '<small>the most gear can give</small>' : ''}</li>`;
  });
  return `<section class="rpg-gear-totals" aria-label="Your gear adds up to">
    <div class="rpg-gear-ward"><span class="rpg-gear-ward-orb" aria-hidden="true"></span><strong>${ward}</strong><span>ward<small>${RPG_WARD_BASE} from your hero${ward > RPG_WARD_BASE ? ` + ${ward - RPG_WARD_BASE} from gear` : ''}</small></span></div>
    ${lines.length ? `<ul>${lines.join('')}</ul>` : '<p>Put on gear to grow stronger. Chests and monsters drop it.</p>'}
  </section>`;
}

function renderDetails(state: RpgState, ui: GearSheetUi): string {
  const item = ui.selectedId ? state.gear?.find(entry => entry.id === ui.selectedId) : undefined;
  if (!item) return '';
  const equipped = rpgEquippedGear(state);
  const wornIn = RPG_GEAR_SLOTS.find(slot => equipped[slot]?.id === item.id);
  const slots = gearSlotsFor(item.kind);
  const dust = rpgGearSalvageValue(item);
  const compares = wornIn ? '' : slots.map(slot => {
    const worn = equipped[slot];
    const lines = gearComparison(item, worn);
    return `<div class="rpg-gear-compare"><small>${worn ? `Compared with your ${slots.length > 1 ? GEAR_SLOT_NAMES[slot].toLowerCase() : esc(baseName(worn))}` : `${GEAR_SLOT_NAMES[slot]} is empty`}</small><ul>${lines.map(line => `<li class="${line.direction}"><span aria-hidden="true">${line.direction === 'up' ? '▲' : line.direction === 'down' ? '▼' : '='}</span>${esc(line.text)}</li>`).join('')}</ul></div>`;
  }).join('');
  const actions = wornIn
    ? `<button class="rpg-primary" data-gear-unequip="${wornIn}">Take it off</button>`
    : ui.confirmSalvage
      ? `<div class="rpg-gear-confirm" role="group" aria-label="Turn into forge dust?"><p>Turn ${esc(item.name)} into <b>${dust} forge dust</b>? It will be gone.</p><button class="rpg-primary" data-gear-salvage-confirm="${esc(item.id)}">Yes, turn it into dust</button><button data-gear-salvage-cancel>Keep it</button></div>`
      : `${slots.map(slot => `<button class="rpg-primary" data-gear-equip="${esc(item.id)}" data-slot="${slot}">${slots.length > 1 ? `Wear on ${slot === 'ring1' ? 'left' : 'right'} hand` : 'Put it on'}</button>`).join('')}<button class="rpg-gear-salvage" data-gear-salvage="${esc(item.id)}">Turn into ${dust} forge dust</button>`;
  return `<article class="rpg-gear-card ${item.rarity}" aria-label="${esc(item.name)}" data-gear-card="${esc(item.id)}">
    <button class="rpg-gear-card-close" data-gear-close aria-label="Close details">×</button>
    <div class="rpg-gear-stage" data-gear-viewer="${esc(item.baseId)}">${gearArt(item.baseId)}</div>
    <div class="rpg-gear-card-body">
      <small class="rpg-gear-card-kind">${RARITY_NAMES[item.rarity]} ${esc(KIND_NAMES[item.kind][0].toLowerCase())} · ${esc(baseName(item))} · Tier ${item.tier}</small>
      <h3>${esc(item.name)}</h3>
      <ul class="rpg-gear-lines">${gearStatLines(item.stats).map(line => `<li>${esc(line.text)}</li>`).join('')}</ul>
      ${wornIn ? `<p class="rpg-gear-worn">✓ Wearing it · ${GEAR_SLOT_NAMES[wornIn]}</p>` : compares}
      <div class="rpg-gear-actions">${actions}</div>
    </div>
  </article>`;
}

function renderBag(state: RpgState, ui: GearSheetUi): string {
  const all = gearBag(state), shown = gearBag(state, ui.filter);
  const chip = (kind: GearSheetUi['filter'], label: string, count: number) => `<button class="rpg-gear-chip" data-gear-filter="${kind}" aria-pressed="${ui.filter === kind}">${label}<span>${count}</span></button>`;
  return `<section class="rpg-gear-bag" aria-label="Gear bag">
    <div class="rpg-gear-bag-heading"><h3>Gear bag</h3><span>Newest first</span></div>
    <div class="rpg-gear-chips" role="group" aria-label="Show gear">${chip('all', 'All', all.length)}${KINDS.map(kind => chip(kind, KIND_NAMES[kind][1], all.filter(item => item.kind === kind).length)).join('')}</div>
    ${shown.length ? `<div class="rpg-gear-grid">${shown.map(item => {
      const fresh = !ui.seen.has(item.id), selected = ui.selectedId === item.id;
      return `<button class="rpg-gear-item ${item.rarity}${selected ? ' selected' : ''}" data-gear-select="${esc(item.id)}" aria-pressed="${selected}" aria-label="${esc(item.name)}, ${RARITY_NAMES[item.rarity]} ${KIND_NAMES[item.kind][0].toLowerCase()}${fresh ? ', new' : ''}. ${esc(gearStatLines(item.stats).map(line => line.text).join(', '))}">${gearArt(item.baseId)}${fresh ? '<span class="rpg-gear-new" aria-hidden="true">NEW</span>' : ''}<span class="rpg-gear-item-name">${esc(item.name)}</span></button>`;
    }).join('')}</div>` : `<p class="rpg-gear-empty">${all.length ? 'Nothing of this kind in your bag yet.' : 'Your bag is empty. Open chests and beat monsters to find gear.'}</p>`}
  </section>`;
}

/** Diablo-style character sheet: paper doll, totals, details card and bag. */
export function renderGearSheet(state: RpgState, ui: GearSheetUi): string {
  const equipped = rpgEquippedGear(state);
  const relic = RPG_ITEMS.find(item => item.id === state.equippedItemId) ?? RPG_ITEMS[0]!;
  const selectedSlot = RPG_GEAR_SLOTS.find(slot => equipped[slot] && equipped[slot]!.id === ui.selectedId);
  return `<section class="rpg-gear-sheet" aria-label="Your hero's gear">
    <div class="rpg-gear-sheet-top">
      <div class="rpg-paper-doll" role="group" aria-label="Gear you are wearing">
        <div class="rpg-doll-hero" style="grid-area:hero" data-hero-doll title="Drag to turn your hero"><img src="/assets/rpg/appearances/${esc(state.appearanceId ?? 'wayfarer')}.png" alt="" draggable="false"></div>
        ${RPG_GEAR_SLOTS.map(slot => slotButton(slot, equipped[slot], slot === selectedSlot)).join('')}
        <a class="rpg-doll-slot rpg-doll-weapon ${relic.rarity}" style="grid-area:weapon" href="#rpg-relic-collection" aria-label="Relic: ${esc(relic.name)}. See your relics">${relicArt(relic.id)}<small>Relic</small></a>
      </div>
      ${renderTotals(state)}
    </div>
    ${renderDetails(state, ui)}
    ${renderBag(state, ui)}
  </section>`;
}
