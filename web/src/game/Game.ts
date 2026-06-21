import {
  Scene, PerspectiveCamera, WebGLRenderer, ACESFilmicToneMapping, SRGBColorSpace,
  Color, FogExp2, Group, Box3, Vector2, Vector3, Clock,
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
import type { Problem, Branches } from '@institute/shared';
import { Hud } from './hud';
import { fetchFirst, fetchBranches, recordAttempt } from './tutor';
import { speak, sfxChink, sfxMine, sfxFizzle, sfxCollect, startAmbience, preloadAudio } from './audio';

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
  private shownAt = 0;
  private collection = 0;
  private busy = false;

  // scene objects
  private gem!: Mesh;
  private gemLight!: PointLight;
  private dust!: Points;
  private bursts: { mesh: Mesh; vel: Vector3; life: number; spin: Vector3 }[] = [];
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
  private pickSwingAxis: 'x' | 'z' = 'x';
  private pickPivot = new Vector3(0.4, -1.05, 3.5);   // grip in the lower foreground, near the camera
  private pickCock = -1.5;        // idle: head reared up & back over the shoulder
  private pickSlam = -0.6;        // slam: head pitches forward & down into the gem at (0,1.7,0)
  private pickModelRot = new Vector3(0.15, 0, 0); // fine head alignment along the +Y arm
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

    // Foreground rock frame — dark displaced chunks that vignette the prize.
    const rockMat = new MeshStandardMaterial({ color: 0x2b2440, roughness: 1, metalness: 0, flatShading: true });
    const frame: [number, number, number, number][] = [
      [-7.2, 3.0, -3.5, 2.2], [7.2, 3.2, -3.5, 2.4],
      [-7.4, -2.6, -2.5, 2.6], [7.4, -2.8, -2.5, 2.6],
    ];
    for (const [x, y, z, s] of frame) {
      const r = new Mesh(new IcosahedronGeometry(s, 1), rockMat);
      r.position.set(x, y, z);
      r.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      r.scale.set(1, 0.8 + Math.random() * 0.5, 1);
      this.scene.add(r);
    }

    // Ledges + embedded crystal clusters (procedural; GLBs swap in via loadAssets).
    this.addCrystalCluster(-3.7, -0.9, 0.4, 0.9, 0x7ad0ff);
    this.addCrystalCluster(3.8, -1.1, 0.2, 1.0, 0xb78cff);
    this.addCrystalCluster(-4.5, 1.7, -0.6, 0.7, 0xff9ecb);
    this.addCrystalCluster(4.6, 1.4, -0.6, 0.7, 0x8affc8);

    // Hero gem (the prize being mined).
    this.gem = this.makeGem(0x8be9ff, 1.15);
    this.gem.position.set(0, 1.7, 0);
    this.scene.add(this.gem);
    this.gemLight = new PointLight(0x8be9ff, 22, 12, 2);
    this.gemLight.position.set(0, 1.75, 1.2);
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
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.55, 0.5, 0.82);
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
      const spots: [number, number, number, number][] = [[-2.7, -1.8, 1.3, 1.3], [2.9, -1.9, 0.9, 1.5]];
      for (const [x, y, z, s] of spots) {
        const c = geode.clone(true);
        fitObject(c, s);
        c.position.set(x, y, z);
        c.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(c);
      }
    }
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
    this.scene.add(g);
  }

  private makeGem(color: number, scale: number): Mesh {
    const geo = new OctahedronGeometry(0.82, 0);
    geo.scale(1, 1.3, 1); // elongate into a cut-gem silhouette
    const m = new Mesh(geo, new MeshPhysicalMaterial({
      color, metalness: 0, roughness: 0.06,
      transmission: 0.55, ior: 1.9, thickness: 0.7,
      emissive: color, emissiveIntensity: 0.38,
      attenuationColor: new Color(color), attenuationDistance: 2.0,
      iridescence: 1.0, iridescenceIOR: 1.3, specularIntensity: 1,
      clearcoat: 1, clearcoatRoughness: 0.04, flatShading: true, envMapIntensity: 1.7,
    }));
    m.scale.setScalar(scale);
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
    this.pickaxe.rotation.set(0, 0, 0);
    if (this.pickSwingAxis === 'x') this.pickaxe.rotation.x = angle;
    else this.pickaxe.rotation.z = angle;
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
    scale?: number; swingRate?: number; axis?: 'x' | 'z';
  }): { ok: true } {
    if (o.pivot) this.pickPivot.set(o.pivot[0], o.pivot[1], o.pivot[2]);
    if (o.cock !== undefined) this.pickCock = o.cock;
    if (o.slam !== undefined) this.pickSlam = o.slam;
    if (o.modelRot) this.pickModelRot.set(o.modelRot[0], o.modelRot[1], o.modelRot[2]);
    if (o.modelOffset) this.pickModelOffset.set(o.modelOffset[0], o.modelOffset[1], o.modelOffset[2]);
    if (o.scale !== undefined) this.pickScale = o.scale;
    if (o.swingRate !== undefined) this.pickSwingRate = o.swingRate;
    if (o.axis) this.pickSwingAxis = o.axis;
    this.applyPickRig();
    return { ok: true };
  }
  getPickRig(): object {
    return {
      pivot: this.pickPivot.toArray(), cock: this.pickCock, slam: this.pickSlam,
      modelRot: this.pickModelRot.toArray(), modelOffset: this.pickModelOffset.toArray(),
      scale: this.pickScale, swingRate: this.pickSwingRate, axis: this.pickSwingAxis,
      hasModel: !!this.pickModel,
    };
  }
  /** Freeze the pickaxe at swing phase p∈[0,1] for screenshots; pass null to release. */
  poseSwing(p: number | null): void {
    if (p === null) { this.poseFrozen = false; this.setSwingRotation(this.pickCock); return; }
    this.poseFrozen = true;
    this.setSwingRotation(this.swingAngle(Math.max(0, Math.min(1, p))));
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
    try {
      this.showProblem(await fetchFirst());
    } catch (e) {
      this.hud.setProblem('(offline)');
      console.error('failed to load first problem', e);
    }
  }

  private showProblem(p: Problem): void {
    this.problem = p;
    this.entered = '';
    this.firstAttempt = null;
    this.mined = false;
    this.busy = false;
    this.shownAt = performance.now();
    this.hud.setProblem(p.prompt);
    this.hud.setAnswer('');
    void speak(p.spoken);
    this.resetGem(GEM_PALETTE[Math.floor(Math.random() * GEM_PALETTE.length)]);
    this.branchesPromise = fetchBranches(p).catch(() => null);
  }

  private resetGem(color: number): void {
    const mat = this.gem.material as MeshPhysicalMaterial;
    mat.color.setHex(color);
    mat.emissive.setHex(color);
    mat.attenuationColor.setHex(color);
    this.gem.scale.setScalar(1.15);
    this.gem.visible = true;
    this.gemHit = 0;
    this.gemLight.color.setHex(color);
    this.gemLight.intensity = 22;
  }

  // ---- input -----------------------------------------------------------------
  private onDigit(d: number): void {
    if (this.mined || this.busy || this.entered.length >= 3) return;
    startAmbience(); // first user gesture unlocks audio
    this.entered += String(d);
    this.hud.setAnswer(this.entered);
    // The pickaxe swings down; the chink + gem flinch fire when it *connects*.
    this.swing(() => { sfxChink(); this.gemHit = 1; this.spawnSparkle(); });
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

    if (this.firstAttempt === null) {
      this.firstAttempt = correct;
      recordAttempt({
        problemId: this.problem.id,
        skill: this.problem.skill,
        correct,
        solveMs: Math.round(performance.now() - this.shownAt),
        difficulty: this.problem.difficulty,
      });
    }

    if (correct) {
      this.mined = true;
      this.busy = true;
      void speak(pick(PRAISE));
      // Pickaxe slams down → on impact the gem charges up and bursts.
      this.swing(() => { sfxMine(); this.winT = 0; this.gemLight.intensity = 70; });
      setTimeout(() => void this.advance(), 1450);
    } else {
      void speak(pick(NUDGE));
      this.hud.flashWrong();
      this.entered = '';
      this.swing(() => { sfxFizzle(); this.gemHit = 0.6; }); // strike lands but the gem holds
      setTimeout(() => this.hud.setAnswer(''), 350);
    }
  }

  private async advance(): Promise<void> {
    const b = this.branchesPromise ? await this.branchesPromise : null;
    const next = b ? (this.firstAttempt ? b.right : b.wrong) : await fetchFirst();
    this.showProblem(next);
  }

  // ---- VFX -------------------------------------------------------------------
  private shatterGem(): void {
    const mat = this.gem.material as MeshPhysicalMaterial;
    const color = mat.color.getHex();
    const origin = this.gem.position.clone();
    this.gem.visible = false;
    this.gem.scale.setScalar(1.15); // reset for next round
    this.gemLight.intensity = 0;
    this.shake = 0.45;              // camera punch

    // White flash pop at the core.
    const flash = new Mesh(
      new IcosahedronGeometry(0.55, 1),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false }),
    );
    flash.position.copy(origin);
    this.scene.add(flash);
    this.rings.push({ mesh: flash, life: 0.3, maxLife: 0.3, grow: 7, op0: 0.95 });

    // Expanding shockwave ring in the gem's color, facing the camera.
    const ring = new Mesh(
      new RingGeometry(0.35, 0.55, 44),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: AdditiveBlending, side: DoubleSide, depthWrite: false }),
    );
    ring.position.copy(origin);
    ring.lookAt(this.camera.position);
    this.scene.add(ring);
    this.rings.push({ mesh: ring, life: 0.55, maxLife: 0.55, grow: 16, op0: 0.9 });

    // Shard spray — bigger, brighter, with a couple of big chunks for weight.
    const shardMat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.2, flatShading: true });
    for (let i = 0; i < 34; i++) {
      const big = i < 5;
      const shard = new Mesh(new OctahedronGeometry((big ? 0.22 : 0.09) + Math.random() * 0.1, 0), shardMat);
      shard.position.copy(origin);
      this.scene.add(shard);
      const dir = new Vector3((Math.random() - 0.5) * 2, Math.random() * 1.7, (Math.random() - 0.2) * 2).normalize();
      this.bursts.push({
        mesh: shard, vel: dir.multiplyScalar((big ? 3 : 5) + Math.random() * 4), life: 0.7 + Math.random() * 0.5,
        spin: new Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      });
    }
    // Twinkle dust burst.
    for (let i = 0; i < 10; i++) this.spawnSparkle();

    const reward = this.makeGem(color, 0.55);
    reward.position.copy(origin);
    this.scene.add(reward);
    this.flyers.push({ mesh: reward, t: 0, from: origin.clone(), to: COUNTER_WORLD.clone() });
  }

  private spawnSparkle(): void {
    const m = new Mesh(
      new OctahedronGeometry(0.09, 0),
      new MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 1.4, transparent: true }),
    );
    m.position.copy(this.gem.position).add(new Vector3((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4, 0.4));
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
      b.mesh.scale.setScalar(Math.max(0, b.life / 0.95));
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
        this.collection += 1;
        this.hud.addGem(col, this.collection); // gem lands in the visible hoard
        sfxCollect();
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

    const gemMat = this.gem.material as MeshPhysicalMaterial;
    if (this.winT >= 0) {
      // Charge-up: the gem swells, spins, and glows brighter, then bursts.
      this.winT += dt;
      const k = Math.min(1, this.winT / 0.16);
      this.gem.scale.setScalar(1.15 + k * k * 0.85);
      this.gem.rotation.y += dt * 7;
      gemMat.emissiveIntensity = 0.4 + k * 1.8;
      if (this.winT >= 0.16) { this.winT = -1; this.shatterGem(); }
    } else if (this.gem.visible) {
      if (this.gemHit > 0) this.gemHit = Math.max(0, this.gemHit - dt * 5);
      const recoil = Math.sin(this.gemHit * Math.PI);
      this.gem.rotation.y += dt * 0.7;
      this.gem.rotation.x = Math.sin(t * 0.7) * 0.14 - recoil * 0.12;
      this.gem.position.y = 1.7 + Math.sin(t * 1.4) * 0.08;
      this.gem.scale.setScalar(1.15 * (1 + recoil * 0.13));
      gemMat.emissiveIntensity = 0.2 + Math.sin(t * 3) * 0.1 + recoil * 0.5;
    }

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
