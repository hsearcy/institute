import { escapeHtml as esc, icon } from './icons';
import './tutorial.css';

export interface TutorialOverlayPage {
  readonly id: string;
  readonly phase: 'story' | 'tour';
  readonly title: string;
  readonly body: string;
  readonly cue: string;
  readonly icon: string;
  readonly focus?: string;
  readonly panel?: 'spellbook' | 'skills' | 'inventory' | 'merchant' | 'forge' | 'quests' | 'map';
}

export interface TutorialOverlayCallbacks {
  onNext(): void;
  onBack(): void;
  onSkip(): void;
  onSpeak(): void;
}

/** Presentation only: the game owns narration, tour progress and background inert. */
export class TutorialOverlay {
  private readonly root = document.createElement('div');
  private readonly restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private readonly resizeObserver: ResizeObserver;
  private anchor: HTMLElement | null = null;
  private frame = 0;
  private destroyed = false;

  constructor(host: HTMLElement, private readonly callbacks: TutorialOverlayCallbacks) {
    this.root.className = 'rpg-tutorial';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="rpg-tutorial-shade" data-shade="top"></div><div class="rpg-tutorial-shade" data-shade="left"></div><div class="rpg-tutorial-shade" data-shade="right"></div><div class="rpg-tutorial-shade" data-shade="bottom"></div><div class="rpg-tutorial-ring" aria-hidden="true" hidden></div><section class="rpg-tutorial-card" role="dialog" aria-modal="true" aria-labelledby="rpg-tutorial-title" aria-describedby="rpg-tutorial-body" tabindex="-1"></section>`;
    host.append(this.root);
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('pointerdown', this.stopBackground);
    this.root.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('focusin', this.onFocusIn, true);
    window.addEventListener('resize', this.scheduleLayout);
    window.addEventListener('scroll', this.scheduleLayout, true);
    window.visualViewport?.addEventListener('resize', this.scheduleLayout);
    window.visualViewport?.addEventListener('scroll', this.scheduleLayout);
    this.resizeObserver = new ResizeObserver(this.scheduleLayout);
    this.resizeObserver.observe(this.card);
  }

  private get card(): HTMLElement { return this.root.querySelector<HTMLElement>('.rpg-tutorial-card')!; }

  show(page: TutorialOverlayPage, index: number, total: number, anchor: HTMLElement | null): void {
    if (this.destroyed) return;
    if (this.anchor) this.resizeObserver.unobserve(this.anchor);
    this.anchor = page.phase === 'tour' ? anchor : null;
    if (this.anchor) this.resizeObserver.observe(this.anchor);
    this.root.hidden = false;
    this.root.dataset.phase = page.phase;
    this.root.dataset.page = page.id;
    this.root.dataset.panel = page.panel ?? '';
    const step = Math.max(0, Math.min(index, total - 1));
    const last = step >= total - 1;
    this.card.innerHTML = `<div class="rpg-tutorial-story-art" aria-hidden="true"><div class="rpg-tutorial-halo"></div><img src="/assets/rpg/appearances/wayfarer.png" alt="" draggable="false"><span class="rpg-tutorial-portrait-caption">YOUR ADVENTURE AWAITS</span></div>
      <div class="rpg-tutorial-copy"><header class="rpg-tutorial-heading"><span class="rpg-tutorial-chapter">${page.phase === 'story' ? 'THE SUNKEN VAULT' : 'YOUR HERO’S HANDBOOK'}</span><span class="rpg-tutorial-count" aria-label="Page ${step + 1} of ${total}">${step + 1} <span>/ ${total}</span></span></header>
      <div class="rpg-tutorial-badge" aria-hidden="true">${icon(page.icon)}</div><h2 id="rpg-tutorial-title">${esc(page.title)}</h2><p id="rpg-tutorial-body">${esc(page.body)}</p><p class="rpg-tutorial-cue">${icon('shield')}<span>${esc(page.cue)}</span></p>
      <button type="button" class="rpg-tutorial-read" data-tutorial-action="speak">${icon('sound')} Read aloud</button>
      <div class="rpg-tutorial-progress" role="progressbar" aria-label="Adventure guide progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${step + 1}"><span style="width:${((step + 1) / Math.max(1, total)) * 100}%"></span></div>
      <footer class="rpg-tutorial-controls"><button type="button" class="rpg-tutorial-back" data-tutorial-action="back" ${step === 0 ? 'disabled' : ''}>← Back</button><button type="button" class="rpg-tutorial-next" data-tutorial-action="next">${last ? 'I’m ready!' : 'Next'} <span aria-hidden="true">→</span></button></footer><button type="button" class="rpg-tutorial-skip" data-tutorial-action="skip">Skip guide</button></div>`;
    this.card.scrollTop = 0;
    this.layout();
    this.focusFirst();
  }

  focusFirst(): void {
    this.card.querySelector<HTMLButtonElement>('[data-tutorial-action="next"]')?.focus({ preventScroll: true });
  }

  private readonly stopBackground = (event: Event): void => { event.stopPropagation(); };
  private readonly onWheel = (event: WheelEvent): void => {
    event.stopPropagation();
    if (!(event.target instanceof Node) || !this.card.contains(event.target)) event.preventDefault();
  };
  private readonly onClick = (event: MouseEvent): void => {
    event.stopPropagation();
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-tutorial-action]') : null;
    if (!button || button.disabled) return;
    switch (button.dataset.tutorialAction) {
      case 'next': this.callbacks.onNext(); break;
      case 'back': this.callbacks.onBack(); break;
      case 'skip': this.callbacks.onSkip(); break;
      case 'speak': this.callbacks.onSpeak(); break;
    }
  };
  private readonly onFocusIn = (event: FocusEvent): void => {
    if (!this.root.hidden && !this.destroyed && event.target instanceof Node && !this.root.contains(event.target)) this.focusFirst();
  };
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.root.hidden || this.destroyed) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); this.callbacks.onSkip(); return;
    }
    // Prevent background game hotkeys; native Enter/Space still activate buttons.
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const buttons = [...this.card.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (!first || !last) { event.preventDefault(); this.card.focus(); return; }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !this.card.contains(active))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !this.card.contains(active))) {
      event.preventDefault(); first.focus();
    }
  };
  private readonly scheduleLayout = (): void => {
    if (this.frame || this.destroyed) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.layout(); });
  };

  private layout(): void {
    if (this.root.hidden || this.destroyed) return;
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const offsetX = viewport?.offsetLeft ?? 0;
    const offsetY = viewport?.offsetTop ?? 0;
    this.root.style.setProperty('--tutorial-viewport-height', `${height}px`);
    const shades = [...this.root.querySelectorAll<HTMLElement>('.rpg-tutorial-shade')];
    const ring = this.root.querySelector<HTMLElement>('.rpg-tutorial-ring')!;
    let rect = this.anchor?.isConnected ? this.anchor.getBoundingClientRect() : null;
    // Highlight only the part actually visible inside a scrolling game panel.
    for (let parent = this.anchor?.parentElement; rect && parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      if (/(auto|scroll|hidden|clip)/.test(`${css.overflowX} ${css.overflowY}`)) {
        const clip = parent.getBoundingClientRect();
        const left = Math.max(rect.left, clip.left), top = Math.max(rect.top, clip.top);
        rect = new DOMRect(left, top, Math.max(0, Math.min(rect.right, clip.right) - left), Math.max(0, Math.min(rect.bottom, clip.bottom) - top));
      }
    }
    const visible = rect && rect.width > 0 && rect.height > 0 && rect.bottom > offsetY && rect.top < offsetY + height && rect.right > offsetX && rect.left < offsetX + width;
    let highlight: { left: number; top: number; right: number; bottom: number } | null = null;
    if (visible && rect) {
      highlight = { left: Math.max(offsetX + 4, rect.left - 7), top: Math.max(offsetY + 4, rect.top - 7), right: Math.min(offsetX + width - 4, rect.right + 7), bottom: Math.min(offsetY + height - 4, rect.bottom + 7) };
      const h = highlight;
      const regions = [[offsetX, offsetY, width, h.top - offsetY], [offsetX, h.top, h.left - offsetX, h.bottom - h.top], [h.right, h.top, offsetX + width - h.right, h.bottom - h.top], [offsetX, h.bottom, width, offsetY + height - h.bottom]];
      shades.forEach((shade, i) => { const [x, y, w, h] = regions[i]!; Object.assign(shade.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` }); });
      Object.assign(ring.style, { left: `${h.left}px`, top: `${h.top}px`, width: `${h.right - h.left}px`, height: `${h.bottom - h.top}px` });
      ring.hidden = false;
    } else {
      shades.forEach((shade, index) => { Object.assign(shade.style, { left: `${offsetX}px`, top: `${offsetY}px`, width: index === 0 ? `${width}px` : '0', height: index === 0 ? `${height}px` : '0' }); });
      ring.hidden = true;
    }
    const card = this.card;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const margin = 12, gap = 18;
    const clampX = (x: number) => Math.max(offsetX + margin, Math.min(x, offsetX + width - cw - margin));
    const clampY = (y: number) => Math.max(offsetY + margin, Math.min(y, offsetY + height - ch - margin));
    let x = offsetX + (width - cw) / 2, y = offsetY + (height - ch) / 2;
    if (highlight) {
      const h = highlight;
      const candidates = [
        { x: clampX((h.left + h.right - cw) / 2), y: h.bottom + gap },
        { x: clampX((h.left + h.right - cw) / 2), y: h.top - ch - gap },
        { x: h.right + gap, y: clampY((h.top + h.bottom - ch) / 2) },
        { x: h.left - cw - gap, y: clampY((h.top + h.bottom - ch) / 2) },
        { x: offsetX + margin, y: offsetY + margin },
        { x: offsetX + width - cw - margin, y: offsetY + height - ch - margin },
      ];
      const score = (p: { x: number; y: number }) => {
        const overlap = Math.max(0, Math.min(p.x + cw, h.right) - Math.max(p.x, h.left)) * Math.max(0, Math.min(p.y + ch, h.bottom) - Math.max(p.y, h.top));
        const overflow = Math.max(0, offsetX + margin - p.x) + Math.max(0, p.x + cw + margin - offsetX - width) + Math.max(0, offsetY + margin - p.y) + Math.max(0, p.y + ch + margin - offsetY - height);
        return overlap + overflow * Math.max(width, height) * 10;
      };
      const best = candidates.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best);
      x = best.x; y = best.y;
    }
    card.style.left = `${clampX(x)}px`;
    card.style.top = `${clampY(y)}px`;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('focusin', this.onFocusIn, true);
    window.removeEventListener('resize', this.scheduleLayout);
    window.removeEventListener('scroll', this.scheduleLayout, true);
    window.visualViewport?.removeEventListener('resize', this.scheduleLayout);
    window.visualViewport?.removeEventListener('scroll', this.scheduleLayout);
    this.root.remove();
    if (this.restoreFocus?.isConnected && !this.restoreFocus.closest('[inert]')) this.restoreFocus.focus({ preventScroll: true });
  }
}
