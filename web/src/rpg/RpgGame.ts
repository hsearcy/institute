import type { Problem, Branches, RpgState, RpgSchoolId, RpgSpellId, RpgAppearanceId, RpgReward, Reward } from '@institute/shared';
import { RPG_APPEARANCES, rpgAppearanceUnlocked, RPG_ITEMS, RPG_REGIONS, RPG_SKILLS, RPG_SPELLS, RPG_SCHOOLS, RPG_DUPLICATE_ITEM_XP, rpgSpellSchool, rpgItemApplies, rpgSpellModifiers, rpgSpellUnlocked, rpgEncounterKills, ProblemSchema } from '@institute/shared';
import { fetchState, fetchMastery, redeemCrazyCoin, type Demo } from '../game/tutor';
import { speak } from '../game/audio';
import * as dungeonSound from './sound';
import { API, PROFILE } from '../game/config';
import { getRpgState, setRpgAppearance, mutateRpg, resolveEncounter, attemptStatus, request, ApiError } from './api';
import { DungeonWorld } from './DungeonWorld';
import { icon, spellArt, relicArt, escapeHtml as esc } from './icons';
import './rpg.css';
import './ui-v2.css';
import { nextSpellGoal } from './nextSpell';
import { getRoomLayout } from './world/roomLayout';

type Session = {
  expeditionId: string; encounterIndex: number; problem: Problem; firstAttempt: boolean | null;
  wrongCount: number; demoSeen: boolean; elapsedMs?: number; branches?: Branches; walkthrough?: boolean;
  rewardShown?: boolean;
  pending?: { correct: boolean; assisted: boolean; solveMs: number; spellId?: RpgSpellId };
};
const sessionKey = `institute:rpg:problem:v1:${API}:${PROFILE}`;
const roomNames = Array.from({length:6}, (_, index) => getRoomLayout(index).name);

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
    const discoveryEquip = this.root.querySelector<HTMLButtonElement>('[data-discovery-item]');
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
  private clockRunning = false;
  private retrying = false;
  private storageReady = false;
  private speechDepth = 0;
  private discovery: string | null = null;
  private lootLabelFrame: number | null = null;
  private lootLabelUntil = 0;
  private school: RpgSchoolId = 'ember';
  private trackedSpell: RpgSpellId | null = null;
  private favoriteSpells: Record<RpgSchoolId, RpgSpellId> = { ember: 'ember', frost: 'frost', storm: 'storm' };

  constructor(canvas: HTMLCanvasElement) {
    document.body.classList.add('rpg-mode');
    this.world = new DungeonWorld(canvas);
    this.root.id = 'rpg-ui';
    this.root.innerHTML = `
      <header class="rpg-top"><div class="rpg-location"><span class="rpg-eyebrow">INSTITUTE <b>◆</b> THE SUNKEN VAULT</span><h1 id="rpg-region">The Embercrypt</h1><p id="rpg-room">A new adventure awaits</p></div>
      <nav aria-label="Adventure menu"><button data-action="map" title="Expeditions" aria-label="Expeditions">${icon('map')}</button><button data-action="skills" title="Skill trees" aria-label="Skill trees">${icon('tree')}<i id="rpg-points" hidden></i></button><button data-action="inventory" title="Equipment" aria-label="Equipment">${icon('bag')}</button><button data-action="sound" title="Toggle tutor voice" aria-label="Mute tutor voice">${icon('sound')}</button><button data-action="pause" title="Pause and save" aria-label="Pause and save">Ⅱ</button></nav></header>
      <div class="rpg-route" aria-label="Expedition progress" id="rpg-route"></div><button id="rpg-next-spell" class="rpg-next-spell" data-action="spell-goal" hidden></button>
      <div id="rpg-boss" class="rpg-boss" hidden><span>GUARDIAN OF THE VAULT</span><strong></strong><div></div></div>
      <div id="rpg-toast" class="rpg-toast" role="status" aria-live="polite" hidden></div><aside id="rpg-discovery" class="rpg-discovery" aria-label="New relic" aria-live="polite" hidden></aside><div id="rpg-floating-xp" class="rpg-floating-xp" aria-hidden="true"></div><div id="rpg-world-loot" class="rpg-world-loot" aria-hidden="true" hidden></div>
      <section class="rpg-controls" id="rpg-controls" hidden aria-label="Spell controls">
        <div class="rpg-hint" id="rpg-hint" role="status" hidden></div>
        <form id="rpg-answer-form" class="rpg-answer-panel" autocomplete="off"><div class="rpg-question"><span id="rpg-topic" class="rpg-eyebrow">POWER YOUR SPELL</span><label for="rpg-answer" id="rpg-problem">Preparing your next spell…</label></div><input id="rpg-answer" aria-label="Your answer" inputmode="none" autocomplete="off" maxlength="3" pattern="[0-9]*" type="text"><button class="rpg-primary" id="rpg-cast" type="submit">Unleash <span>↵</span></button><div class="rpg-help-buttons"><button type="button" data-action="hear" aria-label="Read problem aloud" title="Hear the problem">${icon('sound')}</button><button type="button" data-action="help" aria-label="Help me" title="Help me">${icon('help')}</button><button type="button" data-action="keypad" aria-label="Toggle number pad" title="Number pad">⌨</button></div></form>
        <div id="rpg-keypad" class="rpg-keypad" hidden>${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(n => `<button type="button" data-digit="${n}" aria-label="${n === '⌫' ? 'Delete digit' : n === '✓' ? 'Submit answer' : n}">${n}</button>`).join('')}</div>
        <footer class="rpg-hotbar"><div class="rpg-hud-art" aria-hidden="true"></div><div class="rpg-level-orb"><span>LEVEL</span><strong id="rpg-level">1</strong></div><div class="rpg-spellbar" id="rpg-spellbar"></div><button class="rpg-gear-button" data-action="inventory" aria-label="Open equipment">${icon('sword')}<span id="rpg-equipped">Equipment</span></button><button class="rpg-magic-orb" data-action="spellbook" aria-label="Open spellbook"><span>SPELLS</span><strong id="rpg-spell-count">2</strong><small>Spellbook · B</small></button></footer>
        <div class="rpg-xp"><div><i id="rpg-xp-fill"></i></div><span id="rpg-xp-label">0 / 90 XP</span></div>
      </section>
      <div class="rpg-connection" id="rpg-connection" hidden role="alert"><span>Reconnecting to your adventure…</span><button data-action="retry">Try again</button></div>
      <div id="rpg-overlay" class="rpg-overlay" hidden><section class="rpg-dialog" role="dialog" aria-modal="true" aria-labelledby="rpg-dialog-title" tabindex="-1"><button class="rpg-dialog-close" data-action="close" aria-label="Close">×</button><div id="rpg-dialog-content"></div></section></div>
      <button class="rpg-parent" data-action="parent">Parent journal</button><span id="rpg-save-status" class="rpg-save-status">◆ Adventure saved on your server</span>`;
    document.querySelector('#app')!.append(this.root);
    this.root.addEventListener('click', this.onClick, { signal: this.abort.signal });
    this.el<HTMLFormElement>('rpg-answer-form').addEventListener('submit', e => { e.preventDefault(); void this.submit(); }, { signal: this.abort.signal });
    this.el<HTMLInputElement>('rpg-answer').addEventListener('input', e => {
      const input = e.target as HTMLInputElement;
      input.value = input.value.replace(/\D/g, '').slice(0,3); this.entered = input.value; this.saveSession();
    }, { signal: this.abort.signal });
    document.addEventListener('keydown', this.onKey, { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopClock(); this.saveSession();
        if (this.playing && !this.panel && !this.busy) this.showPause();
      } else this.startClock();
    }, { signal: this.abort.signal });
    window.addEventListener('pagehide', () => { this.stopClock(); this.saveSession(); }, { signal: this.abort.signal });
    window.addEventListener('resize', () => { this.world.resize(); this.drawSkillLinks(); }, { signal: this.abort.signal });
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
    this.updateSound();
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T { return this.root.querySelector<T>(`#${id}`)!; }
  async start(): Promise<void> {
    this.world.start();
    const modelsReady = this.world.load().catch(() => this.toast('The dungeon is ready. Some details are still loading.'));
    this.showDialog('loading', '<div class="rpg-seal">◆</div><p class="rpg-eyebrow">THE SUNKEN VAULT</p><h2 id="rpg-dialog-title">Opening the gates</h2><p>Finding your adventure…</p>');
    await this.runSafely(async () => {
      this.state = await getRpgState();
      await modelsReady;
      this.restoreSession(); this.renderState(); this.busy = false; this.showCamp();
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
      } else { this.session = null; localStorage.removeItem(sessionKey); }
    } catch { this.session = null; }
    this.branches = null; this.storageReady = true;
  }
  private checkpointClock(): void {
    if (!this.clockRunning || !this.session) return;
    const now = performance.now();
    this.session.elapsedMs = (this.session.elapsedMs ?? 0) + Math.max(0, now - this.shownAt);
    this.shownAt = now;
  }
  private stopClock(): void { this.checkpointClock(); this.clockRunning = false; }
  private startClock(): void {
    if (this.clockRunning || this.busy || this.panel || !this.playing || document.hidden || !this.session || this.session.firstAttempt !== null) return;
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
    this.world.setEncounter(index, this.state.expedition.regionId, rpgEncounterKills(this.state, index));
  }
  private renderState(): void {
    const s = this.state; if (!s || this.disposed) return;
    const expedition = s.expedition;
    const region = RPG_REGIONS.find(r => r.id === expedition?.regionId) ?? RPG_REGIONS[0];
    this.el('rpg-region').textContent = region.name;
    this.el('rpg-room').textContent = expedition && !expedition.cleared ? `${roomNames[expedition.encounterIndex]} · ${expedition.encounterIndex + 1} / ${expedition.encountersTotal}` : region.subtitle;
    this.el('rpg-route').innerHTML = Array.from({ length: 6 }, (_, i) => `<span class="${expedition && (expedition.cleared || i < expedition.encounterIndex) ? 'complete' : i === expedition?.encounterIndex ? 'current' : ''}" title="${roomNames[i]}">${i === 5 ? '♜' : '◆'}</span>`).join('');
    this.el('rpg-level').textContent = String(s.level);
    this.el('rpg-xp-fill').style.width = `${100 * s.xpIntoLevel / s.xpForNextLevel}%`;
    this.el('rpg-xp-label').textContent = `${s.xpIntoLevel} / ${s.xpForNextLevel} XP`;
    this.el('rpg-points').hidden = s.skillPoints === 0;
    this.el('rpg-points').textContent = String(s.skillPoints);
    this.favoriteSpells[rpgSpellSchool(s.selectedSpellId)] = s.selectedSpellId;
    for (const school of RPG_SCHOOLS) if (!rpgSpellUnlocked(this.favoriteSpells[school.id],s.skills)) this.favoriteSpells[school.id] = school.id;
    localStorage.setItem(`${sessionKey}:favorites`,JSON.stringify(this.favoriteSpells));
    this.el('rpg-spell-count').textContent = String(RPG_SPELLS.filter(spell => rpgSpellUnlocked(spell.id, s.skills)).length);
    this.el('rpg-spellbar').innerHTML = (['ember','frost','storm'] as RpgSchoolId[]).map((school, i) => {
      const favorite = this.favoriteSpells[school];
      const spell = RPG_SPELLS.find(entry => entry.id === favorite && rpgSpellUnlocked(entry.id,s.skills)) ?? RPG_SPELLS.find(entry => entry.id === school)!;
      const unlocked = rpgSpellUnlocked(spell.id, s.skills);
      return `<button data-spell="${spell.id}" class="rpg-spell ${s.selectedSpellId === spell.id ? 'selected' : ''} ${!unlocked ? 'locked' : ''}" style="--spell-color:${spell.color}" aria-label="${spell.name}${!unlocked ? ', unlock in skill tree' : ''}" aria-pressed="${s.selectedSpellId === spell.id}">${spellArt(spell.id)}<span>${spell.name}</span>${!unlocked ? `<i class="rpg-spell-lock">${icon('lock')}</i>` : ''}<kbd>${['Q','W','E'][i]}</kbd></button>`;
    }).join('') + `<button class="rpg-spell rpg-tree-button" data-action="skills">${icon('tree')}<span>Skill trees</span>${s.skillPoints ? `<i>${s.skillPoints} new</i>` : '<kbd>K</kbd>'}</button>`;
    const item = RPG_ITEMS.find(i => i.id === s.equippedItemId)!;
    this.el('rpg-equipped').textContent = item.name;
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
    card.innerHTML = this.spellGoalCard(true); card.hidden = !card.innerHTML;
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
    this.school = goal.spell.school; this.showSkills();
    requestAnimationFrame(() => {
      const node = this.root.querySelector<HTMLElement>(`[data-skill="${goal.next?.id}"]`);
      node?.classList.add('rpg-target-skill'); node?.scrollIntoView({block:'center',behavior:'smooth'});
    });
  }

  private showCamp(): void {
    const s = this.state!;
    this.stopClock(); this.saveSession(); this.playing = false; this.el('rpg-controls').hidden = true;
    const resume = s.expedition && !s.expedition.cleared;
    if (resume) this.setEncounter();
    this.showDialog('camp', `<div class="rpg-seal">${icon('sword')}</div><p class="rpg-eyebrow">INSTITUTE PRESENTS</p><h2 id="rpg-dialog-title" class="rpg-title">The Sunken<br><em>Vault</em></h2><p class="rpg-camp-story">Ancient halls. Hidden relics.<br>A little magic goes a long way.</p><div class="rpg-camp-stats"><span>LEVEL <b>${s.level}</b></span><span>RELICS <b>${s.inventory.length}</b></span><span>GUARDIANS <b>${s.expeditionsCompleted}</b></span></div>${s.totalKills === 0 ? `<div class="rpg-starter-spells" aria-label="Choose your starting magic">${(['ember','cleave'] as RpgSpellId[]).map(id => `<button data-spell="${id}" aria-pressed="${s.selectedSpellId === id}" class="${s.selectedSpellId === id ? 'selected' : ''}">${spellArt(id)}<span>${id === 'ember' ? 'Fire Nova' : 'Flame Cleave'}</span></button>`).join('')}</div>` : ''}${this.spellGoalCard() ? `<button class="rpg-goal-card" data-action="spell-goal">${this.spellGoalCard()}</button>` : ''}<button class="rpg-primary rpg-large" data-action="begin">${resume ? 'Continue adventure' : 'Enter the dungeon'} <span>→</span></button><button class="rpg-text-button" data-action="map">Choose an expedition</button><div class="rpg-camp-menu"><button data-action="spellbook">${icon('storm')} Spellbook</button><button data-action="skills">${icon('tree')} Skill trees${s.skillPoints ? ` · ${s.skillPoints} new` : ''}</button><button data-action="inventory">${icon('bag')} Equipment</button><button data-action="parent">Parent journal</button></div><button class="rpg-armor-progress" data-action="inventory">${icon('shield')}${this.armorProgressText()}</button><p class="rpg-camp-note">Solve to unleash your spells. Take all the time you need.</p>`);
  }
  private async begin(regionId?: string): Promise<void> {
    if (!this.state || this.busy) return;
    this.busy = true;
    await this.runSafely(async () => {
      this.state = await mutateRpg('start', regionId ? { regionId } : {});
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
    if (!restoring) this.session = { expeditionId: expedition.id, encounterIndex: expedition.encounterIndex, problem: p, firstAttempt: null, wrongCount: 0, demoSeen: false, elapsedMs: 0 };
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
    this.startClock();
    void this.say(p.spoken).then(() => {
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
  private async submit(): Promise<void> {
    if (!this.session || this.busy || this.panel || !this.entered || !this.playing) return;
    this.stopClock(); this.busy = true;
    this.session.pending = { correct: Number(this.entered) === this.session.problem.answer, assisted: false, solveMs: Math.round(this.session.elapsedMs ?? 0), spellId: this.state!.selectedSpellId };
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
      else await request('/tutor/attempt', { problemId: p.id, skill: p.skill, topicId: p.topicId, difficulty: p.difficulty, correct: pending.correct, solveMs: pending.solveMs });
      status = await attemptStatus(p.id);
    }
    session.firstAttempt = status.correct ?? false;
    this.saveSession();
    if (pending.correct && !status.solved) await request('/reward/retry-solve', { problemId: p.id });
    if (pending.correct || pending.assisted) {
      const spellId = pending.spellId ?? this.state!.selectedSpellId;
      const result = await resolveEncounter({ problemId: p.id, expeditionId: session.expeditionId, encounterIndex: session.encounterIndex, spellId, assisted: pending.assisted });
      const item = RPG_ITEMS.find(i => i.id === this.state!.equippedItemId)!;
      const applies = rpgItemApplies(item, result.reward.spellId);
      const modifiers = rpgSpellModifiers(this.state!,result.reward.spellId);
      this.el<HTMLButtonElement>('rpg-cast').disabled = true;
      this.el<HTMLInputElement>('rpg-answer').disabled = true;
      this.el('rpg-answer-form').classList.add('correct');
      if (!session.rewardShown) {
        if (!this.muted) dungeonSound.cast(result.reward.spellId);
        await this.world.attack(result.reward.spellId, {
          echo: modifiers.includes('echo'), wide: modifiers.includes('wide'),
          burning: modifiers.includes('burn'), shards: modifiers.includes('ice-shards'),
          chains: modifiers.includes('chain'), pierce: modifiers.includes('pierce'),
          orbit: modifiers.includes('orbit'), summon: modifiers.includes('summon'),
          itemId: applies ? item.id : undefined, kills: result.reward.kills,
          drop: result.reward.item && !result.reward.duplicateItem ? {name:result.reward.item.name,rarity:result.reward.item.rarity} : undefined, xp:result.reward.xp,
        });
        session.rewardShown = true; this.saveSession();
      }
      this.state = result.state; this.renderState();
      this.showReward(result.reward);
      this.el('rpg-save-status').textContent = '◆ Adventure saved on your server';
      if (this.state.expedition!.cleared) {
        this.session = null; this.saveSession(); this.busy = false; this.showVictory(result.reward); return;
      }
      if (this.state.expedition!.id !== session.expeditionId || this.state.expedition!.encounterIndex !== session.encounterIndex + 1) {
        this.session = null; this.saveSession(); this.busy = false; this.showCamp(); return;
      }
      this.setEncounter();
      // Keep the pending receipt until showProblem durably replaces this
      // session. A failed next-problem fetch is safe to retry from here.
      await this.nextProblem();
    } else {
      session.pending = undefined; session.wrongCount = Math.min(3, session.wrongCount + 1);
      if (session.wrongCount >= 3) session.walkthrough = true;
      this.saveSession(); this.entered = ''; this.updateAnswer(); this.busy = false;
      this.hint(session.wrongCount > 1 ? (p.hint ?? 'Try a different way, or ask me to show you.') : 'Almost. Try again, or let’s work it out together.');
      if (session.wrongCount >= 3) await this.walkthrough();
    }
  }
  private showReward(reward: RpgReward): void {
    if (reward.item && !reward.duplicateItem) {
      this.discovery = reward.item.id; this.renderDiscovery();
      const label = this.el('rpg-world-loot');
      label.textContent = reward.item.name; label.dataset.rarity = reward.item.rarity;
      this.lootLabelUntil = performance.now() + 4000;
      if (this.lootLabelFrame !== null) cancelAnimationFrame(this.lootLabelFrame);
      this.updateLootLabel();
    }
    const floating = this.el('rpg-floating-xp');
    floating.textContent = `+${reward.xp} XP`;
    const position = this.world.heroScreenPosition;
    floating.style.left = `${position.x}px`; floating.style.top = `${Math.max(100,position.y-45)}px`;
    floating.classList.remove('rpg-xp-rise');
    void floating.offsetWidth; floating.classList.add('rpg-xp-rise');
    const item = reward.item && !reward.duplicateItem ? ` · Found ${reward.item.name}` : '';
    const level = reward.levelUp ? ` · Level ${this.state!.level}! +${reward.levelsGained} skill point${reward.levelsGained > 1 ? 's' : ''}` : '';
    this.toast(`+${reward.xp} XP · ${reward.kills} monsters defeated${item}${level}`, reward.levelUp || !!item ? 6500 : 2600);
    if (!this.muted) {
      if (reward.bossDefeated) dungeonSound.boss();
      else if (reward.levelUp) dungeonSound.levelUp();
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
  private renderDiscovery(): void {
    const item = RPG_ITEMS.find(item => item.id === this.discovery);
    const panel = this.el('rpg-discovery');
    panel.hidden = !item;
    if (!item) return;
    panel.dataset.rarity = item.rarity;
    panel.innerHTML = `<button data-action="dismiss-loot" class="rpg-discovery-close" aria-label="Dismiss new relic">×</button><p class="rpg-eyebrow">${item.rarity.toUpperCase()} RELIC DISCOVERED</p><div class="rpg-discovery-body">${relicArt(item.id)}<div><h3>${item.name}</h3><p>${item.description}</p></div></div><button class="rpg-discovery-equip" data-discovery-item="${item.id}" ${this.busy ? 'disabled' : ''}>${this.state?.equippedItemId === item.id ? '✓ Equipped' : 'Equip this relic'}</button><small>Already saved in your equipment</small>`;
  }
  private showVictory(reward: RpgReward): void {
    const s = this.state!; const region = RPG_REGIONS.find(r => r.id === s.expedition?.regionId)!;
    // The receipt decides whether this was a discovery or a conversion. Never
    // infer it from inventory, which already includes newly awarded relics.
    const converted = reward.duplicateItem && !!reward.item;
    const rewardLabel = converted ? 'DUPLICATE RELIC' : reward.item ? `${reward.item.rarity.toUpperCase()} RELIC` : 'GUARDIAN REWARD';
    const rewardDescription = converted ? `Already in your collection. Converted into +${RPG_DUPLICATE_ITEM_XP} bonus XP. +${reward.xp} XP total from this guardian.`
      : reward.item?.description ?? 'One step closer to your next spell.';
    this.showDialog('victory', `<div class="rpg-seal">${icon('crown')}</div><p class="rpg-eyebrow">EXPEDITION COMPLETE</p><h2 id="rpg-dialog-title">${esc(region.bossName)}<br><em>defeated.</em></h2><p>The halls are yours. Your next adventure awaits.</p><div class="rpg-victory-reward">${reward.item ? relicArt(reward.item.id) : icon('crown')}<div><small>${esc(rewardLabel)}</small><strong>${esc(reward.item?.name ?? `+${reward.xp} experience`)}</strong><span>${esc(rewardDescription)}</span></div></div><div class="rpg-button-row"><button class="rpg-primary" data-action="map">Next adventure →</button><button data-action="inventory">Inspect loot</button><button data-action="camp">Save & leave</button></div>${s.skillPoints ? `<button class="rpg-text-button" data-action="skills">Spend ${s.skillPoints} skill point${s.skillPoints > 1 ? 's' : ''}</button>` : ''}`);
  }
  private hint(text: string): void { this.el('rpg-hint').textContent = text; this.el('rpg-hint').hidden = false; }
  private async help(): Promise<void> {
    if (!this.session || this.busy) return;
    this.showDialog('help', `<p class="rpg-eyebrow">YOUR MAGIC CAN WAIT</p><h2 id="rpg-dialog-title">Let’s work it out</h2><div class="rpg-demo-equation">${esc(this.session.problem.prompt)}</div><p>You have all the time you need.</p><div class="rpg-help-choice"><button data-action="explain">${icon('help')}<strong>Give me a hint</strong><span>Help me find a way to solve it.</span></button><button data-action="walkthrough">${icon('sound')}<strong>I'm not sure yet</strong><span>Show me how, step by step.</span></button></div><button class="rpg-text-button" data-action="close">I want to try again</button>`);
  }
  private async explain(): Promise<void> {
    if (!this.session) return; this.busy = true;
    const p = this.session.problem;
    this.el('rpg-dialog-content').innerHTML = '<h2 id="rpg-dialog-title">Finding a helpful hint…</h2>';
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
    this.el('rpg-dialog-content').innerHTML = `<p class="rpg-eyebrow">LET’S LEARN THIS TOGETHER</p><h2 id="rpg-dialog-title">Here’s how</h2><div class="rpg-demo-equation">${esc(p.prompt)} <span>→ ${p.answer}</span></div><p class="rpg-teaching-text">${esc(text)}</p><button class="rpg-primary" data-action="assisted-go">Cast together & continue</button><button class="rpg-text-button" data-action="demo-hear">Hear it again</button>`;
    this.busy = false; void this.say(text);
  }

  private schoolTabs(action: string): string {
    return `<div class="rpg-school-tabs" role="group" aria-label="Magic school">${RPG_SCHOOLS.map(school => `<button data-school="${school.id}" data-view="${action}" class="${this.school === school.id ? 'active' : ''}" style="--spell-color:${school.color}" aria-pressed="${this.school === school.id}">${spellArt(school.id)}<span>${school.name}</span></button>`).join('')}</div>`;
  }
  private showSpellbook(): void {
    if (!this.state) return; const s = this.state;
    this.showDialog('spellbook', `<p class="rpg-eyebrow">THE GRIMOIRE</p><h2 id="rpg-dialog-title">Your spells <small>${RPG_SPELLS.filter(spell => rpgSpellUnlocked(spell.id,s.skills)).length} / ${RPG_SPELLS.length} learned</small></h2><p>Choose your magic. Each school remembers your last selected spell.</p>${this.schoolTabs('spellbook')}<div class="rpg-spell-library">${RPG_SPELLS.filter(spell => spell.school === this.school).map(spell => {
      const learned = rpgSpellUnlocked(spell.id,s.skills);
      const skill = RPG_SKILLS.find(skill => skill.id === spell.skillId);
      return `<button class="rpg-spell-card ${learned ? 'learned' : 'locked'} ${s.selectedSpellId === spell.id ? 'selected' : ''}" data-spell="${spell.id}" style="--spell-color:${spell.color}">${spellArt(spell.id)}<div><small>${learned ? 'LEARNED SPELL' : `UNLOCK · LEVEL ${skill?.level ?? 1}`}</small><strong>${spell.name}</strong><p>${spell.description}</p><b>${s.selectedSpellId === spell.id ? '✓ Selected' : learned ? 'Select spell →' : this.trackedSpell === spell.id ? '✓ Tracked · View skill tree' : 'Track spell · View skill tree →'}</b></div></button>`;
    }).join('')}</div><div class="rpg-button-row"><button class="rpg-primary" data-action="close">${this.playing ? 'Return to dungeon' : 'Back to camp'}</button><button data-action="skills">Learn new spells</button></div>`, true);
  }
  private showSkills(): void {
    if (!this.state) return; const s = this.state;
    const skills = RPG_SKILLS.filter(skill => skill.school === this.school);
    const depth = (id: string): number => { const parent = skills.find(skill => skill.id === id)?.parentId; return parent ? 1 + depth(parent) : 0; };
    const order = (id: string): string => { const skill = skills.find(skill => skill.id === id)!; return (skill.parentId ? order(skill.parentId) : '') + String(skills.indexOf(skill)).padStart(2,'0'); };
    const tiers = Array.from({length:Math.max(...skills.map(skill=>depth(skill.id)))+1},(_,tier)=>skills.filter(skill=>depth(skill.id)===tier).sort((a,b)=>order(a.id).localeCompare(order(b.id))));
    const columns = Math.max(...tiers.map(tier=>tier.length));

    this.showDialog('skills', `<p class="rpg-eyebrow">SHAPE YOUR MAGIC</p><h2 id="rpg-dialog-title">Skill trees <small>${s.skillPoints} skill point${s.skillPoints === 1 ? '' : 's'}</small></h2><p>Follow a branch to learn new spells, or strengthen your favorites.</p>${this.trackedSpell && rpgSpellUnlocked(this.trackedSpell, s.skills) ? `<button class="rpg-goal-card rpg-learned-goal" data-action="spell-goal">${this.spellGoalCard()}</button>` : ''}${this.schoolTabs('skills')}<div class="rpg-skill-trees"><section class="rpg-skill-tree rpg-skill-graph" style="--graph-columns:${columns};--spell-color:${RPG_SCHOOLS.find(school => school.id === this.school)!.color}"><svg class="rpg-skill-links" aria-hidden="true"></svg>${tiers.flat().map(skill => {
      const rank = s.skills[skill.id] ?? 0;
      const available = s.skillPoints > 0 && s.level >= skill.level && (!skill.parentId || !!s.skills[skill.parentId]) && rank < skill.maxRank;
      const parent = RPG_SKILLS.find(k => k.id === skill.parentId);
      const reason = rank >= skill.maxRank ? 'Mastered' : s.level < skill.level ? `Level ${skill.level}` : parent && !s.skills[parent.id] ? `Learn ${parent.name}` : s.skillPoints < 1 ? 'Earn a skill point' : 'Learn · 1 point';
      return `<button class="rpg-skill-node ${rank ? 'learned' : ''} ${available ? 'available' : ''}" data-skill="${skill.id}" data-parent="${skill.parentId ?? ''}" style="--node-row:${depth(skill.id)+1};--node-col:${tiers[depth(skill.id)].indexOf(skill)+1};--node-columns:${tiers[depth(skill.id)].length}" ${!available ? 'disabled' : ''}>${spellArt(skill.spellId)}<div><small>${skill.kind === 'unlock' ? 'NEW SPELL' : 'SPELL UPGRADE'}${parent ? ` · ${parent.name}` : ' · Starting branch'}</small><strong>${skill.name}</strong><span>${skill.description}</span><small class="rpg-skill-status">${rank}/${skill.maxRank} <b>${reason}</b></small></div></button>`;
    }).join('')}</section></div><div class="rpg-button-row"><button class="rpg-primary" data-action="close">${this.playing ? 'Return to dungeon' : 'Back to camp'}</button><button data-action="spellbook">Open spellbook</button><button data-action="respec" ${s.expedition && !s.expedition.cleared ? 'disabled title="Available after this expedition"' : ''}>Reset points at camp · Free</button></div>`, true);
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
      const parent = [...graph.querySelectorAll<HTMLElement>('[data-skill]')].find(other => other.dataset.skill === node.dataset.parent);
      if (!parent) return '';
      const from = parent.getBoundingClientRect(), to = node.getBoundingClientRect();
      const x1 = from.x + from.width/2-box.x, y1=from.bottom-box.y;
      const x2 = to.x + to.width/2-box.x, y2=to.y-box.y;
      const mid = (y1+y2)/2;
      return `<path d="M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}" class="${parent.classList.contains('learned') ? 'learned' : ''}"/><circle cx="${x2}" cy="${y2}" r="3"/>`;
    }).join('');
  }
  private armorProgressText(): string {
    if (!this.state) return '';
    const justUnlocked = RPG_APPEARANCES.find(appearance => appearance.requiredLevel > 1 && appearance.requiredLevel === this.state!.level);
    if (justUnlocked) return `${esc(justUnlocked.name)} armor unlocked · Choose your look in Equipment`;
    const next = RPG_APPEARANCES.find(appearance => !rpgAppearanceUnlocked(appearance.id, this.state!.level));
    return next ? `Next hero armor: ${esc(next.name)} · Level ${next.requiredLevel}` : 'All four hero armor styles unlocked';
  }
  private armorCards(): string {
    if (!this.state) return ''; const s = this.state;
    return `<section class="rpg-armor-section" aria-labelledby="rpg-armor-title"><div class="rpg-armor-heading"><h3 id="rpg-armor-title">Hero armor</h3><span>Cosmetic · No cost</span></div><p>Find your hero’s look. Your relic and spell powers stay the same.</p><div class="rpg-armor-grid">${RPG_APPEARANCES.map(appearance => {
      const unlocked = rpgAppearanceUnlocked(appearance.id, s.level), selected = s.appearanceId === appearance.id;
      return `<article class="rpg-armor-card ${unlocked ? '' : 'locked'} ${selected ? 'selected' : ''}" data-armor="${appearance.id}"><div class="rpg-armor-preview">${appearance.thumbnail ? `<img src="${esc(appearance.thumbnail)}" alt="${esc(appearance.name)} armor" loading="lazy" width="320" height="360">` : `<span class="rpg-wayfarer-crest" aria-hidden="true">${icon('shield')}${icon('sword')}</span>`}${!unlocked ? `<span class="rpg-armor-lock">${icon('lock')} Level ${appearance.requiredLevel}</span>` : ''}</div><h4>${esc(appearance.name)}</h4><p>${esc(appearance.description)}</p><button data-appearance="${appearance.id}" data-locked="${!unlocked}" aria-pressed="${selected}" aria-label="${selected ? 'Wearing' : 'Wear'} ${esc(appearance.name)}" ${!unlocked || selected || this.busy ? 'disabled' : ''}>${selected ? '✓ Wearing' : unlocked ? 'Wear' : `Unlocks at level ${appearance.requiredLevel}`}</button></article>`;
    }).join('')}</div><p class="rpg-armor-next">${this.armorProgressText()}</p></section>`;
  }
  private async wearAppearance(appearanceId: RpgAppearanceId): Promise<void> {
    if (this.busy || !this.state || this.state.appearanceId === appearanceId || !rpgAppearanceUnlocked(appearanceId, this.state.level)) return;
    await this.runSafely(async () => {
      this.state = await setRpgAppearance(appearanceId);
      this.renderState(); this.showInventory();
      this.toast(`${RPG_APPEARANCES.find(appearance => appearance.id === appearanceId)!.name} worn.`);
    });
  }
  private showInventory(): void {
    if (!this.state) return; const s = this.state;
    this.showDialog('inventory', `<p class="rpg-eyebrow">RELICS OF THE VAULT</p><h2 id="rpg-dialog-title">Your equipment <small>${s.inventory.length} / ${RPG_ITEMS.length} found</small></h2>${this.armorCards()}<h3 class="rpg-relics-title">Relics</h3><p>Find rare weapons. Change the way your magic looks and strikes.</p><div class="rpg-inventory">${RPG_ITEMS.map(item => {
      const owned = s.inventory.includes(item.id); const equipped = s.equippedItemId === item.id;
      return `<button class="rpg-item ${item.rarity} ${!owned ? 'undiscovered' : ''} ${equipped ? 'equipped' : ''}" data-item="${item.id}" ${!owned ? 'disabled' : ''}>${owned ? relicArt(item.id) : `<span class="rpg-item-art">${icon('lock')}</span>`}<small>${owned ? item.rarity : 'UNDISCOVERED'}</small><strong>${owned ? item.name : 'Hidden relic'}</strong><span>${owned ? item.description : 'Keep exploring the vaults.'}</span><b>${equipped ? '✓ Equipped' : owned ? 'Equip' : item.rarity + ' treasure'}</b></button>`;
    }).join('')}</div><div class="rpg-button-row"><button class="rpg-primary" data-action="close">${this.playing ? 'Return to dungeon' : 'Back to camp'}</button><a href="?mode=mine" class="rpg-text-button">Visit your gem collection & original shop</a></div>`, true);
  }
  private showMap(): void {
    if (!this.state) return; const s = this.state;
    this.showDialog('map', `<p class="rpg-eyebrow">BEYOND THE NEXT GATE</p><h2 id="rpg-dialog-title">Expeditions</h2><p>Six encounters. A guardian. Something worth discovering.</p><div class="rpg-regions">${RPG_REGIONS.map((region, index) => {
      const unlocked = s.expeditionsCompleted >= region.requiredClears;
      const active = !!s.expedition && !s.expedition.cleared;
      const current = active && s.expedition!.regionId === region.id;
      return `<button class="rpg-region-card ${!unlocked ? 'locked' : ''}" style="--region-color:${region.color}" data-region="${region.id}" ${!unlocked || (active && !current) ? 'disabled' : ''}><div class="rpg-region-art">${icon(index === 0 ? 'ember' : index === 1 ? 'frost' : 'storm')}<i></i><i></i><i></i></div><small>EXPEDITION ${['I','II','III'][index]}</small><h3>${region.name}</h3><p>${region.subtitle}</p><span>Guardian · ${region.bossName}</span><b>${current ? `Continue · ${s.expedition!.encounterIndex + 1}/6` : !unlocked ? `Clear ${region.requiredClears} expeditions to unlock` : active ? 'Finish your current expedition first' : 'Enter the dungeon →'}</b></button>`;
    }).join('')}</div><button class="rpg-text-button" data-action="close">${this.playing ? 'Return to dungeon' : 'Back to camp'}</button>`, true);
  }
  private showPause(): void {
    if (!this.state || this.busy) return;
    this.saveSession();
    this.showDialog('pause', `<div class="rpg-seal">${icon('shield')}</div><p class="rpg-eyebrow">A MOMENT BY THE FIRE</p><h2 id="rpg-dialog-title">Adventure saved</h2><p>Your spells, treasures, and progress will be here.</p><div class="rpg-button-row"><button class="rpg-primary" data-action="close">Keep exploring</button><button data-action="camp">Save & leave</button></div><button class="rpg-text-button" data-action="parent">Open parent journal</button>`);
  }
  private async showParent(): Promise<void> {
    this.showDialog('parent', '<h2 id="rpg-dialog-title">Learning journal</h2><p>Loading your existing learning progress…</p>', true);
    const [mastery, legacy] = await Promise.all([fetchMastery(), fetchState()]);
    if (this.panel !== 'parent') return;
    const topics = mastery?.topics ?? [];
    this.el('rpg-dialog-content').innerHTML = `<p class="rpg-eyebrow">PARENT JOURNAL · ${esc(PROFILE)}</p><h2 id="rpg-dialog-title">The learning journey</h2><p>Character levels and math mastery grow independently. The same adaptive tutor chooses every problem.</p><div class="rpg-journal-stats"><span><b>${topics.filter(t => t.state === 'mastered').length}</b>topics mastered</span><span><b>${legacy?.gems ?? '…'}</b>gems kept</span><span><b>${mastery?.crazyCoins ?? '…'}</b>Crazy Coins</span><span><b>${this.state?.expeditionsCompleted ?? 0}</b>expeditions cleared</span></div><details><summary>Daily quests & rewards</summary><div class="rpg-quest-list">${(legacy?.quests ?? []).map(q => `<p><span>${esc(q.label)}</span><b>${q.progress} / ${q.target} ${q.done ? '✓' : ''}</b></p>`).join('') || 'Could not load daily quests.'}</div><button data-action="redeem" ${(mastery?.crazyCoins ?? 0) < 1 ? 'disabled' : ''}>Redeem one Crazy Coin · 15 minutes</button></details><div class="rpg-mastery-list">${topics.map(t => `<details><summary><span class="rpg-mastery-state ${t.state}">${t.state === 'mastered' ? '◆' : t.unlocked ? '◇' : '○'}</span><strong>${esc(t.kidLabel)}</strong><span>${t.state === 'mastered' ? 'Mastered' : t.unlocked ? 'Learning' : 'Not yet unlocked'} · ${t.correct}/${t.attempts}</span></summary><p>${esc(t.assessmentPrompt)}</p><p>Prerequisites: ${t.prereqs.length ? t.prereqs.map(id => esc(topics.find(other => other.id === id)?.kidLabel ?? id)).join(', ') : 'Starting skill'}${t.fluentMs ? ` · Fluency target: ${t.fluentMs / 1000}s` : ''}</p></details>`).join('') || '<p>Could not load the learning graph. Your saved data has not changed.</p>'}</div><div class="rpg-button-row"><button class="rpg-primary" data-action="close">Back</button><a class="rpg-text-button" href="?mode=mine">Original mine, shops & detailed statistics</a></div>`;
  }

  private showDialog(name: string, html: string, wide = false): void {
    if (!this.panel) { this.stopClock(); this.saveSession(); }
    this.panel = name; this.root.dataset.panel = name; this.world.setPaused(true);
    this.el('rpg-overlay').hidden = false;
    this.el('rpg-dialog-content').innerHTML = html;
    this.root.querySelector('.rpg-dialog')!.classList.toggle('wide', wide);
    this.root.querySelector<HTMLButtonElement>('.rpg-dialog-close')!.hidden = ['camp','demo','walkthrough','loading'].includes(name);
    this.root.querySelector<HTMLElement>('.rpg-dialog')!.focus({ preventScroll: true });
  }
  private closeDialog(force = false): void {
    if (!force && ['demo','walkthrough','loading'].includes(this.panel)) return;
    if (!force && (!this.playing || this.state?.expedition?.cleared)) { this.showCamp(); return; }
    this.panel = ''; this.root.dataset.panel = ''; this.el('rpg-overlay').hidden = true; this.world.setPaused(false); this.startClock();
    if (this.playing && !this.busy) this.el<HTMLInputElement>('rpg-answer').focus({ preventScroll: true });
  }
  private toast(text: string, ms = 3500): void {
    if (this.disposed) return;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.el('rpg-toast').textContent = text; this.el('rpg-toast').hidden = false;
    this.toastTimer = setTimeout(() => { this.el('rpg-toast').hidden = true; }, ms);
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
    const payload = action === 'upgrade' ? { ...body, requestId: crypto.randomUUID() } : body;
    await this.runSafely(async () => {
      this.state = await mutateRpg(action, payload); this.renderState();
      if (this.state.expedition && !this.state.expedition.cleared) this.setEncounter();
      after();
    });
  }
  private async say(text: string): Promise<void> {
    if (this.muted || this.disposed) return;
    this.speechDepth++; dungeonSound.setDucked(true);
    try { await speak(text); }
    finally { this.speechDepth--; if (!this.speechDepth) dungeonSound.setDucked(false); }
  }
  private updateSound(): void {
    dungeonSound.setMuted(this.muted);
    const button = this.root.querySelector<HTMLButtonElement>('[data-action="sound"]')!;
    button.innerHTML = icon(this.muted ? 'muted' : 'sound');
    button.setAttribute('aria-label', this.muted ? 'Enable tutor voice' : 'Mute tutor voice');
  }
  private onClick = (event: MouseEvent): void => {
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
      if (!rpgSpellUnlocked(spellId, this.state.skills)) {
        this.trackSpell(spellId);
        this.showSkills();
        const skillId = RPG_SPELLS.find(spell => spell.id === spellId)?.skillId;
        requestAnimationFrame(() => {
          const node = this.root.querySelector<HTMLElement>(`[data-skill="${skillId}"]`);
          node?.classList.add('rpg-target-skill');
          node?.scrollIntoView({block:'center',behavior:'smooth'});
        });
        return;
      }
      void this.changeLoadout('spell', { spellId }, () => { if (this.trackedSpell === spellId) this.trackSpell(null); if (this.panel === 'spellbook') this.showSpellbook(); else if (this.panel === 'camp') this.showCamp(); }); return;
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
    if (button.dataset.appearance) {
      const appearance = RPG_APPEARANCES.find(entry => entry.id === button.dataset.appearance);
      if (appearance) void this.wearAppearance(appearance.id);
      return;
    }
    if (button.dataset.item) {
      void this.changeLoadout('equip', { itemId: button.dataset.item }, () => { this.showInventory(); this.toast('Equipped. Try your new magic!'); }); return;
    }
    if (button.dataset.region) { void this.begin(button.dataset.region); return; }
    const action = button.dataset.action;
    if (this.busy && !['retry','sound','demo-go','demo-hear'].includes(action ?? '')) return;
    switch (action) {
      case 'begin': void this.begin(); break;
      case 'close': this.closeDialog(); break;
      case 'map': this.showMap(); break;
      case 'skills': this.showSkills(); break;
      case 'spellbook': this.showSpellbook(); break;
      case 'spell-goal': this.showSpellGoal(); break;
      case 'dismiss-loot': this.discovery = null; this.renderDiscovery(); break;
      case 'inventory': this.showInventory(); break;
      case 'pause': this.showPause(); break;
      case 'camp': this.showCamp(); break;
      case 'parent': void this.showParent(); break;
      case 'help': void this.help(); break;
      case 'hear': if (this.session) void this.say(this.session.problem.spoken); break;
      case 'explain': void this.explain(); break;
      case 'walkthrough': void this.runSafely(() => this.walkthrough()); break;
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
      case 'respec': void this.changeLoadout('respec', {}, () => this.showSkills()); break;
      case 'redeem': void (async () => { await redeemCrazyCoin(); await this.showParent(); })(); break;
    }
  };
  private onKey = (event: KeyboardEvent): void => {
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
    this.stopClock(); this.saveSession(); this.disposed = true; this.abort.abort(); this.panelResolve?.();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.lootLabelFrame !== null) cancelAnimationFrame(this.lootLabelFrame);
    dungeonSound.dispose(); this.world.dispose(); this.root.remove(); document.body.classList.remove('rpg-mode');
  }
}
