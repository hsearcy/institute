# M4 — Voice In / Voice Out — Design

**Goal:** Sam plays Spell Cast hands-free. The tutor's intro line is spoken by ElevenLabs through the device speaker; Sam answers each step by speaking the number; Deepgram (via streaming WebSocket) transcribes; the answer flows into the existing `Scene.submitAnswer` path. NumberPad stays as a fallback after 2 wrong tries or when mic permission is denied.

**Demonstrates:** Tap the Spell Cast portal → tutor says "A goblin appears! Cast sparks by 2s" → mic icon pulses → Sam says "two" → goblin shrinks within ~400ms → tutor responds → loop.

## Scope (locked)

- Voice in **and** voice out land in this M4 (one milestone).
- Both routed through the existing Rails backend at `apps/backend/`. No API keys on device.
- Deepgram nova-2 (STT) + ElevenLabs (TTS). Both env keys (`DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`) already added to `apps/backend/.env`.
- STT is **streaming** via a WebSocket between kid-app, Rails, and Deepgram. Latency target: ~200-400ms from end-of-utterance to `submitAnswer`. Single-shot HTTP would feel laggy for a 6yo (~2s).
- TTS is **streaming** via Rails proxying ElevenLabs's chunked MP3 endpoint; kid-app plays audio chunks as they arrive.
- Backend hosts the kid-speech normalizer (Ruby `Tutor::SpeechNormalizer`).
- Mic permission requested on first portal tap; if denied → fall back to NumberPad-only mode silently.
- Any STT/TTS failure → fall back to existing on-screen text + NumberPad. Sam never gets stuck.

## Out of scope (later milestones)

- Voice for parts of the app outside a Spell Cast round (hub navigation, etc.) — M6+.
- Voice in other mini-games — comes with each new minigame in M6.
- Continuous "always-on" listening (mic open between rounds) — settings toggle, M7+.
- Self-hosted STT/TTS (faster-whisper, Kokoro/Piper) — post-V1, swap behind the existing backend interface.
- TTS voice selection by parent / per-profile tutor personality — M7.
- Wake-word ("hey tutor") — out of V1.
- Sound effects (goblin grunts, spell sounds) — out of V1; can pair with M6.

## Architecture

```
┌─ Kid app (RN/Expo, Spell Cast Scene) ──────────────────────┐
│  Round starts (params include intro string)                │
│      ↓                                                     │
│  TtsClient.speak(intro)                                    │
│    POST /tts → streamed mp3 → expo-audio playback          │
│      ↓ (audio finishes)                                    │
│  PulsingMicIcon shows                                      │
│  SttSession.start(expectedAnswers=[2,4,6,8,10])            │
│    ws.connect(/cable subscribe SttChannel)                 │
│    expo-audio recorder → onAudioBuffer → ws.send(binary)   │
│  Deepgram returns { is_final, transcript } →               │
│    SpeechNormalizer.normalize(transcript, expected) →      │
│    ws emits { transcript, normalized, confidence }         │
│      ↓                                                     │
│  switch(confidence)                                        │
│    high     → Scene.submitAnswer(normalized)               │
│    low      → ConfirmPrompt: "Did you say X or Y?"         │
│    no_match → "I didn't catch that — try again"            │
│      ↓                                                     │
│  After 2 wrongs in a row → reveal NumberPad                │
└────────────────────────────────────────────────────────────┘
                          ↕ HTTPS / WSS (existing tailnet)
┌─ Backend (Rails 8 + ActionCable) ──────────────────────────┐
│  POST /tts                                                 │
│    Tts::Stream.call(text:, voice_id: ENV[..]) →            │
│      ElevenLabs streaming endpoint                         │
│      → response.stream chunked mp3 → client                │
│                                                            │
│  ActionCable channel: SttChannel                           │
│    subscribed(payload: { expectedAnswers: [...] })         │
│      → opens WS to Deepgram nova-2 streaming endpoint      │
│      → forwards every binary frame from client to Deepgram │
│      → on Deepgram message:                                │
│          if is_final:                                      │
│            normalized, confidence =                        │
│              Tutor::SpeechNormalizer.call(                 │
│                transcript, expected_answers)               │
│            transmit({ transcript, normalized, confidence })│
│    unsubscribed:                                           │
│      → close Deepgram WS                                   │
└────────────────────────────────────────────────────────────┘
```

Key shape choices:

- **ActionCable** for the bidirectional pipe. Need to re-add `action_cable` to the Rails app (was `--skip`'d in M5 init) and configure `solid_cable` as the adapter (database-backed; no Redis needed for V1). Cable serves over the same Puma instance — no extra process.
- **Deepgram endpointing** decides "kid stopped speaking" — no client-side VAD logic needed. Deepgram emits `speech_final=true` when it judges the utterance complete.
- **TTS is plain HTTP, not WS** — one-shot text → streaming MP3 response. ElevenLabs has a `text-to-speech/.../stream` endpoint that returns chunked audio.
- **No audio storage.** Recording is streamed directly to Deepgram and discarded. TTS is streamed to the device and discarded. Nothing persisted server-side in M4 (M5's persistence story unchanged).

## Backend changes

### Re-add ActionCable

`--skip-action-cable` was passed during `rails new` in M5. Restore it:
- Add `gem "actioncable"` (already in Rails core; just need config).
- Restore `config/cable.yml` (use `solid_cable` adapter — already in Gemfile from M5).
- Restore `app/channels/application_cable/{channel,connection}.rb`.
- Add to `config/application.rb`: `require "action_cable/engine"`.

Production deploy concern: SolidCable's polling adapter is fine for one tablet. For more devices, swap adapter — config-only change.

### `Tts::Stream` service

```ruby
module Tts
  module Stream
    DEFAULT_VOICE_ID = ENV.fetch("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM") # Rachel default

    def self.call(text:, voice_id: DEFAULT_VOICE_ID, &on_chunk)
      # Faraday/HTTP call to ElevenLabs streaming endpoint:
      #   POST https://api.elevenlabs.io/v1/text-to-speech/<voice_id>/stream
      #   headers: xi-api-key, accept: audio/mpeg, content-type: application/json
      #   body: { text:, model_id: "eleven_turbo_v2_5", voice_settings: {...} }
      # Yields each binary chunk via on_chunk.
    end
  end
end
```

Controller streams the response via Rails 8's `response.stream`:

```ruby
class TtsController < ApplicationController
  include ActionController::Live

  def create
    response.headers["Content-Type"] = "audio/mpeg"
    Tts::Stream.call(text: params.require(:text)) { |chunk| response.stream.write(chunk) }
  ensure
    response.stream.close
  end
end
```

### `SttChannel` (ActionCable)

```ruby
class SttChannel < ApplicationCable::Channel
  def subscribed
    expected = params.fetch("expected_answers", []).map(&:to_i)
    @session = Stt::DeepgramSession.new(expected_answers: expected) do |event|
      # event => { transcript:, normalized:, confidence: }
      transmit(event)
    end
    @session.start
  end

  def unsubscribed
    @session&.close
  end

  def receive(data)
    # Binary audio frames from the client
    @session&.send_audio(data)
  end
end
```

### `Stt::DeepgramSession`

Wraps the Deepgram streaming WebSocket. Internally:
- Opens WS to `wss://api.deepgram.com/v1/listen?model=nova-2&endpointing=300&interim_results=false&language=en&punctuate=false&numerals=true`
- Forwards binary audio frames written via `send_audio`
- On Deepgram message with `is_final && speech_final`, normalizes via `Tutor::SpeechNormalizer.call`
- Emits an event hash through the supplied block

Implementation: `faye-websocket` gem is the standard Rails-friendly WS client.

### `Tutor::SpeechNormalizer`

```ruby
module Tutor
  module SpeechNormalizer
    # Returns { transcript:, normalized: Integer | nil, confidence: "high"|"low"|"no_match" }
    def self.call(transcript, expected_answers)
      cleaned = clean(transcript)             # downcase, strip punctuation
      n = parse_number(cleaned)               # word→int + toddler-isms
      return { transcript:, normalized: nil, confidence: "no_match" } if n.nil?
      return { transcript:, normalized: n, confidence: "high" } if expected_answers.include?(n)
      # If we got a number but it's not in expected, treat as low-confidence
      # so the kid-app can confirm: "Did you say <n> or <closest expected>?"
      { transcript:, normalized: n, confidence: "low" }
    end

    NUMBER_WORDS = {
      "zero" => 0, "one" => 1, "two" => 2, "three" => 3, "four" => 4,
      "five" => 5, "six" => 6, "seven" => 7, "eight" => 8, "nine" => 9,
      "ten" => 10, "eleven" => 11, "twelve" => 12, ...
    }

    TODDLER_ISMS = {
      "free" => "three", "tree" => "three", "twee" => "three", "fwee" => "three",
      "fife" => "five", "fwive" => "five",
      "tin" => "ten", "ten ten" => "ten",
      "noyne" => "nine",
      ...
    }
  end
end
```

Pure function. Tested in Minitest with a fixture file of recorded-then-transcribed kid utterances (initially small, grows as we observe Sam).

## Kid-app changes

### New: `apps/kid-app/src/voice/`

- `recorder.ts` — wraps `expo-audio` recording. Exposes `start({ onChunk(buffer) })` / `stop()`. Configures Opus or PCM at a sample rate Deepgram likes (16kHz mono is the safe default).
- `sttSession.ts` — opens an ActionCable subscription to `SttChannel`, streams chunks from `recorder`, surfaces transcript events. API:
  ```ts
  startSttSession({
    expectedAnswers: number[],
    onResult: (e: { transcript, normalized, confidence }) => void,
    onError: (err: Error) => void,
  }) → { stop: () => void }
  ```
- `ttsClient.ts` — POSTs `{ text }` to `/tts`, plays the streamed MP3 via `expo-audio`. Returns a promise that resolves when playback finishes. API: `await speak(text)`.
- `permission.ts` — wraps `expo-audio`'s mic permission request. `ensureMicPermission(): Promise<boolean>`. Caches the result for the session.
- `voiceFlow.ts` — orchestrates the per-step flow:
  ```ts
  await speak(intro);
  const session = startSttSession({
    expectedAnswers,
    onResult: handleResult,
    onError: () => fallbackToNumberPad(),
  });
  ```

### Modified: `apps/kid-app/src/minigame/`

- `MicIcon.tsx` (NEW) — pulsing animated mic icon shown while recording.
- `Confirmation.tsx` (NEW) — small modal: "Did you say <a> or <b>?" with two tap targets and a "neither" option.
- `MiniGameMount.tsx` — when round mounts and mic permission is granted, run the voice flow instead of showing NumberPad. NumberPad still mounts but stays hidden until 2 wrongs in a row OR voice flow disabled (permission denied / backend error).
- `Scene.tsx` (spell-cast) — adds an `onWrongStreak(n: number)` callback so the mount can decide when to reveal NumberPad. Already tracks consecutive wrongs internally for the shake animation; just exposes a counter.

### Modified: `apps/kid-app/src/config.ts`

```ts
export const TUTOR_WS_URL: string =
  TUTOR_BASE_URL ? TUTOR_BASE_URL.replace(/^http/, "ws") + "/cable" : "";
```

### New deps

- `expo-audio` (Expo SDK 54+ blessed module — replaces deprecated `expo-av` for both record and playback)
- `@rails/actioncable` JS client (~14KB, official Rails-blessed WS client)

## UX flow (per Spell Cast round)

```
1. portal tap → MiniGameMount mounts
2. tutor params load (existing M5 path)
3. ensureMicPermission()
   - first tap: native prompt; on grant continue, on deny → numberpad-only mode
   - subsequent taps: cached result
4. await speak(params.intro)        # mic muted during TTS
5. micIcon = PULSING; recorder.start()
6. SttSession streams audio → backend → Deepgram → result
7. on result:
   - high       → submitAnswer(n); on correct → next step → goto 4 (no intro re-speak; just listen)
                                      on wrong → micIcon shake; restart listen
   - low        → confirm modal: pick X / pick Y / neither
                  pick → submitAnswer; neither → restart listen
   - no_match   → tutor says "I didn't catch that"; restart listen
8. after 2 wrongs in a row → numberpad fades in below; voice still active
9. round complete → existing M5 persistence path
```

Quiet states:
- During TTS playback: mic icon hidden, recorder NOT running.
- Between problems: mic icon hidden briefly, recorder restarts when next prompt is shown.
- After abort (back button): recorder stops, WS closes, no further audio sent.

## Failure modes & fallbacks

| Failure | Behavior |
|---|---|
| Mic permission denied | NumberPad-only mode, no mic icon ever shown, voice flow disabled until next app launch (where we re-prompt) |
| Backend unreachable | Skip TTS (display intro on screen instead), skip mic, NumberPad-only |
| TTS fails mid-stream | Skip remaining TTS, show on-screen text, still try mic |
| WS connection fails | Skip mic for this round, NumberPad-only; retry next round |
| Deepgram error | Tutor says "let's try tapping" (or shows on-screen), reveal NumberPad immediately |
| 3+ no_match in a row | Reveal NumberPad immediately (don't wait for 2 wrongs) |

Every fallback path lands at NumberPad — the M2 path that's known to work. Sam never gets stuck.

## Testing strategy

### Backend (Minitest)
- `Tutor::SpeechNormalizer` — fixture file `test/fixtures/speech_normalizer.yml` with `[transcript, expected_answers, expected_normalized, expected_confidence]` rows. Cover digits, words 1-20, common toddler-isms, fuzzy match, no_match.
- `Stt::DeepgramSession` — unit-test with a stub WS class (DI). Cover: forwards binary frames, parses Deepgram messages, emits events, normalizes via SpeechNormalizer, closes cleanly.
- `Tts::Stream` — unit-test with a stub HTTP client. Cover: builds correct request, yields chunks, raises on non-2xx.
- `SttChannel` — Rails channel test. Cover: `subscribed` opens session, `receive` forwards audio, `unsubscribed` closes. Live Deepgram integration test gated by `LIVE_VOICE=1` env (off by default).
- `TtsController` — integration test. Cover: 200 streams audio, 422 on missing text, bypass auth flag matches `TutorController` (same bearer logic).

### Kid-app (Vitest)
- `voice/sttSession.test.ts` — mock the ActionCable consumer. Cover: forwards chunks, surfaces results, calls onError on disconnect.
- `voice/ttsClient.test.ts` — mock fetch + expo-audio. Cover: POST shape, playback start, onFinish promise resolves.
- `voice/voiceFlow.test.ts` — orchestration test (mock ttsClient + sttSession + scene handle). Cover: speak-then-listen sequence, confidence routing.
- `voice/permission.test.ts` — mock expo-audio permission. Cover: cache, denied path returns false.
- No expo-audio recorder unit tests in M4; verified on-device.

### Manual on-device (M4 section in `apps/kid-app/test/manual-checklist.md`)
- Tap Spell Cast → tutor's voice plays
- Mic icon appears, pulses
- Say "two" → goblin shrinks within ~500ms
- Say "blah" → "I didn't catch that" line, mic re-opens
- Mute the mic via OS settings → confirm fallback to NumberPad on next round
- Backend offline → confirm everything degrades to text+NumberPad

## Risks

- **Deepgram WS stability through Tailscale.** WS over Tailscale should be fine but is one more hop. Mitigation: connection retry with exponential backoff; if still failing after 3, fall back to NumberPad.
- **Audio format mismatch.** expo-audio defaults vary by platform; Deepgram requires a known sample rate / encoding. Mitigation: explicitly configure 16kHz mono PCM (or Opus, if Deepgram supports it from streaming) and document.
- **TTS latency.** ElevenLabs first-byte latency varies (~300-800ms). Acceptable. Mitigation: use the `eleven_turbo_v2_5` model (faster), pre-warm via `text=" "` ping at backend boot.
- **Normalizer overconfidence.** "fife" → 5 is great unless Sam is actually saying a different word. Mitigation: `low` confidence gates everything not in expected_answers, the confirm modal catches it.
- **Battery cost of always-on mic during a round.** Negligible for short rounds (<2 min). Will revisit if Sam plays for longer sessions.

## What success looks like

After M4:

1. Sam taps Spell Cast.
2. Tutor's ElevenLabs voice says: "A goblin appears. Cast sparks by twos to defeat it."
3. Mic icon pulses; Sam says "two."
4. ~400ms later, goblin shrinks 20%.
5. Mic icon pulses; Sam says "four." Goblin shrinks again.
6. Sam says "tree" → normalizer maps to 3 → not in expected → confirm modal: "Did you say six?" (closest expected) → tap "yes" → goblin shrinks.
7. Sam never touches the screen for the rest of the round.
8. Mic permission denied → NumberPad-only round, no crash, no awkward UI.
9. Backend down → on-screen intro text + NumberPad fallback (the existing M2 flow).
