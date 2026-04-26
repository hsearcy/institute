import { Canvas } from "@react-three/fiber/native";
import { StyleSheet, View } from "react-native";
import { HubScene } from "./src/world/HubScene";
import { cameraPosition } from "./src/world/camera";

const CAMERA_SPEC = { distance: 10, pitch: Math.PI / 4, yaw: 0 };

export default function App() {
  const pos = cameraPosition(CAMERA_SPEC);
  return (
    <View style={styles.root}>
      <Canvas camera={{ position: pos as unknown as [number, number, number], fov: 50 }}>
        <HubScene />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#7ec0ee" },
});
