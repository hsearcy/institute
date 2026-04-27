import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { plugin as spellCastPlugin } from "@institute/minigame-spell-cast";
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
import { MicIcon } from "./MicIcon";
import { Confirmation } from "./Confirmation";

let registered = false;
function ensureRegistered() {
  if (registered) return;
  try { register(spellCastPlugin); }
  catch (e) { if (!(e instanceof Error) || !/already registered/i.test(e.message)) throw e; }
  registered = true;
}

type Props = {
  portalId: PortalId;
  onComplete: (r: RoundResult) => void;
  handleRef: React.MutableRefObject<SpellCastSceneHandle | null>;
};

type VoiceState =
  | { kind: "off" }
  | { kind: "speaking" }
  | { kind: "listening" }
  | { kind: "uploading" }
  | { kind: "confirm"; candidates: [number, number] };

export function MiniGameMount({ portalId, onComplete, handleRef }: Props) {
  ensureRegistered();
  const plugin = getPlugin(portalId);
  const [round, setRound] = useState<TutorResponse | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>({ kind: "off" });
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
      const fallback = (): TutorResponse =>
        portalId === "spell-cast"
          ? { skillId: "skip_count_2", pluginId: "spell-cast", params: FIXTURES["spell-cast"] }
          : { skillId: "skip_count_2", pluginId: portalId, params: {} };

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
            setVoiceState({ kind: "off" });
            // Start the next listen after a short beat for the goblin animation.
            setTimeout(() => listenForAnswer(), 600);
          }
          break;
        case "low":
          if (r.normalized !== null) {
            const closest = expected
              .slice()
              .sort((a, b) => Math.abs(a - r.normalized!) - Math.abs(b - r.normalized!))[0] ?? r.normalized;
            setVoiceState({ kind: "confirm", candidates: [r.normalized, closest] });
          }
          break;
        case "no_match":
          setVoiceState({ kind: "off" });
          setTimeout(() => listenForAnswer(), 200);
          break;
      }
    };

    const listenForAnswer = async () => {
      if (cancelled || !voiceEnabledRef.current) return;
      try {
        setVoiceState({ kind: "listening" });
        const handle = await startRecorder({
          maxDurationMs: 4000,
          onAutoStop: async (recording) => {
            recorderRef.current = null;
            await transcribe(recording);
          },
        });
        recorderRef.current = handle;
      } catch (e) {
        console.warn("recorder failed", e);
        setVoiceState({ kind: "off" });
      }
    };

    const transcribe = async (recording: RecordingResult) => {
      if (cancelled) return;
      setVoiceState({ kind: "uploading" });
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
        setVoiceState({ kind: "off" });
        // Don't auto-retry; tap-to-talk will be available via the mic button.
      }
    };

    (async () => {
      if (!(await ensureMicPermission())) return; // NumberPad-only mode
      voiceEnabledRef.current = true;

      if (intro) {
        setVoiceState({ kind: "speaking" });
        try {
          await speak({ baseUrl: TUTOR_BASE_URL, bearerToken: TUTOR_SECRET || undefined, text: intro });
        } catch (e) {
          console.warn("tts failed; continuing without intro audio", e);
        }
      }
      await listenForAnswer();
    })();

    return () => {
      cancelled = true;
      voiceEnabledRef.current = false;
      recorderRef.current?.stop().catch(() => {});
      recorderRef.current = null;
    };
  }, [plugin, round, handleRef]);

  if (!plugin || !round) return null;

  // M2 expedient cast — Scene is generic per plugin. Refactor in M6.
  const Scene = plugin.Scene as unknown as typeof SpellCastScene;
  return (
    <>
      <Scene
        params={round.params as never}
        skillId={round.skillId}
        onComplete={onComplete}
        onHandleReady={(h) => { handleRef.current = h; }}
      />
      {voiceState.kind === "listening" && (
        <Pressable
          style={styles.micHit}
          onPress={() => { recorderRef.current?.stop().catch(() => {}); }}
        >
          <MicIcon active />
        </Pressable>
      )}
      {voiceState.kind === "confirm" && (
        <Confirmation
          candidates={voiceState.candidates}
          onPick={(n) => {
            handleRef.current?.submitAnswer(n);
            setVoiceState({ kind: "off" });
          }}
          onNeither={() => setVoiceState({ kind: "off" })}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  micHit: {
    position: "absolute",
    bottom: 60, alignSelf: "center",
    width: 100, height: 100,
    alignItems: "center", justifyContent: "center",
  },
});
