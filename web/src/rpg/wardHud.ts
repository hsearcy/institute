// The hero's ward, beside the level orb: a calm bar that holds the strikes of
// the monsters still standing after each spell. It never turns red, never
// flashes and never sounds an alarm. When it runs out the hero kneels and it
// refills; nothing is lost. Wrong answers, hints and "I don't know" never touch it.
import { rpgWardNow, type RpgGearInstance, type RpgReward, type RpgState } from '@institute/shared';
import { escapeHtml as esc } from './icons';
import './ward.css';

export const WARD_HTML = '<div class="rpg-ward" id="rpg-ward" role="meter" aria-label="Ward" aria-valuemin="0" hidden><i class="rpg-ward-fill"></i><b class="rpg-ward-value"></b></div>';

/** Blue when full, easing to pale gold as it runs low. Never red. */
export function wardColor(fraction: number): string {
  const f = Math.max(0, Math.min(1, fraction));
  const mix = (a: number, b: number) => Math.round(b + (a - b) * f);
  return `rgb(${mix(0x6f, 0xf2)}, ${mix(0xd2, 0xdc)}, ${mix(0xff, 0xa6)})`;
}

export class WardHud {
  /** While the strike animation plays, the state's value waits to be shown. */
  private holdUntil = 0;

  constructor(private readonly host: () => HTMLElement) {}

  private get bar(): HTMLElement | null { return this.host().querySelector<HTMLElement>('#rpg-ward'); }

  set(value: number, max: number, glow = false): void {
    const bar = this.bar; if (!bar) return;
    const fraction = max > 0 ? value / max : 1;
    const fill = bar.querySelector<HTMLElement>('.rpg-ward-fill')!;
    fill.style.width = `${Math.round(fraction * 1000) / 10}%`;
    fill.style.background = `linear-gradient(${wardColor(fraction)}, ${wardColor(Math.max(0, fraction - .25))})`;
    bar.querySelector('.rpg-ward-value')!.textContent = String(Math.round(value));
    bar.setAttribute('aria-valuenow', String(Math.round(value)));
    bar.setAttribute('aria-valuemax', String(Math.round(max)));
    bar.setAttribute('aria-valuetext', `Ward ${Math.round(value)} of ${Math.round(max)}`);
    bar.classList.toggle('rpg-ward-glow', glow);
  }

  /** Shows the saved ward unless a strike animation is still playing. */
  render(state: RpgState): void {
    const bar = this.bar; if (!bar) return;
    bar.hidden = !state.expedition || state.expedition.cleared;
    if (performance.now() < this.holdUntil) return;
    const ward = rpgWardNow(state);
    this.set(ward.value, ward.max);
  }

  /**
   * The survivors strike (in the world), then the bar drains to the server's
   * value. If the ward ran out it drains to empty, the hero kneels, and it refills.
   */
  play(reward: RpgReward, strike: (count: number) => number, kneel: (seconds: number) => void): void {
    const ward = reward.ward; if (!ward || ward.lost <= 0) return;
    const survivors = reward.combat?.remainingEnemies ?? 0;
    const delay = strike(survivors) * 1000 + 250;
    this.holdUntil = performance.now() + delay + (ward.knelt ? 2600 : 0);
    window.setTimeout(() => {
      if (!ward.knelt) { this.set(ward.value, ward.max); return; }
      this.set(0, ward.max);
      kneel(2);
      window.setTimeout(() => this.set(ward.max, ward.max, true), 900);
      window.setTimeout(() => this.bar?.classList.remove('rpg-ward-glow'), 2600);
    }, delay);
  }
}

/** A short label that rises beside the hero for gear that just fell. */
export function showGearLabel(root: HTMLElement, gear: RpgGearInstance, at: { x: number; y: number }): void {
  const label = document.createElement('div');
  label.className = 'rpg-gear-label'; label.dataset.rarity = gear.rarity; label.setAttribute('aria-hidden', 'true');
  label.innerHTML = `<small>${esc(gear.rarity === 'common' ? 'GEAR' : gear.rarity.toUpperCase())}</small>${esc(gear.name)}`;
  label.style.left = `${at.x}px`; label.style.top = `${at.y - 40}px`;
  root.appendChild(label);
  window.setTimeout(() => label.remove(), 3600);
}
