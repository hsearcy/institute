/**
 * Live combat staging while a problem waits. The horde paces near its
 * formation and one enemy at a time rushes in to swing at the hero's ward.
 * Presentation only: a strike always meets the ward, and nothing here touches
 * health, rewards or the answer clock.
 */
export type HordeActor = { id: string; x: number; z: number; originX: number; originZ: number; brute: boolean; canStrike: boolean; phase: number };
export type HordeGoal = { x: number; z: number; run: boolean; faceHero: boolean };
export type HordeEvent = { kind: 'swing' | 'impact' | 'recoil'; id: string };

/** Seconds into the attack clip when the blade meets the ward. */
export const STRIKE_CONTACT = .5;
const BRUTE_CONTACT = .6;
const RECOIL_TIME = .7;
const RUSH_TIMEOUT = 3;
const WANDER = .65;

type Mode = 'hold' | 'rush' | 'swing' | 'recoil';
type Plan = { mode: Mode; postX: number; postZ: number; nextPostAt: number; startedAt: number; impacted: boolean; recoilX: number; recoilZ: number };

const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export class HordeDirector {
  private readonly plans = new Map<string, Plan>();
  private nextStrikeAt = 0;
  private strikes = 0;
  private lastStriker = '';
  private startedAt = 0;

  /** A new engagement: everyone holds, the first strike comes after a breath. */
  reset(now: number): void {
    this.plans.clear(); this.nextStrikeAt = now + 1.6; this.strikes = 0; this.lastStriker = ''; this.startedAt = now;
  }

  /** The enemy that is rushing or swinging now, for the hero to face. */
  get striker(): string | undefined {
    for (const [id, plan] of this.plans) if (plan.mode === 'rush' || plan.mode === 'swing') return id;
    return undefined;
  }

  /**
   * `active` is false while a spell plays or a panel is open: nobody starts a
   * strike, rushes stop where they are, and the next strike waits a moment.
   */
  update(now: number, actors: readonly HordeActor[], hero: { x: number; z: number }, active: boolean): { goals: Map<string, HordeGoal>; events: HordeEvent[] } {
    const goals = new Map<string, HordeGoal>(), events: HordeEvent[] = [];
    const living = new Set(actors.map(actor => actor.id));
    for (const id of this.plans.keys()) if (!living.has(id)) this.plans.delete(id);
    for (const actor of actors) if (!this.plans.has(actor.id)) this.plans.set(actor.id, this.post(actor, now, { mode: 'hold', postX: actor.originX, postZ: actor.originZ, nextPostAt: 0, startedAt: now, impacted: false, recoilX: 0, recoilZ: 0 }));
    if (!active) this.nextStrikeAt = Math.max(this.nextStrikeAt, now + 1.3);
    const busy = [...this.plans.values()].filter(plan => plan.mode === 'rush' || plan.mode === 'swing').length;
    if (active && now >= this.nextStrikeAt && busy < (actors.length >= 6 ? 2 : 1)) {
      const candidates = actors.filter(actor => actor.canStrike && this.plans.get(actor.id)!.mode === 'hold')
        .sort((a, b) => Math.hypot(a.x - hero.x, a.z - hero.z) - Math.hypot(b.x - hero.x, b.z - hero.z));
      const fresh = candidates.length > 1 ? candidates.filter(actor => actor.id !== this.lastStriker) : candidates;
      const chosen = fresh[this.strikes % Math.min(3, Math.max(1, fresh.length))];
      if (chosen) {
        const plan = this.plans.get(chosen.id)!; plan.mode = 'rush'; plan.startedAt = now; plan.impacted = false;
        this.lastStriker = chosen.id; this.strikes++;
      }
      // Strikes thin out during a long think: the fight never hurries the child.
      const calm = 1 + Math.min(1.6, Math.max(0, now - this.startedAt - 8) / 12);
      this.nextStrikeAt = now + (2.1 + hash(this.strikes * 3.7) * 1.4) * calm;
    }
    for (const actor of actors) {
      const plan = this.plans.get(actor.id)!;
      const awayX = actor.x - hero.x, awayZ = actor.z - hero.z, away = Math.hypot(awayX, awayZ) || 1;
      // A swing that has not landed yet is called off with the rush.
      if (!active && (plan.mode === 'rush' || plan.mode === 'hold' || (plan.mode === 'swing' && !plan.impacted))) {
        plan.mode = 'hold';
        goals.set(actor.id, { x: actor.x, z: actor.z, run: false, faceHero: true });
        continue;
      }
      if (plan.mode === 'rush') {
        // Brutes swing from farther out so their bulk never hides the hero.
        const reach = actor.brute ? 2.7 : 1.4;
        const goal = { x: hero.x + awayX / away * reach, z: hero.z + awayZ / away * reach };
        if (Math.hypot(goal.x - actor.x, goal.z - actor.z) < .2) {
          plan.mode = 'swing'; plan.startedAt = now; events.push({ kind: 'swing', id: actor.id });
        } else if (now - plan.startedAt > RUSH_TIMEOUT) plan.mode = 'hold';
        else { goals.set(actor.id, { ...goal, run: true, faceHero: false }); continue; }
      }
      if (plan.mode === 'swing') {
        const contact = actor.brute ? BRUTE_CONTACT : STRIKE_CONTACT;
        if (!plan.impacted && now - plan.startedAt >= contact) { plan.impacted = true; events.push({ kind: 'impact', id: actor.id }); }
        if (now - plan.startedAt >= contact + .12) {
          // The ward throws the attacker back a step.
          plan.mode = 'recoil'; plan.startedAt = now; events.push({ kind: 'recoil', id: actor.id });
          const push = actor.brute ? .35 : .6;
          plan.recoilX = actor.x + awayX / away * push; plan.recoilZ = actor.z + awayZ / away * push;
        } else { goals.set(actor.id, { x: actor.x, z: actor.z, run: false, faceHero: true }); continue; }
      }
      if (plan.mode === 'recoil') {
        if (now - plan.startedAt < RECOIL_TIME) { goals.set(actor.id, { x: plan.recoilX, z: plan.recoilZ, run: true, faceHero: true }); continue; }
        plan.mode = 'hold'; this.post(actor, now, plan);
      }
      if (now >= plan.nextPostAt) this.post(actor, now, plan);
      const home = Math.hypot(plan.postX - actor.x, plan.postZ - actor.z);
      goals.set(actor.id, { x: plan.postX, z: plan.postZ, run: home > 2.4, faceHero: home < .25 });
    }
    return { goals, events };
  }

  /** A new spot to pace to: across the hero's line, near the formation point. */
  private post(actor: HordeActor, now: number, plan: Plan): Plan {
    const seed = actor.phase * 13.1 + Math.floor(now / 2.7);
    const side = hash(seed) * 2 - 1, depth = hash(seed + 5.3) * 2 - 1;
    const toX = actor.originX, toZ = actor.originZ;
    plan.postX = toX + side * WANDER; plan.postZ = toZ + depth * WANDER * .5;
    plan.nextPostAt = now + 2.6 + hash(seed + 9.1) * 2.8;
    return plan;
  }
}
