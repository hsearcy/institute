import type { Euler, Vector3 } from 'three';
import { getRoomLayout } from './roomLayout';

export function heroDoorwayRoute(previousRoom: number, room: number): readonly { x: number; z: number }[] {
  if (room !== previousRoom + 1) return [];
  const { doorX } = getRoomLayout(previousRoom), center = -20 * previousRoom;
  // Align before the decorative steps, keep straight through the arch/pier
  // depth, then turn toward the next encounter's hero mark.
  return [{ x: doorX, z: center - 7 }, { x: doorX, z: center - 11.2 }];
}

// Measured from the authored ankle paths:1.209m per cycle at1.85m source
// height, normalized to the game's1.8m hero. Clip duration is0.8 seconds.
export const HERO_STRIDE_DISTANCE = 1.20923161 * 1.8 / 1.85;
export const HERO_WALK_DURATION = .8;

export function advanceHeroTravel(distance: number, speed: number, delta: number): { distance: number; speed: number; clipRate: number } {
  if (distance <= 0 || delta <= 0) return { distance: 0, speed: 0, clipRate: 0 };
  const acceleration = 9;
  const desiredSpeed = Math.min(3, Math.sqrt(2 * acceleration * distance));
  const nextSpeed = Math.max(0, speed + Math.max(-acceleration * delta, Math.min(acceleration * delta, desiredSpeed - speed)));
  const step = Math.min(distance, (speed + nextSpeed) * .5 * delta);
  return { distance: step, speed: step >= distance ? 0 : nextSpeed, clipRate: step / delta / HERO_STRIDE_DISTANCE * HERO_WALK_DURATION };
}

export function setPlanarHeroHeading(rotation: Euler, heading: number): void {
  // Quaternion copying may decompose yaw>90 degrees into Euler X/Z=PI.
  // Updating only Y would retain those axes and reverse the actor's heading.
  rotation.set(0, heading, 0);
}

export function settleHeroTravel(hero: Vector3, camera: Vector3, cameraTarget: Vector3, destination: Vector3): boolean {
  if (hero.distanceToSquared(destination) <= .025 ** 2) return false;
  // A rapid correct answer cuts to the active encounter before effect timing
  // starts. Keep the camera's composition; never attack a room from its hallway.
  camera.add(destination.clone().sub(cameraTarget));
  cameraTarget.copy(destination); hero.copy(destination);
  return true;
}
