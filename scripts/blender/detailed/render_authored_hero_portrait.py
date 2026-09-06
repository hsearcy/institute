"""Transparent Wayfarer portrait from the actual packed runtime GLB."""
from pathlib import Path
import bpy
from mathutils import Vector


def render_authored_hero_portrait(repo_root, glb=None, output=None):
    root=Path(repo_root)
    glb=Path(glb) if glb else root/'web/public/assets/rpg/hero.glb'
    output=Path(output) if output else root/'web/public/assets/rpg/appearances/wayfarer.png'
    previous=bpy.context.window.scene
    try:
        scene=bpy.data.scenes.new('Authored Wayfarer runtime portrait')
        bpy.context.window.scene=scene
        bpy.ops.import_scene.gltf(filepath=str(glb))
        rig=next(obj for obj in scene.objects if obj.type=='ARMATURE')
        tracks=list(rig.animation_data.nla_tracks)
        idle=next(track.strips[0].action for track in tracks if track.name=='idle')
        for track in tracks:track.mute=True
        rig.animation_data.action=idle
        if idle.slots:rig.animation_data.action_slot=idle.slots[0]
        scene.render.fps=50;scene.frame_set(21)
        target=Vector((-.12,-.08,.94))
        bpy.ops.object.camera_add(location=(3,-6,2.85))
        camera=bpy.context.object;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.type='ORTHO';camera.data.ortho_scale=2.4;scene.camera=camera
        for name,position,power,color,size in (
            ('Warm key',(-3,-4,5),650,(1,.88,.74),4),
            ('Neutral fill',(4,-2,3),400,(.79,.87,1),3),
            ('Cool rim',(-1,3,4),750,(.58,.74,1),3),
        ):
            data=bpy.data.lights.new('Wayfarer '+name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
            obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=position
            obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
        scene.world=bpy.data.worlds.new('Wayfarer portrait studio');scene.world.use_nodes=True
        scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.25,.30,1)
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
        scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
        scene.render.resolution_x=512;scene.render.resolution_y=640;scene.render.resolution_percentage=100
        scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
        scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
        output.parent.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(output)
        bpy.ops.render.render(write_still=True)
        return output
    finally:
        bpy.context.window.scene=previous
