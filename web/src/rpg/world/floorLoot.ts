import * as THREE from 'three';

/** Pickup reach for a mote (magnet) and for a relic (walk over it). */
const MOTE_MAGNET = 2.6;
const ITEM_REACH = 1.05;
const MOTE_COLOR = 0x8ff3dc;

type Mote = { kind: 'mote'; sprite: THREE.Sprite; at: THREE.Vector3; velocity: THREE.Vector3; born: number; flight?: number };
type Relic = { kind: 'relic'; group: THREE.Group; at: THREE.Vector3; color: number; born: number };
export type LootPickup = { kind: 'mote' | 'relic'; at: THREE.Vector3; color: number };

/**
 * Presentation of rewards the server has already granted: soul motes from
 * each defeat and a relic that waits on the floor until the hero walks to it.
 */
export class FloorLoot {
  readonly group = new THREE.Group();
  private readonly motes: Mote[] = [];
  private relic?: Relic;
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
      if (mote.flight === undefined && resting && mote.at.distanceTo(hero) < MOTE_MAGNET) mote.flight = 0;
      if (mote.flight !== undefined) {
        mote.flight += delta;
        mote.at.lerp(chest, 1 - Math.exp(-delta * (4 + mote.flight * 18)));
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
  }

  get counts(): { motes: number; relic: boolean } { return { motes: this.motes.length, relic: !!this.relic }; }

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
