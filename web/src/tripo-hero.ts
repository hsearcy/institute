import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

type View = 'front' | 'threequarter' | 'back' | 'face';
const canvas = document.querySelector<HTMLCanvasElement>('#tripo-canvas')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#dddcd6');
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, .001, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
const environment = pmrem.fromScene(room, .04); scene.environment = environment.texture;
room.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xfff8ed, 0x8e999a, .9));
const key = new THREE.DirectionalLight(0xfff4e5, 2.1); key.position.set(-3, 5, 4); scene.add(key);
const fill = new THREE.DirectionalLight(0xdceaff, .7); fill.position.set(4, 3, -2); scene.add(fill);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = .09;
let model: THREE.Group | undefined, bounds = new THREE.Box3(), size = new THREE.Vector3(), currentView: View = 'threequarter';
let ready = false, loadError: string | null = null, metadata: Record<string, unknown> = {};
const headCenter = new THREE.Vector3();
const render = () => renderer.render(scene, camera);
async function settle() { render(); await new Promise<void>(resolve => requestAnimationFrame(() => { render(); requestAnimationFrame(() => { render(); resolve(); }); })); }
async function setView(name: string) {
  if (!['front', 'threequarter', 'back', 'face'].includes(name)) throw new Error(`Unknown view: ${name}`);
  if (!model) throw new Error(loadError ?? 'The new hero is still loading.');
  currentView = name as View;
  const head = name === 'face', target = head ? headCenter.clone() : new THREE.Vector3(0, size.y * .52, 0);
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const portraitDistance = Math.max(size.y / (2 * Math.tan(halfFov)), Math.max(size.x, size.z) / (2 * Math.tan(halfFov) * camera.aspect)) * 1.3;
  const distance = head ? Math.max(size.y * .38, size.x * .6 / camera.aspect) : portraitDistance;
  const azimuth = name === 'back' ? Math.PI : name === 'threequarter' ? Math.PI / 6 : 0;
  camera.position.set(Math.sin(azimuth) * distance, target.y + (head ? .02 : .045) * distance, Math.cos(azimuth) * distance);
  camera.near = Math.max(.0001, size.y / 1000); camera.far = Math.max(size.y * 30, distance * 3); camera.updateProjectionMatrix();
  controls.target.copy(target); controls.minDistance = size.y * .1; controls.maxDistance = size.y * 12;
  camera.lookAt(target); controls.update();
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
  await settle();
  return { ok: true, selector: '#tripo-canvas', view: name, position: camera.position.toArray(), target: target.toArray() };
}
const api = {
  get ready() { return ready; }, get error() { return loadError; }, get info() { return metadata; },
  get model() { return model; }, scene, camera, renderer, controls, setView,
  getInfo: () => ({ ...metadata, drawCalls: renderer.info.render.calls, trianglesRendered: renderer.info.render.triangles }),
  async capture(name: string = currentView) { document.body.classList.add('capture'); await setView(name); return { ok: true, selector: '#tripo-canvas' }; },
};
(window as unknown as Record<string, unknown>).__TRIPO_HERO__ = api;
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => { button.onclick = () => { void setView(button.dataset.view!).catch(error => { status.textContent = String(error); }); }; });
window.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'h') document.body.classList.toggle('capture'); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop(() => { controls.update(); render(); });
if (new URLSearchParams(location.search).get('capture') === '1') document.body.classList.add('capture');
try {
  const gltf = await new GLTFLoader().loadAsync('/assets/rpg/tripo-hero.glb');
  model = gltf.scene; model.animations = gltf.animations;
  // This fresh Tripo export faces +X. Rotate only the viewer instance to +Z.
  model.rotation.y = -Math.PI / 2;
  bounds = new THREE.Box3().setFromObject(model); const originalBounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
  const center = bounds.getCenter(new THREE.Vector3()); bounds.getSize(size);
  if (bounds.isEmpty() || !size.toArray().every(Number.isFinite) || size.y <= 0) throw new Error('The downloaded model has invalid or empty bounds.');
  // Center the new asset for inspection without changing its geometry or scale.
  model.position.x -= center.x; model.position.z -= center.z; model.position.y -= bounds.min.y;
  scene.add(model); model.updateMatrixWorld(true); bounds.setFromObject(model);
  const headBounds = new THREE.Box3(), vertex = new THREE.Vector3();
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const positions = node.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
      if (vertex.y > size.y * .82) headBounds.expandByPoint(vertex);
    }
  });
  headBounds.getCenter(headCenter);
  let triangles = 0, meshCount = 0;
  const materials = new Map<string, Record<string, unknown>>();
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    meshCount++; triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position')?.count ?? 0) / 3;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material instanceof THREE.MeshStandardMaterial) material.envMapIntensity = 1;
      const pbr = material as THREE.MeshStandardMaterial;
      materials.set(material.uuid, { name: material.name || material.type, type: material.type, color: pbr.color?.getHexString(), roughness: pbr.roughness, metalness: pbr.metalness, textured: !!pbr.map, normalMap: !!pbr.normalMap });
    }
  });
  if (!meshCount) throw new Error('The downloaded model contains no meshes.');
  metadata = { asset: '/assets/rpg/tripo-hero.glb', originalBounds, bbox: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() }, triangles, meshes: meshCount, materials: [...materials.values()], animations: gltf.animations.map(clip => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })) };
  await setView('threequarter'); ready = true;
  status.textContent = `${meshCount} meshes · ${Math.round(triangles).toLocaleString()} triangles · ${materials.size} materials · ${gltf.animations.length} animations`;
} catch (error) {
  loadError = `Could not load the new Tripo hero: ${error instanceof Error ? error.message : String(error)}. The viewer expects /assets/rpg/tripo-hero.glb.`;
  status.textContent = loadError; status.classList.add('error'); document.body.classList.remove('capture');
}
