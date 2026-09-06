"""Restore the public, creator-published CC0 Knight source cache."""
from pathlib import Path
import hashlib
import urllib.request

URL = 'https://opengameart.org/sites/default/files/Knight_0.blend'
SHA256 = 'd7461ba21f3d5768e4f8a782ac4e5283eac73fdb991e44fddeb5cb487c045e0c'
target = Path(__file__).with_name('knight-foundation.blend')
if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == SHA256:
    print('Verified existing Knight cache')
else:
    request = urllib.request.Request(URL, headers={'User-Agent': 'Embercrypt asset source recovery'})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    assert len(data) == 14_107_760, 'Unexpected Knight source size'
    assert hashlib.sha256(data).hexdigest() == SHA256, 'Unexpected Knight source hash'
    temporary = target.with_suffix('.blend.tmp')
    temporary.write_bytes(data)
    temporary.replace(target)
    print('Downloaded and verified CC0 Knight cache')
