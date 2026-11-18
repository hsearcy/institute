"""CPU-only supervisor regressions; this file also serves as its fixture child.

The fixture imports adapter.create_app, never bark_runtime or any model library.
It exercises the real adapter's PCM, finalization deadline, and uncancellable
thread accounting through real loopback WebSockets and owned subprocesses.
"""
import asyncio
import inspect
import os
from pathlib import Path
import signal
import socket
import sys
import time
import unittest
import uuid
from unittest import mock

from aiohttp import ClientSession, WSServerHandshakeError, web
from aiohttp.test_utils import TestClient, TestServer

from manager import BarkManager, MANAGER, create_app


def unused_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class ManagerTests(unittest.IsolatedAsyncioTestCase):
    client: TestClient

    async def asyncSetUp(self):
        self.processes = []
        self.env = mock.patch.dict(os.environ, {
            'BARK_FIXTURE_DELAY': '0', 'BARK_FIXTURE_FAIL': '0',
            'BARK_FIXTURE_BLOCK': '0', 'BARK_FIXTURE_IGNORE_TERM': '0',
        })
        self.env.start()
        spawn = asyncio.create_subprocess_exec

        async def tracked_spawn(*args, **kwargs):
            process = await spawn(*args, **kwargs)
            self.processes.append(process)
            return process

        self.spawn_patch = mock.patch('manager.asyncio.create_subprocess_exec', side_effect=tracked_spawn)
        self.spawn_mock = self.spawn_patch.start()
        self.options = dict(
            worker_port=unused_port(), worker_script=Path(__file__), lease_ttl=0.5,
            idle_grace=0.12, check_interval=0.02, startup_timeout=1.5,
            retry_cooldown=0.15, stop_timeout=0.15,
        )

    async def asyncTearDown(self):
        try:
            if hasattr(self, 'client'):
                await self.client.close()
            leaked = [process.pid for process in self.processes if process.returncode is None]
            for process in self.processes:
                if process.returncode is None:
                    process.kill()
                await process.wait()
                with self.assertRaises(ChildProcessError):
                    os.waitpid(process.pid, os.WNOHANG)
            self.assertEqual(leaked, [], 'Manager shutdown left a child running')
        finally:
            self.spawn_patch.stop()
            self.env.stop()

    async def start(self, **options):
        self.options.update(options)
        app = create_app(**self.options)
        self.manager = app[MANAGER]
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def wait_for(self, predicate, timeout=3):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            value = predicate()
            if inspect.isawaitable(value):
                value = await value
            if value:
                return value
            await asyncio.sleep(0.01)
        self.fail('Timed out waiting for fixture condition')

    def owned_worker(self):
        worker = self.manager._worker
        assert worker is not None, 'Expected an owned fixture worker'
        return worker

    async def health(self):
        response = await self.client.get('/health')
        self.assertEqual(response.status, 200)
        return await response.json()

    async def presence(self, client_id, active=True, expected=202):
        response = await self.client.post('/presence', json={'clientId': client_id, 'active': active})
        self.assertEqual(response.status, expected)
        return response

    async def ready(self):
        async def check():
            health = await self.health()
            return health if health['ready'] else None
        return await self.wait_for(check)

    async def worker_get(self, path):
        async with ClientSession() as session:
            async with session.get(f'http://127.0.0.1:{self.options["worker_port"]}{path}') as response:
                return await response.json()

    async def release_decoder(self):
        async with ClientSession() as session:
            async with session.post(f'http://127.0.0.1:{self.options["worker_port"]}/fixture/release') as response:
                self.assertEqual(response.status, 200)

    async def test_sleeping_health_and_lightweight_import(self):
        await self.start()
        self.assertEqual(await self.health(), {
            'ok': True, 'state': 'sleeping', 'ready': False,
            'players': 0, 'active_clients': 0, 'worker_pid': None,
        })
        self.assertEqual(self.spawn_mock.call_count, 0)
        self.assertFalse({'torch', 'numpy', 'transformers', 'bark_runtime'} & set(sys.modules))

    async def test_concurrent_prewarm_and_pending_listens_spawn_once(self):
        os.environ['BARK_FIXTURE_DELAY'] = '0.25'
        await self.start(lease_ttl=2)
        ids = [str(uuid.uuid4()) for _ in range(3)]
        before = time.monotonic()
        await asyncio.gather(*(self.presence(client_id) for client_id in ids))
        self.assertLess(time.monotonic() - before, 0.2)
        self.assertEqual((await self.health())['state'], 'loading')
        pending = [asyncio.create_task(self.client.ws_connect('/listen')) for _ in range(3)]
        try:
            await self.wait_for(lambda: self.manager._streams == 3)
            self.assertFalse(any(task.done() for task in pending), 'WS accepted before readiness')
            health = await self.health()
            self.assertEqual(health['active_clients'], 3)
            self.assertEqual(health['players'], 3)
            with self.assertRaises(WSServerHandshakeError) as error:
                await self.client.ws_connect('/listen')
            self.assertEqual(error.exception.status, 429)
            sockets = await asyncio.gather(*pending)
            self.assertEqual(self.spawn_mock.call_count, 1)
            self.assertEqual((await self.health())['state'], 'ready')
            for ws in sockets:
                await ws.close()
        finally:
            for task in pending:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

    async def test_visible_clients_renew_and_release_independently(self):
        await self.start(lease_ttl=0.45)
        a, b = str(uuid.uuid4()), str(uuid.uuid4())
        await self.presence(a)
        await self.presence(b)
        await self.ready()
        worker = self.owned_worker()
        # Measure leases independently of interpreter/subprocess startup speed.
        await self.presence(a)
        await self.presence(b)
        await asyncio.sleep(0.25)
        await self.presence(a)  # A's visible-tab heartbeat must not renew B.
        await self.wait_for(lambda: len(self.manager._leases) == 1)
        self.assertEqual((await self.health())['players'], 1)
        self.assertIn(a, self.manager._leases)
        await self.presence(b, False)  # Stale release must not release A.
        self.assertEqual((await self.health())['players'], 1)
        self.assertIsNone(worker.returncode)
        await self.presence(a, False)
        self.assertEqual((await self.health())['players'], 0)
        await asyncio.sleep(0.05)
        self.assertIsNone(worker.returncode)
        await self.wait_for(lambda: worker.returncode is not None)
        self.assertEqual((await self.health())['state'], 'sleeping')

    async def test_expiry_starts_grace_and_reaps_process(self):
        await self.start(lease_ttl=0.45, idle_grace=0.18)
        client_id = str(uuid.uuid4())
        await self.presence(client_id)
        await self.ready()
        worker = self.owned_worker()
        await self.presence(client_id)
        expiry = self.manager._leases[client_id]
        await self.wait_for(lambda: not self.manager._leases)
        self.assertGreaterEqual(time.monotonic(), expiry)
        self.assertIsNone(worker.returncode)
        await asyncio.sleep(0.06)
        self.assertIsNone(worker.returncode)
        await self.wait_for(lambda: worker.returncode is not None)
        self.assertGreaterEqual(time.monotonic(), expiry + self.options['idle_grace'])
        self.assertIsNone((await self.health())['worker_pid'])

    async def test_release_while_loading_still_gets_grace(self):
        os.environ['BARK_FIXTURE_DELAY'] = '0.2'
        await self.start()
        client_id = str(uuid.uuid4())
        await self.presence(client_id)
        await self.wait_for(lambda: self.manager._worker is not None)
        worker = self.owned_worker()
        await self.presence(client_id, False)
        await asyncio.sleep(0.15)
        self.assertIsNone(worker.returncode)
        await self.ready()
        await asyncio.sleep(0.05)
        self.assertIsNone(worker.returncode)
        await self.wait_for(lambda: worker.returncode is not None)
        self.assertEqual(self.spawn_mock.call_count, 1)

    async def test_websocket_roundtrip_interim_final_and_clean_close(self):
        await self.start()
        ws = await self.client.ws_connect('/listen')
        await ws.send_bytes(b'\x10\x00' * 16000)
        interim = await ws.receive_json(timeout=2)
        self.assertFalse(interim['is_final'])
        self.assertEqual(interim['channel']['alternatives'][0]['transcript'], 'Fixture transcript')
        await ws.send_json({'type': 'CloseStream'})
        final = await ws.receive_json(timeout=2)
        self.assertTrue(final['is_final'])
        self.assertEqual(final['channel']['alternatives'][0]['transcript'], 'Fixture transcript')
        await ws.receive(timeout=2)
        self.assertTrue(ws.closed)
        self.assertEqual(ws.close_code, 1000)
        await self.wait_for(lambda: self.manager._streams == 0)
        worker = self.processes[0]
        self.assertIsNone(worker.returncode)
        await self.wait_for(lambda: worker.returncode is not None)

    async def test_open_stream_prevents_idle_stop_without_presence(self):
        await self.start()
        ws = await self.client.ws_connect('/listen')
        worker = self.owned_worker()
        await asyncio.sleep(0.3)
        self.assertIsNone(worker.returncode)
        self.assertEqual((await self.health())['active_clients'], 1)
        await ws.close()
        await self.wait_for(lambda: self.manager._streams == 0)
        await asyncio.sleep(0.04)
        self.assertIsNone(worker.returncode)
        await self.wait_for(lambda: worker.returncode is not None)

    async def test_final_deadline_and_uncancellable_decode_prevent_idle_kill(self):
        os.environ['BARK_FIXTURE_BLOCK'] = '1'
        await self.start()
        ws = await self.client.ws_connect('/listen')
        worker = self.owned_worker()
        await ws.send_bytes(b'\x10\x00' * 16000)

        async def decoding():
            return (await self.worker_get('/fixture/status'))['decoding']
        await self.wait_for(decoding)
        before = time.monotonic()
        await ws.send_json({'type': 'CloseStream'})
        await ws.receive(timeout=1)
        self.assertTrue(ws.closed)
        self.assertEqual(ws.close_code, 1011)
        self.assertLess(time.monotonic() - before, 0.5)
        await self.wait_for(lambda: self.manager._streams == 0)
        await asyncio.sleep(0.3)
        self.assertIsNone(worker.returncode)
        self.assertEqual((await self.health())['active_clients'], 1)
        await self.release_decoder()
        await self.wait_for(lambda: worker.returncode is not None)

    async def test_client_cancellation_keeps_inflight_decode_protected(self):
        os.environ['BARK_FIXTURE_BLOCK'] = '1'
        await self.start()
        ws = await self.client.ws_connect('/listen')
        worker = self.owned_worker()
        await ws.send_bytes(b'\x10\x00' * 16000)

        async def decoding():
            return (await self.worker_get('/fixture/status'))['decoding']
        await self.wait_for(decoding)
        await ws.close()
        await self.wait_for(lambda: self.manager._streams == 0)
        await asyncio.sleep(0.3)
        self.assertIsNone(worker.returncode)
        self.assertEqual((await self.health())['active_clients'], 1)
        await self.release_decoder()
        await self.wait_for(lambda: worker.returncode is not None)

    async def test_presence_during_termination_is_fast_and_spawning_is_serialized(self):
        os.environ['BARK_FIXTURE_IGNORE_TERM'] = '1'
        await self.start(stop_timeout=0.3)
        ws = await self.client.ws_connect('/listen')
        old = self.owned_worker()
        await ws.close()
        await self.wait_for(lambda: self.manager._lock.locked() and not self.manager._ready)
        self.assertIsNone(old.returncode)
        before = time.monotonic()
        await self.presence(str(uuid.uuid4()))
        self.assertLess(time.monotonic() - before, 0.15)
        self.assertEqual(self.spawn_mock.call_count, 1)
        self.assertIsNone(old.returncode)
        await self.ready()
        self.assertEqual(old.returncode, -signal.SIGKILL)
        self.assertNotEqual(self.owned_worker().pid, old.pid)
        self.assertEqual(self.spawn_mock.call_count, 2)

    async def test_unavailable_child_health_is_not_proof_of_idle(self):
        await self.start()
        ws = await self.client.ws_connect('/listen')
        worker = self.owned_worker()
        await ws.close()
        await self.wait_for(lambda: self.manager._streams == 0)
        client_id = str(uuid.uuid4())
        with mock.patch.object(self.manager, '_probe', return_value=None):
            await asyncio.sleep(0.3)
            degraded = await self.health()
            self.assertEqual(degraded['state'], 'loading')
            self.assertFalse(degraded['ready'])
            await self.presence(client_id)
            self.assertIsNone(worker.returncode)
            self.assertEqual(self.spawn_mock.call_count, 1)
        self.assertTrue((await self.health())['ready'])
        self.assertEqual(self.owned_worker().pid, worker.pid)
        await self.presence(client_id, False)
        await self.wait_for(lambda: worker.returncode is not None)

    async def test_worker_crash_restarts_once_for_live_lease(self):
        await self.start(lease_ttl=3)
        await self.presence(str(uuid.uuid4()))
        await self.ready()
        old = self.owned_worker()
        old.kill()
        await old.wait()
        self.assertFalse((await self.health())['ready'])
        await self.ready()
        self.assertNotEqual(self.owned_worker().pid, old.pid)
        self.assertEqual(self.spawn_mock.call_count, 2)
        ws = await self.client.ws_connect('/listen')
        await ws.send_bytes(b'\x10\x00' * 4000)
        await ws.send_json({'type': 'CloseStream'})
        self.assertTrue((await ws.receive_json(timeout=2))['is_final'])
        await ws.close()

    async def test_worker_crash_closes_live_websocket_and_allows_new_demand(self):
        await self.start()
        ws = await self.client.ws_connect('/listen')
        old = self.owned_worker()
        old.kill()
        await old.wait()
        await ws.receive(timeout=2)
        self.assertTrue(ws.closed)
        self.assertEqual(ws.close_code, 1011)
        await self.wait_for(lambda: self.manager._streams == 0)
        await asyncio.sleep(self.options['retry_cooldown'] + 0.03)
        replacement = await self.client.ws_connect('/listen')
        self.assertNotEqual(self.owned_worker().pid, old.pid)
        self.assertEqual(self.spawn_mock.call_count, 2)
        await replacement.close()

    async def test_startup_failure_is_bounded_cooled_down_and_retryable(self):
        os.environ['BARK_FIXTURE_FAIL'] = '1'
        await self.start(retry_cooldown=0.3)
        for attempt in range(2):
            with self.assertRaises(WSServerHandshakeError) as error:
                await self.client.ws_connect('/listen')
            self.assertEqual(error.exception.status, 503)
            self.assertEqual(self.spawn_mock.call_count, 1)
        self.assertEqual((await self.health())['state'], 'sleeping')
        self.assertTrue(all(process.returncode is not None for process in self.processes))
        self.assertEqual(self.manager._streams, 0)
        os.environ['BARK_FIXTURE_FAIL'] = '0'
        await asyncio.sleep(0.32)
        ws = await self.client.ws_connect('/listen')
        self.assertEqual(self.spawn_mock.call_count, 2)
        await ws.close()

    async def test_readiness_timeout_never_upgrades_and_reaps_failed_child(self):
        os.environ['BARK_FIXTURE_DELAY'] = '5'
        await self.start(startup_timeout=0.25)
        before = time.monotonic()
        with self.assertRaises(WSServerHandshakeError) as error:
            await self.client.ws_connect('/listen')
        self.assertEqual(error.exception.status, 503)
        self.assertLess(time.monotonic() - before, 0.8)
        await self.wait_for(lambda: self.manager._startup.done())
        self.assertEqual((await self.health())['state'], 'sleeping')
        self.assertEqual(self.manager._streams, 0)
        self.assertIsNotNone(self.processes[0].returncode)

    async def test_shutdown_terminates_then_kills_only_owned_child(self):
        os.environ['BARK_FIXTURE_IGNORE_TERM'] = '1'
        await self.start()
        ws = await self.client.ws_connect('/listen')
        worker = self.owned_worker()
        before = time.monotonic()
        await self.client.close()
        self.assertLess(time.monotonic() - before, 1.5)
        self.assertEqual(worker.returncode, -signal.SIGKILL)
        self.assertEqual(self.manager._streams, 0)
        self.assertTrue(ws.closed)

    async def test_shutdown_during_loading_reaps_child(self):
        os.environ['BARK_FIXTURE_DELAY'] = '5'
        await self.start()
        await self.presence(str(uuid.uuid4()))
        await self.wait_for(lambda: self.manager._worker is not None)
        worker = self.owned_worker()
        await self.client.close()
        self.assertIsNotNone(worker.returncode)
        self.assertEqual(self.spawn_mock.call_count, 1)

    async def test_existing_listener_is_not_adopted_or_disturbed(self):
        unrelated = web.Application()

        async def health(request):
            return web.json_response({'ok': True, 'active_clients': 0})
        unrelated.router.add_get('/health', health)
        server = TestServer(unrelated)
        await server.start_server()
        try:
            await self.start(worker_port=server.port)
            with self.assertRaises(WSServerHandshakeError) as error:
                await self.client.ws_connect('/listen')
            self.assertEqual(error.exception.status, 503)
            self.assertEqual(self.spawn_mock.call_count, 0)
            self.assertIsNone((await self.health())['worker_pid'])
            await self.client.close()
            async with ClientSession() as session:
                async with session.get(server.make_url('/health')) as response:
                    self.assertEqual(response.status, 200)
        finally:
            await server.close()

    async def test_presence_validation_origin_limit_and_unknown_release(self):
        await self.start(max_leases=2, lease_ttl=2)
        client_id = str(uuid.uuid4())
        for path in ('/presence', '/listen'):
            method = self.client.post if path == '/presence' else self.client.get
            response = await method(path, headers={'Origin': 'https://browser.example'})
            self.assertEqual(response.status, 403)
        bad = [{}, [], {'clientId': 'bad', 'active': True},
               {'clientId': client_id, 'active': 1},
               {'clientId': client_id.replace('-', ''), 'active': True},
               {'clientId': client_id, 'active': True, 'command': 'anything'}]
        for payload in bad:
            response = await self.client.post('/presence', json=payload)
            self.assertEqual(response.status, 400)
        response = await self.client.post('/presence', data='{', headers={'Content-Type': 'application/json'})
        self.assertEqual(response.status, 400)
        response = await self.client.post('/presence', data='x' * 2048)
        self.assertEqual(response.status, 413)
        response = await self.client.get('/listen')
        self.assertEqual(response.status, 400)
        self.assertEqual(self.spawn_mock.call_count, 0)
        a, b, c = (str(uuid.uuid4()) for _ in range(3))
        await self.presence(a)
        await self.presence(b)
        await self.presence(c, expected=429)
        await self.presence(a.upper())  # Same UUID cannot consume another slot.
        await self.presence(c, False)
        self.assertEqual((await self.health())['players'], 2)
        await self.presence(a, False)
        await self.presence(c)
        self.assertEqual((await self.health())['players'], 2)

    async def test_adapter_policy_close_codes_are_forwarded(self):
        await self.start()
        for payload in (b'x', '{"type":"NotCloseStream"}'):
            ws = await self.client.ws_connect('/listen')
            if isinstance(payload, bytes):
                await ws.send_bytes(payload)
            else:
                await ws.send_str(payload)
            await ws.receive(timeout=2)
            self.assertTrue(ws.closed)
            self.assertEqual(ws.close_code, 1008)

    def test_constructor_rejects_unbounded_or_invalid_settings(self):
        for name, values in {
            'worker_port': [0, 65536, True, 1.5],
            'lease_ttl': [0, 3601, float('nan'), float('inf')],
            'idle_grace': [-1, 86401, False], 'check_interval': [0, 61],
            'startup_timeout': [0, 301], 'retry_cooldown': [0, 301],
            'stop_timeout': [0, 31], 'max_leases': [0, 4097, 1.5],
        }.items():
            for value in values:
                with self.subTest(name=name, value=value), self.assertRaises(ValueError):
                    BarkManager(**{name: value})


def fixture_worker():
    """An actual adapter with a tiny deterministic CPU decoder; no model imports."""
    import argparse
    import threading
    from adapter import create_app as adapter_app

    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, required=True)
    args = parser.parse_args()
    if os.environ.get('BARK_FIXTURE_FAIL') == '1':
        raise SystemExit(2)
    entered = threading.Event()
    release = threading.Event()

    def transcribe(pcm):
        entered.set()
        if os.environ.get('BARK_FIXTURE_BLOCK') == '1':
            release.wait(10)
        return 'Fixture transcript'

    app = adapter_app(transcribe, interval=0.02, finish_timeout=0.08)

    async def delay(app):
        await asyncio.sleep(float(os.environ.get('BARK_FIXTURE_DELAY', '0')))

    async def status(request):
        return web.json_response({'decoding': entered.is_set() and not release.is_set()})

    async def unblock(request):
        release.set()
        return web.json_response({'ok': True})

    app.on_startup.append(delay)
    app.router.add_get('/fixture/status', status)
    app.router.add_post('/fixture/release', unblock)
    ignore = os.environ.get('BARK_FIXTURE_IGNORE_TERM') == '1'
    if ignore:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
    web.run_app(app, host='127.0.0.1', port=args.port, access_log=None,
                print=None, handle_signals=not ignore, shutdown_timeout=0.05)


if __name__ == '__main__':
    if '--port' in sys.argv:
        fixture_worker()
    else:
        unittest.main()
