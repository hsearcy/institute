import { Platform } from "react-native";
import { createAudioPlayer } from "expo-audio";

export type SpeakOpts = {
  baseUrl: string;
  bearerToken?: string;
  text: string;
  voiceId?: string;
};

/**
 * Fetches TTS audio for `text` from `${baseUrl}/tts` and plays it through the
 * device speaker. Resolves when playback completes (or is blocked). Rejects only
 * on HTTP error. No-op (resolves immediately) when baseUrl is empty.
 *
 * Web and native take different playback paths: expo-audio's web build doesn't
 * reliably play a base64 data URI, so on web we use a plain HTMLAudioElement with
 * a blob URL. Native keeps the expo-audio data-URI path.
 */
export async function speak({ baseUrl, bearerToken, text, voiceId }: SpeakOpts): Promise<void> {
  if (!baseUrl) return;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;

  const res = await fetch(`${baseUrl}/tts`, {
    method: "POST",
    headers,
    body: JSON.stringify(voiceId ? { text, voiceId } : { text }),
  });
  if (!res.ok) throw new Error(`tts failed: ${res.status}`);

  const audioBytes = await res.arrayBuffer();

  if (Platform.OS === "web") {
    await playWeb(audioBytes);
    return;
  }

  const b64 = arrayBufferToBase64(audioBytes);
  const player = createAudioPlayer(`data:audio/mpeg;base64,${b64}`);
  await new Promise<void>((resolve) => {
    player.addListener("playbackStatusUpdate", (status: { didJustFinish?: boolean } = {}) => {
      if (status.didJustFinish) resolve();
    });
    player.play();
  });
}

/** Web playback via HTMLAudioElement + blob URL. Resolves on end/error/block. */
async function playWeb(audioBytes: ArrayBuffer): Promise<void> {
  const AudioCtor = (globalThis as unknown as { Audio?: new (src?: string) => HTMLAudioElement }).Audio;
  if (!AudioCtor) return;
  const url = URL.createObjectURL(new Blob([audioBytes], { type: "audio/mpeg" }));
  const audio = new AudioCtor(url);
  audio.volume = 1;
  await new Promise<void>((resolve) => {
    const done = () => {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      resolve();
    };
    audio.onended = done;
    audio.onerror = () => { console.warn("[tts] audio playback error"); done(); };
    // play() rejects if autoplay is blocked; surface it and resolve so the flow
    // continues (the kid can still use the number pad).
    audio.play().catch((e: unknown) => {
      console.warn("[tts] play() blocked:", e instanceof Error ? e.message : String(e));
      done();
    });
  });
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return globalThis.btoa(bin);
}
