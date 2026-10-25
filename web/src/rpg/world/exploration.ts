/** A point on the floor, in world metres. */
export type FloorPoint = Readonly<{ x: number; z: number }>;

/** The hero engages a horde when any living enemy is this close: combat begins on sight, while the hero still moves. */
export const ENGAGE_RADIUS = 6.5;

/** Moves toward a point and slides along blocked edges. Returns the new point. */
export function slideStep(from: FloorPoint, dx: number, dz: number, walkable: (x: number, z: number) => boolean): FloorPoint {
  if (walkable(from.x + dx, from.z + dz)) return { x: from.x + dx, z: from.z + dz };
  if (Math.abs(dx) > 1e-4 && walkable(from.x + dx, from.z)) return { x: from.x + dx, z: from.z };
  if (Math.abs(dz) > 1e-4 && walkable(from.x, from.z + dz)) return { x: from.x, z: from.z + dz };
  return from;
}
