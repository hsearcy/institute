import { Canvas } from "@react-three/fiber/native";
import { Suspense, useRef, useState } from "react";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  type PanGestureHandlerGestureEvent,
} from "react-native-gesture-handler";
import { StyleSheet, View } from "react-native";
import type { SpellCastSceneHandle } from "@institute/minigame-spell-cast";
import { applyOutcome, scheduleNextReview, getSkill, TAXONOMY, initialSkillState, type AttemptOutcome } from "@institute/skill-engine";
import { HubScene } from "./src/world/HubScene";
import { SceneController } from "./src/world/SceneController";
import { Toast } from "./src/ui/Toast";
import { LoadingScreen } from "./src/ui/LoadingScreen";
import { FpsOverlay } from "./src/ui/FpsOverlay";
import { SHOW_FPS, type PortalId, PROFILE } from "./src/config";
import { openExpoDb, migrate } from "./src/persistence/db";
import { loadSkillState, saveSkillState } from "./src/persistence/skillStateRepo";
import { appendAttempt } from "./src/persistence/attemptRepo";
import { MiniGameMount } from "./src/minigame/MiniGameMount";
import { NumberPad } from "./src/minigame/NumberPad";
import { BackButton } from "./src/minigame/BackButton";

const PORTAL_LABELS: Record<PortalId, string> = {
  "spell-cast": "Spell Cast",
  "block-tower": "Block Tower",
  "cookie-share": "Cookie Share",
  "door-code": "Door Code",
};

type Mode = { kind: "hub" } | { kind: "minigame"; portalId: PortalId; runId: string };

export default function App() {
  const [mode, setMode] = useState<Mode>({ kind: "hub" });
  const [yaw, setYaw] = useState(0);
  const [fps, setFps] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const sceneHandleRef = useRef<SpellCastSceneHandle | null>(null);

  const onPan = (e: PanGestureHandlerGestureEvent) => {
    if (mode.kind !== "hub") return; // disable orbit during a round
    setYaw((prev) => prev + e.nativeEvent.translationX * 0.0001);
  };

  const onPortalTap = (id: PortalId) => {
    if (id === "spell-cast") {
      setMode({ kind: "minigame", portalId: id, runId: `${Date.now()}` });
    } else {
      setToast(`Coming soon — ${PORTAL_LABELS[id]}!`);
    }
  };

  const onRoundComplete = async (result: { status: "completed" | "aborted"; outcomes: AttemptOutcome[]; durationMs: number }) => {
    console.log("[round complete]", result);
    sceneHandleRef.current = null;
    setMode({ kind: "hub" });
    try {
      const db = await openExpoDb();
      migrate(db);
      for (const outcome of result.outcomes) {
        const skill = getSkill(TAXONOMY, outcome.skillId);
        if (!skill) { console.warn("unknown skill in outcome:", outcome.skillId); continue; }
        const prev = loadSkillState(db, PROFILE.id, outcome.skillId) ?? initialSkillState(PROFILE.id, outcome.skillId);
        const next = applyOutcome(prev, outcome, skill.difficultyBand);
        const update = scheduleNextReview(next, outcome, new Date());
        const merged = { ...next, ...update, updatedAt: new Date() };
        saveSkillState(db, merged);
        appendAttempt(db, PROFILE.id, outcome);
      }
    } catch (e) {
      console.error("failed to persist outcomes", e);
    }
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <PanGestureHandler onGestureEvent={onPan}>
        <View style={styles.root}>
          <Suspense fallback={<LoadingScreen />}>
            <Canvas style={styles.canvas}>
              {mode.kind === "hub" ? (
                <>
                  <HubScene onPortalTap={onPortalTap} />
                  <SceneController yaw={yaw} pitch={Math.PI / 4} distance={10} onFps={setFps} />
                </>
              ) : (
                <MiniGameMount
                  key={mode.runId}
                  portalId={mode.portalId}
                  onComplete={onRoundComplete}
                  handleRef={sceneHandleRef}
                />
              )}
            </Canvas>
          </Suspense>
          {/* Hub-only overlays */}
          {mode.kind === "hub" && toast !== null && <Toast message={toast} onHide={() => setToast(null)} />}
          {mode.kind === "hub" && SHOW_FPS && <FpsOverlay fps={fps} />}
          {/* Mini-game overlays */}
          {mode.kind === "minigame" && (
            <>
              <BackButton onPress={() => sceneHandleRef.current?.abort()} />
              <NumberPad onPress={(n) => sceneHandleRef.current?.submitAnswer(n)} />
            </>
          )}
        </View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#7ec0ee" },
  canvas: { flex: 1 },
});
