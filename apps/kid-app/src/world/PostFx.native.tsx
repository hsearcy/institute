// Native (expo-gl) no-op: the postprocessing EffectComposer isn't reliable on
// expo-gl, so native renders without the bloom stack. Web uses PostFx.tsx.
export function PostFx() {
  return null;
}
