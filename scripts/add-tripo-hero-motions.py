"""Add fresh Tripo v1.0 retarget clips to the finished game hero.

Each source is a GLB from scripts/blender/fbx_motion_to_glb.py. Its rest
skeleton matches tripo-hero-game.glb bone for bone, so body channels transfer
by bone name. The hero's mesh, sockets, cape skin and existing clips stay
unchanged. Horizontal Hip travel is removed (gameplay moves the hero), the
vertical bob stays, and provider scale tracks are dropped.

--review appends every clip untrimmed as `raw:<name>` for inspection.

Sources (October 23 2026; school casts October 24 2026): native rig task b2cf2e29-0960-44bc-8cbd-aa22b94cf9e2
(v1.0-20240301), one FBX retarget per `preset:biped:<clip>` (10 credits
each), converted by scripts/blender/fbx_motion_to_glb.py. Input --hero is the
four-clip tripo-hero-game.glb from commit 414a3ea.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


Glb = load('prepare', 'prepare-tripo-equipment.py').Glb
cape_quat = load('cape', 'rig-tripo-cape.py').quat

# Source keys (s) map onto game keys (s) piecewise-linearly; a loop closes on
# its first pose. `damp` pulls each listed bone toward its mean rotation.
SWORD_ARM = ('R_Clavicle', 'R_Upperarm', 'R_Forearm', 'R_Hand')
CLIPS = {
    # The provider run flails the sword overhead; keep a carried swing.
    'run': dict(clip='run', loop=True, cape=.035, damp=(SWORD_ARM, .6)),
    # Forward roll for a dodge, retimed from two seconds to one.
    'dodge': dict(clip='dive', keys=([.45, 2.45], [0, 1.0])),
    'hit': dict(clip='hit_to_body_01', keys=([.12, 1.1], [0, .62])),
    'hit-side': dict(clip='hit_to_side', keys=([.15, 1.1], [0, .62])),
    'hit-heavy': dict(clip='hit_to_head', keys=([0, 1.6], [0, 1.05])),
    'knockdown': dict(clip='fall', keys=([.2, 2.1], [0, 1.45]), cape=0),
    'victory': dict(clip='victory_celebration', keys=([.3, 1.63, 4.1, 5.3], [0, .7, 2.6, 3.4])),
    'idle-look': dict(clip='look_around', loop=True, cape=.013),
    # School casts. Each release lands at .45 s, the release of the authored
    # `cast` clip, so spell effects keep their timing.
    'cast-throw': dict(clip='pitch_baseball', keys=([.95, 1.5, 1.9, 2.2, 2.35], [0, .3, .45, .62, .95]), cape=.05),
    'cast-raise': dict(clip='basketball_shot', keys=([1.1, 1.8, 2.4, 3.0, 3.6], [0, .3, .5, .85, 1.25]), cape=.05),
    'cast-thrust': dict(clip='box_01', keys=([.15, .45, .65, 1.0, 1.5], [0, .25, .42, .7, 1.1]), cape=.04),
}


def append(glb: Glb, values: np.ndarray, kind: str) -> int:
    values = np.ascontiguousarray(values, dtype='<f4')
    glb.binary.extend(b'\0' * (-len(glb.binary) % 4))
    glb.doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(glb.binary), 'byteLength': values.nbytes})
    glb.binary.extend(values.tobytes())
    accessor = {'bufferView': len(glb.doc['bufferViews']) - 1, 'componentType': 5126,
                'count': len(values), 'type': kind}
    if kind == 'SCALAR':
        accessor.update(min=[float(values.min())], max=[float(values.max())])
    glb.doc['accessors'].append(accessor)
    return len(glb.doc['accessors']) - 1


def sample(times, values, at, rotation=False):
    i = np.clip(np.searchsorted(times, at, side='right') - 1, 0, len(times) - 2)
    mix = np.clip((at - times[i]) / max(float(times[i + 1] - times[i]), 1e-8), 0, 1)
    a, b = values[i].copy(), values[i + 1].copy()
    if rotation and np.dot(a, b) < 0:
        b = -b
    result = a * (1 - mix) + b * mix
    return result / max(np.linalg.norm(result), 1e-8) if rotation else result


def cape_channels(glb: Glb, duration: float, loop: bool, amplitude: float):
    """Secondary sway for the three cloth hinges from rig-tripo-cape.py."""
    hinges = [i for i, n in enumerate(glb.doc['nodes']) if n.get('name', '').startswith('TripoCape')]
    times = np.linspace(0, duration, max(33, math.ceil(duration * 30) + 1), dtype=np.float32)
    time_accessor = append(glb, times.reshape(-1, 1), 'SCALAR')
    for level, node in enumerate(hinges):
        values = []
        for t in times:
            phase = float(t) / duration * math.tau
            envelope = 1 if loop else math.sin(math.pi * float(t) / duration) ** 2
            magnitude = amplitude * (1 + level * .45) * envelope
            values.append(cape_quat(magnitude * math.sin(phase - level * .55), magnitude * .30 * math.sin(phase * 2 - level * .4)))
        if loop:
            values[-1] = values[0]
        yield time_accessor, append(glb, np.array(values), 'VEC4'), node


def transfer(game: Glb, source: Glb, name: str, keys=None, loop=False, cape=.02, damp=((), 0)):
    names = {n.get('name'): i for i, n in enumerate(game.doc['nodes'])}
    clip = source.doc['animations'][0]
    hip_rest = np.array(game.doc['nodes'][names['Hip']]['translation'], dtype='<f4')
    animation = {'name': name, 'channels': [], 'samplers': []}
    duration = 0.
    for channel in clip['channels']:
        path = channel['target']['path']
        bone = source.doc['nodes'][channel['target']['node']].get('name')
        if path == 'scale' or bone not in names:
            continue
        sampler = clip['samplers'][channel['sampler']]
        times = source.accessor(sampler['input']).ravel()
        values = source.accessor(sampler['output']).astype('<f4')
        if bone == 'Hip' and path == 'translation':
            # Z is up in Hip's parent space. Keep the bob, drop travel.
            values[:, :2] = hip_rest[:2]
        if path == 'rotation' and bone in damp[0]:
            mean = values * np.where((values @ values[0]) < 0, -1, 1)[:, None]
            mean = mean.mean(0); mean /= np.linalg.norm(mean)
            values = np.array([sample(np.array([0., 1.]), np.array([v, mean]), damp[1], True) for v in values], dtype='<f4')
        if keys is not None:
            source_keys, target_keys = keys
            start, end = source_keys[0], source_keys[-1]
            at = np.unique(np.concatenate(([start, end], times[(times > start) & (times < end)], source_keys)))
            new_times = np.interp(at, source_keys, target_keys)
            values = np.array([sample(times, values, t, path == 'rotation') for t in at], dtype='<f4')
            times = new_times
        if loop:
            values[-1] = values[0]
        duration = max(duration, float(times[-1]))
        animation['channels'].append({'sampler': len(animation['samplers']),
                                      'target': {'node': names[bone], 'path': path}})
        animation['samplers'].append({'input': append(game, times.reshape(-1, 1), 'SCALAR'),
                                      'output': append(game, values, 'VEC4' if path == 'rotation' else 'VEC3'),
                                      'interpolation': 'LINEAR'})
    if cape:
        for time_accessor, output, node in cape_channels(game, duration, loop, cape):
            animation['channels'].append({'sampler': len(animation['samplers']), 'target': {'node': node, 'path': 'rotation'}})
            animation['samplers'].append({'input': time_accessor, 'output': output, 'interpolation': 'LINEAR'})
    game.doc['animations'].append(animation)
    return duration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hero', type=Path, required=True)
    parser.add_argument('--motions', type=Path, required=True, help='directory of <clip>/<clip>.glb')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--review', action='store_true')
    args = parser.parse_args()
    game = Glb(args.hero)
    if any(a['name'] in CLIPS for a in game.doc.get('animations', [])):
        raise SystemExit('Input already has added motions; start from the four-clip hero in git history.')
    added = {}
    if args.review:
        for path in sorted(args.motions.glob('*/*.glb')):
            added[f'raw:{path.stem}'] = transfer(game, Glb(path), f'raw:{path.stem}', cape=0)
    else:
        for name, options in CLIPS.items():
            clip = options.pop('clip')
            added[name] = transfer(game, Glb(args.motions / clip / f'{clip}.glb'), name, **options)
        motion = game.doc.setdefault('extras', {}).setdefault('tripoGameMotion', {})
        motion['clips'] = [a['name'] for a in game.doc['animations']]
        motion['addedClips'] = {k: round(v, 3) for k, v in added.items()}
    game.save(args.out)
    print(json.dumps({'output': str(args.out), 'clips': {k: round(v, 3) for k, v in added.items()}}))


if __name__ == '__main__':
    main()
