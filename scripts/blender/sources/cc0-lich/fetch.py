"""Restore the publicly downloadable CC0 source with exact hash validation."""
from pathlib import Path
import hashlib
import urllib.request

URL = 'https://media.githubusercontent.com/media/Samfa12-tech/The-Horde-RT-demo/463aed23d879ea673600bd1121fd0989a518599b/assets/models/enemies/meshy/lich_placeholder_merged_animations_v01.glb'
SHA = '049979a83aca55358f54af8d3af1f7d518607bef634474a4ef015bfdff947a42'
target = Path(__file__).with_name('lich-foundation.glb')
if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != SHA:
    data = urllib.request.urlopen(URL, timeout=60).read()
    if len(data) != 14940452 or hashlib.sha256(data).hexdigest() != SHA:
        raise RuntimeError('Public source content differs from the audited version')
    target.write_bytes(data)
print(target)
