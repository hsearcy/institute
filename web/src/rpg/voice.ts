// Tutor voice: ElevenLabs speech, synthesized by the server.
import { API } from './config';

let current: HTMLAudioElement | null = null;
/** Speak `text` with the tutor's ElevenLabs voice. Best-effort; never throws.
 *  Resolves when playback FINISHES (or is preempted by a newer speak), so
 *  callers can sequence speech and hold the game until the tutor is done. */
export async function speak(text: string): Promise<void> {
  try {
    current?.pause();
    const r = await fetch(`${API}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return;
    const url = URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: 'audio/mpeg' }));
    const a = new Audio(url);
    current = a;
    await a.play().catch(() => {});
    if (a.paused) { URL.revokeObjectURL(url); return; } // autoplay blocked / instantly preempted
    await new Promise<void>((res) => {
      const done = () => { URL.revokeObjectURL(url); res(); };
      a.onended = done;
      a.onerror = done;
      a.onpause = done; // a newer speak() preempted us — we're done either way
    });
  } catch {
    /* best-effort */
  }
}
