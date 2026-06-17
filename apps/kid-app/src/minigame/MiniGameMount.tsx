import { useEffect, useRef, useState } from "react";
import { plugin as spellCastPlugin } from "@institute/minigame-spell-cast";
import { plugin as blockTowerPlugin } from "@institute/minigame-block-tower";
import { plugin as cookieSharePlugin } from "@institute/minigame-cookie-share";
import { plugin as doorCodePlugin } from "@institute/minigame-door-code";
import { register, getPlugin, validateParams, type RoundResult } from "@institute/plugin-engine";
import { Scene as SpellCastScene, type SpellCastSceneHandle } from "@institute/minigame-spell-cast";
import { FIXTURES } from "./fixtures";
import { PROFILE, TUTOR_BASE_URL, TUTOR_SECRET } from "../config";
import type { PortalId } from "../config";
import { getDb } from "../persistence/db";
import { computeEligiblePool } from "../tutor/eligiblePool";
import { loadRecentAttempts } from "../persistence/attemptRepo";
import { getAvailablePlugins } from "../tutor/pluginSchemas";
import { requestNextRound, type TutorResponse } from "../tutor/client";
import { ensureMicPermission } from "../voice/permission";
import { startRecorder, type RecorderHandle, type RecordingResult } from "../voice/recorder";
import { speak } from "../voice/ttsClient";
import { uploadAndTranscribe, type SttResult } from "../voice/sttHttp";

let registered = false;
function ensureRegistered() {
  if (registered) return;
  const safe = (fn: () => void) => {
    try { fn(); }
    catch (e) { if (!(e instanceof Error) || !/already registered/i.test(e.message)) throw e; }
  };
  safe(() => register(spellCastPlugin));
  safe(() => register(blockTowerPlugin));
  safe(() => register(cookieSharePlugin));
  safe(() => register(doorCodePlugin));
  registered = true;
}

/** Fallback skill per portal when the tutor backend is unavailable (must exist in TAXONOMY). */
const FALLBACK_SKILL: Record<PortalId, string> = {
  "spell-cast": "skip_count_2",
  "block-tower": "add_within_10",
  "cookie-share": "equal_sharing",
  "door-code": "sub_within_10",
};

/**
 * Voice-flow UI state surfaced to App.tsx so that the overlay components
 * (mic icon, confirmation modal) can render OUTSIDE the R3F Canvas. (R3F
 * panics if RN <View> components mount as scene-graph children.)
 */
export type VoiceUiState =
  | { kind: "off" }
  | { kind: "speaking" }
  | { kind: "listening" }
  | { kind: "uploading" }
  | { kind: "confirm"; candidates: [number, number] };

type Props = {
  portalId: PortalId;
  onComplete: (r: RoundResult) => void;
  handleRef: React.MutableRefObject<SpellCastSceneHandle | null>;
  /** Mounted overlay reads this and renders UI accordingly. */
  onVoiceUiChange: (s: VoiceUiState) => void;
  /** Stop-recording-early hook the App's mic-tap calls. */
  stopRecorderRef: React.MutableRefObject<(() => void) | null>;
  /** Wired to the Confirmation modal's "pick" buttons. */
  confirmPickRef: React.MutableRefObject<((n: number) => void) | null>;
  /** Wired to the Confirmation modal's "neither" link. */
  confirmNeitherRef: React.MutableRefObject<(() => void) | null>;
  /** Fires on every answer (number-pad OR voice) with the evaluation result,
   *  so the App can drive global audio + juice feedback in one place. */
  onAnswer?: (r: { correct: boolean; expected: number; isLastStep: boolean }) => void;
  /** Fires once the round's params are loaded, so the App can show the on-screen
   *  task prompt (the game must be playable without the spoken intro). */
  onRoundReady?: (portalId: PortalId, params: unknown) => void;
};

export function MiniGameMount({
  portalId, onComplete, handleRef,
  onVoiceUiChange, stopRecorderRef, confirmPickRef, confirmNeitherRef, onAnswer, onRoundReady,
}: Props) {
  ensureRegistered();
  const plugin = getPlugin(portalId);
  const [round, setRound] = useState<TutorResponse | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const voiceEnabledRef = useRef(false);

  // 1. Fetch the round (M5).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!plugin) {
        onComplete({ status: "aborted", outcomes: [], durationMs: 0 });
        return;
      }
      const fallback = (): TutorResponse => ({
        skillId: FALLBACK_SKILL[portalId],
        pluginId: portalId,
        params: FIXTURES[portalId],
      });

      let payload;
      try {
        const db = await getDb();
        const eligible = computeEligiblePool(db, PROFILE.id, new Date());
        const recent = loadRecentAttempts(db, PROFILE.id, 10).map((a) => ({
          skillId: a.skillId,
          correct: a.correct,
          occurredAt: a.occurredAt.toISOString(),
        }));
        payload = {
          profile: { id: PROFILE.id, name: PROFILE.name, age: PROFILE.age },
          currentZone: "hub",
          eligiblePool: eligible,
          recentHistory: recent,
          availablePlugins: getAvailablePlugins(),
        };
      } catch (e) {
        console.warn("MiniGameMount payload build failed; falling back", e);
        if (!cancelled) setRound(fallback());
        return;
      }

      const response = await requestNextRound({
        baseUrl: TUTOR_BASE_URL,
        bearerToken: TUTOR_SECRET || undefined,
        payload,
        fallback,
      });
      if (cancelled) return;

      const validated = validateParams(plugin, response.params);
      if (!validated.ok) {
        console.error("MiniGameMount: response.params failed schema validation; using fallback", validated.error);
        setRound(fallback());
        return;
      }
      setRound({ ...response, params: validated.value });
    })();
    return () => { cancelled = true; };
  }, [portalId, plugin, onComplete]);

  // 2. Voice flow (single-shot per step).
  useEffect(() => {
    if (!plugin || !round) return;
    let cancelled = false;
    voiceEnabledRef.current = false;

    const expected = (round.params as { sequence?: number[] })?.sequence ?? [];
    const intro    = (round.params as { intro?: string })?.intro ?? "";

    const handleResult = (r: SttResult) => {
      if (cancelled) return;
      switch (r.confidence) {
        case "high":
          if (r.normalized !== null) {
            handleRef.current?.submitAnswer(r.normalized);
            onVoiceUiChange({ kind: "off" });
            setTimeout(() => listenForAnswer(), 600);
          }
          break;
        case "low":
          if (r.normalized !== null) {
            const closest = expected
              .slice()
              .sort((a, b) => Math.abs(a - r.normalized!) - Math.abs(b - r.normalized!))[0] ?? r.normalized;
            // Wire the confirmation buttons for App.tsx.
            confirmPickRef.current = (n: number) => {
              handleRef.current?.submitAnswer(n);
              onVoiceUiChange({ kind: "off" });
              setTimeout(() => listenForAnswer(), 400);
            };
            confirmNeitherRef.current = () => {
              onVoiceUiChange({ kind: "off" });
              setTimeout(() => listenForAnswer(), 200);
            };
            onVoiceUiChange({ kind: "confirm", candidates: [r.normalized, closest] });
          }
          break;
        case "no_match":
          onVoiceUiChange({ kind: "off" });
          setTimeout(() => listenForAnswer(), 200);
          break;
      }
    };

    const listenForAnswer = async () => {
      if (cancelled || !voiceEnabledRef.current) return;
      try {
        onVoiceUiChange({ kind: "listening" });
        const handle = await startRecorder({
          maxDurationMs: 2500, // hard cap; web silence-detection usually stops sooner
          onAutoStop: async (recording) => {
            recorderRef.current = null;
            stopRecorderRef.current = null;
            await transcribe(recording);
          },
        });
        recorderRef.current = handle;
        // Tap-to-stop hook for App.tsx's mic Pressable.
        stopRecorderRef.current = () => {
          handle.stop().then((rec) => {
            if (!cancelled) transcribe(rec);
          }).catch(() => {});
          stopRecorderRef.current = null;
          recorderRef.current = null;
        };
      } catch (e) {
        console.warn("recorder failed", e);
        onVoiceUiChange({ kind: "off" });
      }
    };

    const transcribe = async (recording: RecordingResult) => {
      if (cancelled) return;
      onVoiceUiChange({ kind: "uploading" });
      try {
        const result = await uploadAndTranscribe({
          baseUrl: TUTOR_BASE_URL,
          bearerToken: TUTOR_SECRET || undefined,
          expectedAnswers: expected,
          recording,
        });
        handleResult(result);
      } catch (e) {
        console.warn("stt upload failed", e);
        onVoiceUiChange({ kind: "off" });
      }
    };

    (async () => {
      // Speak the intro regardless of mic permission, so the kid always hears the
      // task — we don't want any audio to depend on the mic prompt being granted.
      if (intro) {
        onVoiceUiChange({ kind: "speaking" });
        try {
          await speak({ baseUrl: TUTOR_BASE_URL, bearerToken: TUTOR_SECRET || undefined, text: intro });
        } catch (e) {
          console.warn("tts intro failed; continuing", e);
        }
        if (!cancelled) onVoiceUiChange({ kind: "off" });
      }

      // Voice answering needs the mic; without it we stay in NumberPad-only mode.
      if (!(await ensureMicPermission())) return;
      voiceEnabledRef.current = true;
      await listenForAnswer();
    })();

    return () => {
      cancelled = true;
      voiceEnabledRef.current = false;
      recorderRef.current?.stop().catch(() => {});
      recorderRef.current = null;
      stopRecorderRef.current = null;
      confirmPickRef.current = null;
      confirmNeitherRef.current = null;
      onVoiceUiChange({ kind: "off" });
    };
  }, [plugin, round, handleRef, onVoiceUiChange, stopRecorderRef, confirmPickRef, confirmNeitherRef]);

  // Surface the loaded round's params so the App can render the task prompt.
  useEffect(() => {
    if (round) onRoundReady?.(portalId, round.params);
  }, [round, portalId, onRoundReady]);

  if (!plugin || !round) return null;

  const Scene = plugin.Scene as unknown as typeof SpellCastScene;
  return (
    <Scene
      params={round.params as never}
      skillId={round.skillId}
      onComplete={onComplete}
      onHandleReady={(h) => {
        // Wrap the scene handle so EVERY answer path (number-pad + voice) emits a
        // single feedback event for App-level audio/juice — without each game
        // having to know about it.
        handleRef.current = {
          ...h,
          submitAnswer: (n: number) => {
            const r = h.submitAnswer(n);
            onAnswer?.(r);
            return r;
          },
        };
      }}
    />
  );
}
