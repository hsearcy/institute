/**
 * An expedition level that grows as the hero explores: areas of different
 * sizes joined by hallways that bend, branch and end. Presentation only; the
 * server still decides every pack and reward. Coordinates are world metres on
 * a 1 m grid; north is -z (up the screen and away from the camera).
 */
export type Rect = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
export type Side = 'north' | 'south' | 'east' | 'west';
export type Biome = 'vault' | 'forest' | 'coast' | 'quarry' | 'garden';
export type AreaKind = 'entry' | 'hall' | 'sanctum';
export type FeatureKind = 'pier' | 'brazier' | 'crystals' | 'tomb' | 'rubble' | 'chest' | 'landmark' | 'altar'
  | 'tree' | 'boulder' | 'column' | 'fountain' | 'wreck' | 'cart' | BreakableKind;
/** Props the hero smashes with no problem to solve. */
export type BreakableKind = 'barrel' | 'urn' | 'crate';
export const BREAKABLE_KINDS: readonly FeatureKind[] = ['barrel', 'urn', 'crate'];
export const isBreakable = (feature: Pick<Feature, 'kind'>): boolean => BREAKABLE_KINDS.includes(feature.kind);
/** A solid object on the floor. The hero and the horde walk round its radius.
 * A chest can be opened; a breakable is `opened` once broken, and is then no longer solid. */
export type Feature = Readonly<{ id: string; kind: FeatureKind; x: number; z: number; radius: number; turn: number; scale: number }> & { opened?: boolean };
export type Area = {
  readonly id: number; readonly kind: AreaKind; readonly rect: Rect; readonly name: string; readonly seed: number;
  /** The side the hero comes in from; a sanctum's guardian waits at the far side. */
  readonly back: Side;
  readonly features: Feature[]; readonly exits: Exit[]; visited: boolean;
};
export type Exit = { readonly id: number; readonly area: number; readonly side: Side; readonly at: number; state: 'open' | 'linked' | 'sealed'; corridor?: number };
/** A hallway. Its only features are breakables against its walls. */
export type Corridor = { readonly id: number; readonly rects: readonly Rect[]; readonly from: number; readonly to: number; readonly features: Feature[] };
/** A piece of the level that is built and released as one batch. */
export type Chunk = { readonly key: string; readonly bounds: Rect; readonly rects: readonly Rect[]; readonly area?: Area; readonly corridor?: Corridor };

export const HERO_RADIUS = .38;
const MARGIN = 2;
const DIRECTION: Record<Side, { x: number; z: number }> = { north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, east: { x: 1, z: 0 }, west: { x: -1, z: 0 } };
const OPPOSITE: Record<Side, Side> = { north: 'south', south: 'north', east: 'west', west: 'east' };
const TURNS: Record<Side, [Side, Side]> = { north: ['east', 'west'], south: ['east', 'west'], east: ['north', 'south'], west: ['north', 'south'] };

const NAMES: Record<Biome, readonly string[]> = {
  vault: ['The Ember Hall', 'The Lost Reliquary', 'The Crystal Gallery', 'The Bone Gallery', 'The Sunken Chapel', 'The Old Ossuary',
    'The Broken Archive', 'The Torchlit Nave', 'The Silent Crypt', 'The Pillared Hall', 'The Fallen Cloister', 'The Ash Vault'],
  forest: ['The Fern Trail', 'The Fallen Oak', 'The Moonlit Clearing', 'The Root Passage', 'The Ancient Grove', 'The Mossy Hollow',
    'The Hunter’s Glade', 'The Owl Stones', 'The Bramble Path', 'The Quiet Ring'],
  coast: ['The Driftwood Shore', 'The Salt Pools', 'The Wreck Beach', 'The Sea Arch', 'The Gull Cliffs', 'The Kelp Flats',
    'The Smugglers’ Cove', 'The Shell Ridge', 'The Foam Steps'],
  quarry: ['The Cart Road', 'The Split Boulder', 'The Cutting Yard', 'The Broken Crane', 'The Redstone Basin', 'The Dust Pit',
    'The Old Workings', 'The Rubble Steps', 'The Iron Gate'],
  garden: ['The Rose Walk', 'The Silent Fountain', 'The Cypress Walk', 'The Overgrown Court', 'The Marble Steps', 'The Hedge Maze',
    'The Lily Pond', 'The Sundial Lawn', 'The Ivy Gate'],
};
const SANCTUM: Record<Biome, string> = { vault: 'The Guardian Sanctum', forest: 'The Heartwood Circle', coast: 'The Stormwatch Point', quarry: 'The Foreman Terrace', garden: 'The Crown Pavilion' };

/** Small seeded generator: the same seed always grows the same piece. */
export function random(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => { state = Math.imul(state ^ (state >>> 15), 2246822507) + 0x6d2b79f5 | 0; state ^= state >>> 13; return (state >>> 0) / 4294967296; };
}
const hash = (...values: number[]) => values.reduce((n, value) => Math.imul(n ^ Math.round(value * 1000), 16777619) | 0, 2166136261);
const overlaps = (a: Rect, b: Rect, margin = 0) => a.minX < b.maxX + margin && a.maxX > b.minX - margin && a.minZ < b.maxZ + margin && a.maxZ > b.minZ - margin;
const cellKey = (x: number, z: number) => (x + 32768) * 65536 + (z + 32768);
export const rectCenter = (rect: Rect) => ({ x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 });

export class Level {
  readonly areas: Area[] = [];
  readonly corridors: Corridor[] = [];
  private readonly exits: Exit[] = [];
  /** Floor cells: an area id, or -1 - id for a corridor. */
  private readonly floor = new Map<number, number>();
  /** Route-cell answers; cleared whenever the level grows. */
  private readonly passCache = new Map<number, boolean>();
  /** Cells blocked by a feature, for path finding. */
  private readonly blocked = new Set<number>();
  private nameIndex = 0;
  /** Chunks made or changed since the last call to takeChanges(). */
  private changed = new Set<string>();

  constructor(readonly seed: number, readonly biome: Biome) {
    const rng = random(hash(seed, 1));
    const width = 14 + Math.floor(rng() * 3) * 2, depth = 14;
    this.addArea('entry', { minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2 }, 'south');
  }

  /** Where a new hero stands: just inside the south side of the entry. */
  get start(): { x: number; z: number } { const r = this.areas[0]!.rect; return { x: (r.minX + r.maxX) / 2, z: r.maxZ - 2.5 }; }

  areaAt(x: number, z: number): Area | undefined {
    return this.areas.find(area => x >= area.rect.minX && x <= area.rect.maxX && z >= area.rect.minZ && z <= area.rect.maxZ);
  }

  chunk(key: string): Chunk | undefined {
    const [kind, id] = key.split(':'), index = Number(id);
    if (kind === 'area') { const area = this.areas[index]; return area && { key, bounds: area.rect, rects: [area.rect], area }; }
    const corridor = this.corridors[index];
    if (!corridor) return undefined;
    const bounds = corridor.rects.reduce((all, rect) => ({ minX: Math.min(all.minX, rect.minX), maxX: Math.max(all.maxX, rect.maxX), minZ: Math.min(all.minZ, rect.minZ), maxZ: Math.max(all.maxZ, rect.maxZ) }));
    return { key, bounds, rects: corridor.rects, corridor };
  }

  get chunks(): Chunk[] { return [...this.areas.map(area => `area:${area.id}`), ...this.corridors.map(corridor => `corridor:${corridor.id}`)].map(key => this.chunk(key)!); }

  /** Chunks to build or rebuild. */
  takeChanges(): string[] { const keys = [...this.changed]; this.changed.clear(); return keys; }

  /** Grows every open exit within reach of a point. Returns true when the level changed. */
  expandAround(x: number, z: number, reach = 30): boolean {
    let grew = false;
    for (const exit of this.exits) {
      if (exit.state !== 'open') continue;
      const door = this.doorCenter(exit);
      if (Math.hypot(door.x - x, door.z - z) <= reach) { this.expand(exit); grew = true; }
    }
    return grew;
  }

  /**
   * Grows the open exit nearest a point into a new area of the given kind,
   * however far it is. Used to make room for the guardian.
   */
  growNearest(x: number, z: number, kind: AreaKind): Area | undefined {
    const open = this.exits.filter(exit => exit.state === 'open')
      .sort((a, b) => { const p = this.doorCenter(a), q = this.doorCenter(b); return Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z); });
    for (const exit of open) { const area = this.expand(exit, kind); if (area) return area; }
    return undefined;
  }

  /** Every breakable grown so far, whole or broken. */
  get breakables(): Feature[] { return [...this.areas, ...this.corridors].flatMap(owner => owner.features.filter(isBreakable)); }

  /** Breaks a breakable: it is no longer solid. Returns false when it was already broken or is unknown. */
  breakFeature(id: string): boolean {
    const feature = this.breakables.find(entry => entry.id === id);
    if (!feature || feature.opened) return false;
    feature.opened = true; this.passCache.clear();
    return true;
  }

  /** Every chest grown so far, open or closed. */
  get chests(): Feature[] { return this.areas.flatMap(area => area.features.filter(feature => feature.kind === 'chest')); }

  get openExits(): { x: number; z: number }[] { return this.exits.filter(exit => exit.state === 'open').map(exit => this.doorCenter(exit)); }

  /** Openings in an area's walls: linked or still open exits. */
  openings(area: Area): { side: Side; from: number; to: number; linked: boolean }[] {
    const half = this.corridorWidth / 2;
    return area.exits.filter(exit => exit.state !== 'sealed').map(exit => ({ side: exit.side, from: exit.at - half, to: exit.at + half, linked: exit.state === 'linked' }))
      .concat(this.corridors.filter(corridor => corridor.to === area.id).map(corridor => {
        // The arrival doorway: where the corridor's last segment meets this area.
        const last = corridor.rects[corridor.rects.length - 1]!;
        const side = sideTouching(area.rect, last);
        const along = side === 'north' || side === 'south' ? [last.minX, last.maxX] : [last.minZ, last.maxZ];
        return { side, from: along[0]!, to: along[1]!, linked: true };
      }));
  }

  get corridorWidth(): number { return this.biome === 'vault' ? 4 : 6; }

  /** True when the 1 m cell with this corner is floor. */
  isFloor(cellX: number, cellZ: number): boolean { return this.floor.has(cellKey(cellX, cellZ)); }

  /** True when a body of this radius can stand here: on floor and clear of features. */
  walkable(x: number, z: number, radius = HERO_RADIUS): boolean {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      if (!this.floor.has(cellKey(Math.floor(x + dx * radius), Math.floor(z + dz * radius)))) return false;
    }
    const owner = this.floor.get(cellKey(Math.floor(x), Math.floor(z))) ?? -1;
    const features = owner >= 0 ? this.areas[owner]!.features : this.corridors[-1 - owner]?.features ?? [];
    return features.every(feature => (feature.opened && isBreakable(feature)) || Math.hypot(x - feature.x, z - feature.z) >= feature.radius + radius);
  }

  /** A walking route that avoids walls and features, simplified to straight legs. */
  path(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] {
    // A click into the dark between areas walks to the nearest floor near it.
    const start = this.nearestCell(from.x, from.z), goal = this.nearestCell(to.x, to.z, 12);
    if (!start || !goal) return [];
    const startKey = cellKey(start.x, start.z), goalKey = cellKey(goal.x, goal.z);
    const open = new MinHeap(), came = new Map<number, number>(), cost = new Map<number, number>([[startKey, 0]]);
    open.push(startKey, 0);
    const position = (key: number) => ({ x: Math.floor(key / 65536) - 32768, z: key % 65536 - 32768 });
    let found = false, visited = 0;
    while (open.size && visited++ < 40000) {
      const key = open.pop()!;
      if (key === goalKey) { found = true; break; }
      const cell = position(key);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const nx = cell.x + dx, nz = cell.z + dz, next = cellKey(nx, nz);
        if (!this.passable(nx, nz)) continue;
        // No corner cutting past a wall or a feature.
        if (dx && dz && (!this.passable(cell.x + dx, cell.z) || !this.passable(cell.x, cell.z + dz))) continue;
        const step = (cost.get(key) ?? 0) + (dx && dz ? Math.SQRT2 : 1);
        if (step >= (cost.get(next) ?? Infinity)) continue;
        cost.set(next, step); came.set(next, key);
        open.push(next, step + Math.hypot(goal.x - nx, goal.z - nz));
      }
    }
    if (!found) return [];
    const cells: { x: number; z: number }[] = [];
    for (let key: number | undefined = goalKey; key !== undefined && key !== startKey; key = came.get(key)) { const cell = position(key); cells.unshift({ x: cell.x + .5, z: cell.z + .5 }); }
    const target = this.walkable(to.x, to.z) ? { x: to.x, z: to.z } : cells[cells.length - 1] ?? { x: goal.x + .5, z: goal.z + .5 };
    if (cells.length) cells[cells.length - 1] = target; else cells.push(target);
    // String pulling: keep only the turns a straight walk cannot skip.
    const route: { x: number; z: number }[] = [];
    let anchor = from;
    for (let i = 0; i < cells.length; i++) {
      const next = cells[i + 1];
      if (!next || !this.clearLine(anchor, next)) { route.push(cells[i]!); anchor = cells[i]!; }
    }
    return route;
  }

  /** True when a body can walk the straight line between two points. */
  clearLine(a: { x: number; z: number }, b: { x: number; z: number }, radius = HERO_RADIUS): boolean {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .25);
    for (let i = 1; i <= steps; i++) if (!this.walkable(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps, radius)) return false;
    return true;
  }

  /** A cell a route may cross. The extra margin keeps the line between two
   * neighbouring cells clear of a feature's round edge. */
  private passable(x: number, z: number): boolean {
    const key = cellKey(x, z), known = this.passCache.get(key);
    if (known !== undefined) return known;
    const result = this.floor.has(key) && !this.blocked.has(key) && this.walkable(x + .5, z + .5, HERO_RADIUS + .25);
    this.passCache.set(key, result); return result;
  }

  private nearestCell(x: number, z: number, reach = 4): { x: number; z: number } | undefined {
    const cx = Math.floor(x), cz = Math.floor(z);
    for (let ring = 0; ring <= reach; ring++) {
      let best: { x: number; z: number } | undefined, distance = Infinity;
      for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring || !this.passable(cx + dx, cz + dz)) continue;
        const d = Math.hypot(cx + dx + .5 - x, cz + dz + .5 - z);
        if (d < distance) { distance = d; best = { x: cx + dx, z: cz + dz }; }
      }
      if (best) return best;
    }
    return undefined;
  }

  doorCenter(exit: Exit): { x: number; z: number } {
    const r = this.areas[exit.area]!.rect;
    return exit.side === 'north' ? { x: exit.at, z: r.minZ } : exit.side === 'south' ? { x: exit.at, z: r.maxZ }
      : exit.side === 'east' ? { x: r.maxX, z: exit.at } : { x: r.minX, z: exit.at };
  }

  /** Builds a hallway and a new area behind an exit, or seals it when nothing fits. */
  private expand(exit: Exit, kind: AreaKind = 'hall'): Area | undefined {
    const rng = random(hash(this.seed, exit.id, kind === 'sanctum' ? 7 : 3));
    const width = this.corridorWidth, half = width / 2, door = this.doorCenter(exit);
    for (let attempt = 0; attempt < 8; attempt++) {
      const segments: Rect[] = [];
      let side = exit.side, x = door.x, z = door.z;
      const bend = attempt < 6 && rng() < .4;
      for (const length of bend ? [4 + Math.floor(rng() * 5), 4 + Math.floor(rng() * 7)] : [6 + Math.floor(rng() * 9)]) {
        const d = DIRECTION[side];
        // A turn starts from the far edge of the previous segment's end square.
        const rect = d.x ? { minX: Math.min(x, x + d.x * length), maxX: Math.max(x, x + d.x * length), minZ: z - half, maxZ: z + half }
          : { minX: x - half, maxX: x + half, minZ: Math.min(z, z + d.z * length), maxZ: Math.max(z, z + d.z * length) };
        segments.push(rect);
        x += d.x * length; z += d.z * length;
        if (bend && segments.length === 1) {
          const turn = TURNS[side][rng() < .5 ? 0 : 1], t = DIRECTION[turn];
          // Step back half a width so the turn meets the corner square.
          x -= d.x * half; z -= d.z * half; x += t.x * half; z += t.z * half;
          side = turn;
        }
      }
      const areaWidth = kind === 'sanctum' ? 22 : 12 + Math.floor(rng() * 6) * 2, areaDepth = kind === 'sanctum' ? 22 : 12 + Math.floor(rng() * 5) * 2;
      const d = DIRECTION[side];
      const span = d.x ? areaDepth : areaWidth, offset = Math.floor(half + 1 + rng() * Math.max(0, span - width - 2));
      const rect: Rect = d.x
        ? { minX: d.x > 0 ? x : x - areaWidth, maxX: d.x > 0 ? x + areaWidth : x, minZ: z - offset, maxZ: z - offset + areaDepth }
        : { minX: x - offset, maxX: x - offset + areaWidth, minZ: d.z > 0 ? z : z - areaDepth, maxZ: d.z > 0 ? z + areaDepth : z };
      const parent = this.areas[exit.area]!.rect;
      const clear = [...segments, rect].every((candidate, index) => this.areas.every(area => !overlaps(candidate, area.rect, area.rect === parent && index === 0 ? -.01 : MARGIN))
        && this.corridors.every(corridor => corridor.rects.every(other => !overlaps(candidate, other, MARGIN))));
      // The new area keeps its distance from the parent and from the first leg of a bend.
      if (!clear || overlaps(rect, parent, MARGIN) || segments.slice(0, -1).some(segment => overlaps(rect, segment, MARGIN))) continue;
      const corridor: Corridor = { id: this.corridors.length, rects: segments, from: exit.area, to: this.areas.length, features: [] };
      this.corridors.push(corridor);
      for (const segment of segments) this.claim(segment, -1 - corridor.id, `corridor:${corridor.id}`);
      corridor.features.push(...this.corridorBreakables(corridor, rng));
      exit.state = 'linked'; exit.corridor = corridor.id;
      this.changed.add(`area:${exit.area}`);
      return this.addArea(kind, rect, OPPOSITE[side], { x, z });
    }
    exit.state = 'sealed'; this.changed.add(`area:${exit.area}`);
    return undefined;
  }

  private addArea(kind: AreaKind, rect: Rect, back: Side, arrival?: { x: number; z: number }): Area {
    const id = this.areas.length, seed = hash(this.seed, id, rect.minX, rect.minZ), rng = random(seed);
    const names = NAMES[this.biome];
    const name = kind === 'sanctum' ? SANCTUM[this.biome] : kind === 'entry' ? names[0]! : names[(this.nameIndex++ % (names.length - 1)) + 1]!;
    const area: Area = { id, kind, rect, name, seed, back, features: [], exits: [], visited: kind === 'entry' };
    this.areas.push(area);
    this.claim(rect, id, `area:${id}`);
    if (kind !== 'sanctum') {
      // Every hall leads on; most branch. The way back is the arrival doorway.
      const sides = (['north', 'east', 'west', 'south'] as Side[]).filter(side => side !== back);
      const chosen = sides.filter(() => rng() < (kind === 'entry' ? .75 : .55));
      if (!chosen.length) chosen.push(sides[Math.floor(rng() * sides.length)]!);
      for (const side of chosen) {
        const length = side === 'north' || side === 'south' ? rect.maxX - rect.minX : rect.maxZ - rect.minZ;
        const low = side === 'north' || side === 'south' ? rect.minX : rect.minZ;
        const inset = this.corridorWidth / 2 + 2;
        const at = low + inset + Math.floor(rng() * Math.max(1, length - inset * 2 + 1));
        const exit: Exit = { id: hash(this.seed, id, sides.indexOf(side) + 11), area: id, side, at, state: 'open' };
        area.exits.push(exit); this.exits.push(exit);
      }
    }
    area.features.push(...this.furnish(area, rng, arrival));
    for (const feature of area.features) {
      // A breakable is solid only until it breaks, so it never marks route cells for good.
      if (isBreakable(feature)) continue;
      for (let x = Math.floor(feature.x - feature.radius); x <= Math.ceil(feature.x + feature.radius); x++)
        for (let z = Math.floor(feature.z - feature.radius); z <= Math.ceil(feature.z + feature.radius); z++)
          if (Math.hypot(x + .5 - feature.x, z + .5 - feature.z) < feature.radius) this.blocked.add(cellKey(x, z));
    }
    this.passCache.clear();
    return area;
  }

  private claim(rect: Rect, owner: number, chunk: string): void {
    for (let x = rect.minX; x < rect.maxX; x++) for (let z = rect.minZ; z < rect.maxZ; z++) this.floor.set(cellKey(x, z), owner);
    this.changed.add(chunk); this.passCache.clear();
  }

  /** Solid dressing that keeps every doorway and the middle of the floor clear. */
  private furnish(area: Area, rng: () => number, arrival?: { x: number; z: number }): Feature[] {
    const r = area.rect, center = rectCenter(r), width = r.maxX - r.minX, depth = r.maxZ - r.minZ;
    const doors = [...area.exits.map(exit => this.doorCenter(exit)), arrival ?? { x: center.x, z: r.maxZ }];
    const features: Feature[] = [];
    const lanes = (x: number, z: number, radius: number) => doors.every(door => distanceToSegment(x, z, door, center) > radius + 2.2)
      && Math.hypot(x - center.x, z - center.z) > radius + 3.4;
    const place = (kind: FeatureKind, x: number, z: number, radius: number, scale = 1, gap = .6) => {
      const inside = x - radius > r.minX + .3 && x + radius < r.maxX - .3 && z - radius > r.minZ + .3 && z + radius < r.maxZ - .3;
      if (!inside || !lanes(x, z, radius) || features.some(other => Math.hypot(other.x - x, other.z - z) < other.radius + radius + gap)) return false;
      features.push({ id: `${this.seed}-${area.id}-${features.length}`, kind, x, z, radius, turn: rng() * Math.PI * 2, scale }); return true;
    };
    const scatter = (kind: FeatureKind, count: number, radius: number, edge: number) => {
      for (let n = 0, tries = 0; n < count && tries < count * 12; tries++) {
        const alongX = rng() < .5, low = rng() < .5;
        const x = alongX ? r.minX + 1 + rng() * (width - 2) : low ? r.minX + edge : r.maxX - edge;
        const z = alongX ? (low ? r.minZ + edge : r.maxZ - edge) : r.minZ + 1 + rng() * (depth - 2);
        if (place(kind, x, z, radius, .8 + rng() * .5)) n++;
      }
    };
    if (area.kind === 'sanctum') {
      const far = farPoint(area, 2.2);
      features.push({ id: `${this.seed}-${area.id}-altar`, kind: 'altar', x: far.x, z: far.z, radius: 1.5, turn: 0, scale: 1 });
      for (const [dx, dz] of [[-7, -6], [7, -6], [-7, 6], [7, 6]] as const) place(this.biome === 'vault' ? 'pier' : 'column', center.x + dx, center.z + dz, .95);
      return features;
    }
    if (this.biome === 'vault') {
      if (width >= 16 && depth >= 14) for (const dx of [-1, 1]) for (let z = r.minZ + 4; z <= r.maxZ - 4; z += 5) place('pier', center.x + dx * (width / 2 - 4), z, .95);
      for (const [x, z] of [[r.minX + 1.4, r.minZ + 1.4], [r.maxX - 1.4, r.minZ + 1.4], [r.minX + 1.4, r.maxZ - 1.4], [r.maxX - 1.4, r.maxZ - 1.4]] as const) if (rng() < .5) place('brazier', x, z, .55);
      scatter('crystals', 1 + Math.floor(rng() * 2), 1.1, 1.4);
      scatter('tomb', Math.floor(rng() * 3), 1.15, 1.5);
      scatter('rubble', Math.floor(rng() * 3), .9, 1.3);
      if (rng() < .35) scatter('chest', 1, .6, 1.1);
      if (rng() < .45) scatter('landmark', 1, 1.7, 2.1);
    } else {
      scatter(this.biome === 'garden' ? 'column' : 'tree', 1 + Math.floor(rng() * 2), 1.0, 1.6);
      scatter('boulder', 1 + Math.floor(rng() * 3), .9, 1.4);
      if (this.biome === 'garden' && rng() < .5) place('fountain', center.x + (rng() < .5 ? -1 : 1) * width / 4, center.z - depth / 4, 2.2);
      if (this.biome === 'coast' && rng() < .45) scatter('wreck', 1, 1.8, 2.2);
      if (this.biome === 'quarry' && rng() < .55) scatter('cart', 1, 1.2, 1.6);
      if (rng() < .3) scatter('chest', 1, .6, 1.4);
      if (rng() < .4) scatter('column', 1 + Math.floor(rng() * 2), .7, 1.4);
    }
    // Small groups of breakables stand against the walls, as in a storeroom.
    const kinds = breakableKinds(this.biome);
    for (let group = 0, groups = 1 + Math.floor(rng() * 3); group < groups; group++) {
      for (let tries = 0; tries < 10; tries++) {
        const alongX = rng() < .5, low = rng() < .5, edge = .85;
        const x = alongX ? r.minX + 1.5 + rng() * (width - 3) : low ? r.minX + edge : r.maxX - edge;
        const z = alongX ? (low ? r.minZ + edge : r.maxZ - edge) : r.minZ + 1.5 + rng() * (depth - 3);
        const kind = kinds[Math.floor(rng() * kinds.length)]!;
        if (!place(kind, x, z, BREAKABLE_RADIUS[kind as BreakableKind], .9 + rng() * .2)) continue;
        // One or two more beside the first, along the wall.
        for (let n = 0, more = Math.floor(rng() * 3); n < more; n++) {
          const step = (n + 1) * (rng() < .5 ? -1 : 1) * 1.0;
          const next = kinds[Math.floor(rng() * kinds.length)]!;
          place(next, alongX ? x + step : x + (rng() - .5) * .3, alongX ? z + (rng() - .5) * .3 : z + step, BREAKABLE_RADIUS[next as BreakableKind], .9 + rng() * .2, .25);
        }
        break;
      }
    }
    return features;
  }

  /** A few breakables along a hallway's walls, never in the middle of its floor. */
  private corridorBreakables(corridor: Corridor, rng: () => number): Feature[] {
    const kinds = breakableKinds(this.biome), features: Feature[] = [];
    for (const [index, rect] of corridor.rects.entries()) {
      const alongX = rect.maxX - rect.minX > rect.maxZ - rect.minZ, length = alongX ? rect.maxX - rect.minX : rect.maxZ - rect.minZ;
      if (length < 5 || rng() > .55) continue;
      const kind = kinds[Math.floor(rng() * kinds.length)]!, radius = BREAKABLE_RADIUS[kind as BreakableKind];
      const along = 2 + rng() * (length - 4), side = rng() < .5;
      const x = alongX ? rect.minX + along : side ? rect.minX + radius + .12 : rect.maxX - radius - .12;
      const z = alongX ? (side ? rect.minZ + radius + .12 : rect.maxZ - radius - .12) : rect.minZ + along;
      // Keep clear of the turn into another leg of the hallway.
      const clearOfTurn = corridor.rects.every(other => other === rect || Math.hypot(Math.max(other.minX - x, 0, x - other.maxX), Math.max(other.minZ - z, 0, z - other.maxZ)) > radius + 1.4);
      if (!clearOfTurn) continue;
      features.push({ id: `${this.seed}-c${corridor.id}-${index}`, kind, x, z, radius, turn: rng() * Math.PI * 2, scale: .9 + rng() * .2 });
    }
    return features;
  }
}

/** Footprint of each breakable, in metres. */
export const BREAKABLE_RADIUS: Record<BreakableKind, number> = { barrel: .46, urn: .4, crate: .52 };
/** Urns belong to the vault and the palace garden; barrels and crates to everywhere people stored things. */
function breakableKinds(biome: Biome): BreakableKind[] {
  return biome === 'vault' ? ['urn', 'urn', 'barrel', 'crate'] : biome === 'garden' ? ['urn', 'urn', 'crate'] : biome === 'forest' ? ['barrel', 'crate', 'urn'] : ['barrel', 'crate', 'crate'];
}

/** The middle of the side opposite the arrival, `inset` metres inside. */
export function farPoint(area: Pick<Area, 'rect' | 'back'>, inset: number): { x: number; z: number } {
  const r = area.rect, center = rectCenter(r);
  return area.back === 'south' ? { x: center.x, z: r.minZ + inset } : area.back === 'north' ? { x: center.x, z: r.maxZ - inset }
    : area.back === 'east' ? { x: r.minX + inset, z: center.z } : { x: r.maxX - inset, z: center.z };
}

function distanceToSegment(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length)) : 0;
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

function sideTouching(area: Rect, segment: Rect): Side {
  if (Math.abs(segment.maxZ - area.minZ) < .01) return 'north';
  if (Math.abs(segment.minZ - area.maxZ) < .01) return 'south';
  if (Math.abs(segment.minX - area.maxX) < .01) return 'east';
  return 'west';
}

class MinHeap {
  private readonly keys: number[] = [];
  private readonly scores: number[] = [];
  get size(): number { return this.keys.length; }
  push(key: number, score: number): void {
    this.keys.push(key); this.scores.push(score);
    for (let i = this.keys.length - 1; i > 0;) {
      const parent = (i - 1) >> 1; if (this.scores[parent]! <= score) break;
      this.swap(i, parent); i = parent;
    }
  }
  pop(): number | undefined {
    const top = this.keys[0]; const lastKey = this.keys.pop()!, lastScore = this.scores.pop()!;
    if (this.keys.length) {
      this.keys[0] = lastKey; this.scores[0] = lastScore;
      for (let i = 0; ;) {
        const left = i * 2 + 1, right = left + 1; let small = i;
        if (left < this.keys.length && this.scores[left]! < this.scores[small]!) small = left;
        if (right < this.keys.length && this.scores[right]! < this.scores[small]!) small = right;
        if (small === i) break; this.swap(i, small); i = small;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!]; [this.scores[a], this.scores[b]] = [this.scores[b]!, this.scores[a]!];
  }
}
