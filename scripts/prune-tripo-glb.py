#!/usr/bin/env python3
"""Losslessly prune unused core glTF resources and repack embedded buffer views.

Conservatively retains every node/scene/animation (including attachment markers).
Rejects extensions/external buffers instead of guessing their reference semantics.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import struct

TABLES = ('meshes', 'skins', 'materials', 'textures', 'images', 'samplers', 'accessors', 'bufferViews')


def read_glb(path):
    raw = path.read_bytes()
    if struct.unpack_from('<4sII', raw) != (b'glTF', 2, len(raw)):
        raise ValueError('Expected a valid glTF 2 GLB header')
    chunks, offset = {}, 12
    while offset < len(raw):
        length, kind = struct.unpack_from('<I4s', raw, offset)
        offset += 8
        if offset + length > len(raw) or kind in chunks:
            raise ValueError('Invalid or repeated GLB chunk')
        chunks[kind] = raw[offset:offset + length]
        offset += length
    if set(chunks) != {b'JSON', b'BIN\0'}:
        raise ValueError('Expected exactly JSON and BIN chunks')
    doc = json.loads(chunks[b'JSON'])
    if len(doc.get('buffers', [])) != 1 or 'uri' in doc['buffers'][0]:
        raise ValueError('Only one embedded buffer is supported')
    def reject_extensions(value):
        if isinstance(value, dict):
            if value.get('extensions'):
                raise ValueError('Extensions require a dedicated reference adapter')
            for key, child in value.items():
                if key != 'extras':
                    reject_extensions(child)
        elif isinstance(value, list):
            for child in value:
                reject_extensions(child)
    reject_extensions(doc)
    if doc.get('extensionsUsed') or doc.get('extensionsRequired'):
        raise ValueError('Extensions are unsupported')
    return doc, chunks[b'BIN\0'], len(raw)


def references(doc, visit):
    """Visit/rewrite core resource references. Node indices are never reordered."""
    def field(owner, key, table):
        if key in owner:
            owner[key] = visit(table, owner[key])
    for node in doc.get('nodes', []):
        field(node, 'mesh', 'meshes'); field(node, 'skin', 'skins')
    for skin in doc.get('skins', []):
        field(skin, 'inverseBindMatrices', 'accessors')
    for animation in doc.get('animations', []):
        for sampler in animation.get('samplers', []):
            field(sampler, 'input', 'accessors'); field(sampler, 'output', 'accessors')
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            field(primitive, 'indices', 'accessors'); field(primitive, 'material', 'materials')
            for attributes in [primitive.get('attributes', {}), *primitive.get('targets', [])]:
                for key in attributes:
                    field(attributes, key, 'accessors')
    for material in doc.get('materials', []):
        for container in [material, material.get('pbrMetallicRoughness', {})]:
            for key in ('normalTexture', 'occlusionTexture', 'emissiveTexture', 'baseColorTexture', 'metallicRoughnessTexture'):
                if key in container:
                    field(container[key], 'index', 'textures')
    for texture in doc.get('textures', []):
        field(texture, 'source', 'images'); field(texture, 'sampler', 'samplers')
    for image in doc.get('images', []):
        if 'uri' in image:
            raise ValueError('External images are unsupported')
        field(image, 'bufferView', 'bufferViews')
    for accessor in doc.get('accessors', []):
        field(accessor, 'bufferView', 'bufferViews')
        sparse = accessor.get('sparse', {})
        for key in ('indices', 'values'):
            if key in sparse:
                field(sparse[key], 'bufferView', 'bufferViews')


def validate(doc, binary):
    def check(table, index):
        if not isinstance(index, int) or not 0 <= index < len(doc.get(table, [])):
            raise ValueError(f'Invalid {table} reference: {index}')
        return index
    references(doc, check)
    for view in doc.get('bufferViews', []):
        start, length = view.get('byteOffset', 0), view['byteLength']
        if view.get('buffer', 0) != 0 or start < 0 or length < 0 or start + length > len(binary):
            raise ValueError('Invalid embedded buffer view range')
    def node(index):
        if not isinstance(index, int) or not 0 <= index < len(doc.get('nodes', [])):
            raise ValueError(f'Invalid node reference: {index}')
    for scene in doc.get('scenes', []):
        for index in scene.get('nodes', []): node(index)
    for item in doc.get('nodes', []):
        for index in item.get('children', []): node(index)
    for skin in doc.get('skins', []):
        for index in skin['joints']: node(index)
        if 'skeleton' in skin: node(skin['skeleton'])
    for animation in doc.get('animations', []):
        for channel in animation['channels']:
            node(channel['target']['node'])
            if not 0 <= channel['sampler'] < len(animation['samplers']):
                raise ValueError('Invalid animation sampler')


def manifest(doc, binary):
    normalized = copy.deepcopy(doc)
    normalized.pop('buffers', None)
    for view in normalized.get('bufferViews', []):
        start = view.pop('byteOffset', 0)
        view.pop('buffer', None)
        view['contentSHA256'] = hashlib.sha256(binary[start:start + view['byteLength']]).hexdigest()
    return hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def prune(doc, binary):
    validate(doc, binary)
    live = {key: set() for key in TABLES}
    def mark(table, index): live[table].add(index); return index
    # Begin at every node, scene and animation, then follow only retained resources.
    root = {key: value for key, value in copy.deepcopy(doc).items() if key not in TABLES}
    while True:
        previous = sum(map(len, live.values()))
        references(root, mark)
        root = {key: value for key, value in copy.deepcopy(doc).items() if key not in TABLES}
        root.update({key: [copy.deepcopy(doc[key][i]) for i in sorted(indices)] for key, indices in live.items() if key in doc})
        if sum(map(len, live.values())) == previous: break
    order = {key: sorted(indices) for key, indices in live.items()}
    maps = {key: {old: new for new, old in enumerate(indices)} for key, indices in order.items()}
    expected = copy.deepcopy(root)
    references(root, lambda table, index: maps[table][index])
    packed = bytearray()
    for view in root.get('bufferViews', []):
        packed.extend(b'\0' * (-len(packed) % 4))
        start = view.get('byteOffset', 0)
        chunk = binary[start:start + view['byteLength']]
        view['buffer'] = 0; view['byteOffset'] = len(packed)
        packed.extend(chunk)
    root['buffers'] = [{**doc['buffers'][0], 'byteLength': len(packed)}]
    validate(root, packed)
    # Undo only index renumbering, then hash every retained JSON value and raw
    # buffer-view byte. Equal hashes prove transforms/markers/motion/materials
    # and all live binary content were preserved, not merely valid references.
    restored = copy.deepcopy(root)
    references(restored, lambda table, index: order[table][index])
    before, after = manifest(expected, binary), manifest(restored, packed)
    if before != after: raise AssertionError('Live resource content changed')
    return root, packed, {'liveContentSHA256Before': before, 'liveContentSHA256After': after,
                          'counts': {key: {'before': len(doc.get(key, [])), 'after': len(root.get(key, []))} for key in TABLES}}


def encode(doc, binary):
    data = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode()
    data += b' ' * (-len(data) % 4)
    binary = bytes(binary) + b'\0' * (-len(binary) % 4)
    return struct.pack('<4sII', b'glTF', 2, 28 + len(data) + len(binary)) + struct.pack('<I4s', len(data), b'JSON') + data + struct.pack('<I4s', len(binary), b'BIN\0') + binary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path); parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve(): parser.error('Use a separate output file')
    doc, binary, size = read_glb(args.input)
    result, packed, report = prune(doc, binary)
    output = encode(result, packed)
    args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_bytes(output)
    reread, rebound, _ = read_glb(args.output); validate(reread, rebound)
    if manifest(result, packed) != manifest(reread, rebound): raise AssertionError('GLB write/read changed content')
    report.update(input=str(args.input), output=str(args.output), inputBytes=size, outputBytes=len(output), savedBytes=size-len(output), referenceValidation='passed', writeReadVerification='passed')
    args.output.with_suffix('.prune.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__': main()
