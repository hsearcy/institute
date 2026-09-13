import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTealHeroModel } from './rpg/hero-img2threejs/createTealHeroModel';
import './hero-study.css';

type CameraSpec = {
  id?: string; azimuthDegrees?: number; elevationDegrees?: number; azimuth?: number; elevation?: number;
  target?: number[]; position?: number[]; distance?: number; radius?: number; fov?: number; fovDegrees?: number;
  near?: number; far?: number; exposure?: number; camera?: CameraSpec;
};
type PassId = 'beauty' | 'alpha-silhouette' | 'semantic-id' | 'depth' | 'normal' | 'roughness-material-id';
const passes: PassId[] = ['beauty', 'alpha-silhouette', 'semantic-id', 'depth', 'normal', 'roughness-material-id'];
const full = { elevationDegrees: 3, target: [-.327, 1.114, 0], distance: 4.10, fov: 32, near: .02, far: 30, exposure: 1 };
const presets: Record<string, CameraSpec> = {
  hero: { ...full, azimuthDegrees: -8 },
  'orbit-plus35': { ...full, azimuthDegrees: 35 },
  'orbit-minus35': { ...full, azimuthDegrees: -35 },
  profile: { ...full, azimuthDegrees: 90 },
  'rear-threequarter': { ...full, azimuthDegrees: 135 },
  rear: { ...full, azimuthDegrees: 180 },
  'head-hero': { ...full, target: [0, 2.02, 0], distance: 1.15, azimuthDegrees: 20 },
  'head-threequarter': { ...full, target: [0, 2.02, 0], distance: 1.15, azimuthDegrees: -35 },
};
const globals = window as unknown as Record<string, unknown>;
globals.__IMG2THREEJS_READY__ = false;
const canvas = document.querySelector<HTMLCanvasElement>('#hero-study-canvas')!;
const status = document.querySelector<HTMLOutputElement>('#hero-study-status')!;
const select = (id: string) => document.querySelector<HTMLSelectElement>(`#hero-study-${id}`)!;
const query = new URLSearchParams(location.search);
const scene = new THREE.Scene();
const beautyBackground = new THREE.Color(query.get('bg') ? `#${query.get('bg')}` : '#e5e1d9');
scene.background = beautyBackground;
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .02, 30);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false; controls.minDistance = .3; controls.maxDistance = 15;
const ambient = new THREE.HemisphereLight(0xfff7e9, 0x777d83, 1.65);
const key = new THREE.DirectionalLight(0xfff2df, 3.1); key.position.set(-3, 5, 5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -2; key.shadow.camera.right = 2;
key.shadow.camera.top = 3; key.shadow.camera.bottom = -1; key.shadow.normalBias = .025;
const fill = new THREE.DirectionalLight(0xe2efff, 1.1); fill.position.set(4, 2, 1);
const rim = new THREE.DirectionalLight(0xfff5e7, 1.5); rim.position.set(1, 3, -4);
scene.add(ambient, key, fill, rim);

let model: THREE.Group;
try { model = createTealHeroModel(); }
catch (error) { status.textContent = `Model build failed: ${String(error)}`; throw error; }
scene.add(model);
const mixer = new THREE.AnimationMixer(model);
const meshes: THREE.Mesh[] = [];
model.traverse(node => { if (node instanceof THREE.Mesh) { meshes.push(node); node.castShadow = true; node.receiveShadow = true; } });
if (!meshes.length) throw new Error('Fresh hero contains no meshes; capture readiness refused.');
const originals = new Map(meshes.map(mesh => [mesh, mesh.material]));
function originalMaterials(mesh: THREE.Mesh): THREE.Material[] {
  const value = originals.get(mesh)!; return Array.isArray(value) ? value : [value];
}
const originalVisibility = new Map(meshes.map(mesh => [mesh, mesh.visible]));
const diagnosticMaterials = new Map<string, THREE.Material>();
function regionOf(mesh: THREE.Mesh): string {
  let part: THREE.Object3D | null = mesh;
  while (part && part !== model.parent) {
    const region = part.userData.region ?? part.userData.semanticPart ?? part.userData.partId;
    if (typeof region === 'string') return region;
    part = part.parent;
  }
  return `unclassified:${mesh.name || mesh.uuid}`;
}
const regions = [...new Set(meshes.map(regionOf))].sort();
const regionColors = Object.fromEntries(regions.map((region, index) => [region, new THREE.Color().setHSL((index * .61803398875) % 1, .7, .5).getHexString()]));
const materialIds = [...new Set(meshes.flatMap(mesh => originalMaterials(mesh).map(material => material.name || material.uuid)))].sort();
let pass: PassId = 'beauty', playing = false, activeClip: THREE.AnimationClip | undefined;
let elapsed = 0, previous = performance.now(), action: THREE.AnimationAction | undefined;
const restTransforms = new Map<THREE.Object3D, { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }>();
model.traverse(node => restTransforms.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }));
function render() { model.updateMatrixWorld(true); renderer.render(scene, camera); }
function cleanCapture() { document.body.classList.add('capture-clean'); }
function restoreRest() {
  mixer.stopAllAction();
  for (const [node, rest] of restTransforms) { node.position.copy(rest.position); node.quaternion.copy(rest.quaternion); node.scale.copy(rest.scale); }
}
function setAnimation({ name = '', time = 0, playing: play = false }: { name?: string; time?: number; playing?: boolean } = {}) {
  if (!Number.isFinite(time) || time < 0) throw new Error('Animation time must be finite and nonnegative.');
  restoreRest(); action = undefined; activeClip = undefined; elapsed = time; playing = play;
  if (name) {
    activeClip = model.animations.find(clip => clip.name.toLowerCase() === name.toLowerCase());
    if (!activeClip) throw new Error(`Unknown clip: ${name}`);
    action = mixer.clipAction(activeClip).reset().setLoop(THREE.LoopRepeat, Infinity).play();
    mixer.setTime(time);
  }
  render();
  return { ok: true, clip: activeClip?.name ?? null, time: elapsed };
}
async function settledFrames() {
  render(); await new Promise<void>(resolve => requestAnimationFrame(() => { render(); requestAnimationFrame(() => { render(); resolve(); }); }));
}
async function setCamera(input: CameraSpec = {}, clean = true) {
  const spec = { ...(input.id ? presets[input.id] : presets.hero), ...input, ...input.camera };
  if (clean) cleanCapture();
  const target = spec.target ?? full.target;
  if (target.length !== 3 || !target.every(Number.isFinite)) throw new Error('Camera target must be three finite numbers.');
  const distance = spec.distance ?? spec.radius ?? full.distance;
  const azimuth = THREE.MathUtils.degToRad(spec.azimuthDegrees ?? spec.azimuth ?? 20);
  const elevation = THREE.MathUtils.degToRad(spec.elevationDegrees ?? spec.elevation ?? full.elevationDegrees);
  camera.fov = spec.fovDegrees ?? spec.fov ?? full.fov;
  camera.near = spec.near ?? full.near; camera.far = spec.far ?? full.far;
  if (![distance, azimuth, elevation, camera.fov, camera.near, camera.far].every(Number.isFinite) || distance <= 0 || camera.near <= 0 || camera.far <= camera.near || camera.fov <= 0 || camera.fov >= 180) throw new Error('Invalid camera frustum.');
  controls.enabled = false; controls.target.fromArray(target);
  if (spec.position && (spec.position.length !== 3 || !spec.position.every(Number.isFinite))) throw new Error('Camera position must be three finite numbers.');
  if (spec.position) camera.position.fromArray(spec.position);
  else camera.position.set(target[0] + Math.sin(azimuth) * Math.cos(elevation) * distance, target[1] + Math.sin(elevation) * distance, target[2] + Math.cos(azimuth) * Math.cos(elevation) * distance);
  camera.lookAt(controls.target); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  renderer.toneMappingExposure = spec.exposure ?? full.exposure;
  if (!Number.isFinite(renderer.toneMappingExposure) || renderer.toneMappingExposure <= 0) throw new Error('Exposure must be finite and positive.');
  await settledFrames();
  return { ok: true, selector: '#hero-study-canvas', camera: { position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov, near: camera.near, far: camera.far, exposure: renderer.toneMappingExposure } };
}
function diagnosticMaterial(mesh: THREE.Mesh, original: THREE.Material): THREE.Material {
  const key = `${pass}:${regionOf(mesh)}:${original.uuid}`;
  const cached = diagnosticMaterials.get(key); if (cached) return cached;
  let material: THREE.Material;
  if (pass === 'normal') material = new THREE.MeshNormalMaterial({ side: original.side });
  else if (pass === 'depth') material = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking, side: original.side });
  else {
    let color = new THREE.Color(0xffffff);
    if (pass === 'semantic-id') color = new THREE.Color(`#${regionColors[regionOf(mesh)]}`);
    if (pass === 'roughness-material-id') {
      const physical = original as THREE.MeshStandardMaterial;
      color = new THREE.Color().setRGB(physical.roughness ?? 1, (materialIds.indexOf(original.name || original.uuid) + 1) / (materialIds.length + 1), physical.metalness ?? 0, THREE.SRGBColorSpace);
    }
    material = new THREE.MeshBasicMaterial({ color, side: original.side, toneMapped: false });
  }
  material.toneMapped = false;
  diagnosticMaterials.set(key, material); return material;
}
async function capturePass({ passId = 'beauty', mode = 'procedural' }: { passId?: string; mode?: string } = {}) {
  if (mode !== 'procedural' && mode !== 'model') return { ok: false, reason: 'This isolated study admits only its freshly authored procedural model.' };
  if (!passes.includes(passId as PassId)) return { ok: false, reason: `Unknown capture pass: ${passId}` };
  cleanCapture(); playing = false; pass = passId as PassId;
  renderer.toneMapping = pass === 'beauty' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  scene.background = pass === 'beauty' ? beautyBackground : new THREE.Color(0x000000);
  for (const mesh of meshes) {
    const original = originals.get(mesh)!;
    mesh.material = pass === 'beauty' ? original : Array.isArray(original) ? original.map(material => diagnosticMaterial(mesh, material)) : diagnosticMaterial(mesh, original);
  }
  await settledFrames();
  return { ok: true, selector: '#hero-study-canvas', passId: pass, regionColors, materialIds, silhouetteEncoding: 'white foreground on black background', roughnessEncoding: 'R=roughness, G=(material index+1)/(count+1), B=metalness; sRGB bytes' };
}
function getMeshBuffers({ space = 'world', posed = true }: { space?: 'world' | 'local'; posed?: boolean } = {}) {
  model.updateMatrixWorld(true);
  return { rootName: model.name, space, posed, meshes: meshes.map(mesh => {
    const source = mesh.geometry.getAttribute('position');
    const positions = new Float32Array(source.count * 3), vertex = new THREE.Vector3();
    for (let index = 0; index < source.count; index++) {
      if (posed) mesh.getVertexPosition(index, vertex); else vertex.fromBufferAttribute(source, index);
      if (space === 'world') vertex.applyMatrix4(mesh.matrixWorld);
      vertex.toArray(positions, index * 3);
    }
    const derived = new THREE.BufferGeometry(); derived.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (mesh.geometry.index) derived.setIndex(mesh.geometry.index.clone());
    derived.computeVertexNormals();
    const data = { name: mesh.name, visible: mesh.visible, region: regionOf(mesh), positions: Array.from(positions), normals: Array.from(derived.getAttribute('normal').array),
      indices: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : Array.from({ length: source.count }, (_, index) => index),
      groups: mesh.geometry.groups, matrixWorld: mesh.matrixWorld.toArray(), materialIds: originalMaterials(mesh).map(material => material.name || material.uuid),
      skinIndex: mesh.geometry.getAttribute('skinIndex') ? Array.from(mesh.geometry.getAttribute('skinIndex').array) : undefined,
      skinWeight: mesh.geometry.getAttribute('skinWeight') ? Array.from(mesh.geometry.getAttribute('skinWeight').array) : undefined };
    derived.dispose(); return data;
  }) };
}
function isolatePart(region: string | null) {
  for (const mesh of meshes) mesh.visible = originalVisibility.get(mesh)! && (!region || regionOf(mesh) === region);
  render(); return { ok: true, region };
}
const api = { setCamera, capturePass, setAnimation, getMeshBuffers, getMeshGeometry: getMeshBuffers, isolatePart, presets,
  setReferenceMode: async () => { throw new Error('External/reference assets are intentionally unsupported in this fresh-only study.'); } };
globals.__IMG2THREEJS_CAPTURE__ = api;
globals.__IMG2THREEJS_VIEWER__ = { scene, model, root: model, camera, renderer, controls, mixer, THREE, ...api };
for (const [name] of Object.entries(presets)) select('view').add(new Option(name, name));
for (const name of passes) select('pass').add(new Option(name, name));
for (const clip of model.animations) select('animation').add(new Option(clip.name, clip.name));
for (const region of regions) select('part').add(new Option(region, region));
select('view').onchange = () => { void setCamera(presets[select('view').value], false); };
select('pass').onchange = async () => { await capturePass({ passId: select('pass').value }); document.body.classList.remove('capture-clean'); };
select('animation').onchange = () => { setAnimation({ name: select('animation').value }); };
select('part').onchange = () => { isolatePart(select('part').value || null); };
const timeInput = document.querySelector<HTMLInputElement>('#hero-study-time')!;
timeInput.oninput = () => { setAnimation({ name: select('animation').value, time: Number(timeInput.value) }); };
document.querySelector<HTMLInputElement>('#hero-study-play')!.onchange = event => { playing = (event.target as HTMLInputElement).checked; };
document.querySelector<HTMLButtonElement>('#hero-study-capture')!.onclick = () => { cleanCapture(); };
window.addEventListener('keydown', event => { if (event.key === 'Escape') { document.body.classList.remove('capture-clean'); controls.enabled = true; } });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); render(); });
controls.addEventListener('change', render);
renderer.setAnimationLoop(() => {
  const now = performance.now(), delta = Math.min(.1, (now - previous) / 1000); previous = now;
  if (playing && action) { elapsed += delta; mixer.update(delta); }
  render();
});
await setCamera(presets.hero, query.get('capture') === '1');
controls.enabled = query.get('capture') !== '1';
status.textContent = `${meshes.length} meshes · ${regions.length} regions\n${model.animations.length} clips\nEscape restores controls after capture.`;
await settledFrames();
globals.__IMG2THREEJS_READY__ = true;
