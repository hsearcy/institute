import { createConsumer } from "@rails/actioncable";

export type SttResult = {
  transcript: string;
  normalized: number | null;
  confidence: "high" | "low" | "no_match";
};

export type StartSttSessionOpts = {
  wsUrl: string;
  bearerToken?: string;
  expectedAnswers: number[];
  onResult: (r: SttResult) => void;
  onError: (e: Error) => void;
};

export type SttHandle = {
  sendAudio: (chunk: ArrayBuffer) => void;
  stop: () => void;
};

const INERT: SttHandle = { sendAudio: () => {}, stop: () => {} };

export function startSttSession(opts: StartSttSessionOpts): SttHandle {
  if (!opts.wsUrl) return INERT;

  const url = opts.bearerToken ? `${opts.wsUrl}?token=${encodeURIComponent(opts.bearerToken)}` : opts.wsUrl;
  const consumer = createConsumer(url);

  const sub = consumer.subscriptions.create(
    { channel: "SttChannel", expected_answers: opts.expectedAnswers },
    {
      received: (data: unknown) => {
        if (data && typeof data === "object") opts.onResult(data as SttResult);
      },
      disconnected: () => opts.onError(new Error("STT WS disconnected")),
    },
  );

  return {
    sendAudio: (chunk) => { sub.send(chunk); },
    stop: () => { sub.unsubscribe(); consumer.disconnect(); },
  };
}
