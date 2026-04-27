import { createAudioPlayer } from "expo-audio";

export type SpeakOpts = {
  baseUrl: string;
  bearerToken?: string;
  text: string;
  voiceId?: string;
};

/**
 * Fetches TTS audio for `text` from `${baseUrl}/tts` and plays it through the
 * device speaker. Resolves when playback completes. Rejects on HTTP error.
 * No-op (resolves immediately) when baseUrl is empty.
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
  const b64 = arrayBufferToBase64(audioBytes);
  const player = createAudioPlayer(`data:audio/mpeg;base64,${b64}`);

  await new Promise<void>((resolve) => {
    player.addListener("playbackStatusUpdate", (status: { didJustFinish?: boolean } = {}) => {
      if (status.didJustFinish) resolve();
    });
    player.play();
  });
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return globalThis.btoa(bin);
}
