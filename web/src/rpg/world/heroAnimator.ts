import { AnimationClip, LoopOnce, type AnimationAction, type AnimationMixer, type Object3D } from 'three';
import type { HeroWalkCycle } from './heroLocomotion';

/** Bones that an upper-body action owns while the legs keep their gait. */
const UPPER_BONE = /^(Waist|Spine0\d|Neck|Head|[LR]_(Clavicle|Upperarm|Forearm|Hand))/;
const LOCOMOTION = ['idle', 'walk', 'run'] as const;
/** Clips that play once over the whole body; the legs stop. */
const FULL_BODY = new Set(['dodge', 'hit', 'hit-side', 'hit-heavy', 'knockdown', 'victory']);
/** Clips that play once and, while moving, take only the upper body. */
const UPPER_BODY = new Set(['cleave', 'cast']);
const FADE_IN = .12, FADE_OUT = .2;
const IDLE_VARIANT_AFTER = 9;

export type HeroGait = { walk?: HeroWalkCycle; run?: HeroWalkCycle };
type Shot = { name: string; action: AnimationAction; upper: boolean; age: number; hold: boolean };

function subclip(clip: AnimationClip, upper: boolean): AnimationClip {
  const tracks = clip.tracks.filter(track => UPPER_BONE.test(track.name.split('.')[0]!) === upper);
  return new AnimationClip(`${clip.name}:${upper ? 'upper' : 'lower'}`, clip.duration, tracks);
}

/** Natural ground speed of a measured in-place cycle, metres per second. */
export function gaitSpeed(cycle?: HeroWalkCycle): number {
  return cycle && cycle.duration > 0 ? cycle.strideDistance / cycle.duration : 0;
}

/** Idle/walk/run weights for a ground speed. Weights always sum to one. */
export function locomotionWeights(speed: number, walkSpeed: number, runSpeed: number): Record<typeof LOCOMOTION[number], number> {
  if (walkSpeed <= 0 || speed <= .02) return { idle: 1, walk: 0, run: 0 };
  if (speed <= walkSpeed || runSpeed <= walkSpeed) {
    const walk = Math.min(1, speed / walkSpeed);
    return { idle: 1 - walk, walk, run: 0 };
  }
  const run = Math.min(1, (speed - walkSpeed) / (runSpeed - walkSpeed));
  return { idle: 0, walk: 1 - run, run };
}

/**
 * Speed-blended locomotion with one-shot actions layered on top. Walk and run
 * share one gait phase, so feet stay planted through the blend. An upper-body
 * shot (cast, cleave) over a moving hero keeps the legs in their gait.
 */
export class HeroAnimator {
  private readonly lower = new Map<string, AnimationAction>();
  private readonly upper = new Map<string, AnimationAction>();
  private readonly full = new Map<string, AnimationAction>();
  private readonly shotUpper = new Map<string, AnimationAction>();
  private shot?: Shot;
  private phase = 0;
  private speed = 0;
  private idleTime = 0;
  private variant?: AnimationAction;
  readonly walkSpeed: number;
  readonly runSpeed: number;

  constructor(private readonly mixer: AnimationMixer, clips: readonly AnimationClip[], gait: HeroGait) {
    const byName = new Map(clips.map(clip => [clip.name.toLowerCase(), clip]));
    for (const [name, clip] of byName) {
      const full = mixer.clipAction(clip); full.setEffectiveWeight(0).play(); this.full.set(name, full);
      if ((LOCOMOTION as readonly string[]).includes(name)) {
        for (const [map, upper] of [[this.lower, false], [this.upper, true]] as const) {
          const action = mixer.clipAction(subclip(clip, upper)); action.setEffectiveWeight(0).play(); map.set(name, action);
        }
      }
      if (UPPER_BODY.has(name)) {
        const action = mixer.clipAction(subclip(clip, true)); action.setEffectiveWeight(0).play(); this.shotUpper.set(name, action);
      }
    }
    // Locomotion and the idle variant keep their own time; one-shots are re-timed on play.
    for (const action of [...this.lower.values(), ...this.upper.values()]) action.setEffectiveTimeScale(0);
    this.walkSpeed = gaitSpeed(gait.walk);
    this.runSpeed = this.full.has('run') ? Math.max(gaitSpeed(gait.run), this.walkSpeed * 1.6) : this.walkSpeed;
  }

  has(name: string): boolean { return this.full.has(name); }
  get clips(): string[] { return [...this.full.keys()]; }
  /** Highest-priority visible state, for diagnostics and tests. */
  get current(): string {
    if (this.shot) return this.shot.name;
    if (this.variant) return 'idle-look';
    const weights = locomotionWeights(this.speed, this.walkSpeed, this.runSpeed);
    return (Object.entries(weights).sort((a, b) => b[1] - a[1])[0]![0]);
  }
  get busy(): boolean { return !!this.shot && !this.shot.hold && this.shot.age < this.shot.action.getClip().duration; }

  /** Plays a one-shot. `hold` keeps its last pose until another action plays. */
  play(name: string, options: { hold?: boolean } = {}): boolean {
    if (!this.full.has(name)) return false;
    const upper = UPPER_BODY.has(name) && this.speed > .2 && this.shotUpper.has(name);
    const action = upper ? this.shotUpper.get(name)! : this.full.get(name)!;
    if (this.shot && this.shot.action !== action) this.shot.action.setEffectiveWeight(0);
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(0); action.clampWhenFinished = true;
    action.setLoop(LoopOnce, 1); action.play();
    this.shot = { name, action, upper, age: 0, hold: !!options.hold || name === 'knockdown' };
    this.endVariant();
    return true;
  }

  /** Releases a held one-shot (knockdown, victory) back to locomotion. */
  release(): void { if (this.shot) this.shot.hold = false; }

  /** Restores a saved state after a model swap. */
  restore(name: string, time: number): void {
    if (FULL_BODY.has(name) || UPPER_BODY.has(name)) { if (this.play(name)) { this.shot!.age = time; this.shot!.action.time = time; } }
  }

  get time(): number { return this.shot?.action.time ?? this.phase; }

  update(delta: number, speed: number): void {
    this.speed = speed;
    const shot = this.shot;
    let shotWeight = 0;
    if (shot) {
      shot.age += delta;
      const duration = shot.action.getClip().duration;
      const fadeOut = shot.hold ? 1 : Math.min(1, Math.max(0, (duration - shot.age) / FADE_OUT));
      shotWeight = Math.min(1, shot.age / FADE_IN, fadeOut);
      if (!shot.hold && shot.age >= duration) { shot.action.setEffectiveWeight(0); this.shot = undefined; shotWeight = 0; }
    }
    const weights = locomotionWeights(speed, this.walkSpeed, this.runSpeed);
    // One gait phase drives both cycles, advancing by distance travelled.
    const stride = weights.run > 0 ? this.walkSpeed * (1 - weights.run) + this.runSpeed * weights.run : this.walkSpeed;
    if (speed > .02 && stride > 0) this.phase = (this.phase + delta * speed / stride) % 1;
    this.updateIdleVariant(delta, weights.idle === 1 && !this.shot);
    const variantWeight = this.variant ? Math.min(1, this.idleTime / 0.6, (this.variant.getClip().duration - this.variant.time) / .6) : 0;
    const legs = this.shot && !this.shot.upper ? 1 - shotWeight : 1;
    const arms = this.shot ? 1 - shotWeight : 1;
    for (const name of LOCOMOTION) {
      const weight = weights[name] * (name === 'idle' ? 1 - variantWeight : 1);
      for (const [map, scale] of [[this.lower, legs], [this.upper, arms]] as const) {
        const action = map.get(name); if (!action) continue;
        action.setEffectiveWeight(weight * scale);
        if (name !== 'idle') action.time = this.phase * action.getClip().duration;
        else action.time = (action.time + delta) % action.getClip().duration;
      }
    }
    if (this.variant) this.variant.setEffectiveWeight(variantWeight * (1 - shotWeight));
    if (shot && this.shot) shot.action.setEffectiveWeight(shotWeight);
    this.mixer.update(delta);
  }

  private updateIdleVariant(delta: number, idle: boolean): void {
    if (!idle) { this.endVariant(); this.idleTime = 0; return; }
    this.idleTime += delta;
    if (this.variant) {
      if (this.variant.time >= this.variant.getClip().duration - .05) { this.endVariant(); this.idleTime = 0; }
      return;
    }
    const look = this.full.get('idle-look');
    if (look && this.idleTime > IDLE_VARIANT_AFTER) {
      look.reset().setEffectiveTimeScale(1).setEffectiveWeight(0).setLoop(LoopOnce, 1); look.clampWhenFinished = true; look.play();
      this.variant = look; this.idleTime = 0;
    }
  }

  private endVariant(): void { this.variant?.setEffectiveWeight(0); this.variant = undefined; }

  dispose(root: Object3D): void { this.mixer.stopAllAction(); this.mixer.uncacheRoot(root); }
}
