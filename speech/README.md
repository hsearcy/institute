# Local Bark speech worker

This optional worker recognizes Institute suggestion speech locally. It has **no app/database imports, parent approval credentials, notifications or build authority**. It binds only `127.0.0.1` and is reached through the existing same-origin Bun WebSocket proxy. No audio files or transcripts are logged or saved.

## Model and license

- Model: `ConwayResearch/Underdog-Bark-3.0`, revision `e7a641c0fdd4cdf1818dde62a98c26e11d65c061`.
- Processor/tokenizer: `nvidia/parakeet-tdt-0.6b-v3`, revision `541d1f99c6b0c3cd0b11a95167540bb8edefd82b`.
- The explicit download command retains upstream `LICENSE` and `NOTICE` and verifies the packed model and Python decoder SHA-256 hashes before use. Runtime never downloads or executes an unverified decoder.
- **The Bark model card declares CC-BY-NC-4.0.** Marketing wording that says CC-BY is not a commercial-use grant. This integration is for the personal family instance; obtain appropriate rights before any commercial distribution/use. The upstream decoder and model license are separate from the app's code.

The roughly 163 MB packed download expands to float32 tensors in the reference Python loader. On the tested GTX 1070 it uses roughly 2393 MiB of CUDA weight allocations before temporary inference memory. This is **not** native two-bit GPU compute and does not promise a 163 MB runtime.

## One-time preparation

From the repository root, with Python 3.11 and a compatible NVIDIA driver:

```sh
uv venv --python 3.11 speech/.venv
uv pip install --python speech/.venv/bin/python --index-url https://download.pytorch.org/whl/cu126 'torch==2.7.1'
uv pip install --python speech/.venv/bin/python -r speech/requirements.txt
speech/.venv/bin/python speech/download_model.py
```

These commands download packages and public model artifacts. They do not start services or touch Institute data. The runtime pins were exercised with Python 3.11, `torch==2.7.1+cu126`, and `transformers==5.22.1`. Check `torch.cuda.get_arch_list()` against the actual GPU before substituting a newer wheel; newer CUDA/PyTorch builds may drop Pascal support.

By default artifacts live in `$XDG_CACHE_HOME/institute/bark-3.0/<revision>` (or `~/.cache/institute/...`). To reuse an already verified copy, set `INSTITUTE_BARK_MODEL_DIR` to its directory. It must contain `model.bark`, `bark_loader.py`, `LICENSE`, `NOTICE`, and the five processor JSON files under `processor/`. `download_model.py --model-dir /absolute/path` supports the same layout. Keep model files and virtualenvs outside Git.

## Start the separate worker

```sh
systemd-run --user --scope --quiet --unit=institute-bark \
  -p MemoryHigh=4G -p MemoryMax=5G -p CPUQuota=200% \
  env HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 OMP_NUM_THREADS=2 \
  "$PWD/speech/.venv/bin/python" "$PWD/speech/adapter.py"
```

This is a foreground, resource-limited worker, not an installed or enabled persistent service. It loads the verified local artifacts and warms the real recognizer **before listening**. Use a separate terminal or an owned process supervisor when testing. An intentionally installed service should use absolute executable/model paths and the same memory/CPU bounds. Do not relax guards or install/change the live Institute service as a side effect of preparing code.

Options: `--port 15003`, `--model-dir /absolute/path`. The interface remains loopback-only even with a different port. Verify readiness with:

```sh
curl --fail http://127.0.0.1:15003/health
```

Configure the **app backend**, not the browser:

```dotenv
INSTITUTE_SPEECH_PROVIDER=bark
INSTITUTE_BARK_URL=ws://127.0.0.1:15003/listen
```

These are the defaults. No speech API key is needed. No external provider is contacted if Bark is missing or fails; the existing typing flow remains usable. `INSTITUTE_SPEECH_PROVIDER=deepgram` is the explicit opt-in to the old provider. The separate Deepgram tutor audio-checking feature is unaffected. Microphone capture still requires HTTPS or localhost, and existing origin checks still apply. Never expose this worker with public Serve/Funnel or put its settings in `VITE_` secrets.

**Houston owns deployment of the live family instance.** Preparing these files does not deploy, migrate or restart it. The deployed checkout/env and any persistent speech service are activated separately by the owner.

## Protocol and limits

- Internal `WS /listen`: binary mono signed PCM16 little-endian at 16 kHz, matching the Bun proxy. Direct browser Origin headers are rejected; browsers use `/rpg/suggestions/live` on the app instead.
- A bounded whole-utterance snapshot is transcribed approximately once per second. Interim text replaces the previous interim; this is incremental inference, not an inherently streaming model.
- On JSON `{"type":"CloseStream"}`, emit one final `Results` message and close normally. The worker allows **7 seconds total**, including an in-flight interim decode, while the proxy allows 8 seconds and the browser 10 seconds. A timeout closes with an error rather than pretending to have final text; the GPU gate remains held until its actual thread ends. The existing proxy converts messages into the application's `transcript`/`done` events.
- Three clients maximum, **one global GPU inference at a time**. Cancellation retains the gate until the actual worker thread has finished.
- Intended recording duration is 60 seconds. A strict 62-second byte ceiling allows the existing bounded worklet flush grace; oversized/odd frames are rejected. Public ingress retains its own shorter duration, startup, idle, frame, backpressure and final-flush limits.
- Silence consisting entirely of zero samples returns blank without invoking the decoder. No broad child-speech accuracy or noise-rejection claim is implied.
- No transcript submits an idea or authorizes a change. Send and parent approval remain separate.

## Tests and measured evidence

```sh
speech/.venv/bin/python -m unittest discover -s speech -p 'test_*.py' -v
```

Adapter tests inject explicit fixture callbacks; they test protocol/lifecycle/resource behavior, not model accuracy. The original real GPU probe correctly recognized “Please add a blue dragon to the game.” from 2.48 seconds of audio, with warm inference about 0.066 seconds and initial load about 24 seconds. Real HTTPS and browser tests verified words before stopping, final text, microphone release, editing, save and reload using disposable state. These are hardware-specific short-clip observations, not a latency guarantee or a young-child accuracy benchmark.
