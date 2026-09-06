/** Presentation coordinates are local to a room; the renderer adds -20 * roomIndex to z. */
export type RoomPoint = Readonly<{ x: number; z: number }>;
export type RoomBounds = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
export type RoomLandmark = RoomPoint & Readonly<{ id: string; radius: number }>;
export type RoomLayout = Readonly<{
  id: string;
  name: string;
  sideWallX: number;
  sideWallWidth: number;
  wallHeight: number;
  wallHeights: Readonly<{ left: number; right: number; back: number }>;
  doorX: number;
  heroX: number;
  heroZ: number;
  heroClearance: number;
  walkable: RoomBounds;
  /** Incoming travel lane. The onward route is used after this horde is defeated. */
  heroPath: RoomBounds;
  landmarks: readonly RoomLandmark[];
  hordeAnchors: readonly RoomPoint[];
  bossAnchor?: RoomPoint;
}>;

/** Floor occupancy only: animated guardian shoulders can extend beyond this radius. */
export const ENEMY_FOOTPRINT_RADIUS = .48;
export const MIN_ENEMY_SPACING = 1.02;
export const MAX_ROOM_ENEMIES = 10;

/** The crossing has two real floor openings beside its 9.6m-wide central bridge. */
export function isCrossingChasm(roomIndex: number, x: number, z: number): boolean {
  return roomIndex === 3 && Math.abs(x) > 4.8 && Math.abs(x) < 11 && Math.abs(z) < 4;
}

/** Room-local transformed bounds. Touching the supported rim is allowed;
 * extending into either open interior is not, even when the center is on land. */
export function boundsIntersectCrossingChasm(roomIndex: number, bounds: RoomBounds): boolean {
  return roomIndex === 3 && bounds.maxZ > -4 && bounds.minZ < 4
    && ((bounds.maxX > -11 && bounds.minX < -4.8) || (bounds.maxX > 4.8 && bounds.minX < 11));
}

export function roomFloorPatches(roomIndex: number): {x:number;z:number;width:number;depth:number}[] {
  if (roomIndex === 0) return [{x:0,z:10,width:46,depth:40}];
  if (roomIndex !== 3) return [{x:0,z:0,width:46,depth:20}];
  return [{x:0,z:-7,width:46,depth:6},{x:0,z:7,width:46,depth:6},
    {x:0,z:0,width:9.6,depth:8},{x:-17,z:0,width:12,depth:8},{x:17,z:0,width:12,depth:8}];
}

type RoomSpec = Omit<RoomLayout, 'heroZ' | 'heroClearance' | 'heroPath' | 'wallHeight'>;
const room = (spec: RoomSpec, previous?: RoomSpec): RoomLayout => ({
  ...spec, heroZ: 1.4, heroClearance: 1.15, wallHeight: spec.wallHeights.left,
  heroPath: {
    minX: Math.min(spec.heroX, previous?.heroX ?? spec.heroX, previous?.doorX ?? spec.heroX) - .38,
    maxX: Math.max(spec.heroX, previous?.heroX ?? spec.heroX, previous?.doorX ?? spec.heroX) + .38,
    minZ: .6, maxZ: 10,
  },
});

const roomSpecs: readonly RoomSpec[] = [
  { id: 'gate', name: 'The Broken Gate', sideWallX: 10.8, sideWallWidth: 1.15,
    wallHeights: { left: 5.8, right: 1.25, back: 6.0 }, doorX: 0, heroX: 0,
    walkable: { minX: -6.8, maxX: 6.8, minZ: -7.4, maxZ: 7.6 }, landmarks: [],
    hordeAnchors: [{ x: -3.8, z: -2.8 }, { x: 3.8, z: -2.8 }, { x: 0, z: -5.5 }], },
  { id: 'ember-hall', name: 'The Ember Hall', sideWallX: 12.8, sideWallWidth: 1.35,
    wallHeights: { left: 6.5, right: 1.0, back: 5.4 }, doorX: 1.7, heroX: 1.2,
    walkable: { minX: -7.1, maxX: 7.1, minZ: -7.4, maxZ: 7.6 },
    landmarks: [{ id: 'furnace', x: -7.6, z: -3, radius: 1.8 }],
    hordeAnchors: [{ x: -4.4, z: -3.6 }, { x: 2.6, z: -4.5 }, { x: -2.8, z: 4.4 }], },
  { id: 'reliquary', name: 'The Lost Reliquary', sideWallX: 11.3, sideWallWidth: 1.05,
    wallHeights: { left: 5.0, right: 1.55, back: 6.4 }, doorX: -1.5, heroX: -.8,
    walkable: { minX: -6.8, maxX: 6.8, minZ: -7.4, maxZ: 7.6 },
    landmarks: [{ id: 'reliquary', x: -7.3, z: -3.7, radius: 1.6 }],
    hordeAnchors: [{ x: 3.8, z: -4.4 }, { x: -3.8, z: -1.8 }, { x: 4.0, z: 4.0 }], },
  { id: 'collapsed-crossing', name: 'The Collapsed Crossing', sideWallX: 12.2, sideWallWidth: .85,
    wallHeights: { left: 2.8, right: .75, back: 4.0 }, doorX: 0, heroX: 0,
    walkable: { minX: -4.5, maxX: 4.5, minZ: -8.4, maxZ: 8.4 }, landmarks: [],
    hordeAnchors: [{ x: -2.6, z: -4.6 }, { x: 2.6, z: -2.3 }, { x: 2.7, z: 5.3 }], },
  { id: 'crystal-gallery', name: 'The Crystal Gallery', sideWallX: 13.1, sideWallWidth: 1.0,
    wallHeights: { left: 6.0, right: 1.05, back: 5.7 }, doorX: -1.8, heroX: 1.1,
    walkable: { minX: -7.1, maxX: 7.1, minZ: -7.4, maxZ: 7.6 },
    landmarks: [{ id: 'west-crystals', x: -7.6, z: -2, radius: 1.6 }, { id: 'east-crystals', x: 7.6, z: -4, radius: 1.6 }],
    hordeAnchors: [{ x: -3.5, z: -4.6 }, { x: 3.5, z: -2.5 }, { x: -3.3, z: 4.6 }], },
  { id: 'boss-sanctum', name: 'The Guardian Sanctum', sideWallX: 13.8, sideWallWidth: 1.6,
    wallHeights: { left: 7.0, right: 1.5, back: 7.5 }, doorX: 0, heroX: 0,
    walkable: { minX: -7.1, maxX: 7.1, minZ: -7.0, maxZ: 7.6 },
    landmarks: [{ id: 'altar', x: 0, z: -8, radius: 1.5 }], bossAnchor: { x: 0, z: -4 },
    hordeAnchors: [{ x: -3.8, z: -3.4 }, { x: 3.8, z: -3.4 }, { x: 0, z: -5.9 }], },
];
const layouts: readonly RoomLayout[] = roomSpecs.map((spec, index) => room(spec, roomSpecs[index - 1]));

export function getRoomLayout(roomIndex: number): RoomLayout {
  return layouts[Number.isFinite(roomIndex) ? Math.max(0, Math.min(5, Math.trunc(roomIndex))) : 0];
}

function distanceToBounds(point: RoomPoint, bounds: RoomBounds): number {
  return Math.hypot(Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX), Math.max(bounds.minZ - point.z, 0, point.z - bounds.maxZ));
}

function fits(layout: RoomLayout, point: RoomPoint): boolean {
  const r = ENEMY_FOOTPRINT_RADIUS, b = layout.walkable;
  return point.x - r >= b.minX && point.x + r <= b.maxX && point.z - r >= b.minZ && point.z + r <= b.maxZ
    && distanceToBounds(point, layout.heroPath) >= r
    && Math.hypot(point.x - layout.heroX, point.z - layout.heroZ) >= layout.heroClearance + r
    && layout.landmarks.every(landmark => Math.hypot(point.x - landmark.x, point.z - landmark.z) >= landmark.radius + r);
}

/** Approximate screen-space body envelope for the fixed isometric camera.
 * Guards need shoulder room as well as safe foot placement. */
export function enemyScreenEnvelope(point: RoomPoint, index: number, roomIndex: number) {
  const boss = roomIndex === 5 && index === 0, heavy = index % 7 === 0;
  const height = boss ? 3.8 : heavy ? 2.5 : 1.85;
  const horizontal = Math.hypot(17, 20), length = Math.hypot(horizontal, 25);
  return { x: (20 * point.x - 17 * point.z) / horizontal,
    y: -(17 * point.x + 20 * point.z) * 25 / (horizontal * length) + height * horizontal / length * .5,
    rx: boss ? 1.28 : heavy ? .92 : .44, ry: height * horizontal / length * .5 + .08 };
}

/** Stable small formations respect floor, route and projected body clearance. */
export function enemyPositions(roomIndex: number, count: number): RoomPoint[] {
  const layout = getRoomLayout(roomIndex);
  const wanted = Number.isFinite(count) ? Math.max(0, Math.min(MAX_ROOM_ENEMIES, Math.trunc(count))) : 0;
  if (!wanted) return [];
  const result: RoomPoint[] = layout.bossAnchor ? [{ ...layout.bossAnchor }] : [];
  const candidates: RoomPoint[] = [];
  const grid = 1.065, rowHeight = grid * Math.sqrt(3) / 2;
  // A fixed seed from the room ID makes retries and direct room jumps identical.
  let seed = [...layout.id].reduce((n, char) => Math.imul(n, 31) + char.charCodeAt(0) | 0, 214);
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  for (let row = 0, z = layout.walkable.minZ + .5; z < layout.walkable.maxZ; row++, z += rowHeight) {
    for (let x = layout.walkable.minX + .5 + (row % 2) * grid / 2; x < layout.walkable.maxX; x += grid) {
      const point = { x: x + (random() - .5) * .024, z: z + (random() - .5) * .024 };
      if (fits(layout, point) && result.every(other => Math.hypot(point.x - other.x, point.z - other.z) >= MIN_ENEMY_SPACING)) candidates.push(point);
    }
  }
  const separated = (point: RoomPoint) => {
    const candidate = enemyScreenEnvelope(point, result.length, roomIndex);
    return result.every((other, index) => {
      const body = enemyScreenEnvelope(other, index, roomIndex);
      return Math.abs(candidate.x - body.x) >= candidate.rx + body.rx + .18
        || Math.abs(candidate.y - body.y) >= candidate.ry + body.ry + .12;
    });
  };
  const used = new Set<number>();
  const distanceSquared = (a: RoomPoint, b: RoomPoint) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  const clearance = candidates.map(point => result.length ? Math.min(...result.map(other => distanceSquared(point, other))) : Infinity);
  // Stable variation breaks up symmetric rows without sacrificing floor clearance.
  const weights = candidates.map(() => .88 + random() * .24);
  const select = (index: number) => {
    used.add(index);
    const point = candidates[index]; result.push({ ...point });
    for (let i = 0; i < candidates.length; i++) clearance[i] = Math.min(clearance[i], distanceSquared(point, candidates[i]));
  };
  for (const anchor of layout.hordeAnchors) {
    if (result.length >= wanted) break;
    let nearest = -1, distance = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const next = distanceSquared(anchor, candidates[i]);
      if (!used.has(i) && separated(candidates[i]) && next < distance) { nearest = i; distance = next; }
    }
    if (nearest !== -1) select(nearest);
  }
  while (result.length < wanted) {
    let best = -1, score = -Infinity;
    const anchor = layout.hordeAnchors[(result.length - (layout.bossAnchor ? 1 : 0)) % layout.hordeAnchors.length];
    const groupClearance = 1.8;
    for (let i = 0; i < candidates.length; i++) {
      // Capping the attraction to empty space keeps small packs together instead
      // of sending their next member to the farthest corner of the entire room.
      const next = (clearance[i] >= groupClearance ** 2 ? 1 : .01) * weights[i] / (1 + distanceSquared(candidates[i], anchor) * .18);
      if (!used.has(i) && clearance[i] >= MIN_ENEMY_SPACING ** 2 && separated(candidates[i]) && next > score) { best = i; score = next; }
    }
    if (best === -1) throw new Error(`Room ${layout.id} cannot fit ${wanted} enemies safely (${result.length} available)`);
    select(best);
  }
  return result;
}
