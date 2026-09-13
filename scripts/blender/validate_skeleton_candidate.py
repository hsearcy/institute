"""Read-only checks for the new skeleton candidate; leaves the live manifest intact."""
import hashlib
import json
import math
from pathlib import Path
import struct
import sys


def validate(path):
    data = path.read_bytes()
    assert struct.unpack_from('<4sII', data) == (b'glTF', 2, len(data))
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(data[20:20 + length])
    binary_length, binary_kind = struct.unpack_from('<II', data, 20 + length)
    assert binary_kind == 0x004E4942
    binary = data[28 + length:]
    assert len(binary) == binary_length
    assert not doc.get('skins'), 'Rigid joints are required by the game'
    assert all('uri' not in item for item in doc['buffers'])
    for view in doc.get('bufferViews', []):
        assert view.get('byteOffset', 0) + view['byteLength'] <= len(binary)
    for image in doc.get('images', []):
        assert 'uri' not in image and 'bufferView' in image
        view = doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        assert binary[start:start + 8] == b'\x89PNG\r\n\x1a\n' or binary[start:start + 2] == b'\xff\xd8'
    triangles = primitives = 0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            primitives += 1
            assert primitive.get('mode', 4) == 4
            attrs = primitive['attributes']
            assert {'POSITION', 'NORMAL'} <= attrs.keys()
            position = doc['accessors'][attrs['POSITION']]
            assert all(math.isfinite(x) for x in position['min'] + position['max'])
            count = doc['accessors'][primitive['indices']]['count'] if 'indices' in primitive else position['count']
            assert count % 3 == 0
            triangles += count // 3
            material = doc['materials'][primitive['material']]
            pbr = material.get('pbrMetallicRoughness', {})
            if 'baseColorTexture' in pbr:
                assert 'TEXCOORD_0' in attrs
                assert {'normalTexture', 'occlusionTexture'} <= material.keys()
                assert 'metallicRoughnessTexture' in pbr
    joints = {i: node.get('extras', {}).get('enemyJoint') for i, node in enumerate(doc['nodes']) if node.get('extras', {}).get('enemyJoint')}
    required = {'Body', 'Head', 'Sword', 'Cape'} | {part + side for part in ('ArmUpper', 'ArmLower', 'LegUpper', 'LegLower') for side in ('L', 'R')}
    assert required <= set(joints.values()), f'Missing joints: {required - set(joints.values())}'
    assert len(joints) == len(set(joints.values())), 'Duplicate joint tags'
    parents = {child: i for i, node in enumerate(doc['nodes']) for child in node.get('children', [])}
    for i, name in joints.items():
        parent = parents.get(i)
        while parent is not None and parent not in joints:
            parent = parents.get(parent)
        expected = name.replace('Lower', 'Upper') if 'Lower' in name else 'ArmLowerR' if name == 'Sword' else None if name == 'Body' else 'Body'
        assert joints.get(parent) == expected, (name, joints.get(parent), expected)
    assert len(data) < 8_000_000
    return {'path': str(path), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'triangles': triangles, 'meshes': len(doc['meshes']), 'drawCalls': primitives, 'materials': len(doc['materials']), 'embeddedImages': len(doc.get('images', [])), 'joints': list(joints.values()), 'passed': True}


if __name__ == '__main__':
    default = Path(__file__).resolve().parents[2] / 'web/public/assets/rpg/candidates/skeleton-concept.glb'
    print(json.dumps(validate(Path(sys.argv[1]) if len(sys.argv) > 1 else default), indent=2))
