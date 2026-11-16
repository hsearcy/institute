# Institute

**Institute** is an adaptive math tutor for kids, played as a browser dungeon RPG. Every spell is a math answer: solve a problem to unleash it through a horde, collect rare equipment, gain experience, and grow three branching skill trees with 33 nodes and 23 relics across three expeditions.

Under the game is a real mastery map: 58 math topics in 6 domains, each unlocked by the skills it builds on. The tutor picks the next topic from that map, keeps mastered topics fresh with spaced review, rescues a stuck topic with its prerequisites, and demonstrates each new kind of problem before the first try. Hints are spoken and shown on screen. The parent journal shows what is mastered, practicing, ready, or locked, with a question to ask your child for each topic.

The world keeps moving while you think, but combat waits for your answer. Travel and targeting are automatic. Fifteen abilities span Flame, Frost, and Storm, including Flame Cleave, Meteor, Phoenix Dive, Blizzard, Frost Guardian, and Ball Lightning; each six-encounter expedition ends with a guardian and loot. Distinct rooms include a furnace hall, a lost reliquary, a broken bridge, and a crystal gallery, with automatic travel and progressively denser hordes.

- `web/` — Bun + Vite + TypeScript + Three.js client
- `server/` — Bun + Hono + bun:sqlite tutor server (Anthropic LLM problem generation with deterministic fallback and answer verification)
- `shared/` — zod schema contract shared across the boundary
- `scripts/` — taxonomy import/curation tooling

```bash
bun install
bun run dev:server   # tutor server on :8787
bun run dev:web      # game on :5188, API proxy to :8787
bun test server shared scripts web/unit-tests
```

### API keys

Copy `.env.example` to `.env` in the repo root. Every key is optional. The game runs with none; each missing key turns off one feature.

| key | service | without it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | [Anthropic](https://console.anthropic.com/) — word problems, hints, walkthroughs | built-in deterministic problems and hints |
| `ELEVENLABS_API_KEY` | [ElevenLabs](https://elevenlabs.io/) — spoken hints (`ELEVENLABS_VOICE_ID` picks the voice) | hints are text only |
| `DEEPGRAM_API_KEY` | [Deepgram](https://deepgram.com/) — checks each spoken take against its text | every take is kept unchecked |
| `TRIPO_API_KEY` | [Tripo](https://www.tripo3d.ai/) — 3D asset scripts in `scripts/tripo` | not needed to play |

For a safe local preview with seeded existing learning progress, run `bun --no-env-file scripts/rpg-local-server.ts`, then in another terminal:

```sh
TUTOR_PROXY_TARGET=http://127.0.0.1:8799 VITE_PROFILE_ID=rpg-playtest bun --no-env-file run --cwd web dev
```

Open `http://127.0.0.1:5188`. This uses a disposable database in `/tmp`; it does not touch Ares or a real learner's records. Use `rpg-archmage` instead of `rpg-playtest` to inspect all 15 spells, skill upgrades, equipment, and regions.

## Playing

Type an answer and press Enter or **Unleash**. Use Q/W/E for your three school favorites, B for the full spellbook, K for skill trees, I for equipment, and Escape to pause. Choosing a spell in the spellbook updates its school slot; favorites persist on this device. Click a locked spell to track its next prerequisite at camp and in the dungeon; newly learned spells offer **Try it now**. A number pad is available for touch devices. **Help me** offers a hint or the existing worked walkthrough. Pausing, closing the tab, and leaving at checkpoints preserve adventure progress.

## Verification and assets

```sh
bun run --cwd web build
bun run --cwd web verify:rpg
bun run --cwd web verify:recovery
bun run --cwd web verify:spellbook
python scripts/blender/validate_assets.py
```

Browser tests start an offline tutor with a fresh temporary SQLite database. Install Playwright Chromium first if needed (`cd web && bun x playwright install chromium`). Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium executable. The game assets are bundled: [original Blender models](scripts/blender/README.md), [original sound design](scripts/audio/README.md), and locally hosted OFL fonts.

## Configuration

| env var | default | what it does |
| --- | --- | --- |
| `PLAYER_TZ` | `America/New_York` | IANA zone for US Eastern Time (EST/EDT) that defines "today" for the daily correct-answer count and its record. Set it to where the child actually lives — an unknown zone falls back to US Eastern rather than to the machine clock. |

## Suggestions API and parent bridge

From camp or the pause menu, choose **Suggest a change**. Record up to 60 seconds, stop and preview the recording, then explicitly transcribe it. Check or edit the words before choosing **Send to Ares**. Typing always works, even when microphone permissions or transcription are unavailable. The panel keeps an unsent text draft and shows saved requests with a manual status refresh.

The optional native [Institute parent bridge](scripts/institute_bridge/README.md) delivers requests in an enrolled Hermes/Herald conversation. Approve, decline or revise through a native review form displaying the exact scope and revision. Ordinary chat text, injected messages and model-supplied decisions do not grant approval. Changes to the proposed scope require a new approval. Approved work is prepared and tested in an isolated checkout, never automatically deployed. The bridge source is **not installed or enabled by adding this app feature**; its README documents the separately activated server secret, plugin settings and gateway lifecycle.

Browser microphone recording requires HTTPS or localhost. The existing plain HTTP Tailnet app URL supports typing but not recording. When Houston activates HTTPS on a separate **Tailnet-only** Serve port, set `INSTITUTE_SUGGESTIONS_PUBLIC_ORIGIN` to that exact HTTPS origin. Preserve existing Serve/Funnel roots and never expose the internal review API or its bearer token publicly. Do not put any suggestion secret in `VITE_` settings.

Suggestions are stored independently of game progress. Original submitted `text` is trimmed once on intake and is never replaced by a reviewed `proposal`. Parent review changes only the proposal, its revision and its SHA-256 hash. Authored child-facing messages use no dashes; neither child wording nor authenticated parent message text is rewritten by the review flow.

### Public browser API

| endpoint | request | response |
| --- | --- | --- |
| `POST /rpg/suggestions/transcribe` | Raw audio body, actual `Content-Type: audio/webm` (including `;codecs=opus`), `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav` or `audio/x-wav` | `200 {text}`. Reuses `DEEPGRAM_API_KEY`; `503` unavailable/provider timeout; friendly `422` for empty or unintelligible audio; `415` unsupported format; `413` over 5 MiB. Streaming bodies, including chunked uploads, are bounded while reading. |
| `POST /rpg/suggestions` | JSON `{profileId, requestId, text}`; profile ID trimmed 1..80 characters, request ID UUID, text trimmed 1..4000 characters | `201 {suggestion}`; identical profile/request key and trimmed text replays with `200`; changed text with the same key returns `409`. Saving and durable notification enqueue are one transaction. |
| `GET /rpg/suggestions?profileId=...` | Bounded profile ID | `{suggestions, voiceAvailable}`; newest 20 only. |

Public `suggestion` is `{id, profileId, text, status, createdAt, updatedAt, parentNote?, notificationPending}`. Timestamps are epoch milliseconds. Statuses are `sent`, `approved`, `building`, `ready`, `declined`, `needs_details`. `sent` means saved, not necessarily notified; `notificationPending` remains true until a webhook delivery or verified bridge receipt. **`ready` means an isolated build is ready for parent review, not deployed or live. Houston alone deploys the live site.** No route executes builds, deploys, shell commands or agent prompts.

Public POSTs accept only the request origin, or the exact configured `INSTITUTE_SUGGESTIONS_PUBLIC_ORIGIN` behind a proxy. Forwarded headers cannot bypass this. Cross-site Fetch Metadata requests are rejected. Non-browser clients can omit Origin. Suggestion routes do not inherit legacy wildcard CORS. JSON is capped at 24 KiB and upload reading at 15 seconds; writes share a non-spoofable global 30/minute budget and reads 300/minute per process. Profile IDs follow the existing public profile convention, not an authentication boundary.

### Trusted internal API

Every `/rpg/suggestions/internal...` request requires `Authorization: Bearer <INSTITUTE_SUGGESTIONS_ADMIN_TOKEN>`. This is a separate server-side secret, compared in constant time. Missing configuration fails closed (`503`), bad credentials return `401`. Never place it in web assets or a `VITE_` variable. Internal requests share a bounded 120/minute per-process budget.

The trusted integration must authenticate the actual parent author before calling PATCH, then pass that exact allowlisted actor in `actor`. Set `INSTITUTE_SUGGESTIONS_PARENT_ACTORS` to comma-separated exact trusted parent actor strings. The native Hermes bridge uses `hermes:parent`; the bridge separately restricts the enrolled local conversation and obtains consent from its native choice form. Notification payloads, child suggestions, webhook events, model-generated text and an MCP acknowledgement are **not** approval. The Institute Hermes bridge checks the enrolled session and current scope before committing a native-form decision. The native response is protected by Hermes's attached-viewer capability boundary, not an attestation of a physical human click; an attached caller holding equivalent credentials can also answer.

* `GET /rpg/suggestions/internal?notificationPending=true` returns `{suggestions, nextCursor}`. Optional filters: `profileId`, `status`, `notificationPending=true|false`, `before=<nextCursor>`. Newest first, at most 50 per page; follow `nextCursor` until null. Unknown query fields return `400`.
* `GET /rpg/suggestions/internal/:id` returns `{suggestion, audit, auditTruncated}` or `404`. Audit contains the last 100 entries in chronological order; all entries remain stored in SQLite. Each transition includes actor, action, old/new status, exact reviewed proposal, revision/hash, parent note, original `parentMessageId` and `parentMessageText` (the selected label for native-form consent, not an invented typed reply), and timestamp.
* Internal `suggestion` adds `{requestId, proposal, revision, scopeHash, approvedRevision, approvedScopeHash, notification}` to the public fields. `notification` is `{eventId, payloadHash, attempts, pending, deliveredAt, receipt}`. `receipt` is null until native notification acknowledgement, then `{channelId,messageId,messageText,createdAt}`. Pending events are available even if webhook transport is not configured.

All decisions and status transitions use **one** endpoint, `PATCH /rpg/suggestions/internal/:id`, with strict JSON:

```json
{
  "actor": "authenticated-parent-user-id",
  "parentMessageId": "exact-authenticated-parent-message-id",
  "parentMessageText": "The actual parent message, unchanged",
  "action": "approve",
  "revision": 2,
  "scopeHash": "64-lowercase-hex-characters-from-detail",
  "parentNote": "Optional child-visible note"
}
```

`revision` and `scopeHash` must match a fresh detail read. `scopeHash` is SHA-256 of the exact stored reviewed proposal's UTF-8 bytes. Stale scope returns `409`; repeated/invalid status transitions return `409`. Reusing a parent message for the same action (including approving a later scope) or changing its recorded raw text also returns `409`; on a lost response, inspect detail/audit instead of inventing a new authorization. Missing or non-allowlisted parent actor fails closed. Parent message ID/text are required audit provenance for every transition; an automated building/ready update must carry the actual authorization message provenance, never synthetic parent consent.

| action | allowed current status | effect |
| --- | --- | --- |
| `revise` | sent, needs_details, declined, approved | Require additional nonblank `proposal` string (1..4000 characters, exact whitespace retained); increment revision; replace reviewed scope/hash; clear approval; return to sent. Original `text` stays unchanged. Note is cleared unless supplied. |
| `approve` | sent, needs_details | Bind approval to this exact revision/hash; status approved. |
| `decline` | sent, needs_details, approved | Clear approval; status declined. |
| `needs_details` | sent, approved | Clear approval; status needs_details. |
| `building` | approved | Require this exact approved revision/hash; status building. |
| `ready` | building | Require this exact approved revision/hash; isolated artifact ready for parent review only. |

`proposal` is forbidden on actions other than `revise`; unknown fields are rejected. Scope cannot be revised once building begins or after ready. Success returns `200 {suggestion}`. Parent note is optional, trimmed and limited to 1000 characters; parent message text is stored verbatim (nonblank, up to 8000 characters).

### Poll bridge delivery acknowledgement

Polling is sufficient; webhook configuration is optional. After presenting the exact notification in the enrolled parent conversation **and verifying its native receipt**, the trusted bridge calls:

`POST /rpg/suggestions/internal/:id/notification-ack`

```json
{
  "eventId": "outbox-event-uuid-from-internal-detail",
  "payloadHash": "64-lowercase-hex-characters-from-notification",
  "channelId": "actual-notification-channel-id",
  "messageId": "verified-notification-message-id",
  "messageText": "The exact notification represented by the verified native receipt"
}
```

The bearer authenticates this assertion from the bridge, not from the child, an injected message or a webhook payload. The backend cannot independently inspect Hermes's delivery surface; the bridge must verify the exact native receipt before calling. Injection acceptance alone is not a delivery receipt. Event ID must belong to the exact suggestion and payload hash must match the queued event (`409` otherwise). First acknowledgement atomically stores the receipt and marks delivery complete, without changing suggestion status or granting approval. Success is `200 {suggestion, duplicate:false}`; an exact repeated receipt returns `duplicate:true`; a different receipt for the same event returns `409`. Read the exact detail back and verify the receipt before claiming success. The route does not require a parent actor because notification delivery is not a parent decision.

### Optional webhook outbox worker

If both `INSTITUTE_SUGGESTIONS_WEBHOOK_URL` and `INSTITUTE_SUGGESTIONS_WEBHOOK_SECRET` are set, server startup drains a bounded batch, then retries every five seconds with an unref'd timer. No delivery starts when `NODE_ENV=test`. Importing `suggestions.ts` never opens a database or sends anything. `createSuggestionDelivery(db, {config,fetch,now})` exposes a manual testable `drain(batch)`; `startSuggestionDelivery` returns a stop function.

Outbound POST goes only to the configured HTTP(S) destination, with `Content-Type: application/json`, `X-Gitlab-Token: <webhook secret>`, and `Idempotency-Key: <eventId>`. Redirects are refused. Payload is `{event:"institute.suggestion.created",eventId,suggestionId,trusted:false,notice,suggestion:{id,profileId,text,status,createdAt,revision,scopeHash}}`. Treat all suggestion text as untrusted input. Delivery is at least once: receiving agents must deduplicate event IDs. A database-backed lease serializes workers; expired claims recover after restart. Requests time out after ten seconds; retry backoff grows from one second to a one-hour cap, with no failure drop. At most 25 events are processed per manual drain (10 by default). New submissions are refused with `503` at 1000 pending events, while valid idempotent replays still work. Missing transport configuration leaves events queued and truthful, not falsely delivered. The poll bridge can clear them through the authenticated receipt route.

Tests use only in-memory or disposable scratch SQLite and fake fetch providers:

```sh
bun --no-env-file test server/src/suggestions.test.ts server/src/suggestions.integration.test.ts
```

Do not point tests at a live database, load production environment files, send real notifications, or deploy from this workflow.

## Curriculum data

The skill graph is curated from the [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy)
(v1) · © Generative Spark, Inc. (Marble) · https://withmarble.com — database under
ODbL 1.0, Marble-authored content under CC BY-SA 4.0. See `data/taxonomy/NOTICE`.

## License

Institute's code is licensed under the [MIT License](LICENSE.md). Third-party parts retain their own licenses, including the Marble taxonomy data (above), CC0 sources in `scripts/blender/sources`, and OFL fonts.
