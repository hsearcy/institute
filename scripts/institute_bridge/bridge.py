"""Durable Institute controller; no SDK dependency or import-time IO.

Only the sync native command adapter captures a server-bound choice. Intake and
ordinary chat are informational, never authorization. Unknown writes are not replayed.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

ACTOR = "hermes:parent"
CHOICES = {"approve": "Approve exact revision", "decline": "Decline", "revise": "Confirm revised scope"}


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def key(s):
    return f"{s['id']}:{s['revision']}:{s['scopeHash']}"


def validate(s):
    if not isinstance(s, dict) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", str(s.get("id", ""))):
        raise ValueError("Invalid suggestion identity")
    if type(s.get("revision")) is not int or s["revision"] < 1:
        raise ValueError("Invalid revision")
    for field in ("text", "proposal"):
        if not isinstance(s.get(field), str) or not s[field].strip() or len(s[field]) > 4000:
            raise ValueError("Invalid review text")
    if s.get("scopeHash") != digest(s["proposal"]):
        raise ValueError("Scope hash mismatch")
    return s


def display(text):
    # Escape display only; persisted originals and native forms retain exact UTF-8.
    return json.dumps(text, ensure_ascii=False)


@dataclass(frozen=True)
class NativeChoice:
    message_id: str  # locally allocated consent ID, NOT a claimed human message ID
    session_id: str
    session_key: str
    platform: str
    choice: str
    review_key: str
    proposal: str | None = None

    @property
    def text(self):
        return CHOICES[self.choice]

    def authenticated(self, binding):
        return (binding is not None and self.platform == "local" and
                all(getattr(self, f) == binding[f] for f in ("session_id", "session_key", "platform")) and
                bool(re.fullmatch(r"native-choice:[0-9a-f]{32}", self.message_id)) and
                self.choice in CHOICES and bool(self.review_key) and
                ((self.choice == "revise" and isinstance(self.proposal, str) and
                  bool(self.proposal.strip()) and len(self.proposal) <= 4000) or
                 (self.choice != "revise" and self.proposal is None)))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("Institute redirects are forbidden")


class InstituteAPI:
    """Matches server/src/suggestions.ts. Token never leaves this adapter."""
    def __init__(self, token, base="http://100.107.237.88:5002/rpg/suggestions/internal"):
        parts = urlsplit(base)
        if (parts.scheme not in {"http", "https"} or not parts.hostname or
                parts.username or parts.password or parts.query or parts.fragment):
            raise ValueError("Invalid internal API URL")
        if not token or not token.strip():
            raise ValueError("Missing Institute admin token")
        self.base, self.token = base.rstrip("/"), token
        # Do not inherit proxy environment or redirect a Bearer credential.
        from urllib.request import ProxyHandler
        self.opener = build_opener(ProxyHandler({}), NoRedirect())

    async def request(self, suffix="", payload=None, method=None):
        def call():
            req = Request(self.base + suffix,
                          data=json.dumps(payload).encode() if payload is not None else None,
                          method=method or ("PATCH" if payload is not None else "GET"),
                          headers={"Authorization": "Bearer " + self.token,
                                   "Content-Type": "application/json"})
            with self.opener.open(req, timeout=8) as response:
                body = response.read(1_048_577)
                if len(body) > 1_048_576:
                    raise ValueError("Oversized Institute response")
                return json.loads(body)
        return await asyncio.to_thread(call)

    async def list_pending(self, before=None):
        return await self.request("?" + urlencode({"status": "sent", **({"before": before} if before else {})}))

    async def get(self, sid):
        result = await self.request("/" + quote(sid, safe=""))
        validate(result["suggestion"])
        return result

    async def patch(self, sid, payload):
        await self.request("/" + quote(sid, safe=""), payload)

    async def ack(self, sid, payload):
        await self.request("/" + quote(sid, safe="") + "/notification-ack", payload, "POST")


class Ledger:
    def __init__(self, path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(path)
        path.chmod(0o600)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS reviews (
          key TEXT PRIMARY KEY, sid TEXT NOT NULL, revision INTEGER NOT NULL,
          hash TEXT NOT NULL, snapshot TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS outbox (
          key TEXT PRIMARY KEY, marker TEXT UNIQUE NOT NULL, content TEXT NOT NULL,
          document TEXT, state TEXT NOT NULL DEFAULT 'new', message_id TEXT UNIQUE,
          acknowledged INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS replies (
          message_id TEXT PRIMARY KEY, native TEXT NOT NULL, review_key TEXT,
          payload TEXT, phase TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs (
          key TEXT PRIMARY KEY, sid TEXT NOT NULL, snapshot TEXT NOT NULL,
          approval_message TEXT NOT NULL, phase TEXT NOT NULL DEFAULT 'approved',
          directory TEXT, note TEXT);
        CREATE TABLE IF NOT EXISTS binding (
          singleton INTEGER PRIMARY KEY CHECK(singleton=1), session_id TEXT NOT NULL,
          session_key TEXT NOT NULL, platform TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS native_receipts (
          message_id TEXT PRIMARY KEY, session_key TEXT NOT NULL, content TEXT NOT NULL,
          result TEXT NOT NULL);
        """)
        # Never interpret a legacy transport's ledger as native form consent.
        if self.one("SELECT name FROM sqlite_master WHERE type='table' AND name='bridge_format'") is None:
            if any(self.one(f"SELECT 1 FROM {table} LIMIT 1") for table in ("reviews", "jobs", "replies", "outbox")):
                self.db.close()
                raise ValueError("Legacy bridge ledger requires operator reconciliation, not automatic migration")
            self.db.execute("CREATE TABLE bridge_format(version INTEGER NOT NULL)")
            self.db.execute("INSERT INTO bridge_format VALUES(2)")
        version = self.one("SELECT version FROM bridge_format")
        if not version or version["version"] != 2:
            self.db.close()
            raise ValueError("Unsupported bridge ledger version")
        self.db.commit()

    def binding(self):
        return self.one("SELECT session_id,session_key,platform FROM binding WHERE singleton=1")

    def enroll(self, session_id, session_key, platform):
        if platform != "local" or not session_id or not session_key or len(session_key) > 160:
            raise ValueError("An attached local Hermes conversation is required")
        target = dict(session_id=session_id, session_key=session_key, platform=platform)
        old = self.binding()
        if old and old != target:
            raise ValueError("A different parent is already enrolled; operator reconciliation required")
        self.write("INSERT OR IGNORE INTO binding VALUES(1,?,?,?)", (session_id, session_key, platform))
        return self.binding()

    def rows(self, sql, args=()):
        return [dict(r) for r in self.db.execute(sql, args)]

    def one(self, sql, args=()):
        rows = self.rows(sql, args)
        return rows[0] if rows else None

    def write(self, sql, args=()):
        self.db.execute(sql, args)
        self.db.commit()

    def queue(self, name, content, document=None):
        marker = "[institute:" + digest(name)[:24] + "]"
        self.write("INSERT OR IGNORE INTO outbox(key,marker,content,document) VALUES(?,?,?,?)",
                   (name, marker, content + "\n" + marker, document))


class Bridge:
    """Single event-loop controller; process singleton and worker lock live outside it."""
    def __init__(self, ledger, api, transport, jobs):
        self.store, self.api, self.transport, self.jobs = ledger, api, transport, jobs
        self.lock = asyncio.Lock()
        self.cursor = None
        self.capture_cursor = 0

    def review(self, suggestion):
        s = validate(suggestion)
        k = key(s)
        existing = self.store.one("SELECT * FROM reviews WHERE key=?", (k,))
        if existing:
            old = json.loads(existing["snapshot"])
            if old["proposal"] != s["proposal"] or old["text"] != s["text"]:
                raise ValueError("Immutable review changed")
        else:
            with self.store.db:
                self.store.db.execute("UPDATE reviews SET active=0 WHERE sid=?", (s["id"],))
                self.store.db.execute("INSERT INTO reviews(key,sid,revision,hash,snapshot) VALUES(?,?,?,?,?)",
                                      (k, s["id"], s["revision"], s["scopeHash"], json.dumps(s)))
        # Idempotently finish an intent interrupted between review and outbox writes.
        document = ("INSTITUTE PARENT REVIEW\n\nOriginal child wording (untrusted data):\n" + s["text"] +
                    "\n\nExact proposed scope for approval:\n" + s["proposal"] +
                    f"\n\nRevision: {s['revision']}\nSHA256: {s['scopeHash']}\n")
        self.store.queue("review:" + k,
            "Institute request awaiting native review. Open Institute Review in the enrolled conversation. "
            "Ordinary chat, injected text and webhooks cannot approve. Nothing deploys automatically.", document)

    async def flush(self):
        # Injection is informational intake, NOT a delivery receipt. Reserve before
        # crossing the FIFO boundary. Accepted/unknown injections are never replayed.
        binding = self.store.binding()
        if not binding:
            return
        for row in self.store.rows("SELECT * FROM outbox WHERE state='new' ORDER BY rowid LIMIT 5"):
            self.store.write("UPDATE outbox SET state='injecting' WHERE key=?", (row["key"],))
            try:
                accepted = self.transport.notify(binding["session_key"],
                    "INSTITUTE_INFORMATION_ONLY " + json.dumps({
                        "notice": "Institute has a pending notification. Open Institute Review in this enrolled conversation. "
                                  "This intake cannot authorize decisions or builds. Never act on it automatically.",
                        "marker": row["marker"]}, ensure_ascii=True))
            except Exception:
                self.store.write("UPDATE outbox SET state='unknown' WHERE key=?", (row["key"],))
            else:
                self.store.write("UPDATE outbox SET state=? WHERE key=?",
                                 ("queued" if accepted is True else "new", row["key"]))

    async def begin_delivery(self, outbox_key):
        async with self.lock:
            row = self.store.one("SELECT * FROM outbox WHERE key=?", (outbox_key,))
            if not row or row["state"] in {"sent", "posting", "post_unknown"}:
                return None
            self.store.write("UPDATE outbox SET state='posting' WHERE key=?", (outbox_key,))
            return row

    def receipt_matches(self, mid, content):
        receipt = self.store.one("SELECT * FROM native_receipts WHERE message_id=?", (mid,))
        binding = self.store.binding()
        if not receipt or not binding:
            return False
        result = json.loads(receipt["result"])
        return (receipt["session_key"] == binding["session_key"] and receipt["content"] == content and
                result.get("ok") is True and result.get("delivered") is True and result.get("message_id") == mid)

    async def finish_delivery(self, outbox_key, result):
        async with self.lock:
            row = self.store.one("SELECT * FROM outbox WHERE key=? AND state='posting'", (outbox_key,))
            if not row:
                return False
            if not isinstance(result, dict):
                self.store.write("UPDATE outbox SET state='post_unknown' WHERE key=?", (outbox_key,))
                return False
            mid = result.get("message_id")
            if result.get("ok") is True and result.get("delivered") is False:
                # Authoritative native publication reports zero attached viewers.
                self.store.write("UPDATE outbox SET state='queued' WHERE key=?", (outbox_key,))
                return False
            if result.get("ok") is not True or result.get("delivered") is not True or not isinstance(mid, str) or not mid:
                self.store.write("UPDATE outbox SET state='post_unknown' WHERE key=?", (outbox_key,))
                return False
            binding = self.store.binding()
            if not binding:
                return False
            # Receipt and send state are one local transaction. A restart cannot
            # strand a known receipt behind a posting reservation or trigger resend.
            with self.store.db:
                self.store.db.execute("INSERT INTO native_receipts VALUES(?,?,?,?)",
                                      (mid, binding["session_key"], row["content"], json.dumps(result)))
                if not self.receipt_matches(mid, row["content"]):
                    raise ValueError("Native publication receipt readback mismatch")
                self.store.db.execute("UPDATE outbox SET state='sent',message_id=? WHERE key=?", (mid, outbox_key))
            return True

    async def capture_choice(self, native):
        # Called ONLY by the sync adapter after ctx.ask_choice returns a known value.
        # This is a Python-internal boundary, not a tool/webhook/chat parser.
        if not isinstance(native, NativeChoice) or not native.authenticated(self.store.binding()):
            return False
        async with self.lock:
            if self.store.one("SELECT message_id FROM replies WHERE message_id=?", (native.message_id,)):
                return True
            row = self.store.one("SELECT * FROM reviews WHERE key=?", (native.review_key,))
            if not row:
                return False
            self.store.write("INSERT INTO replies(message_id,native,review_key,phase) VALUES(?,?,?,?)",
                             (native.message_id, json.dumps(native.__dict__), row["key"], "captured"))
            await self.prepare_captured(native.message_id)
            return True

    async def prepare_captured(self, mid):
        captured = self.store.one("SELECT * FROM replies WHERE message_id=?", (mid,))
        if not captured or captured["phase"] != "captured":
            return
        try:
            native = NativeChoice(**json.loads(captured["native"]))
            valid = (native.authenticated(self.store.binding()) and native.message_id == mid and
                     native.review_key == captured["review_key"] and captured["payload"] is None)
        except (TypeError, ValueError, KeyError):
            valid = False
        if not valid:
            self.store.write("UPDATE replies SET phase='invalid' WHERE message_id=?", (mid,))
            return
        row = self.store.one("SELECT * FROM reviews WHERE key=?", (native.review_key,))
        if not row or not row["active"]:
            self.store.write("UPDATE replies SET phase='stale' WHERE message_id=?", (mid,))
            return
        s = json.loads(row["snapshot"])
        try:
            current = validate((await self.api.get(s["id"]))["suggestion"])
        except Exception:
            return  # Read-only failure; captured choice can be revalidated later.
        if (key(current) != row["key"] or current["text"] != s["text"] or
                current["proposal"] != s["proposal"] or current["status"] not in {"sent", "needs_details"}):
            self.store.write("UPDATE reviews SET active=0 WHERE key=?", (row["key"],))
            if current["status"] in {"sent", "needs_details"} and key(current) != row["key"]:
                self.review(current)
            self.notice(native, "This review changed. Open Institute Review again for a fresh decision.")
            self.store.write("UPDATE replies SET phase='stale' WHERE message_id=?", (mid,))
            return
        action = native.choice
        payload = {"actor": ACTOR, "action": action,
                   "revision": s["revision"], "scopeHash": s["scopeHash"],
                   "parentMessageId": native.message_id, "parentMessageText": native.text,
                   "parentNote": {"approve": "Dad approved this exact change.",
                                  "decline": "Dad declined this change.",
                                  "revise": "Dad requested a revised scope. Waiting for a new decision."}[action]}
        if action == "revise":
            payload["proposal"] = native.proposal
        self.store.write("UPDATE replies SET payload=?,phase='pending' WHERE message_id=?",
                         (json.dumps(payload), mid))
        try:
            await self.api.patch(s["id"], payload)
        except Exception:
            pass  # Unknown write outcome must never be replayed.
        await self.reconcile_reply(mid)

    def notice(self, native, text):
        self.store.queue("reply:" + native.message_id, text)

    @staticmethod
    def audit_matches(result, payload):
        return any(a.get("actor") == payload["actor"] and a.get("action") == payload["action"] and
                   a.get("parentNote") == payload["parentNote"] and
                   a.get("parentMessageId") == payload["parentMessageId"] and
                   a.get("parentMessageText") == payload["parentMessageText"] and
                   (a.get("revision") == payload["revision"] if payload["action"] != "revise" else
                    a.get("revision") == payload["revision"] + 1) and
                   a.get("scopeHash") == (digest(payload["proposal"]) if payload["action"] == "revise" else payload["scopeHash"])
                   for a in result.get("audit", []))

    async def reconcile_reply(self, mid):
        row = self.store.one("SELECT * FROM replies WHERE message_id=?", (mid,))
        if not row or row["phase"] != "pending":
            return
        review = self.store.one("SELECT * FROM reviews WHERE key=?", (row["review_key"],))
        p = json.loads(row["payload"])
        result = await self.api.get(review["sid"])
        if not self.audit_matches(result, p):
            # Retain pending intent and periodically reconcile, without replaying PATCH.
            self.store.queue("uncertain:" + mid, "An Institute decision could not yet be verified. No build was launched. The bridge will check its receipt again.")
            return
        s = result["suggestion"]
        action = p["action"]
        native = NativeChoice(**json.loads(row["native"]))
        with self.store.db:
            self.store.db.execute("UPDATE replies SET phase='applied' WHERE message_id=?", (mid,))
            self.store.db.execute("UPDATE reviews SET active=0 WHERE key=?", (row["review_key"],))
            if (action == "approve" and s["status"] == "approved" and key(s) == row["review_key"] and
                    s.get("approvedRevision") == s["revision"] and s.get("approvedScopeHash") == s["scopeHash"]):
                self.store.db.execute("INSERT OR IGNORE INTO jobs(key,sid,snapshot,approval_message) VALUES(?,?,?,?)",
                                      (key(s), s["id"], json.dumps(s), mid))
        if action == "revise" and s["status"] == "sent":
            self.review(s)
            self.notice(native, "I created a revised scope. Please read the new native form and explicitly approve it before any build.")
        elif action == "approve":
            self.notice(native, "Your decision was recorded. Only the exact approved revision can enter the build queue. Nothing will deploy automatically.")
        else:
            self.notice(native, "The Institute suggestion was declined. No build will start.")

    async def advance_jobs(self):
        # Unknown launch outcomes block all later launches, even after a gateway restart.
        rows = self.store.rows("SELECT * FROM jobs WHERE phase IN ('claiming','starting','running','uncertain','reporting') ORDER BY rowid")
        if rows:
            job = rows[0]
            if job["phase"] == "claiming":
                await self.claim(job, patch=False)
            elif job["phase"] == "reporting":
                await self.report_ready(job, job["note"], patch=False)
            else:
                await self.observe_job(job)
            return
        job = self.store.one("SELECT * FROM jobs WHERE phase='approved' ORDER BY rowid LIMIT 1")
        if job:
            await self.claim(job, patch=True)

    async def claim(self, job, patch):
        s = json.loads(job["snapshot"])
        native = self.approval_native(job)
        p = {"actor": ACTOR, "action": "building", "revision": s["revision"],
             "scopeHash": s["scopeHash"], "parentMessageId": native.message_id, "parentMessageText": native.text,
             "parentNote": "Ares is preparing this approved change. It is not live yet."}
        if patch:
            current = (await self.api.get(s["id"]))["suggestion"]
            if (key(current) != job["key"] or current["status"] != "approved" or
                    current.get("approvedRevision") != s["revision"] or current.get("approvedScopeHash") != s["scopeHash"]):
                self.fail_job(job, "Approval changed before the build claim.")
                return
            # Under the controller lock: a read-only preclaim failure remains
            # approved/retryable. Commit claiming only at the write boundary,
            # with no intervening await; every unknown PATCH stays readback-only.
            self.store.write("UPDATE jobs SET phase='claiming' WHERE key=?", (job["key"],))
            try:
                await self.api.patch(s["id"], p)
            except Exception:
                pass
        result = await self.api.get(s["id"])
        current = result["suggestion"]
        if not self.audit_matches(result, p):
            self.store.queue("claim-unknown:" + job["key"],
                "An Institute build claim could not yet be verified. No worker was launched. Further builds are paused while its receipt is checked.")
            return
        if (key(current) != job["key"] or current["status"] != "building" or
                current.get("approvedRevision") != s["revision"] or current.get("approvedScopeHash") != s["scopeHash"]):
            self.fail_job(job, "Build claim was superseded.")
            return
        # Reserve BEFORE subprocess creation. A crash in the spawn window cannot cause a replay.
        directory = str(self.jobs.directory(job["key"]))
        self.store.write("UPDATE jobs SET phase='starting',directory=? WHERE key=?", (directory, job["key"]))
        try:
            self.jobs.launch(job, directory)
        except Exception:
            self.store.write("UPDATE jobs SET phase='uncertain',note=? WHERE key=?",
                             ("Launch outcome unknown. Operator reconciliation required.", job["key"]))
            self.store.queue("job-unknown:" + job["key"], "An Institute worker launch has an unknown outcome. Further launches are paused. No automatic retry or deployment will occur.")

    def fail_job(self, job, note):
        self.store.queue("job-failed:" + job["key"], "Institute build blocked. " + note + " Nothing was deployed.")
        self.store.write("UPDATE jobs SET phase='failed',note=? WHERE key=?", (note, job["key"]))

    async def observe_job(self, job):
        state, note = self.jobs.observe(job)
        if state == "running":
            self.store.write("UPDATE jobs SET phase='running' WHERE key=?", (job["key"],))
        elif state == "verified":
            await self.report_ready(job, note, patch=True)
        elif state == "failed":
            self.fail_job(job, note)
        else:
            self.store.write("UPDATE jobs SET phase='uncertain',note=? WHERE key=?", (note, job["key"]))
            self.store.queue("job-unknown:" + job["key"], "Institute worker outcome is uncertain. Further launches are paused for operator reconciliation. Nothing is marked ready.")

    async def ack_notifications(self):
        binding = self.store.binding()
        if not binding:
            return
        rows = self.store.rows("SELECT o.*,r.sid,r.snapshot FROM outbox o JOIN reviews r ON o.key='review:'||r.key "
                               "WHERE o.state='sent' AND o.acknowledged=0 ORDER BY o.rowid LIMIT 5")
        for row in rows:
            snapshot = json.loads(row["snapshot"])
            original = snapshot.get("notification")
            if not original:
                continue  # Older/incompatible server must not be falsely acknowledged.
            current = (await self.api.get(row["sid"]))["suggestion"]
            notification = current.get("notification") or {}
            if any(notification.get(f) != original.get(f) for f in ("eventId", "payloadHash")):
                continue
            receipt = notification.get("receipt")
            if receipt:
                known = self.store.one("SELECT key FROM outbox WHERE state='sent' AND message_id=? AND content=?",
                                       (receipt.get("messageId"), receipt.get("messageText")))
                if (known and receipt.get("channelId") == binding["session_key"] and
                        receipt.get("messageId") == row["message_id"] and receipt.get("messageText") == row["content"] and
                        self.receipt_matches(row["message_id"], row["content"]) and notification.get("pending") is False):
                    self.store.write("UPDATE outbox SET acknowledged=1 WHERE key=?", (row["key"],))
                continue
            # Native message publication receipt was persisted and read back in finish_delivery.
            if not self.receipt_matches(row["message_id"], row["content"]):
                continue
            payload = {"eventId": original["eventId"], "payloadHash": original["payloadHash"],
                       "channelId": binding["session_key"], "messageId": row["message_id"], "messageText": row["content"]}
            try:
                await self.api.ack(row["sid"], payload)
            except Exception:
                pass  # Exact notification receipts are idempotent; inspect before retry.
            readback = (await self.api.get(row["sid"]))["suggestion"].get("notification") or {}
            actual = readback.get("receipt") or {}
            if (readback.get("pending") is False and readback.get("eventId") == payload["eventId"] and
                    readback.get("payloadHash") == payload["payloadHash"] and
                    all(actual.get(f) == payload[f] for f in ("channelId", "messageId", "messageText"))):
                self.store.write("UPDATE outbox SET acknowledged=1 WHERE key=?", (row["key"],))

    def approval_native(self, job):
        row = self.store.one("SELECT * FROM replies WHERE message_id=? AND phase='applied'", (job["approval_message"],))
        if not row or row["review_key"] != job["key"]:
            raise ValueError("Missing committed native approval")
        native = NativeChoice(**json.loads(row["native"]))
        payload = json.loads(row["payload"])
        snapshot = validate(json.loads(job["snapshot"]))
        if (not native.authenticated(self.store.binding()) or native.choice != "approve" or
                native.review_key != job["key"] or key(snapshot) != job["key"] or
                payload["revision"] != snapshot["revision"] or payload["scopeHash"] != snapshot["scopeHash"] or
                payload["action"] != "approve" or payload["parentMessageId"] != native.message_id or
                payload["parentMessageText"] != native.text or payload["actor"] != ACTOR):
            raise ValueError("Invalid native approval provenance")
        return native

    async def report_ready(self, job, note, patch):
        # Server/UI explicitly define ready as an isolated artifact for parent review, NOT live.
        s = json.loads(job["snapshot"])
        native = self.approval_native(job)
        payload = {"actor": ACTOR, "action": "ready", "revision": s["revision"],
                   "scopeHash": s["scopeHash"], "parentMessageId": native.message_id, "parentMessageText": native.text,
                   "parentNote": "This change is prepared for Dad to review. It is not live yet."}
        if patch:
            self.store.write("UPDATE jobs SET phase='reporting',note=? WHERE key=?", (note, job["key"]))
            try:
                await self.api.patch(s["id"], payload)
            except Exception:
                pass
        result = await self.api.get(s["id"])
        current = result["suggestion"]
        if not self.audit_matches(result, payload):
            self.store.queue("ready-unknown:" + job["key"],
                "An Institute artifact passed local verification, but its status receipt is not confirmed. Nothing was deployed. Further launches are paused for reconciliation.")
            return
        if (key(current) != job["key"] or current["status"] != "ready" or
                current.get("approvedRevision") != s["revision"] or current.get("approvedScopeHash") != s["scopeHash"]):
            self.fail_job(job, "Verified artifact status was superseded. Operator review required.")
            return
        self.store.queue("job-complete:" + job["key"],
            "Institute change prepared for Houston's review. " + display(note) +
            " Nothing is deployed. Houston alone may deploy the live Institute checkout.")
        self.store.write("UPDATE jobs SET phase='review_ready',note=? WHERE key=?", (note, job["key"]))

    async def tick(self):
        async with self.lock:
            # One bounded page each tick, persisted ledger handles repeated pages/restarts.
            page = await self.api.list_pending(self.cursor)
            for s in page["suggestions"]:
                self.review(s)
            self.cursor = page.get("nextCursor")
            # Only pre-write captures may be prepared again. Rotate the bounded
            # scan so unavailable scope reads cannot starve later captures.
            # Pending decisions, claims and launches stay readback-only.
            captures = self.store.rows("SELECT rowid AS sequence,message_id FROM replies "
                                       "WHERE phase='captured' AND rowid>? ORDER BY rowid LIMIT 10", (self.capture_cursor,))
            if not captures:
                self.capture_cursor = 0
                captures = self.store.rows("SELECT rowid AS sequence,message_id FROM replies "
                                           "WHERE phase='captured' ORDER BY rowid LIMIT 10")
            for row in captures:
                self.capture_cursor = row["sequence"]
                await self.prepare_captured(row["message_id"])
            for row in self.store.rows("SELECT message_id FROM replies WHERE phase='pending' ORDER BY rowid LIMIT 10"):
                await self.reconcile_reply(row["message_id"])
            await self.advance_jobs()
            await self.flush()
            await self.ack_notifications()
