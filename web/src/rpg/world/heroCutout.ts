import * as THREE from 'three';

/**
 * Walls and props between the camera and the hero dissolve in a soft circle,
 * as in an action RPG, so the hero is never hidden. Only the colour pass
 * changes: shadows and depth stay whole. One set of uniforms serves every
 * patched material.
 */
export const heroCutoutUniforms = {
  uCutCenter: { value: new THREE.Vector3(0, -100, 0) },
  /** Unit vector from the camera into the scene. */
  uCutView: { value: new THREE.Vector3(-17, -25, -20).normalize() },
  uCutRadius: { value: 2.6 },
};

const patched = new WeakSet<THREE.Material>();

/** Adds the cutout to a material once. Keeps any existing compile hook. */
export function applyHeroCutout(material: THREE.Material): void {
  if (patched.has(material)) return;
  patched.add(material);
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    Object.assign(shader.uniforms, heroCutoutUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;\nuniform vec3 uCutCenter;\nuniform vec3 uCutView;\nuniform float uCutRadius;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        vec3 offset = vCutWorld - uCutCenter;
        float along = dot(offset, uCutView);
        float across = length(offset - along * uCutView);
        // In front of the hero, above the floor, and inside the circle: dither out.
        float inside = (1.0 - smoothstep(uCutRadius * .72, uCutRadius, across)) * (1.0 - smoothstep(-1.6, -.4, along)) * smoothstep(.95, 1.4, vCutWorld.y);
        // An ordered 4x4 pattern reads as a clean fade, not as noise.
        ivec2 cell = ivec2(mod(gl_FragCoord.xy, 4.0));
        int index = cell.x + cell.y * 4;
        float dither = (float(index == 0 ? 0 : index == 1 ? 8 : index == 2 ? 2 : index == 3 ? 10 : index == 4 ? 12 : index == 5 ? 4 : index == 6 ? 14 : index == 7 ? 6
          : index == 8 ? 3 : index == 9 ? 11 : index == 10 ? 1 : index == 11 ? 9 : index == 12 ? 15 : index == 13 ? 7 : index == 14 ? 13 : 5) + .5) / 16.0;
        if (inside > dither) discard;
      }`);
  };
  material.customProgramCacheKey = () => `${previousKey()}|hero-cutout`;
  material.needsUpdate = true;
}

/** Patches every opaque mesh material under an object, except ground surfaces. */
export function applyHeroCutoutTo(root: THREE.Object3D, skip: readonly THREE.Material[] = []): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.depthWrite !== false && !material.transparent && !skip.includes(material)) applyHeroCutout(material);
    }
  });
}

/** Called once a frame with the hero's position and the camera's view direction. */
export function updateHeroCutout(hero: THREE.Vector3, camera: THREE.Camera): void {
  heroCutoutUniforms.uCutCenter.value.copy(hero).setY(hero.y + 1);
  camera.getWorldDirection(heroCutoutUniforms.uCutView.value);
}
