import {
  Scene, PerspectiveCamera, WebGLRenderer, ACESFilmicToneMapping, SRGBColorSpace,
  FogExp2, Group, Box3, Vector2, Vector3, Clock,
  DirectionalLight, PointLight, HemisphereLight,
  IcosahedronGeometry, OctahedronGeometry, ConeGeometry, CylinderGeometry, PlaneGeometry, RingGeometry,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial, Mesh, Color,
  PMREMGenerator, TextureLoader, AdditiveBlending, DoubleSide,
  Points, BufferGeometry, Float32BufferAttribute, PointsMaterial,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { type Material } from 'three';
import type { Problem, Branches, Reward, Durability, DailyRecordEvent, ShopState } from '@institute/shared';
import { Hud, prefersReducedMotion } from './hud';
import { rememberPresented, unpresentedEvents } from './dailyStats';
import { PROFILE } from './config';
import { PICKAXE_SKINS, isSkinKey, type SkinKey } from './skins';
import {
  buildGemStyle,
  GENERATED_GEM_STYLE_KEYS,
  GEM_STYLES,
  isGemStyleKey,
  type GemStyleKey,
} from './gemStyles';
import {
  fetchFirst, fetchBranches, fetchExplain, recordAttempt, creditRetrySolve, fetchState, buyShield,
  fetchShop, buyPickaxe, equipPickaxe, repairPickaxe, buyPadTheme, equipPadTheme, fetchWalkthrough, reportSkip, fetchDemo, buyGemStyle, equipGemStyle, creditHoardBonus, reportMiss, fetchMastery,
  redeemCrazyCoin, ackRecordEvent,
} from './tutor';
import { speak, sfxChink, sfxMine, sfxFizzle, sfxCollect, sfxFanfare, startAmbience, preloadAudio } from './audio';

// Saturated jewel tones — vivid against the dark cavern (muddy mid-tones removed).
const GEM_PALETTE = [0x2ee6a0, 0x4d8cff, 0xff4d7e, 0xffd23b, 0xb15cff, 0x32e0e0, 0xff7eb6];

// Record celebrations already shown on this device, by event id. Losing this
// list (cleared storage, a different browser) at worst replays a party that the
// server has not been told about yet — the trade we chose over losing it.
const RECORD_EVENTS_KEY = 'institute:record-events:' + PROFILE;
function loadPresentedRecordIds(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(RECORD_EVENTS_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
function savePresentedRecordIds(ids: string[]): void {
  try { localStorage.setItem(RECORD_EVENTS_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
}

export class Game {
  private renderer: WebGLRenderer;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private clock = new Clock();
  private raf = 0;
  private hud: Hud;

  // gameplay state
  private problem: Problem | null = null;
  private branchesPromise: Promise<Branches | null> | null = null;
  private entered = '';
  private firstAttempt: boolean | null = null;
  private mined = false;
  private wrongCount = 0;          // wrong tries on the current problem (drives escalating help)
  private shownAt = 0;
  private busy = false;

  // reward state (authoritative; seeded from /state, updated by /tutor/attempt)
  private totalGems = 0;        // mirror of the server gem total (offline fallback only)
  private pendingReward: Reward | null = null; // applied to the HUD when the prize gem lands
  private awaitingReward = false;              // a correct attempt's reward is still in flight
  // Record celebrations already shown on this device. The server re-offers an
  // event until it is acknowledged (so a lost response or a reload still gets
  // the party); this list is what turns that at-least-once delivery into a
  // single visible celebration.
  private presentedRecordIds: string[] = loadPresentedRecordIds();

  // scene objects
  private hero!: Group;            // the geode being mined
  private equippedGemStyle: GemStyleKey = 'gem_classic';
  private classicGeodeModel: Group | null = null;
  private gemStyleModels = new Map<GemStyleKey, Group>();
  private gemLight!: PointLight;
  private dust!: Points;
  private cracks = 0;              // how chipped the geode is this round (drives the inner glow)
  private gemShardGeo: BufferGeometry | null = null; // faceted gem geometry for the burst
  private procClusters: Group[] = []; // placeholder crystal clusters; removed when GLBs load
  private bursts: { mesh: Mesh; vel: Vector3; life: number; maxLife: number; size: number; spin: Vector3 }[] = [];
  private flyers: { mesh: Mesh; t: number; from: Vector3; to: Vector3 }[] = [];
  private sparkles: { mesh: Mesh; life: number }[] = [];
  private rings: { mesh: Mesh; life: number; maxLife: number; grow: number; op0: number }[] = [];
  private pickaxe!: Group;        // pivot at the grip — rotated to swing the head in a wide arc
  private pickHolder!: Group;     // holds the model, offset so the head extends away from the grip
  private pickModel: Group | null = null;
  private pickaxeSwing = 0;       // 1 → 0 over a swing
  private onSwingImpact: (() => void) | null = null;
  private swingImpactDone = true;
  // pickaxe skin: which tier is equipped + the material we swapped in (so we can
  // restore the GLB's baked material for `wooden`, and animate `legendary`'s hue).
  private equippedSkin: SkinKey = 'wooden';
  private skinMats = new Map<Mesh, Material>(); // each part's baked original material
  private pickHeadMeshes: Mesh[] = []; // the metal head parts (blades+collar+knob); handle excluded
  private legendaryMat: MeshPhysicalMaterial | null = null;  // animated when legendary is equipped
  private pickHeadMat: MeshStandardMaterial | null = null;   // shared head material (for wear); null for wooden
  private pickDurability: Durability | null = null;          // last-known equipped durability
  private poseFrozen = false;     // tuning: when set, the swing/idle tick won't drive rotation
  // Pickaxe rig params (live-tunable via setPickRig for the rigging subagent).
  // FIRST-PERSON rig: the player holds the pick in the lower foreground (grip near
  // the camera) and swings it AWAY into the scene. The swing PITCHES about X (Y–Z
  // plane), so the head arcs from up/back-over-the-shoulder forward+down onto the
  // gem — depth, not a screen-plane windmill.
  // Diagonal swing axis: the head arcs down-AND-inward (right→center), not a flat pitch.
  private pickSwingAxisVec = new Vector3(1, 0, -0.8).normalize();
  private pickPivot = new Vector3(1.4, -1.05, 3.3);   // grip held out to the RIGHT, lower foreground
  private pickCock = 0.35;        // idle: head raised high & back over the shoulder
  private pickSlam = -1.5;        // slam: head chops down-inward, tip-first, onto the geode at (0,0.75,0)
  // Yaw (the 1.4) turns the head so a POINTY pick tip leads the strike — the GLB's
  // tips run along ±X by default, which buried the flat side into the gem.
  private pickModelRot = new Vector3(0.15, 1.4, 0);
  private pickModelOffset = new Vector3(0, 1.8, 0); // push the head out along the arm, away from the grip
  private pickScale = 3.0;
  private pickSwingRate = 3.0;
  private winT = -1;      // ≥0 = mid charge-up before the gem bursts
  private gemHit = 0;     // recoil impulse when a number-gem is struck
  private shake = 0;      // camera punch
  private camBase = new Vector3(0, 1.1, 7.6);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = SRGBColorSpace;

    // Image-based lighting so every PBR/transmission surface gets real reflections.
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.fog = new FogExp2(0x241a3d, 0.05);

    this.camera = new PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 1.1, 7.6);
    this.camera.lookAt(0, 1.05, 0);

    this.buildScene();
    this.setupPost();
    void this.loadAssets();

    this.hud = new Hud({
      onDigit: (d) => this.onDigit(d),
      onBackspace: () => this.onBackspace(),
      onMine: () => this.onMine(),
      onReplay: () => this.problem && speak(this.problem.spoken),
      onExplain: () => void this.onExplain(),
      onNotSure: () => void this.onNotSure(),
      onBuyShield: () => void this.onBuyShield(),
      onToggleQuests: () => this.hud.toggleQuests(),
      onToggleShop: () => { if (this.hud.toggleShop()) this.onShopOpened(); },
      onBuyPadTheme: (key) => void this.onBuyPadTheme(key),
      onEquipPadTheme: (key) => void this.onEquipPadTheme(key),
      onBuyGemStyle: (key) => void this.onBuyGemStyle(key),
      onEquipGemStyle: (key) => void this.onEquipGemStyle(key),
      onBuyPickaxe: (key) => void this.onBuyPickaxe(key),
      onEquipPickaxe: (key) => void this.onEquipPickaxe(key),
      onRepairPickaxe: (key) => void this.onRepairPickaxe(key),
      onRedeemCrazyCoin: () => void this.onRedeemCrazyCoin(),
      onHoardFull: () => void this.onHoardFull(),
      onOpenParent: () => void this.onOpenParent(),
      onOpenStats: () => void this.onOpenStats(),
    });

    this.onResize();
    window.addEventListener('resize', this.onResize);
  }

  // ---- scene -----------------------------------------------------------------
  private buildScene(): void {
    // Painted cavern backdrop for depth (replaced/augmented by 3D props in front).
    const tex = new TextureLoader().load('/assets/textures/cavern-bg.jpg', (t) => { t.colorSpace = SRGBColorSpace; });
    const backdrop = new Mesh(
      new PlaneGeometry(52, 26),
      new MeshBasicMaterial({ map: tex, fog: true, toneMapped: true }),
    );
    backdrop.position.set(0, 1.5, -11);
    this.scene.add(backdrop);

    // Lighting rig: hemisphere base + warm key + cool rim + a practical lantern.
    this.scene.add(new HemisphereLight(0x9a8cff, 0x140e26, 0.55));
    const key = new DirectionalLight(0xffe2b8, 1.25);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    const rim = new DirectionalLight(0x6f9bff, 0.7);
    rim.position.set(-5, 2, -3);
    this.scene.add(rim);
    const lantern = new PointLight(0xffb86b, 14, 16, 2);
    lantern.position.set(-3.2, -1.4, 2.2);
    this.scene.add(lantern);


    // Ledges + embedded crystal clusters (procedural; GLBs swap in via loadAssets).
    this.addCrystalCluster(-3.7, -0.9, 0.4, 0.9, 0x7ad0ff);
    this.addCrystalCluster(3.8, -1.1, 0.2, 1.0, 0xb78cff);
    this.addCrystalCluster(-4.5, 1.7, -0.6, 0.7, 0xff9ecb);
    this.addCrystalCluster(4.6, 1.4, -0.6, 0.7, 0x8affc8);

    // Hero gem (the prize being mined).
    this.hero = new Group();
    this.hero.position.set(0, HERO_Y, 0);
    const classicFallback = buildGemStyle('gem_classic');
    this.gemStyleModels.set('gem_classic', classicFallback);
    this.hero.add(classicFallback); // authored fallback until the GLB swaps in
    this.scene.add(this.hero);
    this.gemLight = new PointLight(0xcaa6ff, 2, 14, 2); // inner-crystal glow
    this.gemLight.position.set(0, HERO_Y, 1.0);
    this.scene.add(this.gemLight);

    // Pickaxe rig: a pivot at the grip, a holder that pushes the head out along
    // the arm, and the model inside. Rotating the pivot swings the head wide.
    this.pickaxe = new Group();
    this.pickaxe.position.copy(this.pickPivot);
    this.pickHolder = new Group();
    this.pickaxe.add(this.pickHolder);
    this.pickHolder.add(this.makePickaxe()); // procedural fallback; GLB swaps in via loadAssets
    this.setSwingRotation(this.pickCock);    // idle: reared back over the shoulder
    this.scene.add(this.pickaxe);

    this.dust = this.makeDust();
    this.scene.add(this.dust);
  }

  private setupPost(): void {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom only on bright emissive (gems, crystals, lantern) — high threshold.
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.12, 0.4, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Swap procedural placeholders for generated GLBs when they're present. */
  private async loadAssets(): Promise<void> {
    // The Dragonheart ships meshopt-compressed (3 MB instead of 55 MB); without the
    // decoder that GLB fails to parse and the gem silently falls back to primitives.
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const tryLoad = (url: string) => new Promise<Group | null>((res) => {
      loader.load(url, (g) => res(g.scene), undefined, () => res(null));
    });

    const pick = await tryLoad('/assets/models/pickaxe-seg.glb');
    if (pick) {
      this.pickModel = pick;
      this.pickHolder.clear();
      this.pickHolder.add(pick);
      // Tripo mesh-segmentation gives us REAL separate meshes: one wooden handle plus
      // four metal head pieces (two blades, collar, top knob). We classify by geometry
      // — the handle is the only part that reaches the bottom of the tool — so the head
      // pieces re-skin per tier while the handle always keeps its baked wood. No more
      // fighting to split a fused mesh.
      this.skinMats.clear();
      this.pickHeadMeshes.length = 0;
      pick.updateMatrixWorld(true);
      const meshes: Mesh[] = [];
      pick.traverse((o) => {
        const m = o as Mesh;
        if ((m as unknown as { isMesh?: boolean }).isMesh && m.geometry && m.material && !Array.isArray(m.material)) meshes.push(m);
      });
      let handle: Mesh | null = null, lowest = Infinity;
      for (const m of meshes) { const minY = new Box3().setFromObject(m).min.y; if (minY < lowest) { lowest = minY; handle = m; } }
      for (const m of meshes) {
        this.skinMats.set(m, m.material as Material);
        if (m !== handle) this.pickHeadMeshes.push(m);
      }
      this.applyPickRig();
      this.applyPickaxeSkin(this.equippedSkin); // reflect whatever was equipped before the GLB landed
    }

    const cluster = await tryLoad('/assets/models/crystal-cluster.glb');
    if (cluster) {
      // Real swap: drop the procedural placeholders so nothing clips through the GLBs.
      for (const g of this.procClusters) this.scene.remove(g);
      this.procClusters.length = 0;
      const spots: [number, number, number, number][] = [
        [-3.7, -1.0, 0.4, 1.5], [3.8, -1.2, 0.2, 1.7], [-4.6, 1.6, -0.6, 1.1], [4.6, 1.3, -0.6, 1.1],
      ];
      for (const [x, y, z, s] of spots) {
        const c = cluster.clone(true);
        fitObject(c, s);
        c.position.set(x, y, z);
        c.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(c);
      }
    }

    const geode = await tryLoad('/assets/models/geode.glb');
    if (geode) {
      // Decorative geodes scattered on the floor.
      const spots: [number, number, number, number][] = [[-2.7, -1.8, 1.3, 1.3], [2.9, -1.9, 0.9, 1.5]];
      for (const [x, y, z, s] of spots) {
        const c = geode.clone(true);
        fitObject(c, s);
        c.position.set(x, y, z);
        c.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(c);
      }
      // Keep one normalized classic clone; applyGemStyle owns the live target so
      // an equipped procedural model is never overwritten by a late GLB load.
      this.classicGeodeModel = geode.clone(true);
      fitObject(this.classicGeodeModel, 2.0);
      this.classicGeodeModel.rotation.set(HERO_ROT.x, HERO_ROT.y, HERO_ROT.z);
      this.gemStyleModels.set('gem_classic', this.classicGeodeModel);
      this.applyGemStyle(this.equippedGemStyle);
    }

    // The familiar emerald/ruby/diamond targets use generated PBR hero assets.
    // Their authored procedural models remain instant fallbacks while these load.
    const generatedGems = await Promise.all(GENERATED_GEM_STYLE_KEYS.map(async (key) => {
      const url = GEM_STYLES[key].modelUrl;
      return [key, url ? await tryLoad(url) : null] as const;
    }));
    for (const [key, gem] of generatedGems) {
      if (!gem) continue;
      gem.name = `${GEM_STYLES[key].name.replace(/\s/g, '')}GeneratedModel`;
      fitObject(gem, 2.05);
      gem.rotation.y = GEM_STYLES[key].modelRotationY ?? 0;
      gem.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          const pbr = material as MeshStandardMaterial;
          pbr.envMapIntensity = Math.max(pbr.envMapIntensity ?? 1, 1.65);
          pbr.needsUpdate = true;
        }
      });
      this.gemStyleModels.set(key, gem);
    }
    this.applyGemStyle(this.equippedGemStyle);

    // Faceted gem geometry for the crack-open burst (the geode's payload).
    const gemGlb = await tryLoad('/assets/models/hero-gem.glb');
    if (gemGlb) this.gemShardGeo = extractGeometry(gemGlb, 1.0);
  }

  /** A faceted gem shard (the geode's payload) for the burst + prize. */
  private makeGemShard(color: number, size: number): Mesh {
    const geo = this.gemShardGeo ?? new ConeGeometry(0.16, 0.7, 6);
    const m = new Mesh(geo, new MeshPhysicalMaterial({
      color, emissive: color, emissiveIntensity: 0.3, metalness: 0, roughness: 0.06,
      transmission: 0.4, ior: 1.95, thickness: 0.4, clearcoat: 1, flatShading: true, envMapIntensity: 1.1,
    }));
    m.scale.setScalar(size);
    return m;
  }

  private addCrystalCluster(x: number, y: number, z: number, scale: number, color: number): void {
    const g = new Group();
    const baseMat = new MeshStandardMaterial({ color: 0x35304e, roughness: 1, flatShading: true });
    const base = new Mesh(new IcosahedronGeometry(0.5, 0), baseMat);
    base.scale.set(1, 0.5, 1);
    g.add(base);
    const mat = new MeshPhysicalMaterial({
      color, emissive: color, emissiveIntensity: 0.45, metalness: 0, roughness: 0.08,
      transmission: 0.7, ior: 1.9, thickness: 0.8, clearcoat: 1, flatShading: true, envMapIntensity: 1.2,
    });
    for (let i = 0; i < 5; i++) {
      const h = 0.5 + Math.random() * 0.8;
      const shard = new Mesh(new ConeGeometry(0.12 + Math.random() * 0.08, h, 6), mat);
      shard.position.set((Math.random() - 0.5) * 0.6, h * 0.4, (Math.random() - 0.5) * 0.5);
      shard.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
      g.add(shard);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    this.procClusters.push(g);
    this.scene.add(g);
  }

  /** Swap the mine target while preserving the hero transform and win animation. */
  private applyGemStyle(key: string): GemStyleKey {
    const styleKey = isGemStyleKey(key) ? key : 'gem_classic';
    this.equippedGemStyle = styleKey;
    let model = this.gemStyleModels.get(styleKey);
    if (!model) {
      model = buildGemStyle(styleKey);
      fitObject(model, 2.05);
      this.gemStyleModels.set(styleKey, model);
    }
    this.hero.clear();
    this.hero.add(model);
    this.hero.userData.gemStyle = styleKey;
    this.hero.visible = true;
    if (this.gemLight) {
      this.gemLight.color.set(GEM_STYLES[styleKey].tint);
      this.gemLight.intensity = styleKey === 'gem_diamond' ? 3.2 : 2.4;
    }
    return styleKey;
  }


  private makePickaxe(): Group {
    // Grip at origin, shaft up +Y, curved double-pick head at the top — known
    // orientation so the pivot swings the head in a wide, readable arc.
    const g = new Group();
    const wood = new MeshStandardMaterial({ color: 0x9c6b3a, roughness: 0.6, flatShading: true });
    const metal = new MeshStandardMaterial({ color: 0xc2c8d2, roughness: 0.28, metalness: 0.85, flatShading: true });
    const handle = new Mesh(new CylinderGeometry(0.08, 0.1, 2.0, 12), wood);
    handle.position.y = 1.0;
    const knob = new Mesh(new CylinderGeometry(0.13, 0.1, 0.2, 12), wood);
    knob.position.y = 0.05;
    const collar = new Mesh(new CylinderGeometry(0.15, 0.15, 0.36, 12), metal);
    collar.position.y = 2.0;
    g.add(handle, knob, collar);
    for (const dir of [-1, 1]) {
      const arm = new Mesh(new ConeGeometry(0.14, 1.0, 6), metal);
      arm.position.set(dir * 0.45, 2.05, 0);
      arm.rotation.z = dir * 1.3; // sweep the picks outward and slightly up
      g.add(arm);
    }
    return g;
  }

  /** Re-seat the pivot + loaded model from the current rig params (idempotent). */
  /** Drive the swing on the configured axis (x = depth pitch, z = legacy screen-plane). */
  private setSwingRotation(angle: number): void {
    // Rotate the grip about a tunable axis so the head can arc diagonally
    // (held out to the right, swinging down-and-inward toward the gem).
    this.pickaxe.quaternion.setFromAxisAngle(this.pickSwingAxisVec, angle);
  }

  private applyPickRig(): void {
    this.pickaxe.position.copy(this.pickPivot);
    if (!this.poseFrozen) this.setSwingRotation(this.pickCock);
    const m = this.pickModel;
    if (m) {
      // Center + scale in the model's OWN local frame (detached) so the pivot's
      // world translation can't bleed into the recenter offset, then orient+offset.
      this.pickHolder.remove(m);
      m.scale.set(1, 1, 1); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
      fitObject(m, this.pickScale);                 // center + scale (sets position)
      m.rotation.set(this.pickModelRot.x, this.pickModelRot.y, this.pickModelRot.z);
      m.position.add(this.pickModelOffset);          // push grip→pivot, head outward
      this.pickHolder.add(m);
    }
  }

  /** Re-skin the pickaxe to a tier: swap the head/handle material(s). `wooden`
   *  restores the GLB's baked material; every other tier builds a fresh authored
   *  MeshStandard/Physical material. Safe to call before the GLB loads (state is
   *  remembered and re-applied in loadAssets). */
  applyPickaxeSkin(key: string): { ok: boolean; key: SkinKey } {
    const skinKey = (isSkinKey(key) ? key : 'wooden') as SkinKey;
    this.equippedSkin = skinKey;
    this.legendaryMat = null;
    if (!this.pickModel || !this.pickHeadMeshes.length) return { ok: false, key: skinKey }; // GLB not loaded yet
    const spec = PICKAXE_SKINS[skinKey];
    if (!spec.make) {
      // `wooden` ⇒ restore each head piece's own baked steel material. No wear.
      for (const m of this.pickHeadMeshes) m.material = this.skinMats.get(m) as Material;
      this.pickHeadMat = null;
    } else {
      // One shared tier material across all head pieces (so `legendary` animates as a
      // single coherent surface, and the head reads as one forged unit).
      const headMat = spec.make(this.skinMats.get(this.pickHeadMeshes[0]) as MeshStandardMaterial) as MeshStandardMaterial;
      // Snapshot the pristine look so wear can lerp toward battered/grimy from it.
      const phys = headMat as MeshStandardMaterial & { envMapIntensity?: number };
      headMat.userData.base = {
        roughness: headMat.roughness, metalness: headMat.metalness,
        envMapIntensity: phys.envMapIntensity ?? 1, color: headMat.color.clone(),
        emissiveIntensity: headMat.emissiveIntensity,
      };
      for (const m of this.pickHeadMeshes) m.material = headMat;
      this.pickHeadMat = headMat;
      if (spec.animated) this.legendaryMat = headMat as MeshPhysicalMaterial;
    }
    // Re-apply current wear to the freshly-built material (e.g. after re-equip).
    if (this.pickDurability && this.pickDurability.key === skinKey && this.pickDurability.current != null && this.pickDurability.max) {
      this.applyPickaxeWear(this.pickDurability.current / this.pickDurability.max);
    }
    return { ok: true, key: skinKey };
  }

  /** Dull the head material as the pickaxe wears (frac 1=pristine → 0=broken):
   *  rougher, less reflective, grimier, dimmer glow. Lerps from the pristine snapshot. */
  private applyPickaxeWear(frac: number): void {
    const m = this.pickHeadMat as (MeshStandardMaterial & { envMapIntensity?: number; userData: { base?: { roughness: number; metalness: number; envMapIntensity: number; color: Color; emissiveIntensity: number } } }) | null;
    const base = m?.userData.base;
    if (!m || !base) return;
    const worn = Math.max(0, Math.min(1, 1 - frac));
    // Convey wear as "dirtier + darker", NOT dead-matte — keep a real specular
    // highlight so the head still reads as shaped metal (no blobby flattening).
    const roughTarget = Math.max(base.roughness, 0.5); // never fully matte
    m.roughness = base.roughness + (roughTarget - base.roughness) * worn;
    m.metalness = base.metalness * (1 - 0.2 * worn);
    m.envMapIntensity = base.envMapIntensity * (1 - 0.4 * worn); // stays reflective
    m.emissiveIntensity = base.emissiveIntensity * (1 - 0.45 * worn);
    m.color.copy(base.color).lerp(GRIME, 0.4 * worn); // keep most of the tier color
  }

  /** Apply a durability update from the server: refresh the meter + wear; on a break
   *  shatter the tool and swap to the free wooden one (the skin stays owned). */
  private applyDurability(d: Durability | null | undefined): void {
    if (!d) return;
    this.pickDurability = d;
    if (d.broke) { this.onPickaxeBroke(d.key); return; }
    this.hud.setDurability(d.current, d.max);
    if (d.current != null && d.max) this.applyPickaxeWear(d.current / d.max);
  }

  /** The equipped pickaxe just wore out: dramatic shatter, then fall back to wooden. */
  private onPickaxeBroke(key: string): void {
    this.pickaxeShatter(key);
    this.pickDurability = null;
    this.applyPickaxeSkin('wooden');
    this.hud.setDurability(null, null);
    const name = key.charAt(0).toUpperCase() + key.slice(1) + ' Pickaxe';
    this.hud.breakBanner(name);
    void this.refreshShop(); // the broken tier now shows a Repair button
  }

  /** Burst the pickaxe into shards (in its tier color) at the tool's position. */
  private pickaxeShatter(key: string): void {
    const origin = new Vector3();
    (this.pickModel ?? this.pickaxe).getWorldPosition(origin);
    const tintCss = (PICKAXE_SKINS[key as SkinKey] ?? PICKAXE_SKINS.wooden).tint;
    const tint = parseInt(tintCss.slice(1), 16) || 0xc9c2b6;
    this.shake = Math.max(this.shake, 0.65);
    sfxFizzle();
    for (let i = 0; i < 34; i++) {
      const size = 0.16 + Math.random() * 0.26;
      const shard = this.makeGemShard(i % 3 === 0 ? 0xb8b0a2 : tint, size);
      shard.position.copy(origin).add(new Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
      this.scene.add(shard);
      const dir = new Vector3((Math.random() - 0.5) * 2, Math.random() * 1.6 + 0.1, (Math.random() - 0.3) * 2).normalize();
      const life = 1.0 + Math.random() * 0.8;
      this.bursts.push({
        mesh: shard, vel: dir.multiplyScalar(4 + Math.random() * 5), life, maxLife: life, size,
        spin: new Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
      });
    }
  }

  /** Repair an owned pickaxe: spend gems, refill durability, re-equip it fresh. */
  private async onRepairPickaxe(key: string): Promise<void> {
    startAmbience();
    const res = await repairPickaxe(key);
    if (!res) return;
    if (!res.ok) {
      this.hud.setGemsForShop(res.gems);
      this.hud.shopFeedback('Keep mining for repair gems!');
      return;
    }
    this.totalGems = res.gems;
    this.hud.rollCollectionTo(res.gems); // gems spent — roll down
    this.hud.setGemsForShop(res.gems);
    this.pickDurability = res.durability ?? null;
    this.applyPickaxeSkin(res.equipped); // repaired = re-equipped, fresh
    this.applyDurability(res.durability);
    void this.refreshShop();
    const spec = PICKAXE_SKINS[res.equipped as SkinKey] ?? PICKAXE_SKINS.wooden;
    const name = res.equipped.charAt(0).toUpperCase() + res.equipped.slice(1) + ' Pickaxe';
    this.hud.equipConfirm(name, spec.tint);
    sfxCollect();
    this.beautySwing();
  }

  /** Swing angle at phase p∈[0,1]: small wind-up, fast slam, ease back to cock. */
  private swingAngle(p: number): number {
    let d: number;
    if (p < 0.2) d = -0.14 * (p / 0.2);
    else if (p < 0.5) { const q = (p - 0.2) / 0.3; d = -0.14 + 1.14 * q * q; }
    else { const q = (p - 0.5) / 0.5; d = (1 - q) * (1 - q); }
    return this.pickCock + (this.pickSlam - this.pickCock) * d;
  }

  // ---- tuning hooks (window.__game) for the rigging subagent -----------------
  setPickRig(o: {
    pivot?: [number, number, number]; cock?: number; slam?: number;
    modelRot?: [number, number, number]; modelOffset?: [number, number, number];
    scale?: number; swingRate?: number; axisVec?: [number, number, number];
  }): { ok: true } {
    if (o.pivot) this.pickPivot.set(o.pivot[0], o.pivot[1], o.pivot[2]);
    if (o.cock !== undefined) this.pickCock = o.cock;
    if (o.slam !== undefined) this.pickSlam = o.slam;
    if (o.modelRot) this.pickModelRot.set(o.modelRot[0], o.modelRot[1], o.modelRot[2]);
    if (o.modelOffset) this.pickModelOffset.set(o.modelOffset[0], o.modelOffset[1], o.modelOffset[2]);
    if (o.scale !== undefined) this.pickScale = o.scale;
    if (o.swingRate !== undefined) this.pickSwingRate = o.swingRate;
    if (o.axisVec) this.pickSwingAxisVec.set(o.axisVec[0], o.axisVec[1], o.axisVec[2]).normalize();
    this.applyPickRig();
    return { ok: true };
  }
  getPickRig(): object {
    return {
      pivot: this.pickPivot.toArray(), cock: this.pickCock, slam: this.pickSlam,
      modelRot: this.pickModelRot.toArray(), modelOffset: this.pickModelOffset.toArray(),
      scale: this.pickScale, swingRate: this.pickSwingRate, axisVec: this.pickSwingAxisVec.toArray(),
      hasModel: !!this.pickModel,
    };
  }
  /** Freeze the pickaxe at swing phase p∈[0,1] for screenshots; pass null to release. */
  poseSwing(p: number | null): void {
    if (p === null) { this.poseFrozen = false; this.setSwingRotation(this.pickCock); return; }
    this.poseFrozen = true;
    this.setSwingRotation(this.swingAngle(Math.max(0, Math.min(1, p))));
  }
  /** Live-tune the hero geode (position + child orientation) for the "open face" rotation. */
  setHero(o: { posY?: number; rotX?: number; rotY?: number; rotZ?: number }): { posY: number; rot: number[] } {
    if (o.posY !== undefined) this.hero.position.y = o.posY;
    const c = this.hero.children[0];
    if (c) {
      if (o.rotX !== undefined) c.rotation.x = o.rotX;
      if (o.rotY !== undefined) c.rotation.y = o.rotY;
      if (o.rotZ !== undefined) c.rotation.z = o.rotZ;
    }
    return { posY: this.hero.position.y, rot: c ? [c.rotation.x, c.rotation.y, c.rotation.z] : [] };
  }

  private makeDust(): Points {
    const n = 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 9;
      pos[i * 3 + 2] = -2 + Math.random() * 6;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    return new Points(geo, new PointsMaterial({
      color: 0xffe7b8, size: 0.05, transparent: true, opacity: 0.55,
      blending: AdditiveBlending, depthWrite: false,
    }));
  }

  // ---- lifecycle -------------------------------------------------------------
  start(): void {
    preloadAudio();
    this.tick();
    void this.begin();
  }

  private async begin(): Promise<void> {
    // Seed the HUD from the authoritative server state (gems, streak, shields, quests).
    void this.syncState(true);
    try {
      this.showProblem(await fetchFirst());
    } catch (e) {
      this.hud.setProblem('(offline)');
      console.error('failed to load first problem', e);
    }
  }

  /** Pull the persisted reward state and reflect it in the HUD. On the initial
   *  seed the gem counter snaps (no roll-up); later syncs leave the counter alone
   *  (it's driven by the attempt reward) and just refresh quests/streak/shields. */
  private async syncState(seed = false): Promise<void> {
    const st = await fetchState();
    if (!st) return;
    this.totalGems = st.gems;
    if (seed) this.hud.setCollection(st.gems);
    this.hud.setLifetimeGems(st.lifetimeGems);
    this.hud.setStreak(st.streak, false);
    this.hud.setShields(st.shields);
    this.hud.setGemsForShop(st.gems);
    this.hud.setQuests(st.quests, st.weeklyQuest);
    this.hud.setDailyRecord(st.daily ?? null);
    // Any record moment whose response never made it back (or that landed while
    // the tab was closed) is waiting here.
    if (st.daily) this.presentRecordEvents(st.daily.pendingEvents);
    if (seed && st.equipped) {
      this.pickDurability = st.durability ?? null;
      this.applyPickaxeSkin(st.equipped); // wear the saved skin on startup
      this.applyDurability(st.durability); // restore the durability meter + visible wear
      void this.refreshShop();            // seed the shop panel catalog
    }
    if (seed) this.applyGemStyle(st.equippedGemStyle ?? 'gem_classic');
  }

  /** Pull the shop catalog and seed the panel (balance + per-tier owned/equipped). */
  private lastShop: ShopState | null = null;
  private async refreshShop(): Promise<void> {
    const shop = await fetchShop();
    if (shop) {
      this.lastShop = shop;
      this.hud.setShop(shop);
      this.hud.setPadTheme(shop.equippedPadTheme ?? 'pad_classic');
      this.applyGemStyle(shop.equippedGemStyle ?? 'gem_classic');
    }
  }

  /** The Socratic shop moment: when he opens the shop and is saving toward
   *  something, the tutor ASKS the gap question — the exact math he does
   *  spontaneously when he wants a pickaxe (450−200 → "I only need 250!").
   *  Ungraded, unrewarded, once per item per session, never nagging. */
  private socraticAsked = new Set<string>();
  private lastSocraticAt = -Infinity;
  /** The live Socratic question, so typing ITS answer never counts against the
   *  real problem (he WILL get excited and key it in). */
  private pendingSocratic: { answer: number; name: string; price: number } | null = null;
  private onShopOpened(): void {
    const shop = this.lastShop;
    if (!shop || performance.now() - this.lastSocraticAt < 60_000) return;
    const gems = this.totalGems;
    const goals = [
      ...shop.items.filter((i) => !i.owned).map((i) => ({ key: i.key, name: i.name, price: i.price })),
      ...(shop.padThemes ?? []).filter((t) => !t.owned).map((t) => ({ key: t.key, name: t.name, price: t.price })),
      ...(shop.gemStyles ?? []).filter((style) => !style.owned)
        .map((style) => ({ key: style.key, name: style.name, price: style.price })),
    ].sort((a, b) => a.price - b.price);
    const goal = goals.find((g) => g.price > gems && !this.socraticAsked.has(g.key));
    if (!goal || gems <= 0 || goal.price - gems > 999) return;
    this.socraticAsked.add(goal.key);
    this.lastSocraticAt = performance.now();
    this.pendingSocratic = { answer: goal.price - gems, name: goal.name, price: goal.price };
    const line = `Ooh, the ${goal.name} costs ${goal.price} gems, and you have ${gems}. How many more do you need?`;
    this.hud.showHint(line);
    void speak(line);
  }

  /** Buy a pad theme: debit, apply the new gem tints, small celebration. */
  private async onBuyPadTheme(key: string): Promise<void> {
    startAmbience();
    const res = await buyPadTheme(key);
    if (!res) return;
    if (res.ok) {
      this.totalGems = res.gems ?? this.totalGems;
      this.hud.rollCollectionTo(this.totalGems);
      this.hud.setGemsForShop(this.totalGems);
      this.hud.setPadTheme(res.equippedPadTheme ?? key);
      void this.refreshShop();
      sfxFanfare(false);
      this.hud.equipConfirm(res.item?.name ?? 'New pad style', '#ffd23b');
    } else {
      this.hud.shopFeedback('Keep mining, almost there!');
    }
  }

  private async onEquipPadTheme(key: string): Promise<void> {
    startAmbience();
    const res = await equipPadTheme(key);
    if (!res || !res.ok) return;
    this.hud.setPadTheme(res.equippedPadTheme ?? key);
    void this.refreshShop();
    sfxCollect();
  }

  /** Buy a mine-target model, swap it into the cavern, and show it off immediately. */
  private async onBuyGemStyle(key: string): Promise<void> {
    startAmbience();
    const res = await buyGemStyle(key);
    if (!res) return;
    if (!res.ok) {
      this.hud.shopFeedback('Keep mining, almost there!');
      return;
    }
    this.totalGems = res.gems ?? this.totalGems;
    this.hud.rollCollectionTo(this.totalGems);
    this.hud.setGemsForShop(this.totalGems);
    const equipped = this.applyGemStyle(res.equippedGemStyle ?? key);
    void this.refreshShop();
    this.showOffGem(res.item?.name ?? GEM_STYLES[equipped].name, equipped, true);
  }

  /** Equip an owned model without spending again. */
  private async onEquipGemStyle(key: string): Promise<void> {
    startAmbience();
    const res = await equipGemStyle(key);
    if (!res?.ok) return;
    const equipped = this.applyGemStyle(res.equippedGemStyle ?? key);
    void this.refreshShop();
    this.showOffGem(GEM_STYLES[equipped].name, equipped, false);
  }

  private showOffGem(name: string, key: GemStyleKey, unlocked: boolean): void {
    const spec = GEM_STYLES[key];
    this.shake = Math.max(this.shake, unlocked ? 0.58 : 0.28);
    for (let i = 0; i < (unlocked ? 18 : 8); i += 1) this.spawnSparkle();
    this.hud.equipConfirm(name, spec.tint);
    sfxFanfare(unlocked);
  }

  /** Buy a pickaxe skin: debit (server-authoritative), auto-equip + apply the skin,
   *  refresh the panel, and fire the over-the-top unlock celebration. */
  private async onBuyPickaxe(key: string): Promise<void> {
    startAmbience();
    const res = await buyPickaxe(key);
    if (!res) return;
    if (res.ok) {
      this.totalGems = res.gems;
      this.hud.rollCollectionTo(res.gems);   // gems spent — roll the counter down
      this.hud.setGemsForShop(res.gems);
      this.pickDurability = res.durability ?? null;
      this.applyPickaxeSkin(res.equipped);
      this.applyDurability(res.durability);  // fresh + full durability meter
      void this.refreshShop();               // re-render rows (now owned + equipped)
      this.unlockCelebration(res.item.name, res.item.key);
    } else {
      this.hud.setGemsForShop(res.gems);
      this.hud.shopFeedback(`Need ${'?'} 💎, keep mining!`);
    }
  }

  /** Equip an already-owned skin: swap + a small confirm. */
  private async onEquipPickaxe(key: string): Promise<void> {
    startAmbience();
    const res = await equipPickaxe(key);
    if (!res || !res.ok) return;
    this.pickDurability = res.durability ?? null;
    this.applyPickaxeSkin(res.equipped);
    this.applyDurability(res.durability);
    void this.refreshShop();
    sfxCollect();
    const spec = PICKAXE_SKINS[res.equipped as SkinKey] ?? PICKAXE_SKINS.wooden;
    const name = res.equipped.charAt(0).toUpperCase() + res.equipped.slice(1) + ' Pickaxe';
    this.hud.equipConfirm(name, spec.tint);
    this.beautySwing();
  }

  /** The full unlock juice: banner + confetti + flash + fanfare + camera punch +
   *  a beauty swing showing off the new pickaxe. */
  private unlockCelebration(name: string, key: string): void {
    const spec = PICKAXE_SKINS[key as SkinKey] ?? PICKAXE_SKINS.wooden;
    this.shake = Math.max(this.shake, 0.7);
    this.celebrationBurst(8);
    this.hud.celebrateUnlock(name, spec.tint);
    sfxFanfare(true);
    this.beautySwing();
  }

  /** A quick show-off swing of the equipped pickaxe (no gem chip; pure flourish). */
  private beautySwing(): void {
    if (this.busy) return; // don't fight an in-progress mining slam
    this.swing(() => { sfxChink(); this.spawnSparkle(); });
  }

  /** Parent redeems one coin from the dashboard (he cashed in his 15 minutes). */
  private async onRedeemCrazyCoin(): Promise<void> {
    const res = await redeemCrazyCoin();
    if (!res) return;
    this.hud.setParentCoins(res.crazyCoins);
  }

  private async onBuyShield(): Promise<void> {
    startAmbience();
    const res = await buyShield();
    if (!res) return;
    if (res.ok) {
      this.totalGems = res.gems;
      this.hud.setShields(res.shields);
      this.hud.setGemsForShop(res.gems);
      this.hud.rollCollectionTo(res.gems); // gems were spent — roll the counter down
      this.hud.shieldFeedback(true);
      sfxCollect();
    } else {
      this.hud.setGemsForShop(res.gems);
      this.hud.shieldFeedback(false, 'Need 40 💎 for a shield!');
    }
  }

  /** Open the parent dashboard: show the overlay immediately (loading state),
   *  then render the mastery graph — or a gentle notice if the tutor is away. */
  private async onOpenParent(): Promise<void> {
    this.hud.openParentDash();
    this.hud.setMastery(await fetchMastery());
  }

  /** Celebrate each record moment we have not shown yet, then tell the server it
   *  can stop offering them. Ids already shown are skipped, so the attempt
   *  response and the /state queue can both deliver the same event safely.
   *  Acknowledging even a skipped one is deliberate: it clears the queue. */
  private presentRecordEvents(events: DailyRecordEvent[]): void {
    for (const event of unpresentedEvents(events, this.presentedRecordIds)) {
      this.presentedRecordIds = rememberPresented(this.presentedRecordIds, event.id);
      savePresentedRecordIds(this.presentedRecordIds);
      this.celebrateDailyRecord(event.count);
    }
    for (const event of events) void ackRecordEvent(event.id);
  }

  /** The record party itself. Motion (camera punch + the 3D gem rain) is skipped
   *  entirely when he has asked his device for reduced motion; the banner and
   *  the spoken congratulation still happen, so the moment is never silent. */
  private celebrateDailyRecord(count: number): void {
    if (!prefersReducedMotion()) {
      this.shake = Math.max(this.shake, 0.6);
      this.celebrationBurst(Math.max(10, count));
    }
    this.hud.celebrateDailyRecord(count);
    sfxFanfare(true);
    void speak(`A new record! ${count} right today. That is your best day ever!`);
  }

  /** He tapped his record chip: open the stats panel on the numbers we already
   *  have (instant), then refresh it from the server. */
  private async onOpenStats(): Promise<void> {
    this.hud.openStats();
    const st = await fetchState();
    // setDailyRecord refreshes the chip AND re-renders the open panel.
    if (st?.daily) this.hud.setDailyRecord(st.daily);
    else this.hud.setStats(null); // nothing fresh — a notice only if nothing is shown yet
  }

  /** A topic he has never met never arrives as a cold graded question: he
   *  watches one worked example first, then presses the button himself.
   *  Guarded per TOPIC (not problem id) and BEFORE the await — a failed demo
   *  fetch writes no server row, so the next problem on this topic would
   *  otherwise be flagged again. */
  private demoedTopics = new Set<string>();
  private showProblem(p: Problem): void {
    if (p.newTopic && p.topicId && !this.demoedTopics.has(p.topicId)) {
      const topicId = p.topicId;
      this.demoedTopics.add(topicId);
      this.busy = true;
      this.problem = null;              // nothing is answerable during a demo
      this.hud.setProblem('…');
      this.hud.clearHint();
      void (async () => {
        const d = await fetchDemo(topicId);
        if (!d) { this.presentProblem(p); return; }   // never block play on a demo
        let timer: ReturnType<typeof setTimeout> | null = null;
        const go = () => {
          if (timer) { clearTimeout(timer); timer = null; }
          this.hud.hideDemo();
          this.presentProblem(p);       // NOW the problem starts: fresh timer, fresh clock
        };
        this.hud.showDemo({ kidLabel: d.kidLabel, prompt: d.example.prompt, answer: d.example.answer, script: d.script }, go);
        timer = setTimeout(go, 30_000); // never traps him
        void speak(d.script);
      })();
      return;
    }
    this.presentProblem(p);
  }

  /** Put the problem on screen and start its clock. Split out of showProblem so
   *  a demonstration can run first WITHOUT its narration preempting the
   *  read-aloud, inflating solveMs, or burning the 10s fair-try window. */
  private presentProblem(p: Problem): void {
    this.problem = p;
    this.pendingSocratic = null; // a new problem replaces the standing shop question
    if (this.helpTimer) { clearTimeout(this.helpTimer); this.helpTimer = null; }
    this.hud.hideHelpChoice();
    this.entered = '';
    this.firstAttempt = null;
    this.mined = false;
    this.wrongCount = 0;
    this.busy = false;
    this.shownAt = performance.now(); // provisional — rebased when the read-aloud ends
    this.hud.setProblem(p.prompt);
    this.hud.setAnswer('');
    this.hud.clearHint();
    // Solve time starts when the tutor FINISHES reading the problem: measuring
    // from display punished him for listening (speech ate ~2-3s of every
    // fluency bar). If he starts keying before the speech ends, he's clearly
    // already solving — keep the earlier clock.
    void speak(p.spoken).then(() => {
      if (this.problem?.id === p.id && this.firstAttempt === null && this.entered === '') {
        this.shownAt = performance.now();
      }
    });
    this.resetHero();
    this.branchesPromise = fetchBranches(p).catch(() => null);
  }

  private resetHero(): void {
    this.hero.scale.setScalar(1);
    this.hero.visible = true;
    this.hero.rotation.set(0, 0, 0); // no spin; the geode child holds the face-us orientation
    this.gemHit = 0;
    this.cracks = 0;
    this.gemLight.intensity = 2;
  }

  // ---- input -----------------------------------------------------------------
  private onDigit(d: number): void {
    if (this.mined || this.busy || this.entered.length >= 3) return;
    startAmbience(); // first user gesture unlocks audio
    this.entered += String(d);
    this.hud.setAnswer(this.entered);
    // The pickaxe swings down; the chink + chip fire when it *connects*.
    this.swing(() => { sfxChink(); this.gemHit = 1; this.cracks += 1; this.crackChip(); });
  }

  /** A strike lands: the geode glows hotter from within and sheds a few gem chips. */
  private crackChip(): void {
    this.shake = Math.max(this.shake, 0.1);
    for (let i = 0; i < 4; i++) {
      const size = 0.13 + Math.random() * 0.12; // small faceted gem chips
      const c = this.makeGemShard(GEM_PALETTE[Math.floor(Math.random() * GEM_PALETTE.length)], size);
      c.position.copy(this.hero.position).add(new Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.2) * 0.8, 0.4));
      this.scene.add(c);
      const dir = new Vector3((Math.random() - 0.5) * 2, Math.random() * 1.4 + 0.4, (Math.random() - 0.1) * 1.3).normalize();
      const life = 0.45 + Math.random() * 0.3;
      this.bursts.push({
        mesh: c, vel: dir.multiplyScalar(2 + Math.random() * 1.8), life, maxLife: life, size,
        spin: new Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
      });
    }
    this.spawnSparkle(); // a little twinkle on each hit
  }

  /** Start a pickaxe swing; `onImpact` fires at the bottom of the slam. */
  private swing(onImpact: () => void): void {
    this.pickaxeSwing = 1;
    this.onSwingImpact = onImpact;
    this.swingImpactDone = false;
  }
  private onBackspace(): void {
    if (this.mined || this.busy) return;
    this.entered = this.entered.slice(0, -1);
    this.hud.setAnswer(this.entered);
  }

  /** 🤔 "I'm not sure yet" — the escape hatch he asked for. Being stuck must
   *  never feel like a trap: the tutor works the whole problem (answer and all),
   *  he chooses when to move on, and it costs him NOTHING — no streak, no
   *  shield, no shame. The skip is recorded as honest data so the next problems
   *  get gentler on their own. */
  private notSureBusy = false;
  private helpTimer: ReturnType<typeof setTimeout> | null = null;
  private async onNotSure(): Promise<void> {
    if (!this.problem || this.notSureBusy || this.mined) return;
    this.notSureBusy = true;
    this.busy = true; // no keying while the walkthrough plays
    const btn = document.querySelector('.replay.not-sure');
    btn?.classList.add('busy');
    if (btn) btn.textContent = '💭';
    const p = this.problem;
    // Record BEFORE fetching: no race with the next problem, and the skip lands
    // even if the walkthrough call fails. Only when he never answered — a skip
    // after a wrong try would double-count the same problem.
    if (this.firstAttempt === null) void reportSkip(p);
    try {
      const text = (await fetchWalkthrough(p))
        ?? `That one is tricky! The answer is ${p.answer}.${p.hint ? ' ' + p.hint : ''}`;
      if (this.problem?.id !== p.id) return; // moved on already
      this.hud.setAnswer(String(p.answer));  // he SEES the answer, not just hears it
      this.hud.showHint(text);
      await speak(text);
      if (this.problem?.id !== p.id) return;
      // His call when to move on — agency is the whole point of this button.
      const go = () => {
        if (this.helpTimer) { clearTimeout(this.helpTimer); this.helpTimer = null; }
        void this.advance();
      };
      this.hud.showHelpChoice(go, () => void speak(text));
      this.helpTimer = setTimeout(() => { this.hud.hideHelpChoice(); go(); }, 25_000);
    } finally {
      btn?.classList.remove('busy');
      if (btn) btn.textContent = '🤔';
      this.notSureBusy = false;
    }
  }

  /** 🎓: the tutor explains the current problem's strategy aloud (never the
   *  answer). Guarded against double-taps; falls back to the local hint offline. */
  private explaining = false;
  private async onExplain(): Promise<void> {
    if (!this.problem || this.explaining) return;
    this.explaining = true;
    // Visible "I'm thinking" state: kids mash buttons that don't react instantly.
    // The icon becomes an animated thought bubble and taps are ignored until the
    // explanation has finished playing.
    const btn = document.querySelector('.replay.explain');
    btn?.classList.add('busy');
    if (btn) btn.textContent = '💭';
    try {
      const p = this.problem;
      const text = (await fetchExplain(p)) ?? p.hint ?? 'Read it again slowly. What is it asking?';
      if (this.problem?.id === p.id) {           // still the same problem
        this.hud.showHint(text);                 // always visible — even if audio fails
        await speak(text);
      }
    } finally {
      btn?.classList.remove('busy');
      if (btn) btn.textContent = '🎓';
      this.explaining = false;
    }
  }

  private onMine(): void {
    if (!this.problem || this.mined || this.busy || this.entered.length === 0) return;
    const val = parseInt(this.entered, 10);
    const correct = val === this.problem.answer;

    // He answered the SOCRATIC question, not the mine problem: celebrate it and
    // leave the real problem (and his streak/attempts) completely untouched.
    // The real problem's answer always takes precedence when they collide.
    if (!correct && this.pendingSocratic && val === this.pendingSocratic.answer) {
      const sq = this.pendingSocratic;
      this.pendingSocratic = null;
      this.entered = '';
      this.hud.setAnswer('');
      const line = `Exactly right, ${sq.answer} more gems and the ${sq.name} is yours!`;
      this.hud.showHint(line);
      void speak(line);
      sfxCollect();
      for (let i = 0; i < 10; i++) this.spawnSparkle();
      return;
    }

    // Only the FIRST attempt of each problem counts toward rewards. Capture the
    // authoritative reward delta and drive the HUD from it (server is the source
    // of truth for gems/streak/shields/quests/milestones).
    const isFirst = this.firstAttempt === null;
    if (isFirst) {
      this.firstAttempt = correct;
      if (correct) this.awaitingReward = true;
      const p = this.problem;
      void recordAttempt({
        problemId: p.id,
        skill: p.skill,
        topicId: p.topicId,
        correct,
        solveMs: Math.round(performance.now() - this.shownAt),
        difficulty: p.difficulty,
      }).then((reward) => this.onReward(reward, correct));
    } else if (correct) {
      // Solved on a retry — still earns a gem (no streak); flows through the same reward path.
      this.awaitingReward = true;
      void creditRetrySolve(this.problem.id).then((reward) => this.onReward(reward, true));
    }

    if (correct) {
      this.mined = true;
      this.busy = true;
      // Pickaxe slams down → on impact the gem charges up and bursts. Advance
      // when BOTH the animation and the praise line are done — never cut audio.
      this.swing(() => { sfxMine(); this.winT = 0; this.gemLight.intensity = 18; });
      // Cap the praise wait tightly: if TTS is having a slow day, keep the game
      // moving (the praise just overlaps the next problem, as before).
      const solveMs = performance.now() - this.shownAt;
      const praisePool =
        this.wrongCount > 0 ? PRAISE_RETRY :        // recovered after a miss — the growth moment
        solveMs < 4000 ? (Math.random() < 0.5 ? PRAISE_FAST : PRAISE) : // instant recall: automaticity praise (mixed, not every time)
        solveMs > 30_000 ? PRAISE_GRIT :             // a long grind — persistence praise
        PRAISE;
      void Promise.all([
        Promise.race([speak(pick(praisePool)), sleep(6_000)]),
        sleep(1450),
      ]).then(() => void this.advance());
    } else {
      this.wrongCount += 1;
      this.hud.flashWrong();
      this.swing(() => { sfxFizzle(); this.gemHit = 0.6; }); // strike lands but the geode holds
      const hint = this.problem.hint;
      if (this.wrongCount >= 3) {
        // Stuck: THIS is the counted miss. Warm growth framing — missing a tough
        // one is how the tutor learns what to teach — then reveal and move on.
        // Speech is SEQUENCED: reveal+strategy plays fully, then the shield/
        // trophy line, and only then does the next problem appear.
        this.busy = true;
        const ans = this.problem.answer;
        const reveal = speak(`${pick(WARM_MISS)} The answer is ${ans}.${hint ? ' ' + hint : ''} Let's try another one.`);
        this.hud.setAnswer(String(ans));
        this.hud.showHint(`The answer is ${ans}, tough ones teach me how to help you!`);
        const finale = reportMiss().then(async (r) => {
          const voice = this.onFinalMiss(r); // visuals now; returns the queued voice line
          await reveal;
          await voice();
        });
        void Promise.all([
          Promise.race([finale, sleep(30_000)]),
          sleep(3400),
        ]).then(() => void this.advance());
      } else if (this.wrongCount === 2 && hint) {
        // Second miss: teach a strategy, then let him try again.
        void speak(hint);
        this.hud.showHint(hint);
        this.entered = '';
        setTimeout(() => this.hud.setAnswer(''), 350);
      } else {
        // First miss (or no hint available): gentle nudge, try again.
        void speak(pick(NUDGE));
        this.entered = '';
        setTimeout(() => this.hud.setAnswer(''), 350);
      }
    }
  }

  private async advance(): Promise<void> {
    const b = this.branchesPromise ? await this.branchesPromise : null;
    const next = b ? (this.firstAttempt ? b.right : b.wrong) : await fetchFirst();
    this.showProblem(next);
  }

  /** Apply the authoritative reward from a first-try attempt. Correct rewards are
   *  deferred until the prize gem lands in the hoard (so the counter roll-up,
   *  streak flame, and celebrations all fire together with the gem arrival).
   *  Wrong rewards (streak reset / shield save) apply immediately on the miss. */
  private onReward(reward: Reward | null, correct: boolean): void {
    if (!reward) {
      // Offline/telemetry failure: fall back to a local +1 so the loop still feels alive.
      if (correct) { this.awaitingReward = false; this.totalGems += 1; this.pendingReward = null; }
      return;
    }
    this.totalGems = reward.totalGems;
    if (correct) {
      this.awaitingReward = false;
      this.pendingReward = reward; // applied in applyReward() when the gem lands
    } else {
      // A wrong FIRST try is penalty-free now (he has retries) — just keep the
      // HUD numbers synced. The counted miss happens in onFinalMiss().
      this.hud.setShields(reward.shields);
      this.hud.setGemsForShop(reward.totalGems);
      this.applyDurability(reward.durability);
    }
  }

  /** The problem moved on unsolved — the miss that actually counts. Shield saves
   *  the streak; otherwise it resets, and the best streak gets its trophy moment
   *  so what he BUILT is never lost, only the counter. */
  private onFinalMiss(reward: Reward | null): () => Promise<void> {
    if (!reward) return async () => {};
    this.totalGems = reward.totalGems;
    this.hud.setShields(reward.shields);
    this.hud.setGemsForShop(reward.totalGems);
    if (reward.shieldUsed) {
      this.hud.flashShieldSave();
      this.hud.celebrateShieldSave();
      return () => speak('Your shield saved your streak!');
    }
    this.hud.setStreak(reward.streak, false); // visibly resets to 0
    if ((reward.streakLost ?? 0) >= 10) {
      this.hud.celebrateBestStreak(reward.bestStreak);
      return () => speak(`Your best streak of ${reward.bestStreak} is yours forever! Let's start a new climb.`);
    }
    return async () => {};
  }

  /** Fired when the prize gem lands in the hoard: commit the deferred reward —
   *  roll the counter to the true total, grow the streak flame, fire the
   *  milestone + quest-complete celebrations, and refresh the quests panel. */
  private applyReward(): void {
    // The reward POST may still be in flight when the gem lands — wait briefly for it
    // so the counter/streak/celebrations use the authoritative numbers.
    if (this.awaitingReward && !this.pendingReward) {
      setTimeout(() => this.applyReward(), 60);
      return;
    }
    const r = this.pendingReward;
    this.pendingReward = null;
    if (!r) {
      // No server reward for this landed gem (a 2nd-try-correct the server didn't
      // credit, or offline) — keep the counter at the authoritative total. The gem
      // still landed as a hoard pip; the number just doesn't move.
      this.hud.rollCollectionTo(this.totalGems);
      return;
    }
    // The server total is authoritative — roll straight to it. Streak + completed-
    // quest bonuses are already baked into totalGems, so they make the counter leap.
    this.totalGems = r.totalGems;
    this.hud.rollCollectionTo(r.totalGems);
    this.hud.setLifetimeGems(r.lifetimeGems);
    this.hud.setStreak(r.streak, true);
    this.hud.setShields(r.shields);
    this.hud.setGemsForShop(r.totalGems);

    if (r.milestone != null) {
      this.shake = Math.max(this.shake, 0.5 + Math.min(0.6, r.milestone * 0.05)); // camera punch scales
      this.celebrationBurst(r.milestone);
      this.hud.celebrateMilestone(r.milestone);
      sfxFanfare(true);
    }
    for (const q of r.questsCompleted) {
      this.hud.celebrateQuest(q);
      sfxFanfare(false);
    }
    if (r.allDailiesCrazyCoin) {
      this.hud.celebrateDailyCrazyCoin();
      void speak('You finished every quest today, you earned a Crazy Coin! Go tell a grown-up!');
      sfxFanfare(true);
    }
    // Today's count, and the rarest moment in the game: a brand-new daily record.
    // The server fires newRecord on exactly the answer that beats an existing
    // record, so his first-ever correct answer is never dressed up as one. This
    // is the FAST path; the same event also sits in /state until acknowledged,
    // and both paths funnel through the same shown-once gate.
    if (r.daily) {
      this.hud.setDailyProgress(r.daily);
      if (r.daily.newRecord && r.daily.eventId) {
        this.presentRecordEvents([{
          id: r.daily.eventId, day: r.daily.day,
          count: r.daily.today, previousRecord: r.daily.previousRecord,
        }]);
      }
    }
    // Wear the pickaxe for this mined gem (may shatter → swap to wooden).
    this.applyDurability(r.durability);
    // Refresh quest progress bars from the server (cheap; reflects live deltas).
    void this.syncState(false);
  }

  /** The hoard meter filled: blast a firehose of 3D gems out of the bar, punch the
   *  camera, then credit the bonus server-side and leap the counter + shop balance. */
  private async onHoardFull(): Promise<void> {
    const pending = creditHoardBonus(); // credit FIRST — VFX must never block it
    try {
      this.hoardEruption();
      this.shake = Math.max(this.shake, 0.55); // camera punch
      sfxFanfare(true);
    } catch (e) { console.warn("[hoard] eruption fail:", e); }
    const reward = await pending;
    if (!reward) return;
    this.totalGems = reward.totalGems;
    this.hud.rollCollectionTo(reward.totalGems);
    this.hud.setLifetimeGems(reward.lifetimeGems);
    this.hud.setGemsForShop(reward.totalGems);
  }

  /** A FIREHOSE of gems erupting out of the hoard bar (top-left, COUNTER_WORLD).
   *  Staggered waves so it reads as a sustained jet/stream, then gravity (in
   *  updateVfx) arcs them down and they rain across the cavern. */
  private hoardEruption(): void {
    const origin = COUNTER_WORLD.clone();
    // Muzzle flash + shockwave ring right at the bar.
    const flash = new Mesh(
      new IcosahedronGeometry(0.4, 1),
      new MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false }),
    );
    flash.position.copy(origin);
    this.scene.add(flash);
    this.rings.push({ mesh: flash, life: 0.28, maxLife: 0.28, grow: 4.5, op0: 0.75 });
    const ring = new Mesh(
      new RingGeometry(0.3, 0.5, 48),
      new MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, blending: AdditiveBlending, side: DoubleSide, depthWrite: false }),
    );
    ring.position.copy(origin); ring.lookAt(this.camera.position);
    this.scene.add(ring);
    this.rings.push({ mesh: ring, life: 0.6, maxLife: 0.6, grow: 24, op0: 0.9 });

    // The jet sprays rightward and slightly up so the stream ARCS across the visible
    // cavern (origin is up at the bar; a steep-up jet would just exit the top).
    const jet = new Vector3(1.5, 0.5, 0.28).normalize();
    const WAVES = 22, PER_WAVE = 9;
    for (let w = 0; w < WAVES; w++) {
      setTimeout(() => {
        for (let i = 0; i < PER_WAVE; i++) {
          const big = Math.random() < 0.18;
          const size = (big ? 0.5 : 0.28) + Math.random() * 0.18;
          const shard = this.makeGemShard(GEM_PALETTE[Math.floor(Math.random() * GEM_PALETTE.length)], size);
          shard.position.copy(origin).add(new Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3));
          this.scene.add(shard);
          // Tight cone around the jet → a coherent stream, not a puff.
          const dir = jet.clone().add(new Vector3((Math.random() - 0.5) * 0.65, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6)).normalize();
          const speed = 6.5 + Math.random() * 4.5;
          const life = 1.7 + Math.random() * 1.1;
          this.bursts.push({
            mesh: shard, vel: dir.multiplyScalar(speed), life, maxLife: life, size,
            spin: new Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
          });
        }
      }, w * 40);
    }
  }

  /** Extra in-scene gem geyser for a streak milestone — scales with the milestone. */
  private celebrationBurst(milestone: number): void {
    const origin = COUNTER_WORLD.clone();
    const n = Math.min(60, 24 + milestone * 3);
    for (let i = 0; i < n; i++) {
      const size = 0.18 + Math.random() * 0.22;
      const shard = this.makeGemShard(GEM_PALETTE[Math.floor(Math.random() * GEM_PALETTE.length)], size);
      shard.position.set((Math.random() - 0.5) * 8, 5 + Math.random() * 2, (Math.random() - 0.5) * 3);
      this.scene.add(shard);
      const dir = new Vector3((Math.random() - 0.5) * 1.4, -0.2 - Math.random(), (Math.random() - 0.3) * 0.8).normalize();
      const life = 1.1 + Math.random() * 0.7;
      this.bursts.push({
        mesh: shard, vel: dir.multiplyScalar(2 + Math.random() * 3), life, maxLife: life, size,
        spin: new Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      });
    }
    // A bright shockwave ring centered on screen for the punch.
    const ring = new Mesh(
      new RingGeometry(0.3, 0.5, 48),
      new MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, blending: AdditiveBlending, side: DoubleSide, depthWrite: false }),
    );
    ring.position.set(0, 0.8, 1);
    ring.lookAt(this.camera.position);
    this.scene.add(ring);
    this.rings.push({ mesh: ring, life: 0.7, maxLife: 0.7, grow: 26, op0: 0.85 });
    for (let i = 0; i < 16; i++) this.spawnSparkle();
    void origin;
  }

  // ---- VFX -------------------------------------------------------------------
  /** Correct answer: the geode cracks open and ERUPTS into a treasure of gems. */
  private crackOpen(): void {
    const origin = this.hero.position.clone();
    const reward = GEM_PALETTE[Math.floor(Math.random() * GEM_PALETTE.length)];
    this.hero.visible = false;
    this.gemLight.intensity = 0;
    this.shake = 0.6; // camera punch

    // Bright core flash.
    const flash = new Mesh(
      new IcosahedronGeometry(0.5, 1),
      new MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
    );
    flash.position.copy(origin);
    this.scene.add(flash);
    this.rings.push({ mesh: flash, life: 0.3, maxLife: 0.3, grow: 6, op0: 0.85 });

    // Two shockwave rings — a fast white one and a slower colored one.
    for (const [col, life, grow, op] of [[0xffffff, 0.4, 22, 0.85], [reward, 0.6, 15, 0.8]] as const) {
      const ring = new Mesh(
        new RingGeometry(0.3, 0.5, 48),
        new MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: AdditiveBlending, side: DoubleSide, depthWrite: false }),
      );
      ring.position.copy(origin);
      ring.lookAt(this.camera.position);
      this.scene.add(ring);
      this.rings.push({ mesh: ring, life, maxLife: life, grow, op0: op });
    }

    // Radiating light-ray streaks for the "treasure!" pop.
    for (let i = 0; i < 9; i++) {
      const ray = new Mesh(
        new ConeGeometry(0.06, 1.0, 4),
        new MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false }),
      );
      ray.position.copy(origin);
      const dir = new Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.2) * 2, (Math.random() - 0.3) * 1.4).normalize();
      ray.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      this.scene.add(ray);
      this.bursts.push({ mesh: ray, vel: dir.clone().multiplyScalar(7 + Math.random() * 4), life: 0.32, maxLife: 0.32, size: 1, spin: new Vector3(0, 0, 0) });
    }

    // Gem eruption — faceted gems in vivid colors, tumbling and catching the light.
    for (let i = 0; i < 42; i++) {
      const big = i < 6;
      const size = (big ? 0.5 : 0.22) + Math.random() * 0.18;
      const shard = this.makeGemShard(GEM_PALETTE[Math.floor(Math.random() * GEM_PALETTE.length)], size);
      shard.position.copy(origin).add(new Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0));
      this.scene.add(shard);
      const dir = new Vector3((Math.random() - 0.5) * 2.2, Math.random() * 1.9 + 0.2, (Math.random() - 0.15) * 2.2).normalize();
      const life = 0.9 + Math.random() * 0.6;
      this.bursts.push({
        mesh: shard, vel: dir.multiplyScalar((big ? 4 : 6) + Math.random() * 5), life, maxLife: life, size,
        spin: new Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16),
      });
    }
    for (let i = 0; i < 22; i++) this.spawnSparkle();

    // The prize gem flies into the hoard.
    const prize = this.makeGemShard(reward, 0.7);
    prize.position.copy(origin);
    this.scene.add(prize);
    this.flyers.push({ mesh: prize, t: 0, from: origin.clone(), to: COUNTER_WORLD.clone() });
  }

  private spawnSparkle(): void {
    const m = new Mesh(
      new OctahedronGeometry(0.09, 0),
      new MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 1.4, transparent: true }),
    );
    m.position.copy(this.hero.position).add(new Vector3((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4, 0.4));
    this.scene.add(m);
    this.sparkles.push({ mesh: m, life: 0.5 });
  }

  private updateVfx(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.vel.y -= 9 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      b.life -= dt;
      // Hold full size, then shrink only over the last 35% of life (gems stay vivid
      // in flight instead of fading the instant they spawn).
      b.mesh.scale.setScalar(b.size * Math.min(1, Math.max(0, b.life / b.maxLife) / 0.35));
      if (b.life <= 0) { this.scene.remove(b.mesh); this.bursts.splice(i, 1); }
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt / 0.9;
      const t = Math.min(1, f.t);
      const pos = f.from.clone().lerp(f.to, t);
      pos.y += Math.sin(t * Math.PI) * 1.6;
      f.mesh.position.copy(pos);
      f.mesh.rotation.y += dt * 8;
      f.mesh.scale.setScalar(0.5 * (1 - t * 0.5));
      if (t >= 1) {
        const col = (f.mesh.material as MeshPhysicalMaterial).color.getHex();
        this.scene.remove(f.mesh);
        this.flyers.splice(i, 1);
        // The prize gem arriving is the cue to commit the authoritative reward.
        // Money FIRST, cosmetics after (in a guard): a VFX/audio hiccup must
        // never eat the counter roll or the hoard-bonus credit.
        this.applyReward();
        try { this.hud.addGem(col); sfxCollect(); } catch (e) { console.warn("[hoard] cosmetic fail:", e); }
      }
    }
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.life -= dt;
      s.mesh.scale.setScalar(Math.max(0, s.life / 0.5));
      s.mesh.rotation.y += dt * 10;
      if (s.life <= 0) { this.scene.remove(s.mesh); this.sparkles.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - Math.max(0, r.life) / r.maxLife; // 0 → 1
      r.mesh.scale.setScalar(1 + k * r.grow);
      (r.mesh.material as MeshBasicMaterial).opacity = Math.max(0, r.life / r.maxLife) * r.op0;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        (r.mesh.material as MeshBasicMaterial).dispose();
        r.mesh.geometry.dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  private tick = (): void => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;

    if (this.winT >= 0) {
      // Charge-up: the geode swells and glows hot (no spin), then cracks open.
      this.winT += dt;
      const k = Math.min(1, this.winT / 0.2);
      this.hero.scale.setScalar(1 + k * k * 0.45);
      this.gemLight.intensity = 6 + k * 16;
      if (this.winT >= 0.2) { this.winT = -1; this.crackOpen(); }
    } else if (this.hero.visible) {
      if (this.gemHit > 0) this.gemHit = Math.max(0, this.gemHit - dt * 5);
      const recoil = Math.sin(this.gemHit * Math.PI);
      this.hero.position.y = HERO_Y + Math.sin(t * 1.2) * 0.05; // gentle bob, no rotation
      this.hero.scale.setScalar(1 + recoil * 0.08);
      // Inner crystals pulse with light; brighter as the geode is chipped open.
      this.gemLight.intensity = Math.min(5, 2 + this.cracks * 0.7) + Math.sin(t * 2.6) * 0.4 + recoil * 2;
    }
    this.gemLight.position.set(this.hero.position.x, this.hero.position.y, this.hero.position.z + 1.0);

    if (!this.poseFrozen) {
      if (this.pickaxeSwing > 0) {
        this.pickaxeSwing = Math.max(0, this.pickaxeSwing - dt * this.pickSwingRate);
        const p = 1 - this.pickaxeSwing;                     // 0 → 1 over the swing
        this.setSwingRotation(this.swingAngle(p));
        if (!this.swingImpactDone && p >= 0.48) {            // bottom of the slam → it connects
          this.swingImpactDone = true;
          const cb = this.onSwingImpact; this.onSwingImpact = null;
          cb?.();
        }
      } else {
        this.setSwingRotation(this.pickCock);                // idle: reared back, ready
      }
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.9);
      const s = this.shake * 0.45;
      this.camera.position.set(this.camBase.x + (Math.random() - 0.5) * s, this.camBase.y + (Math.random() - 0.5) * s, this.camBase.z);
      this.camera.lookAt(0, 1.05, 0);
    } else if (!this.camera.position.equals(this.camBase)) {
      this.camera.position.copy(this.camBase);
      this.camera.lookAt(0, 1.05, 0);
    }

    this.dust.rotation.y += dt * 0.02;
    if (this.legendaryMat) {
      // Showpiece = vivid iridescent metal. metalness=1 keeps real specular so it
      // never flattens to plastic; we cycle a SATURATED hue on the base tint (the
      // metal's reflected color), a moderate colored emissive glow, and a sliding
      // iridescence film — a colorful oil-slick, premium not neon.
      const m = this.legendaryMat;
      const hue = (t * 0.06) % 1;
      m.color.setHSL(hue, 0.72, 0.55);
      m.emissive.setHSL(hue, 0.9, 0.42);
      m.emissiveIntensity = 0.35;
      const lo = 260 + 180 * Math.sin(t * 0.6);
      m.iridescenceThicknessRange = [lo, lo + 620];
      m.iridescenceIOR = 2.2 + 0.25 * Math.sin(t * 0.37);
    }
    this.updateVfx(dt);
    this.composer.render();
  };

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /** Renderer diagnostics for QA/profiling. Direct render for true scene counts
   *  (the composer's final pass otherwise overwrites renderer.info). */
  stats(): { calls: number; triangles: number; geometries: number; textures: number } {
    this.renderer.render(this.scene, this.camera);
    const r = this.renderer.info;
    return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures };
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}

/** Merge a loaded GLB's meshes into one centered geometry, normalized so height = targetH. */
function extractGeometry(root: Group, targetH: number): BufferGeometry | null {
  const geos: BufferGeometry[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const m = o as Mesh;
    if ((m as unknown as { isMesh?: boolean }).isMesh && m.geometry) {
      let g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      const out = new BufferGeometry();
      out.setAttribute('position', g.getAttribute('position').clone());
      geos.push(out);
    }
  });
  if (!geos.length) return null;
  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  if (!merged) return null;
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const ctr = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  merged.translate(-ctr.x, -ctr.y, -ctr.z);
  merged.scale(targetH / (size.y || 1), targetH / (size.y || 1), targetH / (size.y || 1));
  merged.computeVertexNormals();
  return merged;
}


// Hero geode placement (live-tunable via window.__game.setHero).
const HERO_Y = -0.5;                          // lowered further per feedback
const HERO_ROT = new Vector3(0.4, 3.93, 0);   // geode child rotation → open crystal face tilted toward camera

// World point that projects up near the hoard wall (top-left of the HUD).
const COUNTER_WORLD = new Vector3(-3.4, 3.0, 2.0);
// Grimy tone a worn pickaxe head lerps toward as durability drops.
const GRIME = new Color(0x4a453e);
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// Growth-mindset praise (Dweck): name the PROCESS — strategy, persistence,
// progress-from-practice — never bare ability. Matched to HOW he solved it:
// instant recall gets "your practice is showing" (effort-praise on easy wins
// backfires), long grinds get persistence, retry-wins get the mistake→fix arc.
// Generic quick wins stay in the mix so it never turns preachy. ≤90 chars each
// (the TTS cache line).
const PRAISE = ['You got it!', 'Nice mining!', 'You figured that one out!', 'Ooh, shiny!', 'Another gem, you earned it!'];
const PRAISE_FAST = [
  'Lightning fast, your practice is showing!',
  'You just knew that one. That comes from practicing!',
  'Zip! Your brain is getting quicker every day.',
];
const PRAISE_GRIT = [
  'You stuck with it and cracked it, that is real mining!',
  'That took some thinking, and you did not give up!',
  'Big think, big gem! Nice sticking with it.',
];
const PRAISE_RETRY = [
  'You fixed it yourself, that is how learning works!',
  'See? A second look and you cracked it!',
  'A miss, then a fix, that is how miners get stronger!',
];
// Retries: "not yet" is the growth-mindset word — and nudge toward a STRATEGY.
const NUDGE = [
  'Not yet, take another look!',
  'Hmm, not quite. Try it a different way!',
  'So close! Check your counting once more.',
  'Not yet! Slow down and give it another go.',
  'Try counting it out loud this time!',
];
// Spoken when a problem defeats him (3 tries) — growth-mindset framing FIRST,
// because missing hard ones is exactly how the tutor calibrates. Never scary.
const WARM_MISS = [
  'That was a brave try on a tough one!',
  'Ooh, a tricky gem! Missing these teaches me how to help you.',
  'Tough one! Even the best miners hit hard rock sometimes.',
  'Great effort, hard ones like this make you stronger!',
];
const pick = (a: string[]): string => a[Math.floor(Math.random() * a.length)];

/** Center an imported model on its base and scale its largest dimension to `target`. */
function fitObject(obj: Group, target: number): void {
  const box = new Box3().setFromObject(obj);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const max = Math.max(size.x, size.y, size.z) || 1;
  const s = target / max;
  obj.scale.multiplyScalar(s);
  obj.position.sub(center.multiplyScalar(s));
}
