"""Opt-in real disposable gateway/WS + Bun contract proof (synthetic viewer only).

No installed plugins, live state, real model, or actual coding worker are used.
Run as a script with the installed Hermes source checkout argument.
"""
from contextlib import closing
from pathlib import Path
import argparse
import asyncio
import json
import os
import select
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import threading
from urllib.request import Request, urlopen
import uuid


def main(source):
    root = Path(source).resolve()
    here = Path(__file__).resolve().parent
    base = Path(tempfile.mkdtemp(prefix="institute-native-proof-", dir=os.environ["TMPDIR"])).resolve()
    home, user = base / "state", base / "user"
    home.mkdir(mode=0o700)
    user.mkdir()
    (user / ".hermes").symlink_to(home, target_is_directory=True)
    os.environ.update(HERMES_HOME=str(home), HOME=str(user), HERMES_DISABLE_LAZY_INSTALLS="1", PYTHONDONTWRITEBYTECODE="1")
    sys.path.insert(0, str(root))
    from tests.gateway.fixtures.local_recovery_probe import daemon, websocket, rpc, child_env, Model
    from http.server import ThreadingHTTPServer

    backend = subprocess.Popen(["bun", "--no-env-file", str(here / "backend_fixture.ts")], cwd=here.parents[1],
        env=dict(os.environ, NODE_ENV="test", DB_PATH=":memory:"), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    peer = None
    thread = None
    try:
        assert select.select([backend.stdout], [], [], 10)[0], "Bun fixture readiness timeout"
        port = backend.stdout.readline().strip()
        assert port.isdigit(), "Bun fixture failed"
        api_url = "http://127.0.0.1:" + port + "/rpg/suggestions"
        def request(suffix="", payload=None, method="GET", trusted=True):
            headers = {"Content-Type": "application/json"}
            if trusted:
                headers["Authorization"] = "Bearer bridge-test-only"
            req = Request(api_url + suffix, data=json.dumps(payload).encode() if payload is not None else None,
                          method=method, headers=headers)
            with urlopen(req, timeout=8) as response:
                return json.load(response)
        submitted = request(payload={"profileId": "native-proof", "requestId": str(uuid.uuid4()),
                                     "text": "Add a fixture bird. Preserve all progress. Do not deploy."}, method="POST", trusted=False)
        sid = submitted["suggestion"]["id"]
        package = home / "plugins" / "institute-bridge"
        package.mkdir(parents=True)
        for name in ("__init__.py", "bridge.py", "worker.py", "plugin.yaml"):
            shutil.copyfile(here / name, package / name)
        # ONLY in this disposable copied plugin: observe a fake launch, never run an agent.
        with (package / "__init__.py").open("a") as out:
            out.write('''

class FixtureJobs:
    def __init__(self, root, source): self.root = Path(root)
    def directory(self, key): return self.root / digest(key)
    def launch(self, job, directory):
        p = self.root.parent / "fixture-launches.json"
        old = json.loads(p.read_text()) if p.exists() else []
        p.write_text(json.dumps(old + [job["key"]]))
    def observe(self, job): return "running", "Synthetic worker boundary, no process launched"
JobRunner = FixtureJobs
''')
        peer = ThreadingHTTPServer(("127.0.0.1", 0), Model)
        peer.requests = []
        peer.blocked, peer.release = threading.Event(), threading.Event()
        peer.release.set()
        thread = threading.Thread(target=peer.serve_forever, daemon=True)
        thread.start()
        model_url = f"http://127.0.0.1:{peer.server_port}/v1"
        (home / "config.yaml").write_text(json.dumps({
            "gateway": {"multiplex_profiles": False}, "clarify": {"timeout": 15},
            "model": {"provider": "custom", "default": "fixture", "base_url": model_url},
            "approvals": {"mode": "off"}, "auxiliary": {"title_generation": {"enabled": False}},
            "platform_toolsets": {"cli": []},
            "plugins": {"enabled": ["institute-bridge"], "entries": {"institute-bridge": {
                "allow_gateway_injection": True, "settings": {"enabled": True,
                "api_url": api_url + "/internal", "source_repo": str(base / "unused-source"), "poll_seconds": 15}}}}}))
        env = child_env()
        env.update(HOME=str(user), USERPROFILE=str(user), HERMES_HOME=str(home), PYTHONPATH=str(root),
                   HERMES_DISABLE_LAZY_INSTALLS="1", PYTHONDONTWRITEBYTECODE="1",
                   TMPDIR=os.environ["TMPDIR"], INSTITUTE_SUGGESTIONS_ADMIN_TOKEN="bridge-test-only",
                   OPENAI_API_KEY="loopback-only", OPENAI_BASE_URL=model_url, PYTHONUNBUFFERED="1")
        results = {}
        ledger = home / "plugin_data" / "institute-bridge" / "ledger.sqlite3"
        def read(sql):
            with closing(sqlite3.connect(f"file:{ledger}?mode=ro", uri=True)) as db:
                db.row_factory = sqlite3.Row
                return [dict(r) for r in db.execute(sql)]
        async def exercise(desc):
            async with websocket(home, desc) as ws, websocket(home, desc) as outsider:
                created = await rpc(ws, "session.create", request_id="parent", source="gui", toolsets=[], cwd=str(base))
                parent = created["result"]["session_id"]
                notices, shown_replacements = [], []
                async def command(answer, args="", *, attack=False, mutate=False):
                    await ws.send(json.dumps({"jsonrpc": "2.0", "id": "review", "method": "slash.exec", "params": {
                        "session_id": parent, "command": "institute-review" + (" " + args if args else "")}}))
                    rid = None
                    async with asyncio.timeout(40):
                        while True:
                            f = json.loads(await ws.recv())
                            if f.get("params", {}).get("type") == "notification.show":
                                notices.append(f)
                            if f.get("method") == "clarify":
                                rid = f["id"]
                                q = f["params"]["questions"][0]
                                replacement_marker = "\n\nExact replacement from this command (not approved for build):\n"
                                if replacement_marker in q["question"]:
                                    shown_replacements.append(json.loads(q["question"].split(replacement_marker, 1)[1]))
                                if attack:
                                    denied = await rpc(outsider, "clarify.lock", request_id=rid, question_id="q0", answer=answer)
                                    assert denied.get("result") == {"status": "expired"}, denied
                                    assert not read("SELECT * FROM replies")
                                    results["unattached_viewer_refused"] = True
                                if mutate:
                                    current = request("/internal/" + sid)["suggestion"]
                                    request("/internal/" + sid, {"actor": "hermes:parent", "action": "revise",
                                        "revision": current["revision"], "scopeHash": current["scopeHash"],
                                        "parentMessageId": "fixture-external:" + uuid.uuid4().hex,
                                        "parentMessageText": "Fixture external mutation",
                                        "parentNote": "Fixture mutation only.", "proposal": "Changed fixture bird scope"}, "PATCH")
                                if "EXACT SCOPE" in q["question"]:
                                    assert "originalChildText" in q["question"] and "scopeHash" in q["question"]
                                await ws.send(json.dumps({"jsonrpc": "2.0", "id": "lock", "method": "clarify.lock", "params": {
                                    "request_id": rid, "question_id": "q0", "answer": answer}}))
                            elif f.get("id") == "review":
                                return rid, f
                _, enrolled = await command("Enroll this parent conversation")
                assert "enrolled" in enrolled.get("result", {}).get("output", ""), enrolled
                binding = read("SELECT * FROM binding")[0]
                assert binding["session_id"] == parent and binding["platform"] == "local", binding
                child = await rpc(ws, "session.create", request_id="hidden-child", source="gui", toolsets=[], cwd=str(base), hidden=True)
                refused = await rpc(ws, "slash.exec", session_id=child["result"]["session_id"], command="institute-review")
                assert "not the enrolled" in refused["result"]["output"], refused
                await rpc(ws, "session.resume", session_id=parent)
                results["different_hidden_session_refused"] = True
                # Background FIFO must actually reach native history, never count as approval/ack.
                async with asyncio.timeout(45):
                    while read("SELECT state FROM outbox")[0]["state"] != "queued":
                        await asyncio.sleep(.25)
                async with asyncio.timeout(45):
                    while True:
                        frame = json.loads(await ws.recv())
                        if frame.get("params", {}).get("type") == "message.complete":
                            history = await rpc(ws, "session.resume", session_id=parent)
                            if "INSTITUTE_INFORMATION_ONLY" in json.dumps(history):
                                break
                assert not read("SELECT * FROM replies") and not read("SELECT * FROM jobs")
                assert request("/internal/" + sid)["suggestion"]["notificationPending"] is True
                results["fifo_intake_observed_not_approval_or_delivery_ack"] = True
                _, stale = await command("Approve exact revision", attack=True, mutate=True)
                assert "stale" in stale["result"]["output"], stale
                assert not read("SELECT * FROM jobs")
                results["stale_scope_refused"] = True
                _, canceled = await command("Not yet")
                assert "No decision" in canceled["result"]["output"], canceled
                assert not read("SELECT * FROM jobs")
                replacement = "  Keep the fixture bird green.\nPreserve all progress.  "
                _, revised = await command("Confirm revised scope", "revise " + replacement)
                assert "new revision" in revised["result"]["output"], revised
                # The host parses slash arguments before the plugin sees them.
                # Consent binds the actual displayed bytes, not a guessed raw keystroke value.
                shown = shown_replacements[-1]
                saved = request("/internal/" + sid)["suggestion"]
                assert saved["proposal"] == shown["replacementScope"]
                assert saved["scopeHash"] == shown["replacementHash"]
                assert not read("SELECT * FROM jobs")
                results["native_raw_replacement_requires_fresh_approval"] = True
                rid, approved = await command("Approve exact revision")
                assert "verified" in approved["result"]["output"], approved
                duplicate = await rpc(ws, "clarify.lock", request_id=rid, question_id="q0", answer="Approve exact revision")
                assert duplicate["result"] == {"status": "expired"}, duplicate
                receipt = request("/internal/" + sid)["suggestion"]["notification"]
                async with asyncio.timeout(35):
                    while not (home / "plugin_data" / "institute-bridge" / "fixture-launches.json").exists():
                        await asyncio.sleep(.25)
                launches = json.loads((home / "plugin_data" / "institute-bridge" / "fixture-launches.json").read_text())
                assert len(launches) == 1, launches
                assert all(json.loads(r["result"])["delivered"] is True for r in read("SELECT * FROM native_receipts"))
                assert notices, "No native notification.show events"
                final = request("/internal/" + sid)
                assert final["suggestion"]["notificationPending"] is False
                assert final["suggestion"]["status"] == "building"
                consent = read("SELECT * FROM replies WHERE phase='applied' AND json_extract(payload,'$.action')='approve'")[0]
                assert json.loads(consent["native"])["session_key"] == binding["session_key"]
                assert json.loads(consent["payload"])["parentMessageText"] == "Approve exact revision"
                results.update(native_notification_events=len(notices), delivered_receipts=len(read("SELECT * FROM native_receipts")),
                               exact_native_consent=True, replay_refused=True, fixture_launches=len(launches), backend_status="building")
        with daemon(root, home, env, barrier=False) as (process, desc):
            asyncio.run(exercise(desc))
            process.send_signal(signal.SIGINT)
            process.wait(timeout=25)
        print(json.dumps({"scratch": str(base), "results": results, "synthetic_authenticated_viewer": True,
                          "actual_worker_launched": False, "live_changes": False}, indent=2))
    finally:
        if peer:
            peer.shutdown()
            peer.server_close()
            thread.join(timeout=5)
        backend.terminate()
        try:
            backend.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend.kill()
            backend.wait(timeout=5)
        backend.stdout.close()
        backend.stderr.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-source", required=True)
    main(parser.parse_args().hermes_source)
