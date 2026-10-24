import * as THREE from 'three';

/** Keep a prepared program alive independently of an encounter's material. */
export function cloneErosionProgramMaterial<T extends THREE.Material>(source: T): T {
  const material = source.clone();
  // Material.copy omits both hooks, which would silently compile an ordinary
  // surface instead of the exact erosion/depth variant used by the next room.
  material.onBeforeCompile = source.onBeforeCompile;
  material.customProgramCacheKey = source.customProgramCacheKey;
  return material;
}

const vertexDeclarations = `
varying float vElectricDissolve;
varying vec3 vElectricWorld;
#ifdef USE_INSTANCING
  attribute float instanceDissolve;
#endif
`;
const fragmentDeclarations = `
  varying float vElectricDissolve;
  varying vec3 vElectricWorld;
  float electricHash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
  float electricNoise(vec3 p) {
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(electricHash(i),electricHash(i+vec3(1,0,0)),f.x),mix(electricHash(i+vec3(0,1,0)),electricHash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(electricHash(i+vec3(0,0,1)),electricHash(i+vec3(1,0,1)),f.x),mix(electricHash(i+vec3(0,1,1)),electricHash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float electricField() {
    float cloud=electricNoise(vElectricWorld*5.3)*.74+electricNoise(vElectricWorld*17.1)*.26;
    // Energy leaves the folded upper body first, ending at its grounded feet.
    // Broad irregular erosion, not a screen-space checkerboard or shrinking rig.
    return clamp(.82-max(0.,vElectricWorld.y)*.32+cloud*.13,.04,.96);
  }
`;

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0];
function patch(shader: Shader, surface: boolean, burn = false, progress?: THREE.IUniform<number>, flash?: THREE.IUniform<THREE.Color>): void {
  if (progress) shader.uniforms.uElectricDissolve = progress;
  if (flash) shader.uniforms.uHitFlash = flash;
  shader.vertexShader = (progress ? `varying float vElectricDissolve;
varying vec3 vElectricWorld;
uniform float uElectricDissolve;
` : vertexDeclarations) + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    ${progress ? `vElectricDissolve=uElectricDissolve;
    vElectricWorld=(modelMatrix*vec4(transformed,1.)).xyz;` : `
    vElectricDissolve=0.;
    vElectricWorld=(modelMatrix*vec4(transformed,1.)).xyz;
    #ifdef USE_INSTANCING
      vElectricDissolve=instanceDissolve;
      vElectricWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;
    #endif`}`);
  shader.fragmentShader = (flash ? 'uniform vec3 uHitFlash;\n' : '') + fragmentDeclarations + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
    if(vElectricDissolve>0.001 && electricField()<vElectricDissolve) discard;`);
  if (surface) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      ${flash ? 'totalEmissiveRadiance+=uHitFlash*(.18+1.6*pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),2.2));' : ''}
      if(vElectricDissolve>0.001) {
        float edge=1.-smoothstep(0.,.012,electricField()-vElectricDissolve);
        edge*=smoothstep(.48,.75,electricNoise(vElectricWorld*3.5+2.1));
        totalEmissiveRadiance+=vec3(${burn ? '.08,.026,.006' : '.015,.05,.08'})*edge;
      }`);
}

/** Per-actor copies for a SkinnedMesh. Geometry, skin attributes and maps remain shared. */
export function createSkinnedDissolve(source: THREE.BufferGeometry, materials: THREE.Material | THREE.Material[]) {
  const progress: THREE.IUniform<number> = { value: 0 };
  // A brief emissive flash where a hit lands, in the element's color.
  const flash: THREE.IUniform<THREE.Color> = { value: new THREE.Color(0, 0, 0) };
  const originals = Array.isArray(materials) ? materials : [materials];
  const copyMaterials = (burn: boolean) => originals.map(original => {
    const material = original.clone();
    material.onBeforeCompile = (shader, renderer) => {
      original.onBeforeCompile.call(material, shader, renderer);
      // project_vertex follows skinning and displacement in both stock shaders.
      patch(shader, true, burn, progress, flash);
    };
    material.customProgramCacheKey = () => `${original.customProgramCacheKey()}|skinned-${burn ? 'burn' : 'electric'}-erosion-flash-v2`;
    return material;
  });
  const copies = copyMaterials(false);
  let burnCopies: THREE.Material[] | undefined;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = shader => patch(shader, false, false, progress);
  depth.customProgramCacheKey = () => 'skinned-electric-erosion-depth-v1';
  return {
    geometry: source, material: Array.isArray(materials) ? copies : copies[0], depth,
    materialFor(style: 'electric' | 'burn') {
      const selected = style === 'burn' ? (burnCopies ??= copyMaterials(true)) : copies;
      return Array.isArray(materials) ? selected : selected[0];
    },
    set(value: number) { progress.value = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0; },
    flash(color: THREE.Color, amount: number) { flash.value.copy(color).multiplyScalar(Math.max(0, amount)); },
    dispose() { copies.forEach(material => material.dispose()); burnCopies?.forEach(material => material.dispose()); depth.dispose(); },
  };
}

/** Caller-owned batch copies; source GLB geometry/materials are never modified. */
export function createElectricDissolve(source: THREE.BufferGeometry, materials: THREE.Material | THREE.Material[], capacity: number) {
  const geometry = source.clone();
  const amount = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceDissolve', amount);
  const originals = Array.isArray(materials) ? materials : [materials];
  const copyMaterials = (burn: boolean) => originals.map(original => {
    const material = original.clone();
    material.onBeforeCompile = (shader, renderer) => { original.onBeforeCompile.call(material, shader, renderer); patch(shader, true, burn); };
    material.customProgramCacheKey = () => `${original.customProgramCacheKey()}|${burn ? 'burn-erosion-v1' : 'electric-erosion-v2'}`;
    return material;
  });
  const copies = copyMaterials(false);
  let burnCopies: THREE.Material[] | undefined;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = shader => patch(shader, false);
  depth.customProgramCacheKey = () => 'electric-erosion-depth-v2';
  return {
    geometry, material: Array.isArray(materials) ? copies : copies[0], depth, amount,
    // Both responses share per-instance erosion and its exact shadow discard.
    // Only the restrained residual edge changes; cached asset maps stay intact.
    materialFor(style: 'electric' | 'burn') {
      const selected = style === 'burn' ? (burnCopies ??= copyMaterials(true)) : copies;
      return Array.isArray(materials) ? selected : selected[0];
    },
    set(index: number, progress: number) { amount.setX(index, Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0); },
    upload() { amount.needsUpdate = true; },
    dispose() { geometry.dispose(); copies.forEach(material => material.dispose()); burnCopies?.forEach(material => material.dispose()); depth.dispose(); },
  };
}
