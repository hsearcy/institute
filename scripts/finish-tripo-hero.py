"""Trim/retime fresh Tripo motions for the RPG; preserve all new mesh/rig data.

Input is prepare-tripo-equipment.py output. No old hero animation is read.
"""
import argparse, json, struct
from pathlib import Path
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('input', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
raw = args.input.read_bytes()
json_length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + json_length])
binary = bytearray(raw[28 + json_length:])

def read(index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
    return np.ndarray((a['count'], width), dtype='<f4', buffer=binary,
                      offset=view.get('byteOffset', 0) + a.get('byteOffset', 0),
                      strides=(view.get('byteStride', width * 4), 4)).copy()

def append(values, kind):
    values = np.asarray(values, dtype='<f4')
    binary.extend(b'\0' * (-len(binary) % 4))
    offset = len(binary)
    binary.extend(values.tobytes())
    doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': values.nbytes})
    accessor = {'bufferView': len(doc['bufferViews']) - 1, 'componentType': 5126,
                'count': len(values), 'type': kind}
    if kind == 'SCALAR':
        accessor.update(min=[float(values.min())], max=[float(values.max())])
    doc['accessors'].append(accessor)
    return len(doc['accessors']) - 1

def sample(times, values, at, rotation=False):
    i = np.clip(np.searchsorted(times, at, side='right') - 1, 0, len(times) - 2)
    mix = np.clip((at - times[i]) / max(float(times[i + 1] - times[i]), 1e-8), 0, 1)
    a, b = values[i].copy(), values[i + 1].copy()
    if rotation and np.dot(a, b) < 0:
        b = -b
    result = a * (1 - mix) + b * mix
    return result / max(np.linalg.norm(result), 1e-8) if rotation else result

source = {a['name'].split(':')[-1]: a for a in doc['animations']}
idle_pose = {}
for channel in source['idle']['channels']:
    sampler = source['idle']['samplers'][channel['sampler']]
    node, path = channel['target']['node'], channel['target']['path']
    idle_pose[(node, path)] = (np.array(doc['nodes'][node]['translation'], dtype='<f4')
                             if doc['nodes'][node].get('name') == 'Hip' and path == 'translation'
                             else read(sampler['output'])[0])

specs = [
    ('idle', 'idle', [1 / 24, 15.375], [0, 15.375 - 1 / 24]),
    # Two peaks are 28 frames apart. Keep one complete measured gait cycle.
    ('walk', 'walk', [7 / 24, 35 / 24], [0, 28 / 24]),
    # Right-hand speed peaks at source 2.125s; contact in gameplay is .18s.
    ('slash', 'cleave', [1.25, 2.125, 2.5, 3.5, 5.5, 6.625], [0, .18, .34, .64, 1.02, 1.2]),
    # First left-palm extension is the spell release; do not play the later
    # second gesture or swing the equipped sword with the casting hand.
    ('cast_a_spell', 'cast', [.25, .95, 1.65, 2.05], [0, .18, .35, .65]),
]
finished = []
for old_name, name, source_keys, target_keys in specs:
    old = source[old_name]
    animation = {'name': name, 'channels': [], 'samplers': []}
    for channel in old['channels']:
        sampler = old['samplers'][channel['sampler']]
        times, values = read(sampler['input']).ravel(), read(sampler['output'])
        path, node = channel['target']['path'], channel['target']['node']
        # Tripo's in-place export zeroes Hip height as well as travel. Restore
        # the measured bind origin while retaining the new clip's relative bob.
        if doc['nodes'][node].get('name') == 'Hip' and path == 'translation':
            values += np.array(doc['nodes'][node]['translation']) - values[0]
        start, end = source_keys[0], source_keys[-1]
        source_times = np.unique(np.concatenate(([start, end], times[(times > start) & (times < end)], source_keys)))
        new_times = np.interp(source_times, source_keys, target_keys)
        new_values = np.array([sample(times, values, t, path == 'rotation') for t in source_times])
        if name in ('idle', 'walk'):
            new_values[-1] = new_values[0]
        if name == 'cast':
            node_name = doc['nodes'][node].get('name', '')
            casting_bone = node_name.startswith(('L_Upperarm', 'L_Forearm', 'L_Clavicle', 'L_Hand', 'Spine', 'Neck', 'Head'))
            rest = idle_pose[(node, path)]
            if not casting_bone:
                new_values[:] = rest
            new_times = np.append(new_times, [1.0, 1.25])
            new_values = np.vstack([new_values, rest, rest])
        input_index = append(new_times, 'SCALAR')
        output_index = append(new_values, 'VEC4' if path == 'rotation' else 'VEC3')
        animation['channels'].append({'sampler': len(animation['samplers']), 'target': channel['target']})
        animation['samplers'].append({'input': input_index, 'output': output_index, 'interpolation': 'LINEAR'})
    finished.append(animation)
doc['animations'] = finished
doc.setdefault('extras', {})['tripoGameMotion'] = {
    'source': 'Tripo native rig and retarget presets, September 12 2026',
    'previousHeroAnimationUsed': False,
    'walkSourceRange': [7 / 24, 35 / 24], 'walkDuration': 28 / 24,
    'cleaveSourceStrike': 2.125, 'cleaveRelease': .18,
    'castRelease': .35, 'clips': ['idle', 'walk', 'cast', 'cleave'],
}
doc['buffers'] = [{'byteLength': len(binary)}]
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
binary.extend(b'\0' * (-len(binary) % 4))
output = struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
output += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
output += struct.pack('<II', len(binary), 0x004E4942) + binary
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_bytes(output)
print(json.dumps({'output': str(args.output), 'bytes': len(output), 'motion': doc['extras']['tripoGameMotion']}))
