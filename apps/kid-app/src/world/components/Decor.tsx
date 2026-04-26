import { useGLTF } from "@react-three/drei/native";
import type { Object3D } from "three";

// Metro returns a numeric asset id from `require("./foo.glb")`. drei/native's
// useGLTF accepts that at runtime, but its TS signature is typed for the web
// (string paths only) and returns a union type. We cast through unknown for
// both input and output to avoid lying about runtime behavior elsewhere.
type GLTFLike = { scene: Object3D };
const loadGLTF = (src: number): GLTFLike =>
  useGLTF(src as unknown as string) as unknown as GLTFLike;

const TREE_MODELS = [
  require("../../../assets/nature/tree_default.glb"),
  require("../../../assets/nature/tree_oak.glb"),
  require("../../../assets/nature/tree_pineDefaultA.glb"),
];
const ROCK_MODELS = [
  require("../../../assets/nature/rock_largeA.glb"),
  require("../../../assets/nature/rock_smallA.glb"),
];

const TREE_PLACEMENTS = [
  { pos: [-8, 0, -10] as const, model: 0, rotY: 0.2 },
  { pos: [-6, 0, 8]   as const, model: 1, rotY: 1.1 },
  { pos: [10, 0, -8]  as const, model: 2, rotY: 2.7 },
  { pos: [12, 0, 6]   as const, model: 0, rotY: 0.5 },
  { pos: [-12, 0, 2]  as const, model: 2, rotY: 4.1 },
  { pos: [9, 0, 11]   as const, model: 1, rotY: 5.2 },
];
const ROCK_PLACEMENTS = [
  { pos: [-4, 0, 9]  as const, model: 0, rotY: 0.4 },
  { pos: [7, 0, 4]   as const, model: 1, rotY: 1.5 },
  { pos: [-9, 0, -4] as const, model: 1, rotY: 2.3 },
];

function ModelInstance({
  src, position, rotationY,
}: { src: number; position: readonly [number, number, number]; rotationY: number }) {
  const { scene } = loadGLTF(src);
  const cloned = scene.clone(true);
  return <primitive object={cloned} position={position} rotation={[0, rotationY, 0]} />;
}

export function Decor() {
  return (
    <>
      {TREE_PLACEMENTS.map((t, i) => (
        <ModelInstance key={`t${i}`} src={TREE_MODELS[t.model]!} position={t.pos} rotationY={t.rotY} />
      ))}
      {ROCK_PLACEMENTS.map((r, i) => (
        <ModelInstance key={`r${i}`} src={ROCK_MODELS[r.model]!} position={r.pos} rotationY={r.rotY} />
      ))}
    </>
  );
}

// Same TS-vs-runtime mismatch on preload — Metro asset id, not a string path.
TREE_MODELS.forEach((m) => useGLTF.preload(m as unknown as string));
ROCK_MODELS.forEach((m) => useGLTF.preload(m as unknown as string));
