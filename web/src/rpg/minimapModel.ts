/**
 * Pure helpers for finding the next fight: the minimap's screen-aligned
 * projection, what the hero has seen, and how loud and where an unseen pack
 * sounds. Presentation only; nothing here changes where a pack waits.
 */
import type { Rect } from './world/levelGen';

export type Point = Readonly<{ x: number; z: number }>;

/** What the world shares with the minimap and the pack's idle sounds. */
export type ScoutView = Readonly<{
  areas: readonly Readonly<{ id: number; rect: Rect; visited: boolean }>[];
  corridors: readonly Readonly<{ id: number; rects: readonly Rect[]; from: number; to: number }>[];
  openExits: readonly Point[];
  chests: readonly Readonly<{ x: number; z: number; opened?: boolean }>[];
  hero: Point;
  /** Planar heading as in Object3D.rotation.y: 0 faces +z. */
  heading: number;
  /** The middle of the living pack, if there is one. */
  pack?: Point;
  /** The id of the area that holds the pack. */
  packArea?: number;
  /** The pack was on screen within the last second. */
  packOnScreen: boolean;
  engaged: boolean;
  /** The hero is looking for the fight: a problem waits for the pack or a chest. */
  searching: boolean;
}>;

// The isometric camera sits at offset (17, 25, 20) from the hero.
const FLAT = Math.hypot(17, 20);
/** Screen right and screen down, as unit vectors on the floor. */
export const SCREEN_RIGHT: Point = { x: 20 / FLAT, z: -17 / FLAT };
export const SCREEN_DOWN: Point = { x: 17 / FLAT, z: 20 / FLAT };
/** The camera looks down at this angle, so floor depth is drawn this much shorter. */
export const SCREEN_TILT = Math.sin(Math.atan2(25, FLAT));

/** A floor offset in metres to minimap pixels: right is screen right, down is screen down. */
export function toScreen(dx: number, dz: number, scale: number): { x: number; y: number } {
  return { x: (dx * SCREEN_RIGHT.x + dz * SCREEN_RIGHT.z) * scale, y: (dx * SCREEN_DOWN.x + dz * SCREEN_DOWN.z) * scale * SCREEN_TILT };
}

/** The four corners of a floor rect on the minimap, around a centre point. */
export function rectCorners(rect: Rect, center: Point, scale: number): { x: number; y: number }[] {
  return [[rect.minX, rect.minZ], [rect.maxX, rect.minZ], [rect.maxX, rect.maxZ], [rect.minX, rect.maxZ]]
    .map(([x, z]) => toScreen(x! - center.x, z! - center.z, scale));
}

/** The heading on the minimap, in canvas radians (0 = right, clockwise). */
export function screenAngle(heading: number): number {
  const dir = toScreen(Math.sin(heading), Math.cos(heading), 1);
  return Math.atan2(dir.y, dir.x);
}

export function rectDistance(rect: Rect, at: Point): number {
  return Math.hypot(Math.max(rect.minX - at.x, 0, at.x - rect.maxX), Math.max(rect.minZ - at.z, 0, at.z - rect.maxZ));
}

/** Floor nearer the hero than this is seen. About what the camera shows. */
export const SEE_RADIUS = 15;
/** The pack shows on the minimap, and can be heard, inside this distance. */
export const HEAR_RADIUS = 34;
/** At this distance and nearer, the pack's idle sounds are at full level. */
const HEAR_FULL = 8;

/** What the hero has seen and walked. Forget it with a new level. */
export class ScoutMemory {
  readonly seenAreas = new Set<number>();
  readonly seenCorridors = new Set<number>();
  readonly walkedCorridors = new Set<number>();

  update(view: ScoutView): void {
    for (const area of view.areas) if (area.visited || rectDistance(area.rect, view.hero) < SEE_RADIUS) this.seenAreas.add(area.id);
    for (const corridor of view.corridors) {
      const near = Math.min(...corridor.rects.map(rect => rectDistance(rect, view.hero)));
      if (near < SEE_RADIUS) this.seenCorridors.add(corridor.id);
      if (near < .01) this.walkedCorridors.add(corridor.id);
    }
    // Once the pack shows, its room shows too, and the hallways back to floor
    // the hero has seen, so the mark is never an island.
    if (view.packArea !== undefined && packShown(view)) {
      let area: number | undefined = view.packArea;
      for (let hops = 0; area !== undefined && hops < 4; hops++) {
        const known = this.seenAreas.has(area);
        this.seenAreas.add(area);
        if (known && hops) break;
        const into = view.corridors.find(corridor => corridor.to === area);
        if (!into) break;
        this.seenCorridors.add(into.id); area = into.from;
      }
    }
  }

  clear(): void { this.seenAreas.clear(); this.seenCorridors.clear(); this.walkedCorridors.clear(); }
}

/** The pack is marked when it is in sight, in the fight, or near enough to hear. */
export function packShown(view: ScoutView): boolean {
  if (!view.pack) return false;
  return view.engaged || view.packOnScreen || Math.hypot(view.pack.x - view.hero.x, view.pack.z - view.hero.z) <= HEAR_RADIUS;
}

/**
 * Level of an idle pack sound by distance: silent past HEAR_RADIUS, faint but
 * clear at its edge (over the room tone), full at HEAR_FULL and nearer.
 */
export function lurkGain(distance: number): number {
  if (distance > HEAR_RADIUS) return 0;
  const t = Math.max(0, Math.min(1, (HEAR_RADIUS - distance) / (HEAR_RADIUS - HEAR_FULL)));
  return .3 + .7 * t * t * (3 - 2 * t);
}

/** Stereo position by screen direction: -1 is hard left, 1 hard right; kept off the extremes. */
export function screenPan(dx: number, dz: number): number {
  const right = dx * SCREEN_RIGHT.x + dz * SCREEN_RIGHT.z;
  return Math.max(-.8, Math.min(.8, .85 * right / Math.max(4, Math.hypot(dx, dz))));
}

/** Seconds until the next idle sound: more often as the hero comes near. `roll` is in [0, 1). */
export function lurkInterval(distance: number, roll: number): number {
  const near = Math.max(0, (lurkGain(distance) - .3) / .7);
  return 6.5 - near * 3.5 + roll * 2.5;
}

/** Times the pack's idle sounds while the hero searches. */
export class LurkTimer {
  private nextAt = -1;
  constructor(private readonly roll: () => number = Math.random) {}

  /** Returns a sound to play now, or undefined. */
  update(now: number, view: Pick<ScoutView, 'hero' | 'pack' | 'engaged' | 'searching'>): { gain: number; pan: number } | undefined {
    if (!view.pack || view.engaged || !view.searching) { this.nextAt = -1; return undefined; }
    const dx = view.pack.x - view.hero.x, dz = view.pack.z - view.hero.z, distance = Math.hypot(dx, dz);
    // A short pause after the search starts, so the first sound never lands on the problem.
    if (this.nextAt < 0) { this.nextAt = now + 1.5 + this.roll() * 1.5; return undefined; }
    if (now < this.nextAt) return undefined;
    this.nextAt = now + lurkInterval(distance, this.roll());
    const gain = lurkGain(distance);
    return gain > 0 ? { gain, pan: screenPan(dx, dz) } : undefined;
  }
}
