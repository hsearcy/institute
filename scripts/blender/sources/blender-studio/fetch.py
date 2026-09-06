"""Fetch pinned, public CC0 Blender anatomy sources through anonymous Git LFS.

The .blend cache is narrowly ignored by Git; the hashes and license are tracked.
No Blender preferences, accounts, API keys, or paid services are involved.
"""
from pathlib import Path
import hashlib
import json
import urllib.request

ROOT = Path(__file__).resolve().parent
REPOSITORY = 'https://projects.blender.org/blender/blender-assets'
REVISION = '0a12785f3f22c7b6cbbf9cbdd2a680a02280ae3e'
ASSETS = {
    'realistic-skull.blend': {
        'sha256': '1e0bad1693cc1824be5efc2351a71105ff388af80f356e5bd48a0c9e4d83ec99',
        'bytes': 13294130,
        'path': 'publish/online/base_meshes/human_base_meshes__realistic-skull.blend',
    },
    'realistic-skeleton.blend': {
        'sha256': 'd563a0fb2f0044d91737af9b4d57f211e84340c6ff1596a1b9f600aa35f40f2b',
        'bytes': 1118898,
        'path': 'publish/online/base_meshes/human_base_meshes__skeleton.blend',
    },
}

def fetch():
    for name, asset in ASSETS.items():
        target = ROOT / name
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == asset['sha256']:
            print(f'{name}: verified cache')
            continue
        payload = {'operation': 'download', 'transfers': ['basic'], 'objects': [
            {'oid': asset['sha256'], 'size': asset['bytes']}
        ]}
        request = urllib.request.Request(
            REPOSITORY + '.git/info/lfs/objects/batch',
            data=json.dumps(payload).encode(),
            headers={'Accept': 'application/vnd.git-lfs+json', 'Content-Type': 'application/vnd.git-lfs+json'},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            entry = json.load(response)['objects'][0]
        if 'error' in entry:
            raise RuntimeError(entry['error'])
        action = entry['actions']['download']
        request = urllib.request.Request(action['href'], headers=action.get('header', {}))
        with urllib.request.urlopen(request, timeout=90) as response:
            data = response.read()
        if len(data) != asset['bytes'] or hashlib.sha256(data).hexdigest() != asset['sha256']:
            raise ValueError(f'{name}: source hash or size mismatch')
        target.write_bytes(data)
        print(f'{name}: downloaded and verified {len(data):,} bytes')

if __name__ == '__main__':
    fetch()
