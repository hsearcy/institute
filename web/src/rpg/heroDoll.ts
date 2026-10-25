import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createTripoHeroInstance } from './world/tripoHeroRuntime';
import { WornGear, WORN_KINDS, type WornKind } from './world/wornGear';
import { tripoHeroEquipment, type HeldEquipment } from './world/HeldEquipment';

/** What the dungeon world lends the doll: its loaded hero and the gear model cache. */
export interface HeroDollSource {
  hero: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
  gearModel(baseId: string): Promise<THREE.Object3D | undefined>;
  /** The loaded model of a relic (weapon or held item), when it has one. */
  itemModel(itemId: string): THREE.Object3D | undefined;
}

/**
 * The live hero in the middle of the paper doll, in the gear that is worn. One WebGL
 * canvas lives across sheet redraws: attach() moves it into the new markup and
 * updates the worn set. Geometry and textures stay owned by the world's caches;
 * the doll frees only its own materials, skeleton and context.
 */
export class HeroDoll {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(24, 1, .1, 20);
  private readonly pivot = new THREE.Group();
  private hero?: THREE.Group;
  private worn?: WornGear;
  private held?: HeldEquipment;
  private mixer?: THREE.AnimationMixer;
  private wanted: Partial<Record<WornKind, string>> = {};
  private readonly owned: THREE.Material[] = [];
  private host: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;
  private frame = 0;
  private disposed = false;
  private turn = -.35;
  private drag?: { x: number; turn: number };

  constructor(private readonly source: HeroDollSource) {}

  attach(host: HTMLElement, worn: Partial<Record<WornKind, string>>, itemId: string): void {
    if (this.disposed) return;
    this.host = host;
    if (!this.renderer && !this.start()) return;
    const canvas = this.renderer!.domElement;
    host.appendChild(canvas);
    host.classList.add('rpg-doll-live');
    this.observer?.disconnect();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    this.resize();
    this.wear(worn);
    this.hold(itemId);
  }

  private start(): boolean {
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch { return false; } // No WebGL: the painted portrait remains.
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    const canvas = renderer.domElement; canvas.className = 'rpg-doll-canvas'; canvas.setAttribute('aria-hidden', 'true');
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; pmrem.dispose();
    this.scene.environment = environment; this.scene.environmentIntensity = .5;
    // Warm torch key from the front left, cool rim behind, soft fill: the dungeon's palette.
    const key = new THREE.DirectionalLight(0xffe2bc, 2.1); key.position.set(-1.6, 2.4, 2.6);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.8); rim.position.set(1.8, 2, -2.4);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xd8e0ff, 0x2a2018, .7), this.pivot);

    const hero = createTripoHeroInstance(this.source.hero, 1.8);
    hero.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.frustumCulled = false; // Skinned bounds lag the idle pose.
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        this.owned.push(material); node.userData.dollMaterial = true;
        // The world's environment map belongs to its own WebGL context.
        if (material instanceof THREE.MeshStandardMaterial) { material.envMap = null; material.envMapIntensity = 1; }
      }
    });
    this.pivot.add(hero); this.hero = hero;
    this.worn = new WornGear(hero);
    this.held = tripoHeroEquipment(hero);
    this.mixer = new THREE.AnimationMixer(hero);
    const idle = this.source.clips.find(clip => clip.name.toLowerCase() === 'idle');
    if (idle) this.mixer.clipAction(idle).play();
    this.camera.position.set(0, 1.05, 5.4); this.camera.lookAt(0, .9, 0);

    canvas.addEventListener('pointerdown', event => { this.drag = { x: event.clientX, turn: this.turn }; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', event => { if (this.drag) this.turn = this.drag.turn + (event.clientX - this.drag.x) * .012; });
    const release = () => { this.drag = undefined; };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);

    let last = performance.now();
    const tick = (now: number) => {
      if (this.disposed || !this.renderer) return;
      const delta = Math.min(.05, (now - last) / 1000); last = now;
      this.mixer?.update(delta);
      this.held?.update(now / 1000);
      this.pivot.rotation.y = this.turn;
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    return true;
  }

  private wear(worn: Partial<Record<WornKind, string>>): void {
    this.wanted = { ...worn };
    for (const kind of WORN_KINDS) {
      const baseId = worn[kind];
      if (!baseId) { this.worn?.remove(kind); if (kind === 'helm') this.held?.setHelmWorn(false); continue; }
      if (this.worn?.worn()[kind] === baseId) continue;
      void this.source.gearModel(baseId).then(model => {
        if (this.disposed || this.wanted[kind] !== baseId || !model || !this.hero) return;
        this.worn?.wear(kind, baseId, model);
        this.held?.setHelmWorn(!!this.worn?.worn().helm);
        this.ownMaterials();
      });
    }
  }

  /** The equipped relic in the hand, exactly as the dungeon shows it. */
  private hold(itemId: string): void {
    if (!this.held || this.held.itemId === itemId) return;
    const model = this.source.itemModel(itemId);
    if (model && this.held.replace(model)) { this.ownMaterials(); this.held.setHelmWorn(!!this.worn?.worn().helm); }
  }

  /** Mounted gear shares the world's materials; give the doll its own copies without the world's envMap. */
  private ownMaterials(): void {
    this.hero?.traverse(node => {
      if (!(node instanceof THREE.Mesh) || node.userData.dollMaterial) return;
      const clone = (material: THREE.Material) => {
        const copy = material.clone();
        if (copy instanceof THREE.MeshStandardMaterial) { copy.envMap = null; copy.envMapIntensity = 1; }
        this.owned.push(copy); return copy;
      };
      node.material = Array.isArray(node.material) ? node.material.map(clone) : clone(node.material);
      node.userData.dollMaterial = true;
    });
  }

  private resize(): void {
    if (!this.renderer || !this.host) return;
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Keep the whole hero in view whatever the cell's shape.
    this.camera.position.z = Math.max(5.4, 5.4 * .75 / Math.max(.2, this.camera.aspect));
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.mixer?.stopAllAction();
    this.worn?.clear(); this.held?.clear();
    this.hero?.traverse(node => { if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); });
    for (const material of this.owned) material.dispose();
    this.scene.environment?.dispose();
    if (this.renderer) {
      this.renderer.domElement.remove();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
  }
}
