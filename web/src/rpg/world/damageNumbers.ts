import * as THREE from 'three';

export type DamageKind = 'hit' | 'kill' | 'big';
type Floating = { sprite: THREE.Sprite; age: number; drift: number; kind: DamageKind };

const LIFE = .85;
const STYLE: Record<DamageKind, { fill: string; glow: string; size: number }> = {
  hit: { fill: '#f4ead2', glow: '#7a4b12', size: .62 },
  big: { fill: '#ffd36b', glow: '#a1400a', size: .84 },
  kill: { fill: '#ffb347', glow: '#7a1d06', size: .92 },
};

/**
 * Damage the server already decided, drawn where it landed. A pop, a rise and
 * a fade, like an action RPG. Textures are cached by text and style.
 */
export class DamageNumbers {
  readonly group = new THREE.Group();
  private readonly live: Floating[] = [];
  private readonly textures = new Map<string, THREE.CanvasTexture>();

  constructor() { this.group.name = 'DamageNumbers'; }

  spawn(at: THREE.Vector3, value: number, kind: DamageKind): void {
    const text = String(Math.max(0, Math.round(value)));
    const style = STYLE[kind];
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture(text, kind), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    sprite.renderOrder = 20; sprite.position.copy(at);
    const aspect = (sprite.material.map!.image as HTMLCanvasElement).width / (sprite.material.map!.image as HTMLCanvasElement).height;
    sprite.userData.size = new THREE.Vector2(style.size * aspect, style.size);
    this.group.add(sprite);
    this.live.push({ sprite, age: 0, drift: (Math.random() - .5) * .9, kind });
  }

  update(delta: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const number = this.live[i]!; number.age += delta;
      const t = number.age / LIFE;
      if (t >= 1) { this.group.remove(number.sprite); number.sprite.material.dispose(); this.live.splice(i, 1); continue; }
      // Overshoot pop, then settle while rising.
      const pop = number.age < .1 ? .4 + number.age / .1 * 1.05 : 1.45 - Math.min(1, (number.age - .1) / .14) * .45;
      const size = number.sprite.userData.size as THREE.Vector2;
      number.sprite.scale.set(size.x * pop, size.y * pop, 1);
      number.sprite.position.y += delta * (1.5 - t * 1.2);
      number.sprite.position.x += delta * number.drift;
      number.sprite.material.opacity = 1 - THREE.MathUtils.smoothstep(t, .62, 1);
    }
  }

  clear(): void {
    for (const number of this.live) { this.group.remove(number.sprite); number.sprite.material.dispose(); }
    this.live.length = 0;
  }

  dispose(): void { this.clear(); this.textures.forEach(texture => texture.dispose()); this.textures.clear(); }

  private texture(text: string, kind: DamageKind): THREE.CanvasTexture {
    const key = `${kind}:${text}`, cached = this.textures.get(key);
    if (cached) return cached;
    const style = STYLE[kind], canvas = document.createElement('canvas');
    canvas.height = 128; canvas.width = 64 + text.length * 62;
    const context = canvas.getContext('2d')!;
    context.font = `700 104px Cinzel, "Trajan Pro", Georgia, serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    const x = canvas.width / 2, y = canvas.height / 2 + 6;
    context.lineJoin = 'round';
    context.shadowColor = style.glow; context.shadowBlur = 18;
    context.lineWidth = 14; context.strokeStyle = '#140904'; context.strokeText(text, x, y);
    context.shadowBlur = 0;
    const gradient = context.createLinearGradient(0, 20, 0, 110);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.45, style.fill); gradient.addColorStop(1, style.glow);
    context.fillStyle = gradient; context.fillText(text, x, y);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    if (this.textures.size > 160) { this.textures.forEach(old => old.dispose()); this.textures.clear(); }
    this.textures.set(key, texture);
    return texture;
  }
}
