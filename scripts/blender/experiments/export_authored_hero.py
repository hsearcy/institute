"""Opt-in reviewed-candidate export; never overwrites a production hero."""
from pathlib import Path
import bpy


def export_authored_hero_candidate(collection,rig,path):
    path=Path(path)
    if path.parent.name!='review' and 'experiments' not in path.parts:
        raise ValueError('Hero studies must export to a review/experimental path')
    tracks=list(rig.animation_data.nla_tracks) if rig.animation_data else []
    if {track.name for track in tracks}!={'idle','walk','cleave','cast'}:
        raise ValueError('Expected four reviewed named animation tracks')
    if len(rig.data.bones)!=19:raise ValueError('Expected the articulated19-bone hero study')
    path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects:obj.select_set(True);obj.hide_render=False
    bpy.context.view_layer.objects.active=rig
    previous_action=rig.animation_data.action
    previous_mutes=[track.mute for track in tracks]
    rig.animation_data.action=None
    for track in tracks:track.mute=False
    origin=next(o for o in collection.objects if o.name.startswith('CastOrigin'))
    origin_name=origin.name;collision=bpy.data.objects.get('CastOrigin')
    collision_name=collision.name if collision and collision!=origin else None
    if collision_name:collision.name='Reserved previous CastOrigin during hero export'
    origin.name='CastOrigin'
    try:
        bpy.ops.export_scene.gltf(
            filepath=str(path),export_format='GLB',use_selection=True,
            use_active_scene=True,export_yup=True,export_apply=True,
            export_animations=True,export_skins=True,export_animation_mode='NLA_TRACKS',
            export_nla_strips=True,export_anim_slide_to_zero=True,export_extras=True,export_image_format='AUTO',
        )
    finally:
        origin.name=origin_name
        if collision_name:collision.name=collision_name
        for track,mute in zip(tracks,previous_mutes):track.mute=mute
        rig.animation_data.action=previous_action
    print('Exported experimental hero candidate',path)
    return path
