"""Loopback, on-demand Bark supervisor; imports only stdlib and aiohttp.

Run with the speech venv's Python. Children inherit its environment (including
INSTITUTE_BARK_MODEL_DIR). Visible clients should renew /presence every 25s;
leases expire after 75s by default. HTTP never selects a command or model path.
No audio/transcript is retained or logged, including child stdout/stderr.
"""
import argparse
import asyncio
import contextlib
import json
import math
from pathlib import Path
import sys
import time
import uuid

from aiohttp import ClientSession, ClientTimeout, ClientWSTimeout, WSMsgType, web


def _number(name, value, minimum, maximum, integer=False):
    if (isinstance(value, bool) or not isinstance(value, (int, float))
            or not minimum <= value <= maximum or not math.isfinite(value)
            or (integer and not isinstance(value, int))):
        raise ValueError(f'{name} must be between {minimum} and {maximum}')
    return value


class BarkManager:
    """One owned subprocess, bounded leases, and at most three pending/live streams.

    worker_script is a trusted, constructor-only seam for CPU subprocess tests;
    the CLI always runs the adjacent adapter.py with sys.executable, never a shell.
    A demand makes one bounded start attempt; subsequent attempts require cooldown.
    Live leases request recovery automatically, but expired leases do not retry.
    """

    def __init__(self, *, worker_port=15006, lease_ttl=75, idle_grace=120,
                 check_interval=0.25, startup_timeout=75, retry_cooldown=5,
                 stop_timeout=3, max_leases=128, worker_script=None):
        self.worker_port = _number('worker_port', worker_port, 1, 65535, True)
        self.lease_ttl = _number('lease_ttl', lease_ttl, 0.05, 3600)
        self.idle_grace = _number('idle_grace', idle_grace, 0.01, 86400)
        self.check_interval = _number('check_interval', check_interval, 0.01, 60)
        self.startup_timeout = _number('startup_timeout', startup_timeout, 0.05, 300)
        self.retry_cooldown = _number('retry_cooldown', retry_cooldown, 0.01, 300)
        self.stop_timeout = _number('stop_timeout', stop_timeout, 0.05, 30)
        self.max_leases = _number('max_leases', max_leases, 1, 4096, True)
        self.worker_script = Path(worker_script or Path(__file__).with_name('adapter.py')).resolve()
        self._base = f'http://127.0.0.1:{self.worker_port}'
        self._leases = {}
        self._streams = 0
        self._worker = None
        self._ready = False
        self._worker_active = 0
        self._lock = asyncio.Lock()
        self._startup = None
        self._reaper = None
        self._session = None
        self._handlers = set()
        self._closing = False
        self._last_use = time.monotonic()
        self._retry_at = 0.0

    async def start(self):
        self._session = ClientSession(timeout=ClientTimeout(total=1))
        self._reaper = asyncio.create_task(self._reap_loop())

    def _prune(self):
        now = time.monotonic()
        for key, expiry in list(self._leases.items()):
            if expiry <= now:
                del self._leases[key]
                # Grace starts at actual expiry, not when the poll notices it.
                self._last_use = max(self._last_use, expiry)

    def _live_worker(self):
        return self._worker is not None and self._worker.returncode is None

    def _state(self):
        if self._live_worker() and self._ready:
            return 'ready'
        if self._live_worker() or (self._startup and not self._startup.done()):
            return 'loading'
        return 'sleeping'

    def _schedule_start(self):
        # No await: the first request installs the shared task before another
        # presence/listen can run. The lock serializes spawning AND termination.
        if self._closing:
            return None
        if self._startup and not self._startup.done():
            return self._startup
        if self._live_worker() and self._ready:
            return None
        if time.monotonic() < self._retry_at:
            return None
        self._startup = asyncio.create_task(self._start_worker())
        return self._startup

    async def _probe(self, worker):
        if worker is None or worker.returncode is not None:
            return None
        try:
            async with self._session.get(self._base + '/health',
                                         timeout=ClientTimeout(total=min(0.5, self.startup_timeout))) as response:
                if response.status != 200:
                    return None
                raw = await response.content.read(4097)
                if len(raw) > 4096:
                    return None
                data = json.loads(raw)
                if not isinstance(data, dict):
                    return None
                active = data.get('active_clients')
                if (data.get('ok') is not True or isinstance(active, bool)
                        or not isinstance(active, int) or active < 0):
                    return None
                if worker is self._worker and worker.returncode is None:
                    self._worker_active = active
                    return data
        except Exception:
            # Fail closed on health errors: they are NOT proof decode is idle.
            return None
        return None

    async def _port_free(self):
        # Never adopt, proxy to, or signal a pre-existing listener on this port.
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection('127.0.0.1', self.worker_port), timeout=0.5)
        except ConnectionRefusedError:
            return True
        writer.close()
        await writer.wait_closed()
        return False

    async def _start_worker(self):
        async with self._lock:
            if self._closing:
                return False
            try:
                if self._worker is not None and self._worker.returncode is not None:
                    await self._stop_locked()
                if self._worker is None:
                    if not await self._port_free():
                        raise RuntimeError('Worker port is already occupied')
                    spawn = asyncio.create_task(asyncio.create_subprocess_exec(
                        sys.executable, str(self.worker_script), '--port', str(self.worker_port),
                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL))
                    try:
                        self._worker = await asyncio.shield(spawn)
                    except asyncio.CancelledError:
                        # Cancellation must not orphan a just-created child.
                        self._worker = await spawn
                        raise
                worker = self._worker
                deadline = time.monotonic() + self.startup_timeout
                while time.monotonic() < deadline:
                    if self._closing or worker.returncode is not None:
                        break
                    remaining = deadline - time.monotonic()
                    try:
                        health = await asyncio.wait_for(self._probe(worker), remaining)
                    except asyncio.TimeoutError:
                        break
                    if health is not None and worker.returncode is None:
                        self._ready = True
                        self._last_use = time.monotonic()
                        return True
                    await asyncio.sleep(min(self.check_interval, max(0, deadline - time.monotonic())))
            except asyncio.CancelledError:
                await self._stop_locked()
                raise
            except Exception:
                pass
            self._ready = False
            self._retry_at = time.monotonic() + self.retry_cooldown
            await self._stop_locked()
            return False

    async def _stop_locked(self):
        worker = self._worker
        self._ready = False
        if worker is None:
            return
        try:
            if worker.returncode is None:
                with contextlib.suppress(ProcessLookupError):
                    worker.terminate()
            try:
                await asyncio.wait_for(worker.wait(), self.stop_timeout)
            except asyncio.TimeoutError:
                with contextlib.suppress(ProcessLookupError):
                    worker.kill()
                await asyncio.wait_for(worker.wait(), self.stop_timeout)
        finally:
            # Keep ownership if a cancellation/OS error interrupted the reap.
            if worker.returncode is not None:
                self._worker = None
                self._worker_active = 0

    async def _reap_loop(self):
        while True:
            await asyncio.sleep(self.check_interval)
            self._prune()
            if self._lock.locked():
                continue
            async with self._lock:
                if self._worker is not None and self._worker.returncode is not None:
                    await self._stop_locked()
                    self._retry_at = time.monotonic() + self.retry_cooldown
                if (self._live_worker() and not self._streams and not self._leases
                        and time.monotonic() - self._last_use >= self.idle_grace):
                    health = await self._probe(self._worker)
                    # Requests/heartbeats can arrive while health is in flight.
                    self._prune()
                    if health is not None and health['active_clients'] > 0:
                        self._last_use = time.monotonic()
                    elif (health is not None and not self._streams and not self._leases
                          and time.monotonic() - self._last_use >= self.idle_grace):
                        await self._stop_locked()
            if self._leases:
                self._schedule_start()

    async def presence(self, request):
        if request.headers.get('Origin') is not None:
            raise web.HTTPForbidden()
        if self._closing:
            raise web.HTTPServiceUnavailable()
        try:
            data = await request.json()
            if not isinstance(data, dict) or set(data) != {'clientId', 'active'}:
                raise ValueError()
            raw = data['clientId']
            if not isinstance(raw, str) or not isinstance(data['active'], bool):
                raise ValueError()
            client_id = str(uuid.UUID(raw))
            if raw.lower() != client_id:
                raise ValueError()
        except (ValueError, TypeError):
            raise web.HTTPBadRequest(text='Expected UUID clientId and boolean active') from None
        self._prune()
        if data['active']:
            if client_id not in self._leases and len(self._leases) >= self.max_leases:
                raise web.HTTPTooManyRequests()
            self._leases[client_id] = time.monotonic() + self.lease_ttl
            self._last_use = time.monotonic()
            self._schedule_start()
        elif self._leases.pop(client_id, None) is not None:
            self._last_use = time.monotonic()
        return web.json_response({'ok': True}, status=202)

    async def health(self, request):
        self._prune()
        state = self._state()
        if state == 'ready':
            worker = self._worker
            health = await self._probe(worker)
            state = self._state()
            if worker is self._worker and health is None and state == 'ready':
                state = 'loading'
            # A transient probe failure is not a failed initial startup. Keep
            # ownership/readiness history so it cannot trigger a restart (and
            # kill an existing decode); the next health request probes again.
        return web.json_response({
            'ok': True, 'state': state, 'ready': state == 'ready',
            'players': len(self._leases),
            'active_clients': max(self._streams, self._worker_active) if self._live_worker() else self._streams,
            'worker_pid': self._worker.pid if self._live_worker() else None,
        })

    async def listen(self, request):
        if request.headers.get('Origin') is not None:
            raise web.HTTPForbidden()
        if self._closing:
            raise web.HTTPServiceUnavailable()
        ws = web.WebSocketResponse(max_msg_size=65536, heartbeat=15,
                                   receive_timeout=70, timeout=1)
        if not ws.can_prepare(request).ok:
            raise web.HTTPBadRequest(text='WebSocket upgrade required')
        if self._streams >= 3:
            raise web.HTTPTooManyRequests()
        self._streams += 1  # Includes readiness wait and upstream handshake.
        handler = asyncio.current_task()
        self._handlers.add(handler)
        upstream = None
        pumps = []
        close_code = 1011
        try:
            task = self._schedule_start()
            if task is not None:
                try:
                    await asyncio.wait_for(asyncio.shield(task), self.startup_timeout)
                except asyncio.TimeoutError:
                    raise web.HTTPServiceUnavailable(text='Speech worker readiness timed out') from None
            if self._closing or not self._live_worker() or not self._ready:
                raise web.HTTPServiceUnavailable(
                    text='Speech worker unavailable',
                    headers={'Retry-After': str(max(1, math.ceil(self.retry_cooldown)))})
            try:
                upstream = await self._session.ws_connect(
                    self._base + '/listen', max_msg_size=65536, heartbeat=15,
                    timeout=ClientWSTimeout(ws_receive=70, ws_close=1))
            except Exception as error:
                if getattr(error, 'status', None) == 429:
                    raise web.HTTPTooManyRequests() from None
                raise web.HTTPServiceUnavailable(text='Speech worker unavailable') from None
            await ws.prepare(request)

            async def relay(source, destination):
                async for message in source:
                    if message.type == WSMsgType.BINARY:
                        await destination.send_bytes(message.data)
                    elif message.type == WSMsgType.TEXT:
                        await destination.send_str(message.data)
                    else:
                        break
                code = source.close_code
                # Abnormal EOF is local status, never a legal wire close code.
                if code in (None, 1005, 1006, 1015):
                    code = 1011
                return code

            pumps = [asyncio.create_task(relay(ws, upstream)),
                     asyncio.create_task(relay(upstream, ws))]
            done, _ = await asyncio.wait(pumps, return_when=asyncio.FIRST_COMPLETED)
            finished = pumps[1] if pumps[1] in done else pumps[0]
            try:
                close_code = finished.result()
            except Exception:
                close_code = 1011
        finally:
            async def cleanup():
                # Stop both readers BEFORE closing either socket. Otherwise a
                # close wakes the opposite pump, which can cancel the first
                # close handshake and turn a valid final/1011 into TCP reset.
                for pump in pumps:
                    pump.cancel()
                if pumps:
                    await asyncio.gather(*pumps, return_exceptions=True)
                if upstream is not None:
                    with contextlib.suppress(Exception):
                        await upstream.close(code=close_code)
                if ws.prepared:
                    with contextlib.suppress(Exception):
                        await ws.close(code=close_code)

            # Disconnect and application shutdown can both cancel this handler.
            # Finish bounded socket cleanup even if the second cancellation lands
            # inside finally; never leak an upstream or the stream reservation.
            cleanup_task = asyncio.create_task(cleanup())
            cancelled = False
            try:
                while not cleanup_task.done():
                    try:
                        await asyncio.shield(cleanup_task)
                    except asyncio.CancelledError:
                        cancelled = True
                cleanup_task.result()
            finally:
                self._streams -= 1
                self._last_use = time.monotonic()
                self._handlers.discard(handler)
            if cancelled:
                raise asyncio.CancelledError()
        return ws

    async def close(self):
        if self._closing:
            return
        self._closing = True
        for task in (self._reaper, self._startup):
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        handlers = list(self._handlers)
        for handler in handlers:
            handler.cancel()
        if handlers:
            await asyncio.gather(*handlers, return_exceptions=True)
        async with self._lock:
            await self._stop_locked()
        if self._session is not None:
            await self._session.close()
        self._leases.clear()


MANAGER = web.AppKey('manager', BarkManager)


def create_app(**options):
    manager = BarkManager(**options)
    app = web.Application(client_max_size=1024)
    app[MANAGER] = manager

    async def start(app):
        await manager.start()

    async def stop(app):
        await manager.close()

    app.on_startup.append(start)
    app.on_shutdown.append(stop)
    app.router.add_post('/presence', manager.presence)
    app.router.add_get('/health', manager.health)
    app.router.add_get('/listen', manager.listen)
    return app


def main():
    parser = argparse.ArgumentParser(description='On-demand Bark manager, loopback only')
    parser.add_argument('--port', type=int, default=15003)
    parser.add_argument('--worker-port', type=int, default=15006)
    parser.add_argument('--lease-ttl', type=float, default=75)
    parser.add_argument('--idle-grace', type=float, default=120)
    parser.add_argument('--check-interval', type=float, default=0.25)
    parser.add_argument('--startup-timeout', type=float, default=75)
    parser.add_argument('--retry-cooldown', type=float, default=5)
    parser.add_argument('--stop-timeout', type=float, default=3)
    parser.add_argument('--max-leases', type=int, default=128)
    options = vars(parser.parse_args())
    port = options.pop('port')
    try:
        _number('port', port, 1, 65535, True)
        if port == options['worker_port']:
            raise ValueError('Manager and worker ports must differ')
        app = create_app(**options)
    except ValueError as error:
        parser.error(str(error))
    web.run_app(app, host='127.0.0.1', port=port, access_log=None, shutdown_timeout=5)


if __name__ == '__main__':
    main()
