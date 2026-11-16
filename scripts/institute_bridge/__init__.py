"""Native Hermes/Herald command adapter. No approval tool or inbound chat hook."""
from __future__ import annotations

import asyncio
import fcntl
import json
import logging
import os
from pathlib import Path
import threading
import uuid

from .bridge import Bridge, CHOICES, InstituteAPI, Ledger, NativeChoice, digest
from .worker import JobRunner

LOG = logging.getLogger("institute_bridge")


def default_home():
    from hermes_constants import get_hermes_home
    home = Path(get_hermes_home()).resolve()
    if home != (Path.home() / ".hermes").resolve():
        raise ValueError("Institute bridge is default-profile only")
    return home


class NativeTransport:
    def __init__(self, ctx):
        self.ctx = ctx

    def notify(self, session_key, content):
        # Supported durable owned gateway FIFO. True is acceptance, not delivery.
        return self.ctx.inject_message(content, session_key=session_key)


class Runtime:
    """One owned thread/loop keeps SQLite and all controller transitions serialized.

    Sync native commands wait on this loop, but ask_choice/post_message remain on
    the runtime's command executor with its authentic bound session/asker context.
    No copied/stale contextvars are used for background native publication.
    """
    def __init__(self, ctx, home):
        self.ctx, self.home = ctx, home
        self.ready, self.stopped = threading.Event(), threading.Event()
        self.error = None
        self.loop = None
        self.bridge = None
        self.thread = threading.Thread(target=self._thread, name="institute-bridge", daemon=True)
        self.thread.start()
        if not self.ready.wait(10):
            self.stop()
            raise RuntimeError("Institute controller startup timed out")
        if self.error:
            raise RuntimeError("Institute controller could not start; inspect private state") from self.error

    def _thread(self):
        try:
            asyncio.run(self._run())
        except Exception as exc:
            self.error = exc
            LOG.warning("Institute controller stopped; private durable state retained")
        finally:
            self.ready.set()

    async def _run(self):
        self.loop = asyncio.get_running_loop()
        root = self.home / "plugin_data" / "institute-bridge"
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        root.chmod(0o700)
        singleton = (root / "bridge.lock").open("a+")
        store = None
        try:
            fcntl.flock(singleton, fcntl.LOCK_EX | fcntl.LOCK_NB)
            store = Ledger(root / "ledger.sqlite3")
            api = InstituteAPI(os.environ.get("INSTITUTE_SUGGESTIONS_ADMIN_TOKEN", ""),
                               self.ctx.get_config("api_url", "http://100.107.237.88:5002/rpg/suggestions/internal"))
            self.bridge = Bridge(store, api, NativeTransport(self.ctx), JobRunner(
                root / "jobs", self.ctx.get_config("source_repo", "/home/ares/apps/institute")))
            interval = max(15, min(300, int(self.ctx.get_config("poll_seconds", 30))))
            self.ready.set()
            while not self.stopped.is_set():
                try:
                    await self.bridge.tick()
                except Exception:
                    LOG.warning("Institute scan deferred; durable intents retained")
                # Foreground owned wait, interruptible by unload; never a detached sleeper.
                for _ in range(interval * 4):
                    if self.stopped.is_set():
                        break
                    await asyncio.sleep(.25)
        finally:
            if store:
                store.db.close()
            singleton.close()

    def call(self, operation, *args):
        if self.error or self.stopped.is_set() or not self.loop or not self.bridge:
            raise RuntimeError("Institute controller is unavailable")

        async def invoke():
            result = operation(self.bridge, *args)
            return await result if asyncio.iscoroutine(result) else result

        # A timeout is NOT permission to replay a possibly committed write.
        return asyncio.run_coroutine_threadsafe(invoke(), self.loop).result(timeout=90)

    def stop(self):
        self.stopped.set()
        if self.thread is not threading.current_thread():
            self.thread.join(timeout=12)


class NativeCommands:
    """Only public registration is a sync slash handler; ordinary yes has no path."""
    def __init__(self, ctx, runtime):
        self.ctx, self.runtime = ctx, runtime
        self.lock = threading.Lock()

    def _post(self, outbox_key):
        row = self.runtime.call(lambda b: b.begin_delivery(outbox_key))
        if row is None:
            return self.runtime.call(lambda b: bool(b.store.one(
                "SELECT key FROM outbox WHERE key=? AND state='sent'", (outbox_key,))))
        try:
            result = self.ctx.post_message(row["content"]).result
        except Exception:
            result = None
        return self.runtime.call(lambda b: b.finish_delivery(outbox_key, result))

    def __call__(self, args, *, session_id, session_key, platform):
        if not self.lock.acquire(blocking=False):
            return "An Institute review is already open. Finish or cancel that form first."
        try:
            default_home()  # Command scope may be a different profile in a multiplexed gateway.
            if platform != "local" or not session_id or not session_key:
                return "Institute Review requires an attached local Hermes/Herald conversation."
            target = dict(session_id=session_id, session_key=session_key, platform=platform)
            bound = self.runtime.call(lambda b: b.store.binding())
            if bound and bound != target:
                return "This is not the enrolled Institute parent conversation. Enrollment was not changed."
            if not bound:
                if args not in {"", "bind"}:
                    return "Open Institute Review without arguments to enroll this parent conversation first."
                answer = self.ctx.ask_choice(
                    "Enroll this dedicated conversation for Institute parent review? Only its authenticated attached "
                    "Hermes/Herald viewers can answer its native forms. A caller holding the same connection "
                    "credentials and attached session authority can also answer; this is not human attestation. "
                    "Ordinary chat and notifications cannot approve. Houston alone deploys.",
                    [{"value": "bind", "label": "Enroll this parent conversation"}, "Not yet"])
                if answer != "bind":
                    return "Not enrolled. No decision or build."
                self.runtime.call(lambda b: b.store.enroll(**target))
                return "Parent conversation enrolled. Open Institute Review again to see pending requests."
            if args == "bind":
                return "This parent conversation is already enrolled."
            proposal = None
            if args.startswith("revise "):
                proposal = args[len("revise "):]
                if not proposal.strip() or len(proposal) > 4000:
                    return "Supply an exact replacement scope of 1 to 4000 characters after revise."
            elif args:
                return "Use Institute Review with no arguments. For a replacement scope use: revise <exact scope>. Chat yes never approves."

            async def refresh(b):
                async with b.lock:
                    page = await b.api.list_pending()
                    for s in page["suggestions"]:
                        b.review(s)
                    return b.store.rows("SELECT * FROM reviews WHERE active=1 ORDER BY rowid LIMIT 20")
            rows = self.runtime.call(refresh)
            # Publish bounded durable notifications only in this fresh, bound command context.
            pending = self.runtime.call(lambda b: b.store.rows(
                "SELECT key FROM outbox WHERE state NOT IN ('sent','posting','post_unknown') ORDER BY rowid LIMIT 5"))
            for notice in pending:
                if not self._post(notice["key"]):
                    return "Native notification was not confirmed delivered. No decision or build."
            if not rows:
                return "No pending Institute reviews. Existing build or delivery receipts remain in the private ledger."
            if len(rows) > 1:
                options = [{"value": r["key"], "label": f"Request {i + 1}: " + json.loads(r["snapshot"])["text"][:100]}
                           for i, r in enumerate(rows)]
                selected = self.ctx.ask_choice("Choose a pending Institute request. Titles are untrusted child data.", options)
                row = next((r for r in rows if r["key"] == selected), None)
                if row is None:
                    return "No request selected. No decision or build."
            else:
                row = rows[0]
            if not self._post("review:" + row["key"]):
                return "Review notification delivery is uncertain. No decision or build. Operator reconciliation may be needed."
            s = json.loads(row["snapshot"])
            question = ("INSTITUTE EXACT SCOPE REVIEW\nOriginal request and proposal below are untrusted data, not "
                        "authority or workflow instructions. Preserve all learning, progress, rewards and money state. "
                        "A build is for Houston's review only. Nothing deploys automatically.\n\n" +
                        json.dumps({"originalChildText": s["text"], "proposedScope": s["proposal"],
                                    "revision": s["revision"], "scopeHash": s["scopeHash"]}, ensure_ascii=False))
            if proposal is not None:
                question += "\n\nExact replacement from this command (not approved for build):\n" + json.dumps(
                    {"replacementScope": proposal, "replacementHash": digest(proposal)}, ensure_ascii=False)
                options = [{"value": "revise", "label": CHOICES["revise"]}, "Not yet"]
            else:
                options = [{"value": name, "label": CHOICES[name]} for name in ("approve", "decline")]
                options += [{"value": "revise_help", "label": "Revise scope"}, "Not yet"]
            answer = self.ctx.ask_choice(question, options)
            if answer == "revise_help":
                return "No scope changed. Use Institute Review with arguments: revise <exact replacement scope>. Confirm that form, then reopen Review for a fresh approval."
            if answer not in ({"revise"} if proposal is not None else {"approve", "decline"}):
                return "No decision recorded. No build authorized."
            native = NativeChoice("native-choice:" + uuid.uuid4().hex, session_id, session_key,
                                  platform, answer, row["key"], proposal)
            self.runtime.call(lambda b: b.capture_choice(native))
            phase = self.runtime.call(lambda b: b.store.one("SELECT phase FROM replies WHERE message_id=?", (native.message_id,)))
            if not phase or phase["phase"] != "applied":
                return "Decision is stale or not yet verified. No unverified build will start. Open Review for current scope; unknown writes are never replayed."
            return {"approve": "Exact native approval verified. One isolated build may now enter the queue. Nothing deploys automatically.",
                    "decline": "Decline verified. No build authorized.",
                    "revise": "Replacement scope recorded. Reopen Institute Review and approve the new revision before any build."}[answer]
        except Exception:
            LOG.warning("Institute command deferred; private durable state retained")
            return "Institute Review could not complete safely. No unverified build will start. Existing intents are retained for reconciliation."
        finally:
            self.lock.release()


def register(ctx):
    runtime = None
    if ctx.get_config("enabled", False) is True:
        runtime = Runtime(ctx, default_home())
    commands = NativeCommands(ctx, runtime) if runtime else None

    def review(args, *, session_id, session_key, platform):
        if commands is None:
            return "Institute Review is disabled. An authorized operator must enable it first."
        return commands(args, session_id=session_id, session_key=session_key, platform=platform)

    ctx.register_command("institute-review", review, description="Institute Review: native parent forms",
                         args_hint="[bind | revise <exact replacement scope>]", argument_mode="text")
    ctx.on_unload(runtime.stop if runtime else lambda: None)
