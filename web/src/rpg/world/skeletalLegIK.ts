import { Bone, Quaternion, Vector3 } from 'three';

/** World-space two-bone IK. Targets and the knee pole are world positions.
 * Keeps local joint positions/scale unchanged. Supports arbitrary rest frames
 * and uniform actor scale. Call after posing the pelvis; update skin matrices
 * after solving both legs. The optional foot quaternion is a WORLD orientation.
 * Returns false for an unreachable/invalid target; unreachable legs stop at
 * their physical reach without stretching. Non-uniform ancestor scale is not
 * supported because it makes quaternion-only rotation a sheared transform.
 */
export function solveTwoBoneWorld(
  hip: Bone, shin: Bone, foot: Bone, target: Vector3, pole: Vector3, footRotation?: Quaternion,
): boolean {
  if (![...target.toArray(), ...pole.toArray()].every(Number.isFinite)) return false;
  hip.updateWorldMatrix(true, true);
  const start = hip.getWorldPosition(new Vector3());
  const knee = shin.getWorldPosition(new Vector3());
  const end = foot.getWorldPosition(new Vector3());
  const upper = start.distanceTo(knee), lower = knee.distanceTo(end);
  if (upper < 1e-8 || lower < 1e-8) return false;
  const direction = target.clone().sub(start), requested = direction.length();
  if (requested < 1e-8) direction.copy(end).sub(start);
  if (direction.lengthSq() < 1e-16) direction.set(0, -1, 0);
  direction.normalize();
  const minimum = Math.max(1e-8, Math.abs(upper - lower)), maximum = upper + lower;
  const distance = Math.max(minimum, Math.min(maximum, requested));
  const bend = pole.clone().sub(start);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-16) {
    bend.copy(knee).sub(start).addScaledVector(direction, -knee.clone().sub(start).dot(direction));
    if (bend.lengthSq() < 1e-16) {
      bend.set(Math.abs(direction.x) < .9 ? 1 : 0, Math.abs(direction.x) < .9 ? 0 : 1, 0);
      bend.addScaledVector(direction, -bend.dot(direction));
    }
  }
  bend.normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const across = Math.sqrt(Math.max(0, upper * upper - along * along));
  const kneeTarget = start.clone().addScaledVector(direction, along).addScaledVector(bend, across);
  const endTarget = start.clone().addScaledVector(direction, distance);
  const setWorldRotation = (bone: Bone, rotation: Quaternion) => {
    const parent = bone.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
    bone.quaternion.copy(parent.normalize().invert().multiply(rotation)).normalize();
    bone.updateWorldMatrix(false, true);
  };
  const aim = (bone: Bone, child: Bone, point: Vector3) => {
    const origin = bone.getWorldPosition(new Vector3());
    const from = child.getWorldPosition(new Vector3()).sub(origin).normalize();
    const to = point.clone().sub(origin).normalize();
    const rotation = new Quaternion().setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(new Quaternion()));
    setWorldRotation(bone, rotation);
  };
  aim(hip, shin, kneeTarget);
  aim(shin, foot, endTarget);
  if (footRotation) setWorldRotation(foot, footRotation);
  return requested >= minimum - 1e-7 && requested <= maximum + 1e-7;
}
