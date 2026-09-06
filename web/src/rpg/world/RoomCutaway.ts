import { Light, Material, Mesh, MeshDepthMaterial, Object3D, RGBADepthPacking, ShaderMaterial, Sprite } from 'three';

/** Camera-distance fade across a doorway, independent of frame rate. */
export function roomCutawayOpacity(room: number, cameraZ: number): number {
  const distance = -room * 20 - cameraZ;
  const t = Math.max(0, Math.min(1, (distance - 8.5) / 4));
  return 1 - t * t * (3 - 2 * t);
}

type Surface = {
  object: Mesh | Sprite;
  source: Material | Material[];
  mounted: Material | Material[];
  depth?: Material;
  mountedDepth?: MeshDepthMaterial;
  prepass?: Mesh;
  renderOrder: number;
};
type RoomBinding = {
  root: Object3D; room: number; visible: boolean;
  surfaces: Surface[];
  materials: { material: Material; opacity: number }[];
  lights: { light: Light; intensity: number }[];
  alpha: { value: number };
};

/** Candidate cutaway. Owns cloned materials, never borrowed maps or geometry.
 * Prepare after scenery/material loading and before shader warmup. Re-prepare
 * after replacing scenery; update once after the frame's torch animation.
 */
export class RoomCutaway {
  private readonly bindings: RoomBinding[] = [];
  constructor(private readonly surfaceFade: 'hash' | 'blend' | 'coverage' | 'prepass' = 'prepass') {}

  prepare(roots: readonly Object3D[]): void {
    this.clear();
    for (const root of roots) {
      if (!root.userData.occluder || !Number.isFinite(root.userData.room)) continue;
      const binding: RoomBinding = { root, room: root.userData.room, visible: root.visible,
        surfaces: [], materials: [], lights: [], alpha: { value: 1 } };
      const clones = new Map<Material, Material>();
      const clone = (source: Material): Material => {
        const previous = clones.get(source); if (previous) return previous;
        const material = source.clone();
        // Clone() does not retain custom compilation hooks. Existing surface
        // treatments must survive both this wrapper and its program cache key.
        material.onBeforeCompile = source.onBeforeCompile;
        material.customProgramCacheKey = source.customProgramCacheKey.bind(source);
        if (material instanceof ShaderMaterial && source instanceof ShaderMaterial) {
          // Keep animated flame time/uniforms connected to their source owner.
          material.uniforms = { ...source.uniforms, roomCutawayAlpha: binding.alpha };
          material.fragmentShader = 'uniform float roomCutawayAlpha;\n' + material.fragmentShader
            .replace(/}\s*$/, 'gl_FragColor.a *= roomCutawayAlpha;\n}');
        } else if (!material.transparent) {
          // Alpha hashing retains opaque depth ordering during the brief fade.
          // Enabling once at preparation avoids a shader switch at the doorway.
          if (this.surfaceFade === 'hash') material.alphaHash = true;
          else if (this.surfaceFade === 'coverage') material.alphaToCoverage = true;
          else { material.transparent = true; material.depthWrite = false; material.forceSinglePass = true; }
        }
        clones.set(source, material);
        binding.materials.push({ material, opacity: source.opacity });
        return material;
      };
      root.traverse(object => {
        if (object instanceof Light) binding.lights.push({ light: object, intensity: object.intensity });
        if (!(object instanceof Mesh || object instanceof Sprite)) return;
        const source = object.material, mounted = Array.isArray(source) ? source.map(clone) : clone(source);
        const surface: Surface = { object, source, mounted, renderOrder: object.renderOrder };
        object.material = mounted;
        if (object instanceof Mesh && object.castShadow) {
          surface.depth = object.customDepthMaterial;
          const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, alphaHash: true });
          // Packed shadow depth ignores Material.opacity in Three's stock
          // shader. Apply the room uniform before its alpha-hash discard.
          depth.onBeforeCompile = shader => {
            shader.uniforms.roomCutawayAlpha = binding.alpha;
            shader.fragmentShader = 'uniform float roomCutawayAlpha;\n' + shader.fragmentShader
              .replace('#include <alphahash_fragment>', 'diffuseColor.a *= roomCutawayAlpha;\n#include <alphahash_fragment>');
          };
          depth.customProgramCacheKey = () => 'room-cutaway-depth-v1';
          surface.mountedDepth = depth; object.customDepthMaterial = depth;
        }
        binding.surfaces.push(surface);
      });
      if (this.surfaceFade === 'prepass') {
        // Render the background normally, then the nearest cutaway surface's
        // depth, then blend only that surface. Hidden internal stone faces can
        // no longer accumulate like glass. Extra draws exist only mid-fade.
        for (const surface of binding.surfaces) {
          const materials = Array.isArray(surface.source) ? surface.source : [surface.source];
          if (!(surface.object instanceof Mesh) || materials.some(m => m.transparent || m instanceof ShaderMaterial)) continue;
          const depth = materials.map(m => new MeshDepthMaterial({ colorWrite: false, depthWrite: true, side: m.side }));
          const prepass = new Mesh(surface.object.geometry, Array.isArray(surface.source) ? depth : depth[0]);
          prepass.name = 'Room cutaway nearest surface'; prepass.renderOrder = 100; prepass.visible = false;
          prepass.layers.mask = surface.object.layers.mask;
          surface.object.add(prepass); surface.prepass = prepass;
          surface.object.material = surface.source;
        }
      }
      this.bindings.push(binding);
    }
  }

  update(cameraZ: number): void {
    for (const binding of this.bindings) {
      const alpha = roomCutawayOpacity(binding.room, cameraZ), previous = binding.alpha.value;
      binding.alpha.value = alpha;
      binding.root.visible = Math.abs(-binding.room * 20 - cameraZ) < 37 && alpha > 0;
      for (const entry of binding.materials) entry.material.opacity = entry.opacity * alpha;
      for (const surface of binding.surfaces) if (surface.mountedDepth) surface.mountedDepth.opacity = alpha;
      for (const surface of binding.surfaces) if (surface.prepass) {
        const fading = alpha > 0 && alpha < 1;
        surface.prepass.visible = fading;
        surface.object.material = fading ? surface.mounted : surface.source;
        surface.object.renderOrder = fading ? 100 : surface.renderOrder;
      }
      // Avoid repeated multiplication as a paused camera renders again. Outside
      // the transition the ordinary torch animation retains intensity control.
      for (const entry of binding.lights) {
        if (alpha < 1) entry.light.intensity = entry.intensity * alpha;
        else if (previous < 1) entry.light.intensity = entry.intensity;
      }
    }
  }

  clear(): void {
    for (const binding of this.bindings) {
      binding.root.visible = binding.visible;
      for (const { light, intensity } of binding.lights) light.intensity = intensity;
      for (const surface of binding.surfaces) {
        if (surface.object.material === surface.mounted) surface.object.material = surface.source;
        surface.object.renderOrder = surface.renderOrder;
        if (surface.prepass) {
          surface.prepass.removeFromParent();
          for (const material of Array.isArray(surface.prepass.material) ? surface.prepass.material : [surface.prepass.material]) material.dispose();
        }
        if (surface.object instanceof Mesh && surface.object.customDepthMaterial === surface.mountedDepth)
          surface.object.customDepthMaterial = surface.depth;
        surface.mountedDepth?.dispose();
      }
      for (const { material } of binding.materials) material.dispose();
    }
    this.bindings.length = 0;
  }
}
