import * as THREE from 'three';

/**
 * A calm glow around the hero while a shrine's boon lasts: a soft ring on
 * the floor that breathes slowly, and a few motes that drift up around the
 * body. It eases in and out; nothing flashes or speeds up as time runs out.
 */
export class BoonAura {
  readonly group = new THREE.Group();
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly halo: THREE.Sprite;
  private readonly motes: THREE.Sprite[] = [];
  private strength = 0;
  private wanted = 0;

  constructor(glowMap: THREE.Texture) {
    this.group.name = 'BoonAura'; this.group.visible = false;
    const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false } as const;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(.55, .95, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowMap, opacity: 0, ...additive }));
    this.ring.position.y = .03; this.ring.renderOrder = 2; this.group.add(this.ring);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, opacity: 0, ...additive }));
    this.halo.position.y = 1.0; this.halo.scale.set(1.9, 2.5, 1); this.group.add(this.halo);
    for (let n = 0; n < 7; n++) {
      const mote = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, opacity: 0, ...additive }));
      mote.scale.setScalar(.16 + (n % 3) * .04); this.motes.push(mote); this.group.add(mote);
    }
  }

  /** Starts or ends the glow in a boon's colour. */
  set(color: THREE.Color | null): void {
    if (color) for (const material of [this.ring.material, this.halo.material, ...this.motes.map(mote => mote.material)]) material.color.copy(color);
    this.wanted = color ? 1 : 0;
  }

  update(delta: number, elapsed: number, hero: THREE.Vector3): void {
    this.strength += (this.wanted - this.strength) * Math.min(1, delta * 2.5);
    if (this.wanted === 0 && this.strength < .01) this.strength = 0;
    this.group.visible = this.strength > 0;
    if (!this.group.visible) return;
    this.group.position.set(hero.x, 0, hero.z);
    const breathe = .5 + .5 * Math.sin(elapsed * 1.7);
    this.ring.material.opacity = (.42 + .18 * breathe) * this.strength;
    this.ring.scale.setScalar(1 + .06 * breathe);
    this.halo.material.opacity = (.13 + .05 * breathe) * this.strength;
    this.motes.forEach((mote, n) => {
      // Each mote rises on its own slow spiral and fades at the top.
      const t = (elapsed * .32 + n / this.motes.length) % 1, angle = n * 2.4 + elapsed * .7;
      mote.position.set(Math.cos(angle) * (.45 + .1 * Math.sin(n)), .2 + t * 1.9, Math.sin(angle) * (.45 + .1 * Math.sin(n)));
      mote.material.opacity = Math.sin(t * Math.PI) * .8 * this.strength;
    });
  }

  dispose(): void {
    this.ring.geometry.dispose(); this.ring.material.dispose(); this.halo.material.dispose();
    for (const mote of this.motes) mote.material.dispose();
    this.group.removeFromParent();
  }
}
