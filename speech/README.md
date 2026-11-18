# Local speech

Optional [Underdog Bark 3.0](https://huggingface.co/ConwayResearch/Underdog-Bark-3.0) worker for suggestion transcription. Requires Python 3.11 and CUDA-enabled PyTorch. Model weights are licensed **CC-BY-NC-4.0**, separately from Institute's code.

## Setup

From the repository root:

```sh
uv venv --python 3.11 speech/.venv
uv pip install --python speech/.venv/bin/python -r speech/requirements.txt
speech/.venv/bin/python speech/download_model.py
speech/.venv/bin/python speech/manager.py
```

Install a compatible CUDA build of PyTorch if your environment requires one. The downloader fetches pinned artifacts and verifies model/decoder hashes. The worker uses those files offline.

## Configuration

The backend defaults to `INSTITUTE_SPEECH_PROVIDER=bark` and `INSTITUTE_BARK_URL=ws://127.0.0.1:15003/listen`. No speech API key is needed. Microphone capture requires HTTPS or localhost; keep the worker loopback-only.

- The lightweight manager stays on loopback port 15003 and starts the model subprocess on port 15006 when the game becomes active. It releases the model after the last player leaves and the two minute grace period expires; recording and in flight transcription prevent idle shutdown.
- Check manager state at `http://127.0.0.1:15003/health`: `sleeping`, `loading`, or `ready`. Health does not imply the model is loaded. Use `manager.py --help` for lifecycle options; `adapter.py` remains available for a manually managed, always warm worker.
- Models default to `~/.cache/institute/bark-3.0/<revision>` (respecting `XDG_CACHE_HOME`). Override with `INSTITUTE_BARK_MODEL_DIR`.
- Speech is incremental, limited to 60 seconds, and serialized across at most three clients. Audio and transcripts are not saved or logged.
- If the worker is unavailable, use typing. External speech requires explicitly selecting `deepgram` and setting `DEEPGRAM_API_KEY`; `disabled` selects typing only. Tutor audio checking is separate.

The worker runs separately from the app. Secure game pages renew a per-page lease every 25 seconds while visible and used within five minutes; hiding or leaving releases it. Lost pages expire after 75 seconds. Starting the manager does not install a persistent service or deploy Institute.

## Tests

```sh
speech/.venv/bin/python -m unittest discover -s speech -p 'test_*.py' -v
```
