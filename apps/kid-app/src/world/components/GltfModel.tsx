// apps/kid-app/src/world/components/GltfModel.tsx
// Loads a generated GLB asset and normalizes it: scaled to a target height,
// centered horizontally, and resting its feet on y=0. Works on web and native
// (drei/native's useGLTF resolves a Metro-required .glb asset via expo-asset).
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei/native";
import { Asset } from "expo-asset";
import { Box3, Vector3, type Object3D } from "three";

type Props = {
  /** A Metro-required .glb asset, e.g. require("../../../assets/models/hero/model.glb"). */
  src: number | string;
  /** Desired world-space height (the model is uniformly scaled to match). */
  height?: number;
  /** Extra Y offset (e.g. for floating characters). */
  lift?: number;
  rotation?: [number, number, number];
  position?: [number, number, number];
};

export function GltfModel({ src, height = 2, lift = 0, rotation, position }: Props) {
  // Resolve a Metro-required asset to a served URL/URI on both web and native
  // (same pattern as the sql.js wasm asset), then load it.
  const uri = useMemo(
    () => (typeof src === "number" ? Asset.fromModule(src).uri : src),
    [src],
  );
  const gltf = useGLTF(uri);

  const { object, scale, offset } = useMemo(() => {
    const obj = (gltf.scene as Object3D).clone(true);
    const box = new Box3().setFromObject(obj);
    const size = new Vector3();
    box.getSize(size);
    const center = new Vector3();
    box.getCenter(center);
    const s = size.y > 0.0001 ? height / size.y : 1;
    // center X/Z, drop feet (box.min.y) to the ground
    return {
      object: obj,
      scale: s,
      offset: [-center.x * s, -box.min.y * s + lift, -center.z * s] as [number, number, number],
    };
  }, [gltf.scene, height, lift]);

  return (
    <group position={position} rotation={rotation}>
      <group position={offset} scale={scale}>
        <primitive object={object} />
      </group>
    </group>
  );
}
