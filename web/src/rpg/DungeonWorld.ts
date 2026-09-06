import * as THREE from 'three';
import { RPG_SPELLS, RPG_APPEARANCES, type RpgAppearanceId } from '@institute/shared';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { dungeonCameraHalfHeight, dungeonCameraVerticalOffset } from './world/viewport';
import { crystalClusterGeometry, crystalClusterMaterial } from './world/crystals';
import { iceShardGeometry, iceShardMaterial } from './world/ice';
import { lightningGeometry, lightningMaterial } from './world/lightning';
import { createBallLightning, createBallLightningContacts, ballLightningVolumeMaterial, ballLightningFilamentMaterial, ballLightningContactMaterial } from './world/ballLightning';
import { phoenixWingGeometry, phoenixTailGeometry, stormFilamentsGeometry } from './world/spellShapes';
import { phoenixFeatherMaterial, stormWispMaterial } from './world/materials';
import { enemyRoster } from './world/enemyRoster';
import { EnemyAnimator } from './world/EnemyAnimator';
import { createVaultScenery } from './world/scenery';
import { createArchitecturalRemnant, ruinGeometry, isRuinFootprintClear, type RuinKind } from './world/ruins';
import { masonryGeometry, projectStoneUV } from './world/masonry';
import { getRoomLayout, enemyPositions, isCrossingChasm, roomFloorPatches } from './world/roomLayout';
import { stoneMaterial, floorRelief, flameMaterial, fireSheetMaterial, firePlumeMaterial, bladeWakeMaterial, ashMaterial, novaMaterial, glowTexture, waveTexture } from './world/materials';

type Enemy = { root: THREE.Group; visual: THREE.Object3D; origin: THREE.Vector3; phase: number; brute: boolean; dead: boolean; modelId: string; height: number; deathAt: number; animator: EnemyAnimator };
type Fragment = { position: THREE.Vector3; velocity: THREE.Vector3; rotation: THREE.Vector3; spin: THREE.Vector3; scale: THREE.Vector3; color: THREE.Color; life: number; maxLife: number; hot: boolean; bounced: boolean };
type Particle = { position: THREE.Vector3; velocity: THREE.Vector3; color: THREE.Color; life: number; maxLife: number; size: number };
type AttackOptions = { echo?: boolean; wide?: boolean; burning?: boolean; shards?: boolean; chains?: boolean; pierce?: boolean; orbit?: boolean; summon?: boolean; itemId?: string; kills?: number; drop?: { name: string; rarity: string }; xp?: number };
type Effect = { mesh: THREE.Mesh; age: number; duration: number; kind: 'ring' | 'slash' | 'beam' | 'ground' | 'shard' | 'custom'; radius: number; update?: (t: number, delta: number) => void };

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
  private readonly heroActions = new Map<string, THREE.AnimationAction>();
  private heroAnimation = '';
  private readonly floorGroup = new THREE.Group();
  private vaultScenery?: THREE.Group;
  private sceneryMeshes: THREE.Object3D[] = [];
  private readonly enemyGroup = new THREE.Group();
  private readonly effectsGroup = new THREE.Group();
  private readonly propGroup = new THREE.Group();
  private readonly biomeGroup = new THREE.Group();
  private biomeBuilt = "";
  private stoneSurfaceLoaded = false;
  private readonly floatingRunes: THREE.Object3D[] = [];
  private readonly cameraTarget = new THREE.Vector3();
  private readonly destination = new THREE.Vector3();
  private readonly heroLight = new THREE.PointLight(0xd6e3f0, 32, 7, 1.8);
  private readonly burstLight = new THREE.PointLight(0xffae40, 0, 20, 1.5);
  private readonly warmLights = [new THREE.PointLight(0xff9c45, 70, 14, 2), new THREE.PointLight(0xff822b, 60, 14, 2)];
  private readonly recessLights = [new THREE.PointLight(0x0c7bb1, 56, 12, 2), new THREE.PointLight(0x0b749f, 50, 12, 2)];
  private readonly lightAnchors = Array.from({ length: 4 }, () => new THREE.Vector3());
  private readonly rune: THREE.Mesh;
  private readonly materials: Record<string, THREE.MeshStandardMaterial>;
  private readonly models = new Map<string, THREE.Group>();
  private readonly preparedMaterials: THREE.Material[] = [];
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
  private readonly enemies: Enemy[] = [];
  private readonly enemyInstances: { mesh: THREE.InstancedMesh; sources: THREE.Mesh[]; roots: THREE.Group[] }[] = [];
  private lastFrameAt = performance.now();
  private frame = 0;
  private elapsed = 0;
  private encounter = 0;
  private regionId = 'sunken-vault';
  private equipment = '';
  private lootPosition: THREE.Vector3 | null = null;
  private lootExpiresAt = 0;
  private disposed = false;
  private paused = false;
  private attacking = false;
  private attackAge = 0;
  private attackDuration = 2.65;
  private lastAttack: { spellId: string; effect: string; options: AttackOptions } | null = null;
  private heroMotion?: (age: number) => THREE.Vector3;
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
    this.scene.add(new THREE.HemisphereLight(0x7394aa, 0x15120f, .38));
    const moon = new THREE.DirectionalLight(0x6d8da5, 1.5);
    moon.position.set(-12, 24, -10); moon.castShadow = true;
    moon.shadow.mapSize.set(this.softwareRenderer ? 1024 : 2048, this.softwareRenderer ? 1024 : 2048); moon.shadow.camera.left = moon.shadow.camera.bottom = -23;
    moon.shadow.camera.right = moon.shadow.camera.top = 23; moon.shadow.camera.far = 80;
    moon.shadow.normalBias = .045; moon.shadow.bias = -.00015;
    this.scene.add(moon, moon.target);
    const fill = new THREE.DirectionalLight(0xc6d3cf, .48); fill.position.set(15, 12, 18); this.scene.add(fill);
    moon.name = 'moon';
    this.scene.add(this.floorGroup, this.enemyGroup, this.effectsGroup, this.propGroup, this.biomeGroup, this.hero);
    for (const fragments of [this.stoneFragments, this.hotFragments]) { fragments.count = 0; fragments.setColorAt(0, new THREE.Color()); fragments.frustumCulled = false; fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(fragments); }
    this.heroVisual = this.makeHero(); this.hero.add(this.heroVisual);
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
    this.buildDungeon(); this.installScenery(); this.setEncounter(0); this.resize();
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(['hero', 'hero-cinder', 'hero-glacier', 'hero-tempest', 'imp', 'guardian', 'arch', 'pillar', 'brazier', 'crystal', 'chest', 'wall-bay', 'broken-wall', 'skeleton', 'revenant', 'wraith', 'furnace', 'reliquary', 'ice_cluster'].map(async name => {
      try {
        const gltf = await loader.loadAsync(`/assets/rpg/${name}.glb`);
        if (this.disposed) return;
        if (name === 'hero' || name.startsWith('hero-')) this.heroClipSets.set(name, gltf.animations);
        gltf.scene.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true; object.receiveShadow = !name.startsWith('hero') && !['skeleton', 'revenant', 'wraith', 'guardian', 'imp'].includes(name);
            if (name.startsWith('hero') || ['skeleton', 'revenant', 'guardian', 'imp', 'wraith'].includes(name)) {
              for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (material instanceof THREE.MeshStandardMaterial) { material.envMap = this.environment.texture; material.envMapIntensity = name.startsWith('hero') ? .55 : .225; }
              }
            }
            if (object.material instanceof THREE.MeshStandardMaterial && /glow_flame|glow_amber/.test(object.material.name)) {
              object.material.emissive.setHex(0xff780c); object.material.emissiveIntensity = name === 'furnace' ? .9 : 1.4; object.material.toneMapped = false;
            }
            if (name.startsWith('hero') && object.material instanceof THREE.MeshStandardMaterial && /glow_/.test(object.material.name)) {
              object.material.emissiveIntensity = .3; object.material.toneMapped = true;
            }
          }
        });
        this.models.set(name, gltf.scene); this.loadedModels++;
      } catch { /* The authored procedural dungeon remains fully playable offline. */ }
    }));
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
    this.installScenery();
    replacedStoneTextures.forEach(texture => texture.dispose());
    this.setAppearance(this.desiredAppearance);
    this.enemies.forEach(enemy => {
      const visual = this.model(enemy.modelId, enemy.height) ?? (enemy.modelId === 'revenant' ? this.model('skeleton', enemy.height) : undefined);
      if (visual) { enemy.root.remove(enemy.visual); this.releaseProcedural(enemy.visual); enemy.visual = visual; enemy.root.add(visual); enemy.animator = new EnemyAnimator(visual, {kind: enemy.modelId, phase: enemy.phase}); }
    });
    this.batchEnemies();
    this.addModelProps();
    this.biomeBuilt = ""; this.buildBiome();
    this.renderer.shadowMap.needsUpdate = true;
    // Compile authored actors and uncommon effect programs during loading,
    // before a child's first cast would otherwise pay the shader setup cost.
    const warmup = new THREE.Group(); warmup.position.y = -1000;
    const warmMaterials: THREE.Material[] = [novaMaterial(), fireSheetMaterial(), firePlumeMaterial(0, 1), bladeWakeMaterial(), ashMaterial(), phoenixFeatherMaterial(), stormWispMaterial(0x7787a4), stormWispMaterial(0xa9bdff, true), lightningMaterial(0xa9bdff), ballLightningVolumeMaterial(), ballLightningFilamentMaterial(), ballLightningContactMaterial(), ballLightningContactMaterial(true)];
    for (const material of warmMaterials) warmup.add(new THREE.Mesh(new THREE.PlaneGeometry(.01, .01), material));
    const summon = this.model('guardian', 4.5);
    summon?.traverse(object => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) { object.material = object.material.clone(); object.material.transparent = true; warmMaterials.push(object.material); } });
    if (summon) warmup.add(summon);
    this.scene.add(warmup);
    try { await this.renderer.compileAsync(this.scene, this.camera); } catch { /* Drivers without parallel compilation compile on first render. */ }
    this.scene.remove(warmup); this.preparedMaterials.push(...warmMaterials);
    for (const object of warmup.children) if (object instanceof THREE.Mesh) object.geometry.dispose();
    this.loadedAt = performance.now();
  }

  private model(name: string, height: number): THREE.Group | undefined {
    const original = this.models.get(name); if (!original) return undefined;
    const clone = (name === 'hero' || name.startsWith('hero-') ? cloneSkeleton(original) : original.clone(true)) as THREE.Group;
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = height / Math.max(size.y, .01); clone.scale.multiplyScalar(scale);
    clone.position.y -= bounds.min.y * scale;
    return clone;
  }

  private playHeroAnimation(name: string, restart = false): void {
    if ((!restart && this.heroAnimation === name) || !this.heroActions.has(name)) return;
    const previous = this.heroActions.get(this.heroAnimation), action = this.heroActions.get(name)!;
    const once = name === 'cleave' || name === 'cast';
    previous?.fadeOut(.12);
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once; action.fadeIn(.12).play(); this.heroAnimation = name;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; return mesh;
  }

  private makeHero(): THREE.Group {
    const group = new THREE.Group();
    group.userData.procedural = true;
    group.add(this.mesh(new THREE.CylinderGeometry(.23, .3, .65, 8), this.materials.teal, 0, .95));
    group.add(this.mesh(new THREE.SphereGeometry(.25, 10, 8), this.materials.dark, 0, 1.48));
    const hood = this.mesh(new THREE.SphereGeometry(.29, 10, 8, 0, Math.PI * 2, 0, Math.PI * .7), this.materials.teal, 0, 1.49); group.add(hood);
    const cape = this.mesh(new THREE.ConeGeometry(.42, 1.05, 4, 1, true), this.materials.teal, 0, .9, -.22); cape.rotation.x = -.2; group.add(cape);
    for (const x of [-.19, .19]) {
      group.add(this.mesh(new THREE.CylinderGeometry(.12, .14, .58, 6), this.materials.dark, x, .38));
      group.add(this.mesh(new THREE.SphereGeometry(.22, 6, 4), this.materials.gold, x * 1.8, 1.14));
    }
    const sword = this.mesh(new THREE.BoxGeometry(.12, 1.15, .055), this.materials.steel, .6, 1.01, .18); sword.rotation.z = -.42; sword.name = 'weapon'; group.add(sword);
    group.add(this.mesh(new THREE.BoxGeometry(.43, .08, .1), this.materials.gold, .4, .65, .18));
    return group;
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
    return group;
  }

  private releaseProcedural(object: THREE.Object3D): void {
    if (object.userData.procedural) object.traverse(child => { if (child instanceof THREE.Mesh) child.geometry.dispose(); });
  }

  private installScenery(): void {
    if (this.vaultScenery) {
      this.floorGroup.remove(...this.sceneryMeshes);
      for (const object of this.sceneryMeshes) object.traverse(child => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      for (const material of this.vaultScenery.userData.ownedMaterials ?? []) material.dispose();
      for (const texture of this.vaultScenery.userData.ownedTextures ?? []) texture.dispose();
    }
    // Scenery clones the base stone materials. Recreate it after bundled maps
    // load so rubble uses those surfaces instead of retaining the fallback.
    this.vaultScenery = createVaultScenery(this.materials);
    this.sceneryMeshes = [...this.vaultScenery.children];
    this.floorGroup.add(...this.sceneryMeshes);
  }

  private buildDungeon(): void {
    let state = 932184;
    const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    const batches = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[]; room: number; occluder: boolean }>();
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, turn = 0) => {
      const roomIndex = Math.round(-z / 20);
      if (y > -.1 && isCrossingChasm(roomIndex, x, z + roomIndex * 20)) { geometry.dispose(); return; }
      if (material === this.materials.wall || material === this.materials.trim) {
        const shade = .76 + random() * .46;
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        const positions = geometry.getAttribute('position'), authoredColors = geometry.getAttribute('color');
        for (let i = 0; i < colors.length; i += 3) {
          // Damp mortar accumulates at the base instead of tinting every stone alike.
          const height = positions.getY(i / 3) + y;
          const damp = .67 + .33 * Math.min(1, Math.max(0, height / 1.35));
          colors[i] = shade * damp * (authoredColors?.getX(i / 3) ?? 1); colors[i + 1] = shade * damp * .99 * (authoredColors?.getY(i / 3) ?? 1); colors[i + 2] = shade * damp * .94 * (authoredColors?.getZ(i / 3) ?? 1);
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        (material as THREE.MeshStandardMaterial).vertexColors = true;
      }
      geometry.rotateY(turn); geometry.translate(x, y, z);
      const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
      if (normalized !== geometry) geometry.dispose();
      normalized.computeBoundingBox();
      const occluder = normalized.boundingBox!.max.y > .6;
      const room = Math.round(-z / 20), key = `${material.uuid}:${room}:${occluder}`;
      if (!batches.has(key)) batches.set(key, { material, geometries: [], room, occluder });
      batches.get(key)!.geometries.push(normalized);
    };
    const block = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, turn = 0, bevel = .065) => {
      const chipped = material === this.materials.wall && w < 3 && d < 3;
      const geometry = chipped
        ? masonryGeometry(w, h, d, random)
        : new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, Math.min(w, h, d) * .2));
      if (!chipped && (material === this.materials.wall || material === this.materials.trim)) projectStoneUV(geometry, random() * 3, random() * 3);
      add(geometry, material, x, y, z, turn);
    };
    const pillar = (x: number, z: number, height: number, broken = false) => {
      if (broken) {
        const geometry = ruinGeometry('column-stump', Math.round(x * 31 + z * 17));
        const size = geometry.boundingBox!.getSize(new THREE.Vector3());
        // Existing pier footprint is retained. A fractured crown replaces the
        // repeated intact capitals and full-height attached shafts.
        geometry.scale(1.45 / size.x, height / size.y, 1.45 / size.z);
        add(geometry, this.materials.trim, x, 0, z); return;
      }
      for (let tier = 0; tier < 3; tier++) block(1.8 - tier * .18, .19, 1.8 - tier * .18, this.materials.trim, x, .1 + tier * .18, z);
      for (let layer = 0; layer < Math.ceil(height / .49); layer++) {
        const spread = layer % 3 === 0 ? 1.17 : 1.04;
        block(spread, .47, spread, this.materials.wall, x + (random() - .5) * .055, .72 + layer * .49, z + (random() - .5) * .05, (random() - .5) * .025);
      }
      for (const side of [-1, 1]) for (const front of [-1, 1]) {
        add(new THREE.CylinderGeometry(.14, .19, height - .15, 8), this.materials.trim, x + side * .48, height * .5 + .65, z + front * .48);
      }
      block(1.55, .22, 1.55, this.materials.trim, x, height + .62, z);
      block(1.32, .14, 1.32, this.materials.wall, x, height + .82, z);
    };
    for (let room = 0; room < 6; room++) {
      const center = -room * 20, layout = getRoomLayout(room);
      const sideOffset = layout.sideWallX - 12.2;
      // Texture coordinates remain in world space: neighbouring worn floor pieces
      // share their photographically detailed surface instead of a board-game grid.
      for (const patch of roomFloorPatches(room)) {
        const floor = new THREE.PlaneGeometry(patch.width, patch.depth, 8, 4); floor.rotateX(-Math.PI / 2);
        const uv = floor.getAttribute('uv'), position = floor.getAttribute('position');
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (position.getX(i) + patch.x) / 4.8, (position.getZ(i) + center + patch.z) / 4.8);
        add(floor, this.materials.floor, patch.x, -.05, center + patch.z);
        block(patch.width, .55, patch.depth, this.materials.dark, patch.x, -.38, center + patch.z, 0, .015);
      }
      if (room === 3) for (const side of [-1, 1]) {
        const darkFloor = new THREE.PlaneGeometry(6.2, 8); darkFloor.rotateX(-Math.PI / 2);
        add(darkFloor, this.materials.dark, side * 7.9, -3.8, center);
        for (const edge of [4.8, 11]) for (let row = 0; row < 6; row++) for (let n = 0; n < 8; n++)
          block(.44, .56, .97, this.materials.wall, side * edge, -.5 - row * .56, center - 3.5 + n);
        for (const z of [-5, 5]) { pillar(side * 5.5, center + z, 1.05); this.addTorch(side * 5.5, 1.96, center + z, false); }
      }
      // Thick walls and stepped side aisles replace the old sparse perimeter.
      for (const side of [-1, 1]) {
        const wallHeight = side < 0 ? layout.wallHeights.left : layout.wallHeights.right;
        for (let row = 0; row < Math.ceil(wallHeight / .57); row++) for (let n = 0; n < 17; n++) {
          const z = center - 9.7 + n * 1.16 + (row % 2) * .5;
          // The frontmost western vault collapsed: staggered upper courses
          // expose an irregular silhouette instead of a continuous square box.
          const brokenHeight = n > 11 ? 1.5 + Math.sin(n * 2.4 + room) * .55 : wallHeight;
          if (side < 0 && row * .57 > brokenHeight) continue;
          if (row > 5 && (n * 13 + row * 7 + room) % 17 === 0) continue;
          block(layout.sideWallWidth, .53, 1.11, this.materials.wall, side * layout.sideWallX + (random() - .5) * .07, .26 + row * .57, z, (random() - .5) * .023);
        }
        for (let step = 0; step < 3; step++) block(2.0 - step * .38, .2, 19.9, this.materials.wall, side * (11.25 + sideOffset + step * .19), .05 + step * .19, center, 0, .045);
        for (let bay = 0; bay < 4; bay++) {
          const z = center - 7.4 + bay * 5;
          const brokenPier = (side < 0 && (bay + room) % 3 === 0) || (side > 0 && bay === 3);
          const pierHeight = side < 0 ? (bay === 3 ? 2.2 : wallHeight - .7 + Math.sin(bay * 2.3 + room) * .35) : (bay === 0 || bay === 3 ? 3.3 : wallHeight);
          pillar(side * (11.7 + sideOffset), z, brokenPier ? Math.min(pierHeight, 1.7 + bay * .3) : pierHeight, brokenPier);
          this.addTorch(side * (10.55 + sideOffset), 2.1, z + .7, false);
          const x = side * (9.7 + sideOffset + random() * .55);
          add(crystalClusterGeometry(room * 43 + bay * 11 + side), this.materials.crystalStone, x, 0, z + 1.4, random() * Math.PI * 2);
        }
        // Ruined tombs lie partly buried along the raised aisles, never centred
        // like furniture placed on a grid. Trim catches the torchlight.
        for (let n = 0; n < 3; n++) {
          const x = side * (8.6 + sideOffset + random() * 1.1), z = center - 7 + n * 6.3;
          const turn = (random() - .5) * .55;
          block(1.1, .63, 2.05, this.materials.wall, x, .32, z, turn);
          block(1.22, .15, 2.22, this.materials.trim, x + .12, .71, z - .04, turn + .09);
          for (let rib = -1; rib <= 1; rib++) block(.06, .045, 1.7, this.materials.dark, x + rib * .28, .8, z, turn);
        }
      }
      // The far wall is a layered cathedral facade with a central route opening.
      for (const side of [-1, 1]) {
        for (let row = 0; row < Math.ceil(layout.wallHeights.back / .57); row++) for (let n = 0; n < 7; n++) {
          const x = layout.doorX + side * (4.1 + n * 1.13 + (row % 2) * .3);
          if (side < 0 && row > 3 + Math.floor(1.4 + Math.sin(n * 1.8 + room) * 1.4)) continue;
          if (row > 6 && (n + room) % 3 === 0) continue;
          block(1.08, .54, .95, this.materials.wall, x, .27 + row * .57, center - 9.7, (random() - .5) * .02);
        }
        pillar(layout.doorX + side * 3.4, center - 9.35, layout.wallHeights.back - .5);
        if (side < 0) for (let step = 0; step < 4; step++) block(6.8 - step * .28, .18, 2.6 - step * .38, this.materials.wall, layout.doorX, .05 + step * .17, center - 8.55 - step * .15);
        // Foreground remnants frame the action; high pieces sit at the edges.
        const brokenFront = room !== 3 && (side > 0 ? room % 2 === 0 : room % 2 === 1);
        pillar(side * (8.7 + sideOffset), center + 7.1, room === 3 ? 1.1 : brokenFront ? 1.5 + room % 3 * .2 : side < 0 ? 3.7 : 2.7, brokenFront);
        for (let n = 0; n < 4; n++) block(1.05, .53, .84, this.materials.wall, side * (9.3 + sideOffset + n * .92), .25, center + 7.2, (random() - .5) * .1);
      }
      // Dense rubble has multiple scales: fallen voussoirs, hand-sized stones,
      // chips and grit. Irregular clusters leave a navigable central lane.
      for (let n = 0; n < 240; n++) {
        const side = random() < .5 ? -1 : 1;
        const x = side * (7.4 + random() * 9), z = center + (random() - .5) * 19.7;
        const radius = n % 11 === 0 ? .36 + random() * .5 : .035 + random() * .2;
        const geometry = new THREE.DodecahedronGeometry(radius, 0);
        geometry.scale(1 + random(), .32 + random() * .7, .6 + random());
        geometry.rotateX(random() * 2); geometry.rotateZ(random() * 2);
        add(geometry, n % 4 === 0 ? this.materials.trim : this.materials.wall, x, radius * .26, z, random() * 6);
      }
      // Fallen arch segments form a bank of rubble beneath the broken vault.
      for (let n = 0; n < 85; n++) {
        const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * 2.4;
        const x = -9.8 + Math.cos(angle) * radius, z = center + 4.9 + Math.sin(angle) * radius;
        const mound = Math.max(0, 1 - radius / 2.4) * .85;
        const stone = new THREE.DodecahedronGeometry(.13 + random() * .35, 0);
        stone.scale(1.4, .6, .9); stone.rotateX(random() * 2);
        add(stone, n % 3 ? this.materials.wall : this.materials.trim, x, mound + .08, z, random() * 6);
      }
      for (let n = 0; n < 30; n++) {
        const x = (random() - .5) * 14, z = center + (random() - .5) * 17;
        const shard = new THREE.DodecahedronGeometry(.045 + random() * .1, 0); shard.scale(1.8, .2, 1);
        add(shard, this.materials.trim, x, .02, z, random() * 6);
      }
      // A thin, worn sigil belongs to the floor; it does not define an arena.
      if (room === 5) {
        const sigil = new THREE.TorusGeometry(4.1, .018, 3, 64); sigil.rotateX(Math.PI / 2);
        add(sigil, this.materials.runeGold, 0, -.01, center);
      }
      if (room === 0) {
        for (const side of [-1, 1]) {
          pillar(side * 6.5, 15.5, side < 0 ? 3.6 : 2.2);
          for (let blockIndex = 0; blockIndex < 7; blockIndex++) for (let row = 0; row < 2; row++) block(1.1, .52, .8, this.materials.wall, side * (7.2 + blockIndex * 1.05), .26 + row * .55, 15.5, (random() - .5) * .09);
          for (let chip = 0; chip < 70; chip++) {
            const geometry = new THREE.DodecahedronGeometry(.04 + random() * .25, 0); geometry.scale(1.4, .55, .8);
            add(geometry, this.materials.wall, side * (5.2 + random() * 9), .1, 11 + random() * 9, random() * 6);
          }
        }
      }
    }
    for (const { material, geometries, room, occluder } of batches.values()) {
      const merged = mergeGeometries(geometries, false);
      if (merged) {
        const mesh = this.mesh(merged, material); mesh.castShadow = material !== this.materials.floor && material !== this.materials.dark;
        mesh.userData.room = room; mesh.userData.occluder = occluder; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); this.floorGroup.add(mesh);
      }
      geometries.forEach(geometry => geometry.dispose());
    }
  }

  private addTorch(x: number, y: number, z: number, withLight: boolean): void {
    const room = Math.round(-z / 20);
    if (isCrossingChasm(room, x, z + room * 20)) return;
    const group = new THREE.Group(); group.position.set(x, y, z);
    group.userData.room = room; group.userData.occluder = y > .8;
    group.add(this.mesh(new THREE.CylinderGeometry(.2, .12, .36, 8), this.materials.gold));
    const flame = this.mesh(new THREE.PlaneGeometry(.55, .95), this.livingFlame, 0, .55); flame.rotation.y = .7; flame.castShadow = false; group.add(flame);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff942b, map: this.glowMap, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.y = .42; halo.scale.set(1.65, 2.1, 1); group.add(halo);
    let light: THREE.PointLight | undefined;
    if (withLight && !this.softwareRenderer) { light = new THREE.PointLight(0xffa74c, 22, 15, 2); light.position.set(0, .7, 0); group.add(light); }
    this.torches.push({ flame, light, position: new THREE.Vector3(x, y + .4, z), phase: x + z }); this.floorGroup.add(group);
  }

  private addModelProps(): void {
    for (let room = 0; room < 6; room++) {
      const center = -room * 20, layout = getRoomLayout(room), sideOffset = layout.sideWallX - 12.2;
      const nearLandmark = (x: number, z: number, radius = 1) => layout.landmarks.some(landmark => Math.hypot(x - landmark.x, z - center - landmark.z) < radius + landmark.radius);
      const add = (name: string, height: number, x: number, z: number, turn = 0) => {
        if (isCrossingChasm(room, x, z - center)) return;
        const object = this.model(name, height); if (!object) return;
        object.position.x = x; object.position.z = z; object.rotation.y = turn;
        if (name === 'wall-bay' || name === 'arch') { object.rotation.z = Math.sin(x * 1.7 + z * .3) * .022; object.scale.x *= .94 + Math.sin(x + room) * .045; }
        object.userData.room = room; object.userData.occluder = true; this.propGroup.add(object);
        return object;
      };
      const remnant = (kind: RuinKind, height: number, x: number, z: number, turn = 0) => {
        const object = createArchitecturalRemnant(kind, this.materials.trim, room * 71 + Math.round(x * 13 + z * 17));
        object.geometry.computeBoundingBox();
        object.scale.setScalar(height / Math.max(.01, object.geometry.boundingBox!.max.y));
        object.position.set(x, 0, z); object.rotation.y = turn; object.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(object);
        if (!isRuinFootprintClear(room, { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z - center, maxZ: bounds.max.z - center })) { object.geometry.dispose(); return false; }
        object.userData.room = room; object.userData.occluder = true; this.propGroup.add(object); return true;
      };
      for (let bay = 0; bay < 4; bay++) {
        if (bay < 2) {
          const x = -11.3 - sideOffset, z = center - 4.9 + bay * 5;
          const fractured = room !== 3 && (room + bay) % 2 === 0 && remnant('arch-remnant', 3.2 + room % 3 * .25, x - .18, z, Math.PI / 2);
          if (!fractured) add(room === 3 ? 'broken-wall' : 'wall-bay', room === 3 ? 2.2 : layout.wallHeights.left + .2 + Math.sin(bay * 2 + room) * .3, x, z, Math.PI / 2);
        }
        if (bay === 2) {
          add('broken-wall', 2.4, -11.35 - sideOffset, center + 5, Math.PI / 2);
          remnant('fallen-column', .7, -11.7 - sideOffset, center + 4.4, .16 + room * .17);
        }
        add('broken-wall', 1.5 + bay % 2, 11.5 + sideOffset, center - 7.3 + bay * 5, -Math.PI / 2);
      }
      for (const side of [-1, 1]) {
        add(side < 0 || room === 3 ? 'broken-wall' : 'wall-bay', side < 0 || room === 3 ? Math.min(3.3, layout.wallHeights.back - 1) : layout.wallHeights.back, layout.doorX + side * 7.5, center - 9.4);
        if (side < 0) add('pillar', 4.1, -10.2 - sideOffset, center - 9.2, .12);
        const brazierX = side * (layout.walkable.maxX + 1.1), brazierZ = center + (side < 0 ? -3.8 : 3.2);
        if (!nearLandmark(brazierX, brazierZ)) {
          add('brazier', 1.45, brazierX, brazierZ); this.addTorch(brazierX, 1.02, brazierZ, false);
        }
        add('crystal', 1.25, side * (10.2 + sideOffset), center - 6.2);
        const brokenFront = room !== 3 && (side > 0 ? room % 2 === 0 : room % 2 === 1);
        if (!brokenFront) add(room === 3 ? 'broken-wall' : 'pillar', room === 3 ? 1.0 : room === 2 ? 3.3 : 4.4, side * (8.7 + sideOffset), center + 7.1);
      }
      add('arch', layout.wallHeights.back + .8, layout.doorX, center - 9.4);
      const chestX = layout.walkable.maxX + 1.1;
      if ([0,2,5].includes(room) && !nearLandmark(chestX, center - 5.1)) add('chest', .82, chestX, center - 5.1, -.9);
      for (const landmark of layout.landmarks) {
        const z = center + landmark.z;
        if (landmark.id === 'furnace') { add('furnace', 3.2, landmark.x, z, .15); this.addTorch(landmark.x, .35, z + .25, false); }
        else if (landmark.id === 'reliquary') add('reliquary', 3.0, landmark.x, z, .25);
        else if (landmark.id.includes('crystals')) {
          add('crystal', 3.1, landmark.x, z, .5);
          add('crystal', 1.5, landmark.x + .75, z + .5, -1);
          add('crystal', 1.15, landmark.x - .75, z + .7, .8);
        }
        else if (landmark.id === 'altar') add('reliquary', 2.1, landmark.x, z, 0);
      }
      if (room === 5) {
        const portal = new THREE.Mesh(new THREE.CircleGeometry(2, 48), new THREE.MeshBasicMaterial({ color: 0x128bb8, map: this.glowMap, transparent: true, opacity: .5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        portal.position.set(0, 2.8, center - 9.8); portal.userData.room = room; this.propGroup.add(portal);
      }
    }
  }

  setEncounter(index: number, regionId?: string, enemyCount?: number): void {
    const was = this.encounter;
    this.encounter = Math.max(0, Math.min(5, index));
    if (regionId) this.regionId = regionId;
    this.enemies.forEach(enemy => this.releaseProcedural(enemy.visual));
    this.enemyInstances.forEach(instance => instance.mesh.dispose()); this.enemyInstances.length = 0;
    this.enemies.length = 0; this.enemyGroup.clear();
    const layout = getRoomLayout(this.encounter);
    this.destination.set(layout.heroX, 0, -this.encounter * 20 + layout.heroZ);
    if (!this.frame || Math.abs(was - this.encounter) > 1) { this.hero.position.copy(this.destination); this.cameraTarget.copy(this.destination); }
    const count = Math.max(1, Math.min(48, enemyCount ?? (this.encounter === 5 ? 24 : 14 + this.encounter)));
    const formation = enemyPositions(this.encounter, count), roster = enemyRoster(this.encounter, count);
    for (let i = 0; i < count; i++) {
      const { brute, boss, modelId, height } = roster[i];
      const root = new THREE.Group();
      const origin = new THREE.Vector3(formation[i].x, 0, -this.encounter * 20 + formation[i].z);
      root.position.copy(origin); root.rotation.y = Math.atan2(this.destination.x - origin.x, this.destination.z - origin.z);
      const visual = this.makeEnemy(brute, boss, modelId, height); root.add(visual); this.enemyGroup.add(root);
      this.enemies.push({ root, visual, origin, phase: i * 1.77, brute, dead: false, modelId, height, deathAt: 0, animator: new EnemyAnimator(visual, { kind: modelId, phase: i * 1.77 }) });
    }
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
    const roomZ = -this.encounter * 20, sideOffset = layout.sideWallX - 12.2;
    const west = layout.landmarks.find(landmark => landmark.id === 'furnace' || landmark.id === 'reliquary');
    const crystal = (side: number) => layout.landmarks.find(landmark => landmark.id === (side < 0 ? 'west-crystals' : 'east-crystals'));
    this.warmLights[0].intensity = west ? 28 : 70; this.warmLights[1].intensity = 60;
    this.warmLights[0].color.setHex(west?.id === 'reliquary' ? 0x59bfdd : 0xff963f);
    this.lightAnchors[0].set(west ? west.x + .4 : -(layout.walkable.maxX + 1.1), west ? 1.8 : 2.3, roomZ + (west ? west.z + 1.2 : -3.8));
    this.lightAnchors[1].set(layout.walkable.maxX + 1.1, 2.3, roomZ + 3.2);
    if (this.encounter === 3) {
      this.warmLights[0].intensity = 32; this.warmLights[1].intensity = 28;
      this.lightAnchors[0].set(-5.5, 2.6, roomZ - 5);
      this.lightAnchors[1].set(5.5, 2.6, roomZ + 5);
    }
    for (const [index, side] of [-1, 1].entries()) {
      const cluster = crystal(side);
      this.lightAnchors[index + 2].set(cluster?.x ?? side * (10.2 + sideOffset), 1.9, roomZ + (cluster?.z ?? -6.2));
    }
    if (!this.frame) [...this.warmLights, ...this.recessLights].forEach((light, index) => light.position.copy(this.lightAnchors[index]));
    this.buildBiome(); this.biomeGroup.position.z = -this.encounter * 20;
    this.batchEnemies();
    this.renderer.shadowMap.needsUpdate = true;
  }

  private updateStoneTint(): void {
    const frost = this.regionId.includes('frost'), storm = this.regionId.includes('storm');
    this.materials.wall.color.setHex(this.stoneSurfaceLoaded
      ? frost ? 0xa1b7c4 : storm ? 0xb2a7bf : 0xb2b5ad
      : frost ? 0x5b6871 : storm ? 0x625d6b : 0x69665d);
  }

  private buildBiome(): void {
    const key = `${this.regionId}:${this.encounter === 3 ? 'crossing' : 'hall'}`;
    if (this.biomeBuilt === key) return;
    this.biomeBuilt = key;
    const oldTextures = new Set<THREE.Texture>();
    this.biomeGroup.traverse(object => { if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture && value !== this.materials.floor.map) oldTextures.add(value);
        material.dispose();
      }
    } });
    oldTextures.forEach(texture => texture.dispose()); this.biomeGroup.clear(); this.floatingRunes.length = 0;
    if (this.regionId.includes('frost')) {
      const clonedTextures = new Map<THREE.Texture, THREE.Texture>();
      const ice = new THREE.MeshStandardMaterial({ color: 0x426d83, emissive: 0x102f42, emissiveIntensity: .12, metalness: .18, roughness: .4, transparent: true, opacity: .83 });
      const snow = stoneMaterial(0x87999d, 85); ice.name = "frost-spires"; snow.name = "frost-snow";
      for (const side of [-1, 1]) {
        for (let i = 0; i < 10; i++) {
          if (this.encounter === 3 && Math.abs(-7.6 + i * 1.65) < 4.9) continue;
          const height = 1.2 + (i * 7 % 9) * .42;
          const cluster = this.model('ice_cluster', height * .82);
          if (cluster) {
            cluster.position.x = side * (8.6 + i % 3 * .6); cluster.position.z = -7.6 + i * 1.65;
            cluster.rotation.y = side * .7 + i * 2.31;
            cluster.updateMatrixWorld(true);
            cluster.traverse(child => { if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
              // Biome cleanup owns these baked meshes and materials. Copy maps
              // once per biome so cleanup never disposes the cached GLB maps.
              const material = child.material.clone(); material.name = `frost-cluster-${material.name}`;
              material.emissive.setHex(0x123348); material.emissiveIntensity = .2;
              for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) {
                const source = material[slot]; if (!source) continue;
                if (!clonedTextures.has(source)) { const copy = source.clone(); copy.needsUpdate = true; clonedTextures.set(source, copy); }
                material[slot] = clonedTextures.get(source)!;
              }
              const spire = new THREE.Mesh(child.geometry.clone().applyMatrix4(child.matrixWorld), material);
              spire.castShadow = spire.receiveShadow = true; this.biomeGroup.add(spire);
            } });
          } else {
            const spire = this.mesh(iceShardGeometry(.28 + i % 3 * .14, height, i), iceShardMaterial(), side * (8.6 + i % 3 * .6), 0, -7.6 + i * 1.65);
            spire.rotation.z = side * (.13 + i % 3 * .08); this.biomeGroup.add(spire);
          }
          const drift = this.mesh(new THREE.SphereGeometry(.9, 10, 5), snow.clone(), side * 9, .02, -7 + i * 1.65); drift.scale.set(1.5, .17, .75); this.biomeGroup.add(drift);
        }
        if (this.encounter === 3) continue;
        const poolGeometry = new THREE.CircleGeometry(2.7, 45), edges = poolGeometry.getAttribute('position');
        for (let n = 1; n < edges.count; n++) { const shape = .84 + Math.sin(n * 1.7) * .06 + Math.sin(n * .7) * .09; edges.setXY(n, edges.getX(n) * shape, edges.getY(n) * shape); }
        const frozen = ice.clone(); frozen.name = "frozen-pool"; frozen.opacity = .48; frozen.roughness = .56; frozen.color.setHex(0x385263); frozen.map = this.materials.floor.map;
        const pool = this.mesh(poolGeometry, frozen, side * 5.8, -.008, side * 4.8); pool.rotation.x = -Math.PI / 2; pool.scale.x = .72; pool.receiveShadow = true; this.biomeGroup.add(pool);
        for (let crack = 0; crack < 8; crack++) {
          const a = crack * 2.4, from = new THREE.Vector3(side * 5.8, .012, side * 4.8);
          const points = [from, from.clone().add(new THREE.Vector3(Math.sin(a) * .8, 0, Math.cos(a) * .8)), from.clone().add(new THREE.Vector3(Math.sin(a + .3) * 2.1, 0, Math.cos(a + .3) * 2.1))];
          const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, .017, 3, false), new THREE.MeshBasicMaterial({ color: 0x7cc8e6, transparent: true, opacity: .29 })); line.material.name = "ice-cracks"; this.biomeGroup.add(line);
        }
      }
      ice.dispose(); snow.dispose();
    } else if (this.regionId.includes('storm')) {
      const stone = stoneMaterial(0x5a5367, 61); stone.name = "storm-platform";
      for (const side of [-1, 1]) {
        if (this.encounter !== 3) { const platform = this.mesh(new RoundedBoxGeometry(2.65, .58, 12.5, 1, .08), stone.clone(), side * 7.9, .25, -.9); this.biomeGroup.add(platform); }
        for (let i = 0; i < 4; i++) {
          const z = -6.4 + i * 3.8;
          if (isCrossingChasm(this.encounter, side * 7.9, z)) continue;
          const pedestal = this.mesh(new THREE.CylinderGeometry(.62, .86, .65, 6), stone.clone(), side * 7.9, this.encounter === 3 ? .33 : .9, z); this.biomeGroup.add(pedestal);
          const rune = new THREE.Group(); rune.position.set(side * 7.9, 2.4, z); rune.userData.baseY = 2.4;
          const core = this.mesh(new THREE.OctahedronGeometry(.7, 0), stone.clone()); core.scale.y = 1.5; rune.add(core);
          for (let band = 0; band < 3; band++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.49 + band * .025, .023, 4, 6), new THREE.MeshBasicMaterial({ color: 0x8d99fc })); ring.rotation.x = Math.PI / 2; ring.position.y = (band - 1) * .27; rune.add(ring); }
          this.biomeGroup.add(rune); this.floatingRunes.push(rune);
          if (i < 3 && this.encounter !== 3) {
            const points = Array.from({length:12}, (_, n) => new THREE.Vector3(side * 7.9 + Math.sin(n * 3.1) * .12, 1.2 + Math.sin(n * 2.6) * .16, z + n / 11 * 3.8));
            const conduit = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 22, .025, 3, false), new THREE.MeshBasicMaterial({color:0x8aaafa,transparent:true,opacity:.62,blending:THREE.AdditiveBlending})); this.biomeGroup.add(conduit);
          }
        }
      }
      stone.dispose();
    }
    // Region dressing is static apart from the floating stones. Merge its
    // repeated surfaces so additional scenery does not cost a draw per chip.
    const batches = new Map<string, THREE.Mesh[]>();
    for (const child of this.biomeGroup.children) if (child instanceof THREE.Mesh && !Array.isArray(child.material) && child.material.name) {
      const name = child.material.name; if (!batches.has(name)) batches.set(name, []); batches.get(name)!.push(child);
    }
    for (const entries of batches.values()) {
      if (entries.length < 2) continue;
      const transformed = entries.map(mesh => { mesh.updateMatrix(); const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); return geometry.applyMatrix4(mesh.matrix); });
      const geometry = mergeGeometries(transformed, false); transformed.forEach(geometry => geometry.dispose());
      if (!geometry) continue;
      const material = entries[0].material;
      for (const mesh of entries) { this.biomeGroup.remove(mesh); mesh.geometry.dispose(); if (mesh.material !== material) (mesh.material as THREE.Material).dispose(); }
      const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; this.biomeGroup.add(mesh);
    }
  }

  private batchEnemies(): void {
    this.enemyInstances.forEach(instance => { this.enemyGroup.remove(instance.mesh); instance.mesh.dispose(); }); this.enemyInstances.length = 0;
    const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; sources: THREE.Mesh[]; roots: THREE.Group[] }>();
    for (const enemy of this.enemies) {
      // Keep procedural actors independent until their authored models arrive.
      if (enemy.visual.userData.procedural) continue;
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
      const mesh = new THREE.InstancedMesh(geometry, material, sources.length);
      mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.enemyInstances.push({ mesh, sources, roots }); this.enemyGroup.add(mesh);
    }
  }

  setAppearance(appearanceId: RpgAppearanceId): void {
    if (this.disposed) return;
    const appearance = RPG_APPEARANCES.find(entry => entry.id === appearanceId) ?? RPG_APPEARANCES[0];
    this.desiredAppearance = appearance.id;
    const modelId = this.models.has(appearance.modelId) ? appearance.modelId : 'hero';
    if (this.heroModelId === modelId) return;
    const model = this.model(modelId, 1.8);
    if (!model) return; // Keep the procedural hero until authored models arrive.
    const previousVisual = this.heroVisual;
    const previousAnimation = this.heroAnimation || 'idle';
    const previousTime = this.heroActions.get(previousAnimation)?.time ?? 0;
    this.heroMixer?.stopAllAction(); this.heroMixer?.uncacheRoot(this.heroVisual);
    this.heroActions.clear(); this.heroAnimation = '';
    this.hero.remove(this.heroVisual); this.releaseProcedural(this.heroVisual);
    // Skeletons and weapon tint materials belong to this instance. Geometry and
    // baked textures remain owned by the model cache for subsequent armor swaps.
    this.heroVisual.traverse(object => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      if (object instanceof THREE.Mesh && object.userData.equipmentMaterial) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    this.heroVisual = new THREE.Group();
    this.heroVisual.position.copy(previousVisual.position); this.heroVisual.quaternion.copy(previousVisual.quaternion); this.heroVisual.scale.copy(previousVisual.scale);
    this.heroVisual.add(model); this.hero.add(this.heroVisual);
    this.heroModelId = modelId; this.appearance = modelId === appearance.modelId ? appearance.id : 'wayfarer';
    this.heroMixer = new THREE.AnimationMixer(this.heroVisual);
    for (const clip of this.heroClipSets.get(modelId) ?? []) this.heroActions.set(clip.name.toLowerCase(), this.heroMixer.clipAction(clip));
    this.playHeroAnimation(previousAnimation);
    const action = this.heroActions.get(previousAnimation);
    if (action) { action.time = previousTime; this.heroMixer.update(0); }
    this.setEquipment(this.equipment); this.renderer.shadowMap.needsUpdate = true;
  }

  setEquipment(itemId: string): void {
    this.equipment = itemId;
    const glow = /cinder|ember|phoenix/.test(itemId) ? 0xff8c22 : /storm|thunder|tempest/.test(itemId) ? 0x8d9eff : /frost|glacier|winter/.test(itemId) ? 0x87edff : 0xffb64b;
    this.rune.material instanceof THREE.MeshBasicMaterial && this.rune.material.color.setHex(glow);
    this.heroVisual.traverse(object => {
      if (object instanceof THREE.Mesh && /sword|weapon/i.test(object.name)) {
        const material = object.material;
        if (material instanceof THREE.MeshStandardMaterial) {
          // Each equipped blade owns its color; creature/prop materials stay shared.
          if (!object.userData.equipmentMaterial) { object.material = material.clone(); object.userData.equipmentMaterial = true; }
          const bladeMaterial = object.material as THREE.MeshStandardMaterial;
          bladeMaterial.emissive.setHex(glow); bladeMaterial.emissiveIntensity = itemId ? .32 : .08;
        }
      }
    });
  }

  setPaused(paused: boolean): void { this.paused = paused; }

  async attack(spellId: string, options: AttackOptions = {}): Promise<void> {
    if (this.disposed || this.attacking) return;
    const spell = RPG_SPELLS.find(spell => spell.id === spellId);
    const effect = spell?.effect ?? 'nova', school = spell?.school ?? 'ember';
    const color = school === 'ember' ? 0xff7d19 : school === 'frost' ? 0x8bdef1 : 0x8bacff;
    this.lastAttack = { spellId, effect, options: { ...options } };
    this.attacking = true; this.attackAge = 0; this.playHeroAnimation(effect === 'cleave' || effect === 'phoenix-dive' ? 'cleave' : 'cast', true);
    this.attackDuration = effect === 'cleave' ? 2.2 : ['firestorm', 'blizzard', 'tempest', 'frost-guardian'].includes(effect) ? 3 : 2.7;
    const origin = this.hero.position.clone().setY(.12);
    const target = origin.clone().add(new THREE.Vector3(.3, 0, -3.8));
    const resolveHorde = (delay: number) => this.enemies.forEach((enemy, i) => {
      const offset = enemy.root.position.clone().sub(origin).setY(0), distance = offset.length();
      let contact = delay + i / Math.max(1, this.enemies.length) * .52;
      if (effect === 'nova') {
        const radius = options.wide ? 10.6 : 8.8;
        contact = 1.3 * (1 - Math.cbrt(1 - Math.min(.97, distance / (radius * 1.01))));
      } else if (effect === 'cleave') {
        const sweepAngle = (Math.atan2(offset.x, offset.z) - .2 + Math.PI * 2) % (Math.PI * 2);
        contact = .08 + sweepAngle / (Math.PI * 2) * .5;
      } else if (['ice-lance', 'arc-lance', 'glacial-surge', 'phoenix-dive'].includes(effect)) {
        contact = delay + Math.max(0, -offset.z + 1) * .055;
      } else if (effect === 'meteor') contact = .65 + enemy.root.position.distanceTo(target) * .035;
      this.schedule(contact, () => this.hitEnemy(enemy, color));
    });
    this.emit(origin.clone().setY(1.3), color, 28, 1.1, .75);
    this.schedule(.18, () => {
      this.burstLight.position.copy(origin).setY(2.8); this.burstLight.color.setHex(color); this.burstLight.intensity = 100;
      switch (effect) {
        case 'cleave': {
          this.heroMotion = age => new THREE.Vector3(Math.sin(Math.min(1, age / .8) * Math.PI) * 1.2, 0, -Math.sin(Math.min(1, age / .8) * Math.PI) * 1.6);
          this.weaponSweep(origin, 0xffc875, options.wide ? 7.6 : 5.6, .2);
          this.schedule(.35, () => this.weaponSweep(origin.clone().add(new THREE.Vector3(0, 0, -1)), 0xffecbe, 6.8, 2.8));
          resolveHorde(.23); this.shake = .2; break;
        }
        case 'nova': {
          this.fireNova(origin, options.wide ? 10.6 : 8.8);
          if (options.echo) this.schedule(.68, () => this.fireNova(origin, 10.8));
          resolveHorde(.25); break;
        }
        case 'meteor': {
          this.targetMark(target, 0xff7534, 3.2);
          this.projectile(target.clone().add(new THREE.Vector3(-5, 11, -3)), target, 0xff751c, 1.15, .65, () => {
            this.meteorImpact(target, new THREE.Vector3(5, -11, 3), 1);
          });
          if (options.echo) this.schedule(.35, () => this.projectile(target.clone().add(new THREE.Vector3(6, 10, 2)), origin.clone().add(new THREE.Vector3(3, 0, 1)), 0xffb74c, .7, .6, () => this.meteorImpact(origin.clone().add(new THREE.Vector3(3, 0, 1)), new THREE.Vector3(-3, -10, -1), .6)));
          resolveHorde(.72); break;
        }
        case 'phoenix-dive': {
          const flightStarted = this.elapsed;
          const flightProgress = () => THREE.MathUtils.clamp((this.elapsed - flightStarted) / 1.15, 0, 1);
          const flightDisplacement = () => {
            const flight = Math.sin(flightProgress() * Math.PI);
            return new THREE.Vector3(flight * 1.7, flight * 2, -flight * 5.5);
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
              wing.rotation.z = side * (.11 * Math.sin(t * Math.PI * 2) - .05);
              wing.scale.x = .62 + .38 * Math.sin(Math.min(1, t * 1.8) * Math.PI * .5);
              material.uniforms.time.value = this.elapsed + side * .7;
              material.uniforms.opacity.value = Math.min(1, t * 10) * (1 - Math.pow(t, 2.8));
            });
          }
          for (const smoke of [false, true]) {
            const material = smoke ? stormWispMaterial(0x66504b) : phoenixFeatherMaterial();
            const tail = new THREE.Mesh(phoenixTailGeometry(), material); tail.position.copy(origin);
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
          for (let i = 0; i < 7; i++) this.schedule(.18 + i * .06, () => this.impact(origin.clone().add(new THREE.Vector3(Math.sin(i) * 1.1, .15, -i * 1.25)), 0xff8c25, 1.6));
          resolveHorde(.48); this.shake = .3; break;
        }
        case 'firestorm': {
          for (let i = 0; i < 9; i++) this.schedule(i * .13, () => {
            const at = this.enemies[(i * 3) % this.enemies.length].origin;
            this.firePillar(at, 2.4 + (Math.sin(i * 2.7) + 1) * 1.1, 1.25); this.fireContact(at, 1.2);
          });
          resolveHorde(.55); break;
        }
        case 'frostfall': {
          this.enemies.forEach((enemy, i) => this.schedule(i * .018, () => this.projectile(enemy.origin.clone().add(new THREE.Vector3(-.6, 7 + i % 3, 0)), enemy.origin, 0xabedff, options.shards ? .36 : .23, .42, () => this.impact(enemy.origin, 0xb0efff, .7), true)));
          if (options.shards) this.schedule(.7, () => this.iceWave(origin, true));
          resolveHorde(.5); break;
        }
        case 'ice-lance': {
          const directions = options.pierce ? [-.48, 0, .48] : [0];
          for (const angle of directions) {
            const end = origin.clone().add(new THREE.Vector3(Math.sin(angle) * 10, .5, -Math.cos(angle) * 10));
            this.projectile(origin.clone().setY(1.25), end, 0xc7f6ff, .48, .48, () => this.impact(end, 0x8bddff, 2.3), true);
            this.stroke([origin.clone().setY(1), end], 0x58bfe6, .055, 1.05);
          }
          resolveHorde(.32); break;
        }
        case 'glacial-surge': {
          this.iceWave(origin, Boolean(options.wide)); resolveHorde(.42); this.shake = .28; break;
        }
        case 'blizzard': {
          this.cyclone(origin, 0x86c4e2, 7.5, 2.9, 2.4, true);
          for (let i = 0; i < 11; i++) this.schedule(i * .12, () => {
            for (let snow = 0; snow < 32; snow++) {
              const at = origin.clone().add(new THREE.Vector3((Math.random() - .5) * 16, 4 + Math.random() * 3, (Math.random() - .5) * 16));
              this.directedParticle(at, new THREE.Vector3(-2.4, -3, 1.3), 0xd5f4ff, 1.1, .34);
            }
          });
          resolveHorde(.62); break;
        }
        case 'frost-guardian': {
          this.summonGuardian(origin.clone().add(new THREE.Vector3(-2.7, 0, -1)), 2.3);
          if (options.summon) this.summonGuardian(origin.clone().add(new THREE.Vector3(2.7, 0, -1)), 2.3);
          this.schedule(.8, () => { this.iceWave(target, true); this.impact(target, 0xd2faff, 3); this.shake = .42; });
          resolveHorde(.83); break;
        }
        case 'chain-lightning': {
          this.chainLightning(origin, 0x9ac4ff);
          if (options.chains) this.schedule(.45, () => this.chainLightning(origin, 0xe1f5ff));
          resolveHorde(.17); break;
        }
        case 'arc-lance': {
          const end = origin.clone().add(new THREE.Vector3(0, .8, -13));
          for (let i = 0; i < 3; i++) this.schedule(i * .16, () => {
            this.bolt(origin.clone().setY(1.2), end, 0x91bcff, .1, .5);
            if (options.pierce) {
              const split = origin.clone().lerp(end, .58).setY(1.1);
              for (const side of [-1, 1]) {
                const splinter = end.clone().add(new THREE.Vector3(side * 4.2, .2, 2.1));
                this.bolt(split, splinter, 0xd5edff, .075, .48);
                this.emit(splinter, 0x9fcdff, 7, 1.5, .45);
              }
            }
            this.enemies.forEach((enemy, n) => { if (n % 3 === i) this.bolt(end.clone().lerp(origin, .45), enemy.origin.clone().setY(1), 0xb8daff, .035, .4); });
          });
          resolveHorde(.22); this.shake = .2; break;
        }
        case 'thunderclap': {
          this.bolt(target.clone().setY(13), target.clone().setY(.1), 0xe0efff, .2, .45);
          this.schedule(.18, () => { this.impact(target, 0xadcaff, 4.5); this.ring(target, 0xa9bfff, 11.5, .7, 'ring'); this.debris(target, 14); this.shake = .48; });
          if (options.echo) this.schedule(.7, () => { this.bolt(origin.clone().setY(12), origin, 0xd4e7ff, .18, .45); this.ring(origin, 0xc0d9ff, 11.5, .65, 'ring'); });
          resolveHorde(.27); break;
        }
        case 'ball-lightning': {
          const count = options.orbit ? 4 : 1;
          const started = this.elapsed, view = new THREE.Vector3();
          const contacts = createBallLightningContacts(this.enemies.length);
          contacts.layers.forEach((layer, index) => this.effect(layer, 2.15, index === 0 ? () => contacts.update(this.elapsed) : undefined));
          const orbPosition = (orb: number, t: number, at: THREE.Vector3) => {
            const phase = orb * Math.PI * 2 / count;
            return at.copy(origin).add(new THREE.Vector3(Math.sin(phase + t * 8) * (3 + t * 2.5), 1.2 + Math.sin(t * 14 + orb*.7) * .25, Math.cos(phase + t * 8) * (3 + t * 2.5)));
          };
          const orbs: { at: THREE.Vector3; flashedAt: number }[] = [];
          for (let orb = 0; orb < count; orb++) {
            const visual = createBallLightning(orb + 1), state = { at: new THREE.Vector3(), flashedAt: -Infinity };
            orbs.push(state);
            visual.update(orbPosition(orb, 0, state.at), this.camera.getWorldDirection(view).negate(), 0, started);
            visual.layers.forEach((layer, index) => this.effect(layer, 2.15, index === 0 ? t => {
              const progress = THREE.MathUtils.clamp((this.elapsed - started) / 2.15, 0, 1);
              const discharge = Math.exp(-Math.max(0, this.elapsed - state.flashedAt) * 22);
              visual.update(orbPosition(orb, progress, state.at), this.camera.getWorldDirection(view).negate(), t, this.elapsed, discharge);
            } : undefined));
          }
          // Visible energy reaches each victim at the existing authoritative
          // contact cue. The four-orb upgrade shares those contacts between orbs.
          this.enemies.forEach((enemy, index) => this.schedule(.65 + index / Math.max(1, this.enemies.length) * .52, () => {
            const orb = index % count, state = orbs[orb]; state.flashedAt = this.elapsed;
            orbPosition(orb, THREE.MathUtils.clamp((this.elapsed - started) / 2.15, 0, 1), state.at);
            const contact = enemy.root.position.clone().add(new THREE.Vector3(0, enemy.brute ? 1.55 : .9, 0));
            contacts.strike(index, contact, contact.clone().sub(state.at), this.elapsed);
            this.bolt(state.at, contact, 0x7abaff, .03, .10);
            if (options.chains && index % 4 === 0 && index + 1 < this.enemies.length) {
              const next = this.enemies[index + 1];
              this.bolt(contact, next.root.position.clone().add(new THREE.Vector3(0, next.brute ? 1.55 : .9, 0)), 0x8abaff, .022, .085);
            }
            this.burstLight.position.copy(contact); this.burstLight.color.setHex(0x7abaff);
            this.burstLight.intensity = Math.max(this.burstLight.intensity, 16);
          }));
          resolveHorde(.65); break;
        }
        case 'tempest': {
          this.cyclone(target, 0x93b2f1, 5.5, 8, 2.45);
          for (let bolt = 0; bolt < 9; bolt++) this.schedule(.15 + bolt * .13, () => {
            const enemy = this.enemies[(bolt * 7) % this.enemies.length];
            this.bolt(target.clone().add(new THREE.Vector3(Math.sin(bolt) * 3, 10, Math.cos(bolt) * 3)), enemy.origin.clone().setY(.1), 0xc4ddff, .08, .3);
            this.impact(enemy.origin, 0x7a9fe8, 1.4);
          });
          resolveHorde(.62); this.shake = .32; break;
        }
      }
      if (options.shards && school === 'frost' && effect !== 'frostfall') this.schedule(.72, () => {
        for (let i = 0; i < 8; i++) {
          const at = this.enemies[(i * 3) % this.enemies.length].origin;
          this.projectile(at.clone().add(new THREE.Vector3(-1, 6, 0)), at, 0xc0f2ff, effect === 'blizzard' ? .42 : .25, .38, () => this.impact(at, 0x99deff, 1), true);
        }
      });
      if (options.chains && school === 'storm' && effect !== 'chain-lightning' && effect !== 'ball-lightning') this.schedule(.65, () => this.chainLightning(origin, 0xb2d3ff));
      if (options.burning && school === 'ember') this.schedule(.85, () => {
        for (let i = 0; i < 6; i++) this.impact(origin.clone().add(new THREE.Vector3(Math.sin(i * 2) * 3, .1, Math.cos(i * 2) * 3)), 0xdd4b13, 1.4);
      });
      if (this.encounter === 5) this.schedule(1.4, () => { this.impact(this.enemies[0].origin, 0xffd990, 5); this.debris(this.enemies[0].origin, 22); this.shake = .35; });
      if (options.drop) this.schedule(1.55, () => this.spawnLoot(origin, options.drop!));
    });
    return new Promise(resolve => { this.attackResolve = resolve; });
  }

  private effect(mesh: THREE.Mesh, duration: number, update?: (t: number, delta: number) => void): THREE.Mesh {
    this.effectsGroup.add(mesh); this.effects.push({ mesh, age: 0, duration, kind: 'custom', radius: 1, update }); return mesh;
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

  private iceWave(origin: THREE.Vector3, wide: boolean): void {
    const branches = wide ? 7 : 5;
    const layout = getRoomLayout(this.encounter);
    // Branching pressure fractures spread ahead of the hero. Offset, leaning
    // shards grow along those cracks instead of forming a regular cone grid.
    for (let branch = 0; branch < branches; branch++) {
      const lane = branch - (branches - 1) / 2;
      for (let step = 0; step < 8; step++) {
        const phase = branch * 5.31 + step * 2.17;
        const at = origin.clone().add(new THREE.Vector3(lane * (.46 + step * .16) + Math.sin(phase) * .32, 0, 1.3 - step * .94 + Math.cos(phase) * .25));
        const localZ = at.z + this.encounter * 20;
        if (Math.abs(at.x) > layout.walkable.maxX - .55 || localZ < layout.walkable.minZ + .6 || localZ > layout.walkable.maxZ - .6 || isCrossingChasm(this.encounter, at.x, localZ)) continue;
        this.schedule(step * .07 + Math.abs(lane) * .022, () => {
          const height = .64 + (Math.sin(phase * 1.7) + 1) * .48 + step * .07;
          const mesh = new THREE.Mesh(iceShardGeometry(.19 + height * .08, height, phase), iceShardMaterial());
          mesh.position.copy(at); mesh.rotation.set(-.18 - step * .025, phase, -lane * .055);
          this.effect(mesh, 1.1, t => {
            mesh.scale.y = THREE.MathUtils.smoothstep(t, 0, .2);
            mesh.position.y = at.y - Math.max(0, t - .65) * height * 1.5;
            mesh.material.opacity = (1 - THREE.MathUtils.smoothstep(t, .68, 1)) * .94;
          });
          const fissure = this.stroke([new THREE.Vector3(-.16, .04, .46), new THREE.Vector3(.09, .04, .08), new THREE.Vector3(.22, .04, -.39)], 0x8cc3d5, .014, .65);
          fissure.position.copy(at); fissure.rotation.y = lane * -.1;
          this.emit(at.clone().setY(.18), 0xafd9e2, 3, .9, .45);
        });
      }
    }
    this.emit(origin, 0xb9efff, 22, 3, .65);
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
    this.effectsGroup.add(mesh); this.effects.push({ mesh, age: 0, duration, kind, radius });
  }

  private chainLightning(origin: THREE.Vector3, color: number): void {
    let previous = origin.clone(); previous.y = 1.1;
    this.enemies.forEach((enemy, index) => {
      const from = previous.clone(), to = enemy.root.position.clone(); to.y = enemy.brute ? 1.9 : .9; previous = to;
      this.schedule(.17 + index / Math.max(1, this.enemies.length) * .52, () => {
        this.bolt(from, to, color, .055, .55);
      });
    });
  }

  private hitEnemy(enemy: Enemy, color: number): void {
    enemy.dead = true; enemy.deathAt = this.elapsed;
    this.renderer.shadowMap.needsUpdate = true;
    const ballLightning = this.lastAttack?.spellId === 'ball_lightning';
    this.emit(enemy.origin.clone().add(new THREE.Vector3(0, .9, 0)), color, ballLightning ? 0 : enemy.brute ? 35 : 18, 3, 1);
    this.emit(enemy.origin.clone().add(new THREE.Vector3(0, .35, 0)), 0xc7ae77, ballLightning ? 0 : 8, 1.7, 1.35);
    if (this.lastAttack?.options.burning || RPG_SPELLS.find(spell => spell.id === this.lastAttack?.spellId)?.school === 'ember') {
      this.fireContact(enemy.root.position, enemy.brute ? 1.35 : .7 + Math.abs(Math.sin(enemy.phase)) * .45);
      const scorch = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ color: 0x32261b, alphaMap: this.glowMap, transparent: true, opacity: .2, depthWrite: false }));
      scorch.rotation.x = -Math.PI / 2; scorch.position.copy(enemy.origin).y = -.025;
      this.effect(scorch, 4, t => { scorch.material.opacity = (1 - t) * .2; });
    }
    if (enemy.brute) { this.debris(enemy.origin, 9); this.emit(enemy.origin.clone().setY(1.2), 0x8deaff, ballLightning ? 0 : 16, 3.5, .65); }
  }

  private spawnLoot(origin: THREE.Vector3, drop: { name: string; rarity: string }): void {
    const colors: Record<string, number> = { common: 0xb8c2c5, uncommon: 0x79dcb1, rare: 0x6aa9ff, epic: 0xc38aff, legendary: 0xffba57 };
    const color = colors[drop.rarity] ?? colors.rare;
    const position = origin.clone().add(new THREE.Vector3(2.1, .1, -.9)); this.lootPosition = position.clone(); this.lootExpiresAt = this.elapsed + 3.2;
    this.emit(position, color, 35, 1.7, 1.5);
    const geometry = new THREE.CylinderGeometry(.014, .09, 4.1, 8, 1, true);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    mesh.position.copy(position); mesh.position.y += 2.05;
    this.effectsGroup.add(mesh); this.effects.push({ mesh, age: 0, duration: 3.2, kind: 'beam', radius: 1 });
    const glint = new THREE.Mesh(new THREE.OctahedronGeometry(.18), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .5, metalness: .6, roughness: .25 }));
    glint.position.copy(position).y = .27;
    this.effect(glint, 3.2, t => { glint.rotation.y = t * 6; glint.position.y = .27 + Math.sin(t * 8) * .06; });
  }

  private emit(origin: THREE.Vector3, color: number, count: number, speed: number, life: number): void {
    for (let i = 0; i < count && this.particles.length < 890; i++) {
      const angle = Math.random() * Math.PI * 2, amount = (.2 + Math.random() * .8) * speed;
      this.particles.push({ position: origin.clone(), velocity: new THREE.Vector3(Math.cos(angle) * amount, Math.random() * speed * .6 + .3, Math.sin(angle) * amount), color: new THREE.Color(color), life, maxLife: life, size: speed < .2 ? .2 : speed < .6 ? .4 : .28 + Math.random() * .42 });
    }
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    const ratio = width / height;
    const halfHeight = dungeonCameraHalfHeight(width, height);
    this.camera.left = -halfHeight * ratio; this.camera.right = halfHeight * ratio;
    const verticalOffset = dungeonCameraVerticalOffset(height);
    this.camera.top = halfHeight + verticalOffset; this.camera.bottom = -halfHeight + verticalOffset; this.camera.updateProjectionMatrix();
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
    const distance = this.hero.position.distanceTo(this.destination);
    if (!this.attacking) this.playHeroAnimation(distance > .025 ? 'walk' : 'idle');
    this.heroMixer?.update(delta);
    const shadowInterval = distance > .08 || this.attacking ? (this.softwareRenderer ? .2 : .065) : .65;
    if (this.elapsed - this.lastShadowUpdate > shadowInterval) {
      this.renderer.shadowMap.needsUpdate = true; this.lastShadowUpdate = this.elapsed;
    }
    if (distance > .025 && !this.attacking) {
      this.hero.position.lerp(this.destination, 1 - Math.exp(-delta * 2.1));
      this.heroVisual.position.y = Math.abs(Math.sin(this.elapsed * 11)) * .09;
      this.heroVisual.rotation.y = Math.atan2(this.destination.x - this.hero.position.x, this.destination.z - this.hero.position.z);
    } else {
      this.heroVisual.position.y = Math.sin(this.elapsed * 2.4) * .018;
      this.heroVisual.rotation.y = THREE.MathUtils.lerp(this.heroVisual.rotation.y, Math.PI * .9, 1 - Math.exp(-delta * 4));
    }
    if (this.attacking) {
      this.attackAge += delta;
      if (this.heroMotion) {
        const movement = this.heroMotion(this.attackAge);
        this.heroVisual.position.x = movement.x; this.heroVisual.position.z = movement.z; this.heroVisual.position.y += movement.y;
      }
      this.heroVisual.rotation.y += Math.sin(Math.min(this.attackAge / .7, 1) * Math.PI) * .18;
      this.heroVisual.position.y += Math.sin(Math.min(this.attackAge / .5, 1) * Math.PI) * .35;
      if (this.attackAge >= this.attackDuration) { this.attacking = false; this.heroMotion = undefined; this.heroVisual.position.x = this.heroVisual.position.z = 0; this.attackResolve?.(); this.attackResolve = undefined; }
    }
    this.rune.rotation.z = this.elapsed * .14;
    this.rune.scale.setScalar(1 + Math.sin(this.elapsed * 2) * .04);
    for (const enemy of this.enemies) {
      // Once the authored defeat has finished there is no visible pose to
      // animate. A new encounter creates fresh roots and batches normally.
      if (enemy.dead && !enemy.root.visible) continue;
      if (enemy.dead) {
        const t = Math.min(1, (this.elapsed - enemy.deathAt) / 1.1);
        const away = enemy.origin.clone().sub(this.hero.position).setY(0).normalize();
        enemy.root.position.copy(enemy.origin).addScaledVector(away, (1 - Math.pow(1 - t, 3)) * (enemy.brute ? 1 : 1.7));
        enemy.root.position.y = Math.sin(t * Math.PI) * (enemy.brute ? .45 : .85);
        enemy.root.rotation.x = -t * (enemy.animator.articulated ? .24 : 1.35); enemy.root.rotation.z = Math.sin(enemy.phase) * t * (enemy.animator.articulated ? .13 : .7);
        enemy.root.scale.setScalar(Math.max(.005, 1 - Math.max(0, t - .58) / .42));
        if (t === 1) enemy.root.visible = false;
      } else {
        const approach = this.hero.position.clone().sub(enemy.origin).setY(0).normalize();
        const feint = (.5 + Math.sin(this.elapsed * .8 + enemy.phase) * .5) * (enemy.brute ? .55 : enemy.modelId === 'revenant' ? .62 : .9);
        enemy.root.position.x = enemy.origin.x + approach.x * feint + Math.sin(this.elapsed * .65 + enemy.phase) * .16;
        enemy.root.position.z = enemy.origin.z + approach.z * feint + Math.cos(this.elapsed * .72 + enemy.phase) * .16;
        enemy.visual.position.y = enemy.modelId === 'wraith' ? .14 + Math.sin(this.elapsed * 2 + enemy.phase) * .09 : Math.abs(Math.sin(this.elapsed * 4.7 + enemy.phase)) * (enemy.brute || enemy.modelId === 'revenant' ? .035 : .075);
        enemy.visual.rotation.z = Math.sin(this.elapsed * 1.5 + enemy.phase) * .035;
      }
      enemy.animator.update(this.elapsed, { moving: .35 + Math.abs(Math.cos(this.elapsed * .8 + enemy.phase)) * .4, threat: this.paused ? .25 : .8, deathAge: enemy.dead ? this.elapsed - enemy.deathAt : undefined });
    }
    if (this.enemyInstances.length) {
      this.enemyGroup.updateMatrixWorld(true);
      this.enemyInstances.forEach(instance => {
        // Hidden source visuals supply transforms to the batch; the actor root
        // is the visibility authority. Compact completed defeats out of the
        // draw rather than submitting their full geometry at a tiny scale.
        let count = 0;
        instance.sources.forEach((source, index) => {
          if (instance.roots[index].visible) instance.mesh.setMatrixAt(count++, source.matrixWorld);
        });
        instance.mesh.count = count;
        instance.mesh.visible = count > 0;
        if (count > 0) instance.mesh.instanceMatrix.needsUpdate = true;
      });
    }
    this.torches.forEach(torch => {
      const flicker = 1 + Math.sin(this.elapsed * 11 + torch.phase) * .12 + Math.sin(this.elapsed * 17 + torch.phase) * .08;
      torch.flame.scale.y = flicker; if (torch.light) torch.light.intensity = 22 * flicker;
      if (Math.abs(torch.position.z - this.hero.position.z) < 17 && Math.random() < delta * 3) this.emit(torch.position, 0xffb965, 1, .35, 1.4);
    });
    this.livingFlame.uniforms.time.value = this.elapsed;
    this.floatingRunes.forEach((rune, index) => { rune.position.y = rune.userData.baseY + Math.sin(this.elapsed * 1.4 + index) * .21; rune.rotation.y = this.elapsed * .17 + index; });
    if (Math.random() < delta * 14) this.emit(this.hero.position.clone().add(new THREE.Vector3((Math.random() - .5) * 24, 1 + Math.random() * 4, (Math.random() - .5) * 20)), 0x65979b, 1, .12, 4);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]; effect.age += delta;
      const t = effect.age / effect.duration;
      if (t >= 1) { this.effectsGroup.remove(effect.mesh); effect.mesh.geometry.dispose(); (effect.mesh.material as THREE.Material).dispose(); this.effects.splice(i, 1); continue; }
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
    this.cameraTarget.lerp(this.hero.position, 1 - Math.exp(-delta * 3.7));
    const shake = this.shake;
    this.camera.position.copy(this.cameraTarget).add(new THREE.Vector3(17 + (Math.random() - .5) * shake, 25, 20 + (Math.random() - .5) * shake));
    this.camera.lookAt(this.cameraTarget.x, .2, this.cameraTarget.z - 1.8);
    const moon = this.scene.getObjectByName('moon') as THREE.DirectionalLight;
    moon.position.set(this.cameraTarget.x - 12, 24, this.cameraTarget.z - 10); moon.target.position.copy(this.cameraTarget);
    [...this.warmLights, ...this.recessLights].forEach((light, index) => light.position.lerp(this.lightAnchors[index], 1 - Math.exp(-delta * 3)));
    for (const object of [...this.floorGroup.children, ...this.propGroup.children]) {
      if (typeof object.userData.room === 'number') {
        const center = object.userData.room * -20;
        // Cut away the room behind the camera once its doorway is crossed;
        // keep its ground so the viewport still has a continuous dungeon floor.
        object.visible = Math.abs(center - this.cameraTarget.z) < 37
          && !(object.userData.occluder && this.cameraTarget.z < center - 10);
      }
    }
    this.renderer.info.reset();
    if (this.softwareRenderer) this.renderer.render(this.scene, this.camera); else this.composer.render(delta);
  }

  get lootScreenPosition(): { x: number; y: number } | null {
    if (!this.lootPosition || this.elapsed >= this.lootExpiresAt) return null;
    const projected = this.lootPosition.clone().add(new THREE.Vector3(0, .65, 0)).project(this.camera);
    return { x: (projected.x + 1) * this.width * .5, y: (1 - projected.y) * this.height * .5 };
  }

  get heroScreenPosition(): { x: number; y: number } {
    const projected = this.hero.position.clone().add(new THREE.Vector3(0, 1.8, 0)).project(this.camera);
    return { x: (projected.x + 1) * this.width * .5, y: (1 - projected.y) * this.height * .5 };
  }

  get diagnostics(): Record<string, unknown> {
    return { appearance: this.appearance, lastAttack: this.lastAttack, lastSpellId: this.lastAttack?.spellId, lastSpellEffect: this.lastAttack?.effect, heroAnimation: this.heroAnimation || 'procedural', heroClips: [...this.heroActions.keys()], encounter: this.encounter, region: this.regionId, enemies: this.enemies.filter(enemy => !enemy.dead).length, articulatedEnemies: this.enemies.filter(enemy => enemy.animator.articulated).length, enemyRoster: this.enemies.reduce<Record<string, number>>((counts, enemy) => { counts[enemy.modelId] = (counts[enemy.modelId] ?? 0) + 1; return counts; }, {}), attacking: this.attacking, paused: this.paused, modelsLoaded: this.loadedModels, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, particles: this.particles.length, fragments: this.fragments.length, hero: this.hero.position.toArray(), softwareRenderer: this.softwareRenderer, fps: Math.round(this.framesPerSecond), quality: ['full', 'balanced', 'performance'][this.quality], renderer: this.renderer.getContext().getParameter(this.renderer.getContext().VERSION) };
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.frame); this.attackResolve?.(); this.scheduled.length = 0;
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
    this.enemyInstances.forEach(instance => instance.mesh.dispose());
    this.stoneFragments.dispose(); this.hotFragments.dispose();
    this.environment.dispose(); this.bloom.dispose(); this.composer.dispose(); this.renderer.dispose();
  }
}
