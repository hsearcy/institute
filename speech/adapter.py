"""Loopback-only, bounded local speech adapter. No audio/transcript persistence."""
import asyncio, contextlib, json
from aiohttp import web, WSMsgType

from model_config import MAX_AUDIO_BYTES
MAX_AUDIO = MAX_AUDIO_BYTES
STATE = web.AppKey('state', dict)

def create_app(transcribe, interval=1.0, finish_timeout=7.0):
    app = web.Application(client_max_size=65536)
    state = {'active':0, 'gate':asyncio.Semaphore(1)}
    app[STATE] = state
    async def recognize(data):
        if not data or not any(data): return ''
        async with state['gate']:
            task = asyncio.create_task(asyncio.to_thread(transcribe, data))
            cancelled = False
            while not task.done():
                try: await asyncio.shield(task)
                except asyncio.CancelledError:
                    # Even repeated cancellation must not release an active CUDA thread.
                    cancelled = True
            if cancelled:
                with contextlib.suppress(Exception): task.result()
                raise asyncio.CancelledError()
            return task.result()
    async def health(request):
        return web.json_response({'ok':True,'provider':'Bark 3.0','local':True,'active_clients':state['active']})
    async def listen(request):
        # This endpoint is server-to-server, never a direct browser microphone API.
        if request.headers.get('Origin') is not None: raise web.HTTPForbidden()
        if state['active'] >= 3: raise web.HTTPTooManyRequests()
        state['active'] += 1
        ws = web.WebSocketResponse(max_msg_size=65536, heartbeat=15, receive_timeout=70)
        audio = bytearray(); last_size = -1; last_text = ''; closing = False
        ticker = None; finalizer = None
        async def result(final):
            nonlocal last_size, last_text
            if ws.closed: return
            snapshot = bytes(audio)
            if len(snapshot) != last_size:
                last_text = await recognize(snapshot); last_size = len(snapshot)
            if not ws.closed:
                await ws.send_json({'type':'Results','is_final':final,'channel':{'alternatives':[{'transcript':last_text}]}})
        async def tick():
            try:
                while not closing and not ws.closed:
                    await asyncio.sleep(interval)
                    if len(audio) >= 16000 and len(audio) != last_size:
                        await result(False)
            except asyncio.CancelledError:
                raise
            except Exception:
                await ws.close(code=1011)
        try:
            await ws.prepare(request)
            ticker = asyncio.create_task(tick())
            async for message in ws:
                if message.type == WSMsgType.BINARY:
                    if not message.data or len(message.data) % 2 or len(audio) + len(message.data) > MAX_AUDIO:
                        await ws.close(code=1008); break
                    audio.extend(message.data)
                elif message.type == WSMsgType.TEXT:
                    try: command = json.loads(message.data)
                    except (ValueError,TypeError): command = None
                    if command != {'type':'CloseStream'}:
                        await ws.close(code=1008); break
                    closing = True
                    async def finish():
                        ticker.cancel()
                        with contextlib.suppress(asyncio.CancelledError): await ticker
                        await result(True)
                    finalizer = asyncio.create_task(finish())
                    try:
                        # One total budget includes waiting for an in-flight interim.
                        # Shield lets us close promptly while cleanup retains the GPU gate.
                        await asyncio.wait_for(asyncio.shield(finalizer), timeout=finish_timeout)
                        await ws.close(code=1000)
                    except (Exception,asyncio.TimeoutError):
                        finalizer.cancel()
                        await ws.close(code=1011)
                    break
                else: break
        finally:
            closing = True
            if finalizer: finalizer.cancel()
            if ticker:
                ticker.cancel()
                with contextlib.suppress(asyncio.CancelledError,Exception): await ticker
            if finalizer:
                with contextlib.suppress(asyncio.CancelledError,Exception): await finalizer
            audio.clear(); state['active'] -= 1
        return ws
    app.router.add_get('/health',health)
    app.router.add_get('/listen',listen)
    return app

if __name__ == '__main__':
    import argparse
    from bark_runtime import BarkTranscriber
    parser = argparse.ArgumentParser(description='Local Bark worker, loopback only')
    parser.add_argument('--port', type=int, default=15003)
    parser.add_argument('--model-dir', default=None)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535: parser.error('Port must be between 1 and 65535')
    runtime = BarkTranscriber(args.model_dir)
    runtime.warmup()
    print(f'Bark adapter ready on loopback :{args.port}',flush=True)
    web.run_app(create_app(runtime.transcribe), host='127.0.0.1', port=args.port,
                access_log=None, shutdown_timeout=10)
