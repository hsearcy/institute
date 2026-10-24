import { getRoomLayout, type RoomPoint } from './roomLayout';

/** The hero engages a horde when any living enemy is this close. */
export const ENGAGE_RADIUS = 4.6;
/** Before engagement the horde waits in the far part of its room. */
const STAGE_DEPTH = .6;
const HERO_RADIUS = .38;
const DOOR_HALF_WIDTH = 1.05;

const roomCenter = (room: number) => -20 * room;

/** Where a freshly entered room places the hero: just inside its entry. */
export function roomEntry(room: number, regionId?: string): RoomPoint {
  const layout = getRoomLayout(room, regionId);
  return { x: layout.heroX, z: roomCenter(room) + layout.walkable.maxZ - 1.1 };
}

/** A formation point pulled toward the back wall while the horde waits. */
export function stagedEnemyPoint(room: number, point: RoomPoint, regionId?: string): RoomPoint {
  const { walkable } = getRoomLayout(room, regionId);
  const back = walkable.minZ + .5;
  return { x: point.x, z: back + (point.z - back) * STAGE_DEPTH };
}

const walkableCache = new Map<string, (x: number, z: number) => boolean>();
/**
 * Floor the hero may walk on: the current room, and while the previous room
 * is still near, that room and the doorway corridor between them.
 */
export function heroWalkable(room: number, regionId?: string): (x: number, z: number) => boolean {
  const key = `${regionId ?? ''}:${room}`;
  const cached = walkableCache.get(key); if (cached) return cached;
  const walkable = buildWalkable(room, regionId); walkableCache.set(key, walkable); return walkable;
}

function buildWalkable(room: number, regionId?: string): (x: number, z: number) => boolean {
  const rooms = [room - 1, room].filter(index => index >= 0).map(index => {
    const layout = getRoomLayout(index, regionId), center = roomCenter(index);
    return {
      bounds: layout.walkable, center,
      landmarks: layout.landmarks.map(landmark => ({ x: landmark.x, z: center + landmark.z, radius: landmark.radius })),
    };
  });
  const corridor = room > 0 ? (() => {
    const previous = getRoomLayout(room - 1, regionId), next = getRoomLayout(room, regionId), center = roomCenter(room - 1);
    // Overlap both room floors so the hero never meets a seam at the threshold.
    return { x: previous.doorX, fromZ: center + previous.walkable.minZ + 1, toZ: center - 20 + next.walkable.maxZ - 1 };
  })() : undefined;
  return (x, z) => {
    if (corridor && Math.abs(x - corridor.x) <= DOOR_HALF_WIDTH - HERO_RADIUS && z <= corridor.fromZ && z >= corridor.toZ) return true;
    return rooms.some(({ bounds, center, landmarks }) =>
      x >= bounds.minX + HERO_RADIUS && x <= bounds.maxX - HERO_RADIUS
      && z >= center + bounds.minZ + HERO_RADIUS && z <= center + bounds.maxZ - HERO_RADIUS
      && landmarks.every(landmark => Math.hypot(x - landmark.x, z - landmark.z) >= landmark.radius + HERO_RADIUS));
  };
}

/** Moves toward a point and slides along blocked edges. Returns the new point. */
export function slideStep(from: RoomPoint, dx: number, dz: number, walkable: (x: number, z: number) => boolean): RoomPoint {
  if (walkable(from.x + dx, from.z + dz)) return { x: from.x + dx, z: from.z + dz };
  if (Math.abs(dx) > 1e-4 && walkable(from.x + dx, from.z)) return { x: from.x + dx, z: from.z };
  if (Math.abs(dz) > 1e-4 && walkable(from.x, from.z + dz)) return { x: from.x, z: from.z + dz };
  return from;
}

/** Waypoints for a click: through the doorway when the click is in the other room. */
export function heroClickRoute(from: RoomPoint, to: RoomPoint, room: number, regionId?: string): RoomPoint[] {
  if (room <= 0) return [to];
  const previous = getRoomLayout(room - 1, regionId), center = roomCenter(room - 1);
  const doorTop = center + previous.walkable.minZ, doorBottom = center - 20 + getRoomLayout(room, regionId).walkable.maxZ;
  // A click past the far wall means the next room: go through the doorway.
  const side = (z: number) => z > doorTop ? -1 : z < doorBottom ? 1 : 0;
  const a = side(from.z), b = to.z > doorTop ? -1 : 1;
  if (a === b || a === 0) return [to];
  const door = previous.doorX;
  return a < b
    ? [{ x: door, z: doorTop + .6 }, { x: door, z: doorBottom - .6 }, to]
    : [{ x: door, z: doorBottom - .6 }, { x: door, z: doorTop + .6 }, to];
}
