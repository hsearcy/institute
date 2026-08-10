// server/src/tts.ts
//
// Keeping the tutor's voice intelligible.
//
// eleven_turbo_v2_5 is multilingual and runs at low stability for warmth, so a
// short line can occasionally come out mangled — a stray inserted word, a
// dropped clause, or a whole sentence in another language. On its own that is a
// once-in-a-while glitch. The /tts cache is what made it permanent: a bad take
// was stored under the line's text and replayed on every miss from then on.
//
// So: normalize the text before synthesis (ttsText), then check the finished
// audio against what we asked for. The check runs AFTER the audio is sent to
// the child (no added wait) and only evicts the cache, so a bad take plays at
// most once and the next miss gets a fresh one.
import { numberWords } from "./topicgen.ts";

/** Text as ElevenLabs should receive it. Dashes flip the multilingual model
 *  into another language on short lines, so they become commas. */
export function ttsText(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ");
}

const SYMBOL_WORDS: Record<string, string> = {
  "+": "plus", "-": "minus", "−": "minus", "×": "times", "*": "times",
  "÷": "divided by", "/": "divided by", "=": "equals", "$": "dollars", "%": "percent",
};

/** Reduce a line to the bare words a listener would hear: lowercase, numbers
 *  and math symbols spelled out, everything else dropped. Both the text we sent
 *  and the transcript of the audio go through this before they are compared. */
export function spokenForm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[+\-−×*÷/=$%]/g, (s) => ` ${SYMBOL_WORDS[s] ?? " "} `)
    .replace(/\d+/g, (d) => ` ${numberWords(Number(d))} `)
    .replace(/[^a-z ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Below this, the take does not say what we asked for. Faithful takes score
 *  well above 0.9 even with transcription slop; garbled ones fall near zero. */
export const GARBLE_FLOOR = 0.6;

/** How much of the line we asked for actually got said, in order: the longest
 *  common subsequence of words over the length of the longer side. Order counts,
 *  so a scrambled take scores low even though every word is present. */
export function speechSimilarity(sent: string, heard: string): number {
  const a = spokenForm(sent).split(" ").filter(Boolean);
  const b = spokenForm(heard).split(" ").filter(Boolean);
  if (!a.length || !b.length) return 0;
  // LCS by rows — the lines are a sentence or two, so this stays tiny.
  let prev = new Array<number>(b.length + 1).fill(0);
  for (const wa of a) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 0; j < b.length; j++) {
      row[j + 1] = wa === b[j] ? prev[j] + 1 : Math.max(row[j], prev[j + 1]);
    }
    prev = row;
  }
  return prev[b.length] / Math.max(a.length, b.length);
}

/** Transcribe the finished mp3 so it can be compared with the text we sent.
 *  Returns null when transcription is unavailable — no key, or the call failed —
 *  in which case the caller keeps the take rather than throwing it away. */
export async function transcribe(mp3: ArrayBuffer): Promise<string | null> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&punctuate=false", {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "audio/mpeg" },
      body: mp3,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } };
    return j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? null;
  } catch {
    return null;
  }
}
