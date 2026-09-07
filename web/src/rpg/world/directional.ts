import { MathUtils, Vector3 } from 'three';

/** Authored actors look along +Z; the phoenix ribbons were authored along -Z. */
export function targetHeading(from: Vector3, to: Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function directionalFlightDuration(from: Vector3, to: Vector3, speed = 19): number {
  return MathUtils.clamp(from.distanceTo(to) / speed, .22, .65);
}

/** One rendered tip and one contact share a tracked endpoint. Recoil must not
 * drag the projectile after arrival, and late frames must not duplicate hits. */
export function createDirectedFlight(from: Vector3, duration: number, sampleTarget: (to: Vector3) => void, contact: (to: Vector3, from: Vector3) => void) {
  const launch = from.clone(), to = new Vector3(), tip = launch.clone(), direction = new Vector3();
  let arrived = false;
  return {
    tip, direction, from: launch, to,
    update(age: number) {
      if (!arrived) sampleTarget(to);
      const progress = MathUtils.clamp((age + 1e-8) / duration, 0, 1);
      tip.lerpVectors(launch, to, progress);
      direction.subVectors(to, launch).normalize();
      if (!arrived && progress === 1) { arrived = true; contact(to, launch); }
      return progress;
    },
  };
}

/** A narrow branching ground fissure, with exact hero/target endpoints and
 * tapering sideways irregularity. Rotation is derived from its own victim. */
export function sampleGroundBranch(from: Vector3, to: Vector3, progress: number, seed: number, out = new Vector3()): Vector3 {
  const t = MathUtils.clamp(progress, 0, 1), dx = to.x - from.x, dz = to.z - from.z;
  const distance = Math.hypot(dx, dz) || 1;
  const bend = Math.sin(t * Math.PI) * Math.sin(t * 13 + seed * 2.17) * .24;
  return out.lerpVectors(from, to, t).add(new Vector3(-dz / distance * bend, 0, dx / distance * bend));
}
