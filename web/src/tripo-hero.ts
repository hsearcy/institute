import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const parameters = new URLSearchParams(location.search);
// `?asset=review/<name>` opens any +Z-facing review GLB, such as a retargeted enemy.
const reviewAsset = /^review\/[\w/-]+$/.test(parameters.get('asset') ?? '') ? parameters.get('asset') : null;
const gameAsset = parameters.get('asset') === 'game' || parameters.get('asset') === 'motions' || !!reviewAsset;
// `motions` is the local untrimmed clip review from scripts/add-tripo-hero-motions.py --review.
const assetPath = reviewAsset ? `/assets/rpg/${reviewAsset}.glb` : parameters.get('asset') === 'motions' ? '/assets/rpg/review/hero-motion-review.glb' : gameAsset ? '/assets/rpg/tripo-hero-game.glb' : '/assets/rpg/tripo-hero.glb';
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
let mixer: THREE.AnimationMixer | undefined, currentAction: THREE.AnimationAction | undefined;
let currentAnimation = 'rest', animationPlaying = false;
const animationSelect = document.querySelector<HTMLSelectElement>('#animation-select')!;
const animationTime = document.querySelector<HTMLInputElement>('#animation-time')!;
const animationPlay = document.querySelector<HTMLButtonElement>('#animation-play')!;
const animationClock = document.querySelector<HTMLOutputElement>('#animation-clock')!;
function updateAnimationControls() {
  animationSelect.value = currentAnimation;
  const time = currentAction?.time ?? 0;
  animationTime.max = String(currentAction?.getClip().duration ?? 1);
  animationTime.value = String(time); animationTime.disabled = !currentAction;
  animationClock.value = `${time.toFixed(2)}s`;
  animationPlay.textContent = animationPlaying ? 'Pause' : 'Play'; animationPlay.disabled = !currentAction;
}
function inspectNodes(names?: string[]) {
  const nodes: Record<string, unknown>[] = [];
  model?.updateMatrixWorld(true);
  model?.traverse(node => {
    if (names ? !names.includes(node.name) : !(node instanceof THREE.Bone) && !/Tripo|Origin|Socket|Grip|Tip/.test(node.name)) return;
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    node.matrixWorld.decompose(position, quaternion, scale);
    nodes.push({ name: node.name, type: node.type, parent: node.parent?.name, position: position.toArray(), quaternion: quaternion.toArray(), scale: scale.toArray(), localPosition: node.position.toArray() });
  });
  return nodes;
}
async function setAnimation(name: string, time = 0, playing = false) {
  if (!model || !mixer) throw new Error('The new hero is still loading.');
  const clip = model.animations.find(clip => clip.name === name);
  if (name !== 'rest' && !clip) throw new Error(`Unknown animation: ${name}`);
  if (!Number.isFinite(time)) throw new Error('Animation time must be finite.');
  mixer.stopAllAction(); mixer.setTime(0); currentAction = undefined;
  currentAnimation = name; animationPlaying = playing && !!clip;
  if (clip) {
    currentAction = mixer.clipAction(clip).reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
    currentAction.setLoop(playing ? THREE.LoopRepeat : THREE.LoopOnce, playing ? Infinity : 1);
    currentAction.clampWhenFinished = true; currentAction.play();
    mixer.setTime(Math.max(0, Math.min(clip.duration, time)));
  }
  model.updateMatrixWorld(true); updateAnimationControls(); await settle();
  return { name, time: currentAction?.time ?? 0, playing: animationPlaying, duration: clip?.duration ?? 0, nodes: inspectNodes() };
}

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
  get model() { return model; }, scene, camera, renderer, controls, setView, setAnimation, inspectNodes,
  get animation() { return { name: currentAnimation, time: currentAction?.time ?? 0, playing: animationPlaying }; },
  getInfo: () => ({ ...metadata, drawCalls: renderer.info.render.calls, trianglesRendered: renderer.info.render.triangles }),
  async capture(name: string = currentView) { document.body.classList.add('capture'); await setView(name); return { ok: true, selector: '#tripo-canvas' }; },
};
(window as unknown as Record<string, unknown>).__TRIPO_HERO__ = api;
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => { button.onclick = () => { void setView(button.dataset.view!).catch(error => { status.textContent = String(error); }); }; });
window.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'h') document.body.classList.toggle('capture'); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
animationSelect.onchange = () => { void setAnimation(animationSelect.value, 0, false); };
animationTime.oninput = () => { void setAnimation(currentAnimation, Number(animationTime.value), false); };
animationPlay.onclick = () => { void setAnimation(currentAnimation, currentAction?.time ?? 0, !animationPlaying); };
let previousFrame = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), delta = Math.min(.1, (now - previousFrame) / 1000); previousFrame = now;
  if (animationPlaying) { mixer?.update(delta); updateAnimationControls(); }
  controls.update(); render();
});
if (parameters.get('capture') === '1') document.body.classList.add('capture');
try {
  const gltf = await new GLTFLoader().loadAsync(assetPath);
  // Keep presentation transforms outside the animated source root.
  model = new THREE.Group(); model.name = 'TripoViewer'; model.add(gltf.scene); model.animations = gltf.animations;
  // Raw Tripo faces +X; the assembled game rig is already normalized to +Z.
  if (!gameAsset) model.rotation.y = -Math.PI / 2;
  mixer = new THREE.AnimationMixer(model);
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
      node.getVertexPosition(i, vertex).applyMatrix4(node.matrixWorld);
      if (vertex.y > size.y * .82) headBounds.expandByPoint(vertex);
    }
  });
  if (headBounds.isEmpty()) headCenter.set(0, size.y * .86, 0); else headBounds.getCenter(headCenter);
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
  metadata = { asset: assetPath, originalBounds, bbox: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() }, triangles, meshes: meshCount, materials: [...materials.values()], animations: gltf.animations.map(clip => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })) };
  for (const clip of gltf.animations) { const option = document.createElement('option'); option.value = clip.name; option.textContent = clip.name; animationSelect.add(option); }
  document.querySelector<HTMLElement>('#animation-controls')!.hidden = gltf.animations.length === 0;
  updateAnimationControls();
  if (parameters.has('animation')) await setAnimation(parameters.get('animation')!, Number(parameters.get('time') ?? 0), false);
  await setView('threequarter'); ready = true;
  status.textContent = `${meshCount} meshes · ${Math.round(triangles).toLocaleString()} triangles · ${materials.size} materials · ${gltf.animations.length} animations`;
} catch (error) {
  loadError = `Could not load the new Tripo hero: ${error instanceof Error ? error.message : String(error)}. The viewer expects ${assetPath}.`;
  status.textContent = loadError; status.classList.add('error'); document.body.classList.remove('capture');
}
