import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { chainOf, type LinkKind, type Voyage, type VoyageIsland, type VoyageLink, type VoyageTopic } from './masteryMapModel';
import { escapeHtml as esc } from './icons';

/** Marker and link colours shared with the ship's log. */
export const VOYAGE_COLORS = { mastered: 0xe8c27a, practicing: 0x7fd6cf, ready: 0xefe6d2, locked: 0x6b7470 } as const;
const SHEATH_OPACITY = .16;
/** Within this camera distance every skill shows its name; further out only mastered and practicing skills do. */
const LABEL_NEAR = 95;
const LINK_STYLE: Record<LinkKind, { color: number; opacity: number }> = {
  walked: { color: 0xf0c470, opacity: .85 }, open: { color: 0x86ece3, opacity: .95 }, ahead: { color: 0xc4d0cb, opacity: .3 },
};

// ---------- deterministic terrain noise ----------
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function valueNoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number, s: number) => valueNoise(x, y, s) * .55 + valueNoise(x * 2.1, y * 2.1, s + 7) * .3 + valueNoise(x * 4.3, y * 4.3, s + 13) * .15;
const rng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

type Island = VoyageIsland & { center: THREE.Vector3; size: number; height: number; seed: number; arrive?: THREE.QuadraticBezierCurve3 };
type Placed = { topic: VoyageTopic; pos: THREE.Vector3; group: THREE.Group; tag: HTMLElement };
type DrawnLink = { link: VoyageLink; material: THREE.MeshBasicMaterial; sheath: THREE.MeshBasicMaterial | null; pathSheath: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>; base: number; motes: THREE.Sprite[] };
type Tag = { el: HTMLElement; pos: THREE.Vector3; always: boolean; box?: { w: number; h: number } };

/** Lower ranks are placed first and never hide behind higher ranks. */
function labelRank(cls: DOMTokenList): number {
  if (cls.contains('selected')) return 0;
  if (cls.contains('chain-below') || cls.contains('chain-above')) return 1;
  if (cls.contains('rpg-voyage-here') || cls.contains('rpg-voyage-banner')) return 2;
  if (cls.contains('mastered') || cls.contains('practicing')) return 3;
  return cls.contains('ready') ? 4 : 5;
}

export type MasteryMapOptions = { onSelect: (topic: VoyageTopic) => void };

/** The voyage map: one island per math domain, prerequisite arcs between skills, the ship at the current island. */
export class MasteryMapScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, .5, 2000);
  private readonly controls: OrbitControls;
  private readonly labels: HTMLElement;
  private readonly islands: Island[];
  private readonly placed = new Map<string, Placed>();
  private readonly links: DrawnLink[] = [];
  private readonly tags: Tag[] = [];
  private readonly animators: ((t: number) => void)[] = [];
  private readonly hitTargets: THREE.Object3D[] = [];
  private readonly islandTargets: THREE.Object3D[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly selectionRing: THREE.Mesh;
  private seaGeometry!: THREE.PlaneGeometry;
  private seaBase!: Float32Array;
  private glowTexture!: THREE.Texture;
  private puffTexture!: THREE.Texture;
  private frame = 0;
  private selected: VoyageTopic | null = null;
  private fly: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t: number } | null = null;

  constructor(private readonly stage: HTMLElement, private readonly voyage: Voyage, private readonly options: MasteryMapOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'rpg-voyage-canvas';
    stage.prepend(this.renderer.domElement);
    this.labels = stage.querySelector<HTMLElement>('.rpg-voyage-labels')!;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: .08, maxPolarAngle: Math.PI * .46, minDistance: 18, maxDistance: 340 });

    this.makeTextures();
    this.islands = this.layoutIslands();
    this.buildWorld();
    this.islands.forEach(island => this.buildIsland(island));
    this.buildForest();
    this.buildRoute();
    this.buildLinks();
    this.selectionRing = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.85, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, side: THREE.DoubleSide, fog: false }));
    this.selectionRing.rotation.x = -Math.PI / 2; this.selectionRing.visible = false; this.scene.add(this.selectionRing);
    this.frameOpeningView();

    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    this.resize();
    this.animate();
  }

  /** Flies the camera to one island of the voyage. */
  focusIsland(index: number): void {
    const island = this.islands[index];
    if (!island) return;
    const target = island.center.clone().setY(island.height * .4);
    this.fly = { from: this.controls.target.clone(), to: target, camFrom: this.camera.position.clone(), camTo: target.clone().add(new THREE.Vector3(island.size * 1.2, island.size * 1.9 + 14, island.size * 2.6 + 12)), t: 0 };
  }

  /** Highlights one skill and its whole chain: every skill under it (gold) and every skill it leads to (teal). */
  select(id: string | null): void {
    const placed = id ? this.placed.get(id) : undefined;
    this.selected = placed?.topic ?? null;
    const below = this.selected ? chainOf(this.voyage, this.selected.id, 'below') : new Set<string>();
    const above = this.selected ? chainOf(this.voyage, this.selected.id, 'above') : new Set<string>();
    const self = this.selected?.id;
    for (const drawn of this.links) {
      const { from, to } = drawn.link;
      const feeds = !!self && below.has(from.id) && (below.has(to.id) || to.id === self);
      const leads = !!self && above.has(to.id) && (above.has(from.id) || from.id === self);
      const onPath = feeds || leads;
      drawn.material.opacity = !self ? drawn.base : onPath ? 1 : .04;
      drawn.material.color.setHex(feeds ? 0xffcf6e : leads ? 0x7ff5ea : LINK_STYLE[drawn.link.kind].color);
      if (drawn.sheath) drawn.sheath.opacity = !self ? SHEATH_OPACITY : onPath ? .42 : 0;
      drawn.pathSheath.visible = onPath && !drawn.sheath;
      drawn.pathSheath.material.color.setHex(feeds ? 0xffcf6e : 0x7ff5ea);
      drawn.motes.forEach(mote => mote.visible = !self || onPath);
    }
    for (const entry of this.placed.values()) {
      const tid = entry.topic.id, inChain = below.has(tid) || above.has(tid);
      entry.tag.classList.toggle('selected', tid === self);
      entry.tag.classList.toggle('chain-below', below.has(tid));
      entry.tag.classList.toggle('chain-above', above.has(tid) && !below.has(tid));
      entry.tag.classList.toggle('faded', !!self && !inChain && tid !== self);
    }
    this.labels.classList.toggle('has-selection', !!self);
    this.selectionRing.visible = !!placed;
    if (placed) this.selectionRing.position.copy(placed.pos).setY(placed.pos.y + .15);
    if (this.selected) this.options.onSelect(this.selected);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (material) (Array.isArray(material) ? material : [material]).forEach(m => m.dispose());
    });
    this.textures.forEach(texture => texture.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.replaceChildren();
  }

  // ---------- layout ----------
  private layoutIslands(): Island[] {
    let distance = 0;
    return this.voyage.islands.map((island, i, all) => {
      const size = 9 + Math.sqrt(island.topics.length) * 2.5;
      if (i) distance += 9 + Math.sqrt(all[i - 1].topics.length) * 2.5 + size + 24;
      // The route winds away from the opening camera, so later islands sit further out to sea.
      const center = new THREE.Vector3(Math.sin(distance * .028 + .3) * 58, 0, 90 - distance * .92);
      return { ...island, center, size, height: 4 + (island.maxDepth - island.minDepth) * 1.5, seed: i * 31 + 11 };
    });
  }

  private heightAt(island: Island, x: number, z: number): number {
    const r = Math.hypot(x, z) / island.size, edge = r + (fbm(x * .11 + island.seed, z * .11, island.seed) - .5) * .42;
    if (edge > 1) return -Math.min(5, (edge - 1) * 9);
    return Math.pow(1 - edge, 1.25) * island.height + (fbm(x * .3, z * .3, island.seed + 3) - .5) * 1.2 * (1 - edge) + .35;
  }

  // ---------- world ----------
  private makeTextures(): void {
    const radial = (soft: boolean) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      const g = canvas.getContext('2d')!, gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(soft ? .5 : .22, 'rgba(255,255,255,.5)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gradient; g.fillRect(0, 0, 128, 128);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.push(texture); return texture;
    };
    this.glowTexture = radial(false); this.puffTexture = radial(true);
  }
  private glow(color: number, size: number, opacity = 1): THREE.Sprite {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sprite.scale.setScalar(size); return sprite;
  }
  private std(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: .9, flatShading: true, ...extra });
  }

  private buildWorld(): void {
    const fog = 0x2a4a55;
    this.scene.fog = new THREE.Fog(fog, 150, 440);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x0a1820) }, mid: { value: new THREE.Color(fog) }, glow: { value: new THREE.Color(0xd99a62) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 glow; varying vec3 vP;
        void main(){ float h = clamp(vP.y, 0., 1.); vec3 c = mix(mid, top, pow(h, .55));
          float sun = pow(max(dot(normalize(vec3(vP.x, 0., vP.z)), normalize(vec3(.6, 0., -1.))), 0.), 6.) * (1. - smoothstep(0., .35, h));
          gl_FragColor = vec4(c + glow * sun * .3, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.scene.add(sky);
    this.scene.add(new THREE.HemisphereLight(0xa8c8d0, 0x1b2a26, 2.1));
    const sun = new THREE.DirectionalLight(0xffd2a0, 3.6);
    sun.position.set(90, 110, -140); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 10, far: 540 });
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0008;
    const mid = this.islands[Math.floor(this.islands.length / 2)]?.center ?? new THREE.Vector3();
    sun.position.add(mid); sun.target.position.copy(mid);
    this.scene.add(sun, sun.target);

    this.seaGeometry = new THREE.PlaneGeometry(900, 900, 150, 150); this.seaGeometry.rotateX(-Math.PI / 2);
    this.seaBase = Float32Array.from(this.seaGeometry.attributes.position.array as Float32Array);
    const sea = new THREE.Mesh(this.seaGeometry, new THREE.MeshLambertMaterial({ color: 0x1b4f58, flatShading: true, transparent: true, opacity: .94 }));
    sea.receiveShadow = true; this.scene.add(sea);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: 0x0f2b30 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -4; this.scene.add(floor);
  }

  private buildIsland(island: Island): void {
    const SAND = new THREE.Color(0xd9c28c), GRASS = new THREE.Color(0x6a9a4e), DEEP = new THREE.Color(0x3d6b3b), ROCK = new THREE.Color(0x857b6c), PEAK = new THREE.Color(0xd6d2c4), GREY = new THREE.Color(0x7d8580), color = new THREE.Color();
    const span = island.size * 2.7, segments = Math.round(48 + island.size * 2);
    const geometry = new THREE.PlaneGeometry(span, span, segments, segments); geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position, colors: number[] = [], fade = island.state === 'uncharted' ? .55 : 0;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i), h = this.heightAt(island, x, z), k = h / island.height;
      position.setY(i, h);
      if (h < .9) color.copy(SAND); else if (k < .45) color.copy(GRASS).lerp(DEEP, fbm(x * .2, z * .2, 5)); else if (k < .8) color.copy(DEEP).lerp(ROCK, (k - .45) / .35); else color.copy(ROCK).lerp(PEAK, (k - .8) / .2);
      color.lerp(GREY, fade); colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    const land = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true }));
    land.position.copy(island.center); land.castShadow = land.receiveShadow = true; this.scene.add(land);
    land.userData.island = island.index; this.islandTargets.push(land);

    const shallow = new THREE.Mesh(new THREE.CircleGeometry(island.size * 1.42, 48), new THREE.MeshBasicMaterial({ color: 0x4fb3a8, transparent: true, opacity: .22, depthWrite: false }));
    shallow.rotation.x = -Math.PI / 2; shallow.position.copy(island.center).setY(.08); this.scene.add(shallow);
    const surf = new THREE.Mesh(new THREE.RingGeometry(island.size * 1.02, island.size * 1.12, 64), new THREE.MeshBasicMaterial({ color: 0xeaf6f2, transparent: true, opacity: .35, depthWrite: false }));
    surf.rotation.x = -Math.PI / 2; surf.position.copy(island.center).setY(.18); this.scene.add(surf);
    this.animators.push(t => { (surf.material as THREE.MeshBasicMaterial).opacity = .22 + Math.sin(t * 1.3 + island.index) * .12; surf.scale.setScalar(1 + Math.sin(t * 1.3 + island.index) * .02); });

    // A road spirals from the beach to the summit; skills sit along it in learning order.
    const a0 = Math.atan2(-island.center.z, -island.center.x) + Math.PI * .15, turns = 1 + island.topics.length / 24;
    const roadAt = (f: number) => {
      const a = a0 + f * Math.PI * 2 * turns, r = island.size * (.78 - .46 * f), x = Math.cos(a) * r, z = Math.sin(a) * r;
      return new THREE.Vector3(x, this.heightAt(island, x, z) + .12, z).add(island.center);
    };
    const points = Array.from({ length: 161 }, (_, i) => roadAt(i / 160));
    const lastOpen = island.topics.reduce((m, t, i) => t.status !== 'locked' ? i : m, -1);
    const split = Math.round(((lastOpen + .5) / island.topics.length) * 160);
    if (split > 1) this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.slice(0, split + 1)), split * 2, .3, 5), this.std(0xc9a873, { roughness: 1 })));
    if (split < 159) this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.slice(Math.max(0, split))), (160 - split) * 2, .2, 5), this.std(0x5d5a50, { roughness: 1, transparent: true, opacity: .55 })));
    island.topics.forEach((topic, i) => this.addMarker(topic, roadAt((i + .5) / island.topics.length)));
    (island as Island & { road: THREE.Vector3[] }).road = points;

    if (island.state !== 'explored') {
      const r = rng(island.seed + 99), count = island.state === 'uncharted' ? 16 : 7;
      for (let k = 0; k < count; k++) {
        const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTexture, color: 0xdfe7e6, transparent: true, opacity: island.state === 'uncharted' ? .5 : .3, depthWrite: false }));
        const a = r() * Math.PI * 2, rr = r() * island.size * .8, base = new THREE.Vector3(Math.cos(a) * rr, island.height * .7 + 2 + r() * 4, Math.sin(a) * rr).add(island.center);
        cloud.position.copy(base); cloud.scale.set(10 + r() * 10, 5 + r() * 4, 1); this.scene.add(cloud);
        const phase = r() * 6; this.animators.push(t => { cloud.position.x = base.x + Math.sin(t * .15 + phase) * 2.5; });
      }
    }
    const banner = document.createElement('div');
    banner.className = `rpg-voyage-banner ${island.state}`;
    banner.innerHTML = `<b>${esc(island.name)}</b><span>${esc(island.domain)} · ${island.mastered} / ${island.topics.length}</span>`;
    banner.title = `Sail to ${island.name}`;
    banner.addEventListener('click', () => this.focusIsland(island.index));
    this.addTag(banner, island.center.clone().add(new THREE.Vector3(0, 1.5, island.size * 1.3)), true);
  }

  private buildForest(): void {
    const spots: { p: THREE.Vector3; s: number; faded: boolean; rock: boolean }[] = [];
    for (const island of this.islands) {
      const r = rng(island.seed * 7 + 3), road = (island as Island & { road: THREE.Vector3[] }).road;
      for (let k = 0; k < island.size * 9; k++) {
        const a = r() * Math.PI * 2, rr = island.size * (.15 + r() * .82), x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = this.heightAt(island, x, z);
        const s = .7 + r() * .7, rock = r() < .18;
        if (h < 1.1 || h / island.height > .8) continue;
        const p = new THREE.Vector3(x, h, z).add(island.center);
        if (road.some(q => q.distanceToSquared(p) < 6)) continue;
        spots.push({ p, s, faded: island.state === 'uncharted', rock });
      }
    }
    const trees = spots.filter(t => !t.rock), rocks = spots.filter(t => t.rock);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(.9, 2.6, 6), this.std(0xffffff), trees.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.14, .2, .9, 5), this.std(0x5b4430), trees.length);
    const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.7), this.std(0x8a8478), rocks.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), scale = new THREE.Vector3(), c = new THREE.Color();
    trees.forEach((t, i) => {
      scale.setScalar(t.s); m.compose(t.p.clone().setY(t.p.y + 2 * t.s), q, scale); crown.setMatrixAt(i, m);
      c.setHSL(.28 + (i % 7) * .012, .38, t.faded ? .2 : .26 + (i % 5) * .025); crown.setColorAt(i, c);
      m.compose(t.p.clone().setY(t.p.y + .45 * t.s), q, scale); trunk.setMatrixAt(i, m);
    });
    rocks.forEach((t, i) => { q.setFromEuler(new THREE.Euler(i, i * 2, 0)); scale.set(t.s, t.s * .7, t.s); m.compose(t.p, q, scale); rock.setMatrixAt(i, m); });
    [crown, trunk, rock].forEach(o => { o.castShadow = o.receiveShadow = true; this.scene.add(o); });
  }

  private addMarker(topic: VoyageTopic, pos: THREE.Vector3): void {
    const g = new THREE.Group(); g.position.copy(pos);
    if (topic.status === 'mastered') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(.55, .7, .5, 6), this.std(0x77705f)); base.position.y = .25;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.14, .2, 2, 6), this.std(0x5b4430)); post.position.y = 1.4;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.6, .25, .45, 8), this.std(0xa07c3e, { metalness: .6, roughness: .4 })); bowl.position.y = 2.5;
      const fire = this.glow(0xffb45a, 4.2); fire.position.y = 3.1;
      const core = this.glow(0xfff1c8, 1.6); core.position.y = 3;
      const light = new THREE.PointLight(0xffa850, 26, 7, 2); light.position.y = 3.2;
      [base, post, bowl].forEach(o => o.castShadow = true);
      g.add(base, post, bowl, fire, core, light);
      this.animators.push(t => { const f = Math.sin(t * 7 + pos.x) * .3 + Math.sin(t * 13 + pos.z) * .15; fire.scale.setScalar(4 + f); light.intensity = 25 + f * 12; });
    } else if (topic.status === 'practicing') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.9, .1, 6, 20), new THREE.MeshBasicMaterial({ color: VOYAGE_COLORS.practicing })); ring.rotation.x = Math.PI / 2; ring.position.y = .2;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.62), this.std(0x2f8f88, { emissive: 0x2aa59c, emissiveIntensity: 1.1 })); gem.position.y = 1.8;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.35, .6, 22, 12, 1, true), new THREE.MeshBasicMaterial({ color: VOYAGE_COLORS.practicing, transparent: true, opacity: .1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      beam.position.y = 11;
      const halo = this.glow(VOYAGE_COLORS.practicing, 3.6, .7); halo.position.y = 1.8;
      const light = new THREE.PointLight(0x7fd6cf, 18, 6, 2); light.position.y = 2;
      g.add(ring, gem, beam, halo, light);
      this.animators.push(t => { gem.position.y = 1.8 + Math.sin(t * 2 + pos.x) * .2; gem.rotation.y = t * 1.2; (beam.material as THREE.MeshBasicMaterial).opacity = .08 + Math.sin(t * 2.4 + pos.z) * .04; halo.material.opacity = .5 + Math.sin(t * 3) * .25; });
    } else if (topic.status === 'ready') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 2.4, 5), this.std(0xd8ccb0)); pole.position.y = 1.2;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .65, 4, 1), new THREE.MeshStandardMaterial({ color: 0xefe6d2, side: THREE.DoubleSide, flatShading: true })); flag.position.set(.56, 2.05, 0);
      pole.castShadow = flag.castShadow = true; g.add(pole, flag);
      const fp = flag.geometry.attributes.position, fb = Float32Array.from(fp.array as Float32Array);
      this.animators.push(t => { for (let i = 0; i < fp.count; i++) { const x = fb[i * 3]; fp.setZ(i, Math.sin(t * 4 + x * 4 + pos.x) * .12 * (x + .55)); } fp.needsUpdate = true; });
    } else {
      for (let k = 0; k < 3; k++) { const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(.42 - k * .1), this.std(0x59605b)); stone.position.y = .3 + k * .5; stone.rotation.y = k; g.add(stone); }
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.2; hit.userData.topicId = topic.id; g.add(hit); this.hitTargets.push(hit);
    this.scene.add(g);
    const tag = document.createElement('div');
    tag.className = `rpg-voyage-tag ${topic.status}`; tag.textContent = topic.kidLabel;
    // Names are targets too: point to preview the chain, click to keep it lit.
    tag.addEventListener('pointerenter', () => this.select(topic.id));
    tag.addEventListener('pointerleave', () => this.select(this.pinned));
    tag.addEventListener('click', () => { this.pinned = topic.id; this.select(topic.id); });
    this.addTag(tag, pos.clone().setY(pos.y + (topic.status === 'mastered' ? 4.2 : 3.2)), topic.status === 'mastered' || topic.status === 'practicing');
    this.placed.set(topic.id, { topic, pos, group: g, tag });
  }

  private addTag(el: HTMLElement, pos: THREE.Vector3, always: boolean): void { this.labels.append(el); this.tags.push({ el, pos, always }); }

  // ---------- the sea route and the ship ----------
  private buildRoute(): void {
    const dock = (island: Island, toward: THREE.Vector3) => island.center.clone().add(toward.clone().sub(island.center).setY(0).normalize().multiplyScalar(island.size * 1.25)).setY(.35);
    const first = this.islands[0];
    if (!first) return;
    const start = first.center.clone().add(new THREE.Vector3(0, .35, first.size * 2.2));
    this.islands.forEach((island, i) => {
      const from = i ? dock(this.islands[i - 1], island.center) : start, to = dock(island, i ? this.islands[i - 1].center : start);
      const side = new THREE.Vector3(to.z - from.z, 0, from.x - to.x).normalize().multiplyScalar(from.distanceTo(to) * .18 * (i % 2 ? 1 : -1));
      const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, .5).add(side), to);
      island.arrive = curve;
      if (i <= this.voyage.frontier) {
        const wake = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, .32, 5), new THREE.MeshBasicMaterial({ color: 0xe8c27a, transparent: true, opacity: .85 }));
        wake.position.y = .35; this.scene.add(wake);
        const buoy = this.glow(0xe8c27a, 2.2, .8); buoy.position.copy(to).setY(1); this.scene.add(buoy);
      } else {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)), new THREE.LineDashedMaterial({ color: 0xb8c6c2, dashSize: .8, gapSize: 1.4, transparent: true, opacity: .5 }));
        line.computeLineDistances(); line.position.y = .5; this.scene.add(line);
      }
    });
    const current = this.islands[this.voyage.frontier], at = current.arrive!.getPoint(.94), ahead = current.arrive!.getPoint(1);
    const ship = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.1, .55, 4.6, 6, 1), this.std(0x6b4a2c)); hull.rotation.x = Math.PI / 2; hull.scale.set(1, 1, .55); hull.position.y = .3;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.4, .15, 3.6), this.std(0x9a7a50)); deck.position.y = .75;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 4.4, 5), this.std(0x5b4430)); mast.position.y = 2.9;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4, 3, 3), new THREE.MeshStandardMaterial({ color: 0xefe6d2, side: THREE.DoubleSide, flatShading: true })); sail.position.set(0, 3.1, .1);
    const pennant = new THREE.Mesh(new THREE.ConeGeometry(.25, 1.1, 3), new THREE.MeshBasicMaterial({ color: VOYAGE_COLORS.practicing })); pennant.rotation.z = -Math.PI / 2; pennant.position.set(.55, 5, 0);
    const lantern = new THREE.PointLight(0xffc070, 20, 10, 2); lantern.position.set(0, 1.6, -1.6);
    const lanternGlow = this.glow(0xffc070, 1.4); lanternGlow.position.set(0, 1.4, -1.7);
    ship.add(hull, deck, mast, sail, pennant, lantern, lanternGlow);
    ship.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    ship.position.copy(at).setY(0); ship.lookAt(ahead.x, 0, ahead.z); ship.scale.setScalar(2); this.scene.add(ship);
    this.animators.push(t => { ship.position.y = Math.sin(t * 1.4) * .18; ship.rotation.z = Math.sin(t * 1.1) * .05; });
    const here = document.createElement('div'); here.className = 'rpg-voyage-here'; here.textContent = 'You are here';
    this.addTag(here, at.clone().setY(13), true);
  }

  // ---------- prerequisite arcs ----------
  private buildLinks(): void {
    for (const link of this.voyage.links) {
      const a = this.placed.get(link.from.id)!.pos, b = this.placed.get(link.to.id)!.pos;
      const lift = link.crossIsland ? a.distanceTo(b) * .2 + 7 : a.distanceTo(b) * .3 + 1.6;
      const start = a.clone().setY(a.y + 1.4), end = b.clone().setY(b.y + 1.4), mid = start.clone().lerp(end, .5);
      mid.y = Math.max(start.y, end.y) + lift;
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const style = LINK_STYLE[link.kind];
      const material = new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false, fog: false });
      const core = link.kind === 'ahead' ? .08 : link.crossIsland ? .2 : .14;
      this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, link.crossIsland ? 48 : 24, core, 6), material));
      // A soft glowing sheath keeps open routes readable from across the sea.
      const sheath = link.kind === 'ahead' ? null : new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: SHEATH_OPACITY, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      if (sheath) this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, link.crossIsland ? 48 : 24, link.crossIsland ? .9 : .5, 8), sheath));
      // Routes to locked skills glow only while they are part of a highlighted chain.
      const pathSheath = new THREE.Mesh(new THREE.TubeGeometry(curve, link.crossIsland ? 48 : 24, link.crossIsland ? .9 : .5, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: .42, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      pathSheath.visible = false; this.scene.add(pathSheath);
      // Light drifts along open routes, from the skill he knows toward the one it unlocks.
      const motes = link.kind === 'ahead' ? [] : Array.from({ length: link.crossIsland ? 3 : 2 }, (_, i) => {
        const mote = this.glow(style.color, link.crossIsland ? 2.2 : 1.5, 1); this.scene.add(mote);
        const offset = i / (link.crossIsland ? 3 : 2), speed = link.crossIsland ? .08 : .22;
        this.animators.push(t => mote.position.copy(curve.getPoint((t * speed + offset) % 1)));
        mote.position.copy(curve.getPoint(offset));
        return mote;
      });
      this.links.push({ link, material, sheath, pathSheath, base: style.opacity, motes });
    }
  }

  // ---------- camera, input, loop ----------
  private frameOpeningView(): void {
    if (!this.islands.length) return;
    const first = this.islands[0].center, last = this.islands[this.islands.length - 1].center;
    this.controls.target.copy(first.clone().lerp(last, .42));
    // Narrow (portrait) stages pull the camera back so the whole route still fits.
    const aspect = this.stage.clientWidth / Math.max(1, this.stage.clientHeight);
    const pullBack = Math.min(2.2, Math.max(1, 1.4 / (aspect || 1)));
    this.camera.position.copy(this.controls.target).add(first.clone().sub(this.controls.target).add(new THREE.Vector3(-70, 70, 95)).multiplyScalar(pullBack));
    this.controls.update();
  }
  private resize(): void {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  private aim(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
  }
  private pick(event: PointerEvent): string | null {
    this.aim(event);
    return (this.raycaster.intersectObjects(this.hitTargets, false)[0]?.object.userData.topicId as string | undefined) ?? null;
  }
  private pickIsland(event: PointerEvent): number | null {
    this.aim(event);
    return (this.raycaster.intersectObjects(this.islandTargets, false)[0]?.object.userData.island as number | undefined) ?? null;
  }
  private down: { x: number; y: number } | null = null;
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    const id = this.pick(event);
    this.renderer.domElement.style.cursor = id || this.pickIsland(event) !== null ? 'pointer' : 'grab';
    const want = id ?? this.pinned;
    if (want !== (this.selected?.id ?? null)) this.select(want);
  };
  private pinned: string | null = null;
  private readonly onPointerDown = (event: PointerEvent): void => { this.down = { x: event.clientX, y: event.clientY }; };
  /** A tap (not a drag) picks a skill, or sails to the island under it; touch screens work the same way. */
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.down || Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 6) return;
    const id = this.pick(event);
    if (id) { this.pinned = id; this.select(id); return; }
    const island = this.pickIsland(event);
    if (island !== null) this.focusIsland(island);
    else { this.pinned = null; this.select(null); }
  };

  private readonly v = new THREE.Vector3();
  private animate = (): void => {
    this.frame = requestAnimationFrame(this.animate);
    const t = this.reduceMotion ? 0 : this.clock.getElapsedTime();
    const sea = this.seaGeometry.attributes.position, base = this.seaBase;
    if (!this.reduceMotion) {
      for (let i = 0; i < sea.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; sea.setY(i, Math.sin(x * .09 + t * .9) * .32 + Math.cos(z * .11 + t * .7) * .28 + Math.sin((x + z) * .05 + t * .4) * .2); }
      sea.needsUpdate = true;
    }
    this.animators.forEach(step => step(t));
    if (this.fly) {
      const f = this.fly; f.t = Math.min(1, f.t + .022);
      const e = this.reduceMotion ? 1 : f.t * f.t * (3 - 2 * f.t);
      this.controls.target.lerpVectors(f.from, f.to, e); this.camera.position.lerpVectors(f.camFrom, f.camTo, e);
      if (f.t >= 1 || this.reduceMotion) this.fly = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    const w = this.stage.clientWidth, h = this.stage.clientHeight, visible: { tag: Tag; x: number; y: number; rank: number }[] = [];
    for (const tag of this.tags) {
      this.v.copy(tag.pos).project(this.camera);
      const cls = tag.el.classList, distance = this.camera.position.distanceTo(tag.pos);
      const inChain = cls.contains('selected') || cls.contains('chain-below') || cls.contains('chain-above');
      const near = cls.contains('rpg-voyage-banner') || cls.contains('rpg-voyage-here') || inChain || distance < LABEL_NEAR || (tag.always && distance < 200);
      if (near && this.v.z < 1 && Math.abs(this.v.x) < 1.05 && Math.abs(this.v.y) < 1.05) visible.push({ tag, x: (this.v.x + 1) / 2 * w, y: (1 - this.v.y) / 2 * h, rank: labelRank(cls) });
      else tag.el.hidden = true;
    }
    // Declutter: the more important name wins any overlap; names outside the chain give way to it.
    visible.sort((a, b) => a.rank - b.rank);
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    for (const { tag, x, y, rank } of visible) {
      // Measure once while shown; a hidden label has no size yet, so estimate it from its text.
      const box = tag.box ?? (tag.el.hidden ? { w: (tag.el.textContent?.length ?? 10) * 7 + 16, h: 20 } : (tag.box = { w: tag.el.offsetWidth, h: tag.el.offsetHeight }));
      const lift = tag.el.classList.contains('rpg-voyage-banner') ? 0 : 1.5;
      const at = (dy: number) => ({ l: x - box.w / 2 - 2, r: x + box.w / 2 + 2, t: y + dy - box.h * lift - 1, b: y + dy - box.h * lift + box.h + 1 });
      const free = (rect: ReturnType<typeof at>) => !placed.some(o => rect.l < o.r && rect.r > o.l && rect.t < o.b && rect.b > o.t);
      // Slide a crowded name up or down a step at a time; chain names always find a place.
      const steps = rank <= 1 ? [0, -1, 1, -2, 2, -3, 3, -4, 4] : [0, -1, 1];
      const dy = steps.map(step => step * (box.h + 3)).find(offset => free(at(offset)));
      if (dy === undefined && rank > 1) { tag.el.hidden = true; continue; }
      const offset = dy ?? 0;
      tag.el.hidden = false;
      placed.push(at(offset));
      tag.el.style.left = `${x}px`; tag.el.style.top = `${y + offset}px`;
    }
  };
}
