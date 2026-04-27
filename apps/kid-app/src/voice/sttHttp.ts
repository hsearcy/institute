import type { RecordingResult } from "./recorder";

export type SttResult = {
  transcript: string;
  normalized: number | null;
  confidence: "high" | "low" | "no_match";
};

export type UploadOpts = {
  baseUrl: string;
  bearerToken?: string;
  expectedAnswers: number[];
  recording: RecordingResult;
};

/**
 * Upload a recorded audio file to the backend's `/stt` endpoint and
 * return the normalized transcript result.
 *
 * Throws if the network call fails. The caller (MiniGameMount) handles
 * fallback to the NumberPad on error.
 */
export async function uploadAndTranscribe(opts: UploadOpts): Promise<SttResult> {
  if (!opts.baseUrl) throw new Error("no tutor base URL configured");

  console.log("[stt] upload uri=", opts.recording.uri, "ct=", opts.recording.contentType);
  if (!opts.recording.uri) {
    throw new Error("recording uri is empty — recorder didn't produce a file");
  }

  const form = new FormData();
  // RN's FormData accepts a { uri, name, type } object as the file value.
  form.append("audio", {
    uri: opts.recording.uri,
    name: "round.m4a",
    type: opts.recording.contentType,
  } as unknown as Blob);
  form.append("expected_answers", opts.expectedAnswers.join(","));

  const headers: Record<string, string> = {};
  if (opts.bearerToken) headers["Authorization"] = `Bearer ${opts.bearerToken}`;
  // Don't set Content-Type — fetch sets multipart boundary automatically.

  const res = await fetch(`${opts.baseUrl}/stt`, { method: "POST", headers, body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`stt upload failed: ${res.status} ${body}`);
  }
  return (await res.json()) as SttResult;
}
