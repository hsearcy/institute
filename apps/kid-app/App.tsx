import { Canvas } from "@react-three/fiber/native";
import { Suspense, useState } from "react";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  type PanGestureHandlerGestureEvent,
} from "react-native-gesture-handler";
import { StyleSheet, View } from "react-native";
import { HubScene } from "./src/world/HubScene";
import { SceneController } from "./src/world/SceneController";
import { Toast } from "./src/ui/Toast";
import { LoadingScreen } from "./src/ui/LoadingScreen";
import { FpsOverlay } from "./src/ui/FpsOverlay";
import { SHOW_FPS, type PortalId } from "./src/config";

const PORTAL_LABELS: Record<PortalId, string> = {
  "spell-cast": "Spell Cast",
  "block-tower": "Block Tower",
  "cookie-share": "Cookie Share",
  "door-code": "Door Code",
};

export default function App() {
  const [yaw, setYaw] = useState(0);
  const [fps, setFps] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const onPan = (e: PanGestureHandlerGestureEvent) => {
    setYaw((prev) => prev + e.nativeEvent.translationX * 0.0001);
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <PanGestureHandler onGestureEvent={onPan}>
        <View style={styles.root}>
          <Suspense fallback={<LoadingScreen />}>
            <Canvas style={styles.canvas}>
              <HubScene onPortalTap={(id) => setToast(`Coming soon — ${PORTAL_LABELS[id]}!`)} />
              <SceneController yaw={yaw} pitch={Math.PI / 4} distance={10} onFps={setFps} />
            </Canvas>
          </Suspense>
          {toast !== null && <Toast message={toast} onHide={() => setToast(null)} />}
          {SHOW_FPS && <FpsOverlay fps={fps} />}
        </View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#7ec0ee" },
  canvas: { flex: 1 },
});
