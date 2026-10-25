import * as THREE from 'three';

/** Gold of the elite's aura, name plate and health bar. */
export const ELITE_COLOR = 0xffc14d;
/** An elite stands this much taller than others of its kind. */
export const ELITE_SCALE = 1.3;

const TITLES: Record<string, string> = {
  skeleton: 'Bonelord', revenant: 'Iron Revenant', wraith: 'Grave Wraith', guardian: 'Stone Warden', 'vault-guardian-boss': 'Stone Warden',
};
const EPITHETS = ['the Gilded', 'the Undying', 'of the Deep Vault', 'the Ashen', 'the Old Crown', 'the Rune-Bound'];

/** A champion's name, the same for the same model and seat in the pack. */
export function eliteName(modelId: string, seed: number): string {
  return `${TITLES[modelId] ?? 'Champion'} ${EPITHETS[Math.abs(Math.floor(seed)) % EPITHETS.length]}`;
}

/** A soft radial ring texture: bright at its rim, empty inside and out. */
function ringTexture(): THREE.Texture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    const gradient = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0)'); gradient.addColorStop(.62, 'rgba(255,255,255,.08)');
    gradient.addColorStop(.82, 'rgba(255,255,255,.95)'); gradient.addColorStop(.9, 'rgba(255,255,255,.35)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient; g.fillRect(0, 0, 128, 128);
    // Rune notches round the ring.
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2;
    for (let n = 0; n < 12; n++) {
      const a = n / 12 * Math.PI * 2;
      g.beginPath(); g.moveTo(64 + Math.cos(a) * 41, 64 + Math.sin(a) * 41); g.lineTo(64 + Math.cos(a) * 47, 64 + Math.sin(a) * 47); g.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The elite's aura: a slowly turning rune ring on the floor and a warm glow
 * about its body. Attached to the enemy's root, so it follows every move.
 */
export class EliteAura {
  readonly object = new THREE.Group();
  private readonly ring: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly inner: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly glow: THREE.Sprite;
  private readonly texture: THREE.Texture;
  private fade = 1;

  constructor(glowMap: THREE.Texture, private readonly height: number, radius: number) {
    this.object.name = 'EliteAura';
    this.texture = ringTexture();
    const ring = (size: number, opacity: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: this.texture, color: ELITE_COLOR, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = .03; mesh.renderOrder = 2; this.object.add(mesh); return mesh;
    };
    this.ring = ring(radius * 3.4, .9); this.inner = ring(radius * 2.3, .45);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: ELITE_COLOR, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.glow.position.y = height * .5; this.glow.scale.set(height * 1.1, height * 1.3, 1); this.object.add(this.glow);
  }

  /** Turns and breathes; fades out once the elite has fallen. */
  update(elapsed: number, delta: number, alive: boolean): void {
    this.fade = alive ? Math.min(1, this.fade + delta * 2) : Math.max(0, this.fade - delta * 1.5);
    this.object.visible = this.fade > 0;
    const pulse = .5 + .5 * Math.sin(elapsed * 2.6);
    this.ring.rotation.z = elapsed * .5; this.inner.rotation.z = -elapsed * .8;
    this.ring.material.opacity = (.7 + pulse * .3) * this.fade; this.inner.material.opacity = (.3 + pulse * .2) * this.fade;
    this.glow.material.opacity = (.22 + pulse * .12) * this.fade;
    this.glow.position.y = this.height * (.5 + Math.sin(elapsed * 1.3) * .02);
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const mesh of [this.ring, this.inner]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.glow.material.dispose(); this.texture.dispose();
  }
}
