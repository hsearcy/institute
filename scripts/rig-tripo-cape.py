#!/usr/bin/env python3
"""Replace native Tripo cape arm weights with a measured spine/cape chain.

Only skin attributes, new joints/inverse binds, and secondary joint tracks are
added. Positions, normals, UVs, indices, equipment, and existing tracks survive
unchanged. Uses the current input rig; no previous hero assets or measurements.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np

_spec = importlib.util.spec_from_file_location('tripo_equipment', Path(__file__).with_name('prepare-tripo-equipment.py'))
_helpers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_helpers)
Glb, world_matrices = _helpers.Glb, _helpers.world_matrices


def append_accessor(glb, values, kind, component=5126, target=None):
    values = np.asarray(values, dtype='<f4' if component == 5126 else '<u2')
    glb.binary.extend(b'\0' * (-len(glb.binary) % 4))
    view = {'buffer': 0, 'byteOffset': len(glb.binary), 'byteLength': values.nbytes}
    if target is not None: view['target'] = target
    view_id = len(glb.doc['bufferViews'])
    glb.doc['bufferViews'].append(view)
    glb.binary.extend(values.tobytes())
    accessor = {'bufferView': view_id, 'componentType': component, 'count': len(values), 'type': kind}
    if kind == 'SCALAR': accessor.update(min=[float(values.min())], max=[float(values.max())])
    index = len(glb.doc['accessors'])
    glb.doc['accessors'].append(accessor)
    return index


def quat(pitch, sideways):
    # Local Z bend then local X side-sway; normalized analytic quaternion.
    z, x = pitch * .5, sideways * .5
    return [math.cos(z)*math.sin(x), math.sin(z)*math.sin(x), math.sin(z)*math.cos(x), math.cos(z)*math.cos(x)]


def multiply_quat(a, b):
    a, b = np.asarray(a), np.asarray(b)
    return np.r_[a[3]*b[:3]+b[3]*a[:3]+np.cross(a[:3],b[:3]), a[3]*b[3]-np.dot(a[:3],b[:3])]


def smooth01(value):
    value = float(np.clip(value,0,1))
    return value*value*(3-2*value)


def sample_channel(times, values, t, rotation=False):
    if t <= times[0]: return values[0]
    if t >= times[-1]: return values[-1]
    i = int(np.searchsorted(times, t, side='right') - 1)
    f = float((t-times[i])/(times[i+1]-times[i]))
    a, b = values[i], values[i+1]
    if rotation:
        dot = float(np.dot(a, b))
        if dot < 0: b, dot = -b, -dot
        if dot < .9995:
            angle = math.acos(np.clip(dot, -1, 1))
            return (a*math.sin((1-f)*angle)+b*math.sin(f*angle))/math.sin(angle)
        q = a*(1-f)+b*f
        return q/np.linalg.norm(q)
    return a*(1-f)+b*f


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--rigid-spine', action='store_true', help='Measured rigid fallback without secondary joints')
    args = parser.parse_args()
    glb = Glb(args.input)
    d = glb.doc
    if any(n.get('name', '').startswith('TripoCape') for n in d['nodes']): raise ValueError('Input already has a cape chain')
    cape_nodes = [(i,n) for i,n in enumerate(d['nodes']) if n.get('name') == 'tripo_part_0' and 'skin' in n]
    if len(cape_nodes) != 1: raise ValueError('Expected one skinned segmented cape')
    cape_id, cape_node = cape_nodes[0]
    primitive = d['meshes'][cape_node['mesh']]['primitives'][0]
    original_skin = d['skins'][cape_node['skin']]
    spine = next((i for i in original_skin['joints'] if d['nodes'][i].get('name') in ['Spine02','mixamorig:Spine2']), None)
    if spine is None: raise ValueError('No Spine02 joint in the authoritative skin.joints array')
    geometry_keys = ['POSITION','NORMAL','TEXCOORD_0']
    before = {key: glb.accessor(primitive['attributes'][key]).copy() for key in geometry_keys}
    original_indices = glb.accessor(primitive['indices']).copy()
    original_clips = copy.deepcopy(d.get('animations', []))
    positions = before['POSITION']
    world = world_matrices(d)
    mesh_world = world[cape_id]
    original_joints = glb.accessor(primitive['attributes']['JOINTS_0'])
    original_weights = glb.accessor(primitive['attributes']['WEIGHTS_0'])
    influences = {d['nodes'][original_skin['joints'][int(j)]]['name']: float(original_weights[original_joints == j].sum()) for j in np.unique(original_joints)}
    low, high = float(positions[:,1].min()), float(positions[:,1].max())
    span = high-low
    anchor_heights = [high-span*f for f in [.12,.48,.80]]
    joints = [spine]
    anchors = []
    if not args.rigid_spine:
        parent = spine
        for i, height in enumerate(anchor_heights):
            band = positions[np.abs(positions[:,1]-height) < span*.07]
            if not len(band): raise ValueError('No cape vertices near measured hinge height')
            point = np.median(band, axis=0); point[1] = height
            point_world = mesh_world @ np.r_[point, 1]
            parent_world = world_matrices(d)[parent]
            local = np.linalg.inv(parent_world) @ point_world
            index = len(d['nodes'])
            d['nodes'].append({'name': f'TripoCape{i+1}', 'translation': local[:3].tolist(), 'rotation': [0,0,0,1],
                               'extras': {'source': 'fresh-cape-height-band', 'secondaryMotion': True}})
            d['nodes'][parent].setdefault('children', []).append(index)
            joints.append(index); parent = index
            anchors.append({'node': index, 'height': height, 'meshLocalPosition': point.tolist()})
    new_world = world_matrices(d)
    inverses = np.array([(np.linalg.inv(new_world[j]) @ mesh_world).flatten(order='F') for j in joints])
    skin = {'name': 'TripoCapeSkin', 'joints': joints, 'inverseBindMatrices': append_accessor(glb, inverses, 'MAT4'), 'skeleton': spine}
    cape_node['skin'] = len(d['skins']); d['skins'].append(skin)
    weights = np.zeros((len(positions),4), dtype=np.float32)
    indices = np.tile(np.arange(4, dtype=np.uint16), (len(positions),1))
    if args.rigid_spine:
        indices.fill(0); weights[:,0] = 1
    else:
        # Adjacent smooth blends keep all coincident seam vertices identical.
        # The upper attachment remains on Spine02; no arm/hand influence leaks.
        knots = np.array([high-span*.08, high-span*.30, high-span*.62, low])
        for i, y in enumerate(positions[:,1]):
            if y >= knots[0]: weights[i,0] = 1; continue
            if y <= knots[-1]: weights[i,3] = 1; continue
            segment = next(k for k in range(3) if knots[k] >= y >= knots[k+1])
            amount = float((knots[segment]-y)/(knots[segment]-knots[segment+1]))
            amount = amount*amount*(3-2*amount)
            weights[i,segment], weights[i,segment+1] = 1-amount, amount
    primitive['attributes']['JOINTS_0'] = append_accessor(glb, indices, 'VEC4', 5123, 34962)
    primitive['attributes']['WEIGHTS_0'] = append_accessor(glb, weights, 'VEC4', 5126, 34962)
    for clip in d.get('animations', []):
        if args.rigid_spine: break
        duration = max(float(glb.accessor(s['input'])[-1,0]) for s in clip['samplers'])
        times = np.linspace(0, duration, max(33, math.ceil(duration*30)+1), dtype=np.float32)
        time_accessor = append_accessor(glb, times.reshape(-1,1), 'SCALAR')
        name = clip.get('name', '').lower()
        loop = 'idle' in name or 'walk' in name
        amplitude = .013 if 'idle' in name else .025 if 'walk' in name else .020
        gravity = []
        if 'cleave' in name or 'slash' in name:
            # Sample only original body tracks. Counter the measured torso tilt
            # progressively down the cape, preserving heading and attachment.
            # The upper cloth follows the shoulders; the hem retains gravity.
            original_channels = [(channel,clip['samplers'][channel['sampler']]) for channel in clip['channels']]
            for t in times:
                pose={'nodes':copy.deepcopy(d['nodes'])}
                for channel,sampler in original_channels:
                    path=channel['target']['path']
                    if path not in ['translation','rotation','scale']: continue
                    values=sample_channel(glb.accessor(sampler['input']).reshape(-1),glb.accessor(sampler['output']),float(t),path=='rotation')
                    pose['nodes'][channel['target']['node']][path]=values.tolist()
                rotation=world_matrices(pose)[spine][:3,:3]
                up=rotation[:,1]/np.linalg.norm(rotation[:,1])
                axis=np.cross(up,[0,1,0])
                axis_length=np.linalg.norm(axis)
                if axis_length<1e-8: gravity.append((np.array([0,0,1]),0.)); continue
                local_axis=np.linalg.solve(rotation,axis/axis_length)
                local_axis/=np.linalg.norm(local_axis)
                angle=min(math.acos(float(np.clip(up[1],-1,1))),math.radians(75))
                envelope=smooth01(float(t)/.12)*smooth01((duration-float(t))/.24)
                gravity.append((local_axis,angle*envelope))
        for level, bone in enumerate(joints[1:]):
            values = []
            for sample,t in enumerate(times):
                phase = float(t)/duration*math.tau
                envelope = 1 if loop else math.sin(math.pi*float(t)/duration)**2
                magnitude = amplitude*(1+level*.45)*envelope
                sway=quat(magnitude*math.sin(phase-level*.55), magnitude*.30*math.sin(phase*2-level*.4))
                if gravity:
                    axis,angle=gravity[sample]
                    half=angle*[.70,.17,.05][level]*.5
                    counter=np.r_[axis*math.sin(half),math.cos(half)]
                    sway=multiply_quat(counter,sway).tolist()
                values.append(sway)
            if loop: values[-1] = list(values[0])
            accessor = append_accessor(glb, values, 'VEC4')
            sampler = len(clip['samplers'])
            clip['samplers'].append({'input': time_accessor, 'output': accessor, 'interpolation': 'LINEAR'})
            clip['channels'].append({'sampler': sampler, 'target': {'node': bone, 'path': 'rotation'}})
    # Check immutable evidence, original tracks, normalized weights and bind pose.
    for key in geometry_keys: assert np.array_equal(before[key], glb.accessor(primitive['attributes'][key]))
    assert np.array_equal(original_indices, glb.accessor(primitive['indices']))
    for previous, current in zip(original_clips, d.get('animations', [])):
        assert current['channels'][:len(previous['channels'])] == previous['channels']
        assert current['samplers'][:len(previous['samplers'])] == previous['samplers']
    assert float(np.abs(weights.sum(1)-1).max()) <= 2e-7
    assert int(indices.max()) < len(joints)
    invs = glb.accessor(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
    homogeneous = np.column_stack([positions,np.ones(len(positions))])
    def deform(matrices):
        result = np.zeros_like(homogeneous)
        for slot,joint in enumerate(joints):
            matrix = np.linalg.inv(mesh_world) @ matrices[joint] @ invs[slot]
            result += (homogeneous @ matrix.T)*weights[:,slot,None]
        return result[:,:3]
    rest = deform(new_world)
    bind_error = float(np.linalg.norm(rest-positions,axis=1).max())
    if bind_error > 2e-6: raise ValueError(f'Cape inverse bind does not restore source geometry: {bind_error}')
    tri = original_indices.reshape(-1,3)
    edges = np.unique(np.sort(np.concatenate([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]]),axis=1),axis=0)
    lengths = np.linalg.norm(positions[edges[:,0]]-positions[edges[:,1]],axis=1)
    edges,lengths = edges[lengths>1e-6],lengths[lengths>1e-6]
    measurements = []
    for clip in d.get('animations', []):
        channels = [(c, clip['samplers'][c['sampler']]) for c in clip['channels']]
        duration = max(float(glb.accessor(s['input'])[-1,0]) for _,s in channels)
        maximum_stretch, maximum_motion, secondary_motion = 0.,0.,0.
        critical=[]
        sample_times=sorted(set(np.linspace(0,duration,9).tolist()+([.18,.28] if 'cleave' in clip.get('name','') else [])))
        for t in sample_times:
            pose = {'nodes':copy.deepcopy(d['nodes'])}
            for channel,sampler in channels:
                path=channel['target']['path']
                if path not in ['translation','rotation','scale']: continue
                if sampler.get('interpolation','LINEAR') != 'LINEAR': raise ValueError('Validation expects LINEAR animation channels')
                values=sample_channel(glb.accessor(sampler['input']).reshape(-1),glb.accessor(sampler['output']),float(t),path=='rotation')
                pose['nodes'][channel['target']['node']][path]=values.tolist()
            pose_world=world_matrices(pose)
            deformed=deform(pose_world)
            if not np.isfinite(deformed).all(): raise ValueError('Non-finite cape deformation')
            ratios=np.linalg.norm(deformed[edges[:,0]]-deformed[edges[:,1]],axis=1)/lengths
            maximum_stretch=max(maximum_stretch,float(np.abs(ratios-1).max()))
            maximum_motion=max(maximum_motion,float(np.linalg.norm(deformed-positions,axis=1).max()))
            if t in [.18,.28]:
                def tilt(joint):
                    up=pose_world[joint][:3,1];up=up/np.linalg.norm(up)
                    return math.degrees(math.acos(float(np.clip(up[1],-1,1))))
                critical.append({'time':t,'spineTiltDegrees':tilt(spine),'lowerCapeTiltDegrees':tilt(joints[-1])})
            for joint in joints[1:]: pose['nodes'][joint]['rotation']=[0,0,0,1]
            without_sway=deform(world_matrices(pose))
            secondary_motion=max(secondary_motion,float(np.linalg.norm(deformed-without_sway,axis=1).max()))
        if not args.rigid_spine and secondary_motion < 1e-4: raise ValueError('Cape secondary tracks exist but do not produce measurable deformation')
        measurements.append({'clip':clip.get('name'),'sampledTimes':len(sample_times),'maxEdgeLengthFractionChange':maximum_stretch,
                             'maxTotalVertexMotion':maximum_motion,'maxSecondaryVertexMotion':secondary_motion,'finite':True,'criticalCapeTilt':critical})
    glb.save(args.out)
    report={'input':str(args.input),'inputSha256':hashlib.sha256(args.input.read_bytes()).hexdigest(),'output':str(args.out),
            'capeVertices':len(positions),'originalInfluenceSums':influences,'newSkinJoints':[d['nodes'][j]['name'] for j in joints],
            'hinges':anchors,'geometryBuffersUnchanged':True,'existingAnimationTracksUnchanged':True,'equipmentUnchanged':True,
            'bindRestoreMaxError':bind_error,'maxWeightSumError':float(np.abs(weights.sum(1)-1).max()),'clipMeasurements':measurements,
            'cleaveGravityResponse':{'method':'Sample original Spine02 up axis, oppose tilt toward world up in three cape joints only; retain heading and original body tracks.','jointCounterTiltFractions':[.70,.17,.05],'blendInSeconds':.12,'blendOutSeconds':.24,'counterTiltLimitDegrees':75},
            'visualGate':'Pending integrated rear/front/attack review; no claim of a full character rig gate.'}
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__ == '__main__': main()
