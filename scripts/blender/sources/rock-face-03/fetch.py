"""Restore the pinned CC0 Poly Haven stone maps used by the masonry study."""
import hashlib
import json
from pathlib import Path
import urllib.request


def restore():
    folder = Path(__file__).resolve().parent
    manifest = json.loads((folder / 'manifest.json').read_text())
    for name, source in manifest.items():
        target = folder / (name + '.jpg')
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == source['sha256']:
            continue
        temporary = target.with_suffix('.tmp')
        with urllib.request.urlopen(source['url'], timeout=60) as response:
            payload = response.read(source['bytes'] + 1)
        if len(payload) != source['bytes'] or hashlib.sha256(payload).hexdigest() != source['sha256']:
            raise ValueError('Downloaded map differs from the reviewed source: ' + name)
        temporary.write_bytes(payload)
        temporary.replace(target)
    print('Verified four pinned Poly Haven stone maps')


if __name__ == '__main__':
    restore()
