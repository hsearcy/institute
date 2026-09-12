// DOM overlay HUD: the problem, the answer being built, the gem number-pad, the
// MINE (pickaxe) button, the animated gem counter, the streak flame, the daily
// quests panel, the shield slot, and the over-the-top celebration layer. DOM (not
// canvas) so text is crisp and the pad is touch-friendly on mobile.
import type { Quest, CompletedQuest, DailyProgress, DailyRecord, ShopState } from '@institute/shared';
import type { Mastery, MasteryTopic } from './tutor';
import { PICKAXE_SKINS, type SkinKey, isSkinKey } from './skins';
import { GEM_STYLES, type GemStyleKey, isGemStyleKey } from './gemStyles';
import { chartBars, chipLabel, encouragement, focusTrapIndex, statTiles, trackingNote } from './dailyStats';
import { PROFILE } from './config';

type Handlers = {
  onDigit: (d: number) => void;
  onBackspace: () => void;
  onMine: () => void;
  onReplay: () => void;
  onExplain: () => void;
  onNotSure: () => void;
  onBuyShield: () => void;
  onToggleQuests: () => void;
  onToggleShop: () => void;
  onBuyPickaxe: (key: string) => void;
  onEquipPickaxe: (key: string) => void;
  onBuyPadTheme: (key: string) => void;
  onEquipPadTheme: (key: string) => void;
  onBuyGemStyle: (key: string) => void;
  onEquipGemStyle: (key: string) => void;
  onRepairPickaxe: (key: string) => void;
  onRedeemCrazyCoin: () => void;
  onHoardFull: () => void;
  onOpenParent: () => void;
  onOpenStats: () => void;
};

const GEM_COLORS = ['#ff6b8a', '#ffa94d', '#ffd43b', '#69db7c', '#3bc9db', '#4dabf7', '#748ffc', '#b197fc', '#f783ac', '#ff8787'];
/** Number-pad themes: per-digit gem tints. Same saturation/lightness band as the
 *  classic set — the .key-gem recipe (gradients, glows, 3D shadow) is untouched,
 *  so every theme keeps the crafted look. */
const PAD_THEMES: Record<string, { colors: string[]; accent: string; blurb: string }> = {
  pad_classic: { colors: GEM_COLORS, accent: '#b197fc', blurb: 'The original rainbow gems' },
  pad_ocean: { colors: ['#4dd4e8', '#3bc9db', '#4dabf7', '#5c9dff', '#69db7c', '#38d9a9', '#66d9e8', '#74c0fc', '#3b95db', '#22b8cf'], accent: '#3bc9db', blurb: 'Cool tides and sea glass' },
  pad_lava: { colors: ['#ff8787', '#ffa94d', '#ff6b3d', '#ffd43b', '#ff5c5c', '#ff922b', '#ffb84d', '#f76707', '#ff7043', '#e8590c'], accent: '#ff6b3d', blurb: 'Molten rock and embers' },
  pad_galaxy: { colors: ['#b197fc', '#748ffc', '#9775fa', '#5c7cfa', '#da77f2', '#845ef7', '#7950f2', '#a29bfe', '#c56cf0', '#6c5ce7'], accent: '#845ef7', blurb: 'Deep space shimmer' },
  pad_rainbow: { colors: ['#ff6b6b', '#ff922b', '#ffd43b', '#94d82d', '#38d9a9', '#3bc9db', '#4dabf7', '#7950f2', '#da77f2', '#f06595'], accent: '#f06595', blurb: 'Every gem a different color' },
};
const SHIELD_COST = 40;

/** True when the player's system asks for less animation. Read live (not cached)
 *  so flipping the OS setting takes effect without a reload. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
// Hoard meter: pips needed to fill the bar, and the bonus shown when it overflows
// (the server credits the same amount via /reward/hoard-bonus → HOARD_BONUS).
const HOARD_CAP = 15;
const HOARD_BONUS = 10;

export class Hud {
  private root: HTMLDivElement;
  private problemEl!: HTMLDivElement;
  private answerEl!: HTMLDivElement;
  private collectionEl!: HTMLSpanElement;
  private lifetimeGemsEl!: HTMLSpanElement;
  private collectionChip!: HTMLDivElement;
  private hoardEl!: HTMLDivElement;
  private hintEl!: HTMLDivElement;
  private flameEl!: HTMLDivElement;
  private flameCountEl!: HTMLSpanElement;
  private shieldEl!: HTMLDivElement;
  private shieldCountEl!: HTMLSpanElement;
  private buyShieldBtn!: HTMLButtonElement;
  private questsPanel!: HTMLDivElement;
  private questRows = new Map<string, { fill: HTMLDivElement; prog: HTMLSpanElement; row: HTMLDivElement }>();
  private shopPanel!: HTMLDivElement;
  private shopList!: HTMLDivElement;
  private shopGemsEl!: HTMLSpanElement;
  private celebrate!: HTMLDivElement;
  private bannerStack!: HTMLDivElement;
  private onBuyPickaxe!: (key: string) => void;
  private onEquipPickaxe!: (key: string) => void;
  private onBuyPadTheme!: (key: string) => void;
  private onEquipPadTheme!: (key: string) => void;
  private onBuyGemStyle!: (key: string) => void;
  private onEquipGemStyle!: (key: string) => void;
  private onRepairPickaxe!: (key: string) => void;
  private onRedeemCrazyCoin!: () => void;
  private onHoardFull!: () => void;
  private duraEl!: HTMLDivElement;
  private duraFill!: HTMLDivElement;
  private parentDash!: HTMLDivElement;
  private parentBody!: HTMLDivElement;
  private recordChip!: HTMLButtonElement;
  private recordTodayEl!: HTMLElement;
  private recordBestEl!: HTMLElement;
  private recordBestLabel!: HTMLElement;
  private statsDash!: HTMLDivElement;
  private statsBody!: HTMLDivElement;
  private statsSub!: HTMLElement;
  private statsClose!: HTMLButtonElement;
  private statsOpener: HTMLElement | null = null;  // focus goes back here on close
  private inerted: { el: HTMLElement; inert: boolean; ariaHidden: string | null }[] = [];
  private lastDaily: DailyRecord | null = null;
  private hoardColors: number[] = [];     // persisted pip colors so the bar survives reloads
  private hoardOverflowing = false;       // guard so a full bar fires the bonus once
  private readonly hoardKey = 'institute:hoard:' + PROFILE;

  // counter roll-up state
  private shownGems = 0;       // value currently rendered
  private targetGems = 0;      // value we are tweening toward
  private rollTimer = 0;

  constructor(h: Handlers) {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-top-left">
          <div class="hoard" id="hoard" aria-label="Your gem collection"></div>
          <button class="record-chip" id="record-chip" type="button" aria-haspopup="dialog">
            <span class="rc-star" aria-hidden="true">⭐</span>
            <span class="rc-nums">
              <span class="rc-today"><b id="record-today">0</b> right today</span>
              <span class="rc-best"><span id="record-best-label">best day</span> <b id="record-best">0</b></span>
            </span>
            <span class="rc-go" aria-hidden="true">📊</span>
          </button>
        </div>
        <div class="status">
          <div class="collection" id="collection-chip" title="Spendable gems and lifetime gems earned">
            <span class="collection-balance">💎 <span id="collection-count">0</span></span>
            <span class="lifetime-earned">🏆 <span id="lifetime-gems">0</span> earned</span>
          </div>
          <div class="flame" id="flame" aria-label="Streak"><span class="flame-emoji">🔥</span><span id="flame-count">0</span></div>
          <div class="shield" id="shield" aria-label="Streak shields">🛡️ <span id="shield-count">0</span></div>
          <button class="buy-shield" id="buy-shield" title="Buy a streak shield">＋🛡️ <b>${SHIELD_COST}</b>💎</button>
          <div class="pick-dura" id="pick-dura" title="Pickaxe durability" hidden>⛏️<div class="dura-bar"><div class="dura-fill" id="dura-fill"></div></div></div>
        </div>
      </div>
      <button class="quests-toggle" id="quests-toggle" title="Quests">📜</button>
      <div class="quests" id="quests">
        <div class="quests-head">📜 Daily Quests</div>
        <div class="quests-list" id="quests-list"></div>
        <div class="quests-bonus" id="quests-bonus"><span class="qb-icon">🪙</span><span class="qb-text">Finish all 5 → earn a Crazy Coin!</span></div>
        <div class="quests-head weekly">🏆 Weekly Quest</div>
        <div class="quests-list" id="weekly-quest-list"></div>
      </div>
      <button class="shop-toggle" id="shop-toggle" title="Shop">🛒</button>
      <div class="shop" id="shop">
        <div class="shop-head">🛒 Shop <span class="shop-gems">💎 <span id="shop-gems">0</span></span></div>
        <div class="shop-list" id="shop-list"></div>
      </div>
      <div class="problem-wrap">
        <div class="voice-stack">
          <button class="replay speak-again" title="Hear it again">🔊</button>
          <button class="replay explain" title="Teach me" aria-label="Explain this problem">🎓</button>
          <button class="replay not-sure" title="I'm not sure yet" aria-label="I'm not sure how to do this one">🤔</button>
        </div>
        <div class="problem" id="problem">…</div>
      </div>
      <div class="hint" id="hint"></div>
      <div class="demo" id="demo">
        <div class="demo-card">
          <div class="demo-banner">✨ NEW GEM! ✨</div>
          <div class="demo-label" id="demo-label"></div>
          <div class="demo-example"><span id="demo-pre"></span><span class="demo-answer" id="demo-answer"></span><span id="demo-post"></span></div>
          <div class="demo-script" id="demo-script"></div>
          <button class="demo-go" id="demo-go">Let's try one! ⛏️</button>
        </div>
      </div>
      <div class="help-choice" id="help-choice">
        <button class="help-btn go" id="help-go">Got it — my turn! 👍</button>
        <button class="help-btn again" id="help-again">Tell me again 🔁</button>
      </div>
      <div class="hud-bottom">
        <div class="answer" id="answer"></div>
        <div class="pad" id="pad"></div>
      </div>
      <div class="celebrate" id="celebrate" aria-hidden="true"><div class="banner-stack" id="banner-stack"></div></div>
      <button class="parent-toggle" id="parent-toggle" title="For grown-ups" aria-label="Parent dashboard">P</button>
      <div class="parent-dash" id="parent-dash" role="dialog" aria-label="Parent dashboard">
        <div class="pd-frame">
          <div class="pd-head">
            <div class="pd-titles">
              <div class="pd-title" id="pd-title"></div>
              <div class="pd-sub">For grown-ups — where he is on each math topic</div>
            </div>
            <button class="pd-close" id="pd-close" aria-label="Close">✕</button>
          </div>
          <div class="pd-body" id="pd-body"></div>
        </div>
      </div>
      <div class="stats-dash" id="stats-dash" role="dialog" aria-modal="true" aria-labelledby="sd-title">
        <div class="sd-frame">
          <div class="sd-head">
            <div class="sd-titles">
              <div class="sd-title" id="sd-title">⭐ Your Math Records</div>
              <div class="sd-sub" id="sd-sub">How many you get right each day</div>
            </div>
            <button class="sd-close" id="sd-close" type="button" aria-label="Close records">✕</button>
          </div>
          <div class="sd-body" id="sd-body"></div>
        </div>
      </div>
    `;
    document.body.appendChild(this.root);

    this.problemEl = this.root.querySelector('#problem')!;
    this.answerEl = this.root.querySelector('#answer')!;
    this.collectionEl = this.root.querySelector('#collection-count')!;
    this.lifetimeGemsEl = this.root.querySelector('#lifetime-gems')!;
    this.collectionChip = this.root.querySelector('#collection-chip')!;
    this.hoardEl = this.root.querySelector('#hoard')!;
    this.restoreHoard();
    this.hintEl = this.root.querySelector('#hint')!;
    this.flameEl = this.root.querySelector('#flame')!;
    this.flameCountEl = this.root.querySelector('#flame-count')!;
    this.shieldEl = this.root.querySelector('#shield')!;
    this.shieldCountEl = this.root.querySelector('#shield-count')!;
    this.buyShieldBtn = this.root.querySelector('#buy-shield')!;
    this.questsPanel = this.root.querySelector('#quests')!;
    this.shopPanel = this.root.querySelector('#shop')!;
    this.shopList = this.root.querySelector('#shop-list')!;
    this.shopGemsEl = this.root.querySelector('#shop-gems')!;
    this.celebrate = this.root.querySelector('#celebrate')!;
    this.bannerStack = this.root.querySelector('#banner-stack')!;
    this.onBuyPickaxe = h.onBuyPickaxe;
    this.onEquipPickaxe = h.onEquipPickaxe;
    this.onBuyPadTheme = h.onBuyPadTheme;
    this.onEquipPadTheme = h.onEquipPadTheme;
    this.onBuyGemStyle = h.onBuyGemStyle;
    this.onEquipGemStyle = h.onEquipGemStyle;
    this.onRepairPickaxe = h.onRepairPickaxe;
    this.onRedeemCrazyCoin = h.onRedeemCrazyCoin;
    this.onHoardFull = h.onHoardFull;
    this.duraEl = this.root.querySelector('#pick-dura')!;
    this.duraFill = this.root.querySelector('#dura-fill')!;

    const pad = this.root.querySelector('#pad')!;
    const layout = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'back', 0, 'mine'] as const;
    for (const k of layout) {
      const b = document.createElement('button');
      if (k === 'back') {
        b.className = 'key key-back';
        b.textContent = '⌫';
        b.onclick = () => h.onBackspace();
      } else if (k === 'mine') {
        b.className = 'key key-mine';
        b.textContent = 'MINE ⛏️';
        b.onclick = () => h.onMine();
      } else {
        b.className = 'key key-gem';
        b.textContent = String(k);
        b.style.setProperty('--gem', GEM_COLORS[k as number]);
        b.onclick = () => h.onDigit(k as number);
      }
      pad.appendChild(b);
    }
    this.root.querySelector('.replay.speak-again')!.addEventListener('click', () => h.onReplay());
    this.root.querySelector('.explain')!.addEventListener('click', () => h.onExplain());
    this.root.querySelector('.not-sure')!.addEventListener('click', () => h.onNotSure());
    this.buyShieldBtn.addEventListener('click', () => h.onBuyShield());
    this.root.querySelector('#quests-toggle')!.addEventListener('click', () => h.onToggleQuests());
    this.root.querySelector('#shop-toggle')!.addEventListener('click', () => h.onToggleShop());

    // Parent dashboard — a deliberately quiet corner button (nothing shiny for
    // little eyes); the overlay itself is read-only and closes on ✕ / Escape /
    // a click on the dimmed backdrop.
    this.parentDash = this.root.querySelector('#parent-dash')!;
    this.parentBody = this.root.querySelector('#pd-body')!;
    const kidName = PROFILE.charAt(0).toUpperCase() + PROFILE.slice(1);
    (this.root.querySelector('#pd-title') as HTMLElement).textContent = `${kidName}’s Learning Map`;
    this.root.querySelector('#parent-toggle')!.addEventListener('click', () => h.onOpenParent());
    this.root.querySelector('#pd-close')!.addEventListener('click', () => this.closeParentDash());
    this.parentDash.addEventListener('click', (e) => {
      if (e.target === this.parentDash) this.closeParentDash();
    });
    // The record chip: his own scoreboard, and the door to the stats panel. Same
    // close contract as the parent overlay — ✕, Escape, or the dimmed backdrop.
    this.recordChip = this.root.querySelector('#record-chip')!;
    this.recordTodayEl = this.root.querySelector('#record-today')!;
    this.recordBestEl = this.root.querySelector('#record-best')!;
    this.recordBestLabel = this.root.querySelector('#record-best-label')!;
    this.statsDash = this.root.querySelector('#stats-dash')!;
    this.statsBody = this.root.querySelector('#sd-body')!;
    this.statsSub = this.root.querySelector('#sd-sub')!;
    this.statsClose = this.root.querySelector('#sd-close')!;
    this.recordChip.setAttribute('aria-label', chipLabel(null));
    this.recordChip.addEventListener('click', () => h.onOpenStats());
    this.statsClose.addEventListener('click', () => this.closeStats());
    this.statsDash.addEventListener('click', (e) => {
      if (e.target === this.statsDash) this.closeStats();
    });
    window.addEventListener('keydown', (e) => {
      const statsOpen = this.statsDash.classList.contains('open');
      if (e.key === 'Escape') {
        if (statsOpen) this.closeStats();
        else if (this.parentDash.classList.contains('open')) this.closeParentDash();
        return;
      }
      // Keep Tab inside the dialog: behind it is a game he can't see or use, and
      // tabbing into it silently is how a modal loses a keyboard user. `inert`
      // already does this where it's supported; this covers the rest, and the
      // case where a click on the panel dropped focus back to <body>.
      if (e.key !== 'Tab' || !statsOpen) return;
      const focusables = this.statsFocusables();
      const next = focusTrapIndex(
        focusables.length, focusables.indexOf(document.activeElement as HTMLElement), e.shiftKey,
      );
      if (next < 0) return;
      e.preventDefault();
      focusables[next].focus();
    });

    this.flameEl.style.display = 'none'; // hidden until there's a streak
  }

  // ---- daily correct-answer record ------------------------------------------
  /** The chip itself: today's count vs the all-time daily record. */
  private renderRecordChip(today: number, record: number): void {
    const holding = today > 0 && today >= record;
    this.recordTodayEl.textContent = String(today);
    this.recordBestEl.textContent = String(record);
    // Never colour-only: on a record day the chip SAYS so.
    this.recordBestLabel.textContent = holding ? 'best day EVER!' : 'best day';
    this.recordChip.classList.toggle('holding', holding);
    this.recordChip.setAttribute('aria-label', chipLabel({ today, record }));
  }

  /** One answer's delta (no history rides along) — moves the chip only. */
  setDailyProgress(p: DailyProgress): void {
    this.renderRecordChip(p.today, p.record);
    // Keep the cached panel data roughly live until the next /state sync.
    if (this.lastDaily && this.lastDaily.day === p.day) {
      this.lastDaily = {
        ...this.lastDaily, today: p.today, record: p.record,
        isRecord: p.today > 0 && p.today >= p.record,
      };
    }
  }

  /** The full picture from /state. Null (server unreachable) leaves the last
   *  known numbers on screen rather than blanking his score. */
  setDailyRecord(daily: DailyRecord | null): void {
    if (!daily) return;
    this.lastDaily = daily;
    this.renderRecordChip(daily.today, daily.record);
    // Keep an open panel live while he keeps answering.
    if (this.statsDash.classList.contains('open')) this.setStats(daily);
  }

  /** Everything inside the dialog a keyboard can reach, in document order. */
  private statsFocusables(): HTMLElement[] {
    const selector = 'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return [...this.statsDash.querySelectorAll<HTMLElement>(selector)];
  }

  /** Hide the rest of the page from assistive tech and the tab order while the
   *  dialog owns the screen. `inert` is set as an attribute so it works whatever
   *  the TS DOM lib knows about; aria-hidden covers browsers without inert. */
  private setBackgroundInert(on: boolean): void {
    if (on) {
      const targets = [
        ...Array.from(document.body.children).filter((el) => el !== this.root),
        ...Array.from(this.root.children).filter((el) => el !== this.statsDash),
      ] as HTMLElement[];
      for (const el of targets) {
        this.inerted.push({
          el,
          inert: el.hasAttribute('inert'),
          ariaHidden: el.getAttribute('aria-hidden'),
        });
        el.toggleAttribute('inert', true);
        el.setAttribute('aria-hidden', 'true');
      }
    } else {
      for (const { el, inert, ariaHidden } of this.inerted) {
        el.toggleAttribute('inert', inert);
        if (ariaHidden == null) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', ariaHidden);
      }
      this.inerted = [];
    }
  }

  /** Open the stats panel in its loading state (Game then fetches fresh numbers).
   *  Renders the last known figures immediately so it is never blank. */
  openStats(): void {
    if (this.statsDash.classList.contains('open')) return;
    this.questsPanel.classList.remove('open');
    this.shopPanel.classList.remove('open');
    this.parentDash.classList.remove('open');
    const opener = document.activeElement;
    this.statsOpener = opener instanceof HTMLElement && opener !== document.body ? opener : this.recordChip;
    this.statsDash.classList.add('open');
    if (this.lastDaily) this.setStats(this.lastDaily);
    else this.statsBody.innerHTML = '<div class="sd-note">Adding up your best days…</div>';
    this.setBackgroundInert(true);
    // Focus the way out first: it is the one control here, and it tells a screen
    // reader immediately that a dialog opened and how to leave it.
    this.statsClose.focus();
  }
  closeStats(): void {
    if (!this.statsDash.classList.contains('open')) return;
    this.statsDash.classList.remove('open');
    this.setBackgroundInert(false); // must come first, or the target can't take focus
    const back = this.statsOpener && this.statsOpener.isConnected ? this.statsOpener : this.recordChip;
    this.statsOpener = null;
    back.focus();
  }

  /** Render the record panel: the encouraging line, the day-by-day graph, and the
   *  summary tiles. Null = no fresh numbers: keep whatever is already on screen,
   *  and only show a notice when there is nothing to show. */
  setStats(daily: DailyRecord | null): void {
    if (!daily && this.lastDaily) return;
    this.statsBody.innerHTML = '';
    if (!daily) {
      const note = document.createElement('div');
      note.className = 'sd-note';
      note.textContent = 'Can’t reach the tutor right now, try again in a moment.';
      this.statsBody.appendChild(note);
      return;
    }
    this.lastDaily = daily;
    this.statsSub.textContent = encouragement(daily);

    const bars = chartBars(daily.history, daily.day, daily.recordDay);
    const chartSection = document.createElement('section');
    chartSection.className = 'sd-section';
    const chartHead = document.createElement('div');
    chartHead.className = 'sd-section-head';
    chartHead.textContent = `Problems right each day (last ${bars.length} days)`;
    const chart = document.createElement('div');
    chart.className = 'sd-chart';
    chart.setAttribute('role', 'list');
    chart.setAttribute('aria-label', `Problems right on each of the last ${bars.length} days`);
    for (const bar of bars) {
      const col = document.createElement('div');
      col.className = 'sd-col' + (bar.isToday ? ' today' : '') + (bar.isRecord ? ' best' : '');
      col.setAttribute('role', 'listitem');
      col.setAttribute('aria-label', bar.label);
      col.title = bar.label;
      const count = document.createElement('span');
      count.className = 'sd-count';
      count.textContent = bar.count > 0 ? String(bar.count) : '·';
      const track = document.createElement('div');
      track.className = 'sd-track';
      const fill = document.createElement('div');
      fill.className = 'sd-fill';
      fill.style.height = bar.heightPct + '%';
      track.appendChild(fill);
      const tick = document.createElement('span');
      tick.className = 'sd-tick';
      tick.textContent = bar.tick;
      col.append(count, track, tick);
      if (bar.isToday || bar.isRecord) {
        const tag = document.createElement('span');
        tag.className = 'sd-tag';
        tag.textContent = bar.isRecord ? '★ best' : 'today';
        col.appendChild(tag);
      }
      chart.appendChild(col);
    }
    chartSection.append(chartHead, chart);
    this.statsBody.appendChild(chartSection);

    const tilesSection = document.createElement('section');
    tilesSection.className = 'sd-section';
    const tilesHead = document.createElement('div');
    tilesHead.className = 'sd-section-head';
    tilesHead.textContent = 'Your numbers';
    const grid = document.createElement('div');
    grid.className = 'sd-tiles';
    for (const t of statTiles(daily)) {
      const tile = document.createElement('div');
      tile.className = 'sd-tile sd-tile-' + t.key;
      const value = document.createElement('div');
      value.className = 'sd-tile-value';
      value.textContent = t.value;
      const label = document.createElement('div');
      label.className = 'sd-tile-label';
      label.textContent = t.label;
      const hint = document.createElement('div');
      hint.className = 'sd-tile-hint';
      hint.textContent = t.hint;
      tile.append(value, label, hint);
      grid.appendChild(tile);
    }
    tilesSection.append(tilesHead, grid);
    this.statsBody.appendChild(tilesSection);

    // Say plainly what the numbers can and cannot know.
    const note = trackingNote(daily.tracking);
    if (note) {
      const fine = document.createElement('p');
      fine.className = 'sd-fineprint';
      fine.textContent = note;
      this.statsBody.appendChild(fine);
    }
  }

  private explainTimer: ReturnType<typeof setTimeout> | null = null;
  setProblem(text: string): void {
    this.problemEl.textContent = text;
    // The 🎓 helper only appears after he's had a fair try (~10s) at the problem.
    const helpers = [...this.root.querySelectorAll('.explain, .not-sure')];
    if (this.explainTimer) clearTimeout(this.explainTimer);
    helpers.forEach((el) => el.classList.remove('avail'));
    this.explainTimer = setTimeout(() => helpers.forEach((el) => el.classList.add('avail')), 10_000);
    this.hideHelpChoice();
  }
  /** Show a strategy hint / answer reveal banner. */
  private hintScrollRaf = 0;
  showHint(text: string): void {
    cancelAnimationFrame(this.hintScrollRaf);
    this.hintEl.textContent = text;
    this.hintEl.classList.toggle('long', text.length > 140);
    this.hintEl.classList.add('show');
    this.hintEl.scrollTop = 0;
    // Long explanations don't fit the capped banner: drift the overflow into view
    // at roughly the tutor's speaking pace (no scrollbar, nothing to operate).
    requestAnimationFrame(() => {
      const overflow = this.hintEl.scrollHeight - this.hintEl.clientHeight;
      if (overflow <= 0) return;
      const durationMs = Math.max(4000, text.length * 62); // ≈ TTS pace at 0.78 speed
      const startAt = performance.now() + 2200;            // let him hear the opening first
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - startAt) / durationMs));
        this.hintEl.scrollTop = overflow * t;
        if (t < 1 && this.hintEl.classList.contains('show')) {
          this.hintScrollRaf = requestAnimationFrame(step);
        }
      };
      this.hintScrollRaf = requestAnimationFrame(step);
    });
  }
  /** A brand-new kind of problem: show him one worked example before he's ever
   *  asked to answer one. Discovery framing, his button to continue. */
  showDemo(d: { kidLabel: string; prompt: string; answer: number; script: string }, onGo: () => void): void {
    (this.root.querySelector('#demo-label') as HTMLElement).textContent = d.kidLabel;
    // Show the worked example with its blank FILLED IN — "1 + 4 = 5" teaches far
    // better than "1 + ? = 5 = 4". Prompts come in three shapes: a blank to fill,
    // a worded question, or plain arithmetic.
    const blank = d.prompt.match(/^(.*?)(?:\?)(.*)$/s);
    const isBlank = !!blank && /[=,]/.test(d.prompt);
    const pre = isBlank ? blank![1] : d.prompt + (/\?$/.test(d.prompt) ? '  →  ' : '  =  ');
    const post = isBlank ? blank![2] : '';
    (this.root.querySelector('#demo-pre') as HTMLElement).textContent = pre;
    (this.root.querySelector('#demo-answer') as HTMLElement).textContent = String(d.answer);
    (this.root.querySelector('#demo-post') as HTMLElement).textContent = post;
    (this.root.querySelector('#demo-script') as HTMLElement).textContent = d.script;
    const go = this.root.querySelector('#demo-go') as HTMLButtonElement;
    go.onclick = () => { this.hideDemo(); onGo(); };
    (this.root.querySelector('#demo') as HTMLElement).classList.add('show');
  }
  hideDemo(): void {
    (this.root.querySelector('#demo') as HTMLElement)?.classList.remove('show');
  }

  /** After a walkthrough: let him choose to move on or hear it again. Overlaid,
   *  never in flow — an in-flow row squeezes the number pad on short screens. */
  showHelpChoice(onGo: () => void, onAgain: () => void): void {
    const row = this.root.querySelector('#help-choice') as HTMLElement;
    const go = this.root.querySelector('#help-go') as HTMLButtonElement;
    const again = this.root.querySelector('#help-again') as HTMLButtonElement;
    go.onclick = () => { this.hideHelpChoice(); onGo(); };
    again.onclick = () => onAgain();
    row.classList.add('show');
  }
  hideHelpChoice(): void {
    (this.root.querySelector('#help-choice') as HTMLElement)?.classList.remove('show');
  }
  clearHint(): void {
    cancelAnimationFrame(this.hintScrollRaf);
    this.hintEl.textContent = '';
    this.hintEl.classList.remove('show', 'long');
  }
  setAnswer(text: string): void {
    this.answerEl.textContent = text;
    this.answerEl.classList.remove('wrong');
  }
  flashWrong(): void {
    this.answerEl.classList.add('wrong');
  }

  // ---- gem counter (authoritative total, animated) -------------------------
  /** Snap the counter to a value with no animation (startup seed). */
  setCollection(n: number): void {
    this.shownGems = n;
    this.targetGems = n;
    this.collectionEl.textContent = String(n);
  }
  setLifetimeGems(n: number): void {
    this.lifetimeGemsEl.textContent = String(n);
  }
  /** Roll the counter up (or down) toward `n`, ticking through each integer with a
   *  pop so the change reads as a satisfying climb, not a snap. Returns when armed. */
  rollCollectionTo(n: number): void {
    this.targetGems = n;
    if (this.rollTimer) return; // a roll is already in flight; it'll chase the new target
    const step = () => {
      if (this.shownGems === this.targetGems) {
        this.rollTimer = 0;
        return;
      }
      const dir = this.targetGems > this.shownGems ? 1 : -1;
      const remaining = Math.abs(this.targetGems - this.shownGems);
      // Climb faster when there's a lot to cover; never slower than ~70ms/step so the
      // headless playtest (100ms poll) reliably samples each intermediate value.
      const stepSize = dir > 0 ? Math.max(1, Math.floor(remaining / 12)) : remaining;
      this.shownGems += dir * stepSize;
      this.collectionEl.textContent = String(this.shownGems);
      this.popChip();
      const delay = remaining > 24 ? 28 : 80;
      this.rollTimer = window.setTimeout(step, delay);
    };
    step();
  }
  private popChip(): void {
    this.collectionChip.classList.remove('pop');
    void this.collectionChip.offsetWidth; // restart the animation
    this.collectionChip.classList.add('pop');
  }

  /** Add a mined gem (in its real color) to the visibly-filling hoard meter.
   *  When the meter reaches HOARD_CAP it overflows: a satisfying burst, a bonus
   *  (credited server-side via onHoardFull), then it empties to fill again. */
  addGem(colorHex: number): void {
    if (this.hoardOverflowing) return; // ignore mid-burst; reset will resume
    this.appendPip(colorHex, true);
    this.hoardColors.push(colorHex & 0xffffff);
    this.persistHoard();
    if (this.hoardColors.length >= HOARD_CAP) this.overflowHoard();
  }

  private appendPip(colorHex: number, animate: boolean): void {
    const pip = document.createElement('span');
    pip.className = 'gem-pip';
    pip.style.setProperty('--gem', '#' + (colorHex & 0xffffff).toString(16).padStart(6, '0'));
    this.hoardEl.appendChild(pip);
    if (animate) requestAnimationFrame(() => pip.classList.add('in'));
    else pip.classList.add('in');
  }

  private persistHoard(): void {
    try { localStorage.setItem(this.hoardKey, JSON.stringify(this.hoardColors)); } catch { /* ignore */ }
  }

  private restoreHoard(): void {
    let saved: number[] = [];
    try { saved = JSON.parse(localStorage.getItem(this.hoardKey) ?? '[]'); } catch { saved = []; }
    if (!Array.isArray(saved)) saved = [];
    this.hoardColors = saved.slice(0, HOARD_CAP - 1); // never restore into an overflow
    for (const c of this.hoardColors) this.appendPip(c, false);
  }

  /** The meter is full: it rattles, then BURSTS open and a firehose of 3D gems
   *  erupts from the bar (the spew + bonus credit happen in Game.onHoardFull). */
  private overflowHoard(): void {
    this.hoardOverflowing = true;
    this.hoardEl.classList.add('shake'); // rattle first
    setTimeout(() => {
      try {
        this.hoardEl.classList.remove('shake');
        this.hoardEl.classList.add('burst'); // pop the bar open
        this.screenFlash('#ffe9a8');
        this.banner('GEM BONUS!', 'quest', `+${HOARD_BONUS}💎`);
        this.scatterPips();   // DOM pips fling out of the bar…
      } catch (e) { console.warn('[hoard] burst VFX fail:', e); }
      this.onHoardFull();     // …while Game erupts the 3D gem firehose + credits the bonus
      setTimeout(() => {
        this.hoardEl.classList.remove('burst');
        this.hoardEl.innerHTML = '';
        this.hoardColors = [];
        this.persistHoard();
        this.hoardOverflowing = false;
      }, 1100);
    }, 420);
  }

  /** Fling each gem pip out of the bar (random arc) as it bursts open. */
  private scatterPips(): void {
    this.hoardEl.querySelectorAll<HTMLElement>('.gem-pip').forEach((p) => {
      const dx = (Math.random() * 2 - 1) * 140, dy = -50 - Math.random() * 140, rot = (Math.random() * 2 - 1) * 220;
      p.style.transition = 'transform .6s cubic-bezier(.2,.9,.3,1), opacity .6s ease';
      p.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(.35)`;
      p.style.opacity = '0';
    });
  }

  // ---- streak flame --------------------------------------------------------
  /** Update the flame to the given streak. Grows + intensifies with the streak;
   *  hides at 0. Pass `bumped` to play the grow-pop (a fresh correct answer). */
  setStreak(streak: number, bumped: boolean): void {
    if (streak <= 0) {
      this.flameEl.style.display = 'none';
      this.flameEl.classList.remove('big', 'huge', 'mega');
      this.flameCountEl.textContent = '0';
      return;
    }
    this.flameEl.style.display = '';
    this.flameCountEl.textContent = String(streak);
    this.flameEl.classList.toggle('big', streak >= 3 && streak < 5);
    this.flameEl.classList.toggle('huge', streak >= 5 && streak < 10);
    this.flameEl.classList.toggle('mega', streak >= 10);
    if (bumped) {
      this.flameEl.classList.remove('bump');
      void this.flameEl.offsetWidth;
      this.flameEl.classList.add('bump');
    }
  }
  /** A miss with a shield: the flame survives — play a protective shimmer instead. */
  flashShieldSave(): void {
    this.flameEl.classList.remove('saved');
    void this.flameEl.offsetWidth;
    this.flameEl.classList.add('saved');
  }

  // ---- shield --------------------------------------------------------------
  setShields(n: number): void {
    this.shieldCountEl.textContent = String(n);
    this.shieldEl.classList.remove('pop');
    void this.shieldEl.offsetWidth;
    this.shieldEl.classList.add('pop');
  }
  /** Feedback for a shield purchase attempt. */
  shieldFeedback(ok: boolean, msg?: string): void {
    this.buyShieldBtn.classList.remove('ok', 'bad');
    void this.buyShieldBtn.offsetWidth;
    this.buyShieldBtn.classList.add(ok ? 'ok' : 'bad');
    if (!ok && msg) this.toast(msg);
  }
  /** Keep the shop in sync with the live gem total: the header balance, the
   *  shield-button hint, AND each Buy button's affordability — without a full
   *  re-render (so it updates even while the panel is open). */
  setGemsForShop(gems: number): void {
    this.buyShieldBtn.classList.toggle('afford', gems >= SHIELD_COST);
    this.shopGemsEl.textContent = String(gems);
    this.shopList.querySelectorAll<HTMLButtonElement>('.shop-btn.is-buy').forEach((b) => {
      const afford = gems >= Number(b.dataset.price ?? '0');
      b.classList.toggle('afford', afford);
      b.classList.toggle('poor', !afford);
      b.disabled = !afford;
    });
    this.shopList.querySelectorAll<HTMLButtonElement>('.shop-btn.is-repair').forEach((b) => {
      const afford = gems >= Number(b.dataset.cost ?? '0');
      b.classList.toggle('poor', !afford);
      b.disabled = !afford;
    });
  }

  // ---- quests --------------------------------------------------------------
  setQuests(questsIn: Quest[], weeklyQuest: Quest): void {
    const list = this.root.querySelector('#quests-list')!;
    const weeklyList = this.root.querySelector('#weekly-quest-list')!;
    // Fixed display order (the server's row order isn't deterministic) so rows
    // never reshuffle / rebuild under the panel.
    const order = ['mine_gems', 'solve_10', 'streak_5', 'speed_8', 'topic_explorer', 'complete_dungeon'];
    const dailyQuests = [...questsIn].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    const quests = [...dailyQuests, weeklyQuest];
    // Rebuild only if the set of keys changed; otherwise update in place.
    const keys = quests.map((q) => q.key).join(',');
    if (this.questsPanel.dataset.keys !== keys) {
      list.innerHTML = '';
      weeklyList.innerHTML = '';
      this.questRows.clear();
      for (const q of quests) {
        const row = document.createElement('div');
        row.className = 'quest';
        row.innerHTML = `
          <div class="q-top"><span class="q-label"></span><span class="q-reward">+${q.reward}💎</span></div>
          <div class="q-bar"><div class="q-fill"></div></div>
          <div class="q-prog"></div>`;
        (row.querySelector('.q-label') as HTMLElement).textContent = q.label;
        (q.key === weeklyQuest.key ? weeklyList : list).appendChild(row);
        this.questRows.set(q.key, {
          fill: row.querySelector('.q-fill')!,
          prog: row.querySelector('.q-prog')!,
          row,
        });
      }
      this.questsPanel.dataset.keys = keys;
    }
    for (const q of quests) {
      const r = this.questRows.get(q.key);
      if (!r) continue;
      const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
      r.fill.style.width = pct + '%';
      r.prog.textContent = q.done ? '✓ Complete!' : `${q.progress} / ${q.target}`;
      r.row.classList.toggle('done', q.done);
    }
    // The all-dailies Crazy Coin bonus: show what's at stake.
    const bonus = this.root.querySelector('#quests-bonus');
    if (bonus) {
      const dailyDone = dailyQuests.filter((q) => q.done).length;
      const all = dailyQuests.length > 0 && dailyDone === dailyQuests.length;
      bonus.classList.toggle('earned', all);
      (bonus.querySelector('.qb-text') as HTMLElement).textContent = all
        ? 'All quests done, Crazy Coin earned!'
        : `Finish all ${dailyQuests.length} → earn a Crazy Coin! (${dailyDone}/${dailyQuests.length})`;
    }
  }
  toggleQuests(): void {
    this.shopPanel.classList.remove('open'); // only one corner panel open at a time
    this.questsPanel.classList.toggle('open');
  }

  /** Update the pickaxe-durability chip. `current`/`max` null (wooden) hides it.
   *  Bar fills green → amber → red as it wears; pulses when about to break. */
  setDurability(current: number | null | undefined, max: number | null | undefined): void {
    if (current == null || max == null || max <= 0) { this.duraEl.hidden = true; return; }
    this.duraEl.hidden = false;
    const frac = Math.max(0, Math.min(1, current / max));
    this.duraFill.style.width = (frac * 100) + '%';
    const state = frac > 0.5 ? 'ok' : frac > 0.2 ? 'warn' : 'low';
    this.duraEl.className = 'pick-dura ' + state;
  }

  /** Dramatic (not scary) notice that the equipped pickaxe just broke. */
  breakBanner(name: string): void {
    this.screenFlash('#ff9d6b');
    this.banner('💥 SNAP!', 'broke', `${name} broke, repair it in the 🛒 shop`);
    this.confettiBurst(40, ['#c9c2b6', '#8a8276', '#e8e2d6', '#b0a894']);
  }

  // ---- pickaxe shop --------------------------------------------------------
  /** Repaint the number pad's gem tints for the equipped theme. */
  setPadTheme(themeKey: string): void {
    const theme = PAD_THEMES[themeKey] ?? PAD_THEMES.pad_classic;
    this.root.querySelectorAll<HTMLButtonElement>('.pad .key-gem').forEach((b) => {
      const digit = Number(b.textContent);
      if (Number.isInteger(digit)) b.style.setProperty('--gem', theme.colors[digit]);
    });
  }

  toggleShop(): boolean {
    this.questsPanel.classList.remove('open');
    return this.shopPanel.classList.toggle('open');
  }
  closeShop(): void {
    this.shopPanel.classList.remove('open');
  }

  /** Render the shop catalog in ladder order, each row state-aware: Buy / Equip /
   *  Equipped, plus a durability bar + Repair for owned tiers (broken ⇒ Repair only). */
  setShop(state: ShopState): void {
    this.shopGemsEl.textContent = String(state.gems);
    this.shopList.innerHTML = '';
    for (const item of state.items) {
      const key = item.key;
      const spec = isSkinKey(key) ? PICKAXE_SKINS[key as SkinKey] : null;
      const tint = spec?.tint ?? '#888';
      const blurb = spec?.blurb ?? '';
      const wears = item.maxDurability != null; // non-wooden tiers wear
      const cur = item.durability ?? item.maxDurability ?? 0;
      const broken = wears && item.owned && cur <= 0;
      const worn = wears && item.owned && cur < (item.maxDurability ?? 0);
      const row = document.createElement('div');
      row.className = 'shop-row' + (item.equipped ? ' equipped' : '') + (broken ? ' broken' : '');
      const afford = state.gems >= item.price;
      const canRepair = state.gems >= item.repairCost;

      const btns: string[] = [];
      if (!item.owned) {
        btns.push(`<button class="shop-btn is-buy${afford ? ' afford' : ' poor'}" data-buy="${key}" data-price="${item.price}"${afford ? '' : ' disabled'}>Buy ${item.price}💎</button>`);
      } else {
        if (item.equipped) btns.push(`<button class="shop-btn is-equipped" disabled>Equipped</button>`);
        else if (!broken) btns.push(`<button class="shop-btn is-equip" data-equip="${key}">Equip</button>`);
        if (worn) btns.push(`<button class="shop-btn is-repair${canRepair ? '' : ' poor'}${broken ? ' urgent' : ''}" data-repair="${key}" data-cost="${item.repairCost}"${canRepair ? '' : ' disabled'}>🔧 ${item.repairCost}💎</button>`);
      }

      // durability bar (owned, worn tiers)
      const frac = wears && item.maxDurability ? Math.max(0, Math.min(1, cur / item.maxDurability)) : 1;
      const dstate = frac > 0.5 ? 'ok' : frac > 0.2 ? 'warn' : 'low';
      const duraHtml = wears && item.owned
        ? `<div class="row-dura ${dstate}"><div class="row-dura-fill" style="width:${frac * 100}%"></div></div>`
        : '';

      row.innerHTML = `
        <div class="swatch" style="--tint:${tint}"></div>
        <div class="shop-meta">
          <div class="shop-name">${item.name}</div>
          <div class="shop-blurb">${broken ? 'Broken, repair to use' : blurb}</div>
          ${duraHtml}
        </div>
        <div class="shop-btns">${btns.join('')}</div>`;
      this.shopList.appendChild(row);
    }
    // Delegate clicks (rebuilt each render, so wire fresh).
    this.shopList.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) =>
      b.addEventListener('click', () => this.onBuyPickaxe(b.dataset.buy!)));
    this.shopList.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((b) =>
      b.addEventListener('click', () => this.onEquipPickaxe(b.dataset.equip!)));
    this.shopList.querySelectorAll<HTMLButtonElement>('[data-repair]').forEach((b) =>
      b.addEventListener('click', () => this.onRepairPickaxe(b.dataset.repair!)));

    // 💎 Mine Gems shelf — these swap the actual 3D target in the cavern.
    const gemStyles = state.gemStyles ?? [];
    if (gemStyles.length) {
      const head = document.createElement('div');
      head.className = 'shop-section-head gem-style-head';
      head.textContent = '💎 Mine Gems';
      this.shopList.appendChild(head);
      const classicRow = {
        key: 'gem_classic', name: 'Classic Geode', price: 0, owned: true,
        equipped: (state.equippedGemStyle ?? 'gem_classic') === 'gem_classic',
      };
      for (const style of [classicRow, ...gemStyles]) {
        const key = isGemStyleKey(style.key) ? style.key as GemStyleKey : 'gem_classic';
        const spec = GEM_STYLES[key];
        const afford = state.gems >= style.price;
        const row = document.createElement('div');
        row.className = 'shop-row gem-style-row' + (style.equipped ? ' equipped' : '');
        const btn = !style.owned
          ? `<button class="shop-btn is-buy${afford ? ' afford' : ' poor'}" data-buy-gem="${style.key}" data-price="${style.price}"${afford ? '' : ' disabled'}>Buy ${style.price}💎</button>`
          : style.equipped
            ? `<button class="shop-btn is-equipped" disabled>Equipped</button>`
            : `<button class="shop-btn is-equip" data-equip-gem="${style.key}">Equip</button>`;
        row.innerHTML = `
          <div class="gem-model-swatch shape-${spec.shape}" style="--tint:${spec.tint}" aria-hidden="true">
            ${spec.previewUrl
              ? `<img class="gem-model-shot" src="${spec.previewUrl}" alt="" loading="lazy">`
              : `<span class="gem-model-core"></span><span class="gem-model-accent"></span>`}
          </div>
          <div class="shop-meta">
            <div class="shop-name">${style.name}</div>
            <div class="shop-blurb">${spec.blurb}</div>
          </div>
          <div class="shop-btns">${btn}</div>`;
        this.shopList.appendChild(row);
      }
      this.shopList.querySelectorAll<HTMLButtonElement>('[data-buy-gem]').forEach((button) =>
        button.addEventListener('click', () => this.onBuyGemStyle(button.dataset.buyGem!)));
      this.shopList.querySelectorAll<HTMLButtonElement>('[data-equip-gem]').forEach((button) =>
        button.addEventListener('click', () => this.onEquipGemStyle(button.dataset.equipGem!)));
    }

    // 🎨 Pad Styles shelf — cosmetic themes for the number pad.
    const themes = state.padThemes ?? [];
    if (themes.length) {
      const head = document.createElement('div');
      head.className = 'shop-section-head';
      head.textContent = '🎨 Pad Styles';
      this.shopList.appendChild(head);
      const classicRow = { key: 'pad_classic', name: 'Classic Pad', price: 0, owned: true,
        equipped: (state.equippedPadTheme ?? 'pad_classic') === 'pad_classic' };
      for (const t of [classicRow, ...themes]) {
        const spec = PAD_THEMES[t.key] ?? PAD_THEMES.pad_classic;
        const afford = state.gems >= t.price;
        const row = document.createElement('div');
        row.className = 'shop-row' + (t.equipped ? ' equipped' : '');
        const btn = !t.owned
          ? `<button class="shop-btn is-buy${afford ? ' afford' : ' poor'}" data-buy-pad="${t.key}" data-price="${t.price}"${afford ? '' : ' disabled'}>Buy ${t.price}💎</button>`
          : t.equipped
            ? `<button class="shop-btn is-equipped" disabled>Equipped</button>`
            : `<button class="shop-btn is-equip" data-equip-pad="${t.key}">Equip</button>`;
        row.innerHTML = `
          <div class="swatch pad-swatch" style="--tint:${spec.accent}">
            ${spec.colors.slice(0, 4).map((c) => `<span class="mini-gem" style="--g:${c}"></span>`).join('')}
          </div>
          <div class="shop-meta">
            <div class="shop-name">${t.name}</div>
            <div class="shop-blurb">${spec.blurb}</div>
          </div>
          <div class="shop-btns">${btn}</div>`;
        this.shopList.appendChild(row);
      }
      this.shopList.querySelectorAll<HTMLButtonElement>('[data-buy-pad]').forEach((b) =>
        b.addEventListener('click', () => this.onBuyPadTheme(b.dataset.buyPad!)));
      this.shopList.querySelectorAll<HTMLButtonElement>('[data-equip-pad]').forEach((b) =>
        b.addEventListener('click', () => this.onEquipPadTheme(b.dataset.equipPad!)));
    }
  }

  /** Gentle not-enough-gems toast for a failed pickaxe buy. */
  shopFeedback(msg: string): void {
    this.toast(msg);
  }

  /** The big all-dailies reward: one real-world Crazy Coin. */
  celebrateDailyCrazyCoin(): void {
    this.screenFlash('#ffd23b');
    this.banner('🪙 CRAZY COIN! 🪙', 'unlock', '+1 earned, go tell a grown-up!', '#ffd23b');
    this.confettiBurst(90, ['#ffd23b', '#ffb01f', '#ffffff', '#ff8fb1', '#7af0ff']);
  }

  /** Over-the-top NEW PICKAXE UNLOCKED celebration, accented in the tier color. */
  celebrateUnlock(name: string, tint: string): void {
    this.screenFlash(tint);
    this.banner('NEW PICKAXE!', 'unlock', name, tint);
    this.confettiBurst(90, [tint, '#ffffff', '#ffd23b', '#ff7eb6', '#7af0ff', '#b197fc']);
  }
  /** Quiet confirm when equipping an already-owned skin. */
  equipConfirm(name: string, tint: string): void {
    this.banner('EQUIPPED', 'equipped-msg', name, tint, 2000);
  }

  // ---- parent mastery dashboard ---------------------------------------------
  /** Open the read-only parent overlay in its loading state (Game then fetches
   *  the mastery graph and calls setMastery with the result). */
  openParentDash(): void {
    this.questsPanel.classList.remove('open');
    this.shopPanel.classList.remove('open');
    this.closeStats(); // never just drop the class: that would strand the inert background
    this.parentBody.innerHTML = '<div class="pd-note">Loading his progress…</div>';
    this.parentDash.classList.add('open');
  }
  closeParentDash(): void {
    this.parentDash.classList.remove('open');
  }

  /** Render the topic-mastery graph: topics grouped by domain, each domain shown
   *  as an ordered chain (prereqs first) down a connector rail. Null (fetch
   *  failed) shows a gentle notice — the game itself is never affected. */
  setMastery(m: Mastery | null): void {
    this.parentBody.innerHTML = '';
    if (!m) {
      const note = document.createElement('div');
      note.className = 'pd-note';
      note.textContent = 'Can’t reach the tutor right now, check that the tutor server is running, then try again.';
      this.parentBody.appendChild(note);
      return;
    }
    this.parentBody.appendChild(this.buildCoinPanel(m.crazyCoins ?? 0));
    // Group by domain, preserving the server's domain order.
    const domains = new Map<string, MasteryTopic[]>();
    for (const t of m.topics) {
      if (!domains.has(t.domain)) domains.set(t.domain, []);
      domains.get(t.domain)!.push(t);
    }
    for (const [domain, topics] of domains) {
      const ordered = orderByPrereqs(topics);
      const mastered = ordered.filter((t) => t.state === 'mastered').length;
      const section = document.createElement('section');
      section.className = 'pd-domain';
      const head = document.createElement('div');
      head.className = 'pd-domain-head';
      const hName = document.createElement('span');
      hName.className = 'pd-domain-name';
      hName.textContent = domain;
      const hTally = document.createElement('span');
      hTally.className = 'pd-domain-tally';
      hTally.textContent = `${mastered} of ${ordered.length} mastered`;
      head.append(hName, hTally);
      section.appendChild(head);
      const chain = document.createElement('div');
      chain.className = 'pd-chain';
      ordered.forEach((t, i) => chain.appendChild(this.buildTopicRow(t, i + 1, i === ordered.length - 1)));
      section.appendChild(chain);
      this.parentBody.appendChild(section);
    }
  }

  /** Crazy Coin balance for grown-ups and a Redeem button to spend one when he
   *  cashes in the all-dailies reward for his 15 minutes. */
  private buildCoinPanel(count: number): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'pd-coins';
    panel.innerHTML = `
      <div class="pd-coins-info">
        <div class="pd-coins-count">🪙 Crazy Coins: <b id="pd-coin-count">${count}</b></div>
        <div class="pd-coins-sub">Earned by finishing all daily quests. Redeem one when he cashes it in.</div>
      </div>
      <button class="pd-redeem" id="pd-redeem"${count > 0 ? '' : ' disabled'}>Redeem 1</button>`;
    panel.querySelector('#pd-redeem')!.addEventListener('click', () => this.onRedeemCrazyCoin());
    return panel;
  }

  /** Reflect a redeem in the open parent dashboard. */
  setParentCoins(count: number): void {
    const el = this.parentBody.querySelector('#pd-coin-count');
    if (el) el.textContent = String(count);
    const btn = this.parentBody.querySelector<HTMLButtonElement>('#pd-redeem');
    if (btn) btn.disabled = count <= 0;
  }

  /** One topic on the chain: numbered node + connector rail, then the card. */
  private buildTopicRow(t: MasteryTopic, step: number, last: boolean): HTMLDivElement {
    const locked = !t.unlocked;
    const state = locked ? 'locked' : t.state;
    const row = document.createElement('div');
    row.className = `pd-topic ${state}`;

    const rail = document.createElement('div');
    rail.className = 'pd-rail';
    const node = document.createElement('span');
    node.className = 'pd-node';
    node.textContent = locked ? '🔒' : t.state === 'mastered' ? '✓' : String(step);
    rail.appendChild(node);
    if (!last) {
      const link = document.createElement('span');
      link.className = 'pd-link';
      rail.appendChild(link);
    }

    const card = document.createElement('div');
    card.className = 'pd-card';
    const top = document.createElement('div');
    top.className = 'pd-top';
    const kid = document.createElement('span');
    kid.className = 'pd-kid';
    kid.textContent = t.kidLabel;
    top.appendChild(kid);
    const badge = document.createElement('span');
    badge.className = 'pd-badge';
    badge.textContent = locked ? 'Locked' : t.state === 'mastered' ? 'Mastered' : t.state === 'practicing' ? 'Practicing' : 'Ready';
    top.appendChild(badge);
    if (t.attempts > 0) {
      const acc = document.createElement('span');
      acc.className = 'pd-tag pd-acc';
      acc.textContent = `${t.correct}/${t.attempts} correct`;
      top.appendChild(acc);
    }
    if ((t.skips ?? 0) > 0) {
      // Visibility, not judgment: how often he reached for "I'm not sure yet".
      const sk = document.createElement('span');
      sk.className = 'pd-tag pd-skips';
      sk.textContent = `🤔 asked for help ${t.skips}×`;
      top.appendChild(sk);
    }
    if (t.fluentMs != null) {
      const flu = document.createElement('span');
      flu.className = 'pd-tag pd-fluent';
      flu.textContent = `⚡ speed goal: under ${formatSeconds(t.fluentMs)}s`;
      top.appendChild(flu);
    }
    const name = document.createElement('div');
    name.className = 'pd-name';
    name.textContent = t.name;
    const ask = document.createElement('div');
    ask.className = 'pd-ask';
    const askLabel = document.createElement('span');
    askLabel.className = 'pd-ask-label';
    askLabel.textContent = 'Ask him:';
    const askText = document.createElement('em');
    askText.textContent = ' ' + t.assessmentPrompt;
    ask.append(askLabel, askText);
    card.append(top, name, ask);

    row.append(rail, card);
    return row;
  }

  // ---- celebrations (the headline juice) -----------------------------------
  /** Big streak-milestone celebration. Intensity scales with the milestone. */
  celebrateMilestone(streak: number): void {
    const intensity = streak >= 15 ? 3 : streak >= 10 ? 2 : streak >= 5 ? 1 : 0;
    this.screenFlash(['#ffe9a8', '#ffd166', '#ff8fb1', '#b58cff'][intensity]);
    this.banner(`🔥 ${streak} IN A ROW! 🔥`, 'milestone i' + intensity);
    this.confettiBurst(60 + intensity * 50, ['#ffd23b', '#ff7eb6', '#4d8cff', '#2ee6a0', '#ffffff', '#ff4d7e']);
  }
  /** Distinct quest-complete celebration: gold confetti + reward pop. */
  celebrateQuest(q: CompletedQuest): void {
    this.screenFlash('#ffe9a8');
    this.banner(`QUEST COMPLETE!`, 'quest', `${q.label}  +${q.reward}💎`);
    this.confettiBurst(70, ['#ffd23b', '#ffb01f', '#fff3b0', '#ffe27a', '#ffffff']);
    this.highlightQuest(q.key);
  }
  /** He just beat his all-time daily record. Built from the same pieces as the
   *  quest/Crazy Coin celebrations (flash → stacked banner → confetti) so it
   *  belongs to the family, but gold-and-star themed and a notch bigger — it is
   *  the rarest thing he can do. The chip pulses so he sees WHERE the number is.
   *
   *  If he has asked his system for reduced motion, the flash, the confetti and
   *  the pulse are skipped outright (not merely hidden by CSS — nothing is even
   *  built), and the banner stays put as plain, readable congratulation. */
  celebrateDailyRecord(count: number): void {
    const calm = prefersReducedMotion();
    if (!calm) {
      this.screenFlash('#ffd23b');
      this.confettiBurst(110, ['#ffd23b', '#ffb01f', '#fff3b0', '#ffffff', '#7af0ff', '#ff7eb6']);
      // The class is `rc-pop`, NOT `celebrate`: `.celebrate` is the full-screen
      // celebration layer, so putting it on the chip turned the chip into a
      // fixed, full-screen, blurred panel that never went away.
      this.recordChip.classList.remove('rc-pop');
      void this.recordChip.offsetWidth; // restart the animation
      this.recordChip.classList.add('rc-pop');
      // Drop the class when the pop ends, so nothing is left behind on the chip.
      this.recordChip.addEventListener(
        'animationend', () => this.recordChip.classList.remove('rc-pop'), { once: true },
      );
    }
    // Matches the .banner.record animation length so it never vanishes mid-bounce.
    this.banner('⭐ NEW RECORD! ⭐', 'record', `${count} right today, your best day EVER!`, '#ffd23b', 5500);
  }

  /** A shield absorbed a miss — celebrate that the streak survived. */
  celebrateShieldSave(): void {
    this.screenFlash('#7fc7ff');
    this.banner('🛡️ SHIELD SAVED YOUR STREAK!', 'shieldsave');
    this.confettiBurst(40, ['#bfe3ff', '#7fb8ff', '#dff1ff', '#ffffff']);
  }

  private highlightQuest(key: string): void {
    const r = this.questRows.get(key);
    if (!r) return;
    r.row.classList.remove('q-celebrate');
    void r.row.offsetWidth;
    r.row.classList.add('q-celebrate');
  }

  /** The streak counter fell, but what he built is permanent — trophy moment. */
  celebrateBestStreak(best: number): void {
    this.banner(`Best streak: ${best} ⭐`, 'quest', 'Yours forever!');
  }
  private banner(title: string, cls: string, sub?: string, accent?: string, lifeMs = 5100): void {
    const el = document.createElement('div');
    el.className = 'banner ' + cls;
    if (accent) el.style.setProperty('--accent', accent);
    el.innerHTML = `<div class="b-title"></div>${sub ? '<div class="b-sub"></div>' : ''}`;
    (el.querySelector('.b-title') as HTMLElement).textContent = title;
    if (sub) (el.querySelector('.b-sub') as HTMLElement).textContent = sub;
    // Append to the centered flex column so simultaneous banners (e.g. a milestone
    // AND a quest-complete) STACK vertically instead of overlapping.
    this.bannerStack.appendChild(el);
    setTimeout(() => el.remove(), lifeMs);
  }

  private screenFlash(color: string): void {
    const f = document.createElement('div');
    f.className = 'screen-flash';
    f.style.background = `radial-gradient(circle at 50% 42%, ${color}, transparent 70%)`;
    this.celebrate.appendChild(f);
    setTimeout(() => f.remove(), 650);
  }

  private confettiBurst(count: number, colors: string[]): void {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const c = document.createElement('span');
      c.className = 'confetti';
      const useGem = Math.random() < 0.4;
      c.classList.toggle('gem', useGem);
      const col = colors[(Math.random() * colors.length) | 0];
      c.style.setProperty('--c', col);
      c.style.left = Math.random() * 100 + 'vw';
      c.style.setProperty('--dx', (Math.random() * 2 - 1).toFixed(2));
      c.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
      c.style.setProperty('--dur', (1.1 + Math.random() * 1.1).toFixed(2) + 's');
      c.style.setProperty('--delay', (Math.random() * 0.25).toFixed(2) + 's');
      c.style.setProperty('--sz', (7 + Math.random() * 9).toFixed(0) + 'px');
      frag.appendChild(c);
    }
    this.celebrate.appendChild(frag);
    // Clean up after the longest possible fall.
    setTimeout(() => {
      this.celebrate.querySelectorAll('.confetti').forEach((n) => {
        if (!(n as HTMLElement).dataset.kept) n.remove();
      });
    }, 2600);
  }

  /** A small transient message near the shop button. */
  private toast(msg: string): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.celebrate.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }
}

/** Order a domain's topics so every topic comes after its (in-domain) prereqs —
 *  a stable topological sort, so chains render top-to-bottom in learning order.
 *  Cross-domain prereqs are treated as satisfied (they order in their own domain). */
function orderByPrereqs(topics: MasteryTopic[]): MasteryTopic[] {
  const inDomain = new Set(topics.map((t) => t.id));
  const placed = new Set<string>();
  const remaining = [...topics];
  const out: MasteryTopic[] = [];
  while (remaining.length) {
    const i = remaining.findIndex((t) => t.prereqs.every((p) => !inDomain.has(p) || placed.has(p)));
    const pick = remaining.splice(Math.max(i, 0), 1)[0]; // cycle fallback: keep server order
    placed.add(pick.id);
    out.push(pick);
  }
  return out;
}

/** 7000 → "7", 6500 → "6.5" — seconds without a trailing .0. */
function formatSeconds(ms: number): string {
  return String(Math.round(ms / 100) / 10);
}

function injectStyles(): void {
  if (document.getElementById('hud-styles')) return;
  const s = document.createElement('style');
  s.id = 'hud-styles';
  s.textContent = `
  .hud { position: fixed; inset: 0; pointer-events: none; display: flex; flex-direction: column;
    font-family: 'Baloo 2', system-ui, sans-serif; -webkit-user-select: none; user-select: none; }
  .hud-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 12px 14px; }
  .hud-top-left { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; }

  /* ---- Daily record chip: today vs his all-time best, and the way in to the
     stats panel. Sits under the hoard bar, well clear of the problem text. ---- */
  .record-chip { pointer-events: auto; cursor: pointer; border: none; font-family: inherit;
    display: flex; align-items: center; gap: 9px; min-height: 44px; padding: 6px 12px 6px 11px;
    border-radius: 14px; text-align: left; color: #ffe9a8;
    background: rgba(20,16,40,0.55); backdrop-filter: blur(6px);
    box-shadow: inset 0 0 0 1px rgba(255,233,168,0.28), 0 4px 14px rgba(0,0,0,0.35);
    transition: transform .1s ease, box-shadow .2s ease, background .2s ease; }
  .record-chip:hover, .record-chip:focus-visible { background: rgba(34,26,62,0.72);
    box-shadow: inset 0 0 0 1px rgba(255,233,168,0.55), 0 6px 18px rgba(0,0,0,0.45); }
  .record-chip:focus-visible { outline: 3px solid #ffe9a8; outline-offset: 2px; }
  .record-chip:active { transform: translateY(2px); }
  .record-chip .rc-star { font-size: 19px; line-height: 1;
    filter: drop-shadow(0 0 6px rgba(255,210,59,0.7)); }
  .record-chip .rc-nums { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .record-chip .rc-today { font-weight: 900; font-size: 15px; line-height: 1.1; color: #fff; }
  .record-chip .rc-today b { font-size: 19px; font-variant-numeric: tabular-nums; color: #ffe9a8; }
  .record-chip .rc-best { font-weight: 700; font-size: 11.5px; line-height: 1.1; color: #ffd166;
    white-space: nowrap; }
  .record-chip .rc-best b { font-variant-numeric: tabular-nums; }
  .record-chip .rc-go { font-size: 15px; opacity: .8; }
  /* Holding the record: gold rim + the words say so (never colour alone). */
  .record-chip.holding { background: linear-gradient(160deg, rgba(255,210,59,0.22), rgba(255,150,30,0.12));
    box-shadow: inset 0 0 0 1.5px rgba(255,210,59,0.75), 0 6px 20px rgba(255,170,30,0.25); }
  .record-chip.holding .rc-best { color: #fff3b0; }
  .record-chip.rc-pop { animation: recordChipPop 1.4s cubic-bezier(.3,1.5,.5,1); }
  @keyframes recordChipPop {
    0%{ transform: scale(1) } 20%{ transform: scale(1.28);
      box-shadow: inset 0 0 0 2px #fff3b0, 0 0 34px rgba(255,210,59,0.95) }
    55%{ transform: scale(1.06) } 100%{ transform: scale(1) } }
  .status { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; flex: none; }
  .collection { pointer-events: auto; display: flex; flex-direction: column; align-items: center;
    background: rgba(20,16,40,0.55); color: #ffe9a8;
    font-weight: 800; font-size: 22px; line-height: 1; padding: 7px 16px 6px; border-radius: 18px; backdrop-filter: blur(6px);
    box-shadow: inset 0 0 0 1px rgba(255,233,168,0.18); transition: transform .1s; min-width: 78px; text-align: center; }
  #collection-count, #lifetime-gems { font-variant-numeric: tabular-nums; }
  .lifetime-earned { margin-top: 4px; color: #ffd166; font-size: 11px; line-height: 1; letter-spacing: .2px; }
  .collection.pop { animation: pop 0.45s cubic-bezier(.3,1.6,.5,1); }
  @keyframes pop { 0%{transform:scale(1)} 35%{transform:scale(1.45); color:#fff} 100%{transform:scale(1)} }

  /* Streak flame — grows and heats up with the streak. */
  .flame { pointer-events: auto; display: flex; align-items: center; gap: 4px; font-weight: 900;
    font-size: 20px; color: #ffd166; padding: 6px 13px; border-radius: 999px;
    background: rgba(40,16,10,0.5); backdrop-filter: blur(6px);
    box-shadow: inset 0 0 0 1px rgba(255,140,60,0.35); transition: transform .15s, color .2s; }
  .flame .flame-emoji { display: inline-block; transform-origin: 50% 80%; animation: flicker 0.5s infinite alternate ease-in-out; }
  @keyframes flicker { from{transform:scale(1) rotate(-3deg)} to{transform:scale(1.12) rotate(3deg)} }
  .flame.big { font-size: 23px; color: #ffb347; box-shadow: inset 0 0 0 1px rgba(255,150,40,0.55), 0 0 14px rgba(255,140,40,0.4); }
  .flame.huge { font-size: 26px; color: #ff8c42; box-shadow: inset 0 0 0 1px rgba(255,110,30,0.7), 0 0 22px rgba(255,110,30,0.6); }
  .flame.mega { font-size: 30px; color: #ff5e3a; text-shadow: 0 0 12px rgba(255,90,40,0.9);
    box-shadow: inset 0 0 0 2px rgba(255,80,20,0.85), 0 0 30px rgba(255,80,20,0.8); animation: megaPulse 0.6s infinite alternate; }
  @keyframes megaPulse { from{transform:scale(1)} to{transform:scale(1.06)} }
  .flame.bump { animation: flameBump 0.4s cubic-bezier(.3,1.7,.5,1); }
  @keyframes flameBump { 0%{transform:scale(1)} 40%{transform:scale(1.4)} 100%{transform:scale(1)} }
  .flame.saved { animation: shieldSave 0.7s ease; }
  @keyframes shieldSave { 0%{box-shadow:inset 0 0 0 2px #7fd1ff, 0 0 0 rgba(120,180,255,0.9)}
    50%{box-shadow:inset 0 0 0 3px #7fd1ff, 0 0 26px rgba(120,180,255,0.95)} 100%{box-shadow:inset 0 0 0 1px rgba(255,140,60,0.35)} }

  .shield { pointer-events: auto; display: flex; align-items: center; gap: 4px; font-weight: 800; font-size: 19px;
    color: #bfe3ff; padding: 6px 13px; border-radius: 999px; background: rgba(16,28,48,0.55); backdrop-filter: blur(6px);
    box-shadow: inset 0 0 0 1px rgba(120,180,255,0.3); transition: transform .12s; }
  .shield.pop { animation: pop 0.45s cubic-bezier(.3,1.6,.5,1); }
  .buy-shield { pointer-events: auto; cursor: pointer; border: none; font-family: inherit; font-weight: 800; font-size: 14px;
    color: #0b1c2e; padding: 7px 12px; border-radius: 999px; background: linear-gradient(160deg,#bfe3ff,#7fb8ff);
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.7), 0 4px 0 #4f86c6; transition: transform .08s, filter .12s; opacity: .65; }
  .buy-shield b { font-size: 15px; }
  .buy-shield.afford { opacity: 1; filter: brightness(1.04) saturate(1.1); }
  .buy-shield:active { transform: translateY(3px); box-shadow: inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 0 #4f86c6; }
  .buy-shield.ok { animation: buyOk 0.5s ease; }
  @keyframes buyOk { 0%{filter:brightness(1)} 40%{filter:brightness(1.5) drop-shadow(0 0 10px #9fe3ff)} 100%{filter:brightness(1)} }
  .buy-shield.bad { animation: buyBad 0.4s; }
  @keyframes buyBad { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }

  /* The hoard meter — a fixed-width bar that fills with the actual gems he mines
     (by color), then bursts for a bonus when full. Always visible (a persistent
     track), single row so "full" is well-defined. */
  .hoard { pointer-events: none; flex: none; width: min(70vw, 348px); display: flex; flex-wrap: nowrap;
    gap: 5px; align-items: center; height: 30px; overflow: hidden; padding: 5px 8px; border-radius: 11px;
    background: rgba(20,16,40,0.40); backdrop-filter: blur(5px);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 14px rgba(0,0,0,0.25);
    transition: box-shadow .3s ease, transform .3s ease; }
  /* Overflow: rattle (shake), then pop the bar open (burst). */
  .hoard.shake { animation: hoardShake .42s ease-in-out;
    box-shadow: inset 0 0 0 2px rgba(255,220,120,0.95), 0 0 18px rgba(255,200,80,0.8); }
  @keyframes hoardShake {
    0%,100%{transform:translateX(0) rotate(0)}
    10%{transform:translate(-3px,1px) rotate(-1.4deg)} 25%{transform:translate(4px,-2px) rotate(1.4deg)}
    40%{transform:translate(-5px,1px) rotate(-1.6deg)} 55%{transform:translate(5px,-1px) rotate(1.4deg)}
    70%{transform:translate(-4px,1px) rotate(-1deg)} 85%{transform:translate(2px,0) rotate(.6deg)} }
  .hoard.burst { animation: hoardBurst .55s ease-out forwards; overflow: visible; }
  @keyframes hoardBurst {
    0%{transform:scale(1); filter:brightness(1)}
    16%{transform:scale(1.22); filter:brightness(2.6);
        box-shadow:inset 0 0 0 2px rgba(255,235,170,1), 0 0 44px rgba(255,220,120,1)}
    100%{transform:scale(1.04); filter:brightness(1);
        box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 14px rgba(0,0,0,0.25)} }
  .gem-pip { width: 16px; height: 16px; border-radius: 4px 4px 5px 5px; transform: scale(0) rotate(45deg);
    transition: transform .35s cubic-bezier(.3,1.7,.5,1);
    background: radial-gradient(80% 60% at 30% 22%, rgba(255,255,255,0.9), rgba(255,255,255,0) 50%),
      linear-gradient(150deg, color-mix(in srgb, var(--gem) 65%, white), var(--gem) 55%, color-mix(in srgb, var(--gem) 60%, #160d22));
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 3px rgba(0,0,0,0.4); }
  .gem-pip.in { transform: scale(1) rotate(45deg); }

  /* Daily quests — a compact corner strip, tap 📜 to expand. */
  .quests-toggle { position: fixed; top: 64px; right: 14px; pointer-events: auto; cursor: pointer; border: none;
    width: 44px; height: 44px; border-radius: 12px; font-size: 22px; background: rgba(20,16,40,0.6);
    box-shadow: inset 0 0 0 1px rgba(255,233,168,0.22); backdrop-filter: blur(6px); }
  .quests { position: fixed; top: 116px; right: 14px; width: min(280px, 80vw); pointer-events: auto;
    background: rgba(18,14,34,0.82); border-radius: 16px; padding: 12px 13px 13px; backdrop-filter: blur(9px);
    max-height: min(70vh, 520px); overflow-y: auto;
    box-shadow: 0 12px 34px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,233,168,0.18);
    transform-origin: top right; transform: scale(0.86) translateY(-8px); opacity: 0; visibility: hidden;
    transition: opacity .18s ease, transform .18s cubic-bezier(.3,1.5,.5,1), visibility .18s; }
  .quests.open { opacity: 1; visibility: visible; transform: scale(1) translateY(0); }
  .quests-head { color: #ffe9a8; font-weight: 900; font-size: 16px; margin-bottom: 9px; letter-spacing: .3px; }
  .shop-section-head { margin: 12px 2px 6px; font-weight: 900; font-size: 14px; color: #ffd23b;
    text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .pad-swatch { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 3px;
    background: rgba(20,16,40,0.55); }
  .pad-swatch .mini-gem { border-radius: 4px;
    background: linear-gradient(155deg, color-mix(in srgb, var(--g) 60%, white), var(--g)); }
  .gem-style-head { color: #aeeaff; }
  .gem-model-swatch { position: relative; width: 36px; height: 36px; flex: none;
    filter: drop-shadow(0 3px 4px rgba(0,0,0,.5)) drop-shadow(0 0 5px color-mix(in srgb, var(--tint) 55%, transparent)); }
  /* A render of the real GLB — it fills the plate, so it skips the CSS facets below. */
  .gem-model-shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
  .gem-model-core, .gem-model-accent { position: absolute; inset: 5px;
    background: radial-gradient(circle at 30% 22%, #fff 0 8%, color-mix(in srgb, var(--tint) 55%, white) 22%, var(--tint) 58%, #241331 100%);
    box-shadow: inset -3px -4px 5px rgba(0,0,0,.32), inset 2px 2px 2px rgba(255,255,255,.55); }
  .shape-geode .gem-model-core { border-radius: 48% 42% 52% 38%; clip-path: polygon(50% 0,88% 13%,100% 55%,72% 100%,20% 92%,0 48%,16% 15%); }
  .shape-geode .gem-model-accent { inset: 10px; border-radius: 50%; background: #d7bbff; }
  .shape-emerald .gem-model-core { inset: 3px 8px; clip-path: polygon(24% 0,76% 0,100% 18%,100% 82%,76% 100%,24% 100%,0 82%,0 18%); }
  .shape-emerald .gem-model-accent { inset: 8px 13px; clip-path: polygon(22% 0,78% 0,100% 22%,100% 78%,78% 100%,22% 100%,0 78%,0 22%); background:rgba(225,255,239,.72); }
  .shape-ruby .gem-model-core { inset: 4px; clip-path: polygon(50% 0,82% 10%,100% 38%,89% 78%,50% 100%,11% 78%,0 38%,18% 10%); }
  .shape-ruby .gem-model-accent { inset: 9px; clip-path: polygon(50% 0,63% 35%,100% 50%,63% 64%,50% 100%,37% 64%,0 50%,37% 35%); background:rgba(255,224,232,.75); }
  .shape-diamond .gem-model-core { inset: 4px 2px; clip-path: polygon(20% 8%,80% 8%,100% 36%,50% 100%,0 36%); }
  .shape-diamond .gem-model-accent { inset: 8px 9px 16px; clip-path: polygon(50% 0,100% 45%,50% 100%,0 45%); background:rgba(255,255,255,.85); }
  .shape-heart .gem-model-core { transform: rotate(45deg); border-radius: 50% 45% 12% 45%; }
  .shape-heart .gem-model-core::before, .shape-heart .gem-model-core::after { content:''; position:absolute;
    width:100%; height:100%; border-radius:50%; background:inherit; }
  .shape-heart .gem-model-core::before { left:-45%; }
  .shape-heart .gem-model-core::after { top:-45%; }
  .shape-heart .gem-model-accent { inset: 12px; border-radius: 50%; background:#ffc247; }
  .quests-bonus { display: flex; align-items: center; gap: 8px; margin: 6px 2px 2px; padding: 7px 10px;
    border-radius: 12px; background: rgba(142, 203, 255, 0.09); border: 1px solid rgba(142, 203, 255, 0.25);
    color: #bfe0ff; font-weight: 800; font-size: 13px; }
  .quests-bonus .qb-icon { font-size: 16px; filter: drop-shadow(0 0 6px rgba(142,203,255,0.6)); }
  .quests-bonus.earned { background: rgba(126, 217, 130, 0.12); border-color: rgba(126, 217, 130, 0.45); color: #b9f0bb; }
  .quests-head.weekly { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,233,168,0.18); color: #ffd23b; }
  .quest { margin-bottom: 11px; }
  .quest:last-child { margin-bottom: 0; }
  .q-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .q-label { color: #fff; font-weight: 700; font-size: 13.5px; line-height: 1.2; }
  .q-reward { color: #ffd23b; font-weight: 800; font-size: 13px; flex: none; }
  .q-bar { height: 10px; border-radius: 6px; background: rgba(255,255,255,0.12); overflow: hidden; margin: 5px 0 2px;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.4); }
  .q-fill { height: 100%; width: 0%; border-radius: 6px;
    background: linear-gradient(90deg,#69db7c,#2ee6a0); transition: width .5s cubic-bezier(.3,1,.5,1);
    box-shadow: 0 0 8px rgba(46,230,160,0.6); }
  .q-prog { color: #cfc6e8; font-weight: 700; font-size: 12px; }
  .quest.done .q-fill { background: linear-gradient(90deg,#ffd23b,#ffb01f); box-shadow: 0 0 10px rgba(255,200,60,0.7); }
  .quest.done .q-prog { color: #ffd23b; }
  .quest.q-celebrate { animation: questCeleb 1s ease; }
  /* Glow pulse only — no scale, so it never overlaps the header or sibling rows. */
  @keyframes questCeleb { 0%{filter:brightness(1)} 30%{filter:brightness(1.6) drop-shadow(0 0 10px rgba(255,210,80,0.9))} 100%{filter:brightness(1)} }

  /* Shop — toggle sits LEFT of the quests toggle (a horizontal row); panel mirrors
     quests and opens below the row. Only one corner panel is open at a time, so both
     panels share the same anchor without overlapping either button. */
  .shop-toggle { position: fixed; top: 64px; right: 66px; pointer-events: auto; cursor: pointer; border: none;
    width: 44px; height: 44px; border-radius: 12px; font-size: 22px; background: rgba(40,28,12,0.62);
    box-shadow: inset 0 0 0 1px rgba(255,210,120,0.3); backdrop-filter: blur(6px); }
  .shop { position: fixed; top: 116px; right: 14px; width: min(312px, 84vw); max-height: min(62vh, 520px);
    overflow-y: auto; pointer-events: auto;
    background: rgba(18,14,34,0.86); border-radius: 16px; padding: 12px 12px 13px; backdrop-filter: blur(9px);
    box-shadow: 0 12px 34px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,210,120,0.2);
    transform-origin: top right; transform: scale(0.86) translateY(-8px); opacity: 0; visibility: hidden;
    transition: opacity .18s ease, transform .18s cubic-bezier(.3,1.5,.5,1), visibility .18s; }
  .shop.open { opacity: 1; visibility: visible; transform: scale(1) translateY(0); }
  .shop-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
    color: #ffd9a0; font-weight: 900; font-size: 16px; margin-bottom: 10px; letter-spacing: .3px; }
  .shop-head .shop-gems { color: #ffe9a8; font-size: 14px; font-weight: 800; flex: none; }
  #shop-gems { font-variant-numeric: tabular-nums; }
  .shop-list { display: flex; flex-direction: column; gap: 8px; }
  .shop-row { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 12px;
    background: rgba(255,255,255,0.05); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }
  .shop-row.equipped { background: rgba(120,230,160,0.12); box-shadow: inset 0 0 0 1px rgba(120,230,160,0.45); }
  .swatch { width: 30px; height: 30px; flex: none; border-radius: 8px; transform: rotate(45deg);
    background: radial-gradient(75% 60% at 30% 24%, rgba(255,255,255,0.85), rgba(255,255,255,0) 55%),
      linear-gradient(150deg, color-mix(in srgb, var(--tint) 70%, white), var(--tint) 55%, color-mix(in srgb, var(--tint) 65%, #100a1c));
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.55), 0 2px 5px rgba(0,0,0,0.4); }
  .shop-meta { flex: 1; min-width: 0; }
  .shop-name { color: #fff; font-weight: 800; font-size: 14px; line-height: 1.15;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .shop-blurb { color: #b9b0d4; font-weight: 600; font-size: 11px; line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .shop-btn { flex: none; pointer-events: auto; cursor: pointer; border: none; font-family: inherit; font-weight: 800;
    font-size: 12.5px; padding: 7px 11px; border-radius: 999px; color: #0b1c2e; transition: transform .08s, filter .12s; }
  .shop-btn:active { transform: translateY(2px); }
  .shop-btn:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
  .shop-btn.is-equipped { background: linear-gradient(160deg,#9bf0bd,#4fd089); color: #0a2417; opacity: .9; cursor: default; }
  .shop-btn.is-equip { background: linear-gradient(160deg,#bfe3ff,#7fb8ff); box-shadow: inset 0 1px 1px rgba(255,255,255,0.6), 0 3px 0 #4f86c6; }
  .shop-btn.is-equip:active { box-shadow: inset 0 1px 1px rgba(255,255,255,0.5), 0 1px 0 #4f86c6; }
  .shop-btn.is-buy.afford { background: linear-gradient(160deg,#ffe27a,#ffb01f); color: #5a3a00;
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.7), 0 3px 0 #b96a00; }
  .shop-btn.is-buy.afford:active { box-shadow: inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 0 #b96a00; }
  .shop-btn.is-buy.poor { background: rgba(255,255,255,0.14); color: #cfc6e8; cursor: not-allowed; opacity: .7; }
  .shop-btns { flex: none; display: flex; flex-direction: column; gap: 5px; align-items: stretch; }
  .shop-btn.is-repair { background: linear-gradient(160deg,#ffd9a8,#ff9f45); color: #5a2e00;
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.6), 0 3px 0 #c26510; font-size: 12px; padding: 6px 10px; }
  .shop-btn.is-repair.urgent { background: linear-gradient(160deg,#ffb36b,#ff7a3d); color: #3a1400;
    animation: repairPulse 1.1s ease-in-out infinite; }
  .shop-btn.is-repair.poor { background: rgba(255,255,255,0.14); color: #cfc6e8; cursor: not-allowed; opacity: .7; box-shadow: none; animation: none; }
  @keyframes repairPulse { 0%,100%{ filter: brightness(1) } 50%{ filter: brightness(1.35) } }
  .shop-row.broken { background: rgba(255,120,80,0.10); box-shadow: inset 0 0 0 1px rgba(255,140,90,0.5); }
  .row-dura { height: 5px; border-radius: 4px; margin-top: 5px; background: rgba(255,255,255,0.12); overflow: hidden; }
  .row-dura-fill { height: 100%; border-radius: 4px; transition: width .3s ease; }
  .row-dura.ok .row-dura-fill { background: linear-gradient(90deg,#69db7c,#2ee6a0); }
  .row-dura.warn .row-dura-fill { background: linear-gradient(90deg,#ffd23b,#ffab2e); }
  .row-dura.low .row-dura-fill { background: linear-gradient(90deg,#ff7a4d,#ff4d4d); }

  /* Pickaxe-durability chip in the status row (hidden when wooden is equipped). */
  .pick-dura { display: flex; align-items: center; gap: 5px; font-size: 15px; padding: 5px 9px; border-radius: 999px;
    background: rgba(20,16,40,0.55); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1); }
  .pick-dura[hidden] { display: none; }
  .dura-bar { width: 46px; height: 7px; border-radius: 5px; background: rgba(255,255,255,0.15); overflow: hidden;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.4); }
  .dura-fill { height: 100%; width: 100%; border-radius: 5px; transition: width .35s cubic-bezier(.3,1,.5,1), background .3s; }
  .pick-dura.ok .dura-fill { background: linear-gradient(90deg,#69db7c,#2ee6a0); box-shadow: 0 0 6px rgba(46,230,160,0.5); }
  .pick-dura.warn .dura-fill { background: linear-gradient(90deg,#ffd23b,#ffab2e); box-shadow: 0 0 6px rgba(255,180,50,0.5); }
  .pick-dura.low .dura-fill { background: linear-gradient(90deg,#ff7a4d,#ff4d4d); box-shadow: 0 0 8px rgba(255,80,60,0.7); }
  .pick-dura.low { animation: duraPulse 0.9s ease-in-out infinite; }
  @keyframes duraPulse { 0%,100%{ box-shadow: inset 0 0 0 1px rgba(255,120,90,0.4) } 50%{ box-shadow: inset 0 0 0 1px rgba(255,120,90,1), 0 0 10px rgba(255,90,60,0.6) } }

  .banner.broke .b-title { font-size: clamp(34px,9vw,80px); color: #ffd9b0;
    text-shadow: 0 0 18px rgba(255,140,60,0.9), 0 4px 0 rgba(120,50,10,0.8), 0 8px 22px rgba(0,0,0,0.6); }
  .banner.broke .b-sub { color: #ffcfa8; }
  .banner.broke { animation: bannerPop 3.4s cubic-bezier(.2,1.4,.4,1) forwards; }

  .problem-wrap { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 6px; }
  .voice-stack { display: flex; flex-direction: column; gap: 10px; align-items: center; }
  .replay.explain, .replay.not-sure { opacity: 0; pointer-events: none; transform: scale(0.7);
    transition: opacity .5s ease, transform .5s cubic-bezier(.2,1.4,.4,1); }
  .replay.explain.avail, .replay.not-sure.avail { opacity: 1; pointer-events: auto; transform: scale(1); }
  .replay.not-sure { background: rgba(60,44,96,0.62); font-size: 20px; }
  .replay.not-sure.busy { pointer-events: none; animation: thinking 0.9s ease-in-out infinite; }
  .demo { position: fixed; inset: 0; z-index: 50; display: none; align-items: center; justify-content: center;
    pointer-events: auto; background: rgba(12,8,24,0.72); backdrop-filter: blur(6px); }
  .demo.show { display: flex; }
  .demo-card { width: min(560px, 88vw); padding: 22px 24px 20px; text-align: center;
    border-radius: 22px; background: linear-gradient(160deg, #2a1f47, #1b1430);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.14), 0 18px 50px rgba(0,0,0,0.6); }
  .demo-banner { font-size: clamp(20px, 4.4vw, 28px); font-weight: 900; color: #ffd23b;
    text-shadow: 0 0 22px rgba(255,210,59,0.55); letter-spacing: .5px; }
  .demo-label { margin-top: 2px; font-size: clamp(15px, 3vw, 19px); font-weight: 800; color: #cfc6ea; }
  .demo-example { margin: 14px 0 10px; display: flex; align-items: center; justify-content: center; gap: 10px;
    font-size: clamp(28px, 6.4vw, 44px); font-weight: 900; color: #fff; text-shadow: 0 3px 14px rgba(0,0,0,0.5); }
  .demo-answer { color: #7ed982; text-shadow: 0 0 20px rgba(126,217,130,0.55); }
  .demo-script { margin: 6px auto 16px; max-width: 46ch; color: #ffe9a8; font-weight: 700;
    font-size: clamp(14px, 2.8vw, 18px); line-height: 1.35; }
  .demo-go { pointer-events: auto; border: none; cursor: pointer; font-family: inherit; font-weight: 900;
    font-size: clamp(15px, 3.2vw, 20px); color: #10300f; padding: 13px 26px; border-radius: 16px;
    background: linear-gradient(155deg,#7ed982,#3fae55);
    box-shadow: 0 6px 0 #2b7c3c, 0 12px 22px rgba(0,0,0,0.4); }
  .demo-go:active { transform: translateY(4px); box-shadow: 0 2px 0 #2b7c3c; }
  .help-choice { position: absolute; left: 50%; top: clamp(210px, 40vh, 330px); transform: translate(-50%, 6px);
    display: none; gap: 10px; z-index: 6; }
  .help-choice.show { display: flex; }
  .help-btn { pointer-events: auto; border: none; cursor: pointer; font-family: inherit; font-weight: 800;
    font-size: clamp(13px, 2.6vw, 16px); color: #fff; padding: 10px 16px; border-radius: 14px;
    box-shadow: 0 5px 0 rgba(0,0,0,0.35), 0 10px 18px rgba(0,0,0,0.35); }
  .help-btn:active { transform: translateY(3px); box-shadow: 0 2px 0 rgba(0,0,0,0.35); }
  .help-btn.go { background: linear-gradient(155deg,#7ed982,#3fae55); color: #10300f; }
  .help-btn.again { background: linear-gradient(155deg,#6a5f8e,#463c68); }
  .replay { pointer-events: auto; border: none; background: rgba(20,16,40,0.5); color: #fff; font-size: 22px;
    width: 46px; height: 46px; border-radius: 50%; cursor: pointer; }
  .replay.explain.busy { pointer-events: none; animation: thinking 0.9s ease-in-out infinite; }
  @keyframes thinking { 0%, 100% { transform: scale(1) rotate(-6deg); } 50% { transform: scale(1.14) rotate(6deg); } }
  .problem { color: #fff; font-size: clamp(40px, 9vw, 84px); font-weight: 900;
    text-shadow: 0 4px 18px rgba(0,0,0,0.5); letter-spacing: 1px; }
  .hint { align-self: center; max-width: min(560px, 88vw); max-height: clamp(72px, 18vh, 150px);
    overflow: hidden; margin: 6px auto 0; padding: 2px 14px;
    text-align: center; color: #ffe9a8; font-weight: 700; font-size: clamp(15px, 3vw, 22px);
    line-height: 1.3; text-shadow: 0 2px 8px rgba(0,0,0,0.55), 0 0 16px rgba(0,0,0,0.5); opacity: 0;
    transform: translateY(-4px); transition: opacity .2s, transform .2s; pointer-events: none;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 calc(100% - 16px), transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 calc(100% - 16px), transparent 100%); }
  .hint.show { opacity: 1; transform: translateY(0); }
  .hint.long { font-size: clamp(13px, 2.4vw, 18px); }
  .hud-bottom { margin-top: auto; display: flex; flex-direction: column; align-items: flex-start;
    padding-left: clamp(16px, 7vw, 110px);
    margin-bottom: max(18px, env(safe-area-inset-bottom)); }
  .answer { width: min(330px, 78vw); text-align: center; min-height: 1.1em; margin-bottom: 7px;
    font-size: clamp(28px, 6.5vw, 46px); font-weight: 900; color: #8be9ff; text-shadow: 0 3px 12px rgba(0,0,0,0.5); }
  .answer.wrong { color: #ff8787; animation: shake 0.4s; }
  @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-10px)} 75%{transform:translateX(10px)} }
  .pad { pointer-events: auto; align-self: flex-start; display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 9px; width: min(330px, 78vw); }
  .key { position: relative; border: none; cursor: pointer; font-family: inherit; font-weight: 900; color: #fff;
    aspect-ratio: 1.55; border-radius: 15px; font-size: clamp(20px, 4.6vw, 30px); overflow: hidden;
    transition: transform .07s ease, filter .07s ease, box-shadow .07s ease; }
  .key:active { transform: translateY(5px) scale(0.985); filter: brightness(1.08); }
  .key-gem {
    background:
      radial-gradient(115% 80% at 28% 16%, rgba(255,255,255,0.92), rgba(255,255,255,0) 42%),
      linear-gradient(155deg, color-mix(in srgb, var(--gem) 60%, white), var(--gem) 42%, color-mix(in srgb, var(--gem) 60%, #160d22));
    box-shadow: inset 0 2px 2px rgba(255,255,255,0.65), inset 0 -7px 12px rgba(0,0,0,0.30),
      0 7px 0 color-mix(in srgb, var(--gem) 42%, #120a1e), 0 12px 22px color-mix(in srgb, var(--gem) 45%, transparent);
    text-shadow: 0 2px 4px rgba(0,0,0,0.42); }
  .key-gem:active { box-shadow: inset 0 2px 2px rgba(255,255,255,0.5), inset 0 -4px 8px rgba(0,0,0,0.3),
      0 2px 0 color-mix(in srgb, var(--gem) 42%, #120a1e); }
  .key-gem::after { content:''; position:absolute; top:11%; left:13%; width:36%; height:26%;
    background: linear-gradient(120deg, rgba(255,255,255,0.9), rgba(255,255,255,0)); border-radius: 45%;
    transform: rotate(-12deg); pointer-events:none; }
  .key-back { background: linear-gradient(155deg,#5a6173,#363c4a); font-size: 30px;
    box-shadow: inset 0 2px 2px rgba(255,255,255,0.22), 0 7px 0 #23272f, 0 12px 20px rgba(0,0,0,0.35); }
  .key-back:active { box-shadow: inset 0 2px 2px rgba(255,255,255,0.18), 0 2px 0 #23272f; }
  .key-mine { color: #5a3a00; font-size: clamp(17px,3.8vw,25px); letter-spacing:.5px;
    background: radial-gradient(115% 80% at 30% 16%, rgba(255,255,255,0.95), rgba(255,255,255,0) 44%),
      linear-gradient(155deg,#ffe27a,#ffb01f 45%,#e8870c);
    box-shadow: inset 0 2px 2px rgba(255,255,255,0.8), inset 0 -7px 12px rgba(140,70,0,0.35),
      0 7px 0 #b96a00, 0 12px 22px rgba(255,150,0,0.35); }
  .key-mine:active { box-shadow: inset 0 2px 2px rgba(255,255,255,0.7), 0 2px 0 #b96a00; }

  /* ---- Celebration layer (over the top!) ---- */
  /* Keyed on the id, not the class: a stray "celebrate" class elsewhere must
     never turn some little chip into a full-screen overlay. */
  #celebrate { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 50; }
  .screen-flash { position: absolute; inset: -10%; opacity: 0; animation: flashAnim 0.65s ease-out forwards; mix-blend-mode: screen; }
  @keyframes flashAnim { 0%{opacity:0} 12%{opacity:0.9} 100%{opacity:0} }
  /* Centered column so simultaneous banners stack instead of overlapping. */
  .banner-stack { position: absolute; left: 50%; top: 38%; transform: translate(-50%,-50%);
    display: flex; flex-direction: column; align-items: center; gap: 10px; width: max-content; max-width: 96vw; }
  .banner { text-align: center; white-space: nowrap; will-change: transform, opacity; transform-origin: center; }
  .b-title { font-weight: 900; color: #fff; line-height: 1; letter-spacing: 1px;
    text-shadow: 0 0 18px rgba(255,210,60,0.9), 0 4px 0 rgba(180,90,0,0.8), 0 8px 22px rgba(0,0,0,0.6); }
  .b-sub { margin-top: 8px; font-weight: 800; font-size: clamp(18px,4vw,28px); color: #ffe9a8;
    text-shadow: 0 2px 12px rgba(0,0,0,0.7); }
  .banner.milestone .b-title { font-size: clamp(40px,11vw,96px);
    background: linear-gradient(180deg,#fff6cf,#ffd23b 55%,#ff8c1a); -webkit-background-clip: text; background-clip: text; color: transparent;
    -webkit-text-stroke: 2px rgba(120,50,0,0.5); }
  .banner.milestone { animation: bannerPop 5s cubic-bezier(.2,1.4,.4,1) forwards; }
  .banner.i1 .b-title { font-size: clamp(46px,12vw,104px); }
  .banner.i2 .b-title { font-size: clamp(52px,13vw,116px); }
  .banner.i3 .b-title { font-size: clamp(58px,14vw,130px); }
  .banner.quest .b-title { font-size: clamp(34px,8vw,68px); color: #fff;
    text-shadow: 0 0 16px rgba(255,210,60,0.95), 0 4px 0 rgba(150,80,0,0.85), 0 8px 22px rgba(0,0,0,0.6); }
  .banner.quest { animation: bannerPop 5s cubic-bezier(.2,1.4,.4,1) forwards; }
  .banner.shieldsave .b-title { font-size: clamp(26px,6vw,52px); color: #eaf6ff;
    text-shadow: 0 0 16px rgba(120,190,255,0.95), 0 4px 0 rgba(30,70,120,0.8), 0 8px 22px rgba(0,0,0,0.6); }
  .banner.shieldsave { animation: bannerPop 5s cubic-bezier(.2,1.4,.4,1) forwards; }
  /* Pickaxe unlock — title glows in the tier's accent color. */
  .banner.unlock .b-title { font-size: clamp(40px,11vw,96px); color: #fff;
    text-shadow: 0 0 22px var(--accent,#ffd23b), 0 0 44px var(--accent,#ffd23b), 0 4px 0 rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.7); }
  .banner.unlock .b-sub { color: var(--accent,#ffe9a8); font-size: clamp(22px,5vw,38px);
    text-shadow: 0 0 14px var(--accent,#ffd23b), 0 2px 10px rgba(0,0,0,0.8); }
  .banner.unlock { animation: bannerPop 5s cubic-bezier(.2,1.4,.4,1) forwards; }
  /* New daily record — the quest celebration's big brother, in record gold.
     The headline is long (two stars and 11 letters) and the whole banner is
     nowrap, so the title tracks the viewport at a gentler rate than the shorter
     headlines do, and the sub-line may wrap. Otherwise both ran off the edges
     of a phone or a tablet. */
  .banner.record .b-title { font-size: clamp(26px,7.4vw,88px); color: #fff;
    text-shadow: 0 0 20px var(--accent,#ffd23b), 0 0 46px var(--accent,#ffd23b),
      0 4px 0 rgba(150,80,0,0.85), 0 8px 24px rgba(0,0,0,0.65); }
  .banner.record .b-sub { color: var(--accent,#ffe9a8); font-size: clamp(17px,3.6vw,32px);
    white-space: normal; text-shadow: 0 0 14px rgba(255,210,59,0.7), 0 2px 10px rgba(0,0,0,0.8); }
  .banner.record { animation: bannerPop 5.4s cubic-bezier(.2,1.4,.4,1) forwards; }
  .banner.equipped-msg .b-title { font-size: clamp(26px,6vw,52px); color: #eafff1;
    text-shadow: 0 0 16px var(--accent,#9bf0bd), 0 4px 0 rgba(10,60,30,0.7), 0 8px 22px rgba(0,0,0,0.6); }
  .banner.equipped-msg .b-sub { color: var(--accent,#bff0d4); }
  .banner.equipped-msg { animation: bannerPop 2.0s cubic-bezier(.2,1.4,.4,1) forwards; }
  /* Centering is handled by .banner-stack, so the pop only scales/rotates/drifts
     — no translate(-50%,…), which would fight the flex layout. The bounce stays
     snappy (done by ~14%) and full opacity HOLDS to 90%, so at a 5s duration the
     text sits readable for ~4.5s before a quick fade. */
  @keyframes bannerPop {
    0%{ transform: scale(0.2) rotate(-8deg); opacity:0 }
    6%{ transform: scale(1.18) rotate(2deg); opacity:1 }
    10%{ transform: scale(0.96) rotate(-1deg) }
    14%{ transform: scale(1.04) rotate(0deg) }
    90%{ transform: scale(1) rotate(0deg); opacity:1 }
    100%{ transform: translateY(-14px) scale(0.92); opacity:0 } }

  .confetti { position: absolute; top: -24px; width: var(--sz); height: var(--sz); background: var(--c);
    border-radius: 2px; opacity: 0.95; will-change: transform;
    animation: confFall var(--dur) linear var(--delay) forwards; }
  .confetti.gem { border-radius: 3px 3px 4px 4px; transform: rotate(45deg);
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.7); }
  @keyframes confFall {
    0%{ transform: translate(0,0) rotate(0deg); opacity:1 }
    100%{ transform: translate(calc(var(--dx) * 22vw), 108vh) rotate(var(--rot)); opacity:0.9 } }

  .toast { position: absolute; top: 110px; right: 14px; background: rgba(40,16,20,0.9); color: #ffd0d0;
    font-weight: 800; font-size: 14px; padding: 9px 14px; border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.5);
    animation: toastAnim 1.8s ease forwards; }
  @keyframes toastAnim { 0%{opacity:0;transform:translateY(-8px)} 12%{opacity:1;transform:translateY(0)}
    80%{opacity:1} 100%{opacity:0;transform:translateY(-8px)} }

  /* ---- Parent dashboard ---- */
  /* The toggle is deliberately quiet: a small translucent serif monogram tucked in
     the bottom-left corner — no pulse, no color pop, just a soft brighten on hover. */
  .parent-toggle { position: fixed; left: 12px; bottom: max(12px, env(safe-area-inset-bottom));
    pointer-events: auto; cursor: pointer; border: none; width: 30px; height: 30px; border-radius: 50%;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 600; font-size: 15px; line-height: 1;
    color: #cfc6e8; background: rgba(20,16,40,0.45); backdrop-filter: blur(4px);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.10); opacity: 0.4;
    transition: opacity .2s ease, box-shadow .2s ease; }
  .parent-toggle:hover, .parent-toggle:focus-visible { opacity: 0.95;
    box-shadow: inset 0 0 0 1px rgba(255,233,168,0.35); }

  .parent-dash { position: fixed; inset: 0; z-index: 60; pointer-events: none;
    background: rgba(10,7,22,0.78); backdrop-filter: blur(10px);
    display: flex; align-items: stretch; justify-content: center;
    opacity: 0; visibility: hidden; transition: opacity .22s ease, visibility .22s; }
  .parent-dash.open { pointer-events: auto; opacity: 1; visibility: visible; }
  .pd-frame { width: min(880px, 94vw); margin: clamp(10px, 3vh, 28px) auto;
    display: flex; flex-direction: column; min-height: 0;
    background: rgba(18,14,34,0.92); border-radius: 20px; overflow: hidden;
    box-shadow: 0 18px 60px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,233,168,0.16); }
  .pd-head { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
    padding: 16px 18px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .pd-title { color: #ffe9a8; font-weight: 900; font-size: clamp(20px, 4vw, 26px); letter-spacing: .3px; }
  .pd-sub { color: #b9b0d4; font-weight: 600; font-size: 13px; margin-top: 2px; }
  .pd-close { flex: none; pointer-events: auto; cursor: pointer; border: none; width: 40px; height: 40px;
    border-radius: 50%; font-size: 17px; color: #cfc6e8; background: rgba(255,255,255,0.08);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1); transition: background .15s ease, color .15s ease; }
  .pd-close:hover { background: rgba(255,255,255,0.16); color: #fff; }
  .pd-body { overflow-y: auto; padding: 16px 18px 24px; }
  .pd-note { color: #cfc6e8; font-weight: 700; font-size: 15px; text-align: center; padding: 34px 12px; }

  /* Crazy Coin balance + redeem control (grown-ups only). */
  .pd-coins { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; margin-bottom: 18px;
    background: linear-gradient(160deg, rgba(255,210,60,0.12), rgba(255,150,30,0.07));
    box-shadow: inset 0 0 0 1px rgba(255,210,120,0.3); }
  .pd-coins-info { flex: 1; min-width: 0; }
  .pd-coins-count { color: #ffd9a0; font-weight: 900; font-size: 15.5px; }
  .pd-coins-count b { color: #ffe9a8; font-variant-numeric: tabular-nums; }
  .pd-coins-sub { color: #b9b0d4; font-weight: 600; font-size: 12px; line-height: 1.35; margin-top: 2px; }
  .pd-redeem { flex: none; pointer-events: auto; cursor: pointer; border: none; font-family: inherit; font-weight: 800;
    font-size: 12.5px; padding: 8px 14px; border-radius: 999px; color: #5a3a00;
    background: linear-gradient(160deg,#ffe27a,#ffb01f);
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.7), 0 3px 0 #b96a00; transition: transform .08s; }
  .pd-redeem:active { transform: translateY(2px); box-shadow: inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 0 #b96a00; }
  .pd-redeem:disabled { background: rgba(255,255,255,0.14); color: #cfc6e8; cursor: not-allowed; opacity: .7; box-shadow: none; }

  .pd-domain { margin-bottom: 22px; }
  .pd-domain:last-child { margin-bottom: 4px; }
  .pd-domain-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
    margin-bottom: 10px; }
  .pd-domain-name { color: #ffd9a0; font-weight: 900; font-size: 16.5px; letter-spacing: .3px; }
  .pd-domain-tally { color: #b9b0d4; font-weight: 700; font-size: 12.5px; flex: none; }
  .pd-chain { display: flex; flex-direction: column; }

  .pd-topic { display: flex; gap: 12px; padding-bottom: 10px; }
  .pd-topic:last-child { padding-bottom: 0; }
  .pd-rail { flex: none; width: 26px; display: flex; flex-direction: column; align-items: center; }
  .pd-node { flex: none; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; font-weight: 900; font-size: 13px; color: #cfc6e8;
    background: rgba(255,255,255,0.10); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14); }
  .pd-link { flex: 1; width: 2px; min-height: 12px; margin-top: 4px; border-radius: 2px;
    background: rgba(255,255,255,0.12); }
  .pd-card { flex: 1; min-width: 0; padding: 9px 12px 10px; border-radius: 12px;
    background: rgba(255,255,255,0.05); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }
  .pd-top { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
  .pd-kid { color: #fff; font-weight: 800; font-size: 15.5px; line-height: 1.15; }
  .pd-badge { flex: none; font-weight: 800; font-size: 11px; letter-spacing: .4px; text-transform: uppercase;
    padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,0.14); color: #cfc6e8; }
  .pd-tag { flex: none; color: #b9b0d4; font-weight: 700; font-size: 12px; padding: 3px 8px;
    border-radius: 999px; background: rgba(255,255,255,0.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.07); }
  .pd-fluent { color: #8be9ff; }
  .pd-name { color: #b9b0d4; font-weight: 600; font-size: 12px; line-height: 1.25; margin-top: 2px; }
  .pd-ask { margin-top: 6px; color: #cfc6e8; font-weight: 600; font-size: 12.5px; line-height: 1.35; }
  .pd-ask-label { color: #ffe9a8; font-weight: 800; font-style: normal; }
  .pd-ask em { font-style: italic; }

  /* State accents mirror the game's progress colors: quest-green for mastered,
     durability-amber for practicing, neutral for ready, dimmed for locked. */
  .pd-topic.mastered .pd-node { background: linear-gradient(160deg,#9bf0bd,#4fd089); color: #0a2417;
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.5), 0 0 8px rgba(46,230,160,0.35); }
  .pd-topic.mastered .pd-badge { background: linear-gradient(160deg,#9bf0bd,#4fd089); color: #0a2417; }
  .pd-topic.mastered .pd-card { box-shadow: inset 0 0 0 1px rgba(120,230,160,0.28); }
  .pd-topic.mastered .pd-link { background: rgba(79,208,137,0.45); }
  .pd-topic.practicing .pd-node { background: linear-gradient(160deg,#ffe27a,#ffab2e); color: #5a3a00;
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.55), 0 0 8px rgba(255,180,50,0.3); }
  .pd-topic.practicing .pd-badge { background: linear-gradient(160deg,#ffe27a,#ffab2e); color: #5a3a00; }
  .pd-topic.practicing .pd-card { box-shadow: inset 0 0 0 1px rgba(255,210,120,0.24); }
  .pd-topic.locked { opacity: 0.55; }
  .pd-topic.locked .pd-node { font-size: 12px; background: rgba(255,255,255,0.06); }
  .pd-topic.locked .pd-kid { color: #cfc6e8; }

  /* ---- Daily record stats panel ---- */
  .stats-dash { position: fixed; inset: 0; z-index: 60; pointer-events: none;
    background: rgba(10,7,22,0.78); backdrop-filter: blur(10px);
    display: flex; align-items: stretch; justify-content: center;
    opacity: 0; visibility: hidden; transition: opacity .22s ease, visibility .22s; }
  .stats-dash.open { pointer-events: auto; opacity: 1; visibility: visible; }
  .sd-frame { width: min(720px, 94vw); margin: clamp(10px, 3vh, 28px) auto;
    display: flex; flex-direction: column; min-height: 0;
    background: rgba(18,14,34,0.94); border-radius: 20px; overflow: hidden;
    box-shadow: 0 18px 60px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,210,59,0.24); }
  .sd-head { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
    padding: 16px 18px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .sd-titles { min-width: 0; }
  .sd-title { color: #ffe9a8; font-weight: 900; font-size: clamp(20px, 4.4vw, 27px); letter-spacing: .3px; }
  .sd-sub { color: #ffd166; font-weight: 700; font-size: clamp(13px, 2.8vw, 15px); margin-top: 3px; line-height: 1.3; }
  .sd-close { flex: none; pointer-events: auto; cursor: pointer; border: none; width: 44px; height: 44px;
    border-radius: 50%; font-size: 17px; color: #cfc6e8; background: rgba(255,255,255,0.08);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1); transition: background .15s ease, color .15s ease; }
  .sd-close:hover { background: rgba(255,255,255,0.16); color: #fff; }
  .sd-close:focus-visible { outline: 3px solid #ffe9a8; outline-offset: 2px; }
  .sd-body { overflow-y: auto; padding: 16px 18px 24px; }
  .sd-note { color: #cfc6e8; font-weight: 700; font-size: 15px; text-align: center; padding: 34px 12px; }
  .sd-section { margin-bottom: 20px; }
  .sd-section:last-child { margin-bottom: 0; }
  .sd-section-head { color: #ffd9a0; font-weight: 900; font-size: 14.5px; letter-spacing: .3px;
    margin-bottom: 10px; }

  /* The graph: one column per day. Height carries the shape, but every column
     also prints its count, its date, and (for today / the best day) a word — so
     it reads without relying on colour. */
  .sd-chart { display: flex; align-items: flex-end; justify-content: space-between; gap: clamp(2px, 1vw, 7px);
    padding: 8px 8px 6px; border-radius: 14px; background: rgba(255,255,255,0.04);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }
  .sd-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .sd-count { font-weight: 800; font-size: clamp(9px, 2.2vw, 12px); color: #cfc6e8;
    font-variant-numeric: tabular-nums; line-height: 1; }
  .sd-track { width: 100%; height: clamp(80px, 20vh, 140px); display: flex; align-items: flex-end;
    border-radius: 5px; background: rgba(255,255,255,0.05); }
  .sd-fill { width: 100%; border-radius: 5px;
    background: linear-gradient(180deg,#8be9ff,#4dabf7); box-shadow: 0 0 8px rgba(77,171,247,0.4);
    transition: height .45s cubic-bezier(.3,1,.5,1); }
  .sd-tick { font-weight: 700; font-size: clamp(8px, 2vw, 11px); color: #9d94bd;
    font-variant-numeric: tabular-nums; line-height: 1; }
  .sd-tag { font-weight: 900; font-size: clamp(7px, 1.8vw, 9.5px); letter-spacing: .2px; line-height: 1;
    padding: 2px 4px; border-radius: 5px; white-space: nowrap;
    background: rgba(255,255,255,0.12); color: #e6dfff; }
  .sd-col.today .sd-fill { background: linear-gradient(180deg,#9bf0bd,#2ee6a0); box-shadow: 0 0 10px rgba(46,230,160,0.55); }
  .sd-col.today .sd-count, .sd-col.today .sd-tick { color: #9bf0bd; }
  .sd-col.today .sd-tag { background: rgba(46,230,160,0.25); color: #d6ffe9; }
  .sd-col.best .sd-fill { background: linear-gradient(180deg,#fff3b0,#ffb01f); box-shadow: 0 0 12px rgba(255,190,50,0.6); }
  .sd-col.best .sd-count, .sd-col.best .sd-tick { color: #ffd23b; }
  .sd-col.best .sd-tag { background: rgba(255,210,59,0.28); color: #fff3b0; }

  .sd-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 9px; }
  .sd-tile { padding: 10px 12px 11px; border-radius: 13px; background: rgba(255,255,255,0.05);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.07); }
  .sd-tile-value { color: #fff; font-weight: 900; font-size: 26px; line-height: 1;
    font-variant-numeric: tabular-nums; }
  .sd-tile-label { color: #ffe9a8; font-weight: 800; font-size: 12.5px; margin-top: 4px; }
  .sd-tile-hint { color: #b9b0d4; font-weight: 600; font-size: 11.5px; line-height: 1.3; margin-top: 2px; }
  .sd-tile-record .sd-tile-value { color: #ffd23b; }
  .sd-tile-today .sd-tile-value { color: #9bf0bd; }
  .sd-fineprint { margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);
    color: #9d94bd; font-weight: 600; font-size: 11.5px; line-height: 1.45; }

  @media (max-width: 560px) {
    .record-chip { padding: 5px 10px; gap: 7px; }
    .record-chip .rc-today { font-size: 13.5px; }
    .record-chip .rc-today b { font-size: 17px; }
    .sd-frame { width: 100vw; margin: 0; border-radius: 0; }
    .sd-body { padding: 12px 12px 20px; }
    .status { gap: 6px; }
    .collection { font-size: 19px; padding: 6px 12px 5px; min-width: 72px; }
    .buy-shield { font-size: 12px; padding: 6px 9px; }
    .quests { top: 112px; }
    .shop-toggle { top: 64px; right: 66px; }
    .shop { top: 112px; }
    .shop-btn { min-height: 44px; }
    .pd-frame { width: 100vw; margin: 0; border-radius: 0; }
    .pd-body { padding: 12px 12px 20px; }
  }
  /* He asked his device for less motion — so no flashing, no falling confetti,
     no bouncing headlines. The celebrations still HAPPEN; they just hold still
     and stay readable. !important because the per-kind banner rules
     (.banner.milestone, .banner.record, …) are more specific than this one, and
     an accessibility preference has to win. */
  @media (prefers-reduced-motion: reduce) {
    .flame .flame-emoji, .flame.mega { animation: none; }
    .screen-flash { display: none; }
    .confetti { display: none; }
    .banner { animation: none !important; opacity: 1; transform: none; }
    .record-chip.rc-pop { animation: none; }
    .hoard.shake, .hoard.burst { animation: none; }
    .quest.q-celebrate { animation: none; }
    .sd-fill { transition: none; }
    .stats-dash, .parent-dash { transition: none; }
  }
  `;
  document.head.appendChild(s);
}
