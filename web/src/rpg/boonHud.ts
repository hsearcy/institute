import { RPG_BOONS, RPG_BOON_SECONDS, type RpgBoon, type RpgBoonId } from '@institute/shared';
import './boon.css';

const GLYPH: Record<RpgBoonId, string> = {
  // A flame, a feather and a cut gem, drawn on a 24-unit grid.
  fury: '<path d="M12 3c1 3.2 4.6 5.4 4.6 9.6A4.6 4.6 0 0 1 12 17.2a4.6 4.6 0 0 1-4.6-4.6c0-2 1-3.4 2.1-4.4.1 1.7.9 2.8 2 3.2-.7-2.6.1-5.6.5-8.4Z"/><path d="M12 21a3 3 0 0 1-3-3c0-1.4 1-2.4 1.8-3.1.2 1 .8 1.6 1.4 1.8-.2-1 .2-2.1.6-2.9.9 1.1 2.2 2.4 2.2 4.2a3 3 0 0 1-3 3Z" opacity=".55"/>',
  swiftness: '<path d="M19.5 3.5C12 4 6.6 9.2 5.4 16.6l-.9 4 1.2.3.9-3.4c4.8-.3 9.8-3.6 12-8.6-1.7.7-3.4 1-5 .9 2.6-1.3 4.6-3.5 5.9-6.3Z"/><path d="M6.6 17.5 13 11" stroke="#0b1114" stroke-width="1.1" fill="none" stroke-linecap="round"/>',
  bounty: '<path d="M7.5 4h9l4 5.2L12 20.5 3.5 9.2Z"/><path d="M3.5 9.2h17M9.5 4 12 9.2 14.5 4M12 9.2v11.3" stroke="#0b1114" stroke-width=".9" fill="none" stroke-linejoin="round"/>',
};
const RING = 2 * Math.PI * 21;

/**
 * The boon badge under the area name: an icon in the boon's colour with a
 * thin ring that empties slowly. The clock only runs while the hero explores,
 * never while a problem waits, and the badge fades away quietly at the end:
 * no blinking, no sound, no warning colour.
 */
export class BoonHud {
  readonly element = document.createElement('div');
  private boon: RpgBoonId | null = null;
  private remainingMs = 0;
  private lastFrame = 0;
  private frame: number | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  /** `running` says whether the clock may advance this frame; `onEnd` hears when the boon is over. */
  constructor(private readonly running: () => boolean, private readonly onEnd: (boon: RpgBoonId) => void) {
    this.element.className = 'rpg-boon'; this.element.id = 'rpg-boon'; this.element.hidden = true;
    this.element.setAttribute('role', 'status');
  }

  /** The boon still running, or null. */
  get active(): RpgBoonId | null { return this.boon; }

  /** Shows a boon with this much time left. */
  start(boon: RpgBoonId, remainingMs = RPG_BOON_SECONDS * 1000): void {
    if (this.fadeTimer) { clearTimeout(this.fadeTimer); this.fadeTimer = null; }
    this.boon = boon; this.remainingMs = Math.max(0, Math.min(RPG_BOON_SECONDS * 1000, remainingMs));
    const info = RPG_BOONS[boon];
    this.element.style.setProperty('--boon', info.color);
    this.element.dataset.boon = boon;
    this.element.innerHTML = `<div class="rpg-boon-icon" aria-hidden="true"><svg viewBox="0 0 48 48" class="rpg-boon-ring"><circle cx="24" cy="24" r="21" class="rpg-boon-track"/><circle cx="24" cy="24" r="21" class="rpg-boon-time" stroke-dasharray="${RING.toFixed(2)}"/></svg><svg viewBox="0 0 24 24" class="rpg-boon-glyph">${GLYPH[boon]}</svg></div><div class="rpg-boon-text"><strong>${info.name}</strong><span>${info.blurb}</span></div>`;
    this.element.setAttribute('aria-label', `${info.name}: ${info.blurb}`);
    this.element.hidden = false; this.element.classList.remove('rpg-boon-ending');
    this.render();
    this.lastFrame = performance.now();
    if (this.frame === null) this.frame = requestAnimationFrame(this.tick);
  }

  /** Restores a boon saved on the server after a reload: an estimate, never more than a full boon. */
  restore(boon: RpgBoon | undefined): void {
    if (!boon) { if (this.boon) this.end(); return; }
    const left = RPG_BOON_SECONDS * 1000 + boon.pausedMs - (Date.now() - boon.grantedAt);
    if (left > 500) this.start(boon.id, left);
  }

  /** Ends the boon now (spent, or the expedition is over), fading the badge out. */
  end(): void {
    const boon = this.boon; if (!boon) return;
    this.boon = null; this.remainingMs = 0;
    if (this.frame !== null) { cancelAnimationFrame(this.frame); this.frame = null; }
    this.element.classList.add('rpg-boon-ending');
    this.fadeTimer = setTimeout(() => { this.element.hidden = true; this.element.classList.remove('rpg-boon-ending'); this.fadeTimer = null; }, 1200);
    this.onEnd(boon);
  }

  dispose(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.frame = null; this.boon = null; this.element.remove();
  }

  private readonly tick = (now: number) => {
    this.frame = null;
    if (!this.boon) return;
    const delta = Math.min(250, now - this.lastFrame); this.lastFrame = now;
    const running = this.running();
    this.element.classList.toggle('rpg-boon-resting', !running);
    if (running) this.remainingMs -= delta;
    this.render();
    if (this.remainingMs <= 0) { this.end(); return; }
    this.frame = requestAnimationFrame(this.tick);
  };

  private render(): void {
    const time = this.element.querySelector<SVGCircleElement>('.rpg-boon-time');
    if (time) time.style.strokeDashoffset = (RING * (1 - this.remainingMs / (RPG_BOON_SECONDS * 1000))).toFixed(2);
  }
}
