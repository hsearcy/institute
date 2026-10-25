#!/usr/bin/env python3
"""Put a fresh plain-clothes body on the game hero's existing rig.

The game hero (tripo-hero-game.glb) keeps its skeleton, sockets, embedded
sword and all animation clips. Its armoured body meshes and cape are removed,
and the new Tripo body (generated from a render of the same hero's rest pose,
re-dressed in linen) is added as one skinned mesh:

1. Align: the new mesh shares the source axes (+X forward, +Y up). A uniform
   scale and offset map its fists and ground onto the old body's fists and
   ground in the rig's bind space.
2. Skin: each new vertex takes the inverse-distance blend of the skin weights of
   its nearest old body vertices (cape excluded). Each arm first turns about its
   shoulder so the new fist lands on the old one, and the right fist moves from
   the forearm twist onto R_Hand, where the sword grip lives.
3. Write: textures are downscaled for the browser, the old body/cape meshes are
   detached, and scripts/prune-tripo-glb.py removes what is no longer referenced.

Source (October 25 2026): the rest pose rendered front-on, re-dressed in tan linen with
Gemini image editing (assets/tripo-base-hero/concept-front.png, ignored), then Tripo
image-to-model task 02957560-7346-4c5d-bc5d-c436288c85ee (v3.1-20260211, detailed
geometry and texture, face limit 60000, seeds 20261026; 60 credits). No new rig or
retarget tasks were needed. Run on the armoured game hero from git, then prune:

    uv run --with numpy --with scipy --with pillow python scripts/base-hero/build_base_hero.py \
        web/public/assets/rpg/tripo-hero-game.glb assets/tripo-base-hero/gen/<task>-pbr_model.glb out.glb
"""
from __future__ import annotations

import argparse
import importlib.util
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('tripo_equipment', ROOT / 'scripts' / 'prepare-tripo-equipment.py')
eq = importlib.util.module_from_spec(spec); spec.loader.exec_module(eq)

TEXTURE = 2048
NEIGHBOURS = 8


def append(glb, values: np.ndarray, kind: str, component: int = 5126, target: int | None = None) -> int:
    values = np.ascontiguousarray(values)
    glb.binary.extend(b'\0' * (-len(glb.binary) % 4))
    view = {'buffer': 0, 'byteOffset': len(glb.binary), 'byteLength': values.nbytes}
    if target is not None: view['target'] = target
    glb.binary.extend(values.tobytes())
    glb.doc['bufferViews'].append(view)
    accessor = {'bufferView': len(glb.doc['bufferViews']) - 1, 'componentType': component, 'count': len(values), 'type': kind}
    if kind == 'VEC3' and component == 5126:
        accessor['min'] = values.min(0).tolist(); accessor['max'] = values.max(0).tolist()
    glb.doc['accessors'].append(accessor)
    return len(glb.doc['accessors']) - 1


def append_image(glb, data: bytes, mime: str, name: str) -> int:
    image = Image.open(io.BytesIO(data))
    if max(image.size) > TEXTURE: image = image.resize((TEXTURE, TEXTURE), Image.LANCZOS)
    out = io.BytesIO()
    image.convert('RGB').save(out, 'JPEG', quality=88)
    payload = out.getvalue()
    glb.binary.extend(b'\0' * (-len(glb.binary) % 4))
    glb.doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(glb.binary), 'byteLength': len(payload)})
    glb.binary.extend(payload)
    glb.doc['images'].append({'name': name, 'mimeType': 'image/jpeg', 'bufferView': len(glb.doc['bufferViews']) - 1})
    glb.doc['textures'].append({'source': len(glb.doc['images']) - 1, **({'sampler': 0} if glb.doc.get('samplers') else {})})
    return len(glb.doc['textures']) - 1


def body_vertices(old):
    """Old skinned body vertices (cape excluded) with weights per joint node."""
    positions, joints, weights = [], [], []
    for node in old.doc['nodes']:
        if 'mesh' not in node or 'skin' not in node or node.get('extras', {}).get('sourcePart') == 'cape': continue
        skin = old.doc['skins'][node['skin']]['joints']
        for primitive in old.doc['meshes'][node['mesh']]['primitives']:
            attributes = primitive['attributes']
            positions.append(old.accessor(attributes['POSITION']))
            joints.append(np.asarray(skin)[old.accessor(attributes['JOINTS_0']).astype(int)])
            raw = old.accessor(attributes['WEIGHTS_0']).astype(np.float64)
            kind = old.doc['accessors'][attributes['WEIGHTS_0']]['componentType']
            weights.append(raw / {5121: 255, 5123: 65535}.get(kind, 1))
    return np.concatenate(positions), np.concatenate(joints), np.concatenate(weights)


def fists(points: np.ndarray, centre_z: float) -> tuple[np.ndarray, np.ndarray]:
    """Fist centroids: the lowest arm points well out to each side (A-pose)."""
    out = []
    for side in (-1, 1):
        lateral = (points[:, 2] - centre_z) * side
        arm = points[lateral > np.percentile(lateral, 96)]
        low = arm[arm[:, 1] < np.percentile(arm[:, 1], 30)]
        out.append(low.mean(0))
    return out[0], out[1]


def old_fist(old, points: np.ndarray, bone: str) -> np.ndarray:
    """Old fist centroid: body vertices just below the hand joint, which sits at the wrist."""
    skin = old.doc['skins'][0]
    slot = next(i for i, node in enumerate(skin['joints']) if old.doc['nodes'][node]['name'] == bone)
    wrist = np.linalg.inv(old.accessor(skin['inverseBindMatrices']).reshape(-1, 4, 4)[slot].T)[:3, 3]
    near = points[(np.linalg.norm(points - wrist, axis=1) < .1) & (points[:, 1] < wrist[1])]
    return near.mean(0)


def bind_positions(old) -> dict[str, np.ndarray]:
    skin = old.doc['skins'][0]
    matrices = old.accessor(skin['inverseBindMatrices']).reshape(-1, 4, 4)
    return {old.doc['nodes'][node]['name']: np.linalg.inv(matrices[i].T)[:3, 3] for i, node in enumerate(skin['joints'])}


def rotation_between(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9: return np.eye(3)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k * (1 / (1 + c))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('game', type=Path); parser.add_argument('body', type=Path); parser.add_argument('output', type=Path)
    args = parser.parse_args()
    old, new = eq.Glb(args.game), eq.Glb(args.body)

    old_points, old_joints, old_weights = body_vertices(old)
    primitive = new.doc['meshes'][0]['primitives'][0]
    points = new.accessor(primitive['attributes']['POSITION']).astype(np.float64)
    normals = new.accessor(primitive['attributes']['NORMAL']).astype(np.float64)
    uvs = new.accessor(primitive['attributes']['TEXCOORD_0'])
    indices = new.accessor(primitive['indices']).astype(np.uint32).reshape(-1)

    # 1. Align on the fists (the hands carry the bones that matter most) and the ground.
    new_l, new_r = fists(points, np.median(points[:, 2]))
    old_l, old_r = (old_fist(old, old_points, name) for name in ('L_Hand', 'R_Hand'))
    old_ground, new_ground = old_points[:, 1].min(), points[:, 1].min()
    span = np.linalg.norm(old_l - old_r) / np.linalg.norm(new_l - new_r)
    rise = ((old_l[1] + old_r[1]) / 2 - old_ground) / ((new_l[1] + new_r[1]) / 2 - new_ground)
    scale = (span + rise) / 2
    old_mid, new_mid = (old_l + old_r) / 2, (new_l + new_r) / 2
    offset = np.array([old_mid[0] - new_mid[0] * scale, old_ground - new_ground * scale, old_mid[2] - new_mid[2] * scale])
    aligned = points * scale + offset

    # 2. Skin: inverse-distance blend of the nearest old vertices' weights.
    tree = cKDTree(old_points)
    nodes = sorted(set(old_joints.reshape(-1).tolist()))
    column = {node: i for i, node in enumerate(nodes)}
    joint_columns = np.vectorize(column.get)(old_joints)
    def skin(at):
        distance, nearest = tree.query(at, k=NEIGHBOURS)
        influence = 1 / np.maximum(distance, 1e-4) ** 2
        dense = np.zeros((len(at), len(nodes)))
        for k in range(NEIGHBOURS):
            for c in range(4):
                np.add.at(dense, (np.arange(len(at)), joint_columns[nearest[:, k], c]), influence[:, k] * old_weights[nearest[:, k], c])
        return dense / dense.sum(1, keepdims=True), distance

    # The arms hang at a slightly different angle: turn each about its shoulder so
    # the fist lands on the old fist, blended by how much the vertex follows the arm.
    names = {i: node['name'] for i, node in enumerate(old.doc['nodes'])}
    joints_bind = bind_positions(old)
    dense, distance = skin(aligned)
    arm_turns = {}
    for side, new_fist, old_fist_at in (('L', new_l, old_l), ('R', new_r, old_r)):
        shoulder = joints_bind[f'{side}_Upperarm']
        chain = [column[n] for n in nodes if names[n].startswith((f'{side}_Upperarm', f'{side}_Forearm', f'{side}_Hand'))]
        follow = dense[:, chain].sum(1)
        source = new_fist * scale + offset - shoulder; target = old_fist_at - shoulder
        rotation = rotation_between(source, target); stretch = np.linalg.norm(target) / np.linalg.norm(source)
        moved = shoulder + ((aligned - shoulder) @ rotation.T) * stretch
        aligned = aligned + (moved - aligned) * follow[:, None]
        normals = normals + ((normals @ rotation.T) - normals) * follow[:, None]
        arm_turns[side] = {'degrees': float(np.degrees(np.arccos(np.clip(np.dot(source, target) / np.linalg.norm(source) / np.linalg.norm(target), -1, 1)))), 'stretch': float(stretch)}
    normals = normals / np.linalg.norm(normals, axis=1, keepdims=True)
    dense, distance = skin(aligned)
    # The old right fist was skinned to the forearm twist, away from the sword grip on
    # R_Hand. Give the new fist to the hand bone, as on the left, fading in past the wrist.
    elbow, wrist = joints_bind['R_Forearm'], joints_bind['R_Hand']
    along = (wrist - elbow) / np.linalg.norm(wrist - elbow)
    past = (aligned - wrist) @ along
    radial = np.linalg.norm((aligned - wrist) - past[:, None] * along, axis=1)
    hand = np.clip((past + .01) / .03, 0, 1) * (radial < .09)
    hand_column = column[next(n for n in nodes if names[n] == 'R_Hand')] if any(names[n] == 'R_Hand' for n in nodes) else None
    if hand_column is None:
        nodes.append(next(i for i, name in names.items() if name == 'R_Hand')); hand_column = len(nodes) - 1
        dense = np.concatenate([dense, np.zeros((len(dense), 1))], axis=1)
    dense *= (1 - hand)[:, None]; dense[:, hand_column] += hand
    top = np.argsort(-dense, axis=1)[:, :4]
    top_weights = np.take_along_axis(dense, top, axis=1)
    top_weights /= top_weights.sum(1, keepdims=True)
    # The skin that holds every body joint.
    skin_index = next(i for i, skin in enumerate(old.doc['skins']) if set(nodes) <= set(skin['joints']))
    skin_joints = old.doc['skins'][skin_index]['joints']
    joint_node = np.asarray(nodes)[top]
    skin_slot = {node: i for i, node in enumerate(skin_joints)}
    joint_slots = np.vectorize(skin_slot.get)(joint_node).astype(np.uint16)

    # 3. Write the new body into the game file.
    material = json.loads(json.dumps(new.doc['materials'][primitive.get('material', 0)]))
    def remap(info):
        texture = new.doc['textures'][info['index']]; image = new.doc['images'][texture['source']]
        view = new.doc['bufferViews'][image['bufferView']]
        data = bytes(new.binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']])
        info['index'] = append_image(old, data, image.get('mimeType', 'image/png'), f'base_body_{info["index"]}')
    pbr = material.get('pbrMetallicRoughness', {})
    for key in ('baseColorTexture', 'metallicRoughnessTexture'):
        if key in pbr: remap(pbr[key])
    if 'normalTexture' in material: remap(material['normalTexture'])
    material['name'] = 'base_body_linen'
    old.doc['materials'].append(material)
    attributes = {
        'POSITION': append(old, aligned.astype('<f4'), 'VEC3', target=34962),
        'NORMAL': append(old, normals.astype('<f4'), 'VEC3', target=34962),
        'TEXCOORD_0': append(old, uvs.astype('<f4'), 'VEC2', target=34962),
        'JOINTS_0': append(old, joint_slots, 'VEC4', component=5123, target=34962),
        'WEIGHTS_0': append(old, top_weights.astype('<f4'), 'VEC4', target=34962),
    }
    index_accessor = append(old, indices.astype('<u4'), 'SCALAR', component=5125, target=34963)
    old.doc['meshes'].append({'name': 'base_body', 'primitives': [{'attributes': attributes, 'indices': index_accessor, 'material': len(old.doc['materials']) - 1}]})
    removed = []
    for node in old.doc['nodes']:
        if 'mesh' in node and 'skin' in node:
            removed.append(node['name']); del node['mesh']; del node['skin']
    armature = next(i for i, node in enumerate(old.doc['nodes']) if node.get('name') == 'Armature')
    old.doc['nodes'].append({'name': 'base_body', 'mesh': len(old.doc['meshes']) - 1, 'skin': skin_index, 'extras': {'sourcePart': 'base_body'}})
    old.doc['nodes'][armature].setdefault('children', []).append(len(old.doc['nodes']) - 1)
    # The head socket (crowns) was measured on the old hood; seat it on the new hair.
    world = eq.world_matrices(old.doc)
    index = {node.get('name'): i for i, node in enumerate(old.doc['nodes'])}
    to_armature = np.linalg.inv(world[armature])
    head_vertices = aligned[joint_node[np.arange(len(aligned)), 0] == index['Head']]
    crown = head_vertices[head_vertices[:, 1] > head_vertices[:, 1].max() - .06]
    socket = index['TripoHeadSocket']
    seat = to_armature @ world[socket]
    target = np.array([crown[:, 0].mean(), head_vertices[:, 1].max() - .035, crown[:, 2].mean()])
    seat[:3, 3] = target
    parent = next(i for i, node in enumerate(old.doc['nodes']) if socket in node.get('children', []))
    local = np.linalg.inv(to_armature @ world[parent]) @ seat
    node = old.doc['nodes'][socket]
    for key in ('translation', 'rotation', 'scale'): node.pop(key, None)
    node['matrix'] = local.T.reshape(-1).tolist()
    old.save(args.output)
    report = {'headSocket': target.round(4).tolist(), 'rightFistVertices': int((hand > .5).sum()), 'armTurns': arm_turns, 'scale': scale, 'offset': offset.tolist(), 'span': span, 'rise': rise, 'removed': removed, 'skin': skin_index,
              'vertices': len(aligned), 'triangles': len(indices) // 3, 'meanNeighbourDistance': float(distance[:, 0].mean()),
              'p95NeighbourDistance': float(np.percentile(distance[:, 0], 95))}
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
