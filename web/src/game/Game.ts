import {
  Scene, PerspectiveCamera, WebGLRenderer, ACESFilmicToneMapping, SRGBColorSpace,
  FogExp2, Group, Box3, Vector2, Vector3, Clock,
  DirectionalLight, PointLight, HemisphereLight,
  IcosahedronGeometry, OctahedronGeometry, ConeGeometry, CylinderGeometry, PlaneGeometry, RingGeometry,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial, Mesh,
  PMREMGenerator, TextureLoader, AdditiveBlending, DoubleSide,
  Points, BufferGeometry, Float32BufferAttribute, PointsMaterial,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Problem, Branches, Reward } from '@institute/shared';
import { Hud } from './hud';
import { fetchFirst, fetchBranches, recordAttempt, creditRetrySolve, fetchState, buyShield } from './tutor';
import { speak, sfxChink, sfxMine, sfxFizzle, sfxCollect, sfxFanfare, startAmbience, preloadAudio } from './audio';

// Saturated jewel tones — vivid against the dark cavern (muddy mid-tones removed).
const GEM_PALETTE = [0x2ee6a0, 0x4d8cff, 0xff4d7e, 0xffd23b, 0xb15cff, 0x32e0e0, 0xff7eb6];

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

  // scene objects
  private hero!: Group;            // the geode being mined
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
      onBuyShield: () => void this.onBuyShield(),
      onToggleQuests: () => this.hud.toggleQuests(),
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
    this.hero.add(this.makeGeodePlaceholder()); // until the GLB swaps in
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
    const loader = new GLTFLoader();
    const tryLoad = (url: string) => new Promise<Group | null>((res) => {
      loader.load(url, (g) => res(g.scene), undefined, () => res(null));
    });

    const pick = await tryLoad('/assets/models/pickaxe.glb');
    if (pick) {
      this.pickModel = pick;
      this.pickHolder.clear();
      this.pickHolder.add(pick);
      this.applyPickRig();
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
      // The hero geode — the thing being mined — swaps in for the placeholder.
      const heroGeode = geode.clone(true);
      fitObject(heroGeode, 2.0);
      heroGeode.rotation.set(HERO_ROT.x, HERO_ROT.y, HERO_ROT.z); // open face toward the camera
      this.hero.clear();
      this.hero.add(heroGeode);
    }

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

  /** Simple gray geode placeholder shown until the GLB loads. */
  private makeGeodePlaceholder(): Mesh {
    const m = new Mesh(
      new IcosahedronGeometry(0.95, 1),
      new MeshStandardMaterial({ color: 0x6f6880, roughness: 1, flatShading: true }),
    );
    m.scale.set(1, 0.92, 1);
    return m;
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
    this.hud.setStreak(st.streak, false);
    this.hud.setShields(st.shields);
    this.hud.setGemsForShop(st.gems);
    this.hud.setQuests(st.quests);
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

  private showProblem(p: Problem): void {
    this.problem = p;
    this.entered = '';
    this.firstAttempt = null;
    this.mined = false;
    this.wrongCount = 0;
    this.busy = false;
    this.shownAt = performance.now();
    this.hud.setProblem(p.prompt);
    this.hud.setAnswer('');
    this.hud.clearHint();
    void speak(p.spoken);
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

  private onMine(): void {
    if (!this.problem || this.mined || this.busy || this.entered.length === 0) return;
    const val = parseInt(this.entered, 10);
    const correct = val === this.problem.answer;

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
        correct,
        solveMs: Math.round(performance.now() - this.shownAt),
        difficulty: p.difficulty,
      }).then((reward) => this.onReward(reward, correct));
    } else if (correct) {
      // Solved on a retry — still earns a gem (no streak); flows through the same reward path.
      this.awaitingReward = true;
      void creditRetrySolve().then((reward) => this.onReward(reward, true));
    }

    if (correct) {
      this.mined = true;
      this.busy = true;
      void speak(pick(PRAISE));
      // Pickaxe slams down → on impact the gem charges up and bursts.
      this.swing(() => { sfxMine(); this.winT = 0; this.gemLight.intensity = 18; });
      setTimeout(() => void this.advance(), 1450);
    } else {
      this.wrongCount += 1;
      this.hud.flashWrong();
      this.swing(() => { sfxFizzle(); this.gemHit = 0.6; }); // strike lands but the geode holds
      const hint = this.problem.hint;
      if (this.wrongCount >= 3) {
        // Stuck: reveal the answer + the strategy, then move on to an easier one.
        this.busy = true;
        const ans = this.problem.answer;
        void speak(`That one is tricky! The answer is ${ans}.${hint ? ' ' + hint : ''} Let's try an easier one.`);
        this.hud.setAnswer(String(ans));
        this.hud.showHint(`The answer is ${ans} — let's try an easier one!`);
        setTimeout(() => void this.advance(), 3400);
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
      // Miss: reflect the streak/shield outcome right away.
      this.hud.setShields(reward.shields);
      this.hud.setGemsForShop(reward.totalGems);
      if (reward.shieldUsed) {
        this.hud.flashShieldSave();
        this.hud.celebrateShieldSave();
        void speak('Your shield saved your streak!');
      } else {
        this.hud.setStreak(reward.streak, false); // visibly resets to 0
      }
    }
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
    // Refresh quest progress bars from the server (cheap; reflects live deltas).
    void this.syncState(false);
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
      b.mesh.scale.setScalar(b.size * Math.max(0, b.life / b.maxLife));
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
        this.hud.addGem(col);   // gem lands in the visible hoard
        sfxCollect();
        // The prize gem arriving is the cue to commit the authoritative reward:
        // roll the counter, grow the streak flame, and fire any celebrations.
        this.applyReward();
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
const PRAISE = ['Yes! Nice mining!', 'You got it!', 'Sparkly!', 'Great job!', 'Wonderful!'];
const NUDGE = ['So close, try again!', 'Hmm, not quite — give it another go!', 'Almost! Try once more.'];
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
