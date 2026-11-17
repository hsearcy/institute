"""Immutable public artifacts for the personal, noncommercial Bark worker."""
import hashlib
import os
from pathlib import Path

MODEL_REPO = 'ConwayResearch/Underdog-Bark-3.0'
MODEL_REVISION = 'e7a641c0fdd4cdf1818dde62a98c26e11d65c061'
PROCESSOR_REPO = 'nvidia/parakeet-tdt-0.6b-v3'
PROCESSOR_REVISION = '541d1f99c6b0c3cd0b11a95167540bb8edefd82b'
MODEL_SHA256 = 'c18de9418d73cbeb80b8c1287b392d480a56e191ef4a81d1baaa1b02e66d92ed'
LOADER_SHA256 = 'e86b7f130bec1a8fa14dd315cfce95785b890dbd30000f6ceb2597fdd4312b02'
PROCESSOR_FILES = ['config.json', 'generation_config.json', 'processor_config.json', 'tokenizer.json', 'tokenizer_config.json']
MAX_AUDIO_BYTES = 16000 * 2 * 62  # 60s recording plus bounded worklet/proxy flush grace.

def default_model_dir():
    cache = Path(os.environ.get('XDG_CACHE_HOME', Path.home() / '.cache'))
    return Path(os.environ.get('INSTITUTE_BARK_MODEL_DIR', cache / 'institute' / 'bark-3.0' / MODEL_REVISION)).expanduser()

def checksum(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()

def validate_model_dir(directory):
    directory = Path(directory)
    for name, expected in [('model.bark', MODEL_SHA256), ('bark_loader.py', LOADER_SHA256)]:
        if checksum(directory / name) != expected:
            raise ValueError(f'Pinned Bark artifact checksum mismatch: {name}')
    for name in ['LICENSE', 'NOTICE']:
        if not (directory / name).is_file(): raise ValueError(f'Missing Bark attribution: {name}')
    for name in PROCESSOR_FILES:
        if not (directory / 'processor' / name).is_file(): raise ValueError(f'Missing local processor file: {name}')
    return directory
