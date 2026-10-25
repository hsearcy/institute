import type { Area, Level } from './levelGen';
import { farPoint, rectCenter } from './levelGen';

export type FormationPoint = Readonly<{ x: number; z: number }>;
/** Floor occupancy only: animated guardian shoulders can extend beyond this radius. */
export const ENEMY_FOOTPRINT_RADIUS = .48;
export const MIN_ENEMY_SPACING = 1.02;
export const MAX_PACK = 10;

/** Approximate screen-space body envelope for the fixed isometric camera.
 * Guards need shoulder room as well as safe foot placement. */
export function enemyScreenEnvelope(point: FormationPoint, index: number, boss: boolean) {
  const big = boss && index === 0, heavy = index % 7 === 0;
  const height = big ? 3.8 : heavy ? 2.5 : 1.85;
  const horizontal = Math.hypot(17, 20), length = Math.hypot(horizontal, 25);
  return { x: (20 * point.x - 17 * point.z) / horizontal,
    y: -(17 * point.x + 20 * point.z) * 25 / (horizontal * length) + height * horizontal / length * .5,
    rx: big ? 1.28 : heavy ? .92 : .44, ry: height * horizontal / length * .5 + .08 };
}

/**
 * A stable small formation in an area: on walkable floor, clear of features
 * and doorways, with room for every body on screen. The guardian of a sanctum
 * stands first, at the back.
 */
export function packPositions(level: Level, area: Area, count: number): FormationPoint[] {
  const wanted = Number.isFinite(count) ? Math.max(0, Math.min(MAX_PACK, Math.trunc(count))) : 0;
  if (!wanted) return [];
  const r = area.rect, center = rectCenter(r), boss = area.kind === 'sanctum';
  const doors = level.openings(area).map(opening => {
    const mid = (opening.from + opening.to) / 2;
    return opening.side === 'north' ? { x: mid, z: r.minZ } : opening.side === 'south' ? { x: mid, z: r.maxZ } : opening.side === 'east' ? { x: r.maxX, z: mid } : { x: r.minX, z: mid };
  });
  const result: FormationPoint[] = boss ? [farPoint(area, 5.4)] : [];
  let seed = area.seed;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const fits = (point: FormationPoint) => level.walkable(point.x, point.z, ENEMY_FOOTPRINT_RADIUS + .1)
    && point.x > r.minX + 1.2 && point.x < r.maxX - 1.2 && point.z > r.minZ + 1.2 && point.z < r.maxZ - 1.2
    && doors.every(door => Math.hypot(point.x - door.x, point.z - door.z) > 3.2);
  const candidates: FormationPoint[] = [];
  const grid = 1.065, rowHeight = grid * Math.sqrt(3) / 2;
  for (let row = 0, z = r.minZ + .5; z < r.maxZ; row++, z += rowHeight) {
    for (let x = r.minX + .5 + (row % 2) * grid / 2; x < r.maxX; x += grid) {
      const point = { x: x + (random() - .5) * .024, z: z + (random() - .5) * .024 };
      if (fits(point) && result.every(other => Math.hypot(point.x - other.x, point.z - other.z) >= MIN_ENEMY_SPACING * (boss ? 1.6 : 1))) candidates.push(point);
    }
  }
  // Packs gather near the middle in three loose groups.
  const spread = Math.min(4, (r.maxX - r.minX) / 4);
  // A guardian's guard closes in front of it, toward the arrival.
  const guard = (along: number, inset: number) => {
    const at = farPoint(area, inset), sideways = area.back === 'north' || area.back === 'south';
    return sideways ? { x: at.x + along, z: at.z } : { x: at.x, z: at.z + along };
  };
  const anchors = boss
    ? [guard(-3.6, 6.4), guard(3.6, 6.4), guard(0, 8.6)]
    : [{ x: center.x - spread, z: center.z - 1.6 }, { x: center.x + spread, z: center.z - 2.2 }, { x: center.x + .4, z: center.z + 1.8 }];
  const separated = (point: FormationPoint) => {
    const candidate = enemyScreenEnvelope(point, result.length, boss);
    return result.every((other, index) => {
      const body = enemyScreenEnvelope(other, index, boss);
      return Math.abs(candidate.x - body.x) >= candidate.rx + body.rx + .18 || Math.abs(candidate.y - body.y) >= candidate.ry + body.ry + .12;
    });
  };
  const used = new Set<number>();
  const distanceSquared = (a: FormationPoint, b: FormationPoint) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  const clearance = candidates.map(point => result.length ? Math.min(...result.map(other => distanceSquared(point, other))) : Infinity);
  // Stable variation breaks up symmetric rows without sacrificing floor clearance.
  const weights = candidates.map(() => .88 + random() * .24);
  const select = (index: number) => {
    used.add(index);
    const point = candidates[index]!; result.push({ ...point });
    for (let i = 0; i < candidates.length; i++) clearance[i] = Math.min(clearance[i]!, distanceSquared(point, candidates[i]!));
  };
  for (const anchor of anchors) {
    if (result.length >= wanted) break;
    let nearest = -1, distance = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const next = distanceSquared(anchor, candidates[i]!);
      if (!used.has(i) && separated(candidates[i]!) && next < distance) { nearest = i; distance = next; }
    }
    if (nearest !== -1) select(nearest);
  }
  while (result.length < wanted) {
    let best = -1, score = -Infinity;
    const anchor = anchors[(result.length - (boss ? 1 : 0)) % anchors.length]!;
    for (let i = 0; i < candidates.length; i++) {
      // Capping the attraction to empty space keeps small packs together instead
      // of sending their next member to the farthest corner of the area.
      const next = (clearance[i]! >= 1.8 ** 2 ? 1 : .01) * weights[i]! / (1 + distanceSquared(candidates[i]!, anchor) * .18);
      if (!used.has(i) && clearance[i]! >= MIN_ENEMY_SPACING ** 2 && separated(candidates[i]!) && next > score) { best = i; score = next; }
    }
    // A crowded area still takes the whole pack: spacing relaxes before anyone is dropped.
    if (best === -1) {
      for (let i = 0; i < candidates.length; i++) if (!used.has(i) && clearance[i]! >= MIN_ENEMY_SPACING ** 2) { best = i; break; }
    }
    if (best === -1) throw new Error(`Area ${area.name} cannot fit ${wanted} enemies (${result.length} placed)`);
    select(best);
  }
  return result;
}
