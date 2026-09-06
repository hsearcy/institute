"""Numerical complement to, never a substitute for, ordered motion review."""
import bpy,json
from pathlib import Path
from mathutils import Vector


def inspect_authored_hero_motion(collection,rig,output):
    expected=hero_bones()
    actual={b.name:b.parent.name if b.parent else None for b in rig.data.bones}
    assert actual=={name:spec[2] for name,spec in expected.items()},actual
    origin=next(o for o in collection.objects if o.type=='EMPTY' and o.name.startswith('CastOrigin'))
    assert origin.parent==rig and origin.parent_bone=='hand.L'
    tracks=list(rig.animation_data.nla_tracks)
    assert {t.name for t in tracks}=={'idle','walk','cleave','cast'}
    assert all(t.mute for t in tracks),'Inspect one isolated action at a time'
    scene=bpy.context.scene;previous=rig.animation_data.action;previous_frame=scene.frame_current
    report={'status':'Numerical study only; visual motion acceptance remains separate','bones':actual,'clips':{}}
    try:
        for track in tracks:
            action=track.strips[0].action;rig.animation_data.action=action
            frames=[];start,end=(int(v) for v in action.frame_range)
            for frame in range(start,end+1):
                scene.frame_set(frame);bpy.context.view_layer.update()
                graph=bpy.context.evaluated_depsgraph_get();root=rig.matrix_world@rig.pose.bones['root'].head
                low=min((obj.matrix_world@Vector(corner)).z for obj in collection.objects if obj.type=='MESH'
                        for corner in obj.evaluated_get(graph).bound_box)
                frames.append({'frame':frame,'seconds':(frame-start)/scene.render.fps,
                               'root':list(root),'minimumZ':low,'castOrigin':list(origin.matrix_world.translation)})
            report['clips'][track.name]={'duration':(end-start)/scene.render.fps,'frames':frames}
            assert max(abs(x) for f in frames for x in f['root'][:2])<.00001,'Horizontal root travel in '+track.name
            assert min(f['minimumZ'] for f in frames)>-.0001,'Floor penetration in '+track.name
        cast=report['clips']['cast'];release=min(cast['frames'],key=lambda f:abs(f['seconds']-.18))
        assert abs(release['seconds']-.18)<.00001
        report['release']=release
    finally:
        rig.animation_data.action=previous;scene.frame_set(previous_frame)
    Path(output).write_text(json.dumps(report,indent=2))
    print({name:{'duration':clip['duration'],'minZ':min(f['minimumZ'] for f in clip['frames'])} for name,clip in report['clips'].items()})
    return report
