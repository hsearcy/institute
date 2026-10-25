"""Body regions shared by the base-hero build and the worn-set build.

The hero body is split into seven regions that gear pieces replace whole:
head (helm), chest (waist up, with the upper arms and forearms to their
middle), gloves (lower forearms and hands), hips (waist to mid-thigh), legs
(mid-thigh to just under the knee), shins (down to above the ankle) and feet.
A chest piece also carries hips (a tunic's skirt); pants carry hips, legs,
shins and feet; boots carry shins and feet. The game picks which piece shows
in a shared region. Both builds classify
points in the rig's bind space with this one rule, so the cut lines of the
plain body and of every dressed model meet.
"""
import numpy as np

REGIONS = ('head', 'chest', 'gloves', 'hips', 'legs', 'shins', 'feet', 'neck')


def _segment_distance(points, a, b):
    ab = b - a
    t = np.clip(((points - a) @ ab) / max(float(ab @ ab), 1e-12), 0, 1)
    return np.linalg.norm(a + t[:, None] * ab - points, axis=1), t


def classify(points, joint):
    """Region index per point. `joint(name)` returns a bind-space bone head (x, y, z).
    Up is the axis along which Head sits above Hip."""
    points = np.asarray(points, dtype=np.float64)
    j = {name: np.asarray(joint(name), dtype=np.float64) for name in (
        'Hip', 'Spine01', 'Spine02', 'NeckTwist01', 'Head', 'L_Upperarm', 'L_Forearm', 'L_Hand', 'R_Upperarm', 'R_Forearm', 'R_Hand',
        'L_Thigh', 'L_Calf', 'L_Foot', 'L_ToeBase', 'R_Thigh', 'R_Calf', 'R_Foot', 'R_ToeBase')}
    up = j['Head'] - j['Hip']; up /= np.linalg.norm(up)
    height = points @ up
    segments = []  # (name, a, b)
    chain = lambda name, *ps: segments.extend((name, a, b) for a, b in zip(ps, ps[1:]))
    chain('torso', j['Hip'], j['Spine01'], j['Spine02'], j['NeckTwist01'])
    chain('neck', j['NeckTwist01'], j['Head'])
    chain('head', j['Head'], j['Head'] + up * .14)
    for s in 'LR':
        hand = j[f'{s}_Hand'] + (j[f'{s}_Hand'] - j[f'{s}_Forearm']) / np.linalg.norm(j[f'{s}_Hand'] - j[f'{s}_Forearm']) * .07
        toe = j[f'{s}_ToeBase'] + (j[f'{s}_ToeBase'] - j[f'{s}_Foot']) / np.linalg.norm(j[f'{s}_ToeBase'] - j[f'{s}_Foot']) * .04
        chain('torso', j['Spine02'], j[f'{s}_Upperarm']); chain('torso', j['Hip'], j[f'{s}_Thigh'])
        chain('upperarm', j[f'{s}_Upperarm'], j[f'{s}_Forearm'])
        chain('forearm', j[f'{s}_Forearm'], j[f'{s}_Hand'])
        chain('hand', j[f'{s}_Hand'], hand)
        chain('thigh', j[f'{s}_Thigh'], j[f'{s}_Calf'])
        chain('calf', j[f'{s}_Calf'], j[f'{s}_Foot'])
        chain('foot', j[f'{s}_Foot'], j[f'{s}_ToeBase'], toe)
    best = np.full(len(points), np.inf); kind = np.empty(len(points), dtype=object); along = np.zeros(len(points))
    for name, a, b in segments:
        d, t = _segment_distance(points, a, b)
        closer = d < best
        best[closer] = d[closer]; kind[closer] = name; along[closer] = t[closer]
    hip = float(j['Hip'] @ up)
    chest_floor = hip - .09   # tunics and cuirasses reach mid-thigh
    calf_mid = float(j['L_Calf'] @ up) * .85 + float(j['L_Foot'] @ up) * .15  # just under the knee: tall boots fit
    waist = hip + .025       # the belt line: chest armour above, pants below
    region = np.full(len(points), REGIONS.index('chest'))
    # The neck goes with the head: a chest piece stops at the collar, so a dressed
    # model's chin and jaw never ride up over the hero's own face.
    region[(kind == 'head') | ((kind == 'neck') & (height > float(j['NeckTwist01'] @ up) + .01))] = REGIONS.index('head')
    # The rest of the neck always stays the hero's own: no piece replaces it.
    region[(kind == 'neck') & (height <= float(j['NeckTwist01'] @ up) + .01)] = REGIONS.index('neck')
    region[(kind == 'hand') | ((kind == 'forearm') & (along > .5))] = REGIONS.index('gloves')
    leg = np.isin(kind, ('thigh', 'calf', 'foot')) | ((kind == 'torso') & (height < waist))
    region[leg & (height < waist)] = REGIONS.index('hips')
    region[leg & (height < chest_floor)] = REGIONS.index('legs')
    feet_top = float(j['L_Foot'] @ up) + .055  # ankle boots reach about here
    region[leg & (height < calf_mid)] = REGIONS.index('shins')
    region[leg & (height < feet_top)] = REGIONS.index('feet')
    return region
