# Local speech

Optional [Underdog Bark 3.0](https://huggingface.co/ConwayResearch/Underdog-Bark-3.0) worker for suggestion transcription. Requires Python 3.11 and CUDA-enabled PyTorch. Model weights are licensed **CC-BY-NC-4.0**, separately from Institute's code.

## Setup

From the repository root:

```sh
uv venv --python 3.11 speech/.venv
uv pip install --python speech/.venv/bin/python -r speech/requirements.txt
speech/.venv/bin/python speech/download_model.py
speech/.venv/bin/python speech/adapter.py
```

Install a compatible CUDA build of PyTorch if your environment requires one. The downloader fetches pinned artifacts and verifies model/decoder hashes. The worker uses those files offline.

## Configuration

The backend defaults to `INSTITUTE_SPEECH_PROVIDER=bark` and `INSTITUTE_BARK_URL=ws://127.0.0.1:15003/listen`. No speech API key is needed. Microphone capture requires HTTPS or localhost; keep the worker loopback-only.

- Worker options: `--port` and `--model-dir`; check readiness at `http://127.0.0.1:15003/health`.
- Models default to `~/.cache/institute/bark-3.0/<revision>` (respecting `XDG_CACHE_HOME`). Override with `INSTITUTE_BARK_MODEL_DIR` or `--model-dir`.
- Speech is incremental, limited to 60 seconds, and serialized across at most three clients. Audio and transcripts are not saved or logged.
- If the worker is unavailable, use typing. External speech requires explicitly selecting `deepgram` and setting `DEEPGRAM_API_KEY`; `disabled` selects typing only. Tutor audio checking is separate.

The worker runs separately from the app. Starting it does not install a persistent service or deploy Institute.

## Tests

```sh
speech/.venv/bin/python -m unittest discover -s speech -p 'test_*.py' -v
```
