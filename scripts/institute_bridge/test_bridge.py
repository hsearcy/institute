"""Original fixed-argv worker regressions, retained across the native adapter replacement."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from test_native import suggestion, digest, key
from institute_bridge.worker import JobRunner, TEST_COMMANDS, atomic_json, identity, prompt, supervise

class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR"))
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.command(["git", "init", "-q", str(self.source)])
        self.command(["git", "-C", str(self.source), "config", "user.email", "test@invalid"])
        self.command(["git", "-C", str(self.source), "config", "user.name", "Test"])
        (self.source / "app.txt").write_text("base\n")
        self.command(["git", "-C", str(self.source), "add", "app.txt"])
        self.command(["git", "-C", str(self.source), "commit", "-qm", "base"])
        self.s = suggestion()
        self.s.update(status="approved", approvedRevision=1, approvedScopeHash=self.s["scopeHash"])
        self.runner = JobRunner(self.root / "jobs", self.source)
        self.directory = self.runner.directory(key(self.s))
        self.directory.mkdir(parents=True)
        self.manifest = self.directory / "manifest.json"
        atomic_json(self.manifest, {"key": key(self.s), "suggestion": self.s, "source": str(self.source)})
        self.job = {"key": key(self.s)}

    def tearDown(self):
        self.temp.cleanup()

    def command(self, argv):
        return subprocess.run(argv, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def test_real_fixed_argv_worker_and_receipt_verification_without_model(self):
        # Real git clone and commits; fake ONLY external bun/Hermes executables.
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        (bin_dir / "bun").write_text("#!/usr/bin/env python3\nprint('fixed verification ran')\n")
        (bin_dir / "hermes").write_text(
            "#!/usr/bin/env python3\nimport os,subprocess\nfrom pathlib import Path\n"
            "assert os.environ['HERMES_DISABLE_LAZY_INSTALLS']=='1'\n"
            "assert 'INSTITUTE_SUGGESTIONS_ADMIN_TOKEN' not in os.environ\n"
            "assert 'DISCORD_BOT_TOKEN' not in os.environ\n"
            "Path('app.txt').write_text('approved change\\n')\n"
            "subprocess.run(['git','add','app.txt'],check=True)\n"
            "subprocess.run(['git','-c','user.name=Test','-c','user.email=test@invalid','commit','-qm','approved'],check=True)\n")
        for f in bin_dir.iterdir():
            f.chmod(0o700)
        before = (self.source / "app.txt").read_bytes()
        with patch.dict(os.environ, {"PATH": str(bin_dir) + os.pathsep + os.environ["PATH"],
                                    "INSTITUTE_SUGGESTIONS_ADMIN_TOKEN": "fake-secret", "DISCORD_BOT_TOKEN": "fake-secret"}):
            self.assertEqual(supervise(self.manifest), 0)
        self.assertEqual((self.source / "app.txt").read_bytes(), before)
        self.assertEqual(self.runner.observe(self.job)[0], "verified")
        (self.directory / "test-0.log").write_text("tampered")
        self.assertEqual(self.runner.observe(self.job)[0], "unknown")
        with self.assertRaises(RuntimeError):
            supervise(self.manifest)

    def test_zero_exit_without_commit_is_failure(self):
        def fake_run(argv, cwd, env, log, timeout):
            if argv[0] == "git":
                self.command(argv)
            Path(log).write_text("exit zero\n")
            return {"argv": argv, "exit": 0, "log": Path(log).name, "sha256": digest("exit zero\n")}
        with patch("institute_bridge.worker.run", side_effect=fake_run):
            self.assertEqual(supervise(self.manifest), 1)
        self.assertEqual(self.runner.observe(self.job)[0], "failed")
        receipt = json.loads((self.directory / "receipt.json").read_text())
        self.assertIn("new commit", receipt["error"])

    def test_missing_and_dead_pid_receipts_are_unknown(self):
        self.assertEqual(self.runner.observe(self.job)[0], "unknown")
        atomic_json(self.directory / "receipt.json", {"key": key(self.s), "state": "running",
                    "identity": {"pid": os.getpid(), "start": "wrong", "boot": "wrong"}})
        self.assertEqual(self.runner.observe(self.job)[0], "unknown")
        atomic_json(self.directory / "receipt.json", {"key": key(self.s), "state": "running", "identity": identity(os.getpid())})
        self.assertEqual(self.runner.observe(self.job)[0], "running")

    def test_prompt_denies_deployment_and_preserves_original_data(self):
        p = prompt(self.s)
        self.assertIn("Houston alone deploys", p)
        self.assertIn("Do not pull, push, merge, deploy", p)
        self.assertIn("Do not add dashes", p)
        parsed = json.loads(p.split("APPROVED_SCOPE_JSON\n")[1])
        self.assertEqual(parsed["approvedScope"], self.s["proposal"])
