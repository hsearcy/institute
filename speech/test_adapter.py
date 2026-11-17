import asyncio, json, time, unittest
from aiohttp.test_utils import TestClient, TestServer
from adapter import create_app

class AdapterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.calls = []
        def recognize(pcm):
            self.calls.append(len(pcm)); return 'Fixture transcript'
        self.client = TestClient(TestServer(create_app(recognize, interval=0.03)))
        await self.client.start_server()
    async def asyncTearDown(self):
        await self.client.close()
    async def test_interim_then_one_final_and_clean_close(self):
        ws = await self.client.ws_connect('/listen')
        await ws.send_bytes(b'\x10\x00' * 16000)
        first = await ws.receive_json(timeout=2)
        self.assertFalse(first['is_final'])
        self.assertEqual(first['channel']['alternatives'][0]['transcript'], 'Fixture transcript')
        await ws.send_json({'type':'CloseStream'})
        final = await ws.receive_json(timeout=2)
        self.assertTrue(final['is_final'])
        await ws.receive(timeout=2)
        self.assertTrue(ws.closed)
        self.assertEqual(len(self.calls), 1)
    async def test_finish_short_recording_without_waiting_for_interim(self):
        ws = await self.client.ws_connect('/listen')
        await ws.send_bytes(b'\x10\x00' * 4000)
        await ws.send_json({'type':'CloseStream'})
        final = await ws.receive_json(timeout=2)
        self.assertTrue(final['is_final'])
        self.assertEqual(self.calls, [8000])
        await ws.close()
    async def test_invalid_odd_pcm_rejected(self):
        ws = await self.client.ws_connect('/listen')
        await ws.send_bytes(b'x')
        await ws.receive(timeout=2)
        self.assertTrue(ws.closed)
        self.assertEqual(self.calls, [])
    async def test_cancel_releases_client(self):
        ws = await self.client.ws_connect('/listen'); await ws.close()
        await asyncio.sleep(0.05)
        health = await (await self.client.get('/health')).json()
        self.assertEqual(health['active_clients'],0)
        self.assertEqual(self.calls,[])
    async def test_no_audio_completes_empty(self):
        ws = await self.client.ws_connect('/listen')
        await ws.send_json({'type':'CloseStream'})
        self.assertEqual((await ws.receive_json(timeout=2))['channel']['alternatives'][0]['transcript'],'')
        self.assertEqual(self.calls,[])
        await ws.close()

    async def test_silence_does_not_invoke_decoder(self):
        ws = await self.client.ws_connect('/listen')
        await ws.send_bytes(bytes(32000))
        await ws.send_json({'type':'CloseStream'})
        self.assertEqual((await ws.receive_json(timeout=2))['channel']['alternatives'][0]['transcript'],'')
        self.assertEqual(self.calls,[])
        await ws.close()
    async def test_direct_browser_origin_rejected(self):
        from aiohttp import WSServerHandshakeError
        with self.assertRaises(WSServerHandshakeError) as error:
            await self.client.ws_connect('/listen',headers={'Origin':'https://foreign.example'})
        self.assertEqual(error.exception.status,403)
    async def test_client_limit(self):
        from aiohttp import WSServerHandshakeError
        sockets = [await self.client.ws_connect('/listen') for _ in range(3)]
        try:
            with self.assertRaises(WSServerHandshakeError) as error:
                await self.client.ws_connect('/listen')
            self.assertEqual(error.exception.status,429)
        finally:
            for ws in sockets: await ws.close()
    async def test_flush_grace_accepted_and_overflow_rejected(self):
        from model_config import MAX_AUDIO_BYTES
        ws = await self.client.ws_connect('/listen')
        pcm = b'\x10\x00' * (MAX_AUDIO_BYTES // 2)
        for offset in range(0,len(pcm),64000): await ws.send_bytes(pcm[offset:offset+64000])
        await ws.send_json({'type':'CloseStream'})
        while True:
            result = await ws.receive_json(timeout=3)
            if result['is_final']: break
        self.assertEqual(self.calls[-1],MAX_AUDIO_BYTES)
        await ws.close()
        ws = await self.client.ws_connect('/listen')
        for offset in range(0,len(pcm),64000): await ws.send_bytes(pcm[offset:offset+64000])
        await ws.send_bytes(b'\x10\x00')
        for _ in range(4):
            message = await ws.receive(timeout=3)
            if ws.closed: break
        self.assertTrue(ws.closed)
        self.assertEqual(ws.close_code,1008)
    async def test_decoder_failure_closes_socket(self):
        await self.client.close()
        def fail(pcm): raise RuntimeError('fixture decoder failure')
        self.client = TestClient(TestServer(create_app(fail,interval=0.01)))
        await self.client.start_server()
        ws = await self.client.ws_connect('/listen')
        await ws.send_bytes(b'\x10\x00' * 16000)
        await ws.receive(timeout=2)
        self.assertTrue(ws.closed)
        self.assertEqual(ws.close_code,1011)
    async def test_cancelled_decode_keeps_global_gate_until_thread_finishes(self):
        import threading
        await self.client.close()
        first_started = threading.Event(); release = threading.Event()
        lock = threading.Lock(); active = 0; peak = 0; count = 0
        def recognize(pcm):
            nonlocal active,peak,count
            with lock:
                active += 1; peak = max(peak,active); count += 1; number = count
            try:
                if number == 1:
                    first_started.set(); release.wait(2)
                return 'Fixture transcript'
            finally:
                with lock: active -= 1
        self.client = TestClient(TestServer(create_app(recognize,interval=0.01)))
        await self.client.start_server()
        a = await self.client.ws_connect('/listen'); b = await self.client.ws_connect('/listen')
        close_task = None
        try:
            await a.send_bytes(b'\x10\x00' * 16000)
            self.assertTrue(await asyncio.to_thread(first_started.wait,1))
            close_task = asyncio.create_task(a.close())
            await b.send_bytes(b'\x10\x00' * 16000)
            await asyncio.sleep(0.05)
            release.set()
            await b.receive_json(timeout=2)
            self.assertEqual(peak,1)
        finally:
            release.set()
            await a.close(); await b.close()
            if close_task: await close_task

    async def test_finish_deadline_includes_inflight_decode_without_releasing_gate_early(self):
        import threading
        await self.client.close()
        started=threading.Event(); release=threading.Event(); lock=threading.Lock()
        active=0; peak=0; count=0
        def recognize(pcm):
            nonlocal active,peak,count
            with lock:
                active+=1; peak=max(peak,active); count+=1; number=count
            try:
                if number==1:
                    started.set(); release.wait(2)
                return 'Fixture transcript'
            finally:
                with lock: active-=1
        self.client=TestClient(TestServer(create_app(recognize,interval=0.01,finish_timeout=0.04)))
        await self.client.start_server()
        a=await self.client.ws_connect('/listen'); b=None
        try:
            await a.send_bytes(b'\x10\x00'*16000)
            self.assertTrue(await asyncio.to_thread(started.wait,1))
            before=time.monotonic()
            await a.send_json({'type':'CloseStream'})
            await a.receive(timeout=0.4)
            self.assertTrue(a.closed)
            self.assertEqual(a.close_code,1011)
            self.assertLess(time.monotonic()-before,0.4)
            b=await self.client.ws_connect('/listen')
            await b.send_bytes(b'\x10\x00'*16000)
            await asyncio.sleep(0.05)
            release.set()
            await b.receive_json(timeout=2)
            self.assertEqual(peak,1)
        finally:
            release.set(); await a.close()
            if b: await b.close()

if __name__ == '__main__': unittest.main()
