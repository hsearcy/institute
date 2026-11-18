# Suggestions API

Reference for the suggestion endpoints and delivery protocol. For local speech setup, see [the speech worker](../speech/README.md); for parent review, see [the Hermes/Herald bridge](../scripts/institute_bridge/README.md).

Microphone capture requires HTTPS or localhost. Behind a proxy, set `INSTITUTE_SUGGESTIONS_PUBLIC_ORIGIN` to the exact browser origin. Keep the internal API and its bearer token private; never put secrets in `VITE_` settings.

Suggestions are stored separately from learning progress. Original child wording stays unchanged; reviewing a proposal does not replace it. Submission is not build approval, and approval never deploys changes automatically.

## Public browser API

| endpoint | request | response |
| --- | --- | --- |
| `POST /rpg/suggestions/voice-presence` | Mandatory same-origin JSON `{clientId, active}`; per-page UUID and boolean, capped at 1 KiB | `202 {ok:true}` renews/releases an ephemeral local speech lease. No player records or audio. Only Bark forwards to the loopback manager; other providers are no-ops. `503` when unavailable does not prevent playing or typing. |
| `WS /rpg/suggestions/live` | Same-origin browser socket; JSON `{type:"start",sampleRate:16000}`, then binary mono PCM16 little-endian frames; JSON `{type:"stop"}` to finish | Server `ready`, `transcript` with `{text,isFinal}`, optional `stop_requested` at the automatic limit so the browser flushes its audio tail, then `done` after the final provider flush, or a child-safe `error`. Cancel by closing. Requires explicit valid Origin and a configured speech provider. Local Bark needs no API key; no suggestion is saved by this endpoint. |
| `POST /rpg/suggestions/transcribe` | Legacy compatibility only. Raw audio body, actual `Content-Type: audio/webm` (including `;codecs=opus`), `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav` or `audio/x-wav` | Only enabled with explicit `INSTITUTE_SPEECH_PROVIDER=deepgram` and `DEEPGRAM_API_KEY`; returns `503` without making an external request in Bark or disabled mode. `200 {text}`; `503` unavailable/provider timeout; friendly `422` for empty or unintelligible audio; `415` unsupported format; `413` over 5 MiB. Streaming bodies, including chunked uploads, are bounded while reading. |
| `POST /rpg/suggestions` | JSON `{profileId, requestId, text}`; profile ID trimmed 1..80 characters, request ID UUID, text trimmed 1..4000 characters | `201 {suggestion}`; identical profile/request key and trimmed text replays with `200`; changed text with the same key returns `409`. Saving and durable notification enqueue are one transaction. |
| `GET /rpg/suggestions?profileId=...` | Bounded profile ID | `{suggestions, voiceAvailable}`; newest 20 only. |

Public `suggestion` is `{id, profileId, text, status, createdAt, updatedAt, parentNote?, notificationPending}`. Timestamps are epoch milliseconds. Statuses are `sent`, `approved`, `building`, `ready`, `declined`, `needs_details`. `sent` means saved, not necessarily notified; `notificationPending` remains true until a webhook delivery or verified bridge receipt. **`ready` means an isolated build is ready for parent review, not deployed or live. Deployment requires separate operator authorization.** No route executes builds, deploys, shell commands or agent prompts.

Public POSTs accept only the request origin, or the exact configured `INSTITUTE_SUGGESTIONS_PUBLIC_ORIGIN` behind a proxy. Forwarded headers cannot bypass this. Cross-site Fetch Metadata requests are rejected. Non-browser HTTP clients can omit Origin except for live WebSockets and voice presence, which require it. Suggestion routes do not inherit legacy wildcard CORS. JSON is capped at 24 KiB and upload reading at 15 seconds; writes share a non-spoofable global 30/minute budget and reads 300/minute per process. Live speech has separate connection/rate limits, a 60-second duration, 5 MiB total audio ceiling, bounded frames/backpressure, and startup/idle/final-flush timeouts. Profile IDs follow the existing public profile convention, not an authentication boundary.

Bun wrappers must install the backend's `websocket` handler and forward the Bun server context: `Bun.serve({websocket: backend.websocket, fetch: (request, bunServer) => backend.fetch(request, bunServer)})`. Forwarding only `fetch(request)` handles HTTP but cannot upgrade a live speech socket. Audio goes through the server-side proxy to the explicitly selected provider, local Bark by default, and is not persisted by the app. The older prerecorded HTTP transcription route remains only for explicit Deepgram compatibility.

## Trusted internal API

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

## Poll bridge delivery acknowledgement

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

## Optional webhook outbox worker

If both `INSTITUTE_SUGGESTIONS_WEBHOOK_URL` and `INSTITUTE_SUGGESTIONS_WEBHOOK_SECRET` are set, server startup drains a bounded batch, then retries every five seconds with an unref'd timer. No delivery starts when `NODE_ENV=test`. Importing `suggestions.ts` never opens a database or sends anything. `createSuggestionDelivery(db, {config,fetch,now})` exposes a manual testable `drain(batch)`; `startSuggestionDelivery` returns a stop function.

Outbound POST goes only to the configured HTTP(S) destination, with `Content-Type: application/json`, `X-Gitlab-Token: <webhook secret>`, and `Idempotency-Key: <eventId>`. Redirects are refused. Payload is `{event:"institute.suggestion.created",eventId,suggestionId,trusted:false,notice,suggestion:{id,profileId,text,status,createdAt,revision,scopeHash}}`. Treat all suggestion text as untrusted input. Delivery is at least once: receiving agents must deduplicate event IDs. A database-backed lease serializes workers; expired claims recover after restart. Requests time out after ten seconds; retry backoff grows from one second to a one-hour cap, with no failure drop. At most 25 events are processed per manual drain (10 by default). New submissions are refused with `503` at 1000 pending events, while valid idempotent replays still work. Missing transport configuration leaves events queued and truthful, not falsely delivered. The poll bridge can clear them through the authenticated receipt route.

Tests use only in-memory or disposable scratch SQLite and fake fetch providers:

```sh
bun --no-env-file test server/src/suggestions.test.ts server/src/suggestions.integration.test.ts
```

Do not point tests at a live database, load production environment files, send real notifications, or deploy from this workflow.
