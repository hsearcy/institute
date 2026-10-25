import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gearModelUrl } from './icons';

/**
 * A small turntable for one gear model inside the details card. The painted
 * icon stays underneath as the fallback; the canvas fades in once the model is
 * ready. One viewer at a time; dispose() frees every GPU resource.
 */
export class GearViewer {
  private renderer: THREE.WebGLRenderer | null = null;
  private frame = 0;
  private disposed = false;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, .01, 20);
  private pivot = new THREE.Group();
  private observer: ResizeObserver | null = null;

  constructor(private host: HTMLElement, private baseId: string) {}

  async mount(): Promise<void> {
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch { return; } // No WebGL: the icon remains.
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .92;
    const canvas = renderer.domElement; canvas.className = 'rpg-gear-canvas'; canvas.setAttribute('aria-hidden', 'true');
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; pmrem.dispose();
    this.scene.environment = environment; this.scene.environmentIntensity = .55;
    // Same intent as the icon studio: warm key, cool rim, soft top fill.
    const key = new THREE.DirectionalLight(0xffecd0, 1.7); key.position.set(-1.5, 1.2, 2.5);
    const rim = new THREE.DirectionalLight(0xb8d4ff, 1.6); rim.position.set(2, 1.5, -2);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xd9e2ff, 0x2a2018, .55), this.pivot);
    try {
      const gltf = await new GLTFLoader().loadAsync(gearModelUrl(this.baseId));
      if (this.disposed) { disposeObject(gltf.scene); return; }
      const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(center);
      this.pivot.add(gltf.scene);
      const radius = size.length() * .5 * .86;
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
      this.camera.position.set(0, distance * .28, distance); this.camera.lookAt(0, 0, 0);
      this.pivot.rotation.x = .12;
    } catch {
      return; // Missing model: the icon remains.
    }
    if (this.disposed) return;
    this.host.appendChild(canvas);
    this.resize();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.host);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = performance.now();
    const tick = (now: number) => {
      if (this.disposed || !this.renderer) return;
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (!still) this.pivot.rotation.y += dt * .55;
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(tick);
    };
    this.pivot.rotation.y = -.5;
    this.frame = requestAnimationFrame(tick);
    requestAnimationFrame(() => this.host.classList.add('rpg-gear-stage-live'));
  }

  private resize(): void {
    if (!this.renderer) return;
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    disposeObject(this.pivot);
    this.scene.environment?.dispose();
    if (this.renderer) {
      this.renderer.domElement.remove();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
  }
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
