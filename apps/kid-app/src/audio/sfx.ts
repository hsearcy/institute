// Tiny one-shot SFX player for UI/juice feedback. Built on expo-audio, which
// works on web + native. Every call is wrapped so audio can never crash or block
// gameplay (a missing codec, an autoplay block, etc. just goes silent).
//
// SFX are generated with ElevenLabs (see scripts/synth_sfx.py for a stdlib-only
// procedural fallback generator). Drop richer audio in by replacing the
// same-named files under assets/audio/.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

const SOURCES = {
  correct: require("../../assets/audio/correct.mp3"),
  wrong: require("../../assets/audio/wrong.mp3"),
  win: require("../../assets/audio/win.mp3"),
  collect: require("../../assets/audio/collect.mp3"),
  whoosh: require("../../assets/audio/whoosh.mp3"),
  cast: require("../../assets/audio/cast.mp3"),
} as const;

export type SfxName = keyof typeof SOURCES;

const players: Partial<Record<SfxName, AudioPlayer>> = {};
let started = false;

/** Preload the players once. Safe to call repeatedly; no-op after the first. */
export function initSfx(): void {
  if (started) return;
  started = true;
  try {
    // Allow SFX to sound even when a device is on silent.
    void setAudioModeAsync({ playsInSilentMode: true });
  } catch {
    /* older/newer mode shape — ignore, playback still works */
  }
  for (const name of Object.keys(SOURCES) as SfxName[]) {
    try {
      players[name] = createAudioPlayer(SOURCES[name]);
    } catch {
      /* leave undefined; playSfx no-ops for it */
    }
  }
}

/** Play a one-shot effect from its start. Never throws. */
export function playSfx(name: SfxName, volume = 1): void {
  if (!started) initSfx();
  const p = players[name];
  if (!p) return;
  try {
    p.volume = volume;
    // Restart from the top so rapid retriggers always sound.
    void p.seekTo(0);
    p.play();
  } catch {
    /* ignore — audio is best-effort */
  }
}
