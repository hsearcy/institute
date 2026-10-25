/**
 * The minimap and the pack's idle sounds: two quiet ways to find the next
 * fight without guide arrows. The map turns with the isometric camera, so up
 * on the map is up on the screen. Presentation only.
 */
import { LurkTimer, ScoutMemory, packShown, rectCorners, rectDistance, screenAngle, toScreen, type ScoutView } from './minimapModel';
import './minimap.css';

type Scout = ScoutView & { level: object };
const FPS = 10;
/** Minimap pixels per metre. */
const SCALE = 4.4;
/** Enough grid to cover the frame at any turn. */
const SCREEN_TILT_MIN = .6;

const STYLE = {
  walkedFill: '#3a3223', walkedEdge: '#b08f55',
  seenFill: '#1d2829', seenEdge: '#5b6d66',
  exit: '#e3cf98', chest: '#ffcc62', pack: '#ff5b3d', hero: '#fff3d2',
};

export class Minimap {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly memory = new ScoutMemory();
  private readonly lurk = new LurkTimer();
  private level?: object;
  private timer: ReturnType<typeof setInterval> | null = null;
  private width = 0;
  private height = 0;

  constructor(host: HTMLElement, private readonly source: () => Scout | undefined, private readonly options: {
    visible: () => boolean; onLurk: (gain: number, pan: number) => void;
  }) {
    this.element = document.createElement('div');
    this.element.className = 'rpg-minimap';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.hidden = true;
    this.canvas = document.createElement('canvas');
    this.element.append(this.canvas);
    host.append(this.element);
    this.timer = setInterval(() => this.tick(), 1000 / FPS);
  }

  private tick(): void {
    const view = this.source();
    if (view && view.level !== this.level) { this.level = view.level; this.memory.clear(); }
    const show = !!view && this.options.visible();
    if (this.element.hidden !== !show) this.element.hidden = !show;
    if (!view || !show) return;
    this.memory.update(view);
    const sound = this.lurk.update(performance.now() / 1000, view);
    if (sound) this.options.onLurk(sound.gain, sound.pan);
    this.element.classList.toggle('engaged', view.engaged);
    this.draw(view);
  }

  private resize(): CanvasRenderingContext2D | null {
    const box = this.element.getBoundingClientRect(), ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(box.width), height = Math.round(box.height);
    if (!width || !height) return null;
    if (width !== this.width || height !== this.height || this.canvas.width !== Math.round(width * ratio)) {
      this.width = width; this.height = height;
      this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio);
    }
    const context = this.canvas.getContext('2d');
    context?.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
    return context;
  }

  private draw(view: Scout): void {
    const c = this.resize(); if (!c) return;
    const w = this.width, h = this.height, cx = w / 2, cy = h / 2, time = performance.now() / 1000;
    const scale = SCALE * Math.min(1, w / 200);
    c.clearRect(0, 0, w, h);
    const ground = c.createRadialGradient(cx, cy, 4, cx, cy, Math.max(w, h) * .7);
    ground.addColorStop(0, '#0e1617'); ground.addColorStop(1, '#040707');
    c.fillStyle = ground; c.fillRect(0, 0, w, h);
    const at = (x: number, z: number) => { const p = toScreen(x - view.hero.x, z - view.hero.z, scale); return { x: cx + p.x, y: cy + p.y }; };
    const shape = (corners: { x: number; y: number }[]) => {
      c.beginPath(); corners.forEach((p, i) => i ? c.lineTo(cx + p.x, cy + p.y) : c.moveTo(cx + p.x, cy + p.y)); c.closePath();
    };

    // A faint survey grid on the world axes, so the map slides as the hero walks.
    c.strokeStyle = 'rgba(190,170,120,.05)'; c.lineWidth = 1; c.beginPath();
    const reach = Math.max(w, h) / scale / SCREEN_TILT_MIN, step = 4;
    for (let k = Math.floor((view.hero.x - reach) / step) * step; k <= view.hero.x + reach; k += step) {
      const a = at(k, view.hero.z - reach), b = at(k, view.hero.z + reach); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
    }
    for (let k = Math.floor((view.hero.z - reach) / step) * step; k <= view.hero.z + reach; k += step) {
      const a = at(view.hero.x - reach, k), b = at(view.hero.x + reach, k); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
    }
    c.stroke();

    // Floor: edges first, then fills over them, so joined pieces read as one outline.
    const pieces: { rect: Parameters<typeof rectCorners>[0]; walked: boolean }[] = [];
    for (const corridor of view.corridors) if (this.memory.seenCorridors.has(corridor.id))
      for (const rect of corridor.rects) pieces.push({ rect, walked: this.memory.walkedCorridors.has(corridor.id) });
    const seenAreas = view.areas.filter(area => this.memory.seenAreas.has(area.id));
    for (const area of seenAreas) pieces.push({ rect: area.rect, walked: area.visited });
    c.lineJoin = 'round';
    for (const walked of [false, true]) for (const piece of pieces) if (piece.walked === walked) {
      shape(rectCorners(piece.rect, view.hero, scale));
      c.lineWidth = walked ? 3 : 2.4; c.strokeStyle = walked ? STYLE.walkedEdge : STYLE.seenEdge; c.stroke();
    }
    for (const walked of [false, true]) for (const piece of pieces) if (piece.walked === walked) {
      shape(rectCorners(piece.rect, view.hero, scale));
      c.fillStyle = walked ? STYLE.walkedFill : STYLE.seenFill; c.fill();
    }

    // Ways on: small notches at the open doorways of seen rooms.
    const seenAt = (x: number, z: number) => seenAreas.some(area => rectDistance(area.rect, { x, z }) < .6);
    c.fillStyle = STYLE.exit;
    for (const exit of view.openExits) if (seenAt(exit.x, exit.z)) {
      const p = at(exit.x, exit.z);
      c.globalAlpha = .55 + .25 * Math.sin(time * 2.4 + exit.x); diamond(c, p.x, p.y, 2.6);
    }
    c.globalAlpha = 1;

    // Closed chests in rooms the hero has seen.
    for (const chest of view.chests) if (!chest.opened && seenAt(chest.x, chest.z)) {
      const p = at(chest.x, chest.z);
      glow(c, p.x, p.y, 7, 'rgba(255,196,80,.45)');
      c.fillStyle = STYLE.chest; diamond(c, p.x, p.y, 3.4);
      c.strokeStyle = '#4a3410'; c.lineWidth = 1; c.stroke();
    }

    // The pack: a red mark once it is near enough to hear, held at the rim when beyond it.
    if (view.pack && packShown(view)) {
      const p = at(view.pack.x, view.pack.z), inset = 9;
      const x = Math.max(inset, Math.min(w - inset, p.x)), y = Math.max(inset, Math.min(h - inset, p.y));
      const pulse = (time * .9) % 1;
      c.beginPath(); c.arc(x, y, 5 + pulse * 9, 0, Math.PI * 2);
      c.strokeStyle = `rgba(255,92,60,${(1 - pulse) * .7})`; c.lineWidth = 1.6; c.stroke();
      glow(c, x, y, 11, 'rgba(255,70,40,.55)');
      c.beginPath(); c.arc(x, y, 4.2, 0, Math.PI * 2);
      c.fillStyle = STYLE.pack; c.fill(); c.strokeStyle = '#3b0b06'; c.lineWidth = 1.2; c.stroke();
    }

    // The hero: a lantern cone that shows which way they face.
    const angle = screenAngle(view.heading);
    const cone = c.createRadialGradient(cx, cy, 2, cx, cy, 20);
    cone.addColorStop(0, 'rgba(255,233,170,.5)'); cone.addColorStop(1, 'rgba(255,233,170,0)');
    c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, 20, angle - .55, angle + .55); c.closePath(); c.fillStyle = cone; c.fill();
    glow(c, cx, cy, 10, 'rgba(255,236,190,.45)');
    // A pin: a round head with a point toward the way the hero faces.
    const tip = 9.5, head = 4.6, side = Math.acos(head / tip);
    c.beginPath();
    c.moveTo(cx + Math.cos(angle) * tip, cy + Math.sin(angle) * tip);
    c.arc(cx, cy, head, angle + side, angle - side + Math.PI * 2);
    c.closePath(); c.fillStyle = STYLE.hero; c.fill(); c.strokeStyle = '#3c2d14'; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.arc(cx, cy, 1.7, 0, Math.PI * 2); c.fillStyle = '#b8873a'; c.fill();

    // Edges fade into the frame like a lantern's reach.
    const shade = c.createRadialGradient(cx, cy, Math.min(w, h) * .38, cx, cy, Math.max(w, h) * .62);
    shade.addColorStop(0, 'rgba(3,6,6,0)'); shade.addColorStop(1, 'rgba(3,6,6,.7)');
    c.fillStyle = shade; c.fillRect(0, 0, w, h);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.element.remove();
  }
}

function diamond(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill();
}

function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}
