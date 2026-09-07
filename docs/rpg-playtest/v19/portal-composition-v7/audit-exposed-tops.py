"""Inspect exact GLB top normals and embedded albedo at triangle centroids."""
import hashlib
import io
import json
import struct
from pathlib import Path
from PIL import Image

asset = Path(__file__).with_name('portal-composition-v7-parts.glb')
b = asset.read_bytes()
n = struct.unpack_from('<I', b, 12)[0]
gltf = json.loads(b[20:20+n])
raw = b[28+n:]

def accessor(index):
    a = gltf['accessors'][index]
    view = gltf['bufferViews'][a['bufferView']]
    fmt = {5126: 'f', 5125: 'I', 5123: 'H'}[a['componentType']]
    width = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
    size = struct.calcsize(fmt) * width
    offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<' + fmt * width, raw, offset + i * view.get('byteStride', size))
            for i in range(a['count'])]

primitive = gltf['meshes'][0]['primitives'][0]
material = gltf['materials'][primitive['material']]
image = gltf['images'][gltf['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
view = gltf['bufferViews'][image['bufferView']]
albedo = Image.open(io.BytesIO(raw[view['byteOffset']:view['byteOffset']+view['byteLength']])).convert('RGB')
positions = accessor(primitive['attributes']['POSITION'])
normals = accessor(primitive['attributes']['NORMAL'])
uvs = accessor(primitive['attributes']['TEXCOORD_0'])
indices = [v[0] for v in accessor(primitive['indices'])]
samples = []
for start in range(0, len(indices), 3):
    triangle = indices[start:start+3]
    center = [sum(positions[k][d] for k in triangle) / 3 for d in range(3)]
    normal = [sum(normals[k][d] for k in triangle) / 3 for d in range(3)]
    x, y, z = center
    if not (1.93 < abs(x) < 3.1 and 3.86 < y < 3.90 and normal[1] > .8):
        continue
    uv = [sum(uvs[k][d] for k in triangle) / 3 for d in range(2)]
    pixel = (min(albedo.width-1, max(0, int(uv[0]*albedo.width))),
             min(albedo.height-1, max(0, int(uv[1]*albedo.height))))
    samples.append(dict(center=center, normal=normal, uv=uv, albedo=albedo.getpixel(pixel)))
assert samples, 'Expected exposed top triangles'
report = dict(assetSHA256=hashlib.sha256(b).hexdigest(), material=material,
              scope='Exposed level top triangle centroids near source height3.885; geometry normals and embedded sRGB color only',
              samples=samples)
asset.with_name('exposed-top-audit.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'samples': len(samples), 'minimumNormalY': min(s['normal'][1] for s in samples)}))
