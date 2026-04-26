import { Canvas } from "@react-three/fiber/native";
import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { Mesh } from "three";
import { useFrame } from "@react-three/fiber/native";

function SpinningCube() {
  const ref = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x += delta * 0.5;
      ref.current.rotation.y += delta * 0.5;
    }
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#d4a04b" />
    </mesh>
  );
}

export default function App() {
  return (
    <View style={styles.root}>
      <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 5, 2]} intensity={1.0} />
        <SpinningCube />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#7ec0ee" },
});
