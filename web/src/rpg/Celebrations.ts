import './celebrations.css';
import * as sound from './sound';

export interface CelebrationEvent {
  id: string;
  kind: 'quest' | 'level' | 'daily-board';
  title: string;
  subtitle: string;
  reward?: string;
  level?: number;
}

/** Receipt IDs prevent refreshed state and retried requests from replaying rewards.
 * Several quests earned by one answer share a card; a level never loses its turn. */
export class CelebrationQueue {
  private seen = new Set<string>();
  private pending: CelebrationEvent[] = [];

  push(event: CelebrationEvent): boolean {
    if (!event.id || this.seen.has(event.id)) return false;
    this.seen.add(event.id);
    this.pending.push({ ...event });
    return true;
  }

  take(): CelebrationEvent | undefined {
    const first = this.pending.shift();
    if (!first || first.kind !== 'quest') return first;
    const quests = [first];
    while (quests.length < 5 && this.pending[0]?.kind === 'quest') quests.push(this.pending.shift()!);
    if (quests.length === 1) return first;
    const gems = quests.map(q => q.reward?.match(/^\+?(\d+) gems$/));
    const reward = gems.every(Boolean)
      ? `+${gems.reduce((sum, match) => sum + Number(match![1]), 0)} gems`
      : quests.map(q => q.reward).filter(Boolean).join(' · ');
    return {
      id: quests.map(q => q.id).join('|'), kind: 'quest',
      title: `${quests.length} quests complete!`,
      subtitle: quests.map(q => q.subtitle || q.title).join(' · '),
      reward,
    };
  }

  clear(): void { this.pending = []; this.seen.clear(); }
}

type CelebrationOptions = {
  onStart?: (event: CelebrationEvent) => void;
  onEnd?: (event: CelebrationEvent) => void;
  soundEnabled?: () => boolean;
};

function escape(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** A sculpted star medallion, using the same warm metals as the dungeon HUD. */
function medal(kind: CelebrationEvent['kind']): string {
  const paths = kind === 'level'
    ? ''
    : '<path d="m60 29 9.3 18.8 20.7 3-15 14.6L78.6 86 60 76.2 41.4 86 45 65.4 30 50.8l20.7-3Z" fill="url(#reward-gold)" stroke="#fff2bd" stroke-width="1.5"/><path d="m60 37 7 14.2 15.7 2.3L60 60Z" fill="#fff7d4" opacity=".7"/><path d="m60 60 14 20-14-7.5Z" fill="#805125" opacity=".6"/>';
  return `<svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><defs><linearGradient id="reward-gold" x1="32" y1="24" x2="87" y2="94" gradientUnits="userSpaceOnUse"><stop stop-color="#fffbe0"/><stop offset=".35" stop-color="#f5d386"/><stop offset=".55" stop-color="#a16a28"/><stop offset=".72" stop-color="#f8de96"/><stop offset="1" stop-color="#855322"/></linearGradient><radialGradient id="reward-enamel"><stop stop-color="#385b64"/><stop offset=".65" stop-color="#142b37"/><stop offset="1" stop-color="#0a1520"/></radialGradient></defs><path d="m60 3 13 8 15 1 8 13 13 8 1 15 7 12-7 13-1 15-13 8-8 13-15 1-13 7-12-7-15-1-8-13-13-8-1-15L3 60l8-12 1-15 13-8 8-13 15-1Z" fill="url(#reward-gold)" stroke="#fff0b9" stroke-width=".6"/><circle cx="60" cy="60" r="48" fill="url(#reward-enamel)" stroke="#6d4927" stroke-width="3"/><circle cx="60" cy="60" r="43" stroke="#f4d58d" stroke-width=".7" stroke-dasharray="1 4"/><path d="M26 67c3 15 13 25 27 29M94 67C91 82 81 92 67 96" stroke="#dcb66b" stroke-width="2"/>${paths}<path d="m60 5 3 5-3 5-3-5Z" fill="#fff9d6"/><path d="m60 105 3 5-3 5-3-5Z" fill="#ffe5a5"/></svg>`;
}

/** Pure presentation: timers never advance a question, combat, or reward state. */
export class Celebrations {
  private readonly queue = new CelebrationQueue();
  private readonly layer: HTMLDivElement;
  private readonly announcer: HTMLDivElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private current: CelebrationEvent | null = null;
  private disposed = false;

  constructor(host: HTMLElement, private readonly options: CelebrationOptions = {}) {
    this.layer = document.createElement('div');
    this.layer.className = 'rpg-celebrations';
    this.layer.setAttribute('aria-hidden', 'true');
    this.announcer = document.createElement('div');
    this.announcer.className = 'rpg-reward-announcer';
    this.announcer.setAttribute('role', 'status');
    this.announcer.setAttribute('aria-live', 'polite');
    this.announcer.setAttribute('aria-atomic', 'true');
    host.append(this.layer, this.announcer);
  }

  celebrate(event: CelebrationEvent): void {
    if (this.disposed || !this.queue.push(event)) return;
    // Let a single response enqueue its quest, board, and level receipts together.
    if (!this.current && this.timer === null) this.timer = setTimeout(() => this.next(), 0);
  }

  private next(): void {
    this.timer = null;
    if (this.disposed) return;
    const event = this.queue.take();
    if (!event) { this.layer.replaceChildren(); return; }
    this.current = event;
    const level = event.kind === 'level';
    const particleCount = 32;
    const particles = Array.from({ length: particleCount }, (_, i) => {
      const angle = (i / particleCount) * Math.PI * 2;
      const distance = 110 + ((i * 37) % 145);
      const x = Math.round(Math.cos(angle) * distance);
      const y = Math.round(Math.sin(angle) * distance * .55 - 25);
      return `<i class="rpg-reward-spark ${i % 3 === 0 ? 'is-gem' : ''}" style="--spark-x:${x}px;--spark-y:${y}px;--spark-delay:${100 + (i % 6) * 37}ms;--spark-turn:${120 + (i * 71) % 460}deg;--spark-size:${3 + i % 4}px"></i>`;
    }).join('');
    this.layer.innerHTML = `<section class="rpg-reward-reveal" data-kind="${event.kind}" data-receipt="${escape(event.id)}">
      <div class="rpg-reward-aura"></div><div class="rpg-reward-rays"></div><div class="rpg-reward-ring"></div>
      <div class="rpg-reward-particles">${particles}</div>
      <div class="rpg-reward-medal">${medal(event.kind)}${level && event.level !== undefined ? `<strong class="rpg-reward-level-number">${event.level}</strong>` : ''}<span class="rpg-reward-medal-glint"></span></div>
      <div class="rpg-reward-banner"><span class="rpg-reward-kicker">${level ? 'A new level of awesome' : event.kind === 'daily-board' ? 'Every quest. All yours.' : 'You did it!'}</span>
      <h2>${escape(event.title)}</h2><p>${escape(event.subtitle)}</p>
      ${event.reward ? `<div class="rpg-reward-prize"><span class="rpg-reward-prize-gem"></span><strong>${escape(event.reward)}</strong><span class="rpg-reward-prize-gem"></span></div>` : ''}</div>
    </section>`;
    this.announcer.textContent = [event.title, event.subtitle, event.reward].filter(Boolean).join('. ');
    if (this.options.soundEnabled?.() !== false) sound.rewardFanfare(event.kind);
    this.options.onStart?.(event);
    this.timer = setTimeout(() => {
      this.current = null;
      this.layer.replaceChildren();
      this.options.onEnd?.(event);
      this.next();
    }, 3400);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.queue.clear();
    this.layer.remove();
    this.announcer.remove();
  }
}
