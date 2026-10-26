import * as THREE from 'three';

/** How long the piece rests in its beam before it flies to the pack, and the flight itself. */
export const GEAR_DROP_SHOW = 2.4;
export const GEAR_DROP_FLIGHT = .45;
export const GEAR_DROP_COLORS: Record<string, number> = { common: 0xc9d1d3, rare: 0x6aa9ff, epic: 0xc38aff, legendary: 0xffba57 };
/** Beam strength: a common piece gets a faint pillar, a legendary one a bright one. */
const STRENGTH: Record<string, number> = { common: .55, rare: .85, epic: 1, legendary: 1.25 };
/** Largest side at the game camera. Jewellery stays a little smaller so a ring never looks like a hoop. */
const ITEM_SIZE: Partial<Record<string, number>> = { ring: .74, amulet: .92 };
const HOVER = .78;

/**
 * A soft vertical pillar, brightest just above the piece and gone at the top.
 * It thins out where the piece hovers so the light never washes the model over.
 */
function beamMaterial(color: number, opacity: number, height: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity }, time: { value: 0 }, height: { value: height }, clear: { value: HOVER + .55 } },
    vertexShader: `varying vec2 vUv; varying vec3 vNormal;
      void main() { vUv = uv; vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; uniform float time; uniform float height; uniform float clear; varying vec2 vUv; varying vec3 vNormal;
      void main() {
        float edge = pow(abs(vNormal.z), 1.3), h = vUv.y * height;
        float rise = pow(1. - vUv.y, 1.7) * mix(.18, 1., smoothstep(clear - .2, clear + .45, h));
        float drift = .78 + .22 * sin(vUv.y * 26. - time * 3.2 + vUv.x * 12.566);
        gl_FragColor = vec4(color * (1. + edge * .6), edge * rise * drift * opacity);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

/**
 * Gear on the floor, as in Diablo: the real model hovers and turns in a beam
 * of its rarity colour over a glowing pool. A plain gem stands in until the
 * model loads (or if it never does). Owns only its own geometry and cloned
 * materials; the cached model's geometry and textures are shared.
 */
export class GearDropVisual {
  readonly group = new THREE.Group();
  /** Spin and bob pivot. Flies to the hero at the end. */
  readonly item = new THREE.Group();
  readonly strength: number;
  private readonly owned: { geometry: THREE.BufferGeometry[]; material: THREE.Material[] } = { geometry: [], material: [] };
  private readonly beam: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly core: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly pool: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly ripple: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly halo: THREE.Sprite;
  private placeholder?: THREE.Mesh;
  private readonly size: number;
  /** A ring or pendant is flat: it sways facing the camera instead of turning edge-on. */
  private flat = false;

  constructor(readonly color: number, rarity: string, kind: string, glow: THREE.Texture, private readonly facing = 0) {
    this.strength = STRENGTH[rarity] ?? STRENGTH.common!;
    this.size = ITEM_SIZE[kind] ?? (kind === 'pants' ? 1.1 : 1);
    this.group.name = 'GearDrop';
    const s = this.strength;
    this.beam = this.own(new THREE.Mesh(new THREE.CylinderGeometry(.24 * s + .1, .34 + .08 * s, 5.2, 24, 1, true), beamMaterial(color, .62 * s, 5.2)));
    this.beam.position.y = 2.6;
    // A thin white-hot core keeps the pillar crisp instead of a coloured fog.
    this.core = this.own(new THREE.Mesh(new THREE.CylinderGeometry(.03, .07, 4.4, 12, 1, true), beamMaterial(new THREE.Color(color).lerp(new THREE.Color(0xffffff), .55).getHex(), .9 * s, 4.4)));
    this.core.position.y = 2.2;
    this.pool = this.own(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, map: glow, transparent: true, opacity: .55 * s, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    this.pool.rotation.x = -Math.PI / 2; this.pool.position.y = .035; this.pool.scale.setScalar(1.9 + .5 * s);
    this.ripple = this.own(new THREE.Mesh(new THREE.RingGeometry(.4, .46, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })));
    this.ripple.rotation.x = -Math.PI / 2; this.ripple.position.y = .045;
    // A faint aura just behind the piece (seen from the camera), so it backlights rather than fogs it.
    const haloMaterial = new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: .16 * s, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.owned.material.push(haloMaterial);
    this.halo = new THREE.Sprite(haloMaterial); this.halo.scale.setScalar(this.size * 1.8);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.3, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: .3, metalness: .2 }));
    gem.scale.set(1, 1.4, 1); this.placeholder = this.own(gem); this.item.add(gem);
    this.item.position.y = HOVER + 1.1;
    this.group.add(this.beam, this.core, this.pool, this.ripple, this.halo, this.item);
  }

  /** Swap the gem for the real model. `wornId` picks one piece out of a body-fitted set file. */
  setModel(source: THREE.Object3D, wornId?: string): boolean {
    source.updateMatrixWorld(true);
    const holder = new THREE.Group();
    source.traverse(node => {
      if (!(node instanceof THREE.Mesh) || (wornId && (node.userData.wornGear ?? wornId) !== wornId)) return;
      // A plain mesh over the shared geometry: a skinned piece shows its rest shape.
      const materials = (Array.isArray(node.material) ? node.material : [node.material]).map(material => {
        const copy = material.clone();
        // A faint rarity glow keeps dark leather and iron readable on dark stone.
        if (copy instanceof THREE.MeshStandardMaterial && !copy.emissiveMap) { copy.emissive.setHex(this.color); copy.emissiveIntensity = .04 + .05 * this.strength; }
        this.owned.material.push(copy); return copy;
      });
      const mesh = new THREE.Mesh(node.geometry, materials.length === 1 ? materials[0] : materials);
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(node.matrixWorld); mesh.frustumCulled = false;
      holder.add(mesh);
    });
    if (!holder.children.length) return false;
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const scale = this.size / Math.max(size.x, size.y, size.z, 1e-3);
    holder.scale.setScalar(scale); holder.position.copy(center).multiplyScalar(-scale);
    this.flat = Math.min(size.x, size.y, size.z) < Math.max(size.x, size.y, size.z) * .3;
    // A flat piece leans back so its face looks up at the camera; a solid one tips a little, as if it landed on one corner.
    const tilt = new THREE.Group(); tilt.rotation.set(this.flat ? -.55 : .1, 0, this.flat ? 0 : -.12); tilt.add(holder);
    if (this.placeholder) { this.item.remove(this.placeholder); this.placeholder = undefined; }
    this.item.add(tilt);
    return true;
  }

  /**
   * Drop, rest, then fly to `pack` (world space). Returns false when it has
   * reached the pack and can be disposed.
   */
  update(age: number, pack: THREE.Vector3): boolean {
    const s = this.strength;
    const grow = THREE.MathUtils.smoothstep(age, 0, .4), fade = 1 - THREE.MathUtils.smoothstep(age, GEAR_DROP_SHOW, GEAR_DROP_SHOW + .3);
    this.beam.scale.set(1, Math.max(.001, grow), 1); this.beam.position.y = 2.6 * grow;
    this.core.scale.set(1, Math.max(.001, grow), 1); this.core.position.y = 2.2 * grow;
    for (const pillar of [this.beam, this.core]) pillar.material.uniforms.time.value = age;
    this.beam.material.uniforms.opacity.value = .62 * s * fade * (.92 + Math.sin(age * 5.3) * .08);
    this.core.material.uniforms.opacity.value = .9 * s * fade;
    this.pool.material.opacity = .55 * s * fade * (.9 + Math.sin(age * 2.6) * .1);
    const wave = (age % 1.3) / 1.3;
    this.ripple.scale.setScalar(1 + wave * 1.6); this.ripple.material.opacity = (1 - wave) * .5 * s * fade * grow;
    (this.halo.material as THREE.SpriteMaterial).opacity = .16 * s * fade * (.85 + Math.sin(age * 3.4) * .15);
    const settle = Math.max(0, .6 - age) * 6;
    this.item.rotation.y = this.facing + settle + (this.flat ? Math.sin(age * 1.4) * .5 : age * 1.15);
    let t = 0;
    if (age < GEAR_DROP_SHOW) {
      // Falls in with two soft bounces, then hovers with a slow breath.
      const bounce = Math.abs(Math.cos(age * 5.4)) * 1.1 * Math.max(0, 1 - age / 1.05);
      this.item.position.set(0, HOVER + bounce + Math.sin(age * 2.2) * .05 * grow, 0);
    } else {
      // Then it rushes into the hero's pack, as a relic does when walked over.
      t = Math.min(1, (age - GEAR_DROP_SHOW) / GEAR_DROP_FLIGHT);
      const rest = new THREE.Vector3(0, HOVER, 0), local = pack.clone().sub(this.group.position);
      this.item.position.lerpVectors(rest, local, t * t).y += Math.sin(t * Math.PI) * .5;
      this.item.scale.setScalar(1 - t * .7);
    }
    this.halo.position.set(-Math.sin(this.facing) * .45, 0, -Math.cos(this.facing) * .45).add(this.item.position);
    return t < 1;
  }

  /** The item's world position, for the pickup burst. */
  get itemPosition(): THREE.Vector3 { return this.item.getWorldPosition(new THREE.Vector3()); }

  dispose(): void {
    this.group.removeFromParent();
    this.owned.geometry.forEach(geometry => geometry.dispose());
    this.owned.material.forEach(material => material.dispose());
  }

  private own<T extends THREE.Mesh>(mesh: T): T {
    this.owned.geometry.push(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) this.owned.material.push(material);
    return mesh;
  }
}
