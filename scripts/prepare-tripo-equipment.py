#!/usr/bin/env python3
"""Prepare the fresh segmented Tripo hero's equipment without Blender.

Preserves animation/skin accessors. Removes only UV-identified exposed handle
triangles; fits source coordinates to the rig from matching source pixels/UVs.
Requires numpy. No network calls or prior character model inputs.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path

import numpy as np


class Glb:
    def __init__(self, path: Path):
        data = path.read_bytes()
        magic, version, total = struct.unpack_from('<III', data)
        if (magic, version, total) != (0x46546C67, 2, len(data)):
            raise ValueError(f'Invalid GLB: {path}')
        size, kind = struct.unpack_from('<II', data, 12)
        if kind != 0x4E4F534A:
            raise ValueError('First GLB chunk must be JSON')
        self.doc = json.loads(data[20:20 + size])
        length, kind = struct.unpack_from('<II', data, 20 + size)
        if kind != 0x004E4942:
            raise ValueError('Embedded BIN chunk required')
        self.binary = bytearray(data[28 + size:28 + size + length])

    def accessor(self, index: int) -> np.ndarray:
        acc = self.doc['accessors'][index]
        if 'sparse' in acc:
            raise ValueError('Sparse geometry cannot be matched without expansion')
        view = self.doc['bufferViews'][acc['bufferView']]
        dtype = np.dtype({5121: '<u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[acc['componentType']])
        columns = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[acc['type']]
        return np.ndarray((acc['count'], columns), dtype=dtype, buffer=self.binary,
                          offset=view.get('byteOffset', 0) + acc.get('byteOffset', 0),
                          strides=(view.get('byteStride', columns * dtype.itemsize), dtype.itemsize)).copy()

    def indices(self, values: np.ndarray) -> int:
        values = np.asarray(values, dtype='<u4').reshape(-1)
        self.binary.extend(b'\0' * (-len(self.binary) % 4))
        view = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(self.binary), 'byteLength': values.nbytes, 'target': 34963})
        self.binary.extend(values.tobytes())
        index = len(self.doc['accessors'])
        self.doc['accessors'].append({'bufferView': view, 'componentType': 5125, 'count': len(values),
                                     'type': 'SCALAR', 'min': [int(values.min())], 'max': [int(values.max())]})
        return index

    def save(self, path: Path):
        self.doc['buffers'] = [{'byteLength': len(self.binary)}]
        payload = json.dumps(self.doc, separators=(',', ':')).encode()
        payload += b' ' * (-len(payload) % 4)
        binary = bytes(self.binary) + b'\0' * (-len(self.binary) % 4)
        result = struct.pack('<III', 0x46546C67, 2, 28 + len(payload) + len(binary))
        result += struct.pack('<II', len(payload), 0x4E4F534A) + payload
        result += struct.pack('<II', len(binary), 0x004E4942) + binary
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(result)


def node_matrix(node: dict) -> np.ndarray:
    if 'matrix' in node:
        return np.array(node['matrix']).reshape(4, 4, order='F')
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    matrix = np.eye(4)
    matrix[:3, :3] = [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                      [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                      [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]
    matrix[:3, :3] *= np.array(node.get('scale', [1, 1, 1]))
    matrix[:3, 3] = node.get('translation', [0, 0, 0])
    return matrix


def world_matrices(doc: dict) -> list[np.ndarray]:
    nodes = doc['nodes']
    parents = {child: parent for parent, n in enumerate(nodes) for child in n.get('children', [])}
    result: dict[int, np.ndarray] = {}
    def world(i):
        if i not in result:
            result[i] = (world(parents[i]) if i in parents else np.eye(4)) @ node_matrix(nodes[i])
        return result[i]
    return [world(i) for i in range(len(nodes))]


def uv_key(uv):
    return tuple(round(float(v), 5) for v in uv)


def triangle_key(uv):
    return tuple(sorted(uv_key(v) for v in uv))


def remove_handle(rig: Glb, mask: dict) -> tuple[np.ndarray, dict]:
    candidates = [(i, n) for i, n in enumerate(rig.doc['nodes']) if n.get('name') == 'tripo_part_8' and 'mesh' in n]
    if len(candidates) != 1:
        raise ValueError('Expected one named tripo_part_8 hand mesh; refusing a guessed region')
    ni, node = candidates[0]
    primitive = rig.doc['meshes'][node['mesh']]['primitives'][0]
    uv = rig.accessor(primitive['attributes']['TEXCOORD_0'])
    p = rig.accessor(primitive['attributes']['POSITION'])
    indices = rig.accessor(primitive['indices']).reshape(-1, 3)
    wanted = Counter(triangle_key(v) for v in mask['triangleUvCoordinates'])
    remove = np.zeros(len(indices), dtype=bool)
    for i, tri in enumerate(indices):
        key = triangle_key(uv[tri])
        if wanted[key]:
            remove[i] = True
            wanted[key] -= 1
    if any(wanted.values()) or int(remove.sum()) != mask['removedTriangleCount']:
        raise ValueError('Rig UVs do not reproduce the inspected handle mask exactly')
    lookup = {uv_key(value): i for i, value in enumerate(uv)}
    original, target = [], []
    world = world_matrices(rig.doc)[ni]
    for tex, pos in zip(mask['triangleUvCoordinates'], mask['triangleRawCoordinates']):
        for u, xyz in zip(tex, pos):
            if uv_key(u) not in lookup:
                raise ValueError('Source landmark UV missing from rig')
            original.append(xyz)
            target.append((world @ np.r_[p[lookup[uv_key(u)]], 1])[:3])
    x, y = np.array(original), np.array(target)
    xc, yc = x.mean(0), y.mean(0)
    u, singular, vt = np.linalg.svd((y-yc).T @ (x-xc) / len(x))
    correction = np.eye(3)
    correction[2, 2] = np.linalg.det(u @ vt)
    rotation = u @ correction @ vt
    scale = np.sum(singular * np.diag(correction)) / np.mean(np.sum((x-xc)**2, axis=1))
    transform = np.eye(4)
    transform[:3, :3] = rotation * scale
    transform[:3, 3] = yc - scale * rotation @ xc
    errors = np.linalg.norm((x @ transform[:3, :3].T + transform[:3, 3]) - y, axis=1)
    if errors.max() > 1e-4 or not .8 < scale < 1.2:
        raise ValueError(f'Source-to-rig fit is not trustworthy: max error {errors.max()}, scale {scale}')
    original_attributes = copy.deepcopy(primitive['attributes'])
    primitive['indices'] = rig.indices(indices[~remove])
    assert primitive['attributes'] == original_attributes
    return transform, {'part': node['name'], 'removedTriangles': int(remove.sum()), 'keptTriangles': int((~remove).sum()),
                       'sourceToRigMatrix': transform.flatten(order='F').tolist(), 'fitMaxError': float(errors.max()),
                       'fitRmsError': float(np.sqrt(np.mean(errors**2))), 'fitScale': float(scale),
                       'skinAttributesPreserved': True}


def append_sword(rig: Glb, sword: Glb) -> list[int]:
    """Append static resources, remapping every accessor/material/node reference."""
    out, src = rig.doc, copy.deepcopy(sword.doc)
    rig.binary.extend(b'\0' * (-len(rig.binary) % 4))
    offset = len(rig.binary)
    rig.binary.extend(sword.binary)
    bases = {key: len(out.setdefault(key, [])) for key in ['bufferViews', 'accessors', 'images', 'samplers', 'textures', 'materials', 'meshes', 'nodes']}
    for view in src.get('bufferViews', []):
        view['buffer'] = 0
        view['byteOffset'] = view.get('byteOffset', 0) + offset
    for acc in src.get('accessors', []):
        if 'bufferView' in acc: acc['bufferView'] += bases['bufferViews']
        if 'sparse' in acc:
            for key in ['indices', 'values']: acc['sparse'][key]['bufferView'] += bases['bufferViews']
    for image in src.get('images', []):
        if 'bufferView' in image: image['bufferView'] += bases['bufferViews']
    for texture in src.get('textures', []):
        if 'source' in texture: texture['source'] += bases['images']
        if 'sampler' in texture: texture['sampler'] += bases['samplers']
        for extension in texture.get('extensions', {}).values():
            if 'source' in extension: extension['source'] += bases['images']
    def textures(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key.endswith('Texture') and isinstance(item, dict) and 'index' in item:
                    item['index'] += bases['textures']
                else: textures(item)
        elif isinstance(value, list):
            for item in value: textures(item)
    for material in src.get('materials', []): textures(material)
    for mesh in src.get('meshes', []):
        for primitive in mesh['primitives']:
            primitive['attributes'] = {key: val + bases['accessors'] for key, val in primitive['attributes'].items()}
            if 'indices' in primitive: primitive['indices'] += bases['accessors']
            if 'material' in primitive: primitive['material'] += bases['materials']
            for target in primitive.get('targets', []):
                for key in target: target[key] += bases['accessors']
    for node in src['nodes']:
        if 'skin' in node: raise ValueError('Source sword must be rigid, not a copied character skin')
        if 'mesh' in node: node['mesh'] += bases['meshes']
        if 'children' in node: node['children'] = [i + bases['nodes'] for i in node['children']]
        node.get('extras', {}).pop('sourcePart', None)
    roots = [i + bases['nodes'] for i in src['scenes'][src.get('scene', 0)]['nodes']]
    for key in bases: out[key].extend(src.get(key, []))
    for key in ['extensionsUsed', 'extensionsRequired']:
        if key in src: out[key] = sorted(set(out.get(key, [])) | set(src[key]))
    return roots


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rig', type=Path, required=True)
    parser.add_argument('--sword', type=Path, required=True)
    parser.add_argument('--mask', type=Path, required=True)
    parser.add_argument('--sockets', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--bone-map', type=Path, help='Optional exact node names keyed by socket boneRole')
    args = parser.parse_args()
    rig, sword = Glb(args.rig), Glb(args.sword)
    if any(n.get('name') == 'TripoGrip' for n in rig.doc['nodes']):
        raise ValueError('Equipment already installed; use the pristine rig input')
    clips_before = copy.deepcopy(rig.doc.get('animations', []))
    transform, report = remove_handle(rig, json.loads(args.mask.read_text()))
    socket_spec = json.loads(args.sockets.read_text())
    aliases = {'rightHand': ['R_Hand', 'mixamorig:RightHand'], 'leftHand': ['L_Hand', 'mixamorig:LeftHand'],
               'head': ['Head', 'mixamorig:Head'], 'chest': ['Spine02', 'mixamorig:Spine2'],
               'belt': ['Waist', 'Hip', 'Pelvis', 'mixamorig:Hips']}
    if args.bone_map:
        for role, name in json.loads(args.bone_map.read_text()).items(): aliases[role] = [name]
    bones = {}
    for role, names in aliases.items():
        for name in names:
            found = [i for i, n in enumerate(rig.doc['nodes']) if n.get('name') == name]
            if len(found) == 1: bones[role] = found[0]; break
        if role not in bones: raise ValueError(f'No unambiguous new rig bone for {role}; provide --bone-map')
    matrices = world_matrices(rig.doc)
    def append_node(node, parent=None):
        index = len(rig.doc['nodes'])
        rig.doc['nodes'].append(node)
        if parent is not None: rig.doc['nodes'][parent].setdefault('children', []).append(index)
        return index
    for name, socket in socket_spec['sockets'].items():
        raw = np.array(socket['matrix']).reshape(4, 4, order='F')
        raw[:3, :3] *= socket.get('itemScale', 1)
        bone = bones[socket['boneRole']]
        local = np.linalg.inv(matrices[bone]) @ transform @ raw
        append_node({'name': name, 'matrix': local.flatten(order='F').tolist(),
                     'extras': {'source': 'fresh-tripo-measurement', 'itemScale': socket.get('itemScale', 1)}}, bone)
    roots = append_sword(rig, sword)
    tip = append_node({'name': 'Tip', 'translation': socket_spec['defaultSwordTip'], 'extras': {'attachmentRole': 'Tip'}})
    local = np.linalg.inv(matrices[bones['rightHand']]) @ transform
    append_node({'name': 'TripoDefaultSword', 'matrix': local.flatten(order='F').tolist(),
                 'children': roots + [tip], 'extras': {'sourcePart': 'equipped_sword', 'provenance': 'fresh-segmented-tripo-sword'}}, bones['rightHand'])
    for node in rig.doc['nodes']:
        if node.get('name') == 'tripo_part_0': node.setdefault('extras', {})['sourcePart'] = 'cape'
    old_roots = list(rig.doc['scenes'][rig.doc.get('scene', 0)]['nodes'])
    wrapper = append_node({'name': 'TripoForward', 'rotation': [0, -2**-.5, 0, 2**-.5], 'children': old_roots,
                           'extras': {'sourceForward': '+X', 'gameForward': '+Z'}})
    rig.doc['scenes'][rig.doc.get('scene', 0)]['nodes'] = [wrapper]
    assert rig.doc.get('animations', []) == clips_before
    rig.save(args.out)
    report.update({'inputRig': str(args.rig), 'output': str(args.out), 'outputSha256': hashlib.sha256(args.out.read_bytes()).hexdigest(),
                   'bones': {role: rig.doc['nodes'][i]['name'] for role, i in bones.items()},
                   'clipsPreserved': [clip.get('name') for clip in clips_before], 'socketNames': list(socket_spec['sockets']),
                   'defaultSwordParts': ['blade-and-guard', 'pommel', 'extracted-handle'], 'forwardWrapper': 'TripoForward',
                   'limitations': 'Grip/wearable placement requires integrated visual review; source cut has an open fused-contact seam inside the gripping hand.'})
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
