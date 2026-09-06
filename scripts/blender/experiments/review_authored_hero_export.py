"""Import the actual experimental GLB into an isolated50fps review scene."""
from pathlib import Path
import bpy


def import_hero_review(path,name='authored-hero-raw-review'):
    scene=bpy.data.scenes.new(name);scene.render.fps=50;bpy.context.window.scene=scene
    bpy.ops.import_scene.gltf(filepath=str(path))
    # The importer creates a hidden icosphere for bone display. It is not a
    # glTF mesh and must not become part of the rendered asset snapshot.
    objects=[o for o in scene.objects if o.type!='MESH' or any(m.type=='ARMATURE' for m in o.modifiers)]
    collection=bpy.data.collections.new('Vault_'+name);scene.collection.children.link(collection)
    for obj in objects:
        for parent in list(obj.users_collection):parent.objects.unlink(obj)
        collection.objects.link(obj)
    rig=next(obj for obj in collection.objects if obj.type=='ARMATURE')
    for track in rig.animation_data.nla_tracks:track.mute=True
    print('Imported actual hero GLB',len(rig.data.bones),'bones',[(t.name,t.strips[0].action.name) for t in rig.animation_data.nla_tracks])
    return scene,collection,rig


def export_clip_pose(rig,clip,seconds):
    tracks=list(rig.animation_data.nla_tracks)
    track=next(t for t in tracks if t.name==clip or t.name.startswith(clip+'.'))
    for item in tracks:item.mute=True
    rig.animation_data.action=track.strips[0].action
    if hasattr(track.strips[0],'action_slot') and track.strips[0].action_slot:
        rig.animation_data.action_slot=track.strips[0].action_slot
    start=rig.animation_data.action.frame_range[0]
    bpy.context.scene.frame_set(int(round(start+seconds*bpy.context.scene.render.fps)))
    bpy.context.view_layer.update()
