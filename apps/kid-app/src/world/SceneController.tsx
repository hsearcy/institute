import { useFrame, useThree } from "@react-three/fiber/native";
import { useEffect } from "react";
import { cameraPosition, clampYaw } from "./camera";
import { useFps } from "./hooks/useFps";

type Props = {
  yaw: number;
  pitch: number;
  distance: number;
  onFps: (fps: number) => void;
};

export function SceneController({ yaw, pitch, distance, onFps }: Props) {
  const { camera } = useThree();
  const fps = useFps();

  useEffect(() => {
    const [x, y, z] = cameraPosition({ yaw: clampYaw(yaw), pitch, distance });
    camera.position.set(x, y, z);
    camera.lookAt(0, 1.2, 0); // look at hero's chest
  }, [yaw, pitch, distance, camera]);

  useFrame(({ clock }) => {
    fps.tick(clock.elapsedTime * 1000);
  });

  useEffect(() => {
    onFps(fps.value);
  }, [fps.value, onFps]);

  return null;
}
