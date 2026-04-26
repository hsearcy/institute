import { Canvas } from "@react-three/fiber/native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { HubScene } from "./src/world/HubScene";
import { cameraPosition } from "./src/world/camera";
import { Toast } from "./src/ui/Toast";
import type { PortalId } from "./src/config";

const CAMERA_SPEC = { distance: 10, pitch: Math.PI / 4, yaw: 0 };

const PORTAL_LABELS: Record<PortalId, string> = {
  "spell-cast": "Spell Cast",
  "block-tower": "Block Tower",
  "cookie-share": "Cookie Share",
  "door-code": "Door Code",
};

export default function App() {
  const pos = cameraPosition(CAMERA_SPEC);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <View style={styles.root}>
      <Canvas camera={{ position: pos as unknown as [number, number, number], fov: 50 }}>
        <HubScene
          onPortalTap={(id) => setToast(`Coming soon — ${PORTAL_LABELS[id]}!`)}
        />
      </Canvas>
      {toast !== null && <Toast message={toast} onHide={() => setToast(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#7ec0ee" },
});
