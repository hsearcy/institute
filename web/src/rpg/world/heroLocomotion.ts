import type { Euler } from 'three';

export interface HeroWalkCycle { strideDistance: number; duration: number }

/** `maxSpeed` above the walk pace lets a hero with a run clip run long routes. */
export function advanceHeroTravel(distance: number, speed: number, delta: number, cycle?: HeroWalkCycle, maxSpeed = 3): { distance: number; speed: number; clipRate: number } {
  if (distance <= 0 || delta <= 0) return { distance: 0, speed: 0, clipRate: 0 };
  const acceleration = 18;
  const desiredSpeed = Math.min(Math.max(3, maxSpeed), Math.sqrt(2 * acceleration * distance));
  const nextSpeed = Math.max(0, speed + Math.max(-acceleration * delta, Math.min(acceleration * delta, desiredSpeed - speed)));
  const step = Math.min(distance, (speed + nextSpeed) * .5 * delta);
  return { distance: step, speed: step >= distance ? 0 : nextSpeed, clipRate: cycle && cycle.strideDistance > 0 && cycle.duration > 0 ? step / delta / cycle.strideDistance * cycle.duration : 1 };
}

export function setPlanarHeroHeading(rotation: Euler, heading: number): void {
  // Quaternion copying may decompose yaw>90 degrees into Euler X/Z=PI.
  // Updating only Y would retain those axes and reverse the actor's heading.
  rotation.set(0, heading, 0);
}
