# Institute parent review in Hermes / Herald

Source only, disabled by default. This **replaces** the former messaging adapter.
No additional messaging account, bot token, callback listener, webhook, or model
approval tool is used. This task does not install the plugin, enable it, restart
anything, notify a real parent, write the live API, or launch a real model worker.
**Houston alone deploys Institute.**

## Parent experience

After separately authorized installation, open **Institute Review** from the native
slash-command picker (`/institute-review`) in a dedicated Hermes/Herald parent
conversation. Its first native form asks whether to enroll that conversation. A
cancel, timeout or unsupported surface does not enroll it. Enrollment persists
across plugin restarts and never silently moves to another conversation.

Open the same menu action again to review requests. One pending request opens
its exact-scope form directly; several requests first open a native request picker.
The picker exposes at most 20 locally pending requests per invocation. No request
IDs or chat routing syntax are required. Ordinary chat, including **yes**, does
not approve anything. Native forms are a supported-runtime limitation, not an
ordinary-chat approval parser.

Each form shows the complete original child wording and exact proposed scope as
JSON data, revision and UTF-8 SHA-256. Original content is stored unchanged, not
rewritten by a model. Embedded instructions in that data have no authority.
Choices are **Approve exact revision**, **Decline**, **Revise scope**, and **Not
yet**. Revise scope explains how to supply a replacement; it does not pretend to
open an unsupported free-text editor or change anything itself.

For a replacement scope, the command's argument field accepts
`revise <exact replacement scope>`. Select the request if needed, then confirm the
replacement text/hash in a separate native form. The plugin preserves the exact
argument substring received from the runtime after `revise `; the host/client may
already have parsed the command before invoking the plugin. Review the displayed
text rather than assuming keystroke-level whitespace preservation. A replacement
is **not build approval**: reopen Institute Review and approve the new revision.
No model generates or interprets replacement text. Limits are 4000 characters for
request/scope text, matching the backend.

## Permission boundary

Only a local (`platform=local`) native command in the durably enrolled session ID
**and** session key, under the default Hermes home, can open a decision form.
Other conversations (including hidden child sessions), messaging surfaces,
webhooks and named profiles are refused. Default-home comparisons resolve
symlinks. There is no rebind/reset convenience command; changing the enrolled
parent requires an authorized operator to reconcile existing state first.

The runtime's sync `ctx.register_command` dispatch binds `ctx.ask_choice` to its
server-owned clarify request. The gateway checks attached-viewer/session authority
when accepting `clarify.lock`. This authenticates an attached Hermes/Herald viewer,
**not a biological human**. An API caller holding the same connection credentials
and attached session authority can also answer. Anyone with host-user code
execution or the trusted backend admin token already has broader authority; this
plugin is not a sandbox against them.

After a known native choice, the adapter allocates a unique `native-choice:<uuid>`
consent ID. It stores the exact choice label, enrolled session ID/key/platform,
review key and optional raw replacement before attempting a backend decision.
The ID is a local consent artifact, **not a fabricated platform message ID**, and
the label is **not claimed to be a verbatim human chat message**. These populate
the existing backend `parentMessageId` / `parentMessageText` provenance fields.
The server-side actor is fixed to `hermes:parent`; no model/user-supplied actor is
accepted. Ordinary messages, injected text and webhook payloads have no approval
entrypoint. No `register_tool`, inbound-consumption hook, `current_turn_origin` or
`register_webhook_admission` is needed or registered.

## Notifications: accepted is not delivered

* One bounded `status=sent` API page is polled per tick, with pagination continuing
  on later ticks. Reviews and outbox intents persist in private SQLite.
* Background delivery uses supported `ctx.inject_message(..., session_key=...)`
  with the plugin's explicit `allow_gateway_injection: true` permission. Its
  owned local-gateway FIFO is an **informational intake**, potentially creating a
  normal agent turn. The injected notice is static JSON plus a stable marker;
  raw child text, scope, approval values and worker output are never injected.
  Intake grants no approval or build authority.
* `True` from injection means **accepted**, not displayed or delivered. The local
  outbox remains `queued`, and the child's backend notification remains pending.
  Explicit FIFO rejection is retried on later bounded ticks. Accepted or unknown
  injection windows are never automatically replayed, including after restart.
* The durable pending notice remains available when the source closes. Keep the
  enrolled parent conversation open/available for native intake; after reopening,
  select Institute Review to publish/review retained notifications. There is no
  claim of verified Herald phone push or background OS notification delivery.
* Background code never reuses stale command contextvars or calls `post_message`
  without an active command. On opening Institute Review, up to five pending
  notifications are published through **that command's** `ctx.post_message`.
  A selected review's notification is also checked before opening its form.
* Only the native handle's exact `{ok:true, delivered:true, message_id}` publication
  result counts as delivery to an attached viewer. Its content/session/result and
  the outbox transition are persisted atomically and read back. This is the
  runtime's authoritative native publication receipt, not a UI read/human-seen
  acknowledgement. `delivered:false` records no delivery and can be retried when
  the command is opened again. Unknown publication outcomes are held, not resent.
* Only after that receipt does the bridge acknowledge the exact backend event ID
  and payload hash with `{channelId: enrolled_session_key, messageId, messageText}`.
  It reads the backend receipt back before marking local acknowledgement complete.
  FIFO acceptance, a model reply, or a form decision alone cannot clear notification
  pending. Notification delivery and approval are independent transitions.

## Durability and isolated builds

Captured choices whose read-only scope lookup failed are retried in rotating
batches of ten. Their enrolled identity, original review reference, complete
original wording, revision/hash and current remote status are revalidated. A stale
form never targets a newer review. Only a `captured` row with no write payload can
enter the first write window. The exact decision payload and `pending` state are
committed **before** PATCH; unknown writes are reconciled against exact audit and
never replayed. Audit must preserve actor, action, scope, note and native consent.

Only an exact committed approval creates a stable suggestion/revision/hash job.
A preclaim GET failure remains `approved` and retryable; the `claiming` state is
persisted immediately before the claim PATCH. That claim must be read back before
launch. A launch reservation is persisted before subprocess creation. Unknown
claim/launch windows, missing or corrupt receipts, PID reuse/reboot, and disappeared
workers block later launches without automatic duplicate attempts.

`worker.py` is retained: one fixed-argv supervisor, separate
`git clone --no-hardlinks`, disposable DB/scratch, no live source metadata writes,
`HERMES_DISABLE_LAZY_INSTALLS=1`, and removal of inherited Institute admin,
legacy messaging and webhook credentials from the agent environment. It requires
a new clean commit with valid ancestry and independently runs fixed tests and the
web build, verifies log digests, and rechecks the committed artifact. Exit zero
alone is insufficient. `ready` means **prepared for Houston's review, not live**.
No pull, push, merge, deploy, service restart or data reset is performed.

The controller owns one thread/async loop and a nonblocking process singleton
lock. SQLite stays on that thread; synchronous native forms stay on the gateway's
command executor with fresh authenticated context. Unload stops the controller;
it does not kill an already-launched worker. Worker identity/receipts are checked
after restart. Private ledger/logs/child content remain under
`get_hermes_home()/plugin_data/institute-bridge/` (directory 0700, ledger 0600).
A nonempty old adapter ledger is refused, **not automatically migrated or cleared**.
Operator reconciliation is required for legacy or unknown state.

Operational isolation is not OS/credential isolation: the coding agent runs as
the host user and can load its regular Hermes config. Review approved code and
repository test scripts before activation; disposable `DB_PATH` alone cannot make
arbitrary application test code safe.

## Operator activation (not performed)

Only after separate installation/maintenance authorization, copy
`__init__.py`, `bridge.py`, `worker.py`, `plugin.yaml` and this README into the
**default profile's discovered** `plugins/institute-bridge/` directory. Preserve
all unrelated configuration, connections, profiles and active work. Backend and
gateway private environments need the same `INSTITUTE_SUGGESTIONS_ADMIN_TOKEN`;
the backend parent actor allowlist must include `hermes:parent`. Never put this
secret in source, browser settings, prompts or process arguments.

Merge the plugin entry into existing configuration, do not replace the section:

```yaml
plugins:
  entries:
    institute-bridge:
      enabled: true
      allow_gateway_injection: true
      settings:
        enabled: true
        api_url: http://100.107.237.88:5002/rpg/suggestions/internal
        source_repo: /home/ares/apps/institute
        poll_seconds: 30
```

The inner `settings.enabled` must be boolean true; otherwise registration is
inert. Polling is bounded to 15–300 seconds. The HTTP adapter rejects redirects,
proxy inheritance and oversized responses, with an eight-second timeout. The
source repository is read only, and must contain a reviewed committed baseline;
uncommitted development files are not cloned. Python, Git, Bun and Hermes are
required for workers. A separately reviewed source repository can be selected.
Any runtime restart needs its own authorization. First exercise a deliberately
created disposable request with Houston, using Decline before separately testing
Approve. Do not delete or repurpose live learning/progress/money records.

## Verification without installation

From the repository root, developer checks are:

```sh
HERMES_DISABLE_LAZY_INSTALLS=1 python -W error::ResourceWarning -m unittest discover -s scripts/institute_bridge -p 'test_*.py' -v
HERMES_DISABLE_LAZY_INSTALLS=1 hermes plugins doctor "$PWD/scripts/institute_bridge" --ci
```

The stdlib suite uses a synthetic native chooser, actual private controller
thread/SQLite state and actual Git clones/commits; it fakes external agent/Bun
worker commands, never human identity. The backend contract uses the real Hono
routes with `bun:sqlite :memory:` and a random loopback port (requires installed
Bun/repository dependencies). No suite contacts the private live API or requires
a Discord SDK. Plugin doctor validates registration only, not live delivery.

`native_gateway_proof.py --hermes-source <runtime checkout>` is the opt-in thin
vertical proof against the **actual** installed gateway: copied source plugin,
disposable home, native WebSocket viewer, real clarify/post-message/FIFO APIs,
real in-memory backend, and an explicitly fake worker boundary only in the copied
test plugin. It needs the runtime's test dependencies (including pytest), writes
only runtime `TMPDIR`, and reports synthetic viewer/no actual worker/no live
changes. Do not run it against an installed profile. Proven against
`/home/ares/migration/vps-ares/hermes-runtime`: separate hidden conversation and
unattached viewer refused, intake observed without approval/ack, stale form
refused, exact native consent and delivery receipts recorded, expired replay
refused, and exactly one fixture launch after verified approval. This proves
native mechanics, **not a real human approval or production rollout**.
