import { Canvas } from "@react-three/fiber/native";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  type PanGestureHandlerGestureEvent,
} from "react-native-gesture-handler";
import { StyleSheet, View } from "react-native";
import type { SpellCastSceneHandle } from "@institute/minigame-spell-cast";
import { applyOutcome, scheduleNextReview, getSkill, TAXONOMY, initialSkillState, type AttemptOutcome } from "@institute/skill-engine";
import { HubScene, type HubCosmetics } from "./src/world/HubScene";
import { SceneController } from "./src/world/SceneController";
import { CosmeticsProvider } from "@institute/minigame-kit";
import { PostFx } from "./src/world/PostFx";
import {
  todayYmd, generateQuest, applyRound, purchase, GEMS_MASTERY_MILESTONE,
  CATALOG, cosmeticById,
  type ProfileProgress, type DailyQuest, type EquippedMap,
} from "@institute/progression";
import {
  loadProgress, saveProgress, loadQuest, saveQuest,
  loadInventory, addInventory, loadEquipped, saveEquipped,
} from "./src/persistence/progressRepo";
import { Hud } from "./src/ui/Hud";
import { QuestPanel } from "./src/ui/QuestPanel";
import { Shop } from "./src/ui/Shop";
import { FeedbackOverlay, type FeedbackEvent, type FeedbackKind } from "./src/ui/FeedbackOverlay";
import { initSfx, playSfx } from "./src/audio/sfx";
import { Toast } from "./src/ui/Toast";
import { LoadingScreen } from "./src/ui/LoadingScreen";
import { FpsOverlay } from "./src/ui/FpsOverlay";
import { SHOW_FPS, type PortalId, PROFILE } from "./src/config";
import { getDb } from "./src/persistence/db";
import { loadSkillState, saveSkillState } from "./src/persistence/skillStateRepo";
import { appendAttempt } from "./src/persistence/attemptRepo";
import { MiniGameMount, type VoiceUiState } from "./src/minigame/MiniGameMount";
import { NumberPad } from "./src/minigame/NumberPad";
import { BackButton } from "./src/minigame/BackButton";
import { MicIcon } from "./src/minigame/MicIcon";
import { Confirmation } from "./src/minigame/Confirmation";
import { Pressable, StyleSheet as RNStyleSheet } from "react-native";

const PORTAL_LABELS: Record<PortalId, string> = {
  "spell-cast": "Spell Cast",
  "block-tower": "Block Tower",
  "cookie-share": "Cookie Share",
  "door-code": "Door Code",
};

type Mode = { kind: "hub" } | { kind: "minigame"; portalId: PortalId; runId: string };

// Web-only dev affordance: deep-link straight into a minigame with
// `?game=block-tower` etc., so a game can be iterated on without clicking
// through the hub each reload. No-op on native.
function initialMode(): Mode {
  if (typeof window !== "undefined" && window.location?.search) {
    const g = new URLSearchParams(window.location.search).get("game");
    const valid: PortalId[] = ["spell-cast", "block-tower", "cookie-share", "door-code"];
    if (g && (valid as string[]).includes(g)) {
      return { kind: "minigame", portalId: g as PortalId, runId: `${Date.now()}` };
    }
  }
  return { kind: "hub" };
}

/** Map equipped cosmetic ids → the plain colors/ids the 3D hub renders. */
function resolveCosmetics(equipped: EquippedMap): HubCosmetics {
  const hero = equipped.heroOutfit ? cosmeticById(equipped.heroOutfit) : undefined;
  const hat = equipped.tutorHat ? cosmeticById(equipped.tutorHat) : undefined;
  const pet = equipped.pet ? cosmeticById(equipped.pet) : undefined;
  return {
    heroColor: hero?.swatch,
    hatId: hat?.id,
    hatSwatch: hat?.swatch,
    petId: pet?.id,
    petSwatch: pet?.swatch,
  };
}

export default function App() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [yaw, setYaw] = useState(0);
  const [fps, setFps] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const sceneHandleRef = useRef<SpellCastSceneHandle | null>(null);
  const [voiceUi, setVoiceUi] = useState<VoiceUiState>({ kind: "off" });
  const stopRecorderRef = useRef<(() => void) | null>(null);
  const confirmPickRef = useRef<((n: number) => void) | null>(null);
  const confirmNeitherRef = useRef<(() => void) | null>(null);
  // Set true once R3F's GL renderer is created; the progression load waits on it
  // so its state-setting re-render can't wedge the hub's loop mid-initialization.
  const glReadyRef = useRef(false);

  // Meta-progression (M6): gems, streak, daily quest, cosmetics.
  const [progress, setProgress] = useState<ProfileProgress | null>(null);
  const [quest, setQuest] = useState<DailyQuest | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [equipped, setEquipped] = useState<EquippedMap>({});
  const [shopOpen, setShopOpen] = useState(false);

  // Global juice/audio feedback. Every answer (pad + voice) and reward funnels a
  // single event here; the FeedbackOverlay flashes + bursts, and we play a SFX.
  const [feedback, setFeedback] = useState<FeedbackEvent>(null);
  const fbId = useRef(0);
  const fireFeedback = useCallback((kind: FeedbackKind) => {
    setFeedback({ id: ++fbId.current, kind });
  }, []);

  // Preload SFX players once.
  useEffect(() => { initSfx(); }, []);

  // Load progression on mount; generate today's quest if it doesn't exist yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Wait until the GL renderer exists (+ a margin of frames) before doing
        // any state-setting: a parent re-render mid-init wedges the hub loop.
        while (!glReadyRef.current && !cancelled) await new Promise((r) => setTimeout(r, 50));
        await new Promise((r) => setTimeout(r, 150));
        if (cancelled) return;
        const db = await getDb();
        const today = todayYmd(new Date());
        const p = loadProgress(db, PROFILE.id);
        saveProgress(db, p); // persist the fresh row on first run
        let q = loadQuest(db, PROFILE.id, today);
        if (!q) { q = generateQuest(PROFILE.id, today); saveQuest(db, q); }
        setProgress(p);
        setQuest(q);
        setOwned(loadInventory(db, PROFILE.id));
        setEquipped(loadEquipped(db, PROFILE.id));
      } catch (e) {
        console.error("failed to load progression", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onPan = (e: PanGestureHandlerGestureEvent) => {
    if (mode.kind !== "hub") return; // disable orbit during a round
    setYaw((prev) => prev + e.nativeEvent.translationX * 0.0001);
  };

  // All four minigames are implemented (M6). IMPLEMENTED keeps the "coming
  // soon" path alive for any future, not-yet-built portal.
  const IMPLEMENTED: PortalId[] = ["spell-cast", "block-tower", "cookie-share", "door-code"];
  const onPortalTap = useCallback((id: PortalId) => {
    if (IMPLEMENTED.includes(id)) {
      playSfx("whoosh");
      setMode({ kind: "minigame", portalId: id, runId: `${Date.now()}` });
    } else {
      setToast(`Coming soon — ${PORTAL_LABELS[id]}!`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drives global audio + juice for every answer (number-pad or voice), wired
  // through MiniGameMount's wrapped scene handle.
  const onAnswer = useCallback((r: { correct: boolean; expected: number; isLastStep: boolean }) => {
    if (r.correct) {
      if (r.isLastStep) { playSfx("win"); fireFeedback("win"); }
      else { playSfx("correct"); fireFeedback("correct"); }
    } else {
      playSfx("wrong"); fireFeedback("wrong");
    }
  }, [fireFeedback]);

  // useCallback with empty deps — onRoundComplete must be stable so
  // MiniGameMount's round-fetch effect doesn't re-fire on every parent
  // re-render (e.g. on every voiceUi state change).
  const onRoundComplete = useCallback(async (result: { status: "completed" | "aborted"; outcomes: AttemptOutcome[]; durationMs: number }) => {
    console.log("[round complete]", result);
    sceneHandleRef.current = null;
    setMode({ kind: "hub" });
    try {
      const db = await getDb();
      let correctCount = 0;
      let masteryGems = 0;
      for (const outcome of result.outcomes) {
        if (outcome.correct) correctCount++;
        const skill = getSkill(TAXONOMY, outcome.skillId);
        if (!skill) { console.warn("unknown skill in outcome:", outcome.skillId); continue; }
        const prev = loadSkillState(db, PROFILE.id, outcome.skillId) ?? initialSkillState(PROFILE.id, outcome.skillId);
        const next = applyOutcome(prev, outcome, skill.difficultyBand);
        if (prev.state !== "mastered" && next.state === "mastered") masteryGems += GEMS_MASTERY_MILESTONE;
        const update = scheduleNextReview(next, outcome, new Date());
        const merged = { ...next, ...update, updatedAt: new Date() };
        saveSkillState(db, merged);
        appendAttempt(db, PROFILE.id, outcome);
      }

      // Apply gems / quest / streak (read fresh from db so this stays a stable callback).
      const today = todayYmd(new Date());
      const p = loadProgress(db, PROFILE.id);
      const q = loadQuest(db, PROFILE.id, today) ?? generateQuest(PROFILE.id, today);
      const res = applyRound(p, q, correctCount, today);
      const newProgress = masteryGems > 0
        ? { ...res.progress, gems: res.progress.gems + masteryGems }
        : res.progress;
      saveProgress(db, newProgress);
      saveQuest(db, res.quest);
      setProgress(newProgress);
      setQuest(res.quest);
      const totalGems = res.gemsAwarded + masteryGems;
      if (totalGems > 0) {
        playSfx("collect");
        fireFeedback(res.questJustCompleted ? "win" : "collect");
        setToast(`+${totalGems} 💎${res.questJustCompleted ? "   Quest complete! 🎉" : ""}`);
      }
    } catch (e) {
      console.error("failed to persist outcomes", e);
    }
  }, []);

  // Stable reference so the R3F hub scene doesn't reconcile/thrash every frame.
  const cosmetics = useMemo(() => resolveCosmetics(equipped), [equipped]);

  const onBuy = useCallback(async (id: string) => {
    try {
      const db = await getDb();
      const p = loadProgress(db, PROFILE.id);
      const res = purchase(p, loadInventory(db, PROFILE.id), id);
      if (!res) return; // unaffordable / already owned / unknown
      saveProgress(db, res.progress);
      addInventory(db, PROFILE.id, id);
      setProgress(res.progress);
      setOwned(res.owned);
    } catch (e) { console.error("buy failed", e); }
  }, []);

  const onEquip = useCallback(async (id: string) => {
    const item = cosmeticById(id);
    if (!item) return;
    try {
      const db = await getDb();
      saveEquipped(db, PROFILE.id, item.slot, id);
      setEquipped((prev) => ({ ...prev, [item.slot]: id }));
    } catch (e) { console.error("equip failed", e); }
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <PanGestureHandler onGestureEvent={onPan}>
        <View style={styles.root}>
          <Suspense fallback={<LoadingScreen />}>
            <Canvas
              style={styles.canvas}
              gl={{ antialias: true }}
              onCreated={({ gl }) => {
                gl.toneMapping = ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.1;
                gl.outputColorSpace = SRGBColorSpace;
                // Web-only: expose the renderer for QA/profiling (draw calls, tris).
                if (typeof window !== "undefined") (window as unknown as { __gl?: unknown }).__gl = gl;
                glReadyRef.current = true;
              }}
            >
              {/* Provider lives INSIDE the Canvas so the cosmetic crosses R3F's
                  separate reconciler into the minigame HeroAvatar. */}
              <CosmeticsProvider value={{ heroOutfitColor: cosmetics.heroColor }}>
                {mode.kind === "hub" ? (
                  <>
                    <HubScene onPortalTap={onPortalTap} cosmetics={cosmetics} />
                    <SceneController yaw={yaw} pitch={0.58} distance={13} onFps={setFps} />
                  </>
                ) : (
                  <MiniGameMount
                    key={mode.runId}
                    portalId={mode.portalId}
                    onComplete={onRoundComplete}
                    handleRef={sceneHandleRef}
                    onVoiceUiChange={setVoiceUi}
                    stopRecorderRef={stopRecorderRef}
                    confirmPickRef={confirmPickRef}
                    confirmNeitherRef={confirmNeitherRef}
                    onAnswer={onAnswer}
                  />
                )}
              </CosmeticsProvider>
              {/* Bloom/color/vignette — web only (no-op on native). */}
              <PostFx />
            </Canvas>
          </Suspense>
          {/* Hub-only overlays */}
          {mode.kind === "hub" && progress && (
            <Hud gems={progress.gems} streak={progress.streak} onOpenShop={() => setShopOpen(true)} />
          )}
          {mode.kind === "hub" && quest && (
            <QuestPanel quest={quest} onPlay={() => onPortalTap("spell-cast")} />
          )}
          {mode.kind === "hub" && shopOpen && progress && (
            <Shop
              gems={progress.gems}
              catalog={CATALOG}
              owned={owned}
              equipped={equipped}
              onBuy={onBuy}
              onEquip={onEquip}
              onClose={() => setShopOpen(false)}
            />
          )}
          {mode.kind === "hub" && toast !== null && <Toast message={toast} onHide={() => setToast(null)} />}
          {mode.kind === "hub" && SHOW_FPS && <FpsOverlay fps={fps} />}
          {/* Mini-game overlays */}
          {mode.kind === "minigame" && (
            <>
              <BackButton onPress={() => sceneHandleRef.current?.abort()} />
              <NumberPad onPress={(n) => sceneHandleRef.current?.submitAnswer(n)} />
              {voiceUi.kind === "listening" && (
                <Pressable
                  style={voiceStyles.micHit}
                  onPress={() => stopRecorderRef.current?.()}
                >
                  <MicIcon active />
                </Pressable>
              )}
              {voiceUi.kind === "confirm" && (
                <Confirmation
                  candidates={voiceUi.candidates}
                  onPick={(n) => confirmPickRef.current?.(n)}
                  onNeither={() => confirmNeitherRef.current?.()}
                />
              )}
            </>
          )}
          {/* Global juice layer — sits above everything, never blocks input. */}
          <FeedbackOverlay event={feedback} />
        </View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#7ec0ee" },
  canvas: { flex: 1 },
});

const voiceStyles = RNStyleSheet.create({
  micHit: {
    position: "absolute",
    bottom: 60, alignSelf: "center",
    width: 100, height: 100,
    alignItems: "center", justifyContent: "center",
  },
});
