import { Euler, Object3D, Quaternion, Vector3 } from 'three';

export type EnemyPoseState = {
  /** Cosmetic step intensity, 0..1. Never determines travel or combat. */
  moving?: number;
  /** Enables the periodic sword/arm warning gesture; 0 disables it. */
  threat?: number;
  /** Optional short recoil envelope, 0..1. */
  recoil?: number;
  /** Seconds since defeat; omitted while alive. */
  deathAge?: number;
};
type Joint = { object: Object3D; position: Vector3; rotation: Quaternion; index: number };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Rigid articulated poses. Shared geometry/materials remain suitable for instancing. */
export class EnemyAnimator {
  readonly articulated: boolean;
  private readonly joints = new Map<string, Joint>();
  private readonly euler = new Euler();
  private readonly offset = new Quaternion();
  private readonly brute: boolean;
  private readonly armored: boolean;
  private readonly phase: number;

  constructor(visual: Object3D, options: { kind: string; phase: number }) {
    this.brute = options.kind === 'guardian'; this.armored = options.kind === 'revenant'; this.phase = options.phase;
    visual.traverse(object => {
      const name = typeof object.userData.enemyJoint === 'string'
        ? object.userData.enemyJoint : /^Joint_(\w+)/.exec(object.name)?.[1];
      if (name) this.joints.set(name, { object, position: object.position.clone(), rotation: object.quaternion.clone(), index: this.joints.size });
    });
    this.articulated = this.joints.has('ArmUpperR') && this.joints.has('LegUpperL');
  }

  /** Updates local joint transforms only; caller updates matrixWorld before batching. */
  update(seconds: number, state: EnemyPoseState = {}): void {
    if (!this.articulated) return;
    for (const joint of this.joints.values()) {
      joint.object.position.copy(joint.position); joint.object.quaternion.copy(joint.rotation);
    }
    const t = seconds + this.phase, pace = this.brute ? 2.2 : this.armored ? 2.65 : 3.3;
    const step = Math.sin(t * pace), stride = clamp(state.moving ?? .35);
    const breathe = Math.sin(t * 1.35), bodyTwist = Math.sin(t * .83);
    const weight = this.brute ? .65 : this.armored ? .82 : 1;
    this.rotate('Body', .025 + breathe * .015, bodyTwist * .045, step * .025);
    this.rotate('Head', -.025 + Math.sin(t * 1.1) * .025, -bodyTwist * .08, 0);
    for (const [side, sign] of [['L', -1], ['R', 1]] as const) {
      const leg = step * sign;
      this.rotate(`LegUpper${side}`, leg * .24 * stride, 0, sign * .025);
      this.rotate(`LegLower${side}`, Math.max(0, -leg) * .31 * stride, 0, 0);
      this.rotate(`ArmUpper${side}`, -.08 - leg * .14 * stride, sign * .035, sign * .07);
      this.rotate(`ArmLower${side}`, -.13 - Math.max(0, leg) * .10, 0, sign * .025);
    }
    if (this.armored) {
      // Keep the broken shield braced in front of the heavy soldier while the
      // sword arm retains its independent windup. This is a cosmetic pose only.
      this.rotate('ArmUpperL', -.34 - Math.max(0, step) * .045, -.08, -.12);
      this.rotate('ArmLowerL', -.48, -.06, -.04);
    }
    this.rotate('Cape', .06 + Math.sin(t * 1.7) * .05, Math.sin(t * 1.1) * .035, -bodyTwist * .05);
    // A readable windup, sweep, and recover. This never produces a gameplay hit.
    const cycle = ((t % 5.7) + 5.7) % 5.7;
    const windup = smooth((cycle - 3.4) / .65) * (1 - smooth((cycle - 4.08) / .28));
    const sweep = smooth((cycle - 4.06) / .23) * (1 - smooth((cycle - 4.34) / .8));
    const threat = clamp(state.threat ?? 1) * weight;
    if (threat > 0 && windup + sweep > 0) {
      this.rotate('ArmUpperR', (-.75 * windup + .25 * sweep) * threat, (-.30 * windup + .62 * sweep) * threat, (-.55 * windup + .22 * sweep) * threat);
      this.rotate('ArmLowerR', (-.75 * windup - .15 * sweep) * threat, 0, 0);
      this.rotate('ArmUpperL', (this.armored ? -.34 : -.12) - .27 * sweep * threat, this.armored ? -.08 : 0, -.18 * windup * threat);
      this.rotate('Body', .02, (-.16 * windup + .19 * sweep) * threat, -.045 * sweep);
      this.rotate('Head', -.025, (.13 * windup - .14 * sweep) * threat, 0);
    }
    const death = state.deathAge;
    const recoil = Math.max(clamp(state.recoil ?? 0), death === undefined ? 0 : Math.sin(clamp(death / .22) * Math.PI) * .9);
    if (recoil > 0) {
      this.rotate('Body', -.30 * recoil, -.13 * recoil, 0);
      this.rotate('Head', -.24 * recoil, .12 * recoil, .12 * recoil);
      this.rotate('ArmUpperL', -.37 * recoil, -.14 * recoil, -.35 * recoil);
      this.rotate('ArmUpperR', -.22 * recoil, .15 * recoil, .38 * recoil);
    }
    if (death !== undefined) this.breakApart(Math.max(0, death));
  }

  private rotate(name: string, x: number, y: number, z: number): void {
    const joint = this.joints.get(name); if (!joint) return;
    this.offset.setFromEuler(this.euler.set(x, y, z));
    joint.object.quaternion.copy(joint.rotation).multiply(this.offset);
  }

  private breakApart(age: number): void {
    if (age <= .12) return; // Let the initial shoulder/head recoil read first.
    const release = smooth((age - .12) / .38), fall = Math.max(0, age - .28);
    for (const [name, joint] of this.joints) {
      if (name === 'Body') continue;
      const sign = name.endsWith('L') ? -1 : name.endsWith('R') ? 1 : Math.sin(joint.index * 2.3 + this.phase);
      const isLeg = name.startsWith('Leg'), isLower = name.includes('Lower');
      const lateral = (isLower ? .18 : isLeg ? .16 : .32) * release;
      joint.object.position.x += sign * lateral;
      joint.object.position.y += (name === 'Head' ? .34 : .12) * Math.sin(Math.min(1, age / .8) * Math.PI) - fall * fall * (isLeg ? .55 : .85);
      joint.object.position.z += Math.sin(this.phase + joint.index * 1.7) * .20 * release;
      this.rotate(name, release * (.25 + Math.sin(joint.index + this.phase) * .65), sign * release * .55, sign * release * (isLeg ? .48 : .95));
    }
  }
}
