import { useEffect, useState } from "react";
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
import { startRecorder } from "../voice/recorder";
import { startSttSession } from "../voice/sttSession";
import { speak } from "../voice/ttsClient";
import { runVoiceFlow, type VoiceFlowHandle } from "../voice/voiceFlow";
import { MicIcon } from "./MicIcon";
import { Confirmation } from "./Confirmation";
import { TUTOR_WS_URL } from "../config";

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

export function MiniGameMount({ portalId, onComplete, handleRef }: Props) {
  ensureRegistered();
  const plugin = getPlugin(portalId);
  const [round, setRound] = useState<TutorResponse | null>(null);
  const [voiceState, setVoiceState] = useState<
    | { kind: "off" }
    | { kind: "speaking" | "listening" }
    | { kind: "confirm"; candidates: [number, number] }
  >({ kind: "off" });

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

  useEffect(() => {
    if (!plugin || !round) return;
    let voice: VoiceFlowHandle | null = null;
    let cancelled = false;
    (async () => {
      if (!(await ensureMicPermission())) return; // NumberPad-only mode

      const intro = (round.params as { intro?: string })?.intro ?? "";
      const expected = (round.params as { sequence?: number[] })?.sequence ?? [];

      setVoiceState({ kind: "speaking" });
      try {
        voice = await runVoiceFlow({
          intro,
          expectedAnswers: expected,
          deps: {
            speak: (text) => speak({ baseUrl: TUTOR_BASE_URL, bearerToken: TUTOR_SECRET || undefined, text }),
            startRecorder: (onChunk) =>
              startRecorder({
                onChunk,
                onStart: () => { if (!cancelled) setVoiceState({ kind: "listening" }); },
                onError: () => {},
              }),
            startSttSession: (opts) =>
              startSttSession({
                wsUrl: TUTOR_WS_URL,
                bearerToken: TUTOR_SECRET || undefined,
                expectedAnswers: opts.expectedAnswers,
                onResult: opts.onResult,
                onError: opts.onError,
              }),
            submitAnswer: (n) => handleRef.current?.submitAnswer(n),
            onLowConfidence: (candidate, expectedSet) => {
              const closest = expectedSet
                .slice()
                .sort((a, b) => Math.abs(a - candidate) - Math.abs(b - candidate))[0] ?? candidate;
              setVoiceState({ kind: "confirm", candidates: [candidate, closest] });
            },
            onNoMatch: () => { /* mic re-opens automatically by Deepgram endpointing */ },
          },
        });
      } catch (e) {
        // recorder.ts is currently a stub that throws; that's fine for now —
        // permission flow + Scene still mount, just without voice. Task 14
        // wires the real recorder.
        console.warn("voice flow failed; NumberPad fallback", e);
      }
    })();
    return () => { cancelled = true; voice?.stop(); };
  }, [plugin, round]);

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
      {voiceState.kind === "listening" && <MicIcon active />}
      {voiceState.kind === "confirm" && (
        <Confirmation
          candidates={voiceState.candidates}
          onPick={(n) => { handleRef.current?.submitAnswer(n); setVoiceState({ kind: "listening" }); }}
          onNeither={() => setVoiceState({ kind: "listening" })}
        />
      )}
    </>
  );
}
