import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { solvePlanarLeg } from './legSupport';

type Joint = { object: Object3D; position: Vector3; rotation: Quaternion };
type Pose = { position: number[]; quaternion: number[] };
export type AuthoredGuardState = { deathAge?: number; brace?: number; injury?: number; recoil?: number };
export type AuthoredGuardSupport = {
  legs: ReadonlyMap<string, { foot: Vector3; center: Vector3; sole?: readonly Vector3[] }>;
  toSpace: (node: Object3D, point: Vector3) => Vector3;
  lowest: () => number;
  floor: number;
};
const upper = ['Body', 'Head', 'ArmUpperR', 'ArmLowerR', 'ArmUpperL', 'ArmLowerL'];
const sides = ['L', 'R'] as const;
const supportRoots = ['Body', 'LegUpperL', 'LegUpperR'];
const saturate = (value: number) => Math.max(0, Math.min(1, value));

/** Reviewed upper-body posture over neutral rigid joints, with neutral-basis IK.
 *
 * Opt-in metadata is required. Call once after the ordinary animator has reset
 * and posed its joints. Never modify the stored rest positions/quaternions.
 * Runtime animation and geometry support still require candidate-specific QA.
 */
export class AuthoredEnemyGuard {
  private readonly rotations = new Map<string, Quaternion>();
  private readonly blend = new Quaternion();
  private readonly motion = new Quaternion();
  private readonly euler = new Euler();
  private readonly point = new Vector3();
  private readonly targets = new Map<string, Vector3>();
  private readonly targetFloors = new Map<string, number>();
  private readonly weaponParent = new Quaternion();
  private readonly weaponTarget = new Quaternion();
  private readonly weaponAlong = new Vector3();
  private readonly weaponAcross = new Vector3();
  private readonly weaponNormal = new Vector3();
  private readonly weaponBasis = new Matrix4();
  private readonly drop: number;

  static create(visual: Object3D, joints: ReadonlyMap<string, Joint>): AuthoredEnemyGuard | undefined {
    let metadata: unknown;
    visual.traverse(node => { if (node.userData.authoredEnemy === true) metadata = node.userData.guardPoseYUp; });
    if (metadata === undefined) return undefined;
    try {
      const poses = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
      for (const name of upper) {
        const pose = poses?.[name];
        if (!joints.has(name) || !Array.isArray(pose?.quaternion) || pose.quaternion.length !== 4 || !pose.quaternion.every(Number.isFinite)
          || !Array.isArray(pose.position) || pose.position.length !== 3 || !pose.position.every(Number.isFinite)) return undefined;
        const length = Math.hypot(...pose.quaternion);
        if (length < .99 || length > 1.01) return undefined;
      }
      if (!['LegUpperL', 'LegLowerL', 'LegUpperR', 'LegLowerR'].every(name => joints.has(name))) return undefined;
      return new AuthoredEnemyGuard(joints, poses);
    } catch { return undefined; }
  }

  private constructor(private readonly joints: ReadonlyMap<string, Joint>, poses: Record<string, Pose>) {
    for (const name of upper) this.rotations.set(name, new Quaternion().fromArray(poses[name].quaternion).normalize());
    this.drop = Math.max(0, Math.min(.08, -poses.Body.position[1]));
    this.targets.set('L', new Vector3()); this.targets.set('R', new Vector3());
    this.targetFloors.set('L', 0); this.targetFloors.set('R', 0);
  }

  apply(state: AuthoredGuardState, support: AuthoredGuardSupport): void {
    const age = state.deathAge;
    if (age !== undefined) {
      // The legacy neutral-leg fall can put this longer anatomical shin a few
      // centimetres through the floor (71mm worst across both fall variants). Repair only that small foot intrusion;
      // deep weapon intersections require the dedicated Sword pivot/solver.
      const penetration = support.floor - support.lowest();
      if (penetration > 0 && penetration < .08) for (const name of supportRoots) this.joints.get(name)!.object.position.y += penetration;
      // The authored blade is longer than the old procedural weapon. Release
      // it toward the ground plane before the torso carries it below the floor;
      // the legacy solver only lays its weapon after .62 seconds.
      const sword = this.joints.get('Sword')?.object;
      if (sword?.parent && age > .24) {
        sword.parent.getWorldQuaternion(this.weaponParent);
        this.weaponAlong.set(0, 1, 0).applyQuaternion(this.weaponTarget.copy(this.weaponParent).multiply(sword.quaternion)).setY(0);
        if (this.weaponAlong.lengthSq() < 1e-6) this.weaponAlong.set(0, 0, 1); else this.weaponAlong.normalize();
        this.weaponAcross.set(0, 1, 0).cross(this.weaponAlong).normalize();
        this.weaponNormal.copy(this.weaponAcross).cross(this.weaponAlong);
        this.weaponTarget.setFromRotationMatrix(this.weaponBasis.makeBasis(this.weaponAcross, this.weaponAlong, this.weaponNormal));
        this.weaponTarget.premultiply(this.weaponParent.invert());
        const release = saturate((age - .24) / .16);
        sword.quaternion.slerp(this.weaponTarget, release * release * (3 - 2 * release));
      }
    }
    const progress = age === undefined ? 0 : saturate(age / .16);
    const weight = 1 - progress * progress * (3 - 2 * progress);
    if (weight === 0) return;
    for (const [name, guard] of this.rotations) {
      const joint = this.joints.get(name)!;
      // Preserve the animator's current recoil/sweep relative to neutral rest.
      this.motion.copy(joint.rotation).invert().multiply(joint.object.quaternion);
      this.blend.identity().slerp(guard, weight);
      joint.object.quaternion.copy(joint.rotation).multiply(this.blend).multiply(this.motion);
    }
    // Defeat poses already have their own whole-body ground constraints. Fade
    // the guard above, then leave that solver's support coordinates untouched.
    if (age !== undefined || this.drop === 0) return;
    const reacting = (state.brace ?? 0) > 0 || (state.injury ?? 0) > 0 || (state.recoil ?? 0) > 0;
    for (const side of sides) {
      const lower = this.joints.get(`LegLower${side}`), leg = support.legs.get(side);
      if (!lower || !leg) return;
      const target = this.targets.get(side)!;
      if (reacting) target.copy(support.toSpace(lower.object, this.point.copy(leg.foot)));
      else target.copy(leg.center);
      target.z += side === 'R' ? .075 : -.075;
      let floor = support.floor;
      if (reacting && leg.sole?.length) {
        floor = Infinity;
        for (const sole of leg.sole) floor = Math.min(floor, support.toSpace(lower.object, this.point.copy(sole)).y);
      }
      this.targetFloors.set(side, floor);
    }
    this.joints.get('Body')!.object.position.y -= this.drop;
    for (const side of sides) {
      const upperJoint = this.joints.get(`LegUpper${side}`)!, lowerJoint = this.joints.get(`LegLower${side}`)!;
      const leg = support.legs.get(side)!, target = this.targets.get(side)!;
      upperJoint.object.position.y -= this.drop;
      // A centroid target alone floats the toe/heel when the two feet pitch
      // differently. Correct each foot against its actual cached sole points.
      for (let iteration = 0; iteration < (leg.sole?.length ? 4 : 1); iteration++) {
        const pose = solvePlanarLeg(lowerJoint.position.y, lowerJoint.position.z, leg.foot.y, leg.foot.z,
          target.y - upperJoint.object.position.y, target.z - upperJoint.object.position.z);
        this.legAngle(upperJoint, pose.upper); this.legAngle(lowerJoint, pose.lower);
        if (leg.sole?.length) {
          let low = Infinity;
          for (const sole of leg.sole) low = Math.min(low, support.toSpace(lowerJoint.object, this.point.copy(sole)).y);
          const error = low - this.targetFloors.get(side)!;
          if (Math.abs(error) < .0001) break;
          target.y -= error;
        }
      }
    }
    // Use actual exported sole vertices through the animator's existing cache.
    const correction = support.lowest() - support.floor;
    if (Number.isFinite(correction)) for (const name of supportRoots) this.joints.get(name)!.object.position.y -= correction;
  }

  private legAngle(joint: Joint, angle: number): void {
    this.motion.copy(joint.rotation).invert().multiply(joint.object.quaternion);
    this.euler.setFromQuaternion(this.motion); this.euler.x = angle;
    joint.object.quaternion.copy(joint.rotation).multiply(this.motion.setFromEuler(this.euler));
  }
}
