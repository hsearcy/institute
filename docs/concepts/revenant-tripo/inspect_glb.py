"""Read the GLB structure without changing the downloaded model."""
from pathlib import Path
import hashlib
import json
import struct
import sys

path = Path(sys.argv[1])
data = path.read_bytes()
magic, version, size = struct.unpack_from('<4sII', data)
assert magic == b'glTF' and version == 2 and size == len(data)
chunk_size, chunk_type = struct.unpack_from('<II', data, 12)
assert chunk_type == 0x4E4F534A
gltf = json.loads(data[20:20 + chunk_size])
accessors = gltf.get('accessors', [])
primitives = [p for m in gltf.get('meshes', []) for p in m['primitives']]
triangles = sum(accessors[p['indices']]['count'] // 3 if 'indices' in p else accessors[p['attributes']['POSITION']]['count'] // 3 for p in primitives if p.get('mode', 4) == 4)
report = dict(path=str(path), bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
              triangles=triangles, meshes=len(gltf.get('meshes', [])),
              primitives=len(primitives), nodes=len(gltf.get('nodes', [])),
              materials=len(gltf.get('materials', [])), textures=len(gltf.get('textures', [])),
              images=len(gltf.get('images', [])), skins=len(gltf.get('skins', [])),
              animations=len(gltf.get('animations', [])),
              extensions_used=gltf.get('extensionsUsed', []),
              extensions_required=gltf.get('extensionsRequired', []),
              external_uris=[x['uri'] for k in ['buffers', 'images'] for x in gltf.get(k, []) if x.get('uri') and not x['uri'].startswith('data:')],
              materials_detail=gltf.get('materials', []),
              position_bounds=[{k: accessors[p['attributes']['POSITION']].get(k) for k in ['min', 'max', 'count']} for p in primitives],
              node_names=[n.get('name', '') for n in gltf.get('nodes', [])])
print(json.dumps(report, indent=2))
