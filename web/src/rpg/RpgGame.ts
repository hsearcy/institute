import {chooseNextAdventure, renderNextAdventure, tierSelect, tierRewards, type NextAdventure} from './nextAdventureView';
import { HeroAssetLoadError } from './world/tripoHeroRuntime';
import type { Problem, Branches, RpgState, RpgSchoolId, RpgSpellId, RpgReward, Reward, State, RpgCampState, RpgEconomyResult, RpgGoal } from '@institute/shared';
import { RPG_ITEMS, RPG_REGIONS, RPG_SKILLS, RPG_SPELLS, RPG_SCHOOLS, rpgSpellSchool, rpgItemApplies, rpgSpellModifiers, rpgSpellUnlocked, rpgSpellAvailable, rpgEncounterCombat, rpgNextRelicHunt, rpgSalvageValue, rpgAnswerPower, ProblemSchema } from '@institute/shared';
import { fetchState, fetchMastery, redeemCrazyCoin, redeemDime, type Demo } from '../game/tutor';
import { speak } from '../game/audio';
import * as dungeonSound from './sound';
import { API, PROFILE } from '../game/config';
import { getRpgState, getRpgCamp, mutateRpg, resolveEncounter, attemptStatus, request, ApiError } from './api';
import { DungeonWorld } from './DungeonWorld';
import { icon, spellArt, skillArt, relicArt, escapeHtml as esc } from './icons';
import './rpg.css';
import './ui-v2.css';
import { renderSpellbookView } from './spellbookView';
import './spellbook-v3.css';
import { renderVictoryView } from './victoryView';
import './victory-v3.css';
import { renderParentJournal } from './parentJournalView';
import './parent-journal.css';
import { renderEquipmentView } from './equipmentView';
import './equipment-v3.css';
import './landscape-v3.css';
import './desktop-dock-v4.css';
import './combat-health.css';
import './progression.css';
import { renderCampWorkshop, renderPinnedGoal, lootStats, collectionLootChoice, type CampTab } from './campView';
import { nextSpellGoal } from './nextSpell';
import { skillUpgradePreview } from './skillPreview';
import { equippedForgeReady } from './forgeReady';
import { getRoomLayout } from './world/roomLayout';
import { Celebrations, type CelebrationEvent } from './Celebrations';
import './hud-rewards.css';
import { AnswerClock } from './AnswerClock';
import { newRequestId } from './requestId';
import { RPG_TUTORIAL_PAGES, RPG_TUTORIAL_VERSION, startTutorial as newTutorialState, advanceTutorial, type TutorialState } from './tutorial';
import { TutorialOverlay } from './TutorialOverlay';
import { TutorialNarrator } from './TutorialNarrator';

type Session = {
  expeditionId: string; encounterIndex: number; problem: Problem; firstAttempt: boolean | null;
  wrongCount: number; demoSeen: boolean; elapsedMs?: number; answerMs?: number; branches?: Branches; walkthrough?: boolean;
  rewardShown?: boolean;
  celebrationsShown?: boolean;
  celebrations?: CelebrationEvent[];
  pending?: { correct: boolean; assisted: boolean; solveMs: number; answerMs?: number; wrongCount?: number; spellId?: RpgSpellId };
};
const sessionKey = `institute:rpg:problem:v1:${API}:${PROFILE}`;

/** The adventure is a client of the existing tutor; it never chooses math topics. */
export class RpgGame {
  readonly world: DungeonWorld;
  private root = document.createElement('div');
  private state: RpgState | null = null;
  private session: Session | null = null;
  private branches: Promise<Branches | null> | null = null;
  private entered = '';
  private shownAt = 0;
  private _busy = true;
  private get busy(): boolean { return this._busy; }
  private set busy(value: boolean) {
    this._busy = value;
    this.root.dataset.busy = String(value);
    const cast = this.root.querySelector<HTMLButtonElement>('#rpg-cast');
    const input = this.root.querySelector<HTMLInputElement>('#rpg-answer');
    if (cast) { cast.disabled = value; cast.setAttribute('aria-busy', String(value)); }
    if (input) input.disabled = value;
    this.root.querySelectorAll<HTMLButtonElement>('.rpg-direct-help').forEach(button => { button.disabled = value; });
    const discoveryEquip = this.root.querySelector<HTMLButtonElement>('.rpg-discovery-equip');
    if (discoveryEquip) discoveryEquip.disabled = value;
    this.root.querySelectorAll<HTMLButtonElement>('[data-appearance]').forEach(button => {
      button.disabled = value || button.dataset.locked === 'true' || button.getAttribute('aria-pressed') === 'true';
    });
  }
  private disposed = false;
  private playing = false;
  private muted = false;
  private panel = '';
  private panelResolve: (() => void) | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private demoTopics = new Set<string>();
  private retryAction: (() => Promise<void>) | null = null;
  private abort = new AbortController();
  private combatLayoutObserver: ResizeObserver;
  private clockRunning = false;
  private readonly answerClock = new AnswerClock();
  private powerRefresh: ReturnType<typeof setInterval> | null = null;
  private retrying = false;
  private storageReady = false;
  private speechDepth = 0;
  private discovery: string | null = null;
  private lootLabelFrame: number | null = null;
  private healthFrame: number | null = null;
  private lootLabelUntil = 0;
  private campState: RpgCampState | null = null;
  private legacyState: State | null = null;
  private selectedTier = 1;
  private discoveryLootId: string | null = null;
  private readonly celebrations: Celebrations;
  private displayedXpLevel = 0;
  private xpGainTimer: ReturnType<typeof setTimeout> | null = null;
  private economyPending: { action: string; body: Record<string, unknown>; requestId: string } | null = null;
  private school: RpgSchoolId = 'ember';
  private focusedSkill: string | null = null;
  private skillDetailOpen = false;
  private trackedSpell: RpgSpellId | null = null;
  private tutorialState: TutorialState | null = null;
  private tutorialOverlay: TutorialOverlay | null = null;
  private tutorialHost: HTMLElement | null = null;
  private readonly tutorialNarrator = new TutorialNarrator(API);
  private tutorialInert = new Map<HTMLElement, boolean>();
  private tutorialSnapshot: {
    panel: string; html: string; wide: boolean; scroll: number; controlsHidden: boolean;
    problem: string; topic: string; school: RpgSchoolId; focusedSkill: string | null; detail: boolean;
  } | null = null;
  private favoriteSpells: Record<RpgSchoolId, RpgSpellId> = { ember: 'cleave', frost: 'frost', storm: 'storm' };

  constructor(canvas: HTMLCanvasElement) {
    document.body.classList.add('rpg-mode');
    this.world = new DungeonWorld(canvas);
    this.root.id = 'rpg-ui';
    this.root.innerHTML = `
      <header class="rpg-top"><div class="rpg-location"><span class="rpg-eyebrow">INSTITUTE <b>◆</b> THE SUNKEN VAULT</span><h1 id="rpg-region">The Embercrypt</h1><p id="rpg-room">A new adventure awaits</p></div>
      <nav aria-label="Adventure menu"><button data-action="map" title="Expeditions" aria-label="Expeditions">${icon('map')}</button><button data-action="skills" title="Skill trees" aria-label="Skill trees">${icon('tree')}<i id="rpg-points" hidden></i></button><button data-action="inventory" title="Equipment" aria-label="Equipment">${icon('bag')}</button><button id="rpg-blacksmith" data-action="blacksmith" title="Blacksmith" aria-label="Blacksmith">${icon('forge')}<i id="rpg-forge-ready" aria-hidden="true" hidden>↑</i></button><button data-action="quests" title="Quest board and camp" aria-label="Quest board and camp">${icon('ring')}</button><button data-action="sound" title="Toggle tutor voice" aria-label="Mute tutor voice">${icon('sound')}</button><button data-action="pause" title="Pause and save" aria-label="Pause and save">Ⅱ</button></nav></header>
      <div class="rpg-route" aria-label="Expedition progress" id="rpg-route"></div><button id="rpg-next-spell" class="rpg-next-spell" data-action="spell-goal" hidden></button>
      <div id="rpg-boss" class="rpg-boss" hidden><span>GUARDIAN</span><strong></strong><div role="progressbar" aria-label="Guardian health" aria-valuemin="0" aria-valuemax="36" aria-valuenow="36"><i></i></div></div>
      <div id="rpg-toast" class="rpg-toast" role="status" aria-live="polite" hidden></div><aside id="rpg-discovery" class="rpg-discovery" aria-label="New relic" aria-live="polite" hidden></aside><div id="rpg-floating-xp" class="rpg-floating-xp" aria-hidden="true"></div><div id="rpg-world-loot" class="rpg-world-loot" aria-hidden="true" hidden></div>
      <section class="rpg-controls" id="rpg-controls" hidden aria-label="Spell controls">
        <div class="rpg-hint" id="rpg-hint" role="status" hidden></div>
        <form id="rpg-answer-form" class="rpg-answer-panel" autocomplete="off"><div class="rpg-question"><span id="rpg-topic" class="rpg-eyebrow">POWER YOUR SPELL</span><label for="rpg-answer" id="rpg-problem">Preparing your next spell…</label></div><input id="rpg-answer" aria-label="Your answer" inputmode="none" autocomplete="off" maxlength="3" pattern="[0-9]*" type="text"><button class="rpg-primary" id="rpg-cast" type="submit">Unleash <span id="rpg-power">100%</span></button><div class="rpg-help-buttons"><button type="button" data-action="hear" aria-label="Read problem aloud" title="Hear the problem">${icon('sound')}</button><button type="button" data-action="explain" class="rpg-direct-help">${icon('help')}<span>Hint</span></button><button type="button" data-action="walkthrough" class="rpg-direct-help"><span>I don't know</span></button><button type="button" data-action="keypad" aria-label="Toggle number pad" title="Number pad">⌨</button></div></form>
        <div id="rpg-keypad" class="rpg-keypad" hidden>${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(n => `<button type="button" data-digit="${n}" aria-label="${n === '⌫' ? 'Delete digit' : n === '✓' ? 'Submit answer' : n}">${n}</button>`).join('')}</div>
        <footer class="rpg-hotbar"><div class="rpg-hud-art" aria-hidden="true"></div><div class="rpg-level-orb"><span>LEVEL</span><strong id="rpg-level">1</strong></div><div class="rpg-spellbar" id="rpg-spellbar"></div><span class="rpg-compact-spell-name" id="rpg-compact-spell-name" aria-hidden="true"></span><button class="rpg-gear-button" data-action="inventory" aria-label="Open equipment">${icon('sword')}<span id="rpg-equipped">Equipment</span></button><button class="rpg-magic-orb" data-action="spellbook" aria-label="Open spellbook"><span>SPELLS</span><strong id="rpg-spell-count">2</strong><small>Spellbook · B</small></button></footer>
        <div class="rpg-xp"><div class="rpg-xp-heading"><strong id="rpg-xp-next">Next: Level 2</strong><span id="rpg-xp-label">0 / 90 XP</span></div><div class="rpg-xp-track" id="rpg-xp-track" role="progressbar" aria-label="Experience toward next level" aria-valuemin="0" aria-valuemax="90" aria-valuenow="0"><i id="rpg-xp-fill"></i><span id="rpg-xp-gain" aria-hidden="true"></span></div></div>
      </section>
      <div class="rpg-connection" id="rpg-connection" hidden role="alert"><span>Reconnecting to your adventure…</span><button data-action="retry">Try again</button></div>
      <div id="rpg-overlay" class="rpg-overlay" hidden><section class="rpg-dialog" role="dialog" aria-modal="true" aria-labelledby="rpg-dialog-title" tabindex="-1"><button class="rpg-dialog-close" data-action="close" aria-label="Close">×</button><div id="rpg-dialog-content"></div></section></div>
      <button class="rpg-parent" data-action="parent">Parent journal</button><span id="rpg-save-status" class="rpg-save-status">◆ Adventure saved on your server</span>`;
    this.celebrations = new Celebrations(this.root, {
      soundEnabled: () => !this.muted,
      onStart: event => { if (event.kind === 'level') this.root.classList.add('rpg-level-celebrating'); },
      onEnd: event => { if (event.kind === 'level') this.root.classList.remove('rpg-level-celebrating'); },
    });
    const health = document.createElement('div'); health.id = 'rpg-health-bars';
    health.innerHTML = Array.from({ length: 10 }, (_, i) => `<div class="rpg-enemy-health" data-enemy-health="enemy-${i}" role="img" hidden><i></i></div>`).join('');
    this.root.append(health);
    document.querySelector('#app')!.append(this.root);
    this.updateEnemyHealth();
    const controls = this.root.querySelector<HTMLElement>('.rpg-controls')!;
    const route = this.root.querySelector<HTMLElement>('.rpg-route')!;
    const updateCombatSafeArea = () => {
      this.positionToast();
      const origin = canvas.getBoundingClientRect().top;
      const boss = this.el('rpg-boss');
      const top = Math.max(route.getBoundingClientRect().bottom, boss.hidden ? 0 : boss.getBoundingClientRect().bottom);
      this.world.setCombatSafeArea(top + 14 - origin, controls.getBoundingClientRect().top - 14 - origin);
    };
    this.combatLayoutObserver = new ResizeObserver(updateCombatSafeArea);
    this.combatLayoutObserver.observe(controls); this.combatLayoutObserver.observe(route); this.combatLayoutObserver.observe(this.el('rpg-boss'));
    this.root.addEventListener('click', this.onClick, { signal: this.abort.signal });
    this.root.addEventListener('change', event => {
      const select = event.target as HTMLSelectElement;
      if (select.id === 'rpg-map-tier') {
        this.selectedTier = Number(select.value);
        this.el('rpg-dialog-content').querySelectorAll<HTMLButtonElement>('[data-region]').forEach(button => { button.dataset.tier = String(this.selectedTier); });
        this.el('rpg-dialog-content').querySelector('.rpg-tier-reward')!.textContent = `${tierRewards(this.selectedTier)} Lower tiers have easier enemies and weaker item rolls.`;
      }
      if (select.id === 'rpg-next-tier' && this.nextAdventure && this.state) {
        this.nextAdventure.tier = Number(select.value);
        this.el('rpg-next-adventure').querySelector('.rpg-tier-reward')!.textContent = tierRewards(this.nextAdventure.tier);
      }
    }, { signal: this.abort.signal });
    this.el<HTMLFormElement>('rpg-answer-form').addEventListener('submit', e => { e.preventDefault(); void this.submit(); }, { signal: this.abort.signal });
    this.el<HTMLInputElement>('rpg-answer').addEventListener('input', e => {
      const input = e.target as HTMLInputElement;
      input.value = input.value.replace(/\D/g, '').slice(0,3); this.entered = input.value; this.saveSession();
    }, { signal: this.abort.signal });
    document.addEventListener('keydown', this.onKey, { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopClock(); this.saveSession();
        if (this.playing && !this.panel && !this.busy && !this.tutorialState) this.showPause();
      } else this.startClock();
    }, { signal: this.abort.signal });
    window.addEventListener('pagehide', () => { this.stopClock(); this.saveSession(); }, { signal: this.abort.signal });
    window.addEventListener('resize', () => { this.world.resize(); updateCombatSafeArea(); this.drawSkillLinks(); if (this.tutorialState) this.showTutorialPage(); }, { signal: this.abort.signal });
    this.muted = localStorage.getItem('institute:rpg:muted') === 'true';
    try {
      const favorites = JSON.parse(localStorage.getItem(`${sessionKey}:favorites`) ?? '{}');
      for (const school of RPG_SCHOOLS) {
        const spell = RPG_SPELLS.find(spell => spell.id === favorites[school.id] && spell.school === school.id);
        if (spell) this.favoriteSpells[school.id] = spell.id;
      }
    } catch { /* Cosmetic favorites can safely use their defaults. */ }
    const tracked = localStorage.getItem(`${sessionKey}:spell-goal`);
    this.trackedSpell = RPG_SPELLS.find(spell => spell.id === tracked)?.id ?? null;
    try { this.economyPending = JSON.parse(sessionStorage.getItem(`${sessionKey}:economy`) ?? 'null'); } catch { /* No pending purchase. */ }
    this.updateSound();
    this.powerRefresh = setInterval(() => this.updatePower(), 200);
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T { return this.root.querySelector<T>(`#${id}`)!; }
  async start(): Promise<void> {
    this.world.start();
    let modelsReady: Promise<void> | undefined;
    this.showDialog('loading', '<div class="rpg-seal">◆</div><p class="rpg-eyebrow">THE SUNKEN VAULT</p><h2 id="rpg-dialog-title">Opening the gates</h2><p>Finding your adventure…</p>');
    await this.runSafely(async () => {
      await (modelsReady ??= this.world.load().catch(error => { modelsReady = undefined; throw error; }));
      this.state = await getRpgState();
      this.selectedTier = this.state.dungeonTier ?? 1;
      const [camp, legacy] = await Promise.all([getRpgCamp().catch(() => null), fetchState()]);
      this.campState = camp; this.legacyState = legacy;
      this.restoreSession(); this.renderState(); this.busy = false; this.showCamp();
      try { if (!localStorage.getItem(this.tutorialKey)) this.launchTutorial(); } catch { /* Replay remains available when local storage is blocked. */ }
      if (this.economyPending) this.toast('A camp purchase is waiting to reconnect. Open the merchant or blacksmith to finish saving it.');
    });
  }
  private restoreSession(): void {
    this.stopClock();
    try {
      const saved = JSON.parse(localStorage.getItem(sessionKey) ?? 'null') as Session | null;
      const e = this.state?.expedition;
      const matching = saved && e && saved.expeditionId === e.id && !e.cleared;
      // A reward may have committed just before a lost response. Keep that
      // pending transition long enough to replay its receipt and adaptive branch.
      const previousPending = matching && saved.pending && (saved.pending.correct || saved.pending.assisted)
        && saved.encounterIndex + 1 === e.encounterIndex;
      if (matching && (saved.encounterIndex === e.encounterIndex || previousPending)
        && ProblemSchema.safeParse(saved.problem).success
        && [null, true, false].includes(saved.firstAttempt)
        && Number.isInteger(saved.wrongCount) && saved.wrongCount >= 0 && saved.wrongCount <= 3) {
        this.session = saved;
        this.session.elapsedMs = Math.max(0, Number(saved.elapsedMs) || 0);
        this.session.answerMs = Math.max(0, Number(saved.answerMs ?? saved.elapsedMs) || 0);
      } else { this.session = null; localStorage.removeItem(sessionKey); }
    } catch { this.session = null; }
    this.answerClock.restore(this.session?.answerMs ?? 0);
    this.branches = null; this.storageReady = true;
  }
  private checkpointClock(): void {
    if (this.session) this.session.answerMs = this.answerClock.elapsed();
    if (!this.clockRunning || !this.session) return;
    const now = performance.now();
    this.session.elapsedMs = (this.session.elapsedMs ?? 0) + Math.max(0, now - this.shownAt);
    this.shownAt = now;
  }
  private stopClock(): void { this.answerClock.stop(); this.checkpointClock(); this.clockRunning = false; }
  private startClock(): void {
    if (this.disposed || this.tutorialState || this.busy || this.panel || !this.playing || document.hidden || !this.session || this.session.pending || this.session.walkthrough) return;
    if (!this.speechDepth) this.answerClock.start();
    if (this.clockRunning || this.session.firstAttempt !== null) return;
    this.shownAt = performance.now(); this.clockRunning = true;
  }
  private saveSession(): void {
    if (!this.storageReady) return;
    this.checkpointClock();
    if (this.session) localStorage.setItem(sessionKey, JSON.stringify(this.session));
    else localStorage.removeItem(sessionKey);
  }
  private primeBranches(session: Session): void {
    this.branches = session.branches ? Promise.resolve(session.branches)
      : request<Branches>('/tutor/branches', { current: session.problem }).then(branches => {
        if (this.session === session) { session.branches = branches; this.saveSession(); }
        return branches;
      }).catch(() => null);
  }
  private setEncounter(index = this.state?.expedition?.encounterIndex): void {
    if (index === undefined || !this.state?.expedition) return;
    const combat = rpgEncounterCombat(this.state, index);
    this.world.setEncounter(index, this.state.expedition.regionId, combat.enemies.length, combat.enemies);
  }
  private renderState(): void {
    const s = this.state; if (!s || this.disposed) return;
    const expedition = s.expedition;
    const region = RPG_REGIONS.find(r => r.id === expedition?.regionId) ?? RPG_REGIONS[0];
    const roomNames = Array.from({length:6}, (_, index) => getRoomLayout(index, region.id).name);
    this.el('rpg-region').textContent = region.name;
    this.el('rpg-room').textContent = expedition && !expedition.cleared ? `${roomNames[expedition.encounterIndex]} · ${expedition.encounterIndex + 1} / ${expedition.encountersTotal}` : region.subtitle;
    this.el('rpg-route').innerHTML = Array.from({ length: 6 }, (_, i) => `<span class="${expedition && (expedition.cleared || i < expedition.encounterIndex) ? 'complete' : i === expedition?.encounterIndex ? 'current' : ''}" title="${roomNames[i]}">${i === 5 ? '♜' : '◆'}</span>`).join('');
    this.el('rpg-level').textContent = String(s.level);
    const xpFill = this.el('rpg-xp-fill');
    const previousWidth = xpFill.style.width || '0%';
    const nextWidth = `${100 * s.xpIntoLevel / s.xpForNextLevel}%`;
    xpFill.style.width = nextWidth;
    if (this.displayedXpLevel && s.level > this.displayedXpLevel && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      xpFill.getAnimations().forEach(animation => animation.cancel());
      xpFill.animate([
        { width: previousWidth, offset: 0 }, { width: '100%', offset: .35 },
        { width: '100%', offset: .55 }, { width: '0%', offset: .56 }, { width: nextWidth, offset: 1 },
      ], { duration: 1300, easing: 'ease-in-out' });
    }
    this.displayedXpLevel = s.level;
    this.el('rpg-xp-label').textContent = `${s.xpIntoLevel} / ${s.xpForNextLevel} XP`;
    this.el('rpg-xp-next').textContent = `Next: Level ${s.level + 1}`;
    this.el('rpg-xp-track').setAttribute('aria-valuenow', String(s.xpIntoLevel));
    this.el('rpg-xp-track').setAttribute('aria-valuemax', String(s.xpForNextLevel));
    this.el('rpg-points').hidden = s.skillPoints === 0;
    this.el('rpg-points').textContent = String(s.skillPoints);
    this.favoriteSpells[rpgSpellSchool(s.selectedSpellId)] = s.selectedSpellId;
    for (const school of RPG_SCHOOLS) if (!rpgSpellAvailable(s, this.favoriteSpells[school.id])) this.favoriteSpells[school.id] = RPG_SPELLS.find(spell => spell.school === school.id && rpgSpellAvailable(s, spell.id))?.id ?? school.id;
    localStorage.setItem(`${sessionKey}:favorites`,JSON.stringify(this.favoriteSpells));
    this.el('rpg-spell-count').textContent = String(RPG_SPELLS.filter(spell => rpgSpellAvailable(s, spell.id)).length);
    this.el('rpg-compact-spell-name').textContent = RPG_SPELLS.find(spell => spell.id === s.selectedSpellId)!.name;
    this.el('rpg-spellbar').innerHTML = (['ember','frost','storm'] as RpgSchoolId[]).map((school, i) => {
      const favorite = this.favoriteSpells[school];
      const spell = RPG_SPELLS.find(entry => entry.id === favorite && entry.school === school && rpgSpellAvailable(s, entry.id))
        ?? RPG_SPELLS.find(entry => entry.school === school && rpgSpellAvailable(s, entry.id))
        ?? RPG_SPELLS.find(entry => entry.id === school)!;
      const unlocked = rpgSpellAvailable(s, spell.id);
      return `<button data-spell="${spell.id}" class="rpg-spell ${s.selectedSpellId === spell.id ? 'selected' : ''} ${!unlocked ? 'locked' : ''}" style="--spell-color:${spell.color}" aria-label="${spell.name}${!unlocked ? ', unlock in skill tree' : !rpgSpellUnlocked(spell.id, s.skills) ? ', from relic while equipped' : ''}" aria-pressed="${s.selectedSpellId === spell.id}">${spellArt(spell.id)}<span>${spell.name}</span>${!unlocked ? `<i class="rpg-spell-lock">${icon('lock')}</i>` : ''}<kbd>${['Q','W','E'][i]}</kbd></button>`;
    }).join('') + `<button class="rpg-spell rpg-tree-button" data-action="skills" aria-label="Skill trees">${icon('tree')}<span>Skill trees</span>${s.skillPoints ? `<i>${s.skillPoints} new</i>` : '<kbd>K</kbd>'}</button>`;
    const item = RPG_ITEMS.find(i => i.id === s.equippedItemId)!;
    this.el('rpg-equipped').textContent = item.name;
    const forgeReady = equippedForgeReady(s, this.campState?.gems ?? this.legacyState?.gems);
    const blacksmith = this.el('rpg-blacksmith');
    this.el('rpg-forge-ready').hidden = !forgeReady;
    blacksmith.classList.toggle('upgrade-ready', forgeReady);
    blacksmith.title = forgeReady ? `Blacksmith: Upgrade available for ${item.name}` : 'Blacksmith';
    blacksmith.setAttribute('aria-label', blacksmith.title);
    const gear = this.root.querySelector('.rpg-gear-button')!;
    gear.querySelector('.rpg-icon,.rpg-relic-art')?.remove();
    gear.insertAdjacentHTML('afterbegin',relicArt(item.id));
    this.world.setEquipment(s.equippedItemId);
    this.world.setAppearance(s.appearanceId);
    this.renderSpellGoal();
    const boss = !!expedition && !expedition.cleared && expedition.encounterIndex === 5;
    this.el('rpg-boss').hidden = !boss || !this.playing;
    this.el('rpg-boss').querySelector('strong')!.textContent = region.bossName;
  }

  private spellGoalCard(compact = false): string {
    if (!this.state) return '';
    const goal = nextSpellGoal(this.state, this.trackedSpell);
    if (!goal) return '';
    const step = goal.learned ? 'Learned · Try it now' : goal.ready ? `Learn ${goal.next!.name} · 1 point` : `${goal.xpRemaining} XP to the next step`;
    return `${spellArt(goal.spell.id)}<span><small>${goal.learned ? 'NEW MAGIC' : 'YOUR NEXT SPELL'}</small><strong>${goal.spell.name}</strong><span>${step}</span>${!compact && goal.next && !goal.ready ? `<em>Next: ${goal.next.name} · 1 skill point</em>` : ''}</span>`;
  }
  private renderSpellGoal(): void {
    const card = this.el<HTMLButtonElement>('rpg-next-spell');
    const pinned = renderPinnedGoal(this.state!, this.campState, true);
    if (pinned) {
      const wrapper = document.createElement('div'); wrapper.innerHTML = pinned;
      card.innerHTML = wrapper.firstElementChild!.innerHTML;
      card.dataset.action = (wrapper.firstElementChild as HTMLElement).dataset.action;
    } else { card.innerHTML = this.spellGoalCard(true); card.dataset.action = 'spell-goal'; }
    card.hidden = !card.innerHTML;
  }
  private trackSpell(spellId: RpgSpellId | null): void {
    this.trackedSpell = spellId;
    if (spellId) localStorage.setItem(`${sessionKey}:spell-goal`, spellId);
    else localStorage.removeItem(`${sessionKey}:spell-goal`);
    this.renderSpellGoal();
  }
  private showSpellGoal(): void {
    if (!this.state) return;
    const goal = nextSpellGoal(this.state, this.trackedSpell);
    if (!goal) { this.showSpellbook(); return; }
    if (goal.learned) {
      void this.changeLoadout('spell', { spellId: goal.spell.id }, () => { this.trackSpell(null); this.closeDialog(); }); return;
    }
    this.school = goal.spell.school; this.focusedSkill = goal.next?.id ?? goal.spell.skillId; this.showSkills();
    requestAnimationFrame(() => {
      const node = this.root.querySelector<HTMLElement>(`[data-skill-select="${goal.next?.id}"]`);
      node?.classList.add('rpg-target-skill'); node?.scrollIntoView({block:'center',behavior:'smooth'});
    });
  }

  private showCamp(): void {
    const s = this.state!;
    this.stopClock(); this.saveSession(); this.playing = false; this.el('rpg-controls').hidden = true;
    const resume = s.expedition && !s.expedition.cleared;
    if (resume) this.setEncounter();
    this.showDialog('camp', `<div class="rpg-seal">${icon('sword')}</div><p class="rpg-eyebrow">INSTITUTE PRESENTS</p><h2 id="rpg-dialog-title" class="rpg-title">The Sunken<br><em>Vault</em></h2><p class="rpg-camp-story">Ancient halls. Hidden relics.<br>A little magic goes a long way.</p><div class="rpg-camp-stats"><span>LEVEL <b>${s.level}</b></span><span>RELICS <b>${s.inventory.length}</b></span><span>GUARDIANS <b>${s.expeditionsCompleted}</b></span></div>${s.totalKills === 0 ? `<div class="rpg-starter-spells" aria-label="Your starting sword attack">${(['cleave'] as RpgSpellId[]).map(id => `<button data-spell="${id}" aria-pressed="${s.selectedSpellId === id}" class="${s.selectedSpellId === id ? 'selected' : ''}">${spellArt(id)}<span>${RPG_SPELLS.find(spell => spell.id === id)!.name}</span></button>`).join('')}</div>` : ''}${s.goal ? renderPinnedGoal(s, this.campState) : this.spellGoalCard() ? `<button class="rpg-goal-card" data-action="spell-goal">${this.spellGoalCard()}</button>` : ''}<button class="rpg-primary rpg-large" data-action="begin">${resume ? 'Continue adventure' : 'Enter the dungeon'} <span>→</span></button><button class="rpg-text-button" data-action="map">Choose an expedition</button><button class="rpg-text-button" data-action="tutorial">${icon('help')} How to play · Story & tour</button><div class="rpg-camp-menu"><button data-action="quests">${icon('ring')} Quest board</button><button data-action="merchant">◆ Merchant${this.campState ? ` · ${this.campState.gems} gems` : ''}</button><button data-action="forge">${icon('forge')} Blacksmith</button><button data-action="spellbook">${icon('storm')} Spellbook</button><button data-action="skills">${icon('tree')} Skill trees${s.skillPoints ? ` · ${s.skillPoints} new` : ''}</button><button data-action="inventory">${icon('bag')} Equipment</button><button data-action="parent">Parent journal</button></div><p class="rpg-camp-note">Solve to unleash your spells. Take all the time you need.</p>`);
  }
  private async begin(regionId?: string, tier?: number): Promise<void> {
    if (!this.state || this.busy) return;
    this.busy = true;
    await this.runSafely(async () => {
      this.state = await mutateRpg('start', { ...(regionId ? { regionId } : {}), tier: tier ?? this.selectedTier });
      this.selectedTier = this.state.dungeonTier ?? 1;
      this.closeDialog(true); this.playing = true; this.el('rpg-controls').hidden = false;
      dungeonSound.startAmbience();
      this.restoreSession(); this.renderState();
      this.setEncounter(this.session?.pending ? this.session.encounterIndex : undefined);
      if (matchMedia('(pointer: coarse)').matches) this.el('rpg-keypad').hidden = false;
      if (this.session?.pending) { this.primeBranches(this.session); await this.finishPending(); return; }
      await this.showProblem(this.session?.problem ?? await request<Problem>('/tutor/first', {}), !!this.session);
    });
  }
  private async showProblem(p: Problem, restoring = false): Promise<void> {
    if (this.disposed) return;
    this.stopClock();
    const expedition = this.state!.expedition!;
    if (!restoring) this.session = { expeditionId: expedition.id, encounterIndex: expedition.encounterIndex, problem: p, firstAttempt: null, wrongCount: 0, demoSeen: false, elapsedMs: 0, answerMs: 0 };
    this.answerClock.restore(this.session!.answerMs ?? 0);
    this.saveSession(); this.busy = true;
    const session = this.session!;
    if (p.newTopic && p.topicId && !session.demoSeen && !this.demoTopics.has(p.topicId)) {
      // Unlike the legacy convenience helper, a transport failure must not
      // silently skip the child's first worked demonstration.
      const demo = await request<Demo>('/tutor/demo', { topicId: p.topicId });
      if (this.disposed) return;
      this.showDialog('demo', `<p class="rpg-eyebrow">A NEW KIND OF MAGIC</p><h2 id="rpg-dialog-title">${esc(demo.kidLabel)}</h2><div class="rpg-demo-equation">${esc(demo.example.prompt)} = ${demo.example.answer}</div><p class="rpg-teaching-text">${esc(demo.script)}</p><button class="rpg-primary" data-action="demo-go">Let me try</button><button class="rpg-text-button" data-action="demo-hear">Hear it again</button>`);
      void this.say(demo.script);
      await new Promise<void>(resolve => { this.panelResolve = resolve; });
      if (this.disposed) return;
      session.demoSeen = true; this.demoTopics.add(p.topicId); this.saveSession();
    }
    if (this.disposed) return;
    this.closeDialog(true); this.entered = ''; this.updateAnswer();
    this.el('rpg-problem').textContent = p.prompt;
    this.el('rpg-answer-form').dataset.problemId = p.id;
    this.el('rpg-topic').textContent = p.topicLabel ?? 'POWER YOUR SPELL';
    this.el('rpg-hint').hidden = true;
    this.el<HTMLInputElement>('rpg-answer').disabled = false;
    this.el<HTMLButtonElement>('rpg-cast').disabled = false;
    this.el('rpg-answer-form').classList.remove('correct');
    this.primeBranches(session);
    if (session.walkthrough || session.wrongCount >= 3) { await this.walkthrough(); return; }
    this.busy = false;
    const previousElapsed = session.elapsedMs ?? 0;
    const narration = this.say(p.spoken);
    this.startClock(); this.updatePower();
    void narration.then(() => {
      if (this.session === session && session.firstAttempt === null && !this.entered) {
        session.elapsedMs = previousElapsed; this.shownAt = performance.now(); this.saveSession();
      }
    });
    if (!matchMedia('(pointer: coarse)').matches) this.el<HTMLInputElement>('rpg-answer').focus({ preventScroll: true });
  }
  private async nextProblem(): Promise<void> {
    const first = this.session?.firstAttempt;
    const b = await this.branches;
    const p = b ? (first ? b.right : b.wrong) : await request<Problem>('/tutor/first', {});
    await this.showProblem(p);
  }
  private updateAnswer(): void { this.el<HTMLInputElement>('rpg-answer').value = this.entered; }
  private updatePower(): void {
    if (!this.session) return;
    const pending = this.session.pending;
    const percent = rpgAnswerPower(pending?.answerMs ?? this.answerClock.elapsed(), pending?.wrongCount ?? this.session.wrongCount);
    const label = this.el('rpg-power');
    if (label.textContent !== `${percent}%`) label.textContent = `${percent}%`;
    this.el('rpg-cast').title = `Attack power: ${percent}%. Quick answers hit harder; each wrong try costs 10%.`;
  }
  private async submit(): Promise<void> {
    if (!this.session || this.busy || this.panel || !this.entered || !this.playing) return;
    this.stopClock(); this.busy = true;
    this.session.pending = { correct: Number(this.entered) === this.session.problem.answer, assisted: false, solveMs: Math.round(this.session.elapsedMs ?? 0), answerMs: Math.floor(this.session.answerMs ?? 0), wrongCount: this.session.wrongCount, spellId: this.state!.selectedSpellId };
    this.saveSession();
    await this.runSafely(() => this.finishPending());
  }
  /** Reconcile before sending: legacy attempts/retry rewards are not idempotent. */
  private async finishPending(): Promise<void> {
    const session = this.session;
    if (!session) { this.busy = false; this.showCamp(); return; }
    // A failed demonstration may already have saved the next question. Resume
    // that phase rather than trying to replay a now-absent answer submission.
    const pending = session.pending;
    if (!pending) { await this.showProblem(session.problem, true); return; }
    const p = session.problem;
    if (!this.branches) this.primeBranches(session);
    let status = await attemptStatus(p.id);
    if (!status.recorded) {
      if (pending.assisted) await request('/tutor/skip', { problemId: p.id, skill: p.skill, topicId: p.topicId, difficulty: p.difficulty });
      else {
        const attempt = await request<{ reward: Reward }>('/tutor/attempt', { problemId: p.id, skill: p.skill, topicId: p.topicId, difficulty: p.difficulty, correct: pending.correct, solveMs: pending.solveMs });
        this.recordLearningReward(attempt.reward);
      }
      status = await attemptStatus(p.id);
    }
    session.firstAttempt = status.correct ?? false;
    this.saveSession();
    if (pending.correct && !status.solved) {
      const retry = await request<{ reward: Reward }>('/reward/retry-solve', { problemId: p.id });
      this.recordLearningReward(retry.reward);
    }
    if (pending.assisted) {
      // Worked examples keep the tutor’s adaptive branch, but never resolve combat.
      // A pre-change assisted receipt may already have advanced the saved room.
      if (this.state!.expedition?.encounterIndex !== session.encounterIndex) this.setEncounter();
      await this.nextProblem();
      return;
    }
    if (pending.correct) {
      const spellId = pending.spellId ?? this.state!.selectedSpellId;
      const result = await resolveEncounter({ problemId: p.id, expeditionId: session.expeditionId, encounterIndex: session.encounterIndex, spellId, answerMs: pending.answerMs ?? pending.solveMs, wrongCount: pending.wrongCount ?? session.wrongCount });
      const item = RPG_ITEMS.find(i => i.id === this.state!.equippedItemId)!;
      const applies = rpgItemApplies(item, result.reward.spellId);
      const modifiers = rpgSpellModifiers(this.state!,result.reward.spellId);
      this.el<HTMLButtonElement>('rpg-cast').disabled = true;
      this.el<HTMLInputElement>('rpg-answer').disabled = true;
      this.el('rpg-answer-form').classList.add('correct');
      if (!session.rewardShown) {
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = null;
        this.el('rpg-toast').hidden = true;
        this.discovery = null; this.renderDiscovery();
        this.el('rpg-floating-xp').classList.remove('rpg-xp-rise');
        if (result.duplicate && result.reward.combat) {
          // A lost response can leave the fetched save ahead of this visual
          // cast. Replay its bounded, exact before-state, not the next room.
          const before = result.reward.combat.enemiesBefore;
          this.world.setEncounter(session.encounterIndex, this.state!.expedition!.regionId, before.length, before);
        }
        if (!this.muted) dungeonSound.cast(result.reward.spellId);
        await this.world.attack(result.reward.spellId, {
          combat: result.reward.combat, spellShape: result.reward.spellShape,
          echo: modifiers.includes('echo'), wide: modifiers.includes('wide'),
          burning: modifiers.includes('burn'), shards: modifiers.includes('ice-shards'),
          chains: modifiers.includes('chain'), pierce: modifiers.includes('pierce'),
          orbit: modifiers.includes('orbit'), summon: modifiers.includes('summon'),
          itemId: applies ? item.id : undefined, kills: result.reward.kills,
          drop: result.reward.item && (result.reward.loot || !result.reward.duplicateItem) ? {name:result.reward.item.name,rarity:result.reward.item.rarity} : undefined, xp:result.reward.xp,
        });
        session.rewardShown = true; this.saveSession();
      }
      this.state = result.state;
      this.renderState(); this.showReward(result.reward, session);
      this.el('rpg-save-status').textContent = '◆ Adventure saved on your server';
      if (this.state.expedition!.cleared) {
        this.session = null; this.saveSession(); this.busy = false; this.showVictory(result.reward); return;
      }
      const sameRoom = this.state.expedition!.encounterIndex === session.encounterIndex;
      if (this.state.expedition!.id !== session.expeditionId || (!sameRoom && this.state.expedition!.encounterIndex !== session.encounterIndex + 1)) {
        this.session = null; this.saveSession(); this.busy = false; this.showCamp(); return;
      }
      if (sameRoom) this.world.setCombatState(rpgEncounterCombat(this.state).enemies);
      else this.setEncounter();
      // Keep the pending receipt until showProblem durably replaces this
      // session. A failed next-problem fetch is safe to retry from here.
      await this.nextProblem();
    } else {
      session.pending = undefined; session.wrongCount = Math.min(3, session.wrongCount + 1);
      if (session.wrongCount >= 3) session.walkthrough = true;
      this.saveSession(); this.entered = ''; this.updateAnswer(); this.busy = false;
      this.hint(session.wrongCount > 1 ? (p.hint ?? 'Try a different way, or ask me to show you.') : 'Almost. Try again, or let’s work it out together.');
      if (session.wrongCount >= 3) await this.walkthrough();
      else { this.startClock(); this.updatePower(); }
    }
  }
  private showReward(reward: RpgReward, session: Session): void {
    if (!session.celebrationsShown) {
      for (const event of session.celebrations ?? []) this.celebrations.celebrate(event);
      if (reward.levelUp) this.celebrations.celebrate({
        id: `${session.problem.id}:level`, kind: 'level', title: 'LEVEL UP!', level: this.state!.level,
        subtitle: 'Your magic is growing!', reward: `+${reward.levelsGained} skill point${reward.levelsGained === 1 ? '' : 's'}`,
      });
      session.celebrationsShown = true; this.saveSession();
    }
    if (reward.item && (reward.loot || !reward.duplicateItem)) {
      this.discoveryLootId = reward.loot?.id ?? null; this.discovery = reward.item.id; this.renderDiscovery();
      const label = this.el('rpg-world-loot');
      label.textContent = reward.item.name; label.dataset.rarity = reward.item.rarity;
      this.lootLabelUntil = performance.now() + 4000;
      if (this.lootLabelFrame !== null) cancelAnimationFrame(this.lootLabelFrame);
      this.updateLootLabel();
    }
    this.el('rpg-xp-gain').textContent = `+${reward.xp} XP`;
    const xpStrip = this.root.querySelector<HTMLElement>('.rpg-xp')!;
    xpStrip.classList.remove('rpg-xp-earned');
    void xpStrip.offsetWidth; xpStrip.classList.add('rpg-xp-earned');
    if (this.xpGainTimer) clearTimeout(this.xpGainTimer);
    this.xpGainTimer = setTimeout(() => { xpStrip.classList.remove('rpg-xp-earned'); this.xpGainTimer = null; }, 2200);
    const floating = this.el('rpg-floating-xp');
    floating.textContent = `+${reward.xp} XP`;
    const position = this.world.heroScreenPosition;
    floating.style.left = `${position.x}px`; floating.style.top = `${Math.max(100,position.y-45)}px`;
    floating.classList.remove('rpg-xp-rise');
    void floating.offsetWidth; floating.classList.add('rpg-xp-rise');
    const level = reward.levelUp ? ` · Level ${this.state!.level}!` : '';
    const outcome = reward.combat && !reward.combat.encounterCleared
      ? `${reward.kills ? `${reward.kills} defeated · ` : ''}${reward.combat.remainingEnemies} enemies remain`
      : `${reward.kills} monsters defeated`;
    const compactOutcome = reward.combat && !reward.combat.encounterCleared
      ? `${reward.combat.remainingEnemies} enemies remain` : 'Room cleared';
    this.toast(`${outcome}${level}`, reward.levelUp ? 4500 : 2600, compactOutcome);
    if (!this.muted) {
      if (reward.bossDefeated) dungeonSound.boss();
      else if (reward.levelUp) { /* The queued celebration plays its fanfare. */ }
      else dungeonSound.loot();
    }
  }
  private updateLootLabel = (): void => {
    const label = this.el('rpg-world-loot');
    if (this.disposed || performance.now() > this.lootLabelUntil) { label.hidden = true; this.lootLabelFrame = null; return; }
    const position = this.world.lootScreenPosition;
    label.hidden = !position || position.y < 80 || position.y > innerHeight - 180 || position.x < 20 || position.x > innerWidth - 20;
    if (position) { label.style.left = `${position.x}px`; label.style.top = `${position.y-30}px`; }
    this.lootLabelFrame = requestAnimationFrame(this.updateLootLabel);
  };
  private updateEnemyHealth = (): void => {
    if (this.disposed) return;
    const boss = this.world.bossHealth;
    if (boss) {
      const meter = this.el('rpg-boss').querySelector<HTMLElement>('[role="progressbar"]')!;
      meter.setAttribute('aria-valuenow', String(boss.hp));
      meter.setAttribute('aria-valuemax', String(boss.maxHp));
      meter.setAttribute('aria-valuetext', `${boss.hp} of ${boss.maxHp} health`);
      (meter.firstElementChild as HTMLElement).style.width = `${100 * boss.hp / boss.maxHp}%`;
    }
    const visible = new Map((this.panel || !this.playing ? [] : this.world.enemyHealthScreenPositions).map(enemy => [enemy.id, enemy]));
    for (const bar of this.root.querySelectorAll<HTMLElement>('[data-enemy-health]')) {
      const enemy = visible.get(bar.dataset.enemyHealth!); bar.hidden = !enemy;
      if (!enemy) continue;
      bar.style.left = `${enemy.x}px`; bar.style.top = `${enemy.y}px`;
      bar.setAttribute('aria-label', `Enemy health ${enemy.hp} of ${enemy.maxHp}`);
      bar.firstElementChild!.setAttribute('style', `width:${100 * enemy.hp / enemy.maxHp}%`);
    }
    this.healthFrame = requestAnimationFrame(this.updateEnemyHealth);
  };
  private renderDiscovery(): void {
    const item = RPG_ITEMS.find(item => item.id === this.discovery);
    const panel = this.el('rpg-discovery');
    panel.hidden = !item;
    if (!item) return;
    panel.dataset.rarity = item.rarity;
    const loot = this.state?.loot?.find(entry => entry.id === this.discoveryLootId);
    panel.innerHTML = `<button data-action="dismiss-loot" class="rpg-discovery-close" aria-label="Dismiss new relic">×</button><p class="rpg-eyebrow">${item.rarity.toUpperCase()} RELIC DISCOVERED</p><div class="rpg-discovery-body">${relicArt(item.id)}<div><h3>${item.name}</h3><p>${esc(loot ? lootStats(loot, this.state!) : item.description)}</p></div></div><button class="rpg-discovery-equip" ${loot ? `data-loot-equip="${esc(loot.id)}"` : `data-discovery-item="${item.id}"`} ${this.busy ? 'disabled' : ''}>${loot ? this.state?.equippedLootId === loot.id ? '✓ Equipped' : 'Equip this roll' : this.state?.equippedItemId === item.id ? '✓ Equipped' : 'Equip this relic'}</button><small>Already saved in your equipment</small>`;
  }
  private nextAdventure: NextAdventure | null = null;
  private showVictory(reward: RpgReward): void {
    const s = this.state!; const region = RPG_REGIONS.find(r => r.id === s.expedition?.regionId)!;
    this.nextAdventure = chooseNextAdventure(s);
    this.showDialog('victory', renderVictoryView(s, reward, region.bossName, this.campState, this.nextAdventure));
  }

  private hint(text: string): void { this.el('rpg-hint').textContent = text; this.el('rpg-hint').hidden = false; }
  private async help(): Promise<void> {
    if (!this.session || this.busy) return;
    this.showDialog('help', `<p class="rpg-eyebrow">YOUR MAGIC CAN WAIT</p><h2 id="rpg-dialog-title">Let’s work it out</h2><div class="rpg-demo-equation">${esc(this.session.problem.prompt)}</div><p>You have all the time you need.</p><div class="rpg-help-choice"><button data-action="explain">${icon('help')}<strong>Give me a hint</strong><span>Help me find a way to solve it.</span></button><button data-action="walkthrough">${icon('sound')}<strong>I'm not sure yet</strong><span>Show me how, step by step.</span></button></div><button class="rpg-text-button" data-action="close">I want to try again</button>`);
  }
  private async explain(): Promise<void> {
    if (!this.session || this.busy) return; this.busy = true;
    const p = this.session.problem;
    this.showDialog('hint', '<h2 id="rpg-dialog-title">Finding a helpful hint…</h2>');
    const text = await request<{ text: string }>('/tutor/explain', { problem: p }).then(result => result.text).catch(() => null) ?? p.hint ?? 'Read the question slowly. What is it asking you to find?';
    this.busy = false; this.closeDialog(true); this.hint(text); void this.say(text);
  }
  private async walkthrough(): Promise<void> {
    if (!this.session) return;
    this.stopClock(); this.busy = true;
    const session = this.session; const p = session.problem;
    session.walkthrough = true; this.saveSession();
    this.showDialog('walkthrough', '<h2 id="rpg-dialog-title">Let’s do this together</h2><p>Preparing a worked example…</p>');
    if (session.firstAttempt === null) {
      await request('/tutor/skip', { problemId: p.id, skill: p.skill, topicId: p.topicId, difficulty: p.difficulty });
      session.firstAttempt = false; this.saveSession();
    }
    if (session.wrongCount >= 3) {
      // Identical legacy miss calculation, wrapped in an atomic per-problem
      // receipt so connection retries cannot consume a second shield.
      await request<{ reward: Reward }>('/rpg/miss', { problemId: p.id });
    }
    const text = await request<{ text: string }>('/tutor/walkthrough', { problem: p }).then(result => result.text).catch(() => null) ?? `The answer is ${p.answer}. ${p.hint ?? 'We can try another together.'}`;
    if (this.disposed) return;
    this.el('rpg-dialog-content').innerHTML = `<p class="rpg-eyebrow">LET’S LEARN THIS TOGETHER</p><h2 id="rpg-dialog-title">Here’s how</h2><div class="rpg-demo-equation">${esc(p.prompt)} <span>→ ${p.answer}</span></div><p class="rpg-teaching-text">${esc(text)}</p><button class="rpg-primary" data-action="assisted-go">Next question</button><button class="rpg-text-button" data-action="demo-hear">Hear it again</button>`;
    this.busy = false; void this.say(text);
  }

  private schoolTabs(action: string): string {
    return `<div class="rpg-school-tabs" role="group" aria-label="Magic school">${RPG_SCHOOLS.map(school => `<button data-school="${school.id}" data-view="${action}" class="${this.school === school.id ? 'active' : ''}" style="--spell-color:${school.color}" aria-pressed="${this.school === school.id}">${spellArt(school.id)}<span>${school.name}</span></button>`).join('')}</div>`;
  }
  private showSpellbook(): void {
    if (!this.state) return;
    this.showDialog('spellbook', renderSpellbookView({
      state: this.state,
      school: this.school,
      trackedSpell: this.trackedSpell,
      playing: this.playing,
      favoriteSpell: this.favoriteSpells[this.school],
    }), true);
  }
  private skillPreviewCard(skillId: string): string {
    if (!this.state) return '';
    const s = this.state, room = s.expedition && !s.expedition.cleared ? s.expedition.encounterIndex : 0;
    const previews = skillUpgradePreview(s, skillId, room);
    if (!previews?.length) return '';
    const chosen = previews.find(preview => preview.spell.id === s.selectedSpellId) ?? previews[0];
    const labels = { burn: 'burning ground', 'ice-shards': 'extra ice shards', chain: 'forked lightning', echo: 'a second strike', pierce: 'piercing splinters', wide: 'a wider sweep', orbit: 'orbiting sparks', summon: 'a second guardian' };
    const targets = `${chosen.beforeDamage} → ${chosen.afterDamage} damage · up to ${chosen.after} targets${chosen.extraTargets > 0 ? ` (+${chosen.extraTargets})` : ''}`;
    const gained = chosen.newModifiers.map(effect => labels[effect]);
    const other = previews.filter(preview => preview !== chosen && (preview.extraDamage > 0 || preview.extraTargets > 0 || preview.newModifiers.length));
    const details = gained.length ? ` Adds ${gained.join(' and ')}.` : chosen.existingModifier ? ' Its spell effect is already active.' : '';
    const alternatives = !chosen.extraDamage && !chosen.extraTargets && !gained.length && other.length ? ` Still improves ${other.map(preview => preview.spell.name).join(', ')}.` : '';
    const permanentUnlock = chosen.unlocked && RPG_SKILLS.find(skill => skill.id === skillId)?.kind === 'unlock';
    const unchanged = !chosen.extraDamage && !chosen.extraTargets && !gained.length && !other.length && !permanentUnlock;
    return `<span class="rpg-skill-preview ${unchanged ? 'unchanged' : ''}"><b>With your relic · ${room === 0 ? 'first room' : `room ${room + 1}`}</b>${esc(chosen.spell.name)}: ${targets}.${esc(details + alternatives)}${permanentUnlock ? ' Keeps this spell available after changing relics.' : ''}${unchanged ? ' You can save this point or change relics.' : ''}</span>`;
  }
  private showSkills(): void {
    if (!this.state) return; const s = this.state;
    const skills = RPG_SKILLS.filter(skill => skill.school === this.school);
    const school = RPG_SCHOOLS.find(school => school.id === this.school)!;
    const depth = (id: string): number => { const parent = skills.find(skill => skill.id === id)?.parentId; return parent ? 1 + depth(parent) : 0; };
    const order = (id: string): string => { const skill = skills.find(skill => skill.id === id)!; return (skill.parentId ? order(skill.parentId) : '') + String(skills.indexOf(skill)).padStart(2,'0'); };
    const tiers = Array.from({length:Math.max(...skills.map(skill=>depth(skill.id)))+1},(_,tier)=>skills.filter(skill=>depth(skill.id)===tier).sort((a,b)=>order(a.id).localeCompare(order(b.id))));
    const chosen = skills.find(skill => skill.id === this.focusedSkill)
      ?? skills.find(skill => (s.skills[skill.id] ?? 0) < skill.maxRank && (!skill.parentId || !!s.skills[skill.parentId])) ?? skills[0];
    this.focusedSkill = chosen.id;
    const rank = s.skills[chosen.id] ?? 0, parent = RPG_SKILLS.find(skill => skill.id === chosen.parentId);
    const available = s.skillPoints > 0 && s.level >= chosen.level && (!parent || !!s.skills[parent.id]) && rank < chosen.maxRank;
    const requirement = rank >= chosen.maxRank ? 'Fully learned' : parent && !s.skills[parent.id] ? `First learn ${parent.name}` : s.level < chosen.level ? `Unlocks at level ${chosen.level}` : s.skillPoints < 1 ? 'Gain a level to earn another skill point' : 'Ready to learn';
    const learned = skills.filter(skill => (s.skills[skill.id] ?? 0) > 0).length;
    this.showDialog('skills', `<p class="rpg-eyebrow">SHAPE YOUR MAGIC</p><h2 id="rpg-dialog-title">Skill trees <small>${s.skillPoints} skill point${s.skillPoints === 1 ? '' : 's'}</small></h2><p class="rpg-skill-intro">Follow the branches. Shape your magic.</p>${this.trackedSpell && rpgSpellUnlocked(this.trackedSpell, s.skills) ? `<button class="rpg-goal-card rpg-learned-goal" data-action="spell-goal">${this.spellGoalCard()}</button>` : ''}${this.schoolTabs('skills')}<div class="rpg-skill-workbench ${this.skillDetailOpen ? 'detail-open' : ''}" style="--spell-color:${school.color}"><div class="rpg-rune-summary">${skillArt(chosen.id,chosen.spellId)}<div><strong>${esc(chosen.name)}</strong><small>Rank ${rank} / ${chosen.maxRank} · ${chosen.kind === 'unlock' ? 'Spell' : 'Enhancement'}</small></div><button data-action="rune-detail" aria-expanded="${this.skillDetailOpen}">${this.skillDetailOpen ? 'Tree' : 'Details'}</button></div><section class="rpg-rune-tree" aria-label="${school.name} skill branches"><div class="rpg-tree-heading"><span>${school.name}</span><small>${learned} / ${skills.length} runes learned</small></div><div class="rpg-skill-graph rpg-rune-graph"><svg class="rpg-skill-links" aria-hidden="true"></svg>${tiers.flat().map(skill => {
      const rank = s.skills[skill.id] ?? 0;
      const learnable = s.skillPoints > 0 && s.level >= skill.level && (!skill.parentId || !!s.skills[skill.parentId]) && rank < skill.maxRank;
      return `<button class="rpg-rune-node ${skill.kind === 'unlock' ? 'spell-rune' : 'passive-rune'} ${rank ? 'learned' : ''} ${learnable ? 'available' : ''} ${skill.id === chosen.id ? 'selected' : ''}" data-skill-select="${skill.id}" data-parent="${skill.parentId ?? ''}" aria-pressed="${skill.id === chosen.id}" aria-label="${esc(skill.name)}, rank ${rank} of ${skill.maxRank}" style="--node-row:${depth(skill.id)+1};--node-col:${tiers[depth(skill.id)].indexOf(skill)+1};--node-columns:${tiers[depth(skill.id)].length}"><span class="rpg-rune-medallion">${skillArt(skill.id,skill.spellId)}</span>${learnable ? '<i class="rpg-rune-state available" aria-hidden="true">+</i>' : !rank ? `<i class="rpg-rune-state locked" aria-hidden="true">${icon('lock')}</i>` : ''}<strong>${esc(skill.name)}</strong><span class="rpg-rune-ranks" aria-hidden="true">${Array.from({length:skill.maxRank},(_,i)=>`<i class="${i < rank ? 'filled' : ''}"></i>`).join('')}<small>${rank} / ${skill.maxRank}</small></span></button>`;
    }).join('')}</div></section><aside class="rpg-skill-detail" aria-label="Selected rune" data-focused-skill="${chosen.id}"><div class="rpg-skill-detail-art">${skillArt(chosen.id,chosen.spellId)}</div><p class="rpg-eyebrow">${chosen.kind === 'unlock' ? 'DISCOVER A SPELL' : 'STRENGTHEN YOUR MAGIC'}</p><h3>${esc(chosen.name)}</h3><span class="rpg-detail-rank">Rank ${rank} / ${chosen.maxRank}</span><p class="rpg-detail-description">${esc(chosen.description)}</p>${chosen.kind !== 'unlock' && rank < chosen.maxRank ? this.skillPreviewCard(chosen.id) : ''}<p class="rpg-detail-requirement">${esc(requirement)}</p><button data-pin-kind="skill" data-pin-id="${chosen.id}" aria-pressed="${s.goal?.kind === 'skill' && s.goal.id === chosen.id}">${s.goal?.kind === 'skill' && s.goal.id === chosen.id ? '✓ Your goal' : 'Work toward this rune'}</button><button class="rpg-primary rpg-learn-rune" data-skill="${chosen.id}" ${!available ? 'disabled' : ''}>${rank >= chosen.maxRank ? 'Mastered' : `${rank ? 'Upgrade' : 'Learn'} · 1 point`}</button>${parent ? `<span class="rpg-detail-parent">Branch: ${esc(parent.name)}</span>` : ''}</aside></div><div class="rpg-button-row"><button class="rpg-primary" data-action="close">${this.playing ? 'Return to dungeon' : 'Back to camp'}</button><button data-action="spellbook">Open spellbook</button><button data-action="respec" ${s.expedition && !s.expedition.cleared ? 'disabled title="Available after this expedition"' : ''}>Reset points at camp · Free</button></div>`, true);
    requestAnimationFrame(() => this.drawSkillLinks());
  }
  private drawSkillLinks(): void {
    if (this.panel !== 'skills') return;
    const graph = this.root.querySelector<HTMLElement>('.rpg-skill-graph');
    const svg = graph?.querySelector('svg');
    if (!graph || !svg) return;
    const box = graph.getBoundingClientRect();
    svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
    svg.innerHTML = [...graph.querySelectorAll<HTMLElement>('[data-parent]')].map(node => {
      const parent = [...graph.querySelectorAll<HTMLElement>('[data-skill-select]')].find(other => other.dataset.skillSelect === node.dataset.parent);
      if (!parent) return '';
      const from = parent.getBoundingClientRect(), to = node.getBoundingClientRect();
      const x1 = from.x + from.width/2-box.x, y1=from.bottom-box.y;
      const x2 = to.x + to.width/2-box.x, y2=to.y-box.y;
      const mid = (y1+y2)/2;
      return `<path d="M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}" class="${parent.classList.contains('learned') ? 'learned' : ''}"/><circle cx="${x2}" cy="${y2}" r="3"/>`;
    }).join('');
  }
  private relicHuntCard(regionId: string): string {
    if (!this.state) return '';
    const hunt = rpgNextRelicHunt(this.state, regionId);
    if (!hunt) return '';
    const item = RPG_ITEMS.find(item => item.id === hunt.itemId);
    if (!item) return '';
    const region = RPG_REGIONS.find(region => region.id === regionId)!;
    const collection = RPG_ITEMS.filter(item => item.id !== 'apprentice' && (!region.relicSchool || item.school === region.relicSchool));
    const collected = collection.filter(item => this.state!.inventory.includes(item.id)).length;
    const total = collection.length;
    const collectionName = region.relicSchool ? RPG_SCHOOLS.find(school => school.id === region.relicSchool)!.name : 'All-school';
    return `<span class="rpg-relic-hunt ${item.rarity}" data-hunt-item="${item.id}">${relicArt(item.id)}<span><small>${hunt.duplicate ? 'DUPLICATE TREASURE' : 'NEXT DISCOVERY'}</small><strong>${esc(item.name)}</strong><span>${hunt.encounterIndex === 5 ? 'Guardian treasure' : `Room ${hunt.encounterIndex + 1}`} · ${hunt.duplicate ? 'Fresh randomized bonus stats' : item.rarity + ' relic · bonus stats vary'}</span>${region.relicSchool && !hunt.regional && !hunt.duplicate ? '<span class="rpg-hunt-fallback">Treasure from beyond this vault</span>' : ''}<span class="rpg-hunt-collection">${collected} / ${total} ${collectionName} relics found</span></span></span>`;
  }
  private showInventory(): void {
    if (!this.state) return;
    this.showDialog('inventory', renderEquipmentView(this.state, '', this.playing), true);
  }
  private showMap(): void {
    if (!this.state) return; const s = this.state;
    this.showDialog('map', `<p class="rpg-eyebrow">BEYOND THE NEXT GATE</p><h2 id="rpg-dialog-title">Expeditions</h2><p>Explore forest ruins, a rocky coast, an old quarry, palace gardens, or the vaults. Outdoor areas offer relics from every school. Six encounters lead to the guardian’s treasure.</p>${s.expedition && !s.expedition.cleared ? `<div class="rpg-active-expedition"><p>Current dungeon · Tier ${s.expedition.tier ?? 1} · Room ${s.expedition.encounterIndex + 1} of 6</p><button class="rpg-primary" data-action="retreat">Leave dungeon & choose area or tier</button><small>Keep all earned treasure. The unfinished dungeon will not count as a clear.</small></div>` : ''}${tierSelect(s,this.selectedTier,'rpg-map-tier',!!s.expedition&&!s.expedition.cleared)}<p class="rpg-tier-reward">${tierRewards(this.selectedTier)} Lower tiers have easier enemies and weaker item rolls.</p><div class="rpg-regions">${RPG_REGIONS.map(region => {
      const unlocked = s.expeditionsCompleted >= region.requiredClears;
      const active = !!s.expedition && !s.expedition.cleared;
      const current = active && s.expedition!.regionId === region.id;
      return `<button class="rpg-region-card ${!unlocked ? 'locked' : ''}" style="--region-color:${region.color}" data-region="${region.id}" data-tier="${this.selectedTier}" ${!unlocked || (active && !current) ? 'disabled' : ''}><div class="rpg-region-art">${icon(region.relicSchool ?? region.environment ?? 'map')}<i></i><i></i><i></i></div><small>${region.relicSchool ? 'VAULT · ' + RPG_SCHOOLS.find(school => school.id === region.relicSchool)!.name.toUpperCase() : 'OUTDOORS · MIXED RELICS'}</small><h3>${region.name}</h3><p>${region.subtitle}</p><span>Guardian · ${region.bossName}</span>${this.relicHuntCard(region.id)}<b>${current ? `Continue · ${s.expedition!.encounterIndex + 1}/6` : !unlocked ? `Clear ${region.requiredClears} expeditions to unlock` : active ? 'Finish your current expedition first' : 'Start expedition →'}</b></button>`;
    }).join('')}</div><button class="rpg-text-button" data-action="close">${this.playing ? 'Return to dungeon' : 'Back to camp'}</button>`, true);
  }
  private recordLearningReward(reward: Reward): void {
    // Read the tutor's existing receipt; never add a request or change its rewards.
    if (this.session) {
      const events = this.session.celebrations ??= [];
      for (const quest of reward.questsCompleted ?? []) events.push({
        id: `${this.session.problem.id}:quest:${quest.key}`, kind: 'quest', title: 'QUEST COMPLETE!',
        subtitle: quest.label, reward: `+${quest.reward} gems`,
      });
      if (reward.allDailiesCrazyCoin) events.push({
        id: `${this.session.problem.id}:board`, kind: 'daily-board', title: 'ALL QUESTS COMPLETE!',
        subtitle: 'You did the whole board!', reward: '+1 Crazy Coin',
      });
      this.saveSession();
    }
    if (this.legacyState) this.legacyState.gems = reward.totalGems;
    if (this.campState) this.campState.gems = reward.totalGems;
  }
  private async showWorkshop(tab: CampTab, focusEquipped = false): Promise<void> {
    if (!this.state || this.busy) return;
    this.showDialog(tab, '<h2 id="rpg-dialog-title">Returning to camp…</h2><p>Opening your saved rewards.</p>', true);
    await this.runSafely(async () => {
      if (this.economyPending) {
        const pending = this.economyPending;
        let result: RpgEconomyResult;
        try { result = await request<RpgEconomyResult>(`/rpg/${pending.action}`, { ...pending.body, requestId: pending.requestId }); }
        catch (error) {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) { this.economyPending = null; sessionStorage.removeItem(`${sessionKey}:economy`); }
          throw error;
        }
        this.state = result.state; this.economyPending = null; sessionStorage.removeItem(`${sessionKey}:economy`);
      }
      const [camp, legacy] = await Promise.all([getRpgCamp(), request<State>(`/state?profileId=${encodeURIComponent(PROFILE)}`)]);
      this.campState = camp; this.legacyState = legacy; this.renderState();
      if (this.panel === tab) {
        this.showDialog(tab, renderCampWorkshop(this.state!, camp, legacy, tab), true);
        if (focusEquipped) {
          const card = this.root.querySelector<HTMLElement>('.rpg-forge-list .rpg-loot-card.equipped');
          card?.scrollIntoView({ block: 'center' });
          card?.querySelector<HTMLButtonElement>('[data-forge-loot]:not(:disabled)')?.focus({ preventScroll: true });
        }
      }
    });
  }
  private async economyAction(action: string, body: Record<string, unknown>): Promise<void> {
    if (this.busy || !this.state) return;
    // Keep one intent and one id through a lost response, retry, or page reload.
    const pending = this.economyPending ?? { action, body, requestId: newRequestId() };
    this.economyPending = pending; sessionStorage.setItem(`${sessionKey}:economy`, JSON.stringify(pending));
    await this.runSafely(async () => {
      let result: RpgEconomyResult;
      try { result = await request<RpgEconomyResult>(`/rpg/${pending.action}`, { ...pending.body, requestId: pending.requestId }); }
      catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) { this.economyPending = null; sessionStorage.removeItem(`${sessionKey}:economy`); }
        throw error;
      }
      this.state = result.state; this.economyPending = null; sessionStorage.removeItem(`${sessionKey}:economy`);
      const [camp, legacy] = await Promise.all([getRpgCamp(), request<State>(`/state?profileId=${encodeURIComponent(PROFILE)}`)]);
      this.campState = camp; this.legacyState = legacy; this.renderState();
      const tab = pending.action === 'shop/buy' ? 'merchant' : 'forge';
      this.showDialog(tab, renderCampWorkshop(this.state!, camp, legacy, tab), true, pending.action === 'forge/upgrade');
      this.toast(pending.action === 'shop/buy' ? 'Your new relic is ready in Equipment!' : pending.action === 'forge/upgrade' ? 'Forged! +2 power. Your favorite relic grows stronger.' : `Reclaimed +${result.dustGained ?? 0} forge dust.`);
    });
  }
  private confirmSalvage(lootId: string): void {
    const loot = this.state?.loot?.find(entry => entry.id === lootId); if (!loot) return;
    const item = RPG_ITEMS.find(item => item.id === loot.itemId)!;
    this.showDialog('salvage', `<p class="rpg-eyebrow">AT THE BLACKSMITH</p><h2 id="rpg-dialog-title">Reclaim this extra relic?</h2><div class="rpg-next-dungeon">${relicArt(item.id)}<h3>${esc(item.name)}</h3><p>${esc(lootStats(loot, this.state!))}</p><p>This copy will become <strong>${rpgSalvageValue(loot)} forge dust</strong>. Your other copies stay in your collection.</p></div><div class="rpg-button-row"><button data-action="forge">Keep it</button><button class="rpg-primary" data-confirm-salvage="${esc(lootId)}">Reclaim for dust</button></div>`);
  }
  private confirmRetreat(): void {
    if (this.busy || this.session?.pending || !this.state?.expedition || this.state.expedition.cleared) return;
    this.showDialog('retreat', `<p class="rpg-eyebrow">A DIFFERENT PATH</p><h2 id="rpg-dialog-title">Leave this dungeon?</h2><p>Keep all the XP, gems, forge dust, and relics you have earned. Your next dungeon begins at room one.</p><p>This unfinished expedition will not count as a clear. Its guardian treasure is still waiting.</p><div class="rpg-button-row"><button data-action="close">Keep exploring</button><button class="rpg-primary" data-action="confirm-retreat">Keep treasure & choose a dungeon</button></div>`);
  }
  private async retreat(): Promise<void> {
    if (this.busy || this.session?.pending || !this.state?.expedition || this.state.expedition.cleared) return;
    await this.runSafely(async () => {
      this.state = await mutateRpg('retreat');
      this.session = null; this.branches = null; this.entered = ''; this.saveSession();
      this.playing = false; this.el('rpg-controls').hidden = true;
      this.selectedTier = Math.max(1, (this.state.dungeonTier ?? 1) - 1);
      this.renderState(); this.showMap(); this.toast('Treasure kept. Choose a comfortable dungeon tier.');
    });
  }
  private showPause(): void {
    if (!this.state || this.busy) return;
    this.saveSession();
    this.showDialog('pause', `<div class="rpg-seal">${icon('shield')}</div><p class="rpg-eyebrow">A MOMENT BY THE FIRE</p><h2 id="rpg-dialog-title">Adventure saved</h2><p>Your spells, treasures, and progress will be here.</p><div class="rpg-button-row"><button class="rpg-primary" data-action="close">Keep exploring</button><button data-action="camp">Save & leave</button></div><button class="rpg-text-button" data-action="tutorial">${icon('help')} How to play · Story & tour</button><button class="rpg-text-button" data-action="retreat">Leave dungeon & choose area or tier</button><button class="rpg-text-button" data-action="parent">Open parent journal</button>`);
  }
  private async showParent(): Promise<void> {
    this.showDialog('parent', '<h2 id="rpg-dialog-title">Learning journal</h2><p>Loading your existing learning progress…</p>', true);
    const [mastery, legacy] = await Promise.all([fetchMastery(), fetchState()]);
    if (this.panel !== 'parent') return;
    this.el('rpg-dialog-content').innerHTML = renderParentJournal(PROFILE, mastery, legacy, this.state?.expeditionsCompleted ?? 0);
  }

  private parentRedemptionBusy = false;
  private async redeemParentReward(currency: 'coin' | 'dime'): Promise<void> {
    if (this.parentRedemptionBusy || this.panel !== 'parent') return;
    const journal = this.root.querySelector<HTMLElement>('.rpg-parent-journal');
    if (!journal) return;
    const buttons = [...journal.querySelectorAll<HTMLButtonElement>('[data-action="redeem"], [data-action="redeem-dime"]')];
    const status = journal.querySelector<HTMLElement>('[data-parent-redemption-status]')!;
    const key = `${sessionKey}:redeem:${currency}`;
    const requestId = sessionStorage.getItem(key) ?? newRequestId();
    sessionStorage.setItem(key, requestId);
    this.parentRedemptionBusy = true; buttons.forEach(button => button.disabled = true);
    status.textContent = 'Saving redemption…';
    try {
      const result = currency === 'coin' ? await redeemCrazyCoin(requestId) : await redeemDime(requestId);
      if (!result) { status.textContent = 'Could not confirm the redemption. Try again to check the same request.'; return; }
      sessionStorage.removeItem(key);
      const balance = 'crazyCoins' in result ? result.crazyCoins : result.dimes;
      journal.querySelector<HTMLElement>(`[data-parent-balance="${currency}"]`)!.textContent = String(balance);
      status.textContent = result.ok ? (currency === 'coin' ? 'One Crazy Coin redeemed.' : 'One dime redeemed. Pay $0.10.') : (currency === 'coin' ? 'No Crazy Coins to redeem.' : 'No dimes to redeem.');
    } finally {
      this.parentRedemptionBusy = false;
      buttons.forEach(button => {
        const kind = button.dataset.action === 'redeem' ? 'coin' : 'dime';
        button.disabled = !(Number(journal.querySelector(`[data-parent-balance="${kind}"]`)?.textContent) > 0);
      });
    }
  }

  private get tutorialKey(): string { return `${sessionKey}:tutorial:v${RPG_TUTORIAL_VERSION}`; }

  private launchTutorial(): void {
    if (!this.state || this.busy || this.tutorialState || this.disposed) return;
    const dialog = this.root.querySelector<HTMLElement>('.rpg-dialog')!;
    this.tutorialSnapshot = {
      panel: this.panel, html: this.el('rpg-dialog-content').innerHTML,
      wide: dialog.classList.contains('wide'), scroll: dialog.scrollTop,
      controlsHidden: !!this.el('rpg-controls').hidden,
      problem: this.el('rpg-problem').textContent ?? '', topic: this.el('rpg-topic').textContent ?? '',
      school: this.school, focusedSkill: this.focusedSkill, detail: this.skillDetailOpen,
    };
    this.tutorialState = newTutorialState();
    this.stopClock(); this.saveSession(); this.world.setPaused(true);
    this.tutorialHost = document.createElement('div');
    this.tutorialHost.id = 'rpg-tutorial-host'; this.root.append(this.tutorialHost);
    for (const child of this.root.children) {
      if (child instanceof HTMLElement && child !== this.tutorialHost) {
        this.tutorialInert.set(child, child.inert); child.inert = true;
      }
    }
    this.tutorialOverlay = new TutorialOverlay(this.tutorialHost, {
      onNext: () => this.moveTutorial('next'), onBack: () => this.moveTutorial('back'),
      onSkip: () => this.moveTutorial('skip'), onSpeak: () => { void this.readTutorial(); },
    });
    this.showTutorialPage();
  }

  private showTutorialPage(): void {
    if (!this.tutorialState || !this.tutorialOverlay) return;
    this.tutorialNarrator.stop();
    const page = RPG_TUTORIAL_PAGES[this.tutorialState.index];
    this.root.dataset.tutorialPanel = page.panel ?? '';
    this.root.dataset.tutorialPage = page.id;
    this.panel = ''; this.root.dataset.panel = ''; this.el('rpg-overlay').hidden = true;
    this.el('rpg-controls').hidden = page.phase === 'story';
    // A display-only example before the first lesson. Never request or answer a
    // tutor problem just to explain the controls, and never spend rewards here.
    this.el('rpg-problem').textContent = this.session?.problem.prompt ?? '2 + 1';
    this.el('rpg-topic').textContent = this.session ? this.tutorialSnapshot!.topic : 'YOUR MATH GOES HERE';
    if (page.panel === 'skills') {
      this.school = 'ember'; this.focusedSkill = null;
      this.skillDetailOpen = page.id === 'learn-skill'; this.showSkills();
    } else if (page.panel === 'spellbook') this.showSpellbook();
    else if (page.panel === 'inventory') this.showInventory();
    else if (page.panel === 'map') this.showMap();
    else if (page.panel) {
      // showWorkshop also retries pending purchases; a tour must only render.
      if (this.campState && this.legacyState) {
        this.showDialog(page.panel, renderCampWorkshop(this.state!, this.campState, this.legacyState, page.panel), true);
      } else {
        this.showDialog(page.panel, `<h2 id="rpg-dialog-title">${esc(page.title)}</h2><p>Camp rewards are reconnecting. You can still finish the tour.</p>`);
      }
    }
    this.world.setPaused(true);
    this.root.querySelector<HTMLElement>('.rpg-dialog')!.scrollTop = 0;
    let anchor = page.focus ? this.root.querySelector<HTMLElement>(page.focus) : null;
    if (anchor?.getClientRects().length) anchor.scrollIntoView({ block: page.panel ? 'start' : 'nearest', inline: 'nearest' });
    else anchor = page.panel ? this.el('rpg-dialog-content') : null;
    this.tutorialOverlay.show(page, this.tutorialState.index, RPG_TUTORIAL_PAGES.length, anchor);
    this.tutorialOverlay.focusFirst();
  }

  private async readTutorial(): Promise<void> {
    const current = this.tutorialState;
    if (!current) return;
    const page = RPG_TUTORIAL_PAGES[current.index];
    const heard = await this.tutorialNarrator.speak(`${page.title}. ${page.body} ${page.cue}`);
    if (!heard && this.tutorialState === current) this.toast('The voice is resting. You can keep going with Next.');
  }

  private moveTutorial(action: 'next' | 'back' | 'skip'): void {
    if (!this.tutorialState) return;
    this.tutorialState = advanceTutorial(this.tutorialState, action);
    if (!this.tutorialState.finished) { this.showTutorialPage(); return; }
    this.tutorialNarrator.stop(); this.tutorialOverlay?.destroy(); this.tutorialOverlay = null;
    this.tutorialHost?.remove(); this.tutorialHost = null;
    for (const [element, inert] of this.tutorialInert) element.inert = inert;
    this.tutorialInert.clear();
    delete this.root.dataset.tutorialPanel; delete this.root.dataset.tutorialPage;
    const saved = this.tutorialSnapshot!;
    this.school = saved.school; this.focusedSkill = saved.focusedSkill; this.skillDetailOpen = saved.detail;
    this.el('rpg-problem').textContent = saved.problem; this.el('rpg-topic').textContent = saved.topic;
    this.el('rpg-controls').hidden = saved.controlsHidden;
    if (saved.panel) {
      this.showDialog(saved.panel, saved.html, saved.wide);
      this.root.querySelector<HTMLElement>('.rpg-dialog')!.scrollTop = saved.scroll;
    } else {
      this.panel = ''; this.root.dataset.panel = ''; this.el('rpg-overlay').hidden = true;
      this.world.setPaused(!this.playing);
    }
    this.tutorialState = null; this.tutorialSnapshot = null;
    try { localStorage.setItem(this.tutorialKey, action === 'skip' ? 'skipped' : 'completed'); } catch { /* Optional local preference. */ }
    this.startClock(); this.updatePower();
  }

  private showDialog(name: string, html: string, wide = false, preserveScroll = false): void {
    const content = this.el('rpg-dialog-content');
    const scrollTop = preserveScroll && this.panel === name ? content.scrollTop : 0;
    if (!this.panel) { this.stopClock(); this.saveSession(); }
    this.panel = name; this.root.dataset.panel = name; this.world.setPaused(true);
    this.el('rpg-overlay').hidden = false;
    content.innerHTML = html;
    this.root.querySelector('.rpg-dialog')!.classList.toggle('wide', wide);
    content.scrollTop = scrollTop;
    this.root.querySelector<HTMLButtonElement>('.rpg-dialog-close')!.hidden = ['camp','demo','walkthrough','loading'].includes(name);
    this.root.querySelector<HTMLElement>('.rpg-dialog')!.focus({ preventScroll: true });
  }
  private closeDialog(force = false): void {
    if (!force && ['demo','walkthrough','loading'].includes(this.panel)) return;
    if (!force && (!this.playing || this.state?.expedition?.cleared)) { this.showCamp(); return; }
    this.panel = ''; this.root.dataset.panel = ''; this.el('rpg-overlay').hidden = true; this.world.setPaused(false); this.startClock();
    if (this.playing && !this.busy) this.el<HTMLInputElement>('rpg-answer').focus({ preventScroll: true });
  }
  /** Compact notices borrow the existing room subtitle row, preserving the combat area. */
  private positionToast = (): void => {
    const notice = this.el('rpg-toast');
    const compact = this.playing && (innerWidth <= 760
      || matchMedia('(max-width:1000px) and (max-height:500px) and (min-aspect-ratio:3/2)').matches);
    notice.classList.toggle('compact', compact);
    notice.textContent = (compact ? notice.dataset.compactText : notice.dataset.fullText) ?? '';
    if (compact) {
      const room = this.el('rpg-room').getBoundingClientRect(), origin = this.root.getBoundingClientRect();
      notice.style.left = `${room.left - origin.left}px`;
      notice.style.top = `${room.top - origin.top}px`;
      notice.style.width = `${Math.min(room.width, innerWidth - room.left - 12)}px`;
    } else {
      for (const key of ['left', 'top', 'width']) notice.style.removeProperty(key);
    }
  };
  private toast(text: string, ms = 3500, compactText = text): void {
    if (this.disposed) return;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    const notice = this.el('rpg-toast');
    notice.dataset.fullText = text; notice.dataset.compactText = compactText;
    notice.setAttribute('aria-label', text); notice.hidden = false;
    this.positionToast();
    this.toastTimer = setTimeout(() => { notice.hidden = true; }, ms);
  }
  private async runSafely(action: () => Promise<void>): Promise<void> {
    this.stopClock(); this.busy = true;
    try {
      await action();
      this.retryAction = null; this.el('rpg-connection').hidden = true;
      this.busy = false; this.startClock();
    } catch (error) {
      if (this.disposed) return;
      console.warn('Adventure connection interrupted:', error);
      if (error instanceof HeroAssetLoadError) {
        this.retryAction = action; this.busy = true;
        this.el('rpg-connection').hidden = true;
        this.el('rpg-save-status').textContent = '◇ Hero download paused';
        this.showDialog('loading', '<div class="rpg-seal">◆</div><h2 id="rpg-dialog-title">Your hero could not load</h2><p>The hero download did not finish. Check the connection and try again.</p><button class="rpg-primary" data-action="retry">Try again</button>');
        return;
      }
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        // A stale tab or unavailable skill is a state conflict, not an outage.
        // Refresh the authoritative checkpoint and let the child continue.
        try {
          this.state = await getRpgState(); this.restoreSession();
          if (this.session?.pending) this.session.pending.spellId = this.state.selectedSpellId;
          this.saveSession(); this.renderState(); this.busy = false;
          this.retryAction = null; this.el('rpg-connection').hidden = true;
          this.showCamp(); this.toast(error.message); return;
        } catch { /* reconnect flow below keeps the original operation */ }
      }
      this.retryAction = action; this.busy = true;
      this.el('rpg-connection').hidden = false;
      this.el('rpg-connection').querySelector('span')!.textContent = 'Your adventure is waiting. Check the connection, then try again.';
      this.el('rpg-save-status').textContent = '◇ Waiting to save';
    }
  }
  private async changeLoadout(action: string, body: Record<string, unknown>, after: () => void): Promise<void> {
    if (this.busy) return;
    const payload = action === 'upgrade' ? { ...body, requestId: newRequestId() } : body;
    await this.runSafely(async () => {
      this.state = await mutateRpg(action, payload); this.renderState();
      if (this.state.expedition && !this.state.expedition.cleared) this.setEncounter();
      after();
    });
  }
  private async say(text: string): Promise<void> {
    if (this.muted || this.disposed) return;
    this.answerClock.stop();
    this.speechDepth++; dungeonSound.setDucked(true);
    try { await speak(text); }
    finally {
      this.speechDepth--;
      if (!this.speechDepth) { dungeonSound.setDucked(false); this.startClock(); }
    }
  }
  private updateSound(): void {
    dungeonSound.setMuted(this.muted);
    const button = this.root.querySelector<HTMLButtonElement>('[data-action="sound"]')!;
    button.innerHTML = icon(this.muted ? 'muted' : 'sound');
    button.setAttribute('aria-label', this.muted ? 'Enable tutor voice' : 'Mute tutor voice');
  }
  private onClick = (event: MouseEvent): void => {
    if (this.tutorialState) return;
    void dungeonSound.unlock();
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.digit !== undefined) {
      if (this.busy || this.panel) return;
      const digit = button.dataset.digit;
      if (digit === '✓') { void this.submit(); return; }
      this.entered = digit === '⌫' ? this.entered.slice(0,-1) : (this.entered + digit).slice(0,3); this.updateAnswer(); return;
    }
    if (button.dataset.school) {
      this.school = button.dataset.school as RpgSchoolId;
      button.dataset.view === 'spellbook' ? this.showSpellbook() : this.showSkills(); return;
    }
    if (button.dataset.spell) {
      if (this.busy || !this.state) return;
      const spellId = button.dataset.spell as RpgSpellId;
      this.school = rpgSpellSchool(spellId);
      if (!rpgSpellAvailable(this.state, spellId)) {
        this.trackSpell(spellId);
        const skillId = RPG_SPELLS.find(spell => spell.id === spellId)?.skillId;
        this.focusedSkill = skillId ?? null; this.showSkills();
        requestAnimationFrame(() => {
          const node = this.root.querySelector<HTMLElement>(`[data-skill-select="${skillId}"]`);
          node?.classList.add('rpg-target-skill');
          node?.scrollIntoView({block:'center',behavior:'smooth'});
        });
        return;
      }
      void this.changeLoadout('spell', { spellId }, () => { if (this.trackedSpell === spellId) this.trackSpell(null); if (this.panel === 'spellbook') this.showSpellbook(); else if (this.panel === 'camp') this.showCamp(); }); return;
    }
    if (button.dataset.skillSelect) {
      this.focusedSkill = button.dataset.skillSelect; this.skillDetailOpen = false; this.showSkills();
      this.root.querySelector<HTMLButtonElement>(`[data-skill-select="${this.focusedSkill}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (button.dataset.skill) {
      const spell = RPG_SPELLS.find(spell => spell.skillId === button.dataset.skill);
      void this.changeLoadout('upgrade', { skillId: button.dataset.skill }, () => {
        if (spell) { this.trackSpell(spell.id); this.toast(`${spell.name} learned! Your new magic is ready.`); }
        this.showSkills(); if (!this.muted) dungeonSound.levelUp();
      }); return;
    }
    if (button.dataset.discoveryItem) {
      void this.changeLoadout('equip', {itemId:button.dataset.discoveryItem}, () => { this.discovery = null; this.renderDiscovery(); this.toast('Relic equipped. Unleash its magic!'); }); return;
    }
    if (button.dataset.nextRegion && this.nextAdventure && this.state) {
      this.nextAdventure.regionId = button.dataset.nextRegion;
      this.el('rpg-next-adventure').outerHTML = renderNextAdventure(this.state, this.nextAdventure);
      this.root.querySelector<HTMLButtonElement>('[data-action="next-adventure"]')!.textContent = `Go to ${RPG_REGIONS.find(region=>region.id===this.nextAdventure!.regionId)!.name} →`;
      this.root.querySelector<HTMLButtonElement>(`[data-next-region="${this.nextAdventure.regionId}"]`)?.focus(); return;
    }
    if (button.dataset.selectTier) { this.selectedTier = Number(button.dataset.selectTier); this.showMap(); return; }
    if (button.dataset.buyItem) { void this.economyAction('shop/buy', { itemId: button.dataset.buyItem }); return; }
    if (button.dataset.forgeLoot) { void this.economyAction('forge/upgrade', { lootId: button.dataset.forgeLoot }); return; }
    if (button.dataset.salvageLoot) { if (!this.busy) this.confirmSalvage(button.dataset.salvageLoot); return; }
    if (button.dataset.confirmSalvage) { void this.economyAction('forge/salvage', { lootId: button.dataset.confirmSalvage }); return; }
    if (button.dataset.pinKind) {
      const goal = { kind: button.dataset.pinKind, id: button.dataset.pinId } as RpgGoal;
      void this.changeLoadout('goal', { goal }, () => {
        if (this.panel === 'skills') this.showSkills();
        else if (this.panel === 'inventory') this.showInventory();
        else if (this.campState && this.legacyState && ['merchant', 'forge', 'quests', 'records'].includes(this.panel)) this.showDialog(this.panel, renderCampWorkshop(this.state!, this.campState, this.legacyState, this.panel as CampTab), true);
        this.toast('Goal pinned. Every adventure brings you closer.');
      }); return;
    }
    if (button.dataset.lootEquip) {
      void this.changeLoadout('equip', { lootId: button.dataset.lootEquip }, () => {
        if (this.panel === 'forge' && this.campState && this.legacyState) this.showDialog('forge', renderCampWorkshop(this.state!, this.campState, this.legacyState, 'forge'), true);
        else if (this.panel === 'inventory') this.showInventory();
        this.discovery = null; this.renderDiscovery(); this.toast('Relic roll equipped. Try its new power!');
      }); return;
    }
    if (button.dataset.item) {
      const loot = this.state ? collectionLootChoice(this.state, button.dataset.item) : undefined;
      void this.changeLoadout('equip', loot ? { lootId: loot.id } : { itemId: button.dataset.item }, () => { this.showInventory(); this.toast('Equipped. Try your new magic!'); }); return;
    }
    if (button.dataset.region) { void this.begin(button.dataset.region, Number(button.dataset.tier) || this.selectedTier); return; }
    const action = button.dataset.action;
    if (this.busy && !['retry','sound','demo-go','demo-hear'].includes(action ?? '')) return;
    switch (action) {
      case 'next-adventure': if (this.nextAdventure && this.state?.expedition?.cleared) void this.begin(this.nextAdventure.regionId, this.nextAdventure.tier); break;
      case 'begin': void this.begin(); break;
      case 'close': this.closeDialog(); break;
      case 'tutorial': this.launchTutorial(); break;
      case 'map': this.showMap(); break;
      case 'skills': this.skillDetailOpen = false; this.showSkills(); break;
      case 'rune-detail': this.skillDetailOpen = !this.skillDetailOpen; this.showSkills(); this.root.querySelector<HTMLElement>('.rpg-dialog')!.scrollTop = 0; break;
      case 'spellbook': this.showSpellbook(); break;
      case 'spell-goal': this.showSpellGoal(); break;
      case 'dismiss-loot': this.discovery = null; this.renderDiscovery(); break;
      case 'inventory': this.showInventory(); break;
      case 'blacksmith': void this.showWorkshop('forge', true); break;
      case 'quests': case 'merchant': case 'forge': case 'records': void this.showWorkshop(action); break;
      case 'pause': this.showPause(); break;
      case 'retreat': this.confirmRetreat(); break;
      case 'confirm-retreat': void this.retreat(); break;
      case 'camp': this.showCamp(); break;
      case 'parent': void this.showParent(); break;
      case 'help': void this.help(); break;
      case 'hear': if (this.session) void this.say(this.session.problem.spoken); break;
      case 'explain': void this.explain(); break;
      case 'walkthrough': if (!this.busy) void this.runSafely(() => this.walkthrough()); break;
      case 'keypad': this.el('rpg-keypad').hidden = !this.el('rpg-keypad').hidden; break;
      case 'sound': this.muted = !this.muted; localStorage.setItem('institute:rpg:muted', String(this.muted)); this.updateSound(); break;
      case 'demo-go': this.panelResolve?.(); this.panelResolve = null; break;
      case 'demo-hear': void this.say(this.root.querySelector('.rpg-teaching-text')?.textContent ?? ''); break;
      case 'assisted-go':
        if (this.session) {
          this.session.pending = {correct:false,assisted:true,solveMs:0,spellId:this.state!.selectedSpellId}; this.saveSession(); this.busy = true; this.closeDialog(true);
          void this.runSafely(() => this.finishPending());
        } break;
      case 'retry': if (this.retryAction && !this.retrying) { this.retrying = true; void this.runSafely(this.retryAction).finally(() => { this.retrying = false; }); } break;
      case 'clear-goal': void this.changeLoadout('goal', { goal: null }, () => this.showCamp()); break;
      case 'respec': void this.changeLoadout('respec', {}, () => this.showSkills()); break;
      case 'redeem': void this.redeemParentReward('coin'); break;
      case 'redeem-dime': void this.redeemParentReward('dime'); break;
    }
  };
  private onKey = (event: KeyboardEvent): void => {
    if (this.tutorialState) return;
    void dungeonSound.unlock();
    if (this.panel) {
      if (event.key === 'Escape') { event.preventDefault(); this.closeDialog(); }
      if (event.key === 'Tab') {
        const focusable = [...this.el('rpg-overlay').querySelectorAll<HTMLElement>('button:not([disabled]):not([hidden]), a[href], input')].filter(el => el.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first?.focus(); }
      }
      return;
    }
    if (this.busy) return;
    if (event.key === 'Escape') { this.showPause(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const hotkeys: Record<string,string> = {q:this.favoriteSpells.ember,w:this.favoriteSpells.frost,e:this.favoriteSpells.storm};
    if (hotkeys[event.key.toLowerCase()]) { this.root.querySelector<HTMLButtonElement>(`[data-spell="${hotkeys[event.key.toLowerCase()]}"]`)?.click(); return; }
    if (event.key.toLowerCase() === 'b') { this.showSpellbook(); return; }
    if (event.key.toLowerCase() === 'k') { this.showSkills(); return; }
    if (event.key.toLowerCase() === 'i') { this.showInventory(); return; }
    if (document.activeElement === this.el('rpg-answer')) return;
    if (/^\d$/.test(event.key)) { event.preventDefault(); this.entered = (this.entered + event.key).slice(0,3); this.updateAnswer(); }
    if (event.key === 'Backspace') { event.preventDefault(); this.entered = this.entered.slice(0,-1); this.updateAnswer(); }
    if (event.key === 'Enter') { event.preventDefault(); void this.submit(); }
  };
  dispose(): void {
    this.tutorialNarrator.dispose(); this.tutorialOverlay?.destroy(); this.tutorialHost?.remove();
    this.stopClock(); this.saveSession(); this.disposed = true; this.abort.abort(); this.panelResolve?.();
    this.combatLayoutObserver.disconnect();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.lootLabelFrame !== null) cancelAnimationFrame(this.lootLabelFrame);
    if (this.healthFrame !== null) cancelAnimationFrame(this.healthFrame);
    if (this.xpGainTimer) clearTimeout(this.xpGainTimer);
    if (this.powerRefresh) clearInterval(this.powerRefresh);
    this.celebrations.dispose(); dungeonSound.dispose(); this.world.dispose(); this.root.remove(); document.body.classList.remove('rpg-mode');
  }
}
