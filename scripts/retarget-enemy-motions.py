"""Retarget Tripo hero motions onto the authored enemy rigs.

The enemies (skeleton, revenant, guardian, vault-guardian-boss) share one
18-bone humanoid rig (Pelvis, Spine, Chest, Head, UpperArm/Forearm/Hand,
Thigh/Shin/Foot). The sources are the Tripo v1.0 clips already bought for
the hero (see add-tripo-hero-motions.py). The rigs differ in proportion and
bone roll, so each bone transfers its world-space rotation change:

    target_world(t) = source_world(t) * source_rest^-1 * align * target_rest

`align` turns the target bone's rest direction onto the source bone's rest
direction, so a source pose reproduces on the target limb by limb. Pelvis
height scales by leg length. Loops keep only vertical pelvis motion; one-shots
keep their travel (a fall moves backwards). Cloth, weapon and shield bones
follow their parents.

Run from a clean copy of each enemy GLB (the script refuses a file that
already has clips):

    uv run -q --with numpy python scripts/retarget-enemy-motions.py \
        --motions assets/tripo-hero-motions --hero assets/tripo-hero-motions/tripo-hero-game.glb \
        web/public/assets/rpg/skeleton.glb ...
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('prepare', ROOT / 'prepare-tripo-equipment.py')
prepare = importlib.util.module_from_spec(spec); spec.loader.exec_module(prepare)
Glb = prepare.Glb

# target bone: (source bone, source child for direction, target child for direction)
BONES = {
    'Pelvis': ('Hip', None, None),
    'Spine': ('Spine01', 'Spine02', 'Chest'),
    'Chest': ('Spine02', 'Head', 'Head'),
    'Head': ('Head', None, None),
    **{f'UpperArm{s}': (f'{s}_Upperarm', f'{s}_Forearm', f'Forearm{s}') for s in 'LR'},
    **{f'Forearm{s}': (f'{s}_Forearm', f'{s}_Hand', f'Hand{s}') for s in 'LR'},
    **{f'Hand{s}': (f'{s}_Hand', None, None) for s in 'LR'},
    **{f'Thigh{s}': (f'{s}_Thigh', f'{s}_Calf', f'Shin{s}') for s in 'LR'},
    **{f'Shin{s}': (f'{s}_Calf', f'{s}_Foot', f'Foot{s}') for s in 'LR'},
    **{f'Foot{s}': (f'{s}_Foot', None, None) for s in 'LR'},
}

# name: source file (None = the hero game GLB), source clip, keys (source s -> game s), loop
CLIPS = {
    'idle': dict(source=None, clip='idle', loop=True),
    'walk': dict(source=None, clip='walk', loop=True),
    'run': dict(source=None, clip='run', loop=True),
    # The provider slash reads as a bow from the game camera; the hero cleave is a clean strike.
    'attack': dict(source=None, clip='cleave'),
    'hit': dict(source=None, clip='hit'),
    'hit-side': dict(source=None, clip='hit-side'),
    # defeat_02 only staggers; defeat_03 falls forward, fall falls backward. Both
    # land before the 1.2 s dissolve in hitReactions.ts begins.
    'death': dict(source='defeat_03', keys=([0, 3.75], [0, 1.3])),
    'death-fall': dict(source='fall', keys=([.2, 2.4], [0, 1.25])),
}
FPS = 30


def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(a, -1, 0); bx, by, bz, bw = np.moveaxis(b, -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz], -1)


def qinv(q):
    return q * np.array([-1, -1, -1, 1.])


def qrot(q, v):
    p = np.concatenate([v, np.zeros(v.shape[:-1] + (1,))], -1)
    return qmul(qmul(q, p), qinv(q))[..., :3]


def qbetween(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    q = np.concatenate([np.cross(a, b), [1 + float(a @ b)]])
    return q / np.linalg.norm(q)


def sample(times, values, at, rotation):
    i = np.clip(np.searchsorted(times, at, side='right') - 1, 0, max(len(times) - 2, 0))
    if len(times) == 1:
        return values[0]
    mix = np.clip((at - times[i]) / max(float(times[i + 1] - times[i]), 1e-8), 0, 1)
    a, b = values[i], values[i + 1].copy()
    if rotation and a @ b < 0:
        b = -b
    v = a * (1 - mix) + b * mix
    return v / np.linalg.norm(v) if rotation else v


class Rig:
    """Node hierarchy with rest TRS and forward kinematics."""

    def __init__(self, glb: Glb):
        self.glb = glb
        self.nodes = glb.doc['nodes']
        self.parent = {c: i for i, n in enumerate(self.nodes) for c in n.get('children', [])}
        self.index = {n.get('name'): i for i, n in enumerate(self.nodes)}
        self.order = sorted(range(len(self.nodes)), key=self.depth)
        self.rest = [self.trs(n) for n in self.nodes]
        self._tracks = {}

    def depth(self, i):
        d = 0
        while i in self.parent:
            i = self.parent[i]; d += 1
        return d

    @staticmethod
    def trs(node):
        if 'matrix' in node:
            m = np.array(node['matrix'], float).reshape(4, 4).T
            scale = np.linalg.norm(m[:3, :3], axis=0)
            r = m[:3, :3] / scale
            w = np.sqrt(max(1e-12, 1 + r[0, 0] + r[1, 1] + r[2, 2])) / 2
            q = np.array([(r[2, 1] - r[1, 2]) / (4 * w), (r[0, 2] - r[2, 0]) / (4 * w), (r[1, 0] - r[0, 1]) / (4 * w), w])
            return m[:3, 3].copy(), q / np.linalg.norm(q), scale
        return (np.array(node.get('translation', [0, 0, 0.]), float), np.array(node.get('rotation', [0, 0, 0, 1.]), float),
                np.array(node.get('scale', [1, 1, 1.]), float))

    def world(self, local):
        """local: list of (t, r, s) per node -> world (position, rotation, scale) per node."""
        out = [None] * len(self.nodes)
        for i in self.order:
            t, r, s = local[i]
            if i in self.parent:
                pt, pr, ps = out[self.parent[i]]
                out[i] = (pt + qrot(pr, ps * t), qmul(pr, r), ps * s)
            else:
                out[i] = (t, r, s)
        return out

    def tracks(self, animation):
        key = id(animation)
        if key not in self._tracks:
            self._tracks[key] = [(c['target']['node'], {'translation': 0, 'rotation': 1, 'scale': 2}[c['target']['path']],
                                  self.glb.accessor(animation['samplers'][c['sampler']]['input']).ravel(),
                                  self.glb.accessor(animation['samplers'][c['sampler']]['output']).astype(float))
                                 for c in animation['channels'] if c['target']['path'] != 'weights']
        return self._tracks[key]

    def pose(self, animation, at):
        local = [list(x) for x in self.rest]
        for node, slot, times, values in self.tracks(animation):
            local[node][slot] = sample(times, values, at, slot == 1)
        return local


def append(glb: Glb, values: np.ndarray, kind: str) -> int:
    values = np.ascontiguousarray(values, dtype='<f4')
    glb.binary.extend(b'\0' * (-len(glb.binary) % 4))
    glb.doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(glb.binary), 'byteLength': values.nbytes})
    glb.binary.extend(values.tobytes())
    accessor = {'bufferView': len(glb.doc['bufferViews']) - 1, 'componentType': 5126, 'count': len(values), 'type': kind}
    if kind == 'SCALAR':
        accessor.update(min=[float(values.min())], max=[float(values.max())])
    glb.doc['accessors'].append(accessor)
    return len(glb.doc['accessors']) - 1


def retarget(target: Rig, source: Rig, animation, name, keys=None, loop=False):
    src_rest = source.world(source.rest)
    tgt_rest = target.world(target.rest)
    S, T = source.index, target.index
    leg = lambda rig, rest, hip, foot: rest[rig.index[hip]][0][1] - rest[rig.index[foot]][0][1]
    ratio = leg(target, tgt_rest, 'Pelvis', 'FootL') / leg(source, src_rest, 'Hip', 'L_Foot')
    align = {}
    for bone, (src, src_child, tgt_child) in BONES.items():
        if src_child is None:
            align[bone] = np.array([0, 0, 0, 1.])
            continue
        d_src = src_rest[S[src_child]][0] - src_rest[S[src]][0]
        d_tgt = tgt_rest[T[tgt_child]][0] - tgt_rest[T[bone]][0]
        align[bone] = qbetween(d_tgt, d_src)

    duration_src = max(float(source.glb.accessor(s['input']).max()) for s in animation['samplers'])
    if keys is None:
        keys = ([0, duration_src], [0, duration_src])
    source_keys, game_keys = keys
    game_times = np.arange(0, game_keys[-1] + 1e-6, 1 / FPS)
    if game_times[-1] < game_keys[-1] - 1e-4:
        game_times = np.append(game_times, game_keys[-1])
    source_times = np.interp(game_times, game_keys, source_keys)

    order = [i for i in target.order if target.nodes[i].get('name') in BONES]
    rotations = {T[b]: [] for b in BONES}
    pelvis = []
    for at in source_times:
        src = source.world(source.pose(animation, at))
        local = [list(x) for x in target.rest]
        for i in order:
            bone = target.nodes[i]['name']
            s = S[BONES[bone][0]]
            delta = qmul(src[s][1], qinv(src_rest[s][1]))
            want = qmul(qmul(delta, align[bone]), tgt_rest[i][1])
            parent_rotation = target.world(local)[target.parent[i]][1] if i in target.parent else np.array([0, 0, 0, 1.])
            local[i][1] = qmul(qinv(parent_rotation), want)
            local[i][1] /= np.linalg.norm(local[i][1])
            rotations[i].append(local[i][1].copy())
        travel = (src[S['Hip']][0] - src_rest[S['Hip']][0]) * ratio
        if loop:
            travel[[0, 2]] = 0
        p = T['Pelvis']
        world_target = tgt_rest[p][0] + travel
        if p in target.parent:
            pt, pr, ps = target.world(target.rest)[target.parent[p]]
            world_target = qrot(qinv(pr), world_target - pt) / ps
        pelvis.append(world_target)

    anim = {'name': name, 'channels': [], 'samplers': []}
    time_accessor = append(target.glb, game_times.reshape(-1, 1), 'SCALAR')
    for node, values in rotations.items():
        values = np.array(values)
        for k in range(1, len(values)):
            if values[k] @ values[k - 1] < 0:
                values[k] = -values[k]
        if loop:
            values[-1] = values[0]
        anim['samplers'].append({'input': time_accessor, 'output': append(target.glb, values, 'VEC4'), 'interpolation': 'LINEAR'})
        anim['channels'].append({'sampler': len(anim['samplers']) - 1, 'target': {'node': node, 'path': 'rotation'}})
    pelvis = np.array(pelvis)
    if loop:
        pelvis[-1] = pelvis[0]
    anim['samplers'].append({'input': time_accessor, 'output': append(target.glb, pelvis, 'VEC3'), 'interpolation': 'LINEAR'})
    anim['channels'].append({'sampler': len(anim['samplers']) - 1, 'target': {'node': T['Pelvis'], 'path': 'translation'}})
    target.glb.doc.setdefault('animations', []).append(anim)
    return float(game_times[-1])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--motions', type=Path, required=True, help='directory of <clip>/<clip>.glb')
    parser.add_argument('--hero', type=Path, required=True, help='the 12-clip tripo-hero-game.glb')
    parser.add_argument('--out-dir', type=Path, help='write here instead of in place')
    parser.add_argument('--raw', help='comma list of source clips to add untrimmed as raw:<name>, for review')
    parser.add_argument('enemies', type=Path, nargs='+')
    args = parser.parse_args()
    clips = {f'raw:{n}': dict(source=n) for n in args.raw.split(',')} if args.raw else CLIPS
    hero = Rig(Glb(args.hero))
    hero_clips = {a['name']: a for a in hero.glb.doc['animations']}
    raw = {}
    for path in args.enemies:
        target = Rig(Glb(path))
        if target.glb.doc.get('animations'):
            raise SystemExit(f'{path} already has clips; restore it from git first.')
        added = {}
        for name, options in clips.items():
            if options['source'] is None:
                source, animation = hero, hero_clips[options['clip']]
            else:
                if options['source'] not in raw:
                    raw[options['source']] = Rig(Glb(args.motions / options['source'] / f'{options["source"]}.glb'))
                source = raw[options['source']]; animation = source.glb.doc['animations'][0]
            added[name] = round(retarget(target, source, animation, name, options.get('keys'), options.get('loop', False)), 3)
        target.glb.doc.setdefault('extras', {})['enemyMotion'] = {'source': 'Tripo v1.0 hero clips, retargeted by scripts/retarget-enemy-motions.py', 'clips': added}
        out = (args.out_dir / path.name) if args.out_dir else path
        out.parent.mkdir(parents=True, exist_ok=True)
        target.glb.save(out)
        print(json.dumps({'output': str(out), 'clips': added}))


if __name__ == '__main__':
    main()
