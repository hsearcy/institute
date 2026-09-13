import { AnimationMixer, LoopOnce, SkinnedMesh, type AnimationClip, Box3, Color, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HeroWalkCycle } from './heroLocomotion';
import type { RpgAppearanceId } from '@institute/shared';

/** One freshly generated mesh/rig serves every saved cosmetic milestone. */
export const TRIPO_HERO_MODEL = 'tripo-hero-game';

export class HeroAssetLoadError extends Error {
  constructor(cause: unknown) { super('The new hero could not load. Please retry.', { cause }); this.name = 'HeroAssetLoadError'; }
}

export function createTripoHeroInstance(source: Object3D, height: number): Group {
  const model = cloneSkeleton(source);
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
  if (bounds.isEmpty() || !Number.isFinite(size.y) || size.y <= 0) throw new Error('The Tripo hero has invalid bounds.');
  // Separate placement from the animated source root so root tracks cannot
  // undo grounding or the uniform game scale.
  const placement = new Group();
  placement.position.set(-center.x, -bounds.min.y, -center.z);
  placement.add(model);
  const instance = new Group();
  instance.name = 'TripoHero'; instance.scale.setScalar(height / size.y); instance.add(placement);
  model.traverse(node => {
    if (!(node instanceof Mesh)) return;
    node.material = Array.isArray(node.material) ? node.material.map(material => material.clone()) : node.material.clone();
    node.userData.tripoInstanceMaterial = true;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.userData.tripoBaseColor = material.color.toArray();
      material.userData.tripoBaseEmissive = material.emissive.toArray();
      material.userData.tripoBaseEmissiveIntensity = material.emissiveIntensity;
    }
  });
  return instance;
}

/** Gentle elemental material accents preserve the generated atlas and likeness. */
export function tintTripoHero(root: Object3D, appearance: RpgAppearanceId): void {
  const palette = {
    wayfarer: { tint: 0xffffff, glow: 0x000000 },
    cinder: { tint: 0xffedda, glow: 0x2b0c00 },
    glacier: { tint: 0xdbf8ff, glow: 0x001d28 },
    tempest: { tint: 0xebe4ff, glow: 0x140d2d },
  }[appearance];
  root.traverse(node => {
    if (!(node instanceof Mesh) || !node.userData.tripoInstanceMaterial) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof MeshStandardMaterial) || !material.userData.tripoBaseColor) continue;
      material.color.fromArray(material.userData.tripoBaseColor).multiply(new Color(palette.tint));
      material.emissive.fromArray(material.userData.tripoBaseEmissive);
      material.emissiveIntensity = material.userData.tripoBaseEmissiveIntensity;
      if (appearance !== 'wayfarer') {
        material.emissive.add(new Color(palette.glow));
        material.emissiveIntensity = Math.max(material.emissiveIntensity, .3);
      }
    }
  });
}

/** Measure only the new walk clip, in normalized game units. An in-place
 * gait moves each foot fore/aft through half a stride relative to the hips. */
export function measureTripoWalkCycle(instance: Object3D, clip?: AnimationClip): HeroWalkCycle | undefined {
  if (!clip || clip.duration <= 0) return undefined;
  const copy = cloneSkeleton(instance);
  const feet: Object3D[] = [];
  let hips: Object3D | undefined;
  copy.traverse(node => {
    const name = node.name.toLowerCase().replace(/[^a-z]/g, '');
    if (/leftfoot$|rightfoot$|^lfoot$|^rfoot$/.test(name)) feet.push(node);
    // Tripo native has both Hip and Pelvis; Hip owns the gait reference.
    if (name === 'hip') hips = node;
    else if (!hips && /hips$/.test(name)) hips = node;
  });
  if (!feet.length || !hips) return undefined;
  const mixer = new AnimationMixer(copy);
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
  action.clampWhenFinished = true; action.play();
  const ranges = feet.map(() => ({ min: Infinity, max: -Infinity }));
  const hip = new Vector3(), point = new Vector3();
  for (let sample = 0; sample <= 60; sample++) {
    mixer.setTime(clip.duration * sample / 60); copy.updateMatrixWorld(true);
    hips.getWorldPosition(hip);
    feet.forEach((foot, i) => {
      foot.getWorldPosition(point);
      const forward = point.z - hip.z;
      ranges[i]!.min = Math.min(ranges[i]!.min, forward);
      ranges[i]!.max = Math.max(ranges[i]!.max, forward);
    });
  }
  mixer.stopAllAction(); mixer.uncacheRoot(copy);
  const skeletons = new Set<SkinnedMesh['skeleton']>();
  copy.traverse(node => { if (node instanceof SkinnedMesh) skeletons.add(node.skeleton); });
  skeletons.forEach(skeleton => skeleton.dispose());
  const strideDistance = Math.max(...ranges.map(range => (range.max - range.min) * 2));
  return Number.isFinite(strideDistance) && strideDistance > .05
    ? { strideDistance, duration: clip.duration } : undefined;
}
