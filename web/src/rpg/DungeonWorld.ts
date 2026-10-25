import type { WorldSound } from './sound';
import { playFireSpellBonus } from './world/fireSpellBonuses';
import { playFrostSpellBonus, createDiamondDrill } from './world/frostSpellBonuses';
import { playStormSpellBonus, createOrbitLink } from './world/stormSpellBonuses';
import type { SpellBonusContext } from './world/spellBonusTypes';
import * as THREE from 'three';
import { createOutdoorKit, outdoorKind, outdoorLight, type OutdoorKit } from './world/outdoorWorld';
import { RPG_SPELL_SHAPES, RPG_SPELLS, type RpgAppearanceId, type RpgCombatEnemy, type RpgCombatResult } from '@institute/shared';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { dungeonCameraHalfHeight, dungeonCameraVerticalOffset, dungeonPortraitOffset, dungeonCombatFrame } from './world/viewport';
import { crystalClusterMaterial } from './world/crystals';
import { iceShardGeometry, iceShardMaterial } from './world/ice';
import { createDirectedFlight, directionalFlightDuration, sampleGroundBranch, targetHeading } from './world/directional';
import { createIceLanceWake, arcLanceGeometry, arcLanceMaterial } from './world/directionalVisuals';
import { lightningGeometry, lightningMaterial } from './world/lightning';
import { createBallLightning, createBallLightningCharge, ballLightningReleasePosition, createBallLightningContacts, ballLightningVolumeMaterial, ballLightningFilamentMaterial, ballLightningContactMaterial } from './world/ballLightning';
import { createFireNova, createFireNovaContacts, createNovaIgnition, fireNovaFrontMaterial, fireNovaVolumeMaterial } from './world/fireNova';
import { createFrostfallCrystal, createFrostfallContact, frostfallCrystalMaterial, frostfallContactMaterial, sampleFrostfallFlight } from './world/frostfall';
import { phoenixWingGeometry, phoenixTailGeometry, stormFilamentsGeometry } from './world/spellShapes';
import { phoenixFeatherMaterial, stormWispMaterial } from './world/materials';
import { enemyRoster } from './world/enemyRoster';
import { EnemyAnimator } from './world/EnemyAnimator';
import { HeldEquipment, tripoHeroEquipment } from './world/HeldEquipment';
import { HeroAnimator, type ActorClipRoles } from './world/heroAnimator';
import { FloorLoot, type LootPickup } from './world/floorLoot';
import { HordeDirector } from './world/hordeDirector';
import { HeroWard } from './world/heroWard';
import { DamageNumbers } from './world/damageNumbers';
import { ENGAGE_RADIUS, slideStep } from './world/exploration';
import { Level, farPoint, rectCenter, HERO_RADIUS, LOCK_REACH, type Area, type Feature, type Rect } from './world/levelGen';
import { BreakableKit, BreakableDebris, breakableHeight } from './world/breakables';
import { EliteAura, ELITE_COLOR, ELITE_SCALE, eliteName } from './world/elite';
import type { ScoutView } from './minimapModel';
import { createDescentPortal, DESCENT_ENTER_RADIUS, type DescentPortal } from './world/descentPortal';
import { MIN_ENEMY_SPACING, packPositions } from './world/formation';
import { shrineAmbush } from './locks';
import { buildChunk, disposeChunk, CHEST_OPEN_ANGLE, type BuiltChunk, type VaultMaterials } from './world/levelChunks';
import { animateDoor, animateShrine, boonColor, DOOR_FLARE_SECONDS } from './world/lockVisuals';
import { BoonAura } from './world/boonAura';
import type { RpgBoonId, RpgLockKind } from '@institute/shared';
import { updateHeroCutout } from './world/heroCutout';
import { TRIPO_HERO_MODEL, createTripoHeroInstance, tintTripoHero, measureTripoWalkCycle, HeroAssetLoadError } from './world/tripoHeroRuntime';
import { createCleaveStrike, cleaveEdgeMaterial, steelBladeWakeMaterial, CLEAVE_RELEASE, CLEAVE_SPEED } from './world/cleave';
import { createChainSequence, chainLightningGeometry, chainLightningMaterial, createChainCharge, CHAIN_BOLT_LIFETIME } from './world/chain';
import { ITEM_MODELS } from './itemModels';
import { createHitReaction, sampleHitReaction, type HitReaction, type CombatHit } from './world/hitReactions';
import { advanceHeroTravel, setPlanarHeroHeading, type HeroWalkCycle } from './world/heroLocomotion';
import { cloneErosionProgramMaterial, createElectricDissolve, createSkinnedDissolve } from './world/electricDissolve';
import { stoneMaterial, floorRelief, flameMaterial, fireSheetMaterial, firePlumeMaterial, bladeWakeMaterial, ashMaterial, novaMaterial, glowTexture, waveTexture } from './world/materials';

// Shared visual size; weapons inherit the hero scale through their sockets.
const ACTOR_SCALE = 1.25;

type Enemy = { id: string; hp: number; maxHp: number; root: THREE.Group; visual: THREE.Object3D; origin: THREE.Vector3; phase: number; brute: boolean; dead: boolean; modelId: string; height: number; deathAt: number; animator: EnemyAnimator;
  /** Where the body stands now: staged at the back of the room until the hero engages, then at `origin`. */
  at: THREE.Vector3; speed: number; clips?: HeroAnimator;
  /** The pack's elite, chosen by the server: larger, with a gold aura and name plate. */
  elite?: { name: string; aura: EliteAura } };
/** Retargeted Tripo clips on the authored enemy rig (scripts/retarget-enemy-motions.py). */
const ENEMY_CLIP_ROLES: ActorClipRoles = {
  upperBone: /^(Spine|Chest|Head|UpperArm|Forearm|Hand|Weapon|Shield)/,
  fullBody: ['hit', 'hit-side', 'death', 'death-fall'], upperBody: ['attack'], held: ['death', 'death-fall'],
};
/** Each spell's body motion. All casts release at .45 s, so effect timing holds. */
const HERO_CAST: Record<string, string> = {
  meteor: 'cast-throw', 'ball-lightning': 'cast-throw',
  tempest: 'cast-raise', blizzard: 'cast-raise', firestorm: 'cast-raise', 'frost-guardian': 'cast-raise',
  'ice-lance': 'cast-thrust', 'arc-lance': 'cast-thrust', 'glacial-surge': 'cast-thrust',
};
/** Something the hero opens with a solved problem: a chest, a shrine or a sealed door. */
export type LockTarget = { kind: RpgLockKind; id: string };
/** How a search for the horde ended: in combat, or at a lock on the way. */
export type SearchEnd = { lock?: LockTarget };
/** Swiftness: run speed multiplier while the boon lasts. */
const SWIFT_RUN = 1.4;
/** Sounds the world asks for; the game decides whether they play. */
export type CombatSound = WorldSound;
/** Top running speed, faster than the run clip's measured pace: an action-RPG hero covers a room in a few seconds. */
const HERO_RUN_SPEED = 4.4;
/** Seconds a cast holds the hero still before the player may move on. */
const CAST_ROOT = .7, CLEAVE_ROOT = .85;
/** Seconds off screen before an unfought pack may move nearer to the hero. */
const PACK_FORGET_SECONDS = 4;
/** A pack that follows the hero only grows a new area from exits this near him. */
const PACK_REGROW_REACH = 24;
/** How far from the start the guardian's sanctum grows. */
const GUARDIAN_DISTANCE = 60;
/** From a sealed door back toward the hall it is opened from (its side points into the treasury). */
const DOOR_FRONT: Record<'north' | 'south' | 'east' | 'west', { x: number; z: number }> = { north: { x: 0, z: 1 }, south: { x: 0, z: -1 }, east: { x: -1, z: 0 }, west: { x: 1, z: 0 } };
const ELEMENT_FLASH = { fire: new THREE.Color(1, .45, .12), electric: new THREE.Color(.55, .75, 1.3), frost: new THREE.Color(.55, 1, 1.3), other: new THREE.Color(1, .95, .85) };
type Fragment = { position: THREE.Vector3; velocity: THREE.Vector3; rotation: THREE.Vector3; spin: THREE.Vector3; scale: THREE.Vector3; color: THREE.Color; life: number; maxLife: number; hot: boolean; bounced: boolean };
type Particle = { position: THREE.Vector3; velocity: THREE.Vector3; color: THREE.Color; life: number; maxLife: number; size: number };
type AttackOptions = { spellShape?: import('@institute/shared').RpgSpellShape; combat?: RpgCombatResult; echo?: boolean; wide?: boolean; burning?: boolean; shards?: boolean; chains?: boolean; pierce?: boolean; orbit?: boolean; summon?: boolean; itemId?: string; kills?: number; drop?: { name: string; rarity: string }; xp?: number };
type Effect = { mesh: THREE.Mesh; startedAt: number; age: number; duration: number; kind: 'ring' | 'slash' | 'beam' | 'ground' | 'shard' | 'custom'; radius: number; update?: (t: number, delta: number) => void };

/** Presentation only. Time, animations and damage never decide learning or rewards. */
export class DungeonWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-18, 18, 11, -11, .1, 180);
  readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly environment: THREE.WebGLRenderTarget;
  private readonly hero = new THREE.Group();
  private heroVisual = new THREE.Group();
  private readonly heroClipSets = new Map<string, THREE.AnimationClip[]>();
  private desiredAppearance: RpgAppearanceId = 'wayfarer';
  private appearance: RpgAppearanceId = 'wayfarer';
  private heroModelId = '';
  private heroMixer?: THREE.AnimationMixer;
  private heroAnimator?: HeroAnimator;
  private heroUsesAuthoredMotion = false;
  private heldEquipment?: HeldEquipment;
  private cleaveCandidate = true;
  private chainCandidate = true;
  private chainUsesHandOrigin = false;
  private readonly floorGroup = new THREE.Group();
  private readonly enemyGroup = new THREE.Group();
  private readonly effectsGroup = new THREE.Group();
  private readonly propGroup = new THREE.Group();
  /** The level grows as the hero explores; chunks near the camera are built, far ones released. */
  private level?: Level;
  private readonly chunks = new Map<string, BuiltChunk>();
  private outdoorKit?: OutdoorKit;
  private outdoorRegion = '';
  private outdoorGround?: THREE.Mesh;
  /** The area that holds the current pack, and when the player last saw it there. */
  private packArea?: Area;
  /** The expedition this level belongs to. */
  private levelKey?: string;
  /** The hero stepped into the guardian's sanctum before the guardian's fight. */
  onSanctumEnter?: () => void;
  private packSeenAt = -Infinity;
  private heroArea?: Area;
  private lastStreamAt = -9;
  private lastLightsAt = -9;
  private lastPackCheckAt = -9;
  /** Combat framing eases toward its target, so engaging never jumps the view. */
  private framing = { scale: 1, shift: 0, horizontal: false };
  private frameTarget = { scale: 1, shift: 0, horizontal: false };
  private lastFrameMeasureAt = -9;
  /** Floor test for the hero and for drops: false off the level. */
  private readonly walkable = (x: number, z: number) => this.level?.walkable(x, z) ?? false;
  private stoneSurfaceLoaded = false;
  private readonly floatingRunes: THREE.Object3D[] = [];
  private readonly cameraTarget = new THREE.Vector3();
  private readonly heroLight = new THREE.PointLight(0xd6e3f0, 32, 7, 1.8);
  private readonly burstLight = new THREE.PointLight(0xffae40, 0, 20, 1.5);
  private readonly warmLights = [new THREE.PointLight(0xff9c45, 70, 14, 2), new THREE.PointLight(0xff822b, 60, 14, 2)];
  private readonly recessLights = [new THREE.PointLight(0x0c7bb1, 56, 12, 2), new THREE.PointLight(0x0b749f, 50, 12, 2)];
  private readonly lightAnchors = Array.from({ length: 4 }, () => new THREE.Vector3());
  private readonly rune: THREE.Mesh;
  private readonly materials: Record<string, THREE.MeshStandardMaterial>;
  private readonly models = new Map<string, THREE.Group>();
  private readonly preparedMaterials: THREE.Material[] = [];
  private drawWarmup?: { programs: number; durationMs: number };
  private readonly particles: Particle[] = [];
  private readonly fragments: Fragment[] = [];
  private readonly fragmentTransform = new THREE.Object3D();
  private readonly stoneFragments = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .86, flatShading: true }), 420);
  private readonly hotFragments = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 420);
  private readonly particleGeometry = new THREE.BufferGeometry();
  private readonly particlePositions = new Float32Array(900 * 3);
  private readonly particleColors = new Float32Array(900 * 3);
  private readonly particleScales = new Float32Array(900);
  private readonly particleMaterial: THREE.PointsMaterial;
  private readonly waveMap = waveTexture();
  private readonly glowMap = glowTexture();
  private readonly livingFlame = flameMaterial();
  private readonly torches: { flame: THREE.Mesh; light?: THREE.PointLight; position: THREE.Vector3; phase: number }[] = [];
  private readonly effects: Effect[] = [];
  private novaContacts?: ReturnType<typeof createFireNovaContacts>;
  private readonly enemies: Enemy[] = [];
  private readonly skinnedEnemies: { mesh: THREE.SkinnedMesh; root: THREE.Group; baseMaterial: THREE.Material | THREE.Material[]; dissolve: ReturnType<typeof createSkinnedDissolve> }[] = [];
  private readonly enemyInstances: { mesh: THREE.InstancedMesh; sources: THREE.Mesh[]; roots: THREE.Group[]; baseMaterial: THREE.Material | THREE.Material[]; dissolve: ReturnType<typeof createElectricDissolve> }[] = [];
  private lastFrameAt = performance.now();
  private frame = 0;
  private elapsed = 0;
  private encounter = 0;
  private regionId = 'sunken-vault';
  private equipment = '';
  private disposed = false;
  private paused = false;
  private combatSafeTop = 0;
  private combatSafeBottom = 0;
  private attacking = false;
  private attackAge = 0;
  private attackHeading?: number;
  private castRoot = 0;
  /** Targets of the current spell that no hit has reached yet, and when the last hit landed. */
  private attackPending = new Set<string>();
  private attackHitAt = 0;
  private attackDuration = 2.65;
  private lastAttack: { spellId: string; effect: string; options: AttackOptions } | null = null;
  private heroMotion?: (age: number) => THREE.Vector3;
  private heroTravelSpeed = 0;
  private heroWalkCycle?: HeroWalkCycle;
  private readonly enemyClipSets = new Map<string, THREE.AnimationClip[]>();
  private readonly enemyGaits = new Map<string, { walk?: HeroWalkCycle; run?: HeroWalkCycle }>();
  /** Free movement: the hero explores until a horde is near, then combat begins. */
  private engaged = false;
  private engageReady = false;
  private engageWaiters: ((reached: SearchEnd) => void)[] = [];
  /** A lock that already asked for a problem; it asks again once the hero walks away and back. */
  private lockAsked?: string;
  private readonly chestOpenings = new Map<string, number>();
  private readonly breakableKit = new BreakableKit();
  private readonly breakableDebris = new BreakableDebris(this.breakableKit);
  /** A breakable the hero walks to; it breaks when he reaches it. */
  private breakTarget?: string;
  /** A breakable broke (presentation first); the game asks the server whether it held dust. */
  onBreak?: (id: string) => void;
  /** The way down that opens where a guardian fell; its waiters resolve when the hero steps in. */
  private descent?: { portal: DescentPortal; at: THREE.Vector3; openedAt: number; waiters: ((entered: boolean) => void)[]; entered: boolean };
  /** The next level of this region, built a chunk at a time while the way down stands open. */
  private nextLevel?: { level: Level; regionId: string; chunks: Map<string, BuiltChunk> };
  /** When each door opened or shrine woke, for their animations. */
  private readonly lockOpenings = new Map<string, number>();
  private readonly boonAura: BoonAura;
  private boon: RpgBoonId | null = null;
  private exploreRoute: THREE.Vector3[] = [];
  private readonly exploreKeys = new Set<string>();
  private pointerSteering = false;
  private readonly moveMarker: THREE.Mesh;
  private readonly floorLoot: FloorLoot;
  /** The hero walked into a new area of the level. */
  onAreaEnter?: (name: string) => void;
  /** A relic or mote reached the hero (presentation only). */
  onLootPickup?: (pickup: LootPickup) => void;
  onSound?: (sound: CombatSound) => void;
  /** Live combat: the horde paces and strikes at the ward while a problem waits. */
  private readonly horde = new HordeDirector();
  private readonly ward = new HeroWard();
  private readonly damageNumbers = new DamageNumbers();
  /** Real seconds left in a hit-stop, and when the last one began. */
  private hitStop = 0;
  private lastHitStopAt = -9;
  private zoomPunch = 0;
  /** Energy gathering in the hero's hand between a correct answer and its cast. */
  private charge?: { sprite: THREE.Sprite; startedAt: number; color: number };
  private readonly inputAbort = new AbortController();
  private readonly summoned: { root: THREE.Group; age: number; duration: number; update: (t: number) => void }[] = [];
  private shake = 0;
  private attackResolve?: () => void;
  private readonly scheduled: { at: number; callback: () => void }[] = [];
  private width = 0;
  private height = 0;
  private loadedModels = 0;
  private readonly softwareRenderer: boolean;
  private framesPerSecond = 60;
  private fpsFrames = 0;
  private fpsMeasuredAt = performance.now();
  private quality = 0;
  private lowFpsSamples = 0;
  private highFpsSamples = 0;
  private loadedAt = 0;
  private lastShadowUpdate = -1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    this.softwareRenderer = debug ? /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))) : false;
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = !this.softwareRenderer;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // A dim, prefiltered environment gives metal a readable reflection without
    // replacing the directional torch/moon lighting with flat ambient light.
    const environmentScene = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(environmentScene, .04);
    this.scene.environment = this.environment.texture; this.scene.environmentIntensity = .075;
    environmentScene.dispose(); pmrem.dispose();
    this.scene.background = new THREE.Color(0x080f16);
    this.scene.fog = new THREE.Fog(0x0a1520, 30, 76);
    this.materials = {
      floor: stoneMaterial(0xb5a896), wall: stoneMaterial(0x69665d, 18), trim: stoneMaterial(0x837f71, 31),
      dark: new THREE.MeshStandardMaterial({ color: 0x070c0e, roughness: .98 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xb38b47, metalness: .76, roughness: .38 }),
      runeGold: new THREE.MeshStandardMaterial({ color: 0x58624b, metalness: .45, roughness: .81 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x93a5a7, metalness: .75, roughness: .35 }),
      teal: new THREE.MeshStandardMaterial({ color: 0x187f8d, roughness: .83 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xa4a391, roughness: .89 }),
      crystalStone: crystalClusterMaterial(),
      crystal: new THREE.MeshStandardMaterial({ color: 0x29bcbf, emissive: 0x05c9e5, emissiveIntensity: 1.4, metalness: .3, roughness: .22 }),
      flame: new THREE.MeshStandardMaterial({ color: 0xff9218, emissive: 0xff6500, emissiveIntensity: 2, transparent: true, opacity: .94, toneMapped: false }),
    };
    if (this.softwareRenderer) for (const name of ['floor', 'wall', 'trim']) this.materials[name].bumpMap = null;
    const ambient = new THREE.HemisphereLight(0x7394aa, 0x15120f, .38); ambient.name = 'ambient'; this.scene.add(ambient);
    const moon = new THREE.DirectionalLight(0x6d8da5, 1.5);
    moon.position.set(-12, 24, -10); moon.castShadow = true;
    moon.shadow.mapSize.set(this.softwareRenderer ? 1024 : 2048, this.softwareRenderer ? 1024 : 2048); moon.shadow.camera.left = moon.shadow.camera.bottom = -23;
    moon.shadow.camera.right = moon.shadow.camera.top = 23; moon.shadow.camera.far = 80;
    moon.shadow.normalBias = .045; moon.shadow.bias = -.00015;
    this.scene.add(moon, moon.target);
    const fill = new THREE.DirectionalLight(0xc6d3cf, .48); fill.position.set(15, 12, 18); this.scene.add(fill);
    moon.name = 'moon';
    this.scene.add(this.floorGroup, this.enemyGroup, this.effectsGroup, this.propGroup, this.hero);
    for (const fragments of [this.stoneFragments, this.hotFragments]) { fragments.count = 0; fragments.setColorAt(0, new THREE.Color()); fragments.frustumCulled = false; fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(fragments); }
    this.heroVisual.scale.setScalar(ACTOR_SCALE); this.hero.add(this.heroVisual);
    this.heroLight.position.set(1.2, 3.1, 1.5); this.hero.add(this.heroLight);
    this.scene.add(this.burstLight);
    this.scene.add(...this.warmLights);
    this.scene.add(...this.recessLights);
    this.rune = new THREE.Mesh(new THREE.RingGeometry(.65, .70, 64), new THREE.MeshBasicMaterial({ color: 0x6ef6dd, transparent: true, opacity: .48, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.rune.rotation.x = -Math.PI / 2; this.rune.position.y = .06; this.hero.add(this.rune);
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    this.particleGeometry.setAttribute('particleScale', new THREE.BufferAttribute(this.particleScales, 1));
    this.particleGeometry.setDrawRange(0, 0);
    // Orthographic cameras use pixel-sized points, unlike perspective particles.
    this.particleMaterial = new THREE.PointsMaterial({ size: 9, map: glowTexture(), transparent: true, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false, toneMapped: false });
    this.particleMaterial.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float particleScale;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * particleScale;');
    };
    const points = new THREE.Points(this.particleGeometry, this.particleMaterial); points.frustumCulled = false; this.scene.add(points);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800, 500), .36, .5, 1.25);
    this.bloom.enabled = !this.softwareRenderer;
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.moveMarker = new THREE.Mesh(new THREE.RingGeometry(.28, .36, 40), new THREE.MeshBasicMaterial({ color: 0xe9c983, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.moveMarker.rotation.x = -Math.PI / 2; this.moveMarker.position.y = .05; this.scene.add(this.moveMarker);
    this.floorLoot = new FloorLoot(this.glowMap); this.scene.add(this.floorLoot.group); this.scene.add(this.breakableDebris.group);
    this.boonAura = new BoonAura(this.glowMap); this.scene.add(this.boonAura.group);
    this.hero.add(this.ward.mesh); this.scene.add(this.damageNumbers.group);
    this.installExploreInput();
    this.setEncounter(0); this.resize();
  }

  /** True while the hero may move: in combat too, except while a cast roots the hero or a panel is open. */
  get exploring(): boolean { return !this.rooted && !this.paused; }

  private get rooted(): boolean { return this.attacking && this.attackAge < this.castRoot; }

  private installExploreInput(): void {
    const signal = this.inputAbort.signal, ray = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const floorPoint = (event: PointerEvent) => {
      const bounds = this.canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1), this.camera);
      return ray.ray.intersectPlane(floor, new THREE.Vector3()) ?? undefined;
    };
    const steer = (event: PointerEvent, marker: boolean) => {
      const point = floorPoint(event); if (!point) return;
      this.breakTarget = undefined;
      this.walkTo(point.x, point.z);
      if (marker) { this.moveMarker.position.set(point.x, .05, point.z); this.moveMarker.userData.shownAt = this.elapsed; }
    };
    /** The whole breakable under the pointer, nearest the camera. */
    const breakableAt = (event: PointerEvent): Feature | undefined => {
      if (!floorPoint(event) || !this.level) return undefined;
      const hero = this.hero.position, center = new THREE.Vector3();
      let best: Feature | undefined, nearest = Infinity;
      for (const feature of this.level.breakables) {
        if (feature.opened || Math.hypot(feature.x - hero.x, feature.z - hero.z) > 30) continue;
        const height = breakableHeight(feature);
        // Test two points up the body, so the top and the foot both take a click.
        for (const y of [height * .3, height * .75]) {
          center.set(feature.x, y, feature.z);
          const along = ray.ray.origin.distanceTo(center);
          if (ray.ray.distanceToPoint(center) < feature.radius * feature.scale + .14 && along < nearest) { nearest = along; best = feature; }
        }
      }
      return best;
    };
    /** A closed chest, a sleeping shrine, a sealed door or the way down under the pointer. */
    const interactAt = (event: PointerEvent): { x: number; z: number; walk?: { x: number; z: number } } | undefined => {
      if (!floorPoint(event) || !this.level) return undefined;
      const hero = this.hero.position, center = new THREE.Vector3();
      const spots = [
        ...this.level.chests.filter(chest => !chest.opened).map(chest => ({ x: chest.x, z: chest.z, radius: chest.radius + .2, height: .9 })),
        ...this.level.shrines.filter(shrine => !shrine.opened).map(shrine => ({ x: shrine.x, z: shrine.z, radius: shrine.radius + .2, height: 2.2 })),
        ...this.level.doors.filter(door => !door.opened).map(door => {
          // The walk ends on the hall side of the slab, where the door asks its problem.
          const back = DOOR_FRONT[door.side];
          return { x: door.x, z: door.z, radius: door.width / 2, height: 2.6, walk: { x: door.x + back.x * 1.4, z: door.z + back.z * 1.4 } };
        }),
        ...(this.descent ? [{ x: this.descent.at.x, z: this.descent.at.z, radius: DESCENT_ENTER_RADIUS + .4, height: 1.2 }] : []),
      ];
      let best: { x: number; z: number; walk?: { x: number; z: number } } | undefined, nearest = Infinity;
      for (const spot of spots) {
        if (Math.hypot(spot.x - hero.x, spot.z - hero.z) > 30) continue;
        for (const y of [spot.height * .2, spot.height * .6, spot.height]) {
          center.set(spot.x, y, spot.z);
          const along = ray.ray.origin.distanceTo(center);
          if (ray.ray.distanceToPoint(center) < spot.radius && along < nearest) { nearest = along; best = spot; }
        }
      }
      return best;
    };
    this.canvas.addEventListener('pointerdown', event => {
      if (!this.exploring || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const target = breakableAt(event);
      if (target) { this.targetBreakable(target); return; }
      const spot = interactAt(event);
      if (spot) {
        // Walk up to it; the lock asks for its problem (or the way down opens) on arrival.
        const goal = spot.walk ?? spot;
        this.breakTarget = undefined; this.pointerSteering = false; this.walkTo(goal.x, goal.z);
        this.moveMarker.position.set(spot.x, .05, spot.z); this.moveMarker.userData.shownAt = this.elapsed;
        return;
      }
      this.pointerSteering = true; this.canvas.setPointerCapture(event.pointerId); steer(event, true);
    }, { signal });
    this.canvas.addEventListener('pointermove', event => {
      if (this.pointerSteering && this.exploring) { steer(event, false); return; }
      if (event.pointerType === 'mouse') this.canvas.style.cursor = this.exploring && (breakableAt(event) || interactAt(event)) ? 'pointer' : '';
    }, { signal });
    const release = () => { this.pointerSteering = false; };
    this.canvas.addEventListener('pointerup', release, { signal });
    this.canvas.addEventListener('pointercancel', release, { signal });
    const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    window.addEventListener('keydown', event => {
      // The digit-only answer box keeps no use for arrows, so they steer the hero.
      const typing = (event.target instanceof HTMLInputElement && !event.target.dataset.steer) || event.target instanceof HTMLTextAreaElement;
      if (!ARROWS.includes(event.key) || typing) return;
      if (!this.exploring) return;
      event.preventDefault(); this.exploreKeys.add(event.key); this.exploreRoute.length = 0; this.breakTarget = undefined;
    }, { signal });
    window.addEventListener('keyup', event => { this.exploreKeys.delete(event.key); }, { signal });
    window.addEventListener('blur', () => { this.exploreKeys.clear(); this.pointerSteering = false; }, { signal });
  }

  /** A director event: a rush ends in a swing, the blade meets the ward, the ward throws the enemy back. */
  private hordeEvent(kind: 'swing' | 'impact' | 'recoil', enemy: Enemy | undefined): void {
    if (!enemy || enemy.dead) return;
    if (kind === 'swing') { enemy.clips?.play('attack'); this.onSound?.('swing'); return; }
    if (kind === 'recoil') { enemy.clips?.play(Math.sin(enemy.phase * 3.1) > 0 ? 'hit' : 'hit-side'); return; }
    const chest = this.hero.position.clone().setY(1.05), from = enemy.root.position.clone().setY(enemy.brute ? 1.7 : 1.2);
    this.ward.flash(from, this.elapsed);
    const contact = chest.clone().add(from.clone().sub(chest).setLength(1.15));
    this.emit(contact, 0xbff2ff, enemy.brute ? 16 : 10, 1.6, .35);
    this.burstLight.position.copy(contact); this.burstLight.color.setHex(0x9fe8ff); this.burstLight.intensity = Math.max(this.burstLight.intensity, 14);
    this.shake = Math.max(this.shake, enemy.brute ? .1 : .05);
    this.onSound?.('ward');
  }

  /**
   * A correct answer is known at once, but the cast waits for the server.
   * Gather the spell in the hero's hand meanwhile, so the answer feels instant.
   */
  anticipate(spellId: string): void {
    if (this.disposed || this.attacking || this.charge || !this.engageReady) return;
    const spell = RPG_SPELLS.find(spell => spell.id === spellId);
    const color = spell?.effect === 'cleave' ? 0xe8f0ff : spell?.school === 'frost' ? 0x8bdef1 : spell?.school === 'storm' ? 0x9ab8ff : 0xff9a3c;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowMap, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sprite.renderOrder = 5; sprite.scale.setScalar(.01); this.scene.add(sprite);
    this.charge = { sprite, startedAt: this.elapsed, color };
    if (spell && spell.effect !== 'cleave') this.onSound?.(`charge-${spell.school}`);
  }

  private handPosition(target = new THREE.Vector3()): THREE.Vector3 {
    const marker = this.heroVisual.getObjectByName('CastOrigin');
    if (marker) return marker.getWorldPosition(target);
    return this.heroVisual.localToWorld(target.set(-.28, 1.24, .32));
  }

  private updateCharge(delta: number): void {
    const charge = this.charge; if (!charge) return;
    const age = this.elapsed - charge.startedAt;
    // A failed request never leaves a glow behind.
    if (this.attacking || age > 3) { this.releaseCharge(!this.attacking); return; }
    const hand = this.handPosition(), grow = Math.min(1, age / .4);
    charge.sprite.position.copy(hand);
    charge.sprite.scale.setScalar((.25 + grow * .75) * (1 + Math.sin(age * 38) * .08));
    charge.sprite.material.opacity = .55 + grow * .45;
    // Motes of the element converge on the hand.
    if (Math.random() < delta * 40) {
      const from = new THREE.Vector3(Math.random() - .5, Math.random() * .8 - .2, Math.random() - .5).normalize().multiplyScalar(1 + Math.random() * .4);
      this.directedParticle(hand.clone().add(from), from.clone().multiplyScalar(-3.2), charge.color, .3, .3);
    }
    this.burstLight.position.copy(hand); this.burstLight.color.setHex(charge.color);
    this.burstLight.intensity = Math.max(this.burstLight.intensity, 6 + grow * 10);
  }

  private releaseCharge(quietly = false): void {
    const charge = this.charge; if (!charge) return;
    this.charge = undefined;
    if (!quietly) this.emit(charge.sprite.position.clone(), charge.color, 14, 1.4, .35);
    this.scene.remove(charge.sprite); charge.sprite.material.dispose();
  }

  /** In combat the hero watches the enemy that strikes, or else the horde. */
  private combatFocusHeading(): number {
    const living = this.enemies.filter(enemy => !enemy.dead);
    if (!living.length) return this.heroVisual.rotation.y;
    const striker = living.find(enemy => enemy.id === this.horde.striker);
    const focus = striker?.at ?? living.reduce((sum, enemy) => sum.add(enemy.at), new THREE.Vector3()).divideScalar(living.length);
    return Math.atan2(focus.x - this.hero.position.x, focus.z - this.hero.position.z);
  }

  /** Free-movement order, as from a click on the floor. Ignored while a cast roots the hero. */
  walkTo(x: number, z: number): void {
    if (!this.exploring) return;
    this.exploreRoute = (this.level?.path({ x: this.hero.position.x, z: this.hero.position.z }, { x, z }) ?? [])
      .map(point => new THREE.Vector3(point.x, 0, point.z));
  }

  /**
   * Resolves when the search ends: the hero engaged the horde, or reached a
   * closed chest first. Either one may show the waiting problem.
   */
  waitForEngage(): Promise<SearchEnd> {
    if (this.engageReady || !this.enemies.some(enemy => !enemy.dead)) return Promise.resolve({});
    return new Promise(resolve => this.engageWaiters.push(resolve));
  }

  /** The chest unlocked: the lid swings up, gold and souls spill out. */
  openChest(id: string): void {
    const feature = this.level?.chests.find(chest => chest.id === id);
    if (!feature || feature.opened) return;
    feature.opened = true; this.chestOpenings.set(id, this.elapsed);
    const at = new THREE.Vector3(feature.x, .7, feature.z);
    this.onSound?.('chest-open');
    this.schedule(.28, () => {
      this.emit(at.clone().setY(1), 0xffc860, 46, 2.2, 1.1);
      this.emit(at.clone().setY(.9), 0xfff0b8, 18, 1.2, .7);
      this.burstLight.position.copy(at).setY(1.6); this.burstLight.color.setHex(0xffc460); this.burstLight.intensity = 46;
      this.floorLoot.dropMotes(at.clone().setY(.1), 7, this.elapsed);
    });
  }

  /** Opens the way down where the guardian stood. Returns where it is. */
  openDescent(): { x: number; z: number } | undefined {
    if (this.descent) return { x: this.descent.at.x, z: this.descent.at.z };
    const level = this.level; if (!level) return undefined;
    // Where the guardian fell, kept clear of the altar; else the sanctum's heart, else beside the hero.
    const boss = this.encounter === 5 ? this.enemies.find(enemy => enemy.id === 'enemy-0') : undefined;
    const sanctum = this.packArea?.kind === 'sanctum' ? this.packArea : level.areas.find(area => area.kind === 'sanctum');
    let spot = boss && level.walkable(boss.at.x, boss.at.z, 1) ? { x: boss.at.x, z: boss.at.z } : sanctum ? farPoint(sanctum, 7.2) : { x: this.hero.position.x, z: this.hero.position.z - 3 };
    const altar = level.areas.flatMap(area => area.features).find(feature => feature.kind === 'altar' && Math.hypot(feature.x - spot.x, feature.z - spot.z) < 5);
    if (altar && sanctum) spot = farPoint(sanctum, 7.2);
    const frost = this.regionId.includes('frost'), storm = this.regionId.includes('storm'), ember = this.regionId.includes('ember');
    const color = frost ? 0x6fd8ff : storm ? 0xa58bff : ember ? 0xff8a3c : 0x3fc6d8;
    const portal = createDescentPortal(color, this.glowMap, this.materials.trim, this.materials.gold);
    const at = new THREE.Vector3(spot.x, 0, spot.z);
    portal.group.position.copy(at); this.scene.add(portal.group);
    this.descent = { portal, at, openedAt: this.elapsed, waiters: [], entered: false };
    this.prepareNextLevel();
    this.emit(at.clone().setY(.6), color, 40, 2.4, 1.2);
    this.burstLight.position.copy(at).setY(2); this.burstLight.color.setHex(color); this.burstLight.intensity = 50;
    this.renderer.shadowMap.needsUpdate = true;
    return { x: at.x, z: at.z };
  }

  /** Resolves true when the hero walks into the open way down, false if it closes first. */
  waitForDescent(): Promise<boolean> {
    const descent = this.descent;
    if (!descent) return Promise.resolve(false);
    return new Promise(resolve => descent.waiters.push(resolve));
  }

  private updateDescent(delta: number): void {
    const descent = this.descent; if (!descent) return;
    descent.portal.update(this.elapsed - descent.openedAt, delta);
    const hero = this.hero.position;
    if (descent.entered || this.paused || !descent.waiters.length || Math.hypot(hero.x - descent.at.x, hero.z - descent.at.z) > DESCENT_ENTER_RADIUS) return;
    descent.entered = true; this.exploreRoute.length = 0;
    this.emit(descent.at.clone().setY(1), descent.portal.light.color.getHex(), 60, 3, 1.1);
    this.burstLight.position.copy(descent.at).setY(2.4); this.burstLight.color.copy(descent.portal.light.color); this.burstLight.intensity = 80;
    this.onSound?.('relic-drop');
    const waiters = descent.waiters; descent.waiters = [];
    waiters.forEach(resolve => resolve(true));
  }

  /** Starts the next level now, so stepping into it does not wait on its floor. */
  private prepareNextLevel(): void {
    this.discardNextLevel();
    const level = new Level(Math.floor(Math.random() * 2 ** 30), outdoorKind(this.regionId) ?? 'vault');
    level.guardianDistance = GUARDIAN_DISTANCE;
    level.expandAround(level.start.x, level.start.z, 30); level.takeChanges();
    this.nextLevel = { level, regionId: this.regionId, chunks: new Map() };
  }

  /** One chunk per call, nearest the next level's entry first. */
  private prebuildNextLevel(): void {
    const next = this.nextLevel; if (!next) return;
    const start = next.level.start, near = (rect: Rect) => Math.hypot(Math.max(rect.minX - start.x, 0, start.x - rect.maxX), Math.max(rect.minZ - start.z, 0, start.z - rect.maxZ));
    const chunk = next.level.chunks.filter(candidate => !next.chunks.has(candidate.key) && near(candidate.bounds) < 36)
      .sort((a, b) => near(a.bounds) - near(b.bounds))[0];
    if (chunk) next.chunks.set(chunk.key, buildChunk({ ...this.chunkContext, level: next.level }, chunk));
  }

  private discardNextLevel(): void {
    this.nextLevel?.chunks.forEach(disposeChunk);
    this.nextLevel = undefined;
  }

  private closeDescent(): void {
    this.descent?.portal.dispose();
    this.descent?.waiters.forEach(resolve => resolve(false));
    this.descent = undefined;
  }

  /** The door's rune flares, then the slab grinds down into the floor and the hallway opens. */
  openDoor(id: string): void {
    const level = this.level, door = level?.doors.find(candidate => candidate.id === id);
    if (!level || !door || door.opened) return;
    level.openDoor(id); this.lockOpenings.set(`door:${id}`, this.elapsed);
    this.onSound?.('door-open');
    const at = new THREE.Vector3(door.x, 0, door.z);
    this.emit(at.clone().setY(1.7), 0xffc45a, 22, .9, .8);
    this.schedule(DOOR_FLARE_SECONDS, () => {
      this.shake = Math.max(this.shake, .18);
      for (let n = 0; n < 4; n++) this.schedule(n * .35, () => this.emit(at.clone().setY(.15), 0x8f8676, 14, .7, 1.1));
    });
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** The shrine's crystal flares and its light passes to the hero as a boon. */
  activateShrine(id: string, boon: RpgBoonId): void {
    const feature = this.level?.shrines.find(shrine => shrine.id === id);
    if (!feature || feature.opened) { this.setBoon(boon); return; }
    feature.opened = true; this.lockOpenings.set(`shrine:${id}`, this.elapsed);
    this.onSound?.('shrine-activate');
    const color = boonColor(boon).getHex(), at = new THREE.Vector3(feature.x, 2.05, feature.z);
    this.emit(at, color, 30, 1.1, 1.2);
    this.burstLight.position.copy(at); this.burstLight.color.setHex(color); this.burstLight.intensity = 30;
    this.schedule(.45, () => { this.emit(this.hero.position.clone().setY(1), color, 18, .8, .9); this.setBoon(boon); });
    if (shrineAmbush(id)) this.schedule(1.3, () => this.ambush(feature.x, feature.z));
  }

  /**
   * The pack bursts up out of the floor in a ring round a point and the fight
   * starts there. The server's encounter is unchanged; only where it is met.
   */
  private ambush(x: number, z: number): void {
    const level = this.level, living = this.enemies.filter(enemy => !enemy.dead);
    if (!level || this.engaged || !living.length || this.encounter === 5) return;
    const spots: { x: number; z: number }[] = [];
    for (let ring = 0; ring < 4 && spots.length < living.length; ring++) {
      const radius = 3.4 + ring * 1.1, count = Math.ceil(radius * 2.2);
      for (let n = 0; n < count && spots.length < living.length; n++) {
        const angle = (n + ring * .5) / count * Math.PI * 2, at = { x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius };
        if (level.walkable(at.x, at.z, .58) && level.clearLine({ x, z }, at, .3)
          && spots.every(other => Math.hypot(other.x - at.x, other.z - at.z) >= MIN_ENEMY_SPACING + .3)) spots.push(at);
      }
    }
    // Too little room here: the pack keeps waiting where it was.
    if (spots.length < living.length) return;
    this.packArea = level.areaAt(x, z) ?? this.packArea; this.packSeenAt = this.elapsed;
    const hero = this.hero.position;
    living.forEach((enemy, index) => {
      const at = spots[index]!;
      enemy.origin.set(at.x, 0, at.z); enemy.at.copy(enemy.origin); enemy.root.position.copy(enemy.at);
      enemy.root.rotation.y = Math.atan2(hero.x - at.x, hero.z - at.z);
      this.emit(enemy.at.clone().setY(.3), 0x6b4a8f, 16, 1.1, .8);
      this.emit(enemy.at.clone().setY(.1), 0x8f8676, 10, .7, 1);
    });
    this.batchEnemies();
    this.burstLight.position.set(x, 2, z); this.burstLight.color.setHex(0x9d6bd8); this.burstLight.intensity = 40;
    this.shake = Math.max(this.shake, .22);
    this.onSound?.('alert');
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** A boon's calm glow on the hero, and Swiftness's quicker run; null ends it. */
  setBoon(boon: RpgBoonId | null): void {
    this.boon = boon;
    this.boonAura.set(boon ? boonColor(boon) : null);
  }

  /** Lids swing, doors sink, shrines turn, and a closed lock within reach ends the search. */
  private updateLocks(): void {
    for (const built of this.chunks.values()) {
      for (const chest of built.chests) {
        const { feature, hinge, glow } = chest;
        const started = this.chestOpenings.get(feature.id);
        if (hinge) {
          // An overshoot and settle, like a heavy lid thrown back.
          const t = started === undefined ? (feature.opened ? 1 : 0) : Math.min(1, (this.elapsed - started) / .55);
          const ease = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
          hinge.rotation.x = CHEST_OPEN_ANGLE * (feature.opened ? ease : 0);
        }
        glow.visible = !feature.opened;
        if (glow.visible) { glow.material.opacity = .32 + .22 * Math.sin(this.elapsed * 3 + feature.x); glow.scale.setScalar(1.2 + .15 * Math.sin(this.elapsed * 2.2 + feature.z)); }
      }
      for (const door of built.doors) animateDoor(door, this.elapsed, this.lockOpenings.get(`door:${door.door.id}`));
      for (const shrine of built.shrines) animateShrine(shrine, this.elapsed, this.lockOpenings.get(`shrine:${shrine.feature.id}`));
    }
    const level = this.level; if (!level) return;
    const near = this.lockNear(1);
    if (this.lockAsked && near?.key !== this.lockAsked && !this.lockNear(2.1, this.lockAsked)) this.lockAsked = undefined;
    if (near && near.key !== this.lockAsked && !this.engaged && this.engageWaiters.length && !this.paused) {
      this.lockAsked = near.key; this.exploreRoute.length = 0; this.pointerSteering = false;
      const waiters = this.engageWaiters; this.engageWaiters = [];
      waiters.forEach(resolve => resolve({ lock: near.target }));
    }
  }

  /** Walks to a breakable and smashes it on arrival, or at once when it is within reach. */
  private targetBreakable(feature: Feature): void {
    if (this.breakableInReach(feature)) { this.smash(feature); return; }
    this.breakTarget = feature.id; this.pointerSteering = false;
    // Walk to the near side of it, close enough to swing.
    const hero = this.hero.position, away = Math.atan2(hero.x - feature.x, hero.z - feature.z), reach = feature.radius * feature.scale + HERO_RADIUS + .3;
    this.walkTo(feature.x + Math.sin(away) * reach, feature.z + Math.cos(away) * reach);
    this.moveMarker.position.set(feature.x, .05, feature.z); this.moveMarker.userData.shownAt = this.elapsed;
  }

  private breakableInReach(feature: Feature, extra = .55): boolean {
    return Math.hypot(feature.x - this.hero.position.x, feature.z - this.hero.position.z) < feature.radius * feature.scale + HERO_RADIUS + extra;
  }

  /** The hero swings; the breakable bursts into pieces and is no longer in the way. */
  private smash(feature: Feature): void {
    const level = this.level; if (!level || !level.breakFeature(feature.id)) return;
    if (this.breakTarget === feature.id) { this.breakTarget = undefined; this.exploreRoute.length = 0; }
    const heading = Math.atan2(feature.x - this.hero.position.x, feature.z - this.hero.position.z);
    if (!this.attacking) { setPlanarHeroHeading(this.heroVisual.rotation, heading); this.heroAnimator?.play('cleave'); }
    this.schedule(this.attacking ? 0 : .2, () => {
      for (const built of this.chunks.values()) for (const piece of built.breakables ?? []) if (piece.feature === feature) piece.object.removeFromParent();
      const at = new THREE.Vector3(feature.x, breakableHeight(feature) * .45, feature.z);
      this.breakableDebris.burst(feature, this.hero.position, (x, z) => level.isFloor(Math.floor(x), Math.floor(z)));
      const urn = feature.kind === 'urn';
      // A bright crack at the blow, then a cloud of dust that hangs a moment.
      this.emit(at, 0xfff0d0, 10, 2.4, .25);
      this.emit(at, urn ? 0xe0a882 : 0xd9c3a0, 28, 1.7, .75);
      this.emit(at.clone().setY(.2), 0x9a8a74, 22, .8, 1.3);
      this.burstLight.position.copy(at).setY(1.1); this.burstLight.color.setHex(0xffd9a0); this.burstLight.intensity = Math.max(this.burstLight.intensity, 10);
      this.shake = Math.max(this.shake, .035);
      this.renderer.shadowMap.needsUpdate = true;
      this.onSound?.(urn ? 'break-pottery' : 'break-wood');
      this.onBreak?.(feature.id);
    });
  }

  /** The server said a broken breakable held forge dust: a glint of gold that flies to the hero. */
  showBreakDust(id: string): void {
    const feature = this.level?.breakables.find(entry => entry.id === id); if (!feature) return;
    const at = new THREE.Vector3(feature.x, .5, feature.z);
    this.emit(at, 0xffd88a, 26, 1.1, .9);
    this.burstLight.position.copy(at).setY(1.2); this.burstLight.color.setHex(0xffcf73); this.burstLight.intensity = Math.max(this.burstLight.intensity, 18);
    for (let i = 0; i < 14; i++) this.schedule(.15 + i * .03, () => {
      const hand = this.hero.position.clone().setY(1.1), from = at.clone().add(new THREE.Vector3((Math.random() - .5) * .4, Math.random() * .5, (Math.random() - .5) * .4));
      this.directedParticle(from, hand.sub(from).multiplyScalar(2.4), 0xffe2a0, .42, .32);
    });
    this.schedule(.55, () => this.onSound?.('dust-pickup'));
  }

  /** A target reached, or a breakable walked into with the arrow keys; elite auras; flying pieces. */
  private updateBreakables(delta: number): void {
    const level = this.level;
    if (level && this.exploring) {
      const target = this.breakTarget ? level.breakables.find(feature => feature.id === this.breakTarget) : undefined;
      if (target && !target.opened && this.breakableInReach(target)) this.smash(target);
      else if (this.breakTarget && (!target || target.opened || !this.exploreRoute.length)) {
        // The walk ended as near as the floor allows: a long swing still reaches it.
        if (target && !target.opened && this.breakableInReach(target, 1.3)) this.smash(target);
        this.breakTarget = undefined;
      }
      if (this.exploreKeys.size) {
        const facing = this.heroVisual.rotation.y, hero = this.hero.position;
        const bumped = level.breakables.find(feature => !feature.opened && this.breakableInReach(feature, .12)
          && Math.cos(Math.atan2(feature.x - hero.x, feature.z - hero.z) - facing) > .5);
        if (bumped) this.smash(bumped);
      }
    }
    for (const enemy of this.enemies) {
      if (!enemy.elite) continue;
      enemy.elite.aura.update(this.elapsed, delta, !enemy.dead);
      // Gold embers rise around a living elite, so it stands out in a crowd.
      if (!enemy.dead && enemy.root.visible && Math.random() < delta * 16) {
        const angle = Math.random() * Math.PI * 2, radius = (enemy.brute ? 1.1 : .62) * (.7 + Math.random() * .5);
        const from = enemy.root.position.clone().add(new THREE.Vector3(Math.cos(angle) * radius, .1 + Math.random() * enemy.height * .5, Math.sin(angle) * radius));
        this.directedParticle(from, new THREE.Vector3(-Math.cos(angle) * .25, .9 + Math.random() * .8, -Math.sin(angle) * .25), Math.random() < .3 ? 0xfff0c0 : ELITE_COLOR, .8 + Math.random() * .5, .22 + Math.random() * .16);
      }
    }
    this.breakableDebris.update(delta);
  }

  /**
   * The closed lock within reach of the hero, if any; `scale` widens the
   * reach (to tell when the hero has walked away), `only` limits it to one lock.
   */
  private lockNear(scale: number, only?: string): { key: string; target: LockTarget } | undefined {
    const level = this.level; if (!level) return undefined;
    const hero = this.hero.position, reach = (x: number, z: number, radius: number) => Math.hypot(x - hero.x, z - hero.z) < radius;
    const candidates: { key: string; target: LockTarget; within: boolean }[] = [
      ...level.chests.filter(chest => !chest.opened).map(chest => ({ key: `chest:${chest.id}`, target: { kind: 'chest' as const, id: chest.id }, within: reach(chest.x, chest.z, (chest.radius + LOCK_REACH) * scale) })),
      ...level.shrines.filter(shrine => !shrine.opened).map(shrine => ({ key: `shrine:${shrine.id}`, target: { kind: 'shrine' as const, id: shrine.id }, within: reach(shrine.x, shrine.z, (shrine.radius + LOCK_REACH) * scale) })),
      // A door asks from its hall side, where the hero stops against the slab.
      ...level.doors.filter(door => !door.opened).map(door => {
        const r = door.rect, gap = Math.hypot(Math.max(r.minX - hero.x, 0, hero.x - r.maxX), Math.max(r.minZ - hero.z, 0, hero.z - r.maxZ));
        return { key: `door:${door.id}`, target: { kind: 'door' as const, id: door.id }, within: gap < LOCK_REACH * scale };
      }),
    ];
    return candidates.find(candidate => candidate.within && (!only || candidate.key === only));
  }

  /** The hero stands in the guardian's sanctum. */
  get inSanctum(): boolean { return this.level?.areaAt(this.hero.position.x, this.hero.position.z)?.kind === 'sanctum'; }

  /** The hero stands at the combat mark with the horde in formation. */
  get combatReady(): boolean { return this.engageReady || !this.enemies.some(enemy => !enemy.dead); }

  /** The level, hero and pack as the minimap and the pack's idle sounds need them. */
  get scout(): (ScoutView & { level: Level }) | undefined {
    const level = this.level; if (!level) return undefined;
    const living = this.enemies.filter(enemy => !enemy.dead);
    const pack = living.length ? { x: living.reduce((sum, enemy) => sum + enemy.at.x, 0) / living.length, z: living.reduce((sum, enemy) => sum + enemy.at.z, 0) / living.length } : undefined;
    return { level, areas: level.areas, corridors: level.corridors, openExits: level.openExits, chests: level.chests,
      hero: { x: this.hero.position.x, z: this.hero.position.z }, heading: this.heroVisual.rotation.y, pack, packArea: pack ? this.packArea?.id : undefined,
      packOnScreen: this.elapsed - this.packSeenAt < 1, guardian: this.encounter === 5, sanctum: level.sanctum ? rectCenter(level.sanctum.rect) : undefined, engaged: this.engaged, searching: this.engageWaiters.length > 0 && !this.paused };
  }

  /** Starts combat with the current horde now, as when the hero comes in sight of it. The hero keeps moving. */
  engage(): void {
    if (this.engaged) return;
    this.engaged = true; this.onSound?.('alert');
    if (this.enemies.some(enemy => enemy.elite && !enemy.dead)) this.onSound?.('elite-alert');
    // Spotted: the hero halts at the edge of the fight, then moves freely again.
    this.exploreRoute.length = 0; this.pointerSteering = false;
    this.finishEngage();
  }

  /**
   * Where an enemy holds while the fight is live: its formation point, unless
   * the hero moves away or into the formation. Then the horde closes in or
   * gives room, but never past a wall.
   */
  private enemyAnchor(enemy: Enemy): THREE.Vector3 {
    const hero = this.hero.position, away = enemy.origin.clone().sub(hero).setY(0), gap = away.length();
    const far = enemy.brute ? 5.6 : 4.8, near = enemy.brute ? 3.4 : 2.4;
    if (gap <= far && gap >= near) return enemy.origin;
    if (gap < 1e-3) away.set(0, 0, -1);
    const reach = gap > far ? far : near;
    for (const scale of [1, .8, .6, .45]) {
      const at = hero.clone().addScaledVector(away.clone().normalize(), reach * scale);
      if (this.level?.walkable(at.x, at.z, .48) && this.level.clearLine(hero, at, .3)) return at;
    }
    return enemy.origin;
  }

  private finishEngage(): void {
    if (this.engageReady) return;
    this.engageReady = true; this.horde.reset(this.elapsed);
    const waiters = this.engageWaiters; this.engageWaiters = [];
    waiters.forEach(resolve => resolve({}));
  }

  async load(): Promise<void> {
    performance.mark('dungeon-load-start');
    const loader = new GLTFLoader();
    await Promise.all([TRIPO_HERO_MODEL, 'imp', 'guardian', 'vault-guardian-boss', 'arch', 'pillar', 'masonry-pier', 'masonry-post', 'brazier', 'crystal', 'chest', 'wall-bay', 'broken-wall', 'skeleton', 'revenant', 'wraith', 'furnace', 'reliquary', 'ice_cluster', ...Object.values(ITEM_MODELS).map(item => item.model)].map(async name => {
      try {
        const gltf = await loader.loadAsync(`/assets/rpg/${name}.glb`);
        if (this.disposed) return;
        if (name === TRIPO_HERO_MODEL) this.heroClipSets.set(name, gltf.animations);
        else if (gltf.animations.length && ['skeleton', 'revenant', 'guardian', 'vault-guardian-boss'].includes(name)) this.enemyClipSets.set(name, gltf.animations);
        gltf.scene.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true; object.receiveShadow = name !== TRIPO_HERO_MODEL && !name.startsWith('items/') && !['skeleton', 'revenant', 'wraith', 'guardian', 'vault-guardian-boss', 'imp'].includes(name);
            if (name === TRIPO_HERO_MODEL || name.startsWith('items/') || ['skeleton', 'revenant', 'guardian', 'vault-guardian-boss', 'imp', 'wraith'].includes(name)) {
              for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (material instanceof THREE.MeshStandardMaterial) { material.envMap = this.environment.texture; material.envMapIntensity = name === TRIPO_HERO_MODEL || name.startsWith('items/') ? .55 : .225; }
              }
            }
            if (object.material instanceof THREE.MeshStandardMaterial && /glow_flame|glow_amber/.test(object.material.name)) {
              object.material.emissive.setHex(0xff780c); object.material.emissiveIntensity = name === 'furnace' ? .9 : 1.4; object.material.toneMapped = false;
            }
          }
        });
        this.models.set(name, gltf.scene); this.loadedModels++;
      } catch (error) {
        if (name === TRIPO_HERO_MODEL) throw new HeroAssetLoadError(error);
        // Optional scenery and enemies retain their procedural fallbacks.
      }
    }));
    performance.mark('dungeon-models-ready');
    try {
      const texture = await new THREE.TextureLoader().loadAsync('/assets/rpg/dungeon-cobbles-v2.png');
      texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
      const relief = floorRelief(texture.image);
      const floor = this.materials.floor;
      floor.map?.dispose(); floor.map = texture; floor.bumpMap = this.softwareRenderer ? null : relief.bump;
      floor.bumpScale = .13; floor.roughnessMap = relief.roughness; floor.roughness = .91; floor.metalness = .08; floor.needsUpdate = true;
      if (this.softwareRenderer) relief.bump.dispose();
    } catch { /* The procedural relief remains available if an asset is missing. */ }
    const replacedStoneTextures = new Set<THREE.Texture>();
    try {
      const loader = new THREE.TextureLoader();
      const [map, height, roughness] = await Promise.all(['albedo', 'height', 'roughness'].map(name => loader.loadAsync(`/assets/rpg/stone/${name}.png`)));
      map.colorSpace = THREE.SRGBColorSpace;
      for (const texture of [map, height, roughness]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8; }
      for (const [material, tint] of [[this.materials.wall, 0xb2b5ad], [this.materials.trim, 0xc9c7bc]] as const) {
        for (const texture of [material.map, material.bumpMap, material.roughnessMap]) if (texture) replacedStoneTextures.add(texture);
        material.map = map; material.bumpMap = this.softwareRenderer ? null : height;
        material.bumpScale = .16; material.roughnessMap = roughness; material.roughness = 1;
        material.color.setHex(tint); material.needsUpdate = true;
      }
      this.stoneSurfaceLoaded = true; this.updateStoneTint();
      if (this.softwareRenderer) height.dispose();
    } catch { /* Missing optional surface maps retain the fallback stone. */ }
    if (this.disposed) return;
    performance.mark('dungeon-textures-ready');
    replacedStoneTextures.forEach(texture => texture.dispose());
    this.setAppearance(this.desiredAppearance);
    this.enemies.forEach(enemy => {
      enemy.height = this.enemyHeight(enemy.modelId, enemy.height / ACTOR_SCALE) * ACTOR_SCALE;
      const visual = this.model(enemy.modelId, enemy.height) ?? (enemy.modelId === 'revenant' ? this.model('skeleton', enemy.height) : undefined);
      if (visual) { enemy.root.remove(enemy.visual); this.releaseProcedural(enemy.visual); enemy.visual = visual; enemy.root.add(visual); enemy.animator = new EnemyAnimator(visual, {kind: enemy.modelId, phase: enemy.phase}); enemy.clips = this.enemyClipAnimator(visual, enemy.modelId, enemy.height, enemy.phase); }
    });
    this.batchEnemies();
    // Props and authored piers now exist: rebuild the standing chunks with them.
    this.rebuildChunks();
    this.setEnvironment();
    this.renderer.shadowMap.needsUpdate = true;
    // Compile authored actors and uncommon effect programs during loading,
    // before a child's first cast would otherwise pay the shader setup cost.
    const warmup = new THREE.Group(); warmup.position.y = -1000;
    const warmMaterials: THREE.Material[] = [novaMaterial(), fireSheetMaterial(), firePlumeMaterial(0, 1), bladeWakeMaterial(), ashMaterial(), phoenixFeatherMaterial(), stormWispMaterial(0x7787a4), stormWispMaterial(0xa9bdff, true), lightningMaterial(0xa9bdff), ballLightningVolumeMaterial(), ballLightningFilamentMaterial(), ballLightningContactMaterial(), ballLightningContactMaterial(true), fireNovaFrontMaterial(), fireNovaVolumeMaterial()];
    warmMaterials.push(frostfallCrystalMaterial(), frostfallCrystalMaterial(true), frostfallContactMaterial());
    warmMaterials.push(cleaveEdgeMaterial(), steelBladeWakeMaterial());
    warmMaterials.push(chainLightningMaterial());
    const ignitionWarmup = createNovaIgnition();
    for (const layer of [ignitionWarmup.mesh, ignitionWarmup.seed]) { warmMaterials.push(layer.material); layer.geometry.dispose(); }
    for (const layer of createFireNovaContacts(1).layers) { warmMaterials.push(layer.material); layer.geometry.dispose(); }
    for (const material of warmMaterials) warmup.add(new THREE.Mesh(new THREE.PlaneGeometry(.01, .01), material));
    const summon = this.model('guardian', 4.5);
    summon?.traverse(object => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) { object.material = object.material.clone(); object.material.transparent = true; warmMaterials.push(object.material); } });
    if (summon) warmup.add(summon);
    this.scene.add(warmup);
    performance.mark('dungeon-scene-ready');
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch { /* Drivers without parallel compilation compile on first render. */ }
    this.scene.remove(warmup); this.preparedMaterials.push(...warmMaterials);
    performance.mark('dungeon-shaders-ready');
    for (const object of warmup.children) if (object instanceof THREE.Mesh) object.geometry.dispose();
    this.prepareSpellDraws();
    this.loadedAt = performance.now();
    performance.mark('dungeon-load-ready');
  }

  private prepareSpellDraws(): void {
    // compileAsync links surface programs but does not draw their instanced
    // geometry or shadow variants. Prepare those passes behind the loading
    // screen; no await may expose these temporary bindings to the normal RAF.
    const started = performance.now(), renderer = this.renderer;
    const target = this.composer.readBuffer.clone();
    target.setSize(this.softwareRenderer ? 128 : 512, this.softwareRenderer ? 128 : 512);
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace(), previousMip = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest(), shadowDirty = renderer.shadowMap.needsUpdate;
    const retainVariant = <T extends THREE.Material>(source: T): T => {
      const material = cloneErosionProgramMaterial(source);
      this.preparedMaterials.push(material);
      return material;
    };
    const retainSurface = (source: THREE.Material | THREE.Material[]) => Array.isArray(source) ? source.map(retainVariant) : retainVariant(source);
    const bindings = [...this.enemyInstances, ...this.skinnedEnemies].map(({ mesh, dissolve }) => ({
      mesh, material: mesh.material, depth: mesh.customDepthMaterial,
      electric: retainSurface(dissolve.materialFor('electric')),
      burn: retainSurface(dissolve.materialFor('burn')),
      warmDepth: retainVariant(dissolve.depth),
    }));
    const origin = this.hero.position.clone(), view = this.camera.getWorldDirection(new THREE.Vector3()).negate();
    const ignition = createNovaIgnition(), wave = createFireNova(8.8, 1, this.encounter);
    const contacts = createFireNovaContacts(Math.max(1, this.enemies.length), false, this.encounter);
    const ball = createBallLightning(1, 1 / renderer.getPixelRatio());
    const electricalContacts = createBallLightningContacts(Math.max(1, this.enemies.length));
    const frostCrystal = createFrostfallCrystal(), frostContact = createFrostfallContact();
    // Cleave's wake, contact flash, scorch and ash need the compositor's output
    // variant too; compileAsync alone leaves their first actual draw unprepared.
    const bladeWake = new THREE.Mesh(new THREE.PlaneGeometry(.5, .3), bladeWakeMaterial());
    // The live ribbon carries position/UV only. Three keys programs by normal
    // attribute presence even when this unlit shader never reads normals.
    bladeWake.geometry.deleteAttribute('normal');
    const steelWake = new THREE.Mesh(bladeWake.geometry.clone(), steelBladeWakeMaterial());
    const cuttingEdge = new THREE.Mesh(new THREE.PlaneGeometry(.5, .3), cleaveEdgeMaterial());
    cuttingEdge.geometry.deleteAttribute('normal');
    const ash = new THREE.Mesh(new THREE.CylinderGeometry(.3, .1, .2, 8, 1, true), ashMaterial());
    const fireStroke = new THREE.Mesh(new THREE.PlaneGeometry(.2, .1), new THREE.MeshBasicMaterial({ color: 0xffc875, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const fireFlash = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({ color: 0xffebbd, map: this.glowMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const scorch = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({ color: 0x32261b, alphaMap: this.glowMap, transparent: true, opacity: .2, depthWrite: false }));
    const discharge = new THREE.Mesh(lightningGeometry(origin.clone().setY(1.2), origin.clone().add(new THREE.Vector3(1.5, .9, -1)), .03, view, 1), lightningMaterial(0x7abaff));
    const chainDischarge = new THREE.Mesh(chainLightningGeometry(origin.clone().setY(1.2), origin.clone().add(new THREE.Vector3(-1.2, 1, -.8)), view, 7), chainLightningMaterial());
    const chainCharge = createChainCharge(); chainCharge.position.copy(origin).y += 1.3; chainCharge.quaternion.copy(this.camera.quaternion);
    const layers = [ignition.mesh, ignition.seed, ...wave.layers, ...contacts.layers, ...ball.layers, ...electricalContacts.layers, ...frostCrystal.layers, ...frostContact.layers, bladeWake, steelWake, cuttingEdge, ash, fireStroke, fireFlash, scorch, discharge, chainDischarge, chainCharge];
    const hand = origin.clone().setY(1.5), ground = origin.clone().setY(.06);
    this.heroVisual.getObjectByName('CastOrigin')?.getWorldPosition(hand);
    ignition.update(hand, ground, .13, new THREE.Vector3(.7, 0, 0));
    wave.update(origin, view, .3, this.elapsed);
    contacts.strike(0, origin, view.clone().setY(0).normalize(), this.elapsed, .9);
    contacts.update(this.elapsed + .07);
    ball.update(origin.clone().setY(1.2), view, .2, this.elapsed);
    electricalContacts.strike(0, origin.clone().setY(.9), view, this.elapsed);
    electricalContacts.update(this.elapsed + .04);
    frostCrystal.update(origin.clone().setY(1.8), new THREE.Vector3(.1, -1, 0), this.elapsed);
    frostContact.update(origin.clone().setY(.9), .15, this.elapsed);
    for (const mesh of [bladeWake, cuttingEdge, ash, fireStroke, fireFlash, scorch]) mesh.position.copy(origin).y = .8;
    bladeWake.material.uniforms.opacity.value = .5; cuttingEdge.material.uniforms.opacity.value = .5; ash.material.uniforms.opacity.value = .5;
    this.scene.add(...layers);
    try {
      renderer.setRenderTarget(target);
      renderer.setScissorTest(false);
      for (const style of [undefined, 'electric', 'burn'] as const) {
        for (const binding of bindings) {
          binding.mesh.material = style ? binding[style] : binding.material;
          binding.mesh.customDepthMaterial = style ? binding.warmDepth : binding.depth;
        }
        renderer.shadowMap.needsUpdate = true;
        renderer.render(this.scene, this.camera);
      }
      // Complete first-use driver work before the loading promise resolves.
      renderer.getContext().finish();
      this.drawWarmup = { programs: renderer.info.programs?.length ?? 0, durationMs: performance.now() - started };
    } finally {
      for (const binding of bindings) { binding.mesh.material = binding.material; binding.mesh.customDepthMaterial = binding.depth; }
      renderer.setRenderTarget(previousTarget, previousFace, previousMip);
      renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      renderer.shadowMap.needsUpdate = shadowDirty;
      this.scene.remove(...layers);
      // Keep material references: disposing them here can evict the very
      // programs that the first real cast should reuse.
      for (const layer of layers) { layer.geometry.dispose(); this.preparedMaterials.push(layer.material); }
      target.dispose(); renderer.info.reset();
    }
  }

  private enemyHeight(modelId: string, fallback: number): number {
    // Only the authored skeleton opts into a revised silhouette size. Preserve
    // the separate ordinary/boss and armored sizes supplied by the roster.
    if (modelId !== 'skeleton') return fallback;
    let height = fallback;
    this.models.get(modelId)?.traverse(node => {
      const proposed = node.userData.authoredEnemyHeight;
      if (node.userData.authoredEnemy === true && typeof proposed === 'number'
        && Number.isFinite(proposed) && proposed >= .5 && proposed <= 3) height = proposed;
    });
    return height;
  }

  private model(name: string, height: number): THREE.Group | undefined {
    const original = this.models.get(name); if (!original) return undefined;
    if (name === TRIPO_HERO_MODEL) return createTripoHeroInstance(original, height);
    let hasSkin = false; original.traverse(o => { if (o instanceof THREE.SkinnedMesh) hasSkin = true; });
    const clone = (hasSkin || name === 'hero' || name.startsWith('hero-') ? cloneSkeleton(original) : original.clone(true)) as THREE.Group;
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = height / Math.max(size.y, .01); clone.scale.multiplyScalar(scale);
    clone.position.y -= bounds.min.y * scale;
    if (['skeleton', 'revenant', 'guardian', 'vault-guardian-boss'].includes(name)) {
      // Keep imported floor alignment below the actor's whole-model motion.
      const actor = new THREE.Group(); actor.add(clone); return actor;
    }
    return clone;
  }

  /** Clip-driven animation for an enemy model that carries retargeted clips. */
  private enemyClipAnimator(visual: THREE.Object3D, modelId: string, height: number, phase: number): HeroAnimator | undefined {
    if (visual.userData.procedural) return undefined;
    const clips = this.enemyClipSets.get(modelId) ?? (modelId === 'revenant' && !this.models.has('revenant') ? this.enemyClipSets.get('skeleton') : undefined);
    if (!clips?.length) return undefined;
    const key = `${modelId}:${height.toFixed(2)}`;
    let gait = this.enemyGaits.get(key);
    if (!gait) {
      const clip = (name: string) => clips.find(clip => clip.name === name);
      gait = { walk: measureTripoWalkCycle(visual, clip('walk')), run: measureTripoWalkCycle(visual, clip('run')) };
      this.enemyGaits.set(key, gait);
    }
    const animator = new HeroAnimator(new THREE.AnimationMixer(visual), clips, gait, ENEMY_CLIP_ROLES);
    animator.desync(phase * 3.1); animator.update(0, 0);
    return animator;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; return mesh;
  }

  private makeEnemy(brute: boolean, boss: boolean, modelId = 'skeleton', height = brute ? (boss ? 3.8 : 2.5) : 1.65): THREE.Group {
    const model = this.model(modelId, height) ?? (modelId === 'revenant' ? this.model('skeleton', height) : undefined); if (model) return model;
    const group = new THREE.Group(), material = brute ? this.materials.wall : this.materials.bone;
    group.userData.procedural = true;
    group.add(this.mesh(new THREE.IcosahedronGeometry(.34, 0), material, 0, .7));
    group.add(this.mesh(new THREE.IcosahedronGeometry(.24, 1), material, 0, 1.14, .03));
    for (const sign of [-1, 1]) {
      const arm = this.mesh(new THREE.CylinderGeometry(.1, .13, .6, 5), material, sign * .4, .61); arm.rotation.z = sign * .3; group.add(arm);
      group.add(this.mesh(new THREE.CylinderGeometry(.09, .12, .48, 5), this.materials.dark, sign * .17, .24));
      group.add(this.mesh(new THREE.SphereGeometry(.043, 5, 4), this.materials.crystal, sign * .09, 1.18, .22));
      const horn = this.mesh(new THREE.ConeGeometry(.1, .4, 5), brute ? this.materials.crystal : this.materials.dark, sign * .2, 1.4); horn.rotation.z = -sign * .5; group.add(horn);
    }
    if (brute) {
      group.scale.setScalar(boss ? 2.8 : 1.65);
      for (let i = 0; i < 5; i++) { const spike = this.mesh(new THREE.ConeGeometry(.12, .65, 4), this.materials.crystal, (i - 2) * .19, 1.1 + Math.sin(i) * .14, -.28); spike.rotation.x = -.5; group.add(spike); }
    }
    group.scale.multiplyScalar(ACTOR_SCALE);
    return group;
  }

  private releaseProcedural(object: THREE.Object3D): void {
    if (object.userData.procedural) object.traverse(child => { if (child instanceof THREE.Mesh) child.geometry.dispose(); });
  }

  setCombatState(health: readonly RpgCombatEnemy[]): void {
    const byId = new Map(health.map(enemy => [enemy.id, enemy]));
    for (const enemy of this.enemies) {
      const current = byId.get(enemy.id);
      if (!current) continue;
      enemy.hp = current.hp; enemy.maxHp = current.maxHp;
      // A restored defeat has no animation to replay. A defeat just presented
      // by hitEnemy retains its settled body until its own cleanup completes.
      if (current.hp <= 0 && !enemy.dead) { enemy.dead = true; enemy.root.visible = false; }
    }
  }

  /**
   * `levelKey` names the expedition: a new one starts a fresh level. Packs
   * never run out, so a lower encounter number no longer means a new level.
   */
  setEncounter(index: number, regionId?: string, enemyCount?: number, health?: readonly RpgCombatEnemy[], levelKey?: string): void {
    const was = this.encounter, previousRegion = this.regionId, previousKey = this.levelKey;
    if (levelKey !== undefined) this.levelKey = levelKey;
    this.encounter = Math.max(0, Math.min(5, index));
    if (regionId) this.regionId = regionId;
    this.releaseEnemies();
    // A new expedition or a new region starts a fresh level.
    const fresh = !this.level || previousRegion !== this.regionId || (levelKey !== undefined ? levelKey !== previousKey : this.encounter < was);
    if (fresh) this.startLevel();
    else if (was !== this.encounter) {
      // The next pack waits somewhere ahead; the hero stays where the last fight ended.
      // A cleared area counts as explored even if the fight was won from its doorway.
      if (this.packArea) this.packArea.visited = true;
      this.engaged = this.engageReady = false; this.packArea = undefined; this.packSeenAt = -Infinity;
      this.floorLoot.forgetFarFrom(this.hero.position, 34);
    }
    // A hard population limit, independent of spell power and old receipt totals.
    const count = Math.max(1, Math.min(10, Math.trunc(health?.length ?? enemyCount ?? 10)));
    const roster = enemyRoster(this.encounter, count);
    for (let i = 0; i < count; i++) {
      const { brute, boss, modelId } = roster[i];
      const height = this.enemyHeight(modelId, roster[i].height) * ACTOR_SCALE;
      const root = new THREE.Group();
      const visual = this.makeEnemy(brute, boss, modelId, height); root.add(visual); this.enemyGroup.add(root);
      const enemy: Enemy = { id: `enemy-${i}`, hp: 100, maxHp: 100, root, visual, origin: new THREE.Vector3(), at: new THREE.Vector3(), speed: 0, phase: i * 1.77, brute, dead: false, modelId, height, deathAt: 0, animator: new EnemyAnimator(visual, { kind: modelId, phase: i * 1.77 }) };
      enemy.clips = this.enemyClipAnimator(visual, modelId, height, enemy.phase);
      this.enemies.push(enemy);
    }
    this.placePack();
    if (health) this.setCombatState(health);
    for (const enemy of this.enemies) if (health?.find(entry => entry.id === enemy.id)?.elite) this.makeElite(enemy);
    const ember = this.regionId.includes('ember') || this.regionId.includes('forge');
    const frost = this.regionId.includes('frost');
    const color = frost ? 0x49a4d2 : this.regionId.includes('storm') ? 0x7562c2 : 0x138cb6;
    this.materials.crystal.emissive.setHex(color);
    this.materials.crystal.color.setHex(color);
    this.materials.crystalStone.emissive.setHex(color);
    this.materials.crystalStone.color.setHex(frost ? 0xa5c5ce : this.regionId.includes('storm') ? 0xaaa5cb : 0x9db8b9);
    this.heroLight.color.setHex(0xd6e3f0);
    this.materials.floor.color.setHex(ember ? 0xb5a896 : frost ? 0x919fa7 : 0x9c96a3);
    this.updateStoneTint();
    this.scene.fog = new THREE.Fog(frost ? 0x06101a : 0x03090c, 38, 72);
    this.warmLights.forEach(light => light.color.setHex(0xff963f));
    this.setEnvironment();
    this.batchEnemies();
    this.updateCameraProjection(Math.max(1, this.canvas.clientWidth), Math.max(1, this.canvas.clientHeight));
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** The server's elite: larger, with a turning gold rune ring and a name of its own. */
  private makeElite(enemy: Enemy): void {
    enemy.visual.scale.multiplyScalar(ELITE_SCALE); enemy.height *= ELITE_SCALE;
    const aura = new EliteAura(this.glowMap, enemy.height, enemy.brute ? 1.1 : .62);
    enemy.root.add(aura.object);
    enemy.elite = { name: eliteName(enemy.modelId, Number(enemy.id.replace(/\D/g, '')) + this.encounter), aura };
  }

  private releaseEnemies(): void {
    this.enemies.forEach(enemy => enemy.elite?.aura.dispose());
    this.enemies.forEach(enemy => this.releaseProcedural(enemy.visual));
    this.releaseEnemyInstances();
    const skeletons = new Set<THREE.Skeleton>();
    for (const enemy of this.enemies) enemy.visual.traverse(object => { if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
    this.enemies.length = 0; this.enemyGroup.clear();
  }

  /** A fresh level for this region; the hero starts at its entry. */
  private startLevel(): void {
    this.closeDescent();
    for (const built of this.chunks.values()) disposeChunk(built);
    this.chunks.clear(); this.torches.length = 0; this.floatingRunes.length = 0;
    const biome = outdoorKind(this.regionId) ?? 'vault';
    const next = this.nextLevel?.regionId === this.regionId ? this.nextLevel : undefined;
    if (!next) this.discardNextLevel();
    this.nextLevel = undefined;
    this.level = next?.level ?? new Level(Math.floor(Math.random() * 2 ** 30), biome);
    this.level.guardianDistance = GUARDIAN_DISTANCE;
    const start = this.level.start;
    this.hero.position.set(start.x, 0, start.z); this.cameraTarget.copy(this.hero.position);
    this.engaged = this.engageReady = false; this.exploreRoute.length = 0;
    this.packArea = undefined; this.packSeenAt = -Infinity; this.heroArea = this.level.areas[0];
    this.floorLoot.clear(); this.breakableDebris.clear(); this.breakTarget = undefined;
    this.setEnvironment();
    // A level prepared behind the way down arrives already built.
    if (next) {
      for (const [key, built] of next.chunks) { this.floorGroup.add(built.group); this.chunks.set(key, built); this.torches.push(...built.torches); this.floatingRunes.push(...built.runes); }
      this.renderer.shadowMap.needsUpdate = true; this.lastLightsAt = -9;
    }
    this.streamLevel(Infinity);
    this.onAreaEnter?.(this.level.areas[0]!.name);
  }

  /** Streaming, area entry, pack placement, chests, lights and ground, at their own pace. */
  private updateLevel(delta: number): void {
    const level = this.level; if (!level) return;
    if (this.elapsed - this.lastStreamAt > .25) { this.lastStreamAt = this.elapsed; this.streamLevel(); }
    const area = level.areaAt(this.hero.position.x, this.hero.position.z);
    if (area && area !== this.heroArea) {
      this.heroArea = area;
      if (!area.visited) { area.visited = true; this.onAreaEnter?.(area.name); }
      // The game wakes the guardian here, once enough packs have fallen.
      if (area.kind === 'sanctum' && this.encounter !== 5) this.onSanctumEnter?.();
    }
    if (this.elapsed - this.lastPackCheckAt > .5) {
      this.lastPackCheckAt = this.elapsed;
      this.updatePack();
    }
    this.updateLocks();
    this.updateBreakables(delta);
    this.updateDescent(delta);
    this.prebuildNextLevel();
    if (this.elapsed - this.lastLightsAt > .5) { this.lastLightsAt = this.elapsed; this.updateLights(); }
    this.easeFraming(delta);
    // The wide ground moves in whole texture repeats, so its pattern stays put.
    if (this.outdoorGround) this.outdoorGround.position.set(Math.round(this.cameraTarget.x / 10) * 10, this.outdoorKit ? -.035 : -.09, Math.round(this.cameraTarget.z / 10) * 10);
  }

  private get chunkContext() {
    return { level: this.level!, regionId: this.regionId, materials: this.materials as unknown as VaultMaterials, outdoor: this.outdoorKit,
      model: (name: string, height: number) => this.model(name, height), flame: this.livingFlame, glowMap: this.glowMap, breakables: this.breakableKit };
  }

  /**
   * Grows the level ahead of the hero, builds the chunks near the camera and
   * releases far ones. At most `budget` chunks are built per call, so play
   * never stalls on a burst of new floor.
   */
  private streamLevel(budget = 2): void {
    const level = this.level; if (!level) return;
    level.expandAround(this.hero.position.x, this.hero.position.z, 30);
    let changed = false;
    for (const key of level.takeChanges()) {
      const built = this.chunks.get(key);
      if (built) { disposeChunk(built); this.chunks.delete(key); changed = true; }
    }
    const distance = (rect: Rect) => Math.hypot(Math.max(rect.minX - this.cameraTarget.x, 0, this.cameraTarget.x - rect.maxX), Math.max(rect.minZ - this.cameraTarget.z, 0, this.cameraTarget.z - rect.maxZ));
    const wanted = level.chunks.map(chunk => ({ chunk, distance: distance(chunk.bounds) })).sort((a, b) => a.distance - b.distance);
    for (const { chunk, distance: far } of wanted) {
      const built = this.chunks.get(chunk.key);
      if (built && far > 54) { disposeChunk(built); this.chunks.delete(chunk.key); changed = true; }
      else if (!built && far < 36 && budget-- > 0) {
        const piece = buildChunk(this.chunkContext, chunk);
        this.floorGroup.add(piece.group); this.chunks.set(chunk.key, piece); changed = true;
      }
    }
    if (!changed) return;
    this.torches.length = 0; this.floatingRunes.length = 0;
    for (const built of this.chunks.values()) { this.torches.push(...built.torches); this.floatingRunes.push(...built.runes); }
    this.renderer.shadowMap.needsUpdate = true; this.lastLightsAt = -9;
  }

  /** Models arrived: rebuild what stands, so props replace their fallbacks. */
  private rebuildChunks(): void {
    for (const built of this.chunks.values()) disposeChunk(built);
    this.chunks.clear();
    this.streamLevel(Infinity);
  }

  /** The few real lights move to the torches and crystals nearest the view. */
  private updateLights(): void {
    if (outdoorKind(this.regionId)) return;
    const glows = [...this.chunks.values()].flatMap(built => built.glows);
    const near = (warm: boolean) => glows.filter(glow => glow.warm === warm)
      .sort((a, b) => a.position.distanceToSquared(this.cameraTarget) - b.position.distanceToSquared(this.cameraTarget));
    const lights = [...this.warmLights, ...this.recessLights];
    [...near(true).slice(0, 2), undefined, undefined].slice(0, 2).concat([...near(false).slice(0, 2), undefined, undefined].slice(0, 2)).forEach((glow, index) => {
      const light = lights[index]!;
      if (glow) this.lightAnchors[index]!.copy(glow.position);
      light.intensity = glow && glow.position.distanceTo(this.cameraTarget) < 26 ? (index < 2 ? 46 : 40) : 0;
    });
  }

  /**
   * The current pack waits in the nearest unexplored area, and the guardian in
   * a sanctum grown for it. While the pack is off screen, it moves to
   * whichever unexplored area is nearest, so every path leads to a fight.
   */
  private placePack(): void {
    const level = this.level; if (!level || !this.enemies.length) return;
    const hero = this.hero.position;
    let area = this.packArea;
    if (!area) {
      if (this.encounter === 5) {
        area = level.areas.find(candidate => candidate.kind === 'sanctum') ?? level.growNearest(hero.x, hero.z, 'sanctum');
      }
      area ??= this.nearestOpenArea() ?? level.growNearest(hero.x, hero.z, 'hall')
        ?? level.areas.filter(candidate => candidate.kind !== 'entry' && candidate.kind !== 'treasury' && candidate.kind !== 'sanctum').sort((a, b) => b.rect.maxX - b.rect.minX - (a.rect.maxX - a.rect.minX))[0] ?? level.areas[0]!;
      this.packArea = area; this.streamLevel(Infinity);
    }
    const formation = packPositions(level, area, this.enemies.length), center = rectCenter(area.rect);
    this.enemies.forEach((enemy, index) => {
      const point = formation[index] ?? center;
      enemy.origin.set(point.x, 0, point.z);
      if (!this.engaged || !enemy.at.lengthSq()) enemy.at.copy(enemy.origin);
      enemy.root.position.copy(enemy.at);
      enemy.root.rotation.y = Math.atan2(hero.x - point.x, hero.z - point.z);
    });
  }

  /** The nearest unexplored hall that the hero is not already standing in or beside. */
  private nearestOpenArea(): Area | undefined {
    const level = this.level; if (!level) return undefined;
    const hero = this.hero.position;
    const away = (area: Area) => { const c = rectCenter(area.rect); return Math.hypot(c.x - hero.x, c.z - hero.z) >= 12; };
    return level.areas.filter(area => area.kind === 'hall' && !area.visited && area !== this.heroArea && away(area))
      .sort((a, b) => { const p = rectCenter(a.rect), q = rectCenter(b.rect); return Math.hypot(p.x - hero.x, p.z - hero.z) - Math.hypot(q.x - hero.x, q.z - hero.z); })[0];
  }

  /**
   * Moves a pack that has been off screen for a few seconds to a nearer
   * unexplored area. A glimpse at the screen edge must not pin it there: a
   * player who then turns the other way still walks into it.
   */
  private updatePack(): void {
    if (this.engaged || !this.enemies.length || !this.packArea) return;
    const seen = this.enemies.some(enemy => {
      const at = enemy.root.position.clone().setY(enemy.height * .5).project(this.camera);
      return Math.abs(at.x) < 1.1 && Math.abs(at.y) < 1.1;
    });
    if (seen) { this.packSeenAt = this.elapsed; return; }
    if (this.elapsed - this.packSeenAt < PACK_FORGET_SECONDS) return;
    const hero = this.hero.position, level = this.level!;
    const from = (area: Area) => { const at = rectCenter(area.rect); return Math.hypot(at.x - hero.x, at.z - hero.z); };
    // A pack this far away is no longer ahead of the hero: a new area grows for it.
    const lost = from(this.packArea) > 44;
    let next: Area | undefined;
    if (this.encounter === 5) {
      // The guardian takes the nearest sanctum already grown, or a new one close by.
      if (lost) next = level.areas.filter(area => area.kind === 'sanctum').sort((a, b) => from(a) - from(b))[0];
      // A sanctum is large; when none fits near the hero, the guardian waits in a hall ahead.
      if (lost && (!next || from(next) > 44)) next = level.growNearest(hero.x, hero.z, 'sanctum', PACK_REGROW_REACH)
        ?? this.nearestOpenArea() ?? level.growNearest(hero.x, hero.z, 'hall', PACK_REGROW_REACH);
    } else {
      next = this.nearestOpenArea();
      if (next && from(next) + 4 >= from(this.packArea)) next = undefined;
      if (!next && lost) next = level.growNearest(hero.x, hero.z, 'hall', PACK_REGROW_REACH);
    }
    if (!next || next === this.packArea || from(next) >= from(this.packArea)) return;
    this.packArea = next; this.streamLevel(Infinity); this.placePack(); this.batchEnemies();
  }

  private setEnvironment(): void {
    const kind = outdoorKind(this.regionId);
    if (this.outdoorRegion !== (kind ? this.regionId : '')) {
      // Chunks built with the old kit are released before its materials go.
      for (const built of this.chunks.values()) disposeChunk(built);
      this.chunks.clear();
      this.outdoorKit?.dispose(); this.outdoorKit = undefined; this.outdoorRegion = '';
      this.outdoorGround?.removeFromParent(); this.outdoorGround?.geometry.dispose(); this.outdoorGround = undefined;
    }
    const ambient = this.scene.getObjectByName('ambient') as THREE.HemisphereLight;
    const moon = this.scene.getObjectByName('moon') as THREE.DirectionalLight;
    if (!kind && !this.outdoorGround) {
      // Unlit rock beneath the whole level: rubble beyond the walls rests on it.
      const geometry = new THREE.PlaneGeometry(160, 160); geometry.rotateX(-Math.PI / 2);
      this.outdoorGround = new THREE.Mesh(geometry, this.materials.dark); this.outdoorGround.receiveShadow = true;
      this.scene.add(this.outdoorGround);
    }
    if (kind) {
      if (!this.outdoorKit) {
        this.outdoorKit = createOutdoorKit(this.regionId); this.outdoorRegion = this.regionId;
        // One wide ground plane follows the camera; its texture stays fixed to the world.
        const geometry = new THREE.PlaneGeometry(160, 160, 32, 32); geometry.rotateX(-Math.PI / 2);
        const uv = geometry.getAttribute('uv'), position = geometry.getAttribute('position'), colors = new Float32Array(position.count * 3);
        for (let i = 0; i < position.count; i++) {
          uv.setXY(i, position.getX(i) / 5, position.getZ(i) / 5);
          const shade = .9 + .1 * Math.sin(position.getX(i) * .37 + position.getZ(i) * .23);
          colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.outdoorGround = new THREE.Mesh(geometry, this.outdoorKit.materials.ground);
        this.outdoorGround.position.y = -.035; this.outdoorGround.receiveShadow = true;
        this.scene.add(this.outdoorGround);
      }
      const light = outdoorLight[kind];
      this.scene.background = new THREE.Color(light.sky); this.scene.fog = new THREE.Fog(light.fog, 45, 95);
      ambient.color.setHex(light.sky); ambient.groundColor.setHex(light.ground); ambient.intensity = 1.15;
      moon.color.setHex(light.sun); moon.intensity = light.intensity;
      this.warmLights.forEach(light => { light.intensity = 0; });
      this.recessLights.forEach(light => { light.visible = false; });
    } else {
      this.scene.background = new THREE.Color(0x080f16);
      ambient.color.setHex(0x7394aa); ambient.groundColor.setHex(0x15120f); ambient.intensity = .38;
      moon.color.setHex(0x6d8da5); moon.intensity = 1.5;
      this.recessLights.forEach(light => { light.visible = true; });
    }
  }

  private updateStoneTint(): void {
    const frost = this.regionId.includes('frost'), storm = this.regionId.includes('storm');
    this.materials.wall.color.setHex(this.stoneSurfaceLoaded
      ? frost ? 0xa1b7c4 : storm ? 0xb2a7bf : 0xb2b5ad
      : frost ? 0x5b6871 : storm ? 0x625d6b : 0x69665d);
  }

  private batchEnemies(): void {
    this.releaseEnemyInstances();
    const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; sources: THREE.Mesh[]; roots: THREE.Group[] }>();
    for (const enemy of this.enemies) {
      // Keep procedural actors independent until their authored models arrive.
      if (enemy.visual.userData.procedural) continue;
      let skinned = false;
      enemy.visual.traverse(o => { if (o instanceof THREE.SkinnedMesh) skinned = true; });
      if (skinned) {
        enemy.visual.visible = true;
        enemy.visual.traverse(o => {
          if (!(o instanceof THREE.SkinnedMesh)) return;
          const dissolve = createSkinnedDissolve(o.geometry, o.material);
          this.skinnedEnemies.push({ mesh: o, root: enemy.root, baseMaterial: o.material, dissolve });
          o.material = dissolve.material; o.customDepthMaterial = dissolve.depth; o.frustumCulled = false;
        });
        continue;
      }
      enemy.visual.visible = false;
      enemy.visual.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const key = object.geometry.uuid;
        if (!batches.has(key)) batches.set(key, { geometry: object.geometry, material: object.material, sources: [], roots: [] });
        batches.get(key)!.sources.push(object);
        batches.get(key)!.roots.push(enemy.root);
      });
    }
    for (const { geometry, material, sources, roots } of batches.values()) {
      const dissolve = createElectricDissolve(geometry, material, sources.length);
      const mesh = new THREE.InstancedMesh(dissolve.geometry, material, sources.length);
      mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (geometry.morphAttributes.position?.length) {
        sources.forEach((source, index) => mesh.setMorphAt(index, source));
        mesh.morphTexture!.needsUpdate = true;
      }
      this.enemyInstances.push({ mesh, sources, roots, baseMaterial: material, dissolve }); this.enemyGroup.add(mesh);
    }
  }

  private setElectricMaterials(enabled: boolean, style: 'electric' | 'burn' = 'electric'): void {
    for (const actor of this.skinnedEnemies) { actor.mesh.material = actor.dissolve.materialFor(style); actor.mesh.customDepthMaterial = actor.dissolve.depth; }
    for (const instance of this.enemyInstances) {
      instance.mesh.material = enabled ? instance.dissolve.materialFor(style) : instance.baseMaterial;
      instance.mesh.customDepthMaterial = enabled ? instance.dissolve.depth : undefined;
    }
  }

  private releaseEnemyInstances(): void {
    for (const actor of this.skinnedEnemies) { actor.mesh.material = actor.baseMaterial; actor.mesh.customDepthMaterial = undefined; actor.dissolve.dispose(); }
    this.skinnedEnemies.length = 0;
    for (const instance of this.enemyInstances) {
      this.enemyGroup.remove(instance.mesh); instance.mesh.dispose(); instance.dissolve.dispose();
    }
    this.enemyInstances.length = 0;
  }

  setAppearance(_appearanceId: RpgAppearanceId): void {
    if (this.disposed) return;
    // Old saves can keep their cosmetic ID; all heroes now use the main rig.
    this.desiredAppearance = 'wayfarer';
    const modelId = TRIPO_HERO_MODEL;
    if (this.heroModelId === modelId) return;
    const model = this.model(modelId, 1.8);
    if (!model) return; // The required new hero is still loading.
    this.heroLight.intensity = 18;
    const previousVisual = this.heroVisual;
    const previousAnimation = this.heroAnimator?.current ?? 'idle';
    const previousTime = this.heroAnimator?.time ?? 0;
    this.heldEquipment?.clear(); this.heldEquipment = undefined;
    this.heroMixer?.stopAllAction(); this.heroMixer?.uncacheRoot(this.heroVisual);
    this.heroAnimator = undefined;
    this.hero.remove(this.heroVisual); this.releaseProcedural(this.heroVisual);
    // Skeletons and weapon tint materials belong to this instance. Geometry and
    // baked textures remain owned by the model cache for subsequent armor swaps.
    this.heroVisual.traverse(object => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      if (object instanceof THREE.Mesh && (object.userData.equipmentMaterial || object.userData.tripoInstanceMaterial)) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    this.heroVisual = new THREE.Group();
    this.heroVisual.position.copy(previousVisual.position); this.heroVisual.quaternion.copy(previousVisual.quaternion); this.heroVisual.scale.copy(previousVisual.scale);
    this.heroVisual.add(model); this.hero.add(this.heroVisual);
    const clips = this.heroClipSets.get(modelId) ?? [], clip = (name: string) => clips.find(clip => clip.name.toLowerCase() === name);
    this.heroWalkCycle = measureTripoWalkCycle(model, clip('walk'));
    const runCycle = measureTripoWalkCycle(model, clip('run'));
    this.heldEquipment = tripoHeroEquipment(model);
    this.heroUsesAuthoredMotion = (this.heroClipSets.get(modelId)?.length ?? 0) > 0;
    tintTripoHero(model, 'wayfarer');
    this.heroModelId = modelId; this.appearance = 'wayfarer';
    this.heroMixer = new THREE.AnimationMixer(this.heroVisual);
    this.heroAnimator = new HeroAnimator(this.heroMixer, clips, { walk: this.heroWalkCycle, run: runCycle });
    this.heroAnimator.restore(previousAnimation, previousTime); this.heroAnimator.update(0, 0);
    this.setEquipment(this.equipment); this.renderer.shadowMap.needsUpdate = true;
  }

  setEquipment(itemId: string): void {
    this.equipment = itemId;
    const glow = /cinder|ember|phoenix/.test(itemId) ? 0xff8c22 : /storm|thunder|tempest/.test(itemId) ? 0x8d9eff : /frost|glacier|winter/.test(itemId) ? 0x87edff : 0xffb64b;
    this.rune.material instanceof THREE.MeshBasicMaterial && this.rune.material.color.setHex(glow);
    if (this.heldEquipment?.itemId === itemId) return;
    this.heldEquipment?.clear();
    this.heroVisual.traverse(object => {
      if (object instanceof THREE.Mesh && /sword|weapon|blade/i.test(object.name)) {
        const material = object.material;
        if (material instanceof THREE.MeshStandardMaterial) {
          // Each equipped blade owns its color; creature/prop materials stay shared.
          if (!object.userData.equipmentMaterial) { object.material = material.clone(); object.userData.equipmentMaterial = true; }
          const bladeMaterial = object.material as THREE.MeshStandardMaterial;
          bladeMaterial.emissive.setHex(glow);
          bladeMaterial.emissiveIntensity = /^Authored_equipped_blade/.test(object.name)
            ? itemId && itemId !== 'apprentice' ? .32 : 0
            : itemId ? .32 : .08;
        }
      }
    });
    const authoredItem = ITEM_MODELS[itemId];
    if (authoredItem) this.heldEquipment?.replace(this.models.get(authoredItem.model));
    this.renderer.shadowMap.needsUpdate = true;
  }

  setPaused(paused: boolean): void { this.paused = paused; }

  /** Review switch for comparing the accepted blade effect with the legacy
   * fallback. Rigs without measured blade endpoints always use that fallback. */
  setCleaveCandidate(enabled: boolean): void { this.cleaveCandidate = enabled; }
  /** Rigs without an authored CastOrigin retain the legacy chain effect. */
  setChainCandidate(enabled: boolean): void { this.chainCandidate = enabled; }

  /** The guardian is down: arms raised over the treasure. */
  celebrate(): void { this.heroAnimator?.play('victory'); }

  async attack(spellId: string, options: AttackOptions = {}): Promise<void> {
    if (this.disposed || this.attacking) return;
    const hitById = new Map(options.combat?.hits.map(hit => [hit.enemyId, hit]) ?? []);
    const living = this.enemies.filter(enemy => !enemy.dead);
    const targets = options.combat ? living.filter(enemy => hitById.has(enemy.id))
      : living.slice(0, Math.max(0, options.kills ?? living.length));
    if (!targets.length) return;
    if (!this.engageReady) {
      // A restored answer resolves at once: the horde is already in formation.
      this.engaged = true; this.enemies.forEach(enemy => enemy.at.copy(enemy.origin)); this.finishEngage();
    }
    // The hero casts where they stand, and may run on once the spell is away.
    this.heroTravelSpeed = 0; this.heroVisual.position.set(0, 0, 0);
    const spell = RPG_SPELLS.find(spell => spell.id === spellId);
    const effect = spell?.effect ?? 'nova', school = spell?.school ?? 'ember';
    const bonus = RPG_SPELL_SHAPES.find(shape => shape.id === options.spellShape && shape.spellId === spellId);
    const elementalCleave = Boolean(options.burning || options.wide || options.echo);
    const physicalCleave = effect === 'cleave' && !elementalCleave;
    const color = physicalCleave ? 0xdce6ee : school === 'ember' ? 0xff7d19 : school === 'frost' ? 0x8bdef1 : 0x8bacff;
    const bladeGrip = new THREE.Vector3(), bladeTip = new THREE.Vector3();
    const mountedCleave = effect === 'cleave' && this.cleaveCandidate && !!this.heldEquipment?.sampleWorldBlade(bladeGrip, bladeTip);
    const chainOrigin = effect === 'chain-lightning' && this.chainCandidate ? this.heroVisual.getObjectByName('CastOrigin') : undefined;
    const anchoredChain = !!chainOrigin;
    this.chainUsesHandOrigin = anchoredChain;
    this.lastAttack = { spellId, effect, options: { ...options } };
    this.releaseCharge();
    this.novaContacts = undefined;
    this.setElectricMaterials(true, school === 'ember' && !physicalCleave ? 'burn' : 'electric');
    this.attackPending = new Set(targets.map(enemy => enemy.id)); this.attackHitAt = this.elapsed;
    this.attacking = true; this.attackAge = 0; this.castRoot = effect === 'cleave' || effect === 'phoenix-dive' ? CLEAVE_ROOT : CAST_ROOT;
    if (!this.heroAnimator?.play(effect === 'cleave' || effect === 'phoenix-dive' ? 'cleave' : HERO_CAST[effect] ?? 'cast')) this.heroAnimator?.play('cast');
    this.attackDuration = effect === 'cleave' ? 2.2 : ['firestorm', 'blizzard', 'tempest', 'frost-guardian'].includes(effect) ? 3 : 2.7;
    const origin = this.hero.position.clone().setY(.12);
    // Area spells land on the struck enemies, wherever the hero cast from.
    const center = targets.reduce((sum, enemy) => sum.add(enemy.root.position), new THREE.Vector3()).divideScalar(targets.length);
    const target = center.clone().setY(origin.y);
    const directional = ['ice-lance', 'arc-lance', 'glacial-surge', 'phoenix-dive'].includes(effect);
    this.attackHeading = targetHeading(origin, directional ? targets[0].root.position : center);
    if (this.attackHeading !== undefined) setPlanarHeroHeading(this.heroVisual.rotation, this.attackHeading);
    const castOrigin = () => {
      const at = new THREE.Vector3(), marker = this.heroVisual.getObjectByName('CastOrigin');
      if (marker) marker.getWorldPosition(at);
      else this.heroVisual.localToWorld(at.set(-.28, 1.24, .32));
      return at;
    };
    const frostContact = (enemy: Enemy, index: number, at: THREE.Vector3, from: THREE.Vector3, scale = .8) => {
      const contact = createFrostfallContact(index + this.encounter * 11, scale, at.clone().sub(from)), started = this.elapsed;
      const frozen = at.clone();
      contact.update(frozen, 0, this.elapsed);
      contact.layers.forEach((layer, n) => this.effect(layer, .92, n === 0 ? () => contact.update(frozen, this.elapsed - started, this.elapsed) : undefined));
      // A compact contact glint makes the exact struck surface legible at the
      // gameplay viewport; the existing broken crystal carries the aftermath.
      const glint = new THREE.Mesh(new THREE.PlaneGeometry(.62 * scale, .62 * scale), new THREE.MeshBasicMaterial({ color: 0xc2f1ff, map: this.glowMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      glint.position.copy(frozen); glint.quaternion.copy(this.camera.quaternion);
      this.effect(glint, .12, t => { glint.scale.setScalar(.8 + t * .3); glint.material.opacity = (1 - THREE.MathUtils.smoothstep(t, .28, 1)) * .92; });
      const incoming = at.clone().sub(from).normalize();
      for (let chip = 0; chip < 4; chip++) {
        const splinter = new THREE.Mesh(new THREE.TetrahedronGeometry(.045 + chip % 2 * .014), new THREE.MeshBasicMaterial({ color: chip % 2 ? 0xa3deef : 0xe3faff, transparent: true, toneMapped: false }));
        const velocity = new THREE.Vector3(Math.sin(index * 2 + chip * 2.4) * 1.7, .7 + chip * .23, Math.cos(index * 2 + chip * 2.4) * 1.7).addScaledVector(incoming, -.7);
        splinter.position.copy(frozen);
        this.effect(splinter, .24, t => { splinter.position.copy(frozen).addScaledVector(velocity, t * .24); splinter.position.y -= t * t * .09; splinter.rotation.set(t * 7 + chip, t * 4, chip); splinter.material.opacity = 1 - THREE.MathUtils.smoothstep(t, .35, 1); });
      }
      this.hitEnemy(enemy, color, hitById.get(enemy.id), from);
      this.shake = Math.max(this.shake, enemy.brute ? .12 : .055);
    };
    if (mountedCleave) {
      const started = this.elapsed;
      const duration = CLEAVE_RELEASE + (Math.max(...targets.map(enemy => enemy.root.position.distanceTo(this.hero.position))) + 3) / CLEAVE_SPEED + .3;
      this.attackDuration = Math.max(this.attackDuration, duration);
      const strike = createCleaveStrike(targets.map(enemy => ({
        position: enemy.root.position, height: enemy.height,
        contact: (_at: THREE.Vector3, release: THREE.Vector3) => {
          this.hitEnemy(enemy, color, hitById.get(enemy.id), release);
          this.shake = Math.max(this.shake, enemy.brute ? .075 : .045);
        },
      })), living.filter(enemy => !targets.includes(enemy)).map(enemy => ({ position: enemy.root.position, height: enemy.height })), elementalCleave);
      strike.layers.forEach((layer, index) => this.effect(layer, duration, index === 0 ? () => {
        this.heldEquipment?.sampleWorldBlade(bladeGrip, bladeTip);
        strike.update(bladeGrip, bladeTip, this.elapsed - started, this.elapsed);
      } : undefined));
      this.schedule(duration - .05, () => strike.finish(bladeGrip, bladeTip));
    }
    if (anchoredChain) {
      const started = this.elapsed, hand = new THREE.Vector3();
      const sampleHand = () => chainOrigin!.getWorldPosition(hand);
      const charge = createChainCharge();
      this.effect(charge, .39, () => {
        sampleHand(); charge.position.copy(hand); charge.quaternion.copy(this.camera.quaternion);
        const age = this.elapsed - started, gather = THREE.MathUtils.smoothstep(age, .04, .29);
        charge.scale.setScalar(.45 + .55 * gather);
        charge.material.uniforms.progress.value = age / .35;
        charge.material.uniforms.opacity.value = gather * (1 - THREE.MathUtils.smoothstep(age, .31, .38)) * .8;
      });
      const chain = createChainSequence(targets.map(enemy => ({
        position: enemy.root.position, height: enemy.height,
        contact: (from: THREE.Vector3) => this.hitEnemy(enemy, color, hitById.get(enemy.id), from),
      })), (from, arrival, _index, echo) => this.chainBolt(from, arrival, echo), Boolean(options.chains));
      // An invisible lifetime carrier runs after the hero mixer and enemy pose
      // update, so links sample the hand and arrivals shown in this frame.
      const carrier = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
      carrier.visible = false;
      this.effect(carrier, 1.5, () => {
        sampleHand(); chain.update(hand, this.elapsed - started);
      });
      this.schedule(1.45, () => { sampleHand(); chain.finish(hand); });
    }
    const resolveHorde = (delay: number) => targets.forEach((enemy, i) => {
      const offset = enemy.root.position.clone().sub(origin).setY(0), distance = offset.length();
      let contact = delay + i / Math.max(1, targets.length) * .52;
      if (effect === 'nova') {
        const radius = options.wide ? 10.6 : 8.8;
        contact = 1.3 * (1 - Math.cbrt(1 - Math.min(.97, distance / (radius * 1.01))));
      } else if (effect === 'cleave') {
        const sweepAngle = (Math.atan2(offset.x, offset.z) - .2 + Math.PI * 2) % (Math.PI * 2);
        contact = .08 + sweepAngle / (Math.PI * 2) * .5;
      } else if (effect === 'meteor') contact = .65 + enemy.root.position.distanceTo(target) * .035;
      this.schedule(contact, () => this.hitEnemy(enemy, color, hitById.get(enemy.id)));
    });
    if (effect === 'nova') {
      const ignition = createNovaIgnition(), hand = new THREE.Vector3(), ground = origin.clone().setY(.06);
      // Keep the cosmetic seed inside the hero's footprint but on its visible
      // side; the damaging front still originates at the unchanged room point.
      const towardView = this.camera.position.clone().sub(origin).setY(0).normalize();
      const screenRight = new THREE.Vector3(towardView.z, 0, -towardView.x);
      ground.addScaledVector(towardView, .38).addScaledVector(screenRight, .32);
      const ignitionBend = screenRight.clone().multiplyScalar(.7);
      const marker = this.heroVisual.getObjectByName('CastOrigin'), legacyArm = this.heroVisual.getObjectByName('arm.L'), started = this.elapsed;
      this.effect(ignition.seed, .29);
      this.effect(ignition.mesh, .29, () => {
        if (marker) marker.getWorldPosition(hand);
        else if (legacyArm) legacyArm.localToWorld(hand.set(0, Math.hypot(.095, .195, .355), 0));
        else this.heroVisual.localToWorld(hand.set(-.28, 1.24, .32));
        const age = this.elapsed - started; ignition.update(hand, ground, age, ignitionBend);
        if (age < .18) { this.burstLight.position.copy(hand); this.burstLight.color.setHex(0xff923b); this.burstLight.intensity = 12 * THREE.MathUtils.smoothstep(age, 0, .08); }
      });
    }
    if (effect === 'ball-lightning') {
      const charge = createBallLightningCharge(1 / this.renderer.getPixelRatio()), hand = new THREE.Vector3(), view = new THREE.Vector3();
      const marker = this.heroVisual.getObjectByName('CastOrigin'), arm = this.heroVisual.getObjectByName('arm.L'), started = this.elapsed;
      charge.layers.forEach((layer, index) => this.effect(layer, .28, index === 0 ? () => {
        if (marker) marker.getWorldPosition(hand);
        else if (arm) arm.localToWorld(hand.set(0, Math.hypot(.095, .195, .355), 0));
        else this.heroVisual.localToWorld(hand.set(-.28, 1.24, .32));
        charge.update(hand, this.camera.getWorldDirection(view).negate(), this.elapsed - started, this.elapsed);
      } : undefined));
    }
    if (effect !== 'nova' && effect !== 'ball-lightning' && !physicalCleave && !mountedCleave && !anchoredChain) this.emit(origin.clone().setY(1.3), color, 28, 1.1, .75);
    this.schedule(.18, () => {
      this.burstLight.position.copy(origin).setY(2.8); this.burstLight.color.setHex(color); this.burstLight.intensity = anchoredChain ? 0 : mountedCleave ? 12 : effect === 'frostfall' || effect === 'ice-lance' || effect === 'glacial-surge' ? 24 : effect === 'arc-lance' ? 28 : 100;
      if (bonus) {
        const ctx: SpellBonusContext = {
          spellId: bonus.spellId, shape: bonus.id, origin, target,
          targets: targets.map(enemy => ({ id: enemy.id, position: enemy.root.position.clone(), height: enemy.height })),
          view: this.camera.getWorldDirection(new THREE.Vector3()).negate(), time: () => this.elapsed, castOrigin,
          effect: this.effect.bind(this), schedule: this.schedule.bind(this), emit: this.emit.bind(this),
          debris: this.debris.bind(this), bolt: this.bolt.bind(this),
          ring: (at, color, radius, duration) => this.ring(at, color, radius, duration, 'ring'),
          firePillar: this.firePillar.bind(this), fireContact: this.fireContact.bind(this), meteorImpact: this.meteorImpact.bind(this),
        };
        if (school === 'ember') playFireSpellBonus(ctx);
        else if (school === 'frost') playFrostSpellBonus(ctx);
        else playStormSpellBonus(ctx);
      }
      switch (effect) {
        case 'cleave': {
          if (mountedCleave) break;
          // The articulated clip already plants the feet and shifts strike weight.
          if (!this.heroUsesAuthoredMotion) this.heroMotion = age => new THREE.Vector3(Math.sin(Math.min(1, age / .8) * Math.PI) * 1.2, 0, -Math.sin(Math.min(1, age / .8) * Math.PI) * 1.6);
          this.weaponSweep(origin, physicalCleave ? 0xdce6ee : 0xffc875, options.wide ? 7.6 : 5.6, .2);
          if (options.echo) this.schedule(.35, () => this.weaponSweep(origin.clone().add(new THREE.Vector3(0, 0, -1)), 0xffecbe, 6.8, 2.8));
          resolveHorde(.23); this.shake = .2; break;
        }
        case 'nova': {
          const contacts = createFireNovaContacts(this.enemies.length, options.burning, this.encounter); this.novaContacts = contacts;
          contacts.layers.forEach((layer, index) => this.effect(layer, 2.35, index === 0 ? () => contacts.update(this.elapsed) : undefined));
          this.releaseNova(origin, options.wide ? 10.6 : 8.8);
          if (options.echo) this.schedule(.68, () => this.releaseNova(origin, 10.8, .68));
          resolveHorde(.25); break;
        }
        case 'meteor': {
          this.targetMark(target, 0xff7534, 3.2);
          if (bonus?.id !== 'meteor-shower') this.projectile(target.clone().add(new THREE.Vector3(-5, 11, -3)), target, 0xff751c, 1.15, .65, () => {
            this.meteorImpact(target, new THREE.Vector3(5, -11, 3), 1);
          });
          if (options.echo) this.schedule(.35, () => this.projectile(target.clone().add(new THREE.Vector3(6, 10, 2)), origin.clone().add(new THREE.Vector3(3, 0, 1)), 0xffb74c, .7, .6, () => this.meteorImpact(origin.clone().add(new THREE.Vector3(3, 0, 1)), new THREE.Vector3(-3, -10, -1), .6)));
          resolveHorde(.72); break;
        }
        case 'phoenix-dive': {
          const flightStarted = this.elapsed, landing = targets[0].root.position.clone().setY(0);
          const flightHeading = targetHeading(origin, landing), travel = landing.clone().sub(origin).setY(0);
          const flightProgress = () => THREE.MathUtils.clamp((this.elapsed - flightStarted) / 1.15, 0, 1);
          const flightDisplacement = () => {
            const t = flightProgress(), outbound = t <= .55;
            const phase = outbound ? t / .55 : (t - .55) / .45;
            const distance = outbound ? THREE.MathUtils.smoothstep(phase, 0, 1) : 1 - THREE.MathUtils.smoothstep(phase, 0, 1);
            return travel.clone().multiplyScalar(distance).setY(Math.sin(phase * Math.PI) * (outbound ? 2 : .65));
          };
          // Scheduled effects start after the attack windup. Use that same clock
          // for the rider, then attach feathers after the rider's hop/idle pose.
          this.heroMotion = flightDisplacement;
          for (const side of [-1, 1]) {
            const material = phoenixFeatherMaterial(), wing = new THREE.Mesh(phoenixWingGeometry(side), material);
            wing.position.copy(origin);
            this.effect(wing, 1.15, () => {
              const t = flightProgress();
              this.heroVisual.getWorldPosition(wing.position);
              wing.rotation.y = flightHeading + Math.PI;
              wing.rotation.z = side * (.11 * Math.sin(t * Math.PI * 2) - .05);
              wing.scale.x = .62 + .38 * Math.sin(Math.min(1, t * 1.8) * Math.PI * .5);
              material.uniforms.time.value = this.elapsed + side * .7;
              material.uniforms.opacity.value = Math.min(1, t * 10) * (1 - Math.pow(t, 2.8));
            });
          }
          for (const smoke of [false, true]) {
            const material = smoke ? stormWispMaterial(0x66504b) : phoenixFeatherMaterial();
            const tail = new THREE.Mesh(phoenixTailGeometry(), material); tail.position.copy(origin); tail.rotation.y = flightHeading + Math.PI;
            if (smoke) tail.scale.set(1.45, 1.05, 1.13);
            this.effect(tail, smoke ? 1.45 : 1.15, t => {
              this.heroVisual.getWorldPosition(tail.position);
              if (smoke) tail.position.add(new THREE.Vector3(0, t * .5, .5));
              material.uniforms.time.value = this.elapsed;
              material.uniforms.opacity.value = Math.sin((smoke ? t : flightProgress()) * Math.PI) * (smoke ? .45 : .8);
            });
          }
          for (let plume = 0; plume < 5; plume++) this.schedule(.12 + plume * .14, () => {
            this.emit(origin.clone().add(flightDisplacement()).add(new THREE.Vector3(0, 1.5, 0)), 0xf68b25, 11, 1.4, .7);
          });
          this.schedule(1.15 * .55, () => {
            const at = targets[0].root.position.clone();
            this.impact(at, 0xff8c25, 1.8);
            this.hitEnemy(targets[0], color, hitById.get(targets[0].id), origin);
            this.shake = .2;
            // The dive lands on its primary victim; burning feathers visibly
            // branch from that landing to every remaining authoritative hit.
            targets.slice(1).forEach((enemy, index) => this.schedule(index * .045, () => {
              const from = at.clone().setY(.9), duration = directionalFlightDuration(from, enemy.root.position, 22), started = this.elapsed;
              const material = phoenixFeatherMaterial(), feather = new THREE.Mesh(phoenixTailGeometry().translate(0, -1.7, 1.6), material);
              feather.scale.setScalar(.34); feather.name = `phoenix-strike:${enemy.id}`; feather.userData.targetId = enemy.id;
              const flight = createDirectedFlight(from, duration, to => to.copy(enemy.root.position).add(new THREE.Vector3(0, enemy.height * .5, 0)),
                (contact, release) => { this.hitEnemy(enemy, color, hitById.get(enemy.id), release); this.emit(contact, 0xffb953, 6, .7, .3); });
              const update = () => {
                const age = this.elapsed - started; flight.update(age);
                feather.position.copy(flight.tip);
                feather.rotation.y = targetHeading(flight.from, flight.to) + Math.PI;
                material.uniforms.time.value = this.elapsed;
                material.uniforms.opacity.value = Math.min(1, age * 20) * (1 - THREE.MathUtils.smoothstep(age, duration, duration + .07));
              };
              update(); this.effect(feather, duration + .08, update); this.schedule(duration, update);
            }));
          });
          break;
        }
        case 'firestorm': {
          for (let i = 0; i < 9; i++) this.schedule(i * .13, () => {
            const at = targets[(i * 3) % targets.length].origin;
            this.firePillar(at, 2.4 + (Math.sin(i * 2.7) + 1) * 1.1, 1.25); this.fireContact(at, 1.2);
          });
          resolveHorde(.55); break;
        }
        case 'frostfall': {
          targets.forEach((enemy, i) => this.schedule(i * .045, () => {
            const target = enemy.root.position.clone(); target.y += enemy.height * .55;
            const from = target.clone().add(new THREE.Vector3(-.65 + i % 2 * .25, 5.4 + i % 3 * .5, -.3));
            const shard = createFrostfallCrystal(i + this.encounter * 11, options.shards ? 1.15 : .9);
            const tip = new THREE.Vector3(), velocity = new THREE.Vector3();
            const duration = .46 + i % 3 * .025, started = this.elapsed;
            const update = () => {
              const age = this.elapsed - started;
              // Track the idle body's small feint until contact, then keep the
              // shatter at that contact rather than following the recoil.
              if (age < duration) { target.copy(enemy.root.position); target.y += enemy.height * .55; }
              sampleFrostfallFlight(from, target, age / duration, tip, velocity);
              shard.update(tip, velocity, this.elapsed, 1 - THREE.MathUtils.smoothstep(age, duration, duration + .06));
            };
            update();
            shard.layers.forEach((layer, index) => this.effect(layer, duration + .06, index === 0 ? update : undefined));
            this.schedule(duration, () => {
              target.copy(enemy.root.position); target.y += enemy.height * .55;
              this.hitEnemy(enemy, 0xb0efff, hitById.get(enemy.id));
              const contact = createFrostfallContact(i + this.encounter * 11, options.shards ? 1.15 : .9, target.clone().sub(from)), contactAt = this.elapsed;
              contact.update(target, 0, this.elapsed);
              contact.layers.forEach((layer, index) => this.effect(layer, .92, index === 0 ? () => contact.update(target, this.elapsed - contactAt, this.elapsed) : undefined));
              this.shake = Math.max(this.shake, enemy.brute ? .13 : .065);
            });
          }));
          break;
        }
        case 'ice-lance': {
          // The server may select victims on either side of the hero. Every
          // selected body gets an aimed lance, rather than a cosmetic forward
          // cone followed by unrelated off-screen damage cues.
          const spearCount = 1;
          targets.forEach((enemy, index) => { for (let spear = 0; spear < spearCount; spear++) this.schedule(index * .055, () => {
            const from = castOrigin();
            if (spearCount > 1) from.x += spear === 0 ? -.4 : .4;
            const duration = directionalFlightDuration(from, enemy.root.position);
            const started = this.elapsed, shard = createFrostfallCrystal(index + this.encounter * 11, options.pierce ? 1.2 : 1.05, .28);
            const drill = bonus?.id === 'split-lance' ? createDiamondDrill(index) : undefined;
            const wake = createIceLanceWake(), view = this.camera.getWorldDirection(new THREE.Vector3()).negate();
            const flight = createDirectedFlight(from, duration, to => to.copy(enemy.root.position).add(new THREE.Vector3(0, enemy.height * .55, 0)),
              (at, release) => { if (spear === 0) frostContact(enemy, index, at, release, options.pierce ? .95 : .75); });
            const update = () => {
              const age = this.elapsed - started; flight.update(age);
              const opacity = 1 - THREE.MathUtils.smoothstep(age, duration, duration + .055);
              shard.update(flight.tip, flight.direction, this.elapsed, opacity);
              drill?.update(flight.tip, flight.direction, view, this.elapsed, opacity);
              wake.update(flight.tip, flight.direction, view, Math.min(1, age * 16) * opacity, flight.tip.distanceTo(flight.from));
            };
            update(); this.effect(wake.mesh, duration + .065);
            if (drill) this.effect(drill.mesh, duration + .065);
            shard.layers.forEach((layer, n) => {
              layer.name = `ice-lance:${enemy.id}:spear-${spear}`; layer.userData.targetId = enemy.id;
              this.effect(layer, duration + .065, n === 0 ? update : undefined);
            });
            // Same flight update establishes the final visible tip and contact,
            // including frames that skipped past the mesh's visual lifetime.
            this.schedule(duration, update);
          }); });
          break;
        }
        case 'glacial-surge': {
          targets.forEach((enemy, index) => {
            const from = origin.clone(), to = enemy.root.position.clone().setY(.04);
            const duration = directionalFlightDuration(from, to, 14);
            const steps = Math.max(3, Math.ceil(from.distanceTo(to) / 1.15));
            for (let step = 1; step <= steps; step++) this.schedule(duration * step / steps, () => {
              // The terminal crystal erupts at the live body, never at a
              // former idle position or on the opposite side of the caster.
              if (step === steps) to.copy(enemy.root.position).setY(.04);
              const progress = step === steps ? 1 : THREE.MathUtils.clamp((step + Math.sin(step * 3.13 + index) * .24) / steps, 0, 1);
              const at = sampleGroundBranch(from, to, progress, index);
              const height = (.5 + Math.abs(Math.sin(step * 3.73 + index * 2.31)) * .65 + progress * .22) * (options.wide ? 1.12 : 1);
              this.glacialShard(at, targetHeading(from, to), height, index * 13 + step, enemy.id);
              if (step === steps) this.schedule(.11, () => frostContact(enemy, index, enemy.root.position.clone().add(new THREE.Vector3(0, enemy.height * .45, 0)), from, .9));
            });
          });
          this.shake = .12; break;
        }
        case 'blizzard': {
          const center = targets.reduce((sum, enemy) => sum.add(enemy.root.position), new THREE.Vector3()).divideScalar(targets.length);
          this.cyclone(center, 0x86c4e2, 7.5, 2.9, 2.4, true);
          for (let i = 0; i < 11; i++) this.schedule(i * .12, () => {
            for (let snow = 0; snow < 32; snow++) {
              const at = center.clone().add(new THREE.Vector3((Math.random() - .5) * 16, 4 + Math.random() * 3, (Math.random() - .5) * 16));
              this.directedParticle(at, new THREE.Vector3(-2.4, -3, 1.3), 0xd5f4ff, 1.1, .34);
            }
          });
          targets.forEach((enemy, index) => this.schedule(.62 + index * .025, () => {
            const at = enemy.root.position.clone().add(new THREE.Vector3(0, enemy.height * .5, 0));
            frostContact(enemy, index, at, center, .7);
          }));
          break;
        }
        case 'frost-guardian': {
          this.summonGuardian(origin.clone().add(new THREE.Vector3(-2.7, 0, -1)), 2.3);
          if (options.summon) this.summonGuardian(origin.clone().add(new THREE.Vector3(2.7, 0, -1)), 2.3);
          this.schedule(.8, () => {
            if (bonus?.id !== 'glacial-hammer') targets.forEach((enemy, index) => {
              this.glacialShard(enemy.root.position.clone(), index * 2.4, .6 + index % 3 * .12, index + 71, enemy.id);
            });
            this.impact(target, 0xd2faff, 1.5); this.shake = .32; this.onSound?.('blast-frost');
          });
          resolveHorde(.83); break;
        }
        case 'chain-lightning': {
          if (anchoredChain) break;
          this.chainLightning(origin, 0x9ac4ff, targets);
          if (options.chains) this.schedule(.45, () => this.chainLightning(origin, 0xe1f5ff, targets));
          resolveHorde(.17); break;
        }
        case 'arc-lance': {
          targets.forEach((enemy, index) => this.schedule(.13 + index * .065, () => {
            const from = castOrigin(), at = enemy.root.position.clone().add(new THREE.Vector3(0, enemy.height * .55, 0));
            // The bright backbone terminates at its actual victim. Piercing
            // creates a narrower branch from the preceding struck body.
            const previous = options.pierce && index > 0 ? targets[index - 1].root.position.clone().add(new THREE.Vector3(0, targets[index - 1].height * .55, 0)) : from;
            const view = this.camera.getWorldDirection(new THREE.Vector3()).negate(), material = arcLanceMaterial();
            const discharge = new THREE.Mesh(arcLanceGeometry(previous, at, view, index + this.encounter * 17), material);
            this.effect(discharge, .3, t => { material.uniforms.progress.value = t; });
            const bolt = this.effects[this.effects.length - 1].mesh; bolt.name = `arc-lance:${enemy.id}`; bolt.userData.targetId = enemy.id;
            this.hitEnemy(enemy, color, hitById.get(enemy.id), previous);
            this.emit(at, 0xb9dcff, 8, .75, .22);
            const flash = new THREE.Mesh(new THREE.PlaneGeometry(.75, .75), new THREE.MeshBasicMaterial({ color: 0x7caaff, map: this.glowMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
            flash.position.copy(at); flash.quaternion.copy(this.camera.quaternion);
            this.effect(flash, .15, t => { flash.scale.setScalar(.45 + t); flash.material.opacity = Math.pow(1 - t, 2) * .8; });
            this.shake = Math.max(this.shake, enemy.brute ? .095 : .05);
          }));
          break;
        }
        case 'thunderclap': {
          this.bolt(target.clone().setY(13), target.clone().setY(.1), 0xe0efff, .2, .45); this.onSound?.('blast-storm');
          this.schedule(.18, () => { this.impact(target, 0xadcaff, 4.5); this.ring(target, 0xa9bfff, 11.5, .7, 'ring'); this.debris(target, 14); this.shake = .48; });
          if (options.echo) this.schedule(.7, () => { this.bolt(origin.clone().setY(12), origin, 0xd4e7ff, .18, .45); this.ring(origin, 0xc0d9ff, 11.5, .65, 'ring'); });
          resolveHorde(.27); break;
        }
        case 'ball-lightning': {
          const count = (options.orbit ? 4 : 1) + (options.spellShape === 'twin-orb' ? 1 : 0);
          const started = this.elapsed, view = new THREE.Vector3();
          const launch = new THREE.Vector3(), orbitTarget = new THREE.Vector3(), towardView = this.camera.position.clone().sub(origin).setY(0).normalize();
          const side = new THREE.Vector3(towardView.z, 0, -towardView.x);
          const marker = this.heroVisual.getObjectByName('CastOrigin'), arm = this.heroVisual.getObjectByName('arm.L');
          let launchCaptured = false;
          let contactLightAt = -Infinity;
          const contacts = createBallLightningContacts(targets.length);
          contacts.layers.forEach((layer, index) => this.effect(layer, 2.15, index === 0 ? () => {
            contacts.update(this.elapsed);
            // A short reflected pulse supports the actual discharge instead of
            // leaving a bright lamp embedded inside the falling victim.
            this.burstLight.intensity = 14 * Math.exp(-Math.max(0, this.elapsed - contactLightAt) * 24);
          } : undefined));
          const orbPosition = (orb: number, t: number, at: THREE.Vector3) => {
            const phase = orb * Math.PI * 2 / count;
            if (!launchCaptured) {
              // First effect update runs after the hero mixer, so this anchor
              // is the rendered release pose rather than the preceding frame.
              if (marker) marker.getWorldPosition(launch);
              else if (arm) arm.localToWorld(launch.set(0, Math.hypot(.095, .195, .355), 0));
              else this.heroVisual.localToWorld(launch.set(-.28, 1.24, .32));
              launchCaptured = true;
            }
            orbitTarget.copy(origin).add(new THREE.Vector3(Math.sin(phase + t * 8) * (3 + t * 2.5), 1.2 + Math.sin(t * 14 + orb*.7) * .25, Math.cos(phase + t * 8) * (3 + t * 2.5)));
            return ballLightningReleasePosition(launch, orbitTarget, side, this.elapsed - started, at, orb * .018);
          };
          const orbs: { at: THREE.Vector3; flashedAt: number }[] = [];
          for (let orb = 0; orb < count; orb++) {
            const visual = createBallLightning(orb + 1, 1 / this.renderer.getPixelRatio()), state = { at: new THREE.Vector3(), flashedAt: -Infinity };
            orbs.push(state);
            visual.layers.forEach((layer, index) => this.effect(layer, 2.15, index === 0 ? t => {
              const progress = THREE.MathUtils.clamp((this.elapsed - started) / 2.15, 0, 1);
              const discharge = Math.exp(-Math.max(0, this.elapsed - state.flashedAt) * 22);
              visual.update(orbPosition(orb, progress, state.at), this.camera.getWorldDirection(view).negate(), t, this.elapsed, discharge);
              const age = this.elapsed - started, formation = THREE.MathUtils.smoothstep(age, orb * .018, .28 + orb * .018);
              visual.layers.forEach((part, partIndex) => {
                part.scale.setScalar((partIndex === 0 ? .8 : 1) * (.28 + .72 * formation));
                if (formation < 1) {
                  const separate = orb === 0 ? 1 : THREE.MathUtils.smoothstep(age, .04 + orb * .025, .14 + orb * .025);
                  part.material.uniforms.opacity.value = Math.max(part.material.uniforms.opacity.value, .82 * (1 - formation)) * separate;
                }
              });
            } : undefined));
          }
          if (bonus?.id === 'twin-orb') {
            const link = createOrbitLink(this.camera.getWorldDirection(new THREE.Vector3()).negate());
            const a = new THREE.Vector3(), b = new THREE.Vector3();
            this.effect(link.mesh, 2.15, t => {
              const progress = THREE.MathUtils.clamp((this.elapsed - started) / 2.15, 0, 1);
              orbPosition(0, progress, a); orbPosition(count - 1, progress, b);
              link.update(a, b, this.elapsed, THREE.MathUtils.smoothstep(t, .12, .22) * (1 - THREE.MathUtils.smoothstep(t, .72, 1)));
            });
          }
          // Visible energy reaches each victim at the existing authoritative
          // contact cue. The four-orb upgrade shares those contacts between orbs.
          targets.forEach((enemy, index) => this.schedule(.65 + index / Math.max(1, targets.length) * .52, () => {
            const orb = index % count, state = orbs[orb]; state.flashedAt = this.elapsed;
            orbPosition(orb, THREE.MathUtils.clamp((this.elapsed - started) / 2.15, 0, 1), state.at);
            const contact = enemy.root.position.clone().add(new THREE.Vector3(0, enemy.brute ? 1.55 : .9, 0));
            contacts.strike(index, contact, contact.clone().sub(state.at), this.elapsed);
            this.bolt(state.at, contact, 0x7abaff, .03, .10);
            if (options.chains && index % 4 === 0 && index + 1 < targets.length) {
              const next = targets[index + 1];
              this.bolt(contact, next.root.position.clone().add(new THREE.Vector3(0, next.brute ? 1.55 : .9, 0)), 0x8abaff, .022, .085);
            }
            contactLightAt = this.elapsed;
            this.burstLight.position.copy(enemy.root.position).y += enemy.height + 1.05; this.burstLight.color.setHex(0x7abaff);
            this.burstLight.intensity = 14;
          }));
          resolveHorde(.65); break;
        }
        case 'tempest': {
          this.cyclone(target, 0x93b2f1, 5.5, 8, 2.45);
          targets.forEach((enemy, index) => this.schedule(.15 + index * .095, () => {
            const at = enemy.root.position.clone().setY(.1);
            this.bolt(at.clone().add(new THREE.Vector3(Math.sin(index) * 1.4, 10, Math.cos(index) * 1.4)), at, 0xc4ddff, .10, .3);
            this.impact(at, 0x7a9fe8, 1.1);
            this.hitEnemy(enemy, color, hitById.get(enemy.id), origin);
          }));
          this.shake = .32; break;
        }
      }
      if (options.shards && school === 'frost' && effect !== 'frostfall') this.schedule(.72, () => {
        for (let i = 0; i < 8; i++) {
          const at = targets[(i * 3) % targets.length].origin;
          this.projectile(at.clone().add(new THREE.Vector3(-1, 6, 0)), at, 0xc0f2ff, effect === 'blizzard' ? .42 : .25, .38, () => this.impact(at, 0x99deff, 1), true);
        }
      });
      if (options.chains && school === 'storm' && effect !== 'chain-lightning' && effect !== 'ball-lightning') this.schedule(.65, () => this.chainLightning(origin, 0xb2d3ff, targets));
      if (options.burning && school === 'ember' && effect !== 'nova') this.schedule(.85, () => {
        for (let i = 0; i < 6; i++) this.impact(origin.clone().add(new THREE.Vector3(Math.sin(i * 2) * 3, .1, Math.cos(i * 2) * 3)), 0xdd4b13, 1.4);
      });
      if (options.drop) this.schedule(1.55, () => this.spawnLoot(origin, options.drop!));
    });
    return new Promise(resolve => { this.attackResolve = resolve; });
  }

  private effect(mesh: THREE.Mesh, duration: number, update?: (t: number, delta: number) => void): THREE.Mesh {
    this.effectsGroup.add(mesh); this.effects.push({ mesh, startedAt: this.elapsed, age: 0, duration, kind: 'custom', radius: 1, update }); return mesh;
  }

  private stroke(points: THREE.Vector3[], color: number, width: number, duration: number): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points);
    return this.effect(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 5), width, 5, false), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })), duration);
  }

  private bolt(from: THREE.Vector3, to: THREE.Vector3, color: number, width: number, duration: number): void {
    const view = this.camera.getWorldDirection(new THREE.Vector3()).negate();
    const geometry = lightningGeometry(from, to, width, view, Math.floor(Math.random() * 0x7fffffff));
    const material = lightningMaterial(color), mesh = new THREE.Mesh(geometry, material);
    this.effect(mesh, duration, t => { material.uniforms.progress.value = t; });
  }

  private weaponSweep(origin: THREE.Vector3, color: number, radius: number, phase: number): void {
    // The physical blade trace stays close to the hero. Its narrow curved edge
    // reads independently of the farther enemy contact bursts.
    const reach = radius * .6, span = Math.PI * .84, turn = Math.PI * 1.3;
    const arc = (angle: number, r = reach) => new THREE.Vector3(Math.sin(angle) * r, .62 + Math.sin(angle * 1.3) * .38 + Math.cos(angle) * .17, Math.cos(angle) * r);
    const points = Array.from({ length: 34 }, (_, i) => arc(i / 33 * span));
    for (const [width, tint, intensity, opacity] of [[.026, 0xffdda0, 1.35, .92], [.058, color, 2.2, .72], [.105, color, 1.4, .19]] as const) {
      const edge = this.stroke(points, tint, width, .57); edge.position.copy(origin);
      (edge.material as THREE.MeshBasicMaterial).color.multiplyScalar(intensity);
      this.effects[this.effects.length - 1].update = t => { edge.rotation.y = phase + t * turn; (edge.material as THREE.MeshBasicMaterial).opacity = Math.sin(t * Math.PI) * opacity; };
    }
    const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 32; i++) {
      const angle = i / 32 * span;
      for (const side of [0, 1]) { const point = arc(angle, reach - (1 - side) * (.25 + Math.sin(angle) * .17)); vertices.push(point.x, point.y - (1 - side) * .1, point.z); uv.push(i / 32, side); }
      if (i < 32) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
    const material = bladeWakeMaterial(), wake = new THREE.Mesh(geometry, material); wake.position.copy(origin);
    this.effect(wake, .67, t => { wake.rotation.y = phase + t * turn - .045; material.uniforms.time.value = this.elapsed; material.uniforms.opacity.value = Math.sin(t * Math.PI) * .88; });
    for (let step = 0; step < 7; step++) this.schedule(step * .055, () => {
      const angle = phase + span + step * .055 / .57 * turn;
      const tip = arc(span).applyAxisAngle(new THREE.Vector3(0, 1, 0), phase + step * .055 / .57 * turn).add(origin);
      this.debris(tip, 3, true, .7, { direction: new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)), spread: .8, lift: .3, grounded: true });
    });
  }

  private releaseNova(origin: THREE.Vector3, radius: number, heat = 1): void {
    const wave = createFireNova(radius, heat, this.encounter), view = new THREE.Vector3();
    wave.update(origin, this.camera.getWorldDirection(view).negate(), 0, this.elapsed);
    wave.layers.forEach((layer, index) => this.effect(layer, 1.3, index === 0 ? t => wave.update(origin, this.camera.getWorldDirection(view).negate(), t, this.elapsed) : undefined));
    this.burstLight.position.copy(origin).setY(3); this.burstLight.color.setHex(0xff942d); this.burstLight.intensity = 55 * heat;
    this.shake = .22 * heat;
  }

  private fireNova(origin: THREE.Vector3, radius: number): void {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.15, radius * 2.15), novaMaterial());
    ground.rotation.x = -Math.PI / 2; ground.position.copy(origin).setY(.09);
    this.effect(ground, 1.3, t => { ground.material.uniforms.progress.value = t; ground.material.uniforms.time.value = this.elapsed; });
    // Different lengths and heights form broken rolling sheets behind the
    // pressure front. Their radial movement exposes the floor and victims.
    for (let i = 0; i < 13; i++) {
      const angle = i * 2.39996, variation = (Math.sin(i * 7.13) + 1) * .5;
      const width = 1.3 + variation * 2.1, height = .22 + variation * .58;
      const material = fireSheetMaterial(i * 3.7), flame = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 6, 4), material);
      flame.rotation.y = angle;
      this.effect(flame, 1.2 + variation * .2, t => {
        const front = 1 - Math.pow(1 - t, 3), r = radius * (.78 + variation * .16) * front;
        flame.position.set(origin.x + Math.sin(angle) * r, .08 + height * .5, origin.z + Math.cos(angle) * r);
        flame.scale.y = .45 + Math.sin(t * Math.PI) * .55;
        material.uniforms.time.value = this.elapsed + i; material.uniforms.opacity.value = Math.sin(t * Math.PI) * (.45 + variation * .22);
      });
    }
    this.emit(origin.clone().setY(.4), 0xffb354, 45, 8, 1); this.debris(origin, 36, true, 1.3); this.shake = .32;
    this.burstLight.position.copy(origin).setY(3); this.burstLight.color.setHex(0xff982f); this.burstLight.intensity = 210;
  }

  private fireContact(at: THREE.Vector3, scale: number): void {
    // One brief hot point and actual tumbling fragments replace the repeated
    // upright flame cards that used to obscure every struck enemy.
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(scale * .65, scale * .65), new THREE.MeshBasicMaterial({ color: 0xffebbd, map: this.glowMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flash.position.copy(at).y += .72; flash.quaternion.copy(this.camera.quaternion);
    this.effect(flash, .13, t => { flash.scale.setScalar(.6 + t * .35); flash.material.opacity = Math.pow(1 - t, 2) * .8; });
    const outward = at.clone().sub(this.hero.position).setY(0).normalize();
    this.debris(at, Math.round(9 * scale), true, .8, { direction: outward, spread: 1.9, lift: .4, grounded: true });
    this.debris(at, Math.round(4 * scale), false, .8, { direction: outward, spread: 2.6, lift: .42, grounded: true });
    if (scale > 1.1) this.groundAsh(at, scale * .85, outward, .65);
  }

  private groundAsh(at: THREE.Vector3, radius: number, direction: THREE.Vector3, duration: number): void {
    const material = ashMaterial();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * .32, .38, 26, 3, true), material);
    this.effect(mesh, duration, t => {
      mesh.position.copy(at).addScaledVector(direction, t * radius * .65); mesh.position.y = .13 + t * .12;
      mesh.scale.set(.28 + t * 1.05, 1 - t * .55, .28 + t * 1.05);
      material.uniforms.time.value = this.elapsed; material.uniforms.opacity.value = Math.sin(t * Math.PI) * .7;
    });
  }

  private meteorImpact(at: THREE.Vector3, incoming: THREE.Vector3, scale: number): void {
    this.onSound?.('blast-fire');
    const direction = incoming.clone().setY(0).normalize();
    this.fireNova(at, 10 * scale);
    this.debris(at, Math.round(44 * scale), false, 1.4, { direction, spread: Math.PI * 1.6, lift: .3, grounded: true });
    this.debris(at, Math.round(48 * scale), true, 1.5, { direction, spread: Math.PI * .95, lift: .36, grounded: true });
    this.groundAsh(at, 3.3 * scale, direction, 1.25);
    // A shallow expanding crown has real volume, but leaves the struck pack
    // visible above the blast instead of covering it with a tall flat fire card.
    const material = fireSheetMaterial(at.x + at.z), crown = new THREE.Mesh(new THREE.CylinderGeometry(1.3 * scale, .5 * scale, .8 * scale, 30, 4, true), material);
    this.effect(crown, .48, t => {
      crown.position.copy(at).addScaledVector(direction, t * .65); crown.position.y = .15 + scale * .22;
      crown.scale.set(.6 + t * 2.2, 1 - t * .65, .6 + t * 2.2);
      material.uniforms.time.value = this.elapsed * 1.4; material.uniforms.opacity.value = Math.sin(t * Math.PI) * .48;
    });
    this.shake = .55 * scale;
  }

  private impact(at: THREE.Vector3, color: number, scale: number): void {
    this.emit(at.clone().setY(.4), color, Math.floor(12 + scale * 6), scale * 1.25, .65);
    // Short separated ballistic streaks read as hot fragments at contact. Their
    // origins and curved paths vary, instead of outlining a large seven-spoke star.
    const reach = Math.sqrt(scale) * .65;
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4 + at.x * .7 + at.z * .3;
      const outward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const start = at.clone().addScaledVector(outward, .10 + i * .025).setY(.12 + i % 3 * .09);
      const points = [start, start.clone().addScaledVector(outward, reach * .27).add(new THREE.Vector3(0, reach * .22, 0)), start.clone().addScaledVector(outward, reach * .55).add(new THREE.Vector3(0, reach * .16, 0))];
      const mesh = this.stroke(points, color, .012 + i % 2 * .005, .32 + i * .018);
      this.effects[this.effects.length - 1].update = t => {
        mesh.position.copy(outward).multiplyScalar(t * reach * .65); mesh.position.y = t * reach * .22 - t * t * .7;
        (mesh.material as THREE.Material).opacity = Math.pow(1 - t, 1.5) * .8;
      };
    }
  }

  private targetMark(at: THREE.Vector3, color: number, radius: number): void { this.ring(at, color, radius, .95, 'ground'); }

  private firePillar(at: THREE.Vector3, height: number, duration: number): void {
    const seed = at.x * 2.7 + at.z * 1.3;
    // Three unequal, bent tongues share a low ember bed. Ring sections narrow
    // to real tips, so every view sees curved fire rather than intersecting cards.
    for (let tongue = 0; tongue < 3; tongue++) {
      const angle = seed + tongue * 2.4;
      const tall = height * (tongue === 0 ? 1 : .48 + tongue * .14);
      const radius = height * (tongue === 0 ? .145 : .09);
      const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
      const rings = 18, sides = 14;
      for (let ring = 0; ring <= rings; ring++) {
        const h = ring / rings, taper = Math.pow(1 - h, .9);
        const bend = h * h * tall * (.18 + tongue * .035);
        const width = radius * taper * (.8 + Math.sin(h * Math.PI) * .34) + .006;
        for (let side = 0; side <= sides; side++) {
          const a = side / sides * Math.PI * 2;
          const ripple = 1 + Math.sin(a * 3 + h * 13 + angle) * .26;
          vertices.push(Math.cos(a) * width * ripple + Math.sin(angle) * bend, h * tall, Math.sin(a) * width * ripple + Math.cos(angle) * bend);
          uv.push(side / sides, h);
          if (ring < rings && side < sides) { const k = ring * (sides + 1) + side; indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2); }
        }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
      const material = firePlumeMaterial(angle, tall), plume = new THREE.Mesh(geometry, material);
      const offset = tongue === 0 ? 0 : radius * 1.4;
      plume.position.copy(at).add(new THREE.Vector3(Math.sin(angle) * offset, .025, Math.cos(angle) * offset));
      this.effect(plume, duration, t => {
        material.uniforms.time.value = this.elapsed; material.uniforms.opacity.value = Math.min(1, t * 9) * Math.pow(1 - t, .65) * .9;
        plume.scale.y = Math.min(1, t * 7) * (1 + Math.sin(t * 9 + angle) * .055);
        plume.position.x = at.x + Math.sin(angle) * (offset + t * .32); plume.position.z = at.z + Math.cos(angle) * (offset + t * .32);
      });
    }
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(height * .85, height * .85), new THREE.MeshBasicMaterial({ color: 0x35120a, map: this.glowMap, transparent: true, depthWrite: false }));
    bed.rotation.x = -Math.PI / 2; bed.position.copy(at).y += .035;
    this.effect(bed, duration, t => { bed.material.opacity = Math.sin(t * Math.PI) * .68; bed.scale.setScalar(.6 + t * .5); });
    this.groundAsh(at, height * .36, new THREE.Vector3(Math.sin(seed), 0, Math.cos(seed)), duration);
    this.debris(at, 21, true, 1); this.debris(at, 9, false, .8);
  }

  private projectile(from: THREE.Vector3, to: THREE.Vector3, color: number, size: number, duration: number, hit: () => void, ice = false): void {
    const geometry = ice ? iceShardGeometry(size * .7, size * 4.8, from.x + from.z).translate(0, -size * 2.4, 0) : new THREE.IcosahedronGeometry(size, 1);
    const material = ice ? iceShardMaterial() : new THREE.MeshStandardMaterial({ color: 0x533522, emissive: color, emissiveIntensity: 2, roughness: .68, transparent: true });
    const mesh = new THREE.Mesh(geometry, material); if (ice) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    if (ice) {
      const direction = from.clone().sub(to).normalize();
      const trail = this.stroke([new THREE.Vector3(), direction.clone().multiplyScalar(size * 2), direction.clone().multiplyScalar(size * 5)], 0x8fcee1, size * .055, duration + .08);
      this.effects[this.effects.length - 1].update = t => { trail.position.copy(from).lerp(to, Math.min(1, t * 1.1)); (trail.material as THREE.Material).opacity = Math.sin(t * Math.PI) * .42; };
    }
    if (!ice) {
      material.color.setHex(0x817365); material.map = this.materials.wall.map;
      material.emissiveIntensity = .045; material.roughness = .94; material.flatShading = true;
      // Coherent deformation keeps shared triangle corners together while
      // breaking the round silhouette into uneven, sharply lit stone facets.
      const vertices = geometry.getAttribute('position');
      for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
        const roughness = .87 + Math.sin(x / size * 4.7 + z / size * 2.3) * .13 + Math.cos(y / size * 5.1 - x / size * 1.9) * .09;
        vertices.setXYZ(i, x * roughness * 1.08, y * roughness, z * roughness * .91);
      }
      vertices.needsUpdate = true; geometry.computeVertexNormals();
      // A tapered, three-dimensional flame envelope trails the moving rock.
      const tailLength = size * 3.8, tailGeometry = new THREE.CylinderGeometry(size * .08, size * .75, tailLength, 18, 6, true);
      tailGeometry.translate(0, tailLength * .5, 0);
      const tailMaterial = fireSheetMaterial(size * 9), tail = new THREE.Mesh(tailGeometry, tailMaterial);
      tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
      this.effect(tail, duration + .08, t => {
        tail.position.copy(from).lerp(to, Math.min(1, t * 1.1));
        tailMaterial.uniforms.time.value = this.elapsed * 1.5; tailMaterial.uniforms.opacity.value = Math.min(1, t * 8) * (1 - Math.max(0, t - .85) / .15) * .66;
      });
    }
    this.effect(mesh, duration + .08, t => { mesh.position.copy(from).lerp(to, Math.min(1, t * 1.1)); if (!ice) {
      mesh.rotation.x += .12;
      // Override the generic effect fade: solid rock throughout its flight,
      // disappearing only in the brief contact window beside the blast.
      material.opacity = 1 - THREE.MathUtils.smoothstep(t, .87, 1);
    } else material.opacity = .94 * (1 - THREE.MathUtils.smoothstep(t, .78, 1)); this.emit(mesh.position, color, ice ? 2 : 3, size * .8, .6); });
    this.schedule(duration, hit);
  }

  private glacialShard(at: THREE.Vector3, heading: number, height: number, seed: number, targetId: string): void {
    const crystal = createFrostfallCrystal(seed, height / 1.55, .95);
    const direction = new THREE.Vector3(Math.sin(heading) * (.18 + Math.sin(seed) * .08), 1, Math.cos(heading) * .2).normalize();
    const tip = at.clone();
    crystal.layers.forEach((layer, index) => {
      layer.name = `glacial-surge:${targetId}`; layer.userData.targetId = targetId;
      this.effect(layer, 1.05, index === 0 ? t => {
        const emergence = THREE.MathUtils.smoothstep(t, 0, .13);
        tip.copy(at).addScaledVector(direction, height * emergence - Math.max(0, t - .65) * height * 1.5);
        crystal.update(tip, direction, this.elapsed, (1 - THREE.MathUtils.smoothstep(t, .68, 1)) * .96);
        // Scale the emergence rather than translating a full shard through
        // the floor, which would leave transparent crystal under the tiles.
        crystal.layers.forEach(part => part.scale.set(1, emergence, 1));
      } : undefined);
    });
    // Sparse broken chips keep each crown irregular without multiplying the
    // expensive clear-crystal layers for every decorative satellite.
    if (seed % 2 === 0) {
      const chip = new THREE.Mesh(iceShardGeometry(.15, height * .37, seed + 7), iceShardMaterial());
      chip.position.copy(at).add(new THREE.Vector3(Math.cos(seed) * .23, 0, Math.sin(seed) * .23));
      chip.rotation.set(Math.sin(seed) * .35, seed, .3);
      this.effect(chip, .94, t => { chip.scale.y = THREE.MathUtils.smoothstep(t, 0, .14); chip.material.opacity = 1 - THREE.MathUtils.smoothstep(t, .6, 1); });
    }
    const frost = new THREE.Mesh(new THREE.PlaneGeometry(.8, .7), new THREE.MeshBasicMaterial({ color: 0x50869b, map: this.glowMap, transparent: true, opacity: .25, depthWrite: false }));
    frost.position.copy(at).y = .035; frost.rotation.set(-Math.PI / 2, 0, heading + seed);
    this.effect(frost, .9, t => { frost.material.opacity = Math.sin(t * Math.PI) * .28; });
    this.emit(at.clone().setY(.16), 0xafd9e2, 3, .65, .35);
  }


  private cyclone(at: THREE.Vector3, color: number, radius: number, height: number, duration: number, horizontal = false): void {
    for (let layer = 0; layer < 3; layer++) {
      const luminous = layer === 2;
      const material = stormWispMaterial(luminous ? color : 0x7787a4, luminous);
      const geometry = stormFilamentsGeometry(radius * (layer === 1 ? .82 : 1), height, horizontal, 1.7 + layer * 4.1, !luminous);
      const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(at);
      this.effect(mesh, duration, t => {
        material.uniforms.time.value = this.elapsed + layer * 2.3;
        material.uniforms.opacity.value = Math.sin(Math.PI * t) * (luminous ? .36 : layer === 0 ? .5 : .32);
        mesh.rotation.y = t * (horizontal ? -4.2 : 3.8) * (1 + layer * .23) + layer * 1.7;
        mesh.position.x = at.x + Math.sin(t * 5 + layer) * radius * .055;
        mesh.position.z = at.z + Math.sin(t * 4.1 + layer * 2) * radius * .04;
        mesh.scale.setScalar(.65 + Math.sin(t * Math.PI) * .35);
      });
    }
  }

  private debris(at: THREE.Vector3, count: number, hot = false, force = 1, motion?: { direction: THREE.Vector3; spread: number; lift: number; grounded: boolean }): void {
    const outward = motion ? motion.direction.clone().setY(0).normalize() : at.clone().sub(this.hero.position).setY(0).normalize();
    for (let i = 0; i < count && this.fragments.length < 420; i++) {
      const angle = motion ? Math.atan2(outward.x, outward.z) + (Math.random() - .5) * motion.spread : Math.random() * Math.PI * 2;
      const speed = (1.7 + Math.random() * 4.1) * force;
      const size = hot ? .025 + Math.random() * .04 : .065 + Math.random() * .14;
      const life = hot ? .3 + Math.random() * .55 : .75 + Math.random() * .65;
      this.fragments.push({ position: at.clone().add(new THREE.Vector3((Math.random() - .5) * .35, (motion?.grounded ? .08 + Math.random() * .17 : .35 + Math.random() * .65), (Math.random() - .5) * .35)),
        velocity: new THREE.Vector3(Math.sin(angle) * speed + outward.x * force * 1.6, (2 + Math.random() * 4) * force * (motion?.lift ?? 1), Math.cos(angle) * speed + outward.z * force * 1.6),
        rotation: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin: new THREE.Vector3((Math.random() - .5) * 12, (Math.random() - .5) * 12, (Math.random() - .5) * 12),
        scale: new THREE.Vector3(size * (hot ? .5 : 1.4), size * (hot ? 3.8 : .65), size),
        color: hot ? new THREE.Color().setRGB(2.3, .62 + Math.random() * .65, .05 + Math.random() * .25) : new THREE.Color().setScalar(.18 + Math.random() * .25),
        life, maxLife: life, hot, bounced: false });
    }
  }

  private updateFragments(delta: number): void {
    let stones = 0, hot = 0;
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const fragment = this.fragments[i]; fragment.life -= delta;
      if (fragment.life <= 0) { this.fragments.splice(i, 1); continue; }
      fragment.velocity.y -= delta * (fragment.hot ? 5 : 9); fragment.position.addScaledVector(fragment.velocity, delta);
      if (fragment.position.y < .06) { fragment.position.y = .06; if (!fragment.bounced) { fragment.velocity.y = Math.abs(fragment.velocity.y) * .23; fragment.velocity.x *= .58; fragment.velocity.z *= .58; fragment.bounced = true; } else fragment.velocity.y = 0; }
      fragment.rotation.addScaledVector(fragment.spin, delta);
      const mesh = fragment.hot ? this.hotFragments : this.stoneFragments, index = fragment.hot ? hot++ : stones++;
      const pose = this.fragmentTransform; pose.position.copy(fragment.position); pose.rotation.set(fragment.rotation.x, fragment.rotation.y, fragment.rotation.z);
      pose.scale.copy(fragment.scale).multiplyScalar(Math.min(1, fragment.life / .22)); pose.updateMatrix(); mesh.setMatrixAt(index, pose.matrix); mesh.setColorAt(index, fragment.color);
    }
    this.stoneFragments.count = stones; this.hotFragments.count = hot;
    for (const mesh of [this.stoneFragments, this.hotFragments]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }

  private directedParticle(at: THREE.Vector3, velocity: THREE.Vector3, color: number, life: number, size: number): void {
    if (this.particles.length < 890) this.particles.push({ position: at.clone(), velocity, color: new THREE.Color(color), life, maxLife: life, size });
  }

  private summonGuardian(at: THREE.Vector3, duration: number): void {
    const root = this.model('guardian', 4.5) ?? this.makeEnemy(true, true);
    root.traverse(object => { if (object instanceof THREE.Mesh) {
      const source = Array.isArray(object.material) ? object.material[0] : object.material;
      const material = source instanceof THREE.MeshStandardMaterial ? source.clone() : new THREE.MeshStandardMaterial();
      const crystal = /glow|crystal/i.test(object.name + source.name);
      material.color.setHex(crystal ? 0x77cae5 : 0x91a9b5); material.emissive.setHex(crystal ? 0x257794 : 0x000000); material.emissiveIntensity = crystal ? .75 : 0;
      material.roughness = crystal ? .35 : .74; material.metalness = .08; material.transparent = true; material.opacity = .96;
      object.material = material; object.receiveShadow = false;
    } });
    this.effectsGroup.add(root);
    const animator = new EnemyAnimator(root, { kind: 'guardian', phase: 0 });
    this.summoned.push({ root, age: 0, duration, update: t => { animator.update(3.35 + t * duration, { moving: .65, threat: 1 }); root.position.copy(at).add(new THREE.Vector3(0, 0, -Math.sin(t * Math.PI) * 2.7)); this.burstLight.position.copy(root.position).add(new THREE.Vector3(1, 4.4, 2)); this.burstLight.color.setHex(0xa3d9ef); this.burstLight.intensity = Math.sin(t * Math.PI) * 160; root.rotation.y = Math.PI; root.rotation.x = Math.sin(Math.min(1, t * 2) * Math.PI) * -.35; root.traverse(object => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) object.material.opacity = Math.min(.96, t * 6) * (1 - Math.max(0, t - .7) * 3); }); } });
    this.impact(at, 0xa2e5ff, 2.8);
  }

  private schedule(delay: number, callback: () => void): void { this.scheduled.push({ at: this.elapsed + delay, callback }); }

  private ring(origin: THREE.Vector3, color: number, radius: number, duration: number, kind: Effect['kind']): void {
    const geometry = kind === 'slash' ? new THREE.RingGeometry(.6, 1, 64, 1, 0, Math.PI * 1.45) : new THREE.RingGeometry(.6, 1, 72);
    const material = new THREE.MeshBasicMaterial({ color, alphaMap: this.waveMap, transparent: true, opacity: 1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material); mesh.rotation.x = -Math.PI / 2; mesh.position.copy(origin); mesh.position.y += kind === 'slash' ? .65 : .04;
    this.effectsGroup.add(mesh); this.effects.push({ mesh, startedAt: this.elapsed, age: 0, duration, kind, radius });
  }

  private chainLightning(origin: THREE.Vector3, color: number, targets = this.enemies.filter(enemy => !enemy.dead)): void {
    let previous = origin.clone(); previous.y = 1.1;
    targets.forEach((enemy, index) => {
      const from = previous.clone(), to = enemy.root.position.clone(); to.y = enemy.brute ? 1.9 : .9; previous = to;
      this.schedule(.17 + index / Math.max(1, targets.length) * .52, () => {
        this.bolt(from, to, color, .055, .55);
      });
    });
  }

  private chainBolt(from: THREE.Vector3, arrival: THREE.Vector3, echo = false): void {
    const view = this.camera.getWorldDirection(new THREE.Vector3()).negate();
    const material = chainLightningMaterial(); material.uniforms.opacity.value = echo ? .7 : 1;
    const mesh = new THREE.Mesh(chainLightningGeometry(from, arrival, view, Math.floor(Math.random() * 0x7fffffff), true, echo ? .12 : .16), material);
    this.effect(mesh, CHAIN_BOLT_LIFETIME, progress => { material.uniforms.progress.value = progress; });
  }

  private hitEnemy(enemy: Enemy, _color: number, hit?: CombatHit, contactOrigin?: THREE.Vector3): void {
    this.attackPending.delete(enemy.id); this.attackHitAt = this.elapsed;
    if (enemy.dead) return;
    const school = RPG_SPELLS.find(spell => spell.id === this.lastAttack?.spellId)?.school;
    const physicalCleave = this.lastAttack?.effect === 'cleave' && !(this.lastAttack.options.burning || this.lastAttack.options.wide || this.lastAttack.options.echo);
    const element = physicalCleave ? 'other' : school === 'ember' ? 'fire' : school === 'storm' ? 'electric' : 'other';
    const reactionOrigin = contactOrigin ?? this.hero.position;
    const reaction = createHitReaction({ at: this.elapsed, x: enemy.root.position.x, z: enemy.root.position.z, sourceX: reactionOrigin.x, sourceZ: reactionOrigin.z, phase: enemy.phase, heavy: enemy.brute, maxHp: enemy.maxHp, hit, element });
    enemy.root.userData.hitReaction = reaction;
    const damage = hit?.damage ?? enemy.hp;
    enemy.hp = hit ? hit.hpAfter : 0;
    enemy.dead = reaction.lethal;
    // Contact feel: a flash in the element's color, the number, a sound and,
    // for heavy blows, a short hit-stop and a camera punch.
    enemy.root.userData.hitFlash = { at: this.elapsed, color: ELEMENT_FLASH[school === 'frost' && !physicalCleave ? 'frost' : element === 'fire' ? 'fire' : element === 'electric' ? 'electric' : 'other'] };
    this.damageNumbers.spawn(enemy.root.position.clone().add(new THREE.Vector3((Math.random() - .5) * .5, enemy.height + .15, 0)), damage, reaction.lethal ? 'kill' : damage >= enemy.maxHp * .45 ? 'big' : 'hit');
    this.onSound?.(physicalCleave ? 'impact-blade' : school === 'frost' ? 'impact-frost' : school === 'storm' ? 'impact-storm' : 'impact-fire');
    if (enemy.brute) this.onSound?.('impact-heavy');
    if (reaction.lethal && this.enemies.every(other => other.dead)) this.schedule(.9, () => this.onSound?.('room-clear'));
    if ((reaction.lethal || enemy.brute || physicalCleave) && this.elapsed - this.lastHitStopAt > .3) {
      this.hitStop = reaction.lethal && enemy.brute ? .12 : reaction.lethal ? .07 : .05; this.lastHitStopAt = this.elapsed;
    }
    if (reaction.lethal) this.zoomPunch = Math.max(this.zoomPunch, enemy.brute ? .045 : .018);
    if (reaction.lethal) this.schedule(.42, () => {
      // The body lands: a puff of grave dust and the clatter of bone.
      const at = enemy.root.position.clone().setY(.05);
      this.emit(at.clone().setY(.2), 0x6f675a, enemy.brute ? 22 : 12, enemy.brute ? 1.3 : .9, .7);
      this.debris(at, enemy.brute ? 6 : 3, false, .35, { direction: at.clone().sub(this.hero.position).setY(0), spread: 1.4, lift: .25, grounded: true });
      this.onSound?.('collapse');
    });
    enemy.clips?.play(enemy.dead ? (Math.sin(enemy.phase * 7.3) > 0 ? 'death-fall' : 'death') : reaction.side > 0 ? 'hit-side' : 'hit');
    if (enemy.dead) {
      enemy.deathAt = this.elapsed;
      this.schedule(.6, () => this.floorLoot.dropMotes(enemy.root.position.clone(), enemy.brute ? 9 : enemy.elite ? 8 : 4, this.elapsed));
      if (enemy.elite) this.schedule(.45, () => {
        // The champion falls: a ring of gold light and a chime.
        const at = enemy.root.position.clone().setY(.6);
        this.emit(at, ELITE_COLOR, 44, 2, 1); this.emit(at.clone().setY(1.4), 0xfff1c4, 18, 1.1, .8);
        this.burstLight.position.copy(at).setY(1.8); this.burstLight.color.setHex(ELITE_COLOR); this.burstLight.intensity = Math.max(this.burstLight.intensity, 40);
        this.onSound?.('elite-defeat');
      });
      this.attackDuration = Math.max(this.attackDuration, this.attackAge + reaction.duration + .08);
    }
    this.renderer.shadowMap.needsUpdate = true;
    const ballLightning = this.lastAttack?.spellId === 'ball_lightning';
    const nova = this.lastAttack?.spellId === 'ember';
    // Spell contacts own their element. The body response must remain visible
    // rather than disappear inside a generic particle explosion.
    if (nova) this.novaContacts?.strike(this.enemies.indexOf(enemy), enemy.root.position, enemy.origin.clone().sub(this.hero.position).setY(0).normalize(), this.elapsed, enemy.brute ? 1.3 : .85 + Math.abs(Math.sin(enemy.phase)) * .25);
    if (physicalCleave) {
      const at = enemy.root.position.clone().setY(Math.min(1.15, enemy.height * .6));
      const slash = new THREE.Mesh(new THREE.PlaneGeometry(enemy.brute ? 1.35 : .95, .45), cleaveEdgeMaterial());
      slash.position.copy(at); slash.quaternion.copy(this.camera.quaternion); slash.rotateZ(-.28);
      this.effect(slash, .2, t => { slash.scale.setScalar(.65 + t * .6); slash.material.uniforms.opacity.value = (1 - t) * .85; });
      this.emit(at, 0xe0e9ed, 3, .6, .13);
    }
    if (!nova && !physicalCleave && !(this.lastAttack?.effect === 'cleave' && contactOrigin) && (this.lastAttack?.options.burning || RPG_SPELLS.find(spell => spell.id === this.lastAttack?.spellId)?.school === 'ember')) {
      this.fireContact(enemy.root.position, enemy.brute ? 1.35 : .7 + Math.abs(Math.sin(enemy.phase)) * .45);
      const scorch = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ color: 0x32261b, alphaMap: this.glowMap, transparent: true, opacity: .2, depthWrite: false }));
      scorch.rotation.x = -Math.PI / 2; scorch.position.copy(enemy.origin).y = -.025;
      this.effect(scorch, 4, t => { scorch.material.opacity = (1 - t) * .2; });
    }
    if (enemy.brute) {
      if (ballLightning) this.debris(enemy.origin, 3, false, .3, { direction: enemy.origin.clone().sub(this.hero.position).setY(0), spread: 1, lift: .2, grounded: true });
      // Nova already owns three short-lived cooling contact fragments; do not
      // leave a second generic stone pool hovering after the ash erosion.
      else if (!nova) this.debris(enemy.origin, 2, false, .25, { direction: enemy.origin.clone().sub(this.hero.position).setY(0), spread: .65, lift: .12, grounded: true });

    }
  }

  private spawnLoot(origin: THREE.Vector3, drop: { name: string; rarity: string }): void {
    const colors: Record<string, number> = { common: 0xb8c2c5, uncommon: 0x79dcb1, rare: 0x6aa9ff, epic: 0xc38aff, legendary: 0xffba57 };
    const color = colors[drop.rarity] ?? colors.rare;
    const position = origin.clone().add(new THREE.Vector3(2.1, .1, -.9));
    // The relic stays on the floor until the hero walks over it.
    const at = slideStep({ x: origin.x, z: origin.z }, position.x - origin.x, position.z - origin.z, this.walkable);
    position.set(at.x, .1, at.z);
    this.emit(position, color, 35, 1.7, 1.5);
    this.floorLoot.dropRelic(position, color, this.elapsed); this.onSound?.('relic-drop');
  }

  private emit(origin: THREE.Vector3, color: number, count: number, speed: number, life: number): void {
    for (let i = 0; i < count && this.particles.length < 890; i++) {
      const angle = Math.random() * Math.PI * 2, amount = (.2 + Math.random() * .8) * speed;
      this.particles.push({ position: origin.clone(), velocity: new THREE.Vector3(Math.cos(angle) * amount, Math.random() * speed * .6 + .3, Math.sin(angle) * amount), color: new THREE.Color(color), life, maxLife: life, size: speed < .2 ? .2 : speed < .6 ? .4 : .28 + Math.random() * .42 });
    }
  }

  setCombatSafeArea(top: number, bottom: number): void {
    const safeTop = Number.isFinite(top) ? Math.max(0, top) : 0;
    const safeBottom = Number.isFinite(bottom) ? Math.max(0, bottom) : 0;
    if (safeTop === this.combatSafeTop && safeBottom === this.combatSafeBottom) return;
    this.combatSafeTop = safeTop; this.combatSafeBottom = safeBottom;
    this.updateCameraProjection(Math.max(1, this.canvas.clientWidth), Math.max(1, this.canvas.clientHeight));
  }

  /**
   * The base view, widened in a fight so the hero and the whole pack fit
   * between the panels. The framing eases toward its target in tick().
   */
  private updateCameraProjection(width: number, height: number, snap = false): void {
    const separateControls = getComputedStyle(this.canvas).getPropertyValue('--rpg-separate-controls').trim() === '1';
    const halfHeight = dungeonCameraHalfHeight(width, height, separateControls), ratio = width / height;
    const verticalOffset = dungeonCameraVerticalOffset(height, separateControls) + dungeonPortraitOffset(width, height, this.combatSafeTop, this.combatSafeBottom);
    const living = this.engaged ? this.enemies.filter(enemy => !enemy.dead) : [];
    const portrait = width <= 760 && height > width;
    const target = { scale: 1, shift: 0, horizontal: portrait };
    if (living.length && (separateControls || (width > 760 && height > 650) || portrait)) {
      const anchor = this.hero.position, view = new THREE.OrthographicCamera(-halfHeight * ratio, halfHeight * ratio, halfHeight + verticalOffset, -halfHeight + verticalOffset, .1, 180);
      view.position.copy(anchor).add(new THREE.Vector3(17, 25, 20));
      view.lookAt(anchor.x, .2, anchor.z - 1.8); view.updateMatrixWorld();
      if (!portrait) {
        const screenY = (point: THREE.Vector3) => (1 - point.project(view).y) * height * .5;
        const ys = [screenY(anchor.clone()), screenY(anchor.clone().add(new THREE.Vector3(0, 2.1 * ACTOR_SCALE, 0)))];
        for (const enemy of living) ys.push(screenY(enemy.origin.clone()), screenY(enemy.origin.clone().add(new THREE.Vector3(0, enemy.height + .55, 0))));
        const bottom = separateControls ? height - 22 : (this.combatSafeBottom || height - 22);
        const fit = dungeonCombatFrame(Math.min(...ys), Math.max(...ys), Math.max(56, this.combatSafeTop), bottom, height);
        target.scale = fit.scale; target.shift = fit.shift;
      } else {
        const pixelScale = height / (2 * halfHeight), centerX = (point: THREE.Vector3) => (point.project(view).x + 1) * width * .5;
        const heroX = centerX(anchor.clone()), xs = [heroX - .65 * ACTOR_SCALE * pixelScale, heroX + .65 * ACTOR_SCALE * pixelScale];
        for (const enemy of living) {
          const x = centerX(enemy.origin.clone()), radius = (enemy.brute ? enemy.height * .4 : .72 * ACTOR_SCALE) * pixelScale;
          xs.push(x - radius, x + radius);
        }
        const fit = dungeonCombatFrame(Math.min(...xs), Math.max(...xs), 18, width - 18, width);
        target.scale = fit.scale; target.shift = fit.shift;
      }
    }
    this.frameTarget = target;
    if (snap || !this.frame || this.framing.horizontal !== portrait) this.framing = { ...target };
    this.applyFraming(width, height, halfHeight, verticalOffset);
  }

  private applyFraming(width: number, height: number, halfHeight: number, verticalOffset: number): void {
    const ratio = width / height, { scale, shift, horizontal } = this.framing, half = halfHeight * scale;
    if (horizontal) {
      const offsetX = -shift * 2 * half * ratio / width;
      this.camera.left = -half * ratio + offsetX; this.camera.right = half * ratio + offsetX;
      this.camera.top = half + verticalOffset * scale; this.camera.bottom = -half + verticalOffset * scale;
    } else {
      const offset = verticalOffset + shift * 2 * half / height;
      this.camera.left = -half * ratio; this.camera.right = half * ratio;
      this.camera.top = half + offset; this.camera.bottom = -half + offset;
    }
    this.camera.updateProjectionMatrix();
  }

  /** Eases the framing toward its target; re-measures the fight now and then. */
  private easeFraming(delta: number): void {
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight);
    if (this.engaged && this.elapsed - this.lastFrameMeasureAt > .5) { this.lastFrameMeasureAt = this.elapsed; this.updateCameraProjection(width, height); }
    const t = 1 - Math.exp(-delta * 2.4), f = this.framing, goal = this.frameTarget;
    if (Math.abs(f.scale - goal.scale) < 1e-4 && Math.abs(f.shift - goal.shift) < .05) return;
    f.scale += (goal.scale - f.scale) * t; f.shift += (goal.shift - f.shift) * t;
    const separateControls = getComputedStyle(this.canvas).getPropertyValue('--rpg-separate-controls').trim() === '1';
    this.applyFraming(width, height, dungeonCameraHalfHeight(width, height, separateControls),
      dungeonCameraVerticalOffset(height, separateControls) + dungeonPortraitOffset(width, height, this.combatSafeTop, this.combatSafeBottom));
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    this.updateCameraProjection(width, height);
    const qualityRatio = this.quality === 0 ? 1.5 : this.quality === 1 ? 1 : .75;
    this.renderer.setPixelRatio(this.softwareRenderer ? .7 : Math.min(window.devicePixelRatio || 1, qualityRatio)); this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.quality === 2 ? .75 : 1);
    this.composer.setSize(width, height);
    this.bloom.enabled = !this.softwareRenderer && this.quality < 2;
  }

  start(): void {
    if (this.frame || this.disposed) return;
    this.lastFrameAt = performance.now();
    const animate = () => {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(animate);
      const now = performance.now(), delta = (now - this.lastFrameAt) / 1000;
      this.lastFrameAt = now;
      // A hidden tab has no presentation to draw; an answer's release resumes
      // on return. Learning and rewards never depend on background elapsed time.
      if (document.hidden) { this.fpsFrames = 0; this.fpsMeasuredAt = performance.now(); return; }
      this.tick(delta);
    };
    animate();
  }

  private tick(delta: number): void {
    this.fpsFrames++;
    const measuredAt = performance.now();
    if (measuredAt - this.fpsMeasuredAt > 1000) {
      this.framesPerSecond = this.fpsFrames * 1000 / (measuredAt - this.fpsMeasuredAt);
      this.fpsMeasuredAt = measuredAt; this.fpsFrames = 0;
      // Ignore asset/shader warm-up and brief attack spikes. Retain the complete
      // art on a fast GPU, lower fill cost only after sustained missed frames.
      if (!this.softwareRenderer && this.loadedAt && measuredAt - this.loadedAt > 8000 && !this.attacking && !this.paused) {
        this.lowFpsSamples = this.framesPerSecond < 29 ? this.lowFpsSamples + 1 : 0;
        this.highFpsSamples = this.framesPerSecond > 48 ? this.highFpsSamples + 1 : 0;
        if (this.lowFpsSamples >= 3 && this.quality < 2) {
          this.quality++; this.lowFpsSamples = this.highFpsSamples = 0; this.width = 0;
        } else if (this.highFpsSamples >= 8 && this.quality > 0) {
          this.quality--; this.lowFpsSamples = this.highFpsSamples = 0; this.width = 0;
        }
      }
    }
    // Hit-stop: a heavy contact holds the whole world for a few real frames.
    if (this.hitStop > 0) { this.hitStop -= delta; delta *= .04; }
    this.elapsed += delta; this.resize();
    // Releases use elapsed wall time even on a slow GPU. Execute nested cues at
    // their authored times so a late frame cannot stretch a three-second cast.
    const frameTime = this.elapsed;
    this.scheduled.sort((a, b) => a.at - b.at);
    while (this.scheduled.length && this.scheduled[0].at <= frameTime) {
      const task = this.scheduled.shift()!; this.elapsed = task.at; task.callback();
      this.scheduled.sort((a, b) => a.at - b.at);
    }
    this.elapsed = frameTime;
    while (this.exploreRoute.length && this.hero.position.distanceToSquared(this.exploreRoute[0]!) <= .06 ** 2) this.exploreRoute.shift();
    const exploring = this.exploring;
    let travelTarget = this.hero.position;
    {
      // Go where the player points, in combat too; otherwise stay put.
      const keys = this.exploreKeys, steer = new THREE.Vector3(
        (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), 0, (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0));
      if (exploring && steer.lengthSq() > 0) {
        // Screen directions on the isometric camera (offset 17, 25, 20).
        const right = new THREE.Vector3(20, 0, -17).normalize(), down = new THREE.Vector3(17, 0, 20).normalize();
        travelTarget = this.hero.position.clone().addScaledVector(right.multiplyScalar(steer.x).add(down.multiplyScalar(steer.z)).normalize(), 3);
      } else travelTarget = exploring ? this.exploreRoute[0] ?? this.hero.position : this.hero.position;
    }
    const distance = this.hero.position.distanceTo(travelTarget);
    const walking = distance > .025 && !this.rooted;
    if (walking && this.attacking && this.heroMotion) {
      // The player moves on while the spell plays out: drop the cast pose and run.
      this.heroMotion = undefined; this.heroVisual.position.x = this.heroVisual.position.z = 0; this.heroAnimator?.interrupt();
    }
    const travel = this.heroUsesAuthoredMotion && walking ? advanceHeroTravel(distance, this.heroTravelSpeed, delta, this.heroWalkCycle, Math.max(HERO_RUN_SPEED, this.heroAnimator?.runSpeed ?? 0) * (this.boon === 'swiftness' ? SWIFT_RUN : 1)) : undefined;
    this.heroTravelSpeed = travel?.speed ?? 0;
    const heroFrom = this.hero.position.clone();
    const shadowInterval = distance > .08 || this.attacking ? (this.softwareRenderer ? .2 : .065) : .65;
    if (this.elapsed - this.lastShadowUpdate > shadowInterval) {
      this.renderer.shadowMap.needsUpdate = true; this.lastShadowUpdate = this.elapsed;
    }
    if (walking) {
      const step = travel ? travel.distance : distance * (1 - Math.exp(-delta * 2.1));
      const next = slideStep({ x: this.hero.position.x, z: this.hero.position.z }, (travelTarget.x - this.hero.position.x) / distance * step, (travelTarget.z - this.hero.position.z) / distance * step, this.walkable);
      if (next.x === this.hero.position.x && next.z === this.hero.position.z) { this.exploreRoute.length = 0; this.heroTravelSpeed = 0; }
      this.hero.position.set(next.x, 0, next.z);
    }
    // Animate the distance actually covered: a hero pressed against a wall stands.
    const gaitBefore = this.heroAnimator?.gaitPhase ?? 0;
    this.heroAnimator?.update(delta, travel && delta > 0 ? Math.min(travel.distance, this.hero.position.distanceTo(heroFrom)) / delta : 0);
    // A footfall each time a foot lands in the gait cycle.
    const gaitAfter = this.heroAnimator?.gaitPhase ?? 0;
    if (this.heroTravelSpeed > .6 && gaitAfter !== gaitBefore && (gaitAfter < gaitBefore || (gaitBefore < .5 && gaitAfter >= .5))) this.onSound?.('step');
    if (walking) {
      this.heroVisual.position.y = this.heroUsesAuthoredMotion ? 0 : Math.abs(Math.sin(this.elapsed * 11)) * .09;
      setPlanarHeroHeading(this.heroVisual.rotation, turnToward(this.heroVisual.rotation.y, Math.atan2(travelTarget.x - heroFrom.x, travelTarget.z - heroFrom.z), delta, 16));
    } else {
      this.heroVisual.position.y = this.heroUsesAuthoredMotion ? 0 : Math.sin(this.elapsed * 2.4) * .018;
      const heading = this.attacking && this.attackHeading !== undefined ? this.attackHeading
        : !this.engaged || this.attacking ? this.heroVisual.rotation.y
        : turnToward(this.heroVisual.rotation.y, this.combatFocusHeading(), delta, 6);
      setPlanarHeroHeading(this.heroVisual.rotation, heading);
    }
    if (this.attacking) {
      this.attackAge += delta;
      if (this.heroMotion) {
        const movement = this.heroMotion(this.attackAge);
        this.heroVisual.position.x = movement.x; this.heroVisual.position.z = movement.z; this.heroVisual.position.y += movement.y;
      }
      if (!this.heroUsesAuthoredMotion) {
        this.heroVisual.rotation.y += Math.sin(Math.min(this.attackAge / .7, 1) * Math.PI) * .18;
        this.heroVisual.position.y += Math.sin(Math.min(this.attackAge / .5, 1) * Math.PI) * .35;
      }
      // The next problem may come as soon as every blow has landed: the spell's
      // afterglow plays on. A cleared room waits for its last body to fall.
      const landed = !this.attackPending.size && !this.heroMotion && this.attackAge >= this.castRoot + .15
        && this.elapsed - this.attackHitAt > .45 && this.enemies.some(enemy => !enemy.dead);
      if (this.attackAge >= this.attackDuration || landed) { this.attacking = false; this.heroMotion = undefined; this.heroVisual.position.x = this.heroVisual.position.z = 0; this.attackResolve?.(); this.attackResolve = undefined; }
    }
    this.heldEquipment?.update(this.elapsed);
    this.boonAura.update(delta, this.elapsed, this.hero.position);
    for (const pickup of this.floorLoot.update(delta, this.elapsed, this.hero.position, this.exploring, this.walkable)) {
      this.emit(pickup.at, pickup.color, pickup.kind === 'relic' ? 46 : 5, pickup.kind === 'relic' ? 1.6 : .5, pickup.kind === 'relic' ? 1.3 : .5);
      if (pickup.kind === 'relic') { this.burstLight.position.copy(pickup.at).setY(2.2); this.burstLight.color.setHex(pickup.color); this.burstLight.intensity = 60; }
      if (pickup.kind === 'mote') this.onSound?.('soul');
      this.onLootPickup?.(pickup);
    }
    this.ward.update(this.elapsed); this.damageNumbers.update(delta); this.updateCharge(delta);
    const markerAge = this.elapsed - (this.moveMarker.userData.shownAt ?? -9);
    (this.moveMarker.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - markerAge / .55) * .85;
    this.moveMarker.scale.setScalar(1 + markerAge * 1.2);
    this.rune.rotation.z = this.elapsed * .14;
    this.rune.scale.setScalar(ACTOR_SCALE * (1 + Math.sin(this.elapsed * 2) * .04));
    const living = this.enemies.filter(enemy => !enemy.dead);
    // Combat starts on sight: near, with no wall between.
    if (!this.engaged && living.length && !this.paused && living.some(enemy => enemy.at.distanceTo(this.hero.position) < ENGAGE_RADIUS && (this.level?.clearLine(this.hero.position, enemy.at, .05) ?? true))) this.engage();
    // Combat stays live while a problem waits: the horde paces, and one enemy
    // at a time strikes the hero's ward. Spells and panels hold every strike.
    const plan = this.engageReady ? this.horde.update(this.elapsed, living.map(enemy => ({
      id: enemy.id, x: enemy.at.x, z: enemy.at.z, ...((anchor: THREE.Vector3) => ({ originX: anchor.x, originZ: anchor.z }))(this.enemyAnchor(enemy)), brute: enemy.brute, phase: enemy.phase,
      canStrike: !!enemy.clips?.has('attack') && !(enemy.root.userData.hitReaction && !sampleHitReaction(enemy.root.userData.hitReaction, this.elapsed).complete),
    })), this.hero.position, this.engageReady && !this.attacking && !this.paused && !this.charge) : undefined;
    for (const event of plan?.events ?? []) this.hordeEvent(event.kind, this.enemies.find(enemy => enemy.id === event.id)!);
    for (const enemy of this.enemies) {
      if (enemy.dead && !enemy.root.visible) continue;
      let heading: number | undefined;
      if (!enemy.dead && this.engaged) {
        // Engaging: run to formation. In combat: walk, rush or recoil to the director's goal.
        const goal = plan?.goals.get(enemy.id) ?? { x: enemy.origin.x, z: enemy.origin.z, run: true, faceHero: false };
        const to = new THREE.Vector3(goal.x - enemy.at.x, 0, goal.z - enemy.at.z), gap = to.length();
        const pace = goal.run ? enemy.clips?.runSpeed ?? 3.2 : enemy.clips?.walkSpeed || 1.3;
        const step = Math.min(gap, pace * delta);
        if (gap > 1e-4) enemy.at.addScaledVector(to, step / gap);
        enemy.speed = delta > 0 && gap > 1e-4 ? step / delta : 0;
        if (!goal.faceHero && enemy.speed > .1) heading = Math.atan2(to.x, to.z);
      } else enemy.speed = 0;
      if (enemy.clips && !enemy.dead) {
        heading ??= Math.atan2(this.hero.position.x - enemy.at.x, this.hero.position.z - enemy.at.z);
        enemy.root.rotation.y = turnToward(enemy.root.rotation.y, heading, delta, 8);
      }
      const grounded = !!enemy.clips || enemy.animator.ownsGroundedPose;
      const reaction = enemy.root.userData.hitReaction as HitReaction | undefined;
      const response = reaction ? sampleHitReaction(reaction, this.elapsed) : undefined;
      const groundedCollapse = Boolean(reaction);
      if (enemy.dead) {
        const age = this.elapsed - enemy.deathAt;
        const t = Math.min(1, age / (reaction?.duration ?? 1.1));
        const away = reaction ? new THREE.Vector3(reaction.dx, 0, reaction.dz) : enemy.origin.clone().sub(this.hero.position).setY(0).normalize();
        if (reaction) enemy.root.position.set(reaction.x, 0, reaction.z).addScaledVector(away, response!.displacement);
        else enemy.root.position.copy(enemy.origin).addScaledVector(away, (1 - Math.pow(1 - t, 3)) * (enemy.brute ? 1 : 1.7));
        // A death clip already falls; only the procedural bodies need a tumble.
        enemy.root.position.y = groundedCollapse || enemy.clips ? 0 : Math.sin(t * Math.PI) * (enemy.brute ? .45 : .85);
        enemy.root.rotation.x = groundedCollapse || enemy.clips ? 0 : -t * (enemy.animator.articulated ? .24 : 1.35);
        enemy.root.rotation.z = groundedCollapse || enemy.clips ? 0 : Math.sin(enemy.phase) * t * (enemy.animator.articulated ? .13 : .7);
        if (groundedCollapse) { enemy.visual.position.y *= Math.exp(-delta * 30); enemy.visual.rotation.z *= Math.exp(-delta * 24); }
        enemy.root.scale.setScalar(groundedCollapse ? 1 : Math.max(.005, 1 - Math.max(0, t - .58) / .42));
        enemy.root.userData.electricDissolve = groundedCollapse ? response?.erosion ?? 0 : 0;
        if (t === 1) enemy.root.visible = false;
      } else {
        const approach = this.hero.position.clone().sub(enemy.origin).setY(0).normalize();
        const feint = (grounded ? 0 : 1) * (.5 + Math.sin(this.elapsed * .8 + enemy.phase) * .5) * (enemy.brute ? .55 : enemy.modelId === 'revenant' ? .62 : .9);
        enemy.root.position.copy(enemy.at);
        if (!grounded && enemy.modelId !== 'wraith') enemy.root.position.set(enemy.at.x + approach.x * feint + Math.sin(this.elapsed * .65 + enemy.phase) * .16, 0, enemy.at.z + approach.z * feint + Math.cos(this.elapsed * .72 + enemy.phase) * .16);
        if (reaction && response && !response.complete) {
          const impactPosition = new THREE.Vector3(reaction.x + reaction.dx * response.displacement, 0, reaction.z + reaction.dz * response.displacement);
          enemy.root.position.lerp(impactPosition, response.control);
        }
        enemy.root.rotation.x = enemy.root.rotation.z = 0;
        enemy.root.scale.setScalar(1); enemy.root.userData.electricDissolve = 0;
        // Authored foot support already settles the soles through each pose.
        // A second whole-model bounce would lift those planted feet afterward.
        enemy.visual.position.y = grounded ? 0 : (enemy.modelId === 'wraith' ? .12 + Math.sin(this.elapsed * .85 + enemy.phase) * .035 : Math.abs(Math.sin(this.elapsed * 4.7 + enemy.phase)) * (enemy.brute || enemy.modelId === 'revenant' ? .035 : .075)) * (1 - (response?.control ?? 0));
        enemy.visual.rotation.z = grounded ? 0 : Math.sin(this.elapsed * (enemy.modelId === 'wraith' ? .8 : 1.5) + enemy.phase) * (enemy.modelId === 'wraith' ? .008 : .035) * (1 - (response?.control ?? 0));
      }
      if (enemy.clips) { enemy.clips.update(delta, enemy.speed); continue; }
      enemy.animator.update(this.elapsed, {
        moving: (.35 + Math.abs(Math.cos(this.elapsed * .8 + enemy.phase)) * .4) * (1 - (response?.control ?? 0)),
        threat: (this.paused ? .25 : .8) * (1 - (response?.control ?? 0)),
        recoil: response?.recoil, impactSide: reaction?.side, brace: response?.brace, catchStep: response?.catchStep, footOffset: response?.footOffset, footLift: response?.footLift, supportTravel: response ? response.displacement * (enemy.dead ? 1 : response.control) : undefined,
        injury: enemy.dead ? 0 : 1 - enemy.hp / Math.max(1, enemy.maxHp),
        deathAge: enemy.dead ? (groundedCollapse ? response?.collapseAge : this.elapsed - enemy.deathAt) : undefined,
        collapse: groundedCollapse ? 'grounded' : undefined,
      });
    }
    for (const actor of this.skinnedEnemies) {
      actor.dissolve.set(actor.root.userData.electricDissolve ?? 0);
      const flash = actor.root.userData.hitFlash as { at: number; color: THREE.Color } | undefined, age = flash ? this.elapsed - flash.at : 9;
      actor.dissolve.flash(flash?.color ?? ELEMENT_FLASH.other, age < .3 ? Math.exp(-age * 12) * 1.2 : 0);
    }
    if (this.enemyInstances.length) {
      this.enemyGroup.updateMatrixWorld(true);
      this.enemyInstances.forEach(instance => {
        // Hidden source visuals supply transforms to the batch; the actor root
        // is the visibility authority. Compact completed defeats out of the
        // draw rather than submitting their full geometry at a tiny scale.
        let count = 0;
        instance.sources.forEach((source, index) => {
          if (instance.roots[index].visible) {
            instance.dissolve.set(count, instance.roots[index].userData.electricDissolve ?? 0);
            instance.mesh.setMatrixAt(count, source.matrixWorld);
            if (instance.mesh.morphTexture) instance.mesh.setMorphAt(count, source);
            count++;
          }
        });
        instance.mesh.count = count;
        instance.mesh.visible = count > 0;
        if (count > 0) { instance.mesh.instanceMatrix.needsUpdate = true; if (instance.mesh.morphTexture) instance.mesh.morphTexture.needsUpdate = true; instance.dissolve.upload(); }
      });
    }
    if (!outdoorKind(this.regionId)) this.torches.forEach(torch => {
      const flicker = 1 + Math.sin(this.elapsed * 11 + torch.phase) * .12 + Math.sin(this.elapsed * 17 + torch.phase) * .08;
      torch.flame.scale.y = flicker; if (torch.light) torch.light.intensity = 22 * flicker;
      if (Math.abs(torch.position.z - this.hero.position.z) < 17 && Math.random() < delta * 3) this.emit(torch.position, 0xffb965, 1, .35, 1.4);
    });
    this.livingFlame.uniforms.time.value = this.elapsed;
    this.floatingRunes.forEach((rune, index) => { rune.position.y = rune.userData.baseY + Math.sin(this.elapsed * 1.4 + index) * .21; rune.rotation.y = this.elapsed * .17 + index; });
    if (Math.random() < delta * 14) this.emit(this.hero.position.clone().add(new THREE.Vector3((Math.random() - .5) * 24, 1 + Math.random() * 4, (Math.random() - .5) * 20)), 0x65979b, 1, .12, 4);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]; effect.age = Math.max(0, this.elapsed - effect.startedAt);
      const t = effect.age / effect.duration;
      if (t >= 1) { this.effectsGroup.remove(effect.mesh); if (effect.mesh instanceof THREE.InstancedMesh) effect.mesh.dispose(); effect.mesh.geometry.dispose(); (effect.mesh.material as THREE.Material).dispose(); this.effects.splice(i, 1); continue; }
      const material = effect.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = effect.kind === 'ground' ? (1 - t) * .6 : (1 - t) * .95;
      effect.update?.(t, delta);
      if (effect.kind === 'custom') continue;
      if (effect.kind === 'shard') {
        effect.mesh.position.y = Math.max(.6, 4.8 - t * 14);
        effect.mesh.scale.y = 1 - Math.max(0, t - .5) * 1.5;
      } else if (effect.kind !== 'beam') {
        effect.mesh.scale.setScalar(effect.radius * (effect.kind === 'ground' ? 1 : 1 - Math.pow(1 - t, 3)));
        if (effect.kind === 'slash') effect.mesh.rotation.z += delta * 9;
      }
    }
    for (let i = this.summoned.length - 1; i >= 0; i--) {
      const summon = this.summoned[i]; summon.age += delta;
      if (summon.age >= summon.duration) {
        this.effectsGroup.remove(summon.root);
        summon.root.traverse(object => { if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); });
        this.summoned.splice(i, 1);
      } else summon.update(summon.age / summon.duration);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life -= delta;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.velocity.y -= delta * .55; p.position.addScaledVector(p.velocity, delta); p.velocity.multiplyScalar(Math.exp(-delta * .7));
      const offset = i * 3;
      this.particlePositions[offset] = p.position.x; this.particlePositions[offset + 1] = Math.max(.05, p.position.y); this.particlePositions[offset + 2] = p.position.z;
      const fade = Math.min(1, p.life / p.maxLife * 2);
      this.particleScales[i] = p.size;
      this.particleColors[offset] = p.color.r * fade * 1.3; this.particleColors[offset + 1] = p.color.g * fade * 1.3; this.particleColors[offset + 2] = p.color.b * fade * 1.3;
    }
    this.updateFragments(delta);
    this.particleGeometry.setDrawRange(0, this.particles.length); this.particleGeometry.attributes.position.needsUpdate = true; this.particleGeometry.attributes.color.needsUpdate = true; this.particleGeometry.attributes.particleScale.needsUpdate = true;
    this.burstLight.intensity *= Math.exp(-delta * 3); this.shake *= Math.exp(-delta * 7);
    // Reuse the existing light: no extra per-pixel point-light/shadow programs.
    // Contact wins briefly over the broad spell light, at the struck shoulder.
    const recentHit = this.enemies.reduce<Enemy | undefined>((latest, enemy) => {
      const reaction = enemy.root.userData.hitReaction as HitReaction | undefined;
      const previous = latest?.root.userData.hitReaction as HitReaction | undefined;
      return reaction && this.elapsed - reaction.at < .18 && (!previous || reaction.at > previous.at) ? enemy : latest;
    }, undefined);
    if (recentHit) {
      const reaction = recentHit.root.userData.hitReaction as HitReaction;
      const response = sampleHitReaction(reaction, this.elapsed);
      const frostfall = this.lastAttack?.spellId === 'frost', chain = this.chainUsesHandOrigin;
      const reach = chain ? .7 : frostfall ? .65 : .35;
      this.burstLight.position.copy(recentHit.root.position).add(new THREE.Vector3(-reaction.dx * reach, chain ? recentHit.height + .85 : recentHit.height * .75 + .45, -reaction.dz * reach));
      this.burstLight.color.setHex(reaction.element === 'fire' ? 0xffa35a : reaction.element === 'electric' ? 0x8abbff : frostfall ? 0x76bcca : 0xd6dce8);
      this.burstLight.intensity = (chain ? 2 : frostfall ? 3 : 9) * response.light;
    }
    this.cameraTarget.lerp(this.hero.position, 1 - Math.exp(-delta * 5));
    this.zoomPunch *= Math.exp(-delta * 7);
    const zoom = 1 + (this.zoomPunch > .001 ? this.zoomPunch : 0);
    if (this.camera.zoom !== zoom) { this.camera.zoom = zoom; this.camera.updateProjectionMatrix(); }
    const shake = this.shake;
    this.camera.position.copy(this.cameraTarget).add(new THREE.Vector3(17 + (Math.random() - .5) * shake, 25, 20 + (Math.random() - .5) * shake));
    this.camera.lookAt(this.cameraTarget.x, .2, this.cameraTarget.z - 1.8);
    const moon = this.scene.getObjectByName('moon') as THREE.DirectionalLight;
    moon.position.set(this.cameraTarget.x - 12, 24, this.cameraTarget.z - 10); moon.target.position.copy(this.cameraTarget);
    [...this.warmLights, ...this.recessLights].forEach((light, index) => light.position.lerp(this.lightAnchors[index], 1 - Math.exp(-delta * 3)));
    this.updateLevel(delta);
    updateHeroCutout(this.hero.position, this.camera);
    this.renderer.info.reset();
    if (this.softwareRenderer) this.renderer.render(this.scene, this.camera); else this.composer.render(delta);
  }

  get lootScreenPosition(): { x: number; y: number } | null {
    const relic = this.floorLoot.relicPosition; if (!relic) return null;
    const projected = relic.clone().add(new THREE.Vector3(0, .65, 0)).project(this.camera);
    return { x: (projected.x + 1) * this.width * .5, y: (1 - projected.y) * this.height * .5 };
  }

  get heroScreenPosition(): { x: number; y: number } {
    const projected = this.hero.position.clone().add(new THREE.Vector3(0, 1.8, 0)).project(this.camera);
    return { x: (projected.x + 1) * this.width * .5, y: (1 - projected.y) * this.height * .5 };
  }

  get bossHealth(): { hp: number; maxHp: number } | null {
    const boss = this.encounter === 5 ? this.enemies[0] : undefined;
    return boss ? { hp: boss.hp, maxHp: boss.maxHp } : null;
  }

  get enemyHealthScreenPositions(): { id: string; hp: number; maxHp: number; x: number; y: number; elite?: string }[] {
    // An elite's plate shows whenever it stands in view, wounded or not.
    return this.enemies.filter(enemy => !enemy.dead && (enemy.hp < enemy.maxHp || enemy.elite)).map(enemy => {
      const at = enemy.root.position.clone().add(new THREE.Vector3(0, enemy.height + .28, 0)).project(this.camera);
      return { id: enemy.id, hp: enemy.hp, maxHp: enemy.maxHp, x: (at.x + 1) * this.width * .5, y: (1 - at.y) * this.height * .5, elite: enemy.elite?.name };
    }).filter(at => at.x > 24 && at.x < this.width - 24 && at.y > 12 && at.y < this.height - 12);
  }

  get diagnostics(): Record<string, unknown> {
    return { appearance: this.appearance, heroModelId: this.heroModelId, heroWalkCycle: this.heroWalkCycle, drawWarmup: this.drawWarmup, lastAttack: this.lastAttack, lastSpellId: this.lastAttack?.spellId, lastSpellEffect: this.lastAttack?.effect, heroAnimation: this.heroAnimator?.current ?? 'procedural', heroClips: this.heroAnimator?.clips ?? [], enemyAnimations: this.enemies.map(enemy => enemy.clips?.current ?? 'procedural'), engaged: this.engaged, combatReady: this.combatReady, striker: this.horde.striker ?? null, hitStop: this.hitStop > 0, floorLoot: this.floorLoot.counts, encounter: this.encounter, region: this.regionId, enemies: this.enemies.filter(enemy => !enemy.dead).length, articulatedEnemies: this.enemies.filter(enemy => enemy.animator.articulated).length, enemyRoster: this.enemies.reduce<Record<string, number>>((counts, enemy) => { counts[enemy.modelId] = (counts[enemy.modelId] ?? 0) + 1; return counts; }, {}), attacking: this.attacking, paused: this.paused, modelsLoaded: this.loadedModels, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, particles: this.particles.length, fragments: this.fragments.length, breakables: this.level ? { whole: this.level.breakables.filter(feature => !feature.opened).length, broken: this.level.breakables.filter(feature => feature.opened).length } : null, breakDebris: this.breakableDebris.count, elites: this.enemies.filter(enemy => enemy.elite).map(enemy => ({ id: enemy.id, name: enemy.elite!.name, hp: enemy.hp, maxHp: enemy.maxHp, dead: enemy.dead })), hero: this.hero.position.toArray(), softwareRenderer: this.softwareRenderer, fps: Math.round(this.framesPerSecond), quality: ['full', 'balanced', 'performance'][this.quality], renderer: this.renderer.getContext().getParameter(this.renderer.getContext().VERSION) };
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.frame); this.attackResolve?.(); this.scheduled.length = 0;
    this.boonAura.dispose();
    this.inputAbort.abort(); this.finishEngage(); this.floorLoot.dispose(); this.ward.dispose(); this.damageNumbers.dispose(); this.releaseCharge(true);
    for (const built of this.chunks.values()) disposeChunk(built);
    this.discardNextLevel(); this.closeDescent();
    this.chunks.clear(); this.outdoorKit?.dispose(); this.outdoorGround?.geometry.dispose();
    for (const effect of this.effects) if (effect.mesh instanceof THREE.InstancedMesh) effect.mesh.dispose();
    this.releaseEnemyInstances();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    const collect = (object: THREE.Object3D) => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture && value !== this.environment.texture) textures.add(value); } }
    };
    this.scene.traverse(collect); this.models.forEach(model => model.traverse(collect));
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
    this.heroMixer?.stopAllAction(); this.heroMixer?.uncacheRoot(this.heroVisual);
    this.preparedMaterials.forEach(material => material.dispose());
    this.waveMap.dispose(); this.glowMap.dispose();
    this.stoneFragments.dispose(); this.hotFragments.dispose(); this.breakableDebris.dispose(); this.breakableKit.dispose();
    this.environment.dispose(); this.bloom.dispose(); this.composer.dispose(); this.renderer.dispose();
  }
}

/** Turns an angle toward a target along the short way, at a damped rate. */
function turnToward(from: number, to: number, delta: number, rate: number): number {
  const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + turn * (1 - Math.exp(-delta * rate));
}
