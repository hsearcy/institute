import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { stoneMaterial, glowTexture, waveTexture } from './world/materials';

type Enemy = { root: THREE.Group; visual: THREE.Object3D; origin: THREE.Vector3; phase: number; brute: boolean; dead: boolean };
type Particle = { position: THREE.Vector3; velocity: THREE.Vector3; color: THREE.Color; life: number; maxLife: number; size: number };
type AttackOptions = { echo?: boolean; wide?: boolean; burning?: boolean; shards?: boolean; chains?: boolean; itemId?: string; kills?: number };
type Effect = { mesh: THREE.Mesh; age: number; duration: number; kind: 'ring' | 'slash' | 'beam' | 'ground' | 'shard'; radius: number };

/** Presentation only. Time, animations and damage never decide learning or rewards. */
export class DungeonWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-18, 18, 11, -11, .1, 180);
  readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly hero = new THREE.Group();
  private heroVisual = new THREE.Group();
  private readonly floorGroup = new THREE.Group();
  private readonly enemyGroup = new THREE.Group();
  private readonly effectsGroup = new THREE.Group();
  private readonly propGroup = new THREE.Group();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly destination = new THREE.Vector3();
  private readonly heroLight = new THREE.PointLight(0x48e6db, 12, 8, 1.8);
  private readonly burstLight = new THREE.PointLight(0xffae40, 0, 20, 1.5);
  private readonly warmLights = [new THREE.PointLight(0xffb365, 88, 22, 2), new THREE.PointLight(0xff9c46, 82, 21, 2)];
  private readonly rune: THREE.Mesh;
  private readonly materials: Record<string, THREE.MeshStandardMaterial>;
  private readonly models = new Map<string, THREE.Group>();
  private readonly particles: Particle[] = [];
  private readonly particleGeometry = new THREE.BufferGeometry();
  private readonly particlePositions = new Float32Array(900 * 3);
  private readonly particleColors = new Float32Array(900 * 3);
  private readonly particleScales = new Float32Array(900);
  private readonly particleMaterial: THREE.PointsMaterial;
  private readonly waveMap = waveTexture();
  private readonly glowMap = glowTexture();
  private readonly torches: { flame: THREE.Mesh; light?: THREE.PointLight; position: THREE.Vector3; phase: number }[] = [];
  private readonly effects: Effect[] = [];
  private readonly enemies: Enemy[] = [];
  private readonly enemyInstances: { mesh: THREE.InstancedMesh; sources: THREE.Mesh[] }[] = [];
  private floorVariants: THREE.MeshStandardMaterial[] = [];
  private lastFrameAt = performance.now();
  private frame = 0;
  private elapsed = 0;
  private encounter = 0;
  private regionId = 'sunken-vault';
  private equipment = '';
  private disposed = false;
  private paused = false;
  private attacking = false;
  private attackAge = 0;
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
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.shadowMap.enabled = !this.softwareRenderer;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(0x080f16);
    this.scene.fog = new THREE.Fog(0x0a1520, 30, 76);
    this.materials = {
      floor: stoneMaterial(0x737979), wall: stoneMaterial(0x59636b, 18), trim: stoneMaterial(0x889197, 31),
      dark: new THREE.MeshStandardMaterial({ color: 0x192b34, roughness: .86 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xb38b47, metalness: .76, roughness: .38 }),
      runeGold: new THREE.MeshStandardMaterial({ color: 0x58624b, metalness: .45, roughness: .81 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x93a5a7, metalness: .75, roughness: .35 }),
      teal: new THREE.MeshStandardMaterial({ color: 0x187f8d, roughness: .83 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xa4a391, roughness: .89 }),
      crystal: new THREE.MeshStandardMaterial({ color: 0x29bcbf, emissive: 0x05c9e5, emissiveIntensity: 1.4, metalness: .3, roughness: .22 }),
      flame: new THREE.MeshStandardMaterial({ color: 0xff9218, emissive: 0xff6500, emissiveIntensity: 2, transparent: true, opacity: .94, toneMapped: false }),
    };
    if (this.softwareRenderer) for (const name of ['floor', 'wall', 'trim']) this.materials[name].bumpMap = null;
    this.scene.add(new THREE.HemisphereLight(0x9dc8d2, 0x554637, 1.85));
    const moon = new THREE.DirectionalLight(0xafd0dd, 3.1);
    moon.position.set(-12, 24, -10); moon.castShadow = true;
    moon.shadow.mapSize.set(this.softwareRenderer ? 1024 : 2048, this.softwareRenderer ? 1024 : 2048); moon.shadow.camera.left = moon.shadow.camera.bottom = -23;
    moon.shadow.camera.right = moon.shadow.camera.top = 23; moon.shadow.camera.far = 80;
    moon.shadow.normalBias = .045; moon.shadow.bias = -.00015;
    this.scene.add(moon, moon.target);
    moon.name = 'moon';
    this.scene.add(this.floorGroup, this.enemyGroup, this.effectsGroup, this.propGroup, this.hero);
    this.heroVisual = this.makeHero(); this.hero.add(this.heroVisual);
    this.heroLight.position.set(0, 3.5, 1); this.hero.add(this.heroLight);
    this.scene.add(this.burstLight);
    this.scene.add(...this.warmLights);
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
    this.buildDungeon(); this.setEncounter(0); this.resize();
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(['hero', 'imp', 'guardian', 'arch', 'pillar', 'brazier', 'crystal', 'chest'].map(async name => {
      try {
        const gltf = await loader.loadAsync(`/assets/rpg/${name}.glb`);
        if (this.disposed) return;
        gltf.scene.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true; object.receiveShadow = true;
            if (object.material instanceof THREE.MeshStandardMaterial && /glow_flame|glow_amber/.test(object.material.name)) {
              object.material.emissive.setHex(0xff780c); object.material.emissiveIntensity = 1.4; object.material.toneMapped = false;
            }
            if (name === 'hero' && object.material instanceof THREE.MeshStandardMaterial && /glow_/.test(object.material.name)) {
              object.material.emissiveIntensity = .3; object.material.toneMapped = true;
            }
          }
        });
        this.models.set(name, gltf.scene); this.loadedModels++;
      } catch { /* The authored procedural dungeon remains fully playable offline. */ }
    }));
    if (this.disposed) return;
    if (this.models.has('hero')) {
      this.hero.remove(this.heroVisual); this.releaseProcedural(this.heroVisual); this.heroVisual = new THREE.Group();
      this.heroVisual.add(this.model('hero', 1.8)!); this.hero.add(this.heroVisual); this.setEquipment(this.equipment);
    }
    this.enemies.forEach(enemy => {
      const visual = this.model(enemy.brute ? 'guardian' : 'imp', enemy.brute ? (this.encounter === 5 ? 3.8 : 2.2) : 1.3);
      if (visual) { enemy.root.remove(enemy.visual); this.releaseProcedural(enemy.visual); enemy.visual = visual; enemy.root.add(visual); }
    });
    this.batchEnemies();
    this.addModelProps();
    this.renderer.shadowMap.needsUpdate = true;
    this.loadedAt = performance.now();
  }

  private model(name: string, height: number): THREE.Group | undefined {
    const original = this.models.get(name); if (!original) return undefined;
    const clone = original.clone(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = height / Math.max(size.y, .01); clone.scale.multiplyScalar(scale);
    clone.position.y -= bounds.min.y * scale;
    return clone;
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

  private makeEnemy(brute: boolean, boss: boolean): THREE.Group {
    const model = this.model(brute ? 'guardian' : 'imp', brute ? (boss ? 3.8 : 2.2) : 1.3); if (model) return model;
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

  private buildDungeon(): void {
    let state = 12479;
    const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    const batches = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, ry = 0) => {
      geometry.rotateY(ry); geometry.translate(x, y, z);
      // Icosahedra are unindexed; normalize all primitives before batching them.
      const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
      if (normalized !== geometry) geometry.dispose();
      const key = `${material.uuid}:${Math.floor(z / 16)}`;
      if (!batches.has(key)) batches.set(key, { material, geometries: [] }); batches.get(key)!.geometries.push(normalized);
    };
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, ry);
    const floorVariants = this.floorVariants = Array.from({ length: 7 }, (_, index) => {
      const material = this.materials.floor.clone(); material.color.multiplyScalar(.79 + index * .065);
      return material;
    });
    // A continuous, authored route: six halls connected through monumental arches.
    box(90, 1.2, 180, this.materials.dark, 0, -.85, -40);
    for (let row = -25; row < 100; row++) for (let col = -28; col <= 28; col++) {
      const x = col * 1.12 + (row % 2) * .56, z = -row * 1.12;
      const floor = floorVariants[Math.abs(col) > 18 ? 0 : Math.floor(random() * floorVariants.length)];
      const width = 1.055 + random() * .025, height = .22 + random() * .065, depth = 1.055 + random() * .025, turn = (random() - .5) * .028;
      if (this.softwareRenderer) {
        const tile = new THREE.PlaneGeometry(width, depth); tile.rotateX(-Math.PI / 2);
        add(tile, floor, x, height / 2 - .14, z, turn);
      } else box(width, height, depth, floor, x, -.14, z, turn);
      if (random() < .035 && Math.abs(col) > 4) box(.15 + random() * .28, .13, .23, this.materials.wall, x + random() * .4, .03, z, random() * 3);
    }
    for (let room = 0; room < 6; room++) {
      const center = -room * 16;
      // Insets, ceremonial floor medallion and brass route markings.
      const circle = new THREE.TorusGeometry(4.15, .025, 4, 64); circle.rotateX(Math.PI / 2); add(circle, this.materials.runeGold, 0, .048, center);
      const innerCircle = new THREE.TorusGeometry(3.6, .018, 4, 64); innerCircle.rotateX(Math.PI / 2); add(innerCircle, this.materials.runeGold, 0, .048, center);
      for (let k = 0; k < 12; k++) {
        const angle = k / 12 * Math.PI * 2;
        box(.06, .035, .22, this.materials.runeGold, Math.sin(angle) * 3.88, .049, center + Math.cos(angle) * 3.88, angle);
        box(.2, .035, .04, this.materials.runeGold, Math.sin(angle) * 3.93, .049, center + Math.cos(angle) * 3.93, angle + .6);
      }
      for (const side of [-1, 1]) {
        // Raised side aisles and collapsed tombs break up the corridor silhouette.
        for (let step = 0; step < 3; step++) box(2.6 - step * .65, .18, 4.4, this.materials.wall, side * (11.8 + step * .28), step * .18, center + 3.5);
        for (let k = 0; k < 2; k++) {
          const x = side * (7.2 + random() * 1.1), z = center + (k ? 5.7 : -5.1);
          box(1.25, .65, 2.15, this.materials.wall, x, .32, z, side * .17);
          box(1.45, .16, 2.4, this.materials.trim, x, .72, z, side * .17);
          box(.24, .06, 1.1, this.materials.gold, x, .82, z, side * .17);
          box(.75, .06, .16, this.materials.gold, x, .83, z + .2, side * .17);
        }
        for (let k = 0; k < 28; k++) {
          const outer = k > 16;
          const x = side * (outer ? 14.5 + random() * 4.5 : 8 + random() * 3.5), z = center + (random() - .5) * 15;
          const rubble = new THREE.DodecahedronGeometry(.16 + random() * (outer ? .8 : .36), 0);
          rubble.scale(1.5, .5 + random() * .5, 1);
          add(rubble, this.materials.wall, x, .1 + random() * .1, z, random() * 6);
        }
        for (let k = 0; k < 3; k++) {
          const z = center + (k - 1) * 5.3, x = side * 12.2;
          box(1.6, .4, 1.6, this.materials.trim, x, .2, z);
          for (let course = 0; course < 8; course++) box(1.12 + (course % 3 === 0 ? .08 : 0), .46, 1.12, this.materials.wall, x, .56 + course * .48, z, (course % 2 ? .012 : -.012));
          box(1.55, .35, 1.55, this.materials.trim, x, 4.15, z);
          for (const offset of [-.48, .48]) box(.18, 3.65, .18, this.materials.trim, x + offset, 2.2, z + side * .55);
          box(1.25, .1, 1.25, this.materials.gold, x, 1.16, z);
          for (let groove = 0; groove < 3; groove++) box(.07, 2.6, .06, this.materials.trim, x - .3 + groove * .3, 2.25, z + .59);
          this.addTorch(side * 10.85, 1.8, z, room === 0 && k === 1);
        }
        for (let z = center - 7; z < center + 7; z += 1.25) for (let layer = 0; layer < 4; layer++) {
          box(.65, .59, 1.19, this.materials.wall, side * 13.3, .31 + layer * .62, z + (layer % 2) * .3);
        }
        for (let k = 0; k < 4; k++) {
          const x = side * (8.8 + random() * 2.4), z = center + (random() - .5) * 12;
          add(new THREE.IcosahedronGeometry(.35 + random() * .3, 0), this.materials.wall, x, .2, z, random() * 3);
          for (let n = 0; n < 3; n++) {
            const crystal = new THREE.ConeGeometry(.18 + random() * .12, .7 + random() * .9, 5);
            crystal.rotateZ((random() - .5) * .6);
            add(crystal, this.materials.crystal, x + (random() - .5) * .5, .7, z + (random() - .5) * .5);
          }
        }
      }
      if (room < 5) {
        const z = center - 8;
        for (const side of [-1, 1]) {
          box(5.6, 1.0, 1.0, this.materials.wall, side * 10, .5, z);
          box(1.6, .35, 1.7, this.materials.trim, side * 6.7, .17, z);
          box(1.15, 4.8, 1.15, this.materials.wall, side * 6.7, 2.65, z);
          box(1.6, .32, 1.6, this.materials.trim, side * 6.7, 4.95, z);
        }
        // Broken high arches leave a clear view of the battlefield below.
        for (const side of [-1, 1]) for (let k = 0; k < 5; k++) box(.7, .75, 1, this.materials.wall, side * (6.4 - k * .55), 5.05 + k * .3, z, side * .35);
      }
      // Scattered barrels, urns and fallen masonry along edges, away from route.
      for (let k = 0; k < 8; k++) {
        const x = (k % 2 ? -1 : 1) * (7.8 + random() * 3.2), z = center + (random() - .5) * 13;
        if (k % 3 === 0) add(new THREE.CylinderGeometry(.24, .37, .7, 8), this.materials.dark, x, .35, z);
        else box(.5 + random() * .6, .15 + random() * .3, .5, this.materials.wall, x, .15, z, random() * 4);
      }
    }
    // The last hall has a destination the child can see before the final cast.
    for (let step = 0; step < 4; step++) box(9 - step * .55, .22, 5.5 - step * .6, this.materials.wall, 0, .11 + step * .22, -88 - step * .25);
    for (const side of [-1, 1]) {
      for (let course = 0; course < 8; course++) for (let block = 0; block < 7; block++) {
        box(1.12, .59, 1.2, this.materials.wall, side * (4.15 + block * 1.17), course * .62 + .3, -91);
      }
      box(1.5, .3, 1.5, this.materials.trim, side * 3.6, .95, -88.5);
      box(1.05, 3.2, 1.05, this.materials.wall, side * 3.6, 2.7, -88.5);
      add(new THREE.OctahedronGeometry(.7, 0), this.materials.crystal, side * 3.6, 4.65, -88.5);
      this.addTorch(side * 5.1, 1.1, -86.5, true);
    }
    for (const { material, geometries } of batches.values()) {
      const merged = mergeGeometries(geometries, false);
      if (merged) { const mesh = this.mesh(merged, material); mesh.castShadow = material !== this.materials.floor && !floorVariants.includes(material as THREE.MeshStandardMaterial); this.floorGroup.add(mesh); }
      geometries.forEach(geometry => geometry.dispose());
    }
  }

  private addTorch(x: number, y: number, z: number, withLight: boolean): void {
    const group = new THREE.Group(); group.position.set(x, y, z);
    group.add(this.mesh(new THREE.CylinderGeometry(.2, .12, .36, 8), this.materials.gold));
    const flame = this.mesh(new THREE.OctahedronGeometry(.21, 0), this.materials.flame, 0, .38); flame.scale.y = 2.1; group.add(flame);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff942b, map: this.glowMap, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.y = .42; halo.scale.set(1.65, 2.1, 1); group.add(halo);
    let light: THREE.PointLight | undefined;
    if (withLight && !this.softwareRenderer) { light = new THREE.PointLight(0xffa74c, 22, 15, 2); light.position.set(0, .7, 0); group.add(light); }
    this.torches.push({ flame, light, position: new THREE.Vector3(x, y + .4, z), phase: x + z }); this.floorGroup.add(group);
  }

  private addModelProps(): void {
    for (let room = 0; room < 6; room++) {
      for (const side of [-1, 1]) {
        for (const name of ['brazier', 'crystal', 'pillar']) {
          const model = this.model(name, name === 'pillar' ? 3.7 : name === 'brazier' ? 1.7 : 1.9);
          if (!model) continue;
          model.position.x = side * (name === 'pillar' ? 8 : 9.8);
          model.position.z = -room * 16 + (name === 'crystal' ? 4.5 : name === 'pillar' ? -5 : -2);
          this.propGroup.add(model);
        }
      }
      const chest = this.model('chest', .9); if (chest) { chest.position.set(5.8, 0, -room * 16 - 3); chest.rotation.y = -.7; this.propGroup.add(chest); }
      for (const side of [-1, 1]) {
        const arch = this.model('arch', 4.9);
        if (arch) { arch.position.set(side * 12.8, 0, -room * 16 + 2.5); arch.rotation.y = Math.PI / 2; this.propGroup.add(arch); }
      }
    }
    const finalArch = this.model('arch', 6.2);
    if (finalArch) { finalArch.position.set(0, .85, -90); this.propGroup.add(finalArch); }
    const portal = new THREE.Mesh(new THREE.CircleGeometry(2.15, 48), new THREE.MeshBasicMaterial({ color: 0x36c9e7, map: this.glowMap, transparent: true, opacity: .7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    portal.position.set(0, 3, -90.15); this.propGroup.add(portal);
  }

  setEncounter(index: number, regionId?: string, enemyCount?: number): void {
    const was = this.encounter;
    this.encounter = Math.max(0, Math.min(5, index));
    if (regionId) this.regionId = regionId;
    this.enemies.forEach(enemy => this.releaseProcedural(enemy.visual));
    this.enemyInstances.forEach(instance => instance.mesh.dispose()); this.enemyInstances.length = 0;
    this.enemies.length = 0; this.enemyGroup.clear();
    this.destination.set(Math.sin(this.encounter * 2) * 1.3, 0, -this.encounter * 16 + 1.4);
    if (!this.frame || Math.abs(was - this.encounter) > 1) { this.hero.position.copy(this.destination); this.cameraTarget.copy(this.destination); }
    const count = Math.max(1, Math.min(64, enemyCount ?? (this.encounter === 5 ? 24 : 18 + this.encounter * 2)));
    for (let i = 0; i < count; i++) {
      const brute = (i % 7 === 0), boss = this.encounter === 5 && i === 0;
      const angle = i * 2.39996 + this.encounter * .7;
      const radius = 1 + ((i * 7) % 9) * .23;
      const approach = Math.floor(i / 5) % 3;
      const anchors = [[-4.5, -3.6], [4.4, -2.1], [-.8, 5.5]];
      const anchor = anchors[approach];
      const root = new THREE.Group();
      const origin = this.destination.clone().add(new THREE.Vector3(anchor[0] + Math.sin(angle) * radius, 0, anchor[1] + Math.cos(angle) * radius));
      if (i === 2 || i === 8) origin.copy(this.destination).add(new THREE.Vector3(i === 2 ? -2.3 : 2.4, 0, i === 2 ? .4 : -.6));
      if (boss) origin.set(0, 0, -this.encounter * 16 - 4);
      root.position.copy(origin); root.rotation.y = Math.atan2(this.destination.x - origin.x, this.destination.z - origin.z);
      const visual = this.makeEnemy(brute, boss); root.add(visual); this.enemyGroup.add(root);
      this.enemies.push({ root, visual, origin, phase: i * 1.77, brute, dead: false });
    }
    const ember = this.regionId.includes('ember') || this.regionId.includes('forge');
    const frost = this.regionId.includes('frost');
    const color = ember ? 0xff9d42 : frost ? 0x71b6ff : 0x9676ff;
    this.materials.crystal.emissive.setHex(color);
    this.materials.crystal.color.setHex(color);
    this.heroLight.color.setHex(0x4adfcf);
    this.materials.floor.color.setHex(ember ? 0x7d7162 : frost ? 0x71838c : 0x6d707f);
    this.floorVariants.forEach((material, index) => material.color.copy(this.materials.floor.color).multiplyScalar(.79 + index * .065));
    this.materials.wall.color.setHex(ember ? 0x655f58 : frost ? 0x5a7280 : 0x615b74);
    this.scene.fog = new THREE.Fog(ember ? 0x171719 : frost ? 0x101d2b : 0x181626, 30, 76);
    this.warmLights.forEach(light => light.color.setHex(ember ? 0xffaa58 : frost ? 0x79c9ee : 0xae83ff));
    this.batchEnemies();
    this.renderer.shadowMap.needsUpdate = true;
  }

  private batchEnemies(): void {
    this.enemyInstances.forEach(instance => { this.enemyGroup.remove(instance.mesh); instance.mesh.dispose(); }); this.enemyInstances.length = 0;
    const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; sources: THREE.Mesh[] }>();
    for (const enemy of this.enemies) {
      // Keep procedural actors independent until their authored models arrive.
      if (enemy.visual.userData.procedural) continue;
      enemy.visual.visible = false;
      enemy.visual.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const key = object.geometry.uuid;
        if (!batches.has(key)) batches.set(key, { geometry: object.geometry, material: object.material, sources: [] });
        batches.get(key)!.sources.push(object);
      });
    }
    for (const { geometry, material, sources } of batches.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, sources.length);
      mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.enemyInstances.push({ mesh, sources }); this.enemyGroup.add(mesh);
    }
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
    this.attacking = true; this.attackAge = 0;
    const lightning = /spark|lightning|storm|chain/.test(spellId);
    const fire = /fire|nova|flame|ember/.test(spellId);
    const frost = /frost|ice|cold/.test(spellId);
    const color = lightning ? 0xb098ff : fire ? 0xff791f : frost ? 0x99eeff : 0x79f3df;
    const origin = this.hero.position.clone(); origin.y = .18;
    this.emit(origin.clone().add(new THREE.Vector3(0, 1.2, 0)), color, 55, 2.6, 1);
    this.schedule(.22, () => {
      this.shake = fire ? .32 : .2;
      this.burstLight.color.setHex(color); this.burstLight.position.copy(origin).y = 2.5; this.burstLight.intensity = fire ? 150 : 90;
      if (lightning) {
        this.chainLightning(origin, color);
        if (options.chains) this.schedule(.4, () => {
          this.chainLightning(origin, 0xd0eeff); this.ring(origin, 0xa694ff, 8, .8, 'ring'); this.shake = .22;
        });
      }
      else if (frost) {
        this.ring(origin, 0x91e8ff, options.wide ? 10 : 8, 1.1, 'ring');
        this.ring(origin, 0xd5faff, 5.6, .65, 'ring');
        this.enemies.forEach((enemy, index) => this.schedule(index * .02, () => {
          const material = new THREE.MeshBasicMaterial({ color: index % 2 ? 0x70caff : 0xd3f6ff, transparent: true, blending: THREE.AdditiveBlending });
          const shard = new THREE.Mesh(new THREE.ConeGeometry(.25, 1.9, 5), material);
          shard.position.copy(enemy.origin); shard.position.y = 4.8; shard.rotation.z = -.15;
          this.effectsGroup.add(shard); this.effects.push({ mesh: shard, age: 0, duration: 1, kind: 'shard', radius: 1 });
        }));
        this.emit(origin, 0xb8f5ff, 140, 6.5, 1.65);
        if (options.shards) this.schedule(.65, () => {
          this.ring(origin, 0xe2ffff, 9, .7, 'ring');
          this.enemies.forEach(enemy => this.emit(enemy.origin.clone().setY(.8), 0x91eaff, 8, 2.2, .9));
          this.shake = .2;
        });
      } else if (fire) {
        this.ring(origin, color, options.wide ? 10 : 8, .8, 'ring');
        this.ring(origin, 0xffe8a1, 7.6, .52, 'ring');
        this.emit(origin, 0xff951f, 150, 8, 1.45);
      } else {
        this.ring(origin, color, 6.7, .55, 'slash');
        this.schedule(.2, () => this.ring(origin, 0xffd793, 7.6, .55, 'slash'));
      }
      this.enemies.forEach((enemy, index) => this.schedule((frost ? .35 : .12) + index * .018, () => this.hitEnemy(enemy, color)));
      if (this.encounter === 5) this.schedule(.85, () => {
        const boss = this.enemies[0];
        this.ring(boss.origin.clone().setY(.1), 0xffd997, 10, 1.2, 'ring');
        this.emit(boss.origin.clone().setY(1.8), 0xffd997, 100, 7, 1.6);
        this.shake = .4;
      });
      if (options.echo) this.schedule(.58, () => { this.ring(origin, color, 9, .7, 'ring'); this.emit(origin, color, 80, 7, 1.05); this.shake = .16; this.burstLight.intensity = 80; });
      if (options.burning || options.itemId?.includes('cinder')) this.schedule(.45, () => this.ring(origin, 0xff6d24, 5.8, 2.1, 'ground'));
      this.schedule(.95, () => this.spawnLoot(origin, this.encounter === 5));
    });
    return new Promise(resolve => { this.attackResolve = resolve; });
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
      this.schedule(index * .025, () => {
        const points = [from];
        for (let segment = 1; segment < 7; segment++) points.push(from.clone().lerp(to, segment / 7).add(new THREE.Vector3((Math.random() - .5) * .7, (Math.random() - .5) * .65, (Math.random() - .5) * .7)));
        points.push(to);
        const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', .01);
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 21, .055, 4, false), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false }));
        this.effectsGroup.add(mesh); this.effects.push({ mesh, age: 0, duration: .55, kind: 'beam', radius: 1 });
      });
    });
  }

  private hitEnemy(enemy: Enemy, color: number): void {
    enemy.dead = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.emit(enemy.origin.clone().add(new THREE.Vector3(0, .9, 0)), color, enemy.brute ? 35 : 18, 3, 1);
    this.emit(enemy.origin.clone().add(new THREE.Vector3(0, .35, 0)), 0xc7ae77, 8, 1.7, 1.35);
  }

  private spawnLoot(origin: THREE.Vector3, boss: boolean): void {
    for (let i = 0; i < (boss ? 5 : 3); i++) {
      const position = origin.clone().add(new THREE.Vector3(Math.cos(i * 2.4) * (2 + i * .4), .14, Math.sin(i * 2.4) * (2 + i * .4)));
      const color = boss && i === 0 ? 0xffb54a : i === 0 ? 0xbb83ff : 0x71e8e0;
      this.emit(position, color, 20, 1.7, 1.5);
      const geometry = new THREE.CylinderGeometry(.025, .15, boss ? 5 : 3.4, 8, 1, true);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
      mesh.position.copy(position); mesh.position.y += boss ? 2.5 : 1.7;
      this.effectsGroup.add(mesh); this.effects.push({ mesh, age: 0, duration: 1.7, kind: 'beam', radius: 1 });
    }
  }

  private emit(origin: THREE.Vector3, color: number, count: number, speed: number, life: number): void {
    for (let i = 0; i < count && this.particles.length < 890; i++) {
      const angle = Math.random() * Math.PI * 2, amount = (.2 + Math.random() * .8) * speed;
      this.particles.push({ position: origin.clone(), velocity: new THREE.Vector3(Math.cos(angle) * amount, Math.random() * speed * .6 + .3, Math.sin(angle) * amount), color: new THREE.Color(color), life, maxLife: life, size: speed < .2 ? .2 : speed < .6 ? .4 : .75 + Math.random() * .5 });
    }
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    const ratio = width / height;
    const halfHeight = ratio < 1 ? 13.5 / ratio : 11.4;
    this.camera.left = -halfHeight * ratio; this.camera.right = halfHeight * ratio;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight; this.camera.updateProjectionMatrix();
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
      this.tick(Math.min(delta, .3));
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
      if (!this.softwareRenderer && this.loadedAt && measuredAt - this.loadedAt > 5000 && !this.attacking) {
        this.lowFpsSamples = this.framesPerSecond < 29 ? this.lowFpsSamples + 1 : 0;
        this.highFpsSamples = this.framesPerSecond > 55 ? this.highFpsSamples + 1 : 0;
        if (this.lowFpsSamples >= 3 && this.quality < 2) {
          this.quality++; this.lowFpsSamples = this.highFpsSamples = 0; this.width = 0;
        } else if (this.highFpsSamples >= 12 && this.quality > 0) {
          this.quality--; this.lowFpsSamples = this.highFpsSamples = 0; this.width = 0;
        }
      }
    }
    this.elapsed += delta; this.resize();
    for (let i = this.scheduled.length - 1; i >= 0; i--) if (this.scheduled[i].at <= this.elapsed) { const [task] = this.scheduled.splice(i, 1); task.callback(); }
    const distance = this.hero.position.distanceTo(this.destination);
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
      this.heroVisual.rotation.y = THREE.MathUtils.lerp(this.heroVisual.rotation.y, Math.PI * .9, delta * 4);
    }
    if (this.attacking) {
      this.attackAge += delta;
      this.heroVisual.rotation.y += Math.sin(Math.min(this.attackAge / .7, 1) * Math.PI) * .18;
      this.heroVisual.position.y += Math.sin(Math.min(this.attackAge / .5, 1) * Math.PI) * .35;
      if (this.attackAge >= 2.35) { this.attacking = false; this.attackResolve?.(); this.attackResolve = undefined; }
    }
    this.rune.rotation.z = this.elapsed * .14;
    this.rune.scale.setScalar(1 + Math.sin(this.elapsed * 2) * .04);
    for (const enemy of this.enemies) {
      if (enemy.dead) {
        enemy.root.scale.multiplyScalar(Math.max(0, 1 - delta * 2.9));
        enemy.root.position.y += delta * .23;
        enemy.root.rotation.z += delta * (enemy.phase % 2 ? 1.4 : -1.4);
        if (enemy.root.scale.x < .04) enemy.root.visible = false;
      } else {
        enemy.root.position.x = enemy.origin.x + Math.sin(this.elapsed * .65 + enemy.phase) * .22;
        enemy.root.position.z = enemy.origin.z + Math.cos(this.elapsed * .72 + enemy.phase) * .2;
        enemy.visual.position.y = Math.sin(this.elapsed * 2.7 + enemy.phase) * (enemy.brute ? .028 : .055);
        enemy.visual.rotation.z = Math.sin(this.elapsed * 1.5 + enemy.phase) * .035;
      }
    }
    if (this.enemyInstances.length) {
      this.enemyGroup.updateMatrixWorld(true);
      this.enemyInstances.forEach(instance => {
        instance.sources.forEach((source, index) => instance.mesh.setMatrixAt(index, source.matrixWorld));
        instance.mesh.instanceMatrix.needsUpdate = true;
      });
    }
    this.torches.forEach(torch => {
      const flicker = 1 + Math.sin(this.elapsed * 11 + torch.phase) * .12 + Math.sin(this.elapsed * 17 + torch.phase) * .08;
      torch.flame.scale.y = 2.1 * flicker; if (torch.light) torch.light.intensity = 22 * flicker;
      if (Math.abs(torch.position.z - this.hero.position.z) < 17 && Math.random() < delta * 3) this.emit(torch.position, 0xffb965, 1, .35, 1.4);
    });
    if (Math.random() < delta * 14) this.emit(this.hero.position.clone().add(new THREE.Vector3((Math.random() - .5) * 24, 1 + Math.random() * 4, (Math.random() - .5) * 20)), 0x65979b, 1, .12, 4);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]; effect.age += delta;
      const t = effect.age / effect.duration;
      if (t >= 1) { this.effectsGroup.remove(effect.mesh); effect.mesh.geometry.dispose(); (effect.mesh.material as THREE.Material).dispose(); this.effects.splice(i, 1); continue; }
      const material = effect.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = effect.kind === 'ground' ? (1 - t) * .6 : (1 - t) * .95;
      if (effect.kind === 'shard') {
        effect.mesh.position.y = Math.max(.6, 4.8 - t * 14);
        effect.mesh.scale.y = 1 - Math.max(0, t - .5) * 1.5;
      } else if (effect.kind !== 'beam') {
        effect.mesh.scale.setScalar(effect.radius * (effect.kind === 'ground' ? 1 : 1 - Math.pow(1 - t, 3)));
        if (effect.kind === 'slash') effect.mesh.rotation.z += delta * 9;
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life -= delta;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.velocity.y -= delta * .55; p.position.addScaledVector(p.velocity, delta); p.velocity.multiplyScalar(1 - delta * .7);
      const offset = i * 3;
      this.particlePositions[offset] = p.position.x; this.particlePositions[offset + 1] = Math.max(.05, p.position.y); this.particlePositions[offset + 2] = p.position.z;
      const fade = Math.min(1, p.life / p.maxLife * 2);
      this.particleScales[i] = p.size;
      this.particleColors[offset] = p.color.r * fade * 1.3; this.particleColors[offset + 1] = p.color.g * fade * 1.3; this.particleColors[offset + 2] = p.color.b * fade * 1.3;
    }
    this.particleGeometry.setDrawRange(0, this.particles.length); this.particleGeometry.attributes.position.needsUpdate = true; this.particleGeometry.attributes.color.needsUpdate = true; this.particleGeometry.attributes.particleScale.needsUpdate = true;
    this.burstLight.intensity *= Math.exp(-delta * 5); this.shake *= Math.exp(-delta * 7);
    this.cameraTarget.lerp(this.hero.position, 1 - Math.exp(-delta * 3.7));
    const shake = this.shake;
    this.camera.position.copy(this.cameraTarget).add(new THREE.Vector3(17 + (Math.random() - .5) * shake, 25, 20 + (Math.random() - .5) * shake));
    this.camera.lookAt(this.cameraTarget.x, .2, this.cameraTarget.z - 1.8);
    const moon = this.scene.getObjectByName('moon') as THREE.DirectionalLight;
    moon.position.set(this.cameraTarget.x - 12, 24, this.cameraTarget.z - 10); moon.target.position.copy(this.cameraTarget);
    this.warmLights[0].position.set(-8, 3.3, this.cameraTarget.z - 5);
    this.warmLights[1].position.set(8, 2.8, this.cameraTarget.z + 4);
    this.renderer.info.reset();
    if (this.softwareRenderer) this.renderer.render(this.scene, this.camera); else this.composer.render(delta);
  }

  get diagnostics(): Record<string, unknown> {
    return { encounter: this.encounter, region: this.regionId, enemies: this.enemies.filter(enemy => !enemy.dead).length, attacking: this.attacking, paused: this.paused, modelsLoaded: this.loadedModels, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, particles: this.particles.length, hero: this.hero.position.toArray(), softwareRenderer: this.softwareRenderer, fps: Math.round(this.framesPerSecond), quality: ['full', 'balanced', 'performance'][this.quality], renderer: this.renderer.getContext().getParameter(this.renderer.getContext().VERSION) };
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.frame); this.attackResolve?.(); this.scheduled.length = 0;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); } }
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
    this.waveMap.dispose(); this.glowMap.dispose();
    this.enemyInstances.forEach(instance => instance.mesh.dispose());
    this.bloom.dispose(); this.composer.dispose(); this.renderer.dispose();
  }
}
