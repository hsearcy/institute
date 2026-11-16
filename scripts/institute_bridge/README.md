# Institute parent review bridge

Source only. Nothing here is installed or enabled by default. No service restart,
real Discord message, live API write, or real model build is part of the test suite.
Only Houston deploys the live Institute site at `ares:5002`.

## What it does

* Registers the supported native `ctx.register_platform_handler("discord", factory)`
  callback and `post_gateway_admission` hook. Uses `ctx.spawn_task` / `ctx.on_unload`
  for polling and cleanup. No adapter monkeypatch, webhook infrastructure,
  `current_turn_origin`, model-facing approval tool, or `register_webhook_admission`.
* Polls one bounded Institute `status=sent` page every 30 seconds, following
  `nextCursor` on later ticks, then starts a new scan. Scanning is read-only.
  Notification acknowledgement and authenticated decisions are explicit separate writes.
* Sends a single review card with an attached `review.txt` containing the complete
  original wording, exact proposed scope, immutable revision and UTF-8 SHA-256.
  The initial proposed scope is the original request, not an invented implementation.
  Card previews escape Markdown and mentions; sends disable all mentions and embeds.
  Original text in the attachment and persisted snapshot is not normalized or altered.
* Accepts parent decisions only from the native SDK message: exact author
  `117470549298380806`, guild `1503780426064597022`, channel `1503780569056809141`,
  with bot/webhook authors rejected. The callback reads the exact native message
  back before recording a decision, since core Discord handling can strip the bot
  mention on the shared SDK object. Whitespace and optional self mentions are
  normalized only for yes/no parsing, never for audit. Gateway consumption binds
  the captured native message ID and exact author/guild/channel, not transformed
  gateway text: core may prepend the replied-to review.txt and its child content.
  Neither the envelope nor attachment content can authorize a decision.
  The outgoing bot must be
  `1503782665847967908`. Thread channels and DMs do not qualify.
* Direct replies bind to the persisted review message. A plain affirmative or
  negative is allowed only when exactly one active review exists, its card has a
  verified send receipt, and no review delivery of any revision is new, in flight
  or unknown. Unsent reviews count too; a lost send response may hide a visible
  second card. Ambiguity requires a direct reply or delivery reconciliation, not
  a guess. Stale explicit replies never fall back to the latest card. Ordinary
  unrelated channel traffic is unchanged.
* Recognizes limited natural affirmatives (`yes`, `yes please`, `go ahead`,
  `sounds good`, `looks good`, `yep`, `sure`, etc.) and negatives. Other text on a
  review reply, including `yes but ...`, creates a new scope consisting of the
  previous reviewed scope plus the parent's exact modification. That new card
  needs a fresh yes. No LLM interprets approval. Long combined scopes require
  a shorter modification or manual review.
* Stores raw native parent message ID, author, guild, channel and exact text in a
  private SQLite ledger before sending any decision. Every backend transition
  includes the original `parentMessageId` and unchanged `parentMessageText`.
  Child-visible notes are short generated sentences without dashes of any kind.
* Launches only after an exact backend approval has been read back in audit and
  committed locally, and after a matching `building` claim is read back. Stable
  suggestion/revision/hash job keys deduplicate builds. One job may build at a time.
* Makes a separate `git clone --no-hardlinks` under plugin data, rather than
  `git worktree add` against the live checkout. Even source Git metadata stays
  untouched. Runs fixed-argv `hermes chat -q ...` there with
  `HERMES_DISABLE_LAZY_INSTALLS=1`, disposable `DB_PATH`, and no inherited
  Institute admin or Discord credentials. Suggestion content is prompt data,
  never shell text or process arguments interpreted by a shell.
* The supervisor requires a new clean commit, verifies ancestry, then independently
  executes fixed tests and the web build. It records the actual argv, exit status,
  and verification log digests. The bridge rechecks the artifact and receipts.
  Exit zero alone is not success. Only after that does it write `ready`, whose
  current backend/UI contract explicitly means **prepared for Dad's review, not
  deployed or live**. Houston gets the commit and private checkout location.
  There is no pull, push, merge, deployment, or service restart action.

## Files

* `__init__.py`: inert registration, SDK transport, native identity capture,
  gateway consume hook, profile guard and lifecycle.
* `bridge.py`: isolated HTTP adapter, durable ledger/outbox, review and job state machines.
* `worker.py`: fixed-argv isolated build supervisor and receipt verification.
* `plugin.yaml`: current native plugin manifest.
* `test_bridge.py`: stdlib unittest tests, fake Discord/API/process boundaries,
  actual Git operations in disposable checkouts.
* `backend_fixture.ts`: optional real Bun/Hono route contract fixture with an
  in-memory database, random loopback port, no app entrypoint or delivery worker.

## Backend contract

This matches `server/src/suggestions.ts` and the main repository README's trusted
internal API, including notification receipts and parent message provenance.
Default base URL:

```
http://100.107.237.88:5002/rpg/suggestions/internal
```

The HTTP adapter refuses redirects and proxy environment inheritance, uses an
8-second timeout, and caps response bodies at 1 MiB. The default address is a
private Tailnet endpoint, not a public HTTP credential destination.

* `GET ?status=sent[&before=...]` returns `{suggestions,nextCursor}`.
* `GET /:id` returns `{suggestion,audit,auditTruncated}`. Scope is
  `{id,text,proposal,revision,scopeHash,status,approvedRevision,approvedScopeHash}`.
  Scope hashes must match exact proposal bytes. Audit must include actor/action,
  revision/hash, parent note and original parent message ID/text.
* `PATCH /:id` sends `{actor:"discord:117470549298380806", parentMessageId,
  parentMessageText, action, revision, scopeHash, parentNote, proposal?}`.
  Only `revise` includes `proposal`. The `building` and `ready` actions carry
  the actual committed approval message, not synthetic parent consent.
* After exact Discord readback, `POST /:id/notification-ack` sends the event ID
  and payload hash from internal detail plus `{channelId,messageId,messageText}`.
  The bridge reads the detail back and verifies the exact receipt before marking
  local acknowledgement complete. It never acknowledges delivery as approval.

Required server environment, configured separately by the authorized operator:

```
INSTITUTE_SUGGESTIONS_ADMIN_TOKEN=<strong server-side secret>
INSTITUTE_SUGGESTIONS_PARENT_ACTORS=discord:117470549298380806
```

The gateway needs the **same** admin token in its private environment. Never put
it in the browser, a `VITE_` variable, a prompt, command-line argument, source
file, or Discord message. The bridge reads it from the environment only.
No new Discord bot token is needed; it uses the existing bot connection.
Webhook variables are unnecessary and should be left unchanged, not repurposed.

## Installation, only after separate authorization

1. Finish and review the Institute backend/frontend work first. Verify internal
   API availability using the approved operator procedure, without touching live
   learning/progress/money state. The source repo used for builds must contain a
   committed, reviewed baseline; uncommitted development files are not cloned.
2. Verify the active default profile is `/home/ares/.hermes` (which may be a
   symlink). Do not copy this into other profiles or change HS Code/VCLab config.
3. Copy the plugin source to the default profile's discovered plugin directory.
   These are **future installation commands**, not commands executed by this task:

   ```sh
   install -d -m 700 /home/ares/.hermes/plugins/institute-bridge
   install -m 600 /home/ares/git/institute-suggestions/scripts/institute_bridge/{__init__.py,bridge.py,worker.py,plugin.yaml,README.md} /home/ares/.hermes/plugins/institute-bridge/
   ```

4. Add only this entry to existing default-profile `config.yaml`, merging rather
   than replacing the existing `plugins` section:

   ```yaml
   plugins:
     entries:
       institute-bridge:
         enabled: true
         settings:
           enabled: true
           api_url: http://100.107.237.88:5002/rpg/suggestions/internal
           source_repo: /home/ares/apps/institute
           poll_seconds: 30
   ```

   The inner `settings.enabled` must be the boolean `true`; absence is inert.
   The source is read only, clones are written only under plugin data. A separate
   reviewed local repository can be selected instead. Keep its path operator-owned.
   The runtime refuses other profiles and a second controller using the same ledger.
5. Supply the admin token privately in the default gateway's existing environment
   mechanism. Keep all existing gateway platforms, routing, allowlists, ports,
   Funnel configuration and unrelated environment/config entries unchanged.
6. Inspect active gateway work before any restart. Only after explicit maintenance
   authorization activate/restart the owning default gateway with
   `HERMES_DISABLE_LAZY_INSTALLS=1`; this document does not authorize that action.
   Settings are read by the factory at wiring time, so an already-wired disabled
   factory requires a new supported wiring/startup boundary.
7. Exercise one deliberately created test suggestion with Houston. Read the complete
   attached scope, reply no first, then test a separately authorized yes flow.
   Confirm the child's notification clears only after a verified Discord receipt.
   Confirm revised scopes demand a fresh yes, and completed builds say review only.
   Delete no live records as a test. Houston decides if/when any artifact is deployed.

The worker host needs Python, Git, Bun and the configured `hermes` executable.
Dependencies are installed in the isolated clone with `bun install --frozen-lockfile`.
It independently runs:

```
bun --no-env-file test --timeout=30000 --path-ignore-patterns='**/web/tests/**' server shared scripts web/unit-tests
bun --no-env-file run --cwd web build
```

Before production activation, audit these repository scripts for disposable-data
safety. The supervisor sets a private disposable `DB_PATH` and scratch directory,
but it cannot make arbitrary application test code safe by itself.

## Durability and honest failure

All state is under the default home's `plugin_data/institute-bridge/`, mode 0700,
with `ledger.sqlite3` mode 0600, singleton lock and `jobs/<stable-hash>/` manifests,
logs, disposable DB and isolated checkout. Keep this private; it includes child
and parent content. No automatic purge is performed; review retention/disk use.

A notification is persisted as `sending` before transport use. After a lost
response, at most 100 recent channel messages are inspected for its stable marker,
and the exact content and attachment are verified. If not found, it stays unknown
and is not resent blindly. New notifications are not starved by unknown old ones.

A native reply captured before a failed read-only scope lookup is recoverable:
up to ten captures are revisited per tick, rotating so unavailable reads do not
starve later captures. Recovery uses only the persisted exact native identity,
message text and original review reference, rechecks bare-reply ambiguity and the
current revision/status, and never retargets a new scope. Only `captured` rows
with a NULL payload can enter this path. Before the first decision write, the
payload and `pending` phase are committed together. A crash in or after that write
window therefore cannot replay the write. Invalid provenance requires a new reply;
stale or newly ambiguous captures also require a fresh decision on a known card.

A read-only preclaim GET leaves a job `approved`; a timeout or restart before any
claim PATCH can therefore retry that GET and revalidate the current approval.
Only immediately before the actual PATCH, under the controller lock, does the
bridge persist `claiming`. From that write boundary onward it checks receipts
without replaying the claim, even if no matching receipt is found.

Decision, build-claim and ready write failures are reconciled by exact backend
history, not replayed with fabricated consent. An unresolved decision never creates
a job. A launch reservation is committed before subprocess creation. Unknown spawn
windows, missing receipts, PID reuse, reboot identity mismatches, vanished workers
and corrupted artifacts hold the queue for operator reconciliation. Never reset
those states to retry without proving what happened and obtaining fresh approval
where needed. Actual worker failures notify Houston and stay out of `ready`.

Workers record Linux boot ID plus PID/start identity. They may survive a gateway
process restart, but a systemd cgroup teardown can terminate them; the next controller
then records uncertainty and never duplicates the launch. No extra daemon is installed.
Disabling the plugin does not terminate an already-launched worker; review its exact
PID/start identity before an authorized operator stop. No automatic cancellation or
hidden recovery/deploy action is performed.

This is **not a security sandbox**. Native plugins and the Hermes coding subprocess
run as the host user. The hard approval gate is deterministic before launching, but
approved code execution and agent scope adherence still need code review. Removing
credentials from the exec environment is hygiene, not secret isolation: Hermes
may reload its normal home configuration, and host-user code can read home files.
A stronger OS boundary would require separately authorized container/credential isolation.
The gateway consume hook is intentionally supported/fail-open, not a global command
firewall. It suppresses only captured native review replies and does not claim to
revoke authority from independent operator conversations or unrelated plugins.

## Verification, no installation required

From `/home/ares/git/institute-suggestions`:

```sh
python -W error::ResourceWarning -m unittest discover -s scripts/institute_bridge -p 'test_*.py' -v
HERMES_DISABLE_LAZY_INSTALLS=1 hermes plugins doctor /home/ares/git/institute-suggestions/scripts/institute_bridge --ci
```

The backend contract test starts only an in-memory fixture bound to a random
loopback port and is skipped if Bun is unavailable. Existing server dependencies
must already be installed. Worker tests use real Git clones/commits but fake only
the external Bun/Hermes executables. They do not pretend to be a real model build.
No tests connect to the configured private live API or Discord, and plugin doctor
uses its own temporary Hermes home. Test scratch uses the runtime `TMPDIR`.

When Hermes Discord core is available, the integration regressions execute its
actual `_handle_message` and `_collect_attachment_media` on a resolved review-card
reply, with only attachment download/cache IO mocked. They verify the real
review.txt envelope is consumed while the original native yes/no remains the sole
decision authority. To require that coverage against an exact read-only core tree:

```sh
HERMES_DISABLE_LAZY_INSTALLS=1 \
INSTITUTE_BRIDGE_REQUIRE_DISCORD_CORE=1 \
INSTITUTE_BRIDGE_HERMES_SOURCE=/home/ares/migration/vps-ares/hermes-runtime \
PYTHONPATH=/home/ares/migration/vps-ares/hermes-runtime \
python -W error::ResourceWarning -m unittest discover -s scripts/institute_bridge -p 'test_*.py' -v
```

Without installed Hermes, these two core-specific tests skip; the independent
native SDK and controller/worker tests still run. The required-core flag makes
missing imports a failure rather than silently losing integration coverage.
