import * as THREE from 'three';

/** Pickup reach for a mote (magnet) and for a relic (walk over it). */
const MOTE_MAGNET = 2.6;
/** Souls stream to the hero on their own after this long, wherever he stands. */
const MOTE_SEEK_AFTER = .95;
const ITEM_REACH = 1.05;
const MOTE_COLOR = 0x8ff3dc;
/** A chest's treasure rests on the floor this long, then flies to the hero. */
export const REWARD_REST = .7;
/** Each later treasure leaves the chest this much after the one before it. */
export const REWARD_STAGGER = .14;
/** About how long a treasure takes to arc out of the chest and land. */
const REWARD_LAND = .8;
/** A treasure in flight is picked up after this long, wherever the hero went. */
const REWARD_MAX_FLIGHT = 1.4;
export const XP_COLOR = 0x8cdbf3;
export const DUST_COLOR = 0xffc860;
export const RARITY_COLORS: Record<string, number> = { common: 0xb8c2c5, uncommon: 0x79dcb1, rare: 0x6aa9ff, epic: 0xc38aff, legendary: 0xffba57 };

type Mote = { kind: 'mote'; sprite: THREE.Sprite; at: THREE.Vector3; velocity: THREE.Vector3; born: number; flight?: number };
type Relic = { kind: 'relic'; group: THREE.Group; at: THREE.Vector3; color: number; born: number };
/** One reward the server granted from a chest, shown as a thing on the floor. */
export type RewardToken = { kind: 'xp' | 'dust' | 'relic'; label: string; color: number; amount?: number; rarity?: string };
type Treasure = { kind: 'reward'; token: RewardToken; group: THREE.Group; at: THREE.Vector3; velocity: THREE.Vector3; born: number; restAt: number; flight?: number };
export type LootPickup = { kind: 'mote' | 'relic' | 'reward'; at: THREE.Vector3; color: number; reward?: RewardToken };

/**
 * Presentation of rewards the server has already granted: soul motes from
 * each defeat and a relic that waits on the floor until the hero walks to it.
 */
export class FloorLoot {
  readonly group = new THREE.Group();
  private readonly motes: Mote[] = [];
  private relic?: Relic;
  private readonly treasures: Treasure[] = [];
  private readonly moteMaterial: THREE.SpriteMaterial;

  constructor(glow: THREE.Texture) {
    this.group.name = 'FloorLoot';
    this.moteMaterial = new THREE.SpriteMaterial({ map: glow, color: MOTE_COLOR, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  }

  /** A burst of motes from a falling enemy. */
  dropMotes(at: THREE.Vector3, count: number, elapsed: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 1.2 + Math.random() * 1.6;
      const sprite = new THREE.Sprite(this.moteMaterial); sprite.scale.setScalar(.5);
      const position = at.clone().setY(.9 + Math.random() * .4); sprite.position.copy(position);
      this.group.add(sprite);
      this.motes.push({ kind: 'mote', sprite, at: position, velocity: new THREE.Vector3(Math.cos(angle) * speed, 2.6 + Math.random() * 1.4, Math.sin(angle) * speed), born: elapsed + i * .04 });
    }
  }

  /** The relic beam and gem stay until picked up; a new drop replaces an old one. */
  dropRelic(at: THREE.Vector3, color: number, elapsed: number): void {
    this.removeRelic();
    const group = new THREE.Group(); group.position.copy(at).setY(0);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.014, .09, 4.1, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 2.05; beam.name = 'beam';
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.18), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .6, metalness: .6, roughness: .25 }));
    gem.position.y = .27; gem.name = 'gem';
    const ring = new THREE.Mesh(new THREE.RingGeometry(.34, .42, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .04; ring.name = 'ring';
    group.add(beam, gem, ring); this.group.add(group);
    this.relic = { kind: 'relic', group, at: group.position.clone(), color, born: elapsed };
  }

  /** A chest's rewards burst out, land around it, then fly to the hero by themselves. */
  dropRewards(at: THREE.Vector3, tokens: RewardToken[], elapsed: number, toward?: THREE.Vector3): void {
    // They fan out on the side that faces the camera, so the chest never hides them.
    const turn = toward ? Math.atan2(toward.z - at.z, toward.x - at.x) : Math.random() * Math.PI * 2;
    tokens.forEach((token, i) => {
      const angle = turn + (i - (tokens.length - 1) / 2) * .95 + (Math.random() - .5) * .2, speed = 1.6 + Math.random() * .4;
      const group = this.treasureModel(token); group.position.copy(at).setY(.95); group.visible = false;
      this.group.add(group);
      const born = elapsed + i * REWARD_STAGGER;
      this.treasures.push({ kind: 'reward', token, group, at: group.position.clone(), velocity: new THREE.Vector3(Math.cos(angle) * speed, 3.6 + Math.random() * .5, Math.sin(angle) * speed), born, restAt: born + REWARD_LAND + REWARD_REST });
    });
  }

  /** Chest treasures still on the floor or in the air. */
  get rewardsPending(): number { return this.treasures.length; }

  /** World position of a relic still on the floor. */
  get relicPosition(): THREE.Vector3 | null { return this.relic?.at ?? null; }

  /** Moves motes and checks pickups. `free` is true while the hero may walk;
   * motes stop at the edge of `walkable` floor so the hero can reach them. */
  update(delta: number, elapsed: number, hero: THREE.Vector3, free: boolean, walkable: (x: number, z: number) => boolean): LootPickup[] {
    const picked: LootPickup[] = [];
    const chest = hero.clone().setY(1.05);
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const mote = this.motes[i]!;
      if (elapsed < mote.born) { mote.sprite.visible = false; continue; }
      mote.sprite.visible = true;
      const resting = elapsed - mote.born > .9;
      if (mote.flight === undefined && resting && (mote.at.distanceTo(hero) < MOTE_MAGNET || elapsed - mote.born > MOTE_SEEK_AFTER + (i % 5) * .07)) {
        mote.flight = 0; mote.velocity.set(0, 3.2, 0);
      }
      if (mote.flight !== undefined) {
        mote.flight += delta;
        // Lift first, then home in faster and faster: a soul drawn to the hero.
        mote.at.addScaledVector(mote.velocity, delta); mote.velocity.multiplyScalar(Math.exp(-delta * 5));
        mote.at.lerp(chest, 1 - Math.exp(-delta * (2.5 + mote.flight * mote.flight * 40)));
        if (mote.at.distanceTo(chest) < .25) {
          picked.push({ kind: 'mote', at: mote.at.clone(), color: MOTE_COLOR });
          this.group.remove(mote.sprite); this.motes.splice(i, 1); continue;
        }
      } else if (!resting) {
        mote.velocity.y -= 9 * delta;
        if (!walkable(mote.at.x + mote.velocity.x * delta, mote.at.z + mote.velocity.z * delta)) mote.velocity.x = mote.velocity.z = 0;
        mote.at.addScaledVector(mote.velocity, delta);
        if (mote.at.y < .3) { mote.at.y = .3; mote.velocity.y = Math.abs(mote.velocity.y) * .35; mote.velocity.x *= .5; mote.velocity.z *= .5; }
      } else mote.at.y = .32 + Math.sin(elapsed * 2.6 + i) * .06;
      mote.sprite.position.copy(mote.at);
      mote.sprite.scale.setScalar(.42 + Math.sin(elapsed * 5 + i * 1.7) * .06);
    }
    for (let i = this.treasures.length - 1; i >= 0; i--) {
      const treasure = this.treasures[i]!, age = elapsed - treasure.born;
      if (age < 0) continue;
      treasure.group.visible = true;
      const glow = treasure.group.getObjectByName('glow') as THREE.Sprite | undefined, body = treasure.group.getObjectByName('body');
      if (body) body.rotation.y = age * 3.2;
      if (treasure.flight === undefined && elapsed >= treasure.restAt) {
        treasure.flight = 0; treasure.velocity.set(0, 3.6, 0);
        const beam = treasure.group.getObjectByName('beam'); if (beam) beam.visible = false;
      }
      if (treasure.flight !== undefined) {
        treasure.flight += delta;
        // A short hop up, then a quickening rush into the hero.
        treasure.at.addScaledVector(treasure.velocity, delta); treasure.velocity.multiplyScalar(Math.exp(-delta * 6));
        treasure.at.lerp(chest, 1 - Math.exp(-delta * (2 + treasure.flight * treasure.flight * 46)));
        treasure.group.scale.setScalar(Math.max(.45, 1 - treasure.flight * .5));
        if (treasure.at.distanceTo(chest) < .3 || treasure.flight > REWARD_MAX_FLIGHT) {
          picked.push({ kind: 'reward', at: chest.clone(), color: treasure.token.color, reward: treasure.token });
          this.removeTreasure(i); continue;
        }
      } else if (age < REWARD_LAND + .2) {
        treasure.velocity.y -= 12 * delta;
        // Free to leave the chest's own footprint; a wall stops it once it is out on the floor.
        if (walkable(treasure.at.x, treasure.at.z) && !walkable(treasure.at.x + treasure.velocity.x * delta, treasure.at.z + treasure.velocity.z * delta)) treasure.velocity.x = treasure.velocity.z = 0;
        treasure.at.addScaledVector(treasure.velocity, delta);
        if (treasure.at.y < .32) { treasure.at.y = .32; treasure.velocity.y = Math.abs(treasure.velocity.y) * .3; treasure.velocity.x *= .4; treasure.velocity.z *= .4; }
      } else treasure.at.y = .36 + Math.sin(elapsed * 4 + i) * .05;
      treasure.group.position.copy(treasure.at);
      if (glow) glow.scale.setScalar((treasure.token.kind === 'relic' ? 1.5 : 1.1) + Math.sin(elapsed * 7 + i) * .08);
    }
    const relic = this.relic;
    if (relic) {
      const age = elapsed - relic.born;
      const gem = relic.group.getObjectByName('gem')!, ring = relic.group.getObjectByName('ring') as THREE.Mesh;
      gem.rotation.y = age * 2; gem.position.y = .3 + Math.sin(age * 3) * .06;
      ring.scale.setScalar(1 + Math.sin(age * 2.4) * .12);
      if (free && relic.at.distanceTo(hero) < ITEM_REACH) {
        picked.push({ kind: 'relic', at: relic.at.clone().setY(.4), color: relic.color });
        this.removeRelic();
      }
    }
    return picked;
  }

  /** Motes left far behind vanish so a long route does not keep them alive. */
  forgetFarFrom(point: THREE.Vector3, distance: number): void {
    for (let i = this.motes.length - 1; i >= 0; i--) {
      if (this.motes[i]!.at.distanceTo(point) > distance) { this.group.remove(this.motes[i]!.sprite); this.motes.splice(i, 1); }
    }
    if (this.relic && this.relic.at.distanceTo(point) > distance) this.removeRelic();
  }

  clear(): void {
    for (const mote of this.motes) this.group.remove(mote.sprite);
    this.motes.length = 0; this.removeRelic();
    for (let i = this.treasures.length - 1; i >= 0; i--) this.removeTreasure(i);
  }

  get counts(): { motes: number; relic: boolean } { return { motes: this.motes.length, relic: !!this.relic }; }

  /** A glowing orb of learning, a pile of gold dust, or a spinning relic gem. */
  private treasureModel(token: RewardToken): THREE.Group {
    const group = new THREE.Group(); group.name = `Treasure:${token.kind}`;
    const glow = new THREE.Sprite(this.moteMaterial.clone()); glow.name = 'glow';
    glow.material.color.setHex(token.color); glow.material.opacity = token.kind === 'relic' ? .95 : .85;
    group.add(glow);
    const body = new THREE.Group(); body.name = 'body'; group.add(body);
    const material = new THREE.MeshStandardMaterial({ color: token.color, emissive: token.color, emissiveIntensity: token.kind === 'xp' ? 1.2 : .7, metalness: token.kind === 'dust' ? .85 : .5, roughness: .3 });
    if (token.kind === 'relic') {
      body.add(new THREE.Mesh(new THREE.OctahedronGeometry(.25), material));
      // A short beam of its rarity color, the Diablo sign of something good on the floor.
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.012, .07, 2.2, 8, 1, true), new THREE.MeshBasicMaterial({ color: token.color, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 1; beam.name = 'beam'; group.add(beam);
    }
    else if (token.kind === 'xp') body.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.17, 1), material));
    else {
      const nugget = new THREE.DodecahedronGeometry(.095);
      for (const [x, y, z] of [[0, .04, 0], [.13, -.02, .05], [-.1, -.03, .08], [.03, -.03, -.13]] as const) {
        const piece = new THREE.Mesh(nugget, material); piece.position.set(x, y, z); piece.rotation.set(x * 9, z * 7, y * 5); body.add(piece);
      }
    }
    return group;
  }

  private removeTreasure(index: number): void {
    const treasure = this.treasures[index]!; this.treasures.splice(index, 1);
    this.group.remove(treasure.group);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    treasure.group.traverse(object => {
      if (object instanceof THREE.Mesh) { geometries.add(object.geometry); materials.add(object.material as THREE.Material); }
      if (object instanceof THREE.Sprite) materials.add(object.material);
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  }

  private removeRelic(): void {
    if (!this.relic) return;
    this.group.remove(this.relic.group);
    this.relic.group.traverse(object => {
      if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
    });
    this.relic = undefined;
  }

  dispose(): void { this.clear(); this.moteMaterial.dispose(); }
}
