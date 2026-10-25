import type { RpgGearKind, RpgGearSlot, RpgState } from '@institute/shared';
import { mutateRpg } from './api';
import { PROFILE } from './config';
import { emptyGearUi, renderGearSheet, type GearSheetUi } from './gearView';
import { GearViewer } from './gearViewer';

export interface GearSheetHost {
  state(): RpgState | null;
  /** Save a new state from the server and refresh the HUD. */
  apply(state: RpgState): void;
  /** Redraw the equipment dialog (it calls html() again). */
  rerender(): void;
  toast(text: string): void;
  busy(): boolean;
  root(): HTMLElement;
}

const SEEN_KEY = `institute.rpg.gearSeen.${PROFILE}`;

/** Owns the character sheet's UI state, its clicks and the 3D preview. */
export class GearSheet {
  private ui: GearSheetUi = emptyGearUi();
  private viewer: GearViewer | null = null;
  private pending = false;

  constructor(private host: GearSheetHost) {
    try { this.ui.seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); } catch { /* Optional preference. */ }
  }

  html(state: RpgState): string {
    if (this.ui.selectedId && !state.gear?.some(item => item.id === this.ui.selectedId)) this.ui.selectedId = null;
    return renderGearSheet(state, this.ui);
  }

  /** Called after the dialog HTML is in the page. */
  mounted(): void {
    this.disposeViewer();
    const stage = this.host.root().querySelector<HTMLElement>('[data-gear-viewer]');
    if (stage) { this.viewer = new GearViewer(stage, stage.dataset.gearViewer!); void this.viewer.mount(); }
  }

  disposeViewer(): void { this.viewer?.dispose(); this.viewer = null; }

  /** Returns true when the click belonged to the character sheet. */
  handle(button: HTMLElement): boolean {
    const data = button.dataset;
    if (data.gearSelect) { this.select(data.gearSelect); this.redraw(`[data-gear-card] .rpg-gear-actions button`); return true; }
    if (data.gearSlot) {
      const state = this.host.state(), id = state?.equippedGear?.[data.gearSlot as RpgGearSlot];
      if (id && state?.gear?.some(item => item.id === id)) { this.select(id); this.redraw('[data-gear-card] .rpg-gear-actions button'); }
      else { this.ui.filter = data.gearSlot === 'ring1' || data.gearSlot === 'ring2' ? 'ring' : data.gearSlot as RpgGearKind; this.ui.selectedId = null; this.redraw(`[data-gear-filter="${this.ui.filter}"]`); }
      return true;
    }
    if (data.gearFilter) { this.ui.filter = data.gearFilter as GearSheetUi['filter']; this.redraw(`[data-gear-filter="${data.gearFilter}"]`); return true; }
    if (data.gearClose !== undefined) { const id = this.ui.selectedId; this.ui.selectedId = null; this.ui.confirmSalvage = false; this.redraw(id ? `[data-gear-select="${CSS.escape(id)}"]` : '.rpg-gear-sheet'); return true; }
    if (data.gearSalvage) { this.ui.confirmSalvage = true; this.redraw('[data-gear-salvage-cancel]'); return true; }
    if (data.gearSalvageCancel !== undefined) { this.ui.confirmSalvage = false; this.redraw('[data-gear-salvage]'); return true; }
    if (data.gearEquip) { void this.change('gear/equip', { gearId: data.gearEquip, slot: data.slot }, 'Gear on! You look ready.', `[data-gear-slot="${data.slot}"]`); return true; }
    if (data.gearUnequip) { void this.change('gear/unequip', { slot: data.gearUnequip }, 'Taken off. It is back in your bag.', `[data-gear-slot="${data.gearUnequip}"]`); return true; }
    if (data.gearSalvageConfirm) { void this.change('gear/salvage', { gearId: data.gearSalvageConfirm }, '', '[data-gear-filter][aria-pressed="true"]'); return true; }
    return false;
  }

  private select(id: string): void {
    this.ui.selectedId = id; this.ui.confirmSalvage = false;
    if (!this.ui.seen.has(id)) {
      this.ui.seen = new Set([...this.ui.seen, id]);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...this.ui.seen].slice(-400))); } catch { /* Optional preference. */ }
    }
  }

  private redraw(focus: string): void {
    this.host.rerender();
    requestAnimationFrame(() => this.host.root().querySelector<HTMLElement>(focus)?.focus({ preventScroll: true }));
  }

  private async change(action: string, body: Record<string, unknown>, message: string, focus: string): Promise<void> {
    if (this.pending || this.host.busy()) return;
    const before = this.host.state();
    this.pending = true;
    try {
      const state = await mutateRpg(action, body);
      const dust = Math.max(0, (state.forgeDust ?? 0) - (before?.forgeDust ?? 0));
      this.ui.selectedId = null; this.ui.confirmSalvage = false;
      this.host.apply(state);
      this.host.toast(action === 'gear/salvage' ? `+${dust} forge dust for the blacksmith.` : message);
    } catch {
      this.host.toast('That did not work this time. Your gear is safe. Try again in a moment.');
    } finally {
      this.pending = false;
      this.redraw(focus);
    }
  }
}
