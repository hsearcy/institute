import * as THREE from 'three';

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
function patch(shader: Shader, surface: boolean): void {
  shader.vertexShader = vertexDeclarations + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    vElectricDissolve=0.;
    vElectricWorld=(modelMatrix*vec4(transformed,1.)).xyz;
    #ifdef USE_INSTANCING
      vElectricDissolve=instanceDissolve;
      vElectricWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;
    #endif`);
  shader.fragmentShader = fragmentDeclarations + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
    if(vElectricDissolve>0.001 && electricField()<vElectricDissolve) discard;`);
  if (surface) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if(vElectricDissolve>0.001) {
        float edge=1.-smoothstep(0.,.012,electricField()-vElectricDissolve);
        edge*=smoothstep(.48,.75,electricNoise(vElectricWorld*3.5+2.1));
        totalEmissiveRadiance+=vec3(.015,.05,.08)*edge;
      }`);
}

/** Caller-owned batch copies; source GLB geometry/materials are never modified. */
export function createElectricDissolve(source: THREE.BufferGeometry, materials: THREE.Material | THREE.Material[], capacity: number) {
  const geometry = source.clone();
  const amount = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceDissolve', amount);
  const copies = (Array.isArray(materials) ? materials : [materials]).map(original => {
    const material = original.clone();
    material.onBeforeCompile = (shader, renderer) => { original.onBeforeCompile.call(material, shader, renderer); patch(shader, true); };
    material.customProgramCacheKey = () => `${original.customProgramCacheKey()}|electric-erosion-v2`;
    return material;
  });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = shader => patch(shader, false);
  depth.customProgramCacheKey = () => 'electric-erosion-depth-v2';
  return {
    geometry, material: Array.isArray(materials) ? copies : copies[0], depth, amount,
    set(index: number, progress: number) { amount.setX(index, Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0); },
    upload() { amount.needsUpdate = true; },
    dispose() { geometry.dispose(); copies.forEach(material => material.dispose()); depth.dispose(); },
  };
}
