"""Render transparent appearance portraits from the actual optimized runtime GLBs.

Run in Blender, or call render_appearance_portraits(repo_root) after rebuilding.
Each portrait gets its own scene; no pre-existing scene or object is removed.
"""
import bpy
from pathlib import Path
from mathutils import Vector


def render_appearance_portraits(repo_root):
    root=Path(repo_root)
    output=root/'web/public/assets/rpg/appearances'
    output.mkdir(parents=True,exist_ok=True)
    for kind in ('cinder','glacier','tempest'):
        scene=bpy.data.scenes.new('Vault exported appearance '+kind)
        bpy.context.window.scene=scene
        bpy.ops.import_scene.gltf(filepath=str(root/'web/public/assets/rpg'/('hero-'+kind+'.glb')))
        for obj in list(scene.objects):
            if obj.type=='ARMATURE' and obj.animation_data:
                obj.animation_data.action=None
                for track in obj.animation_data.nla_tracks:track.mute=True
                for bone in obj.pose.bones:
                    bone.location=(0,0,0);bone.rotation_mode='QUATERNION';bone.rotation_quaternion=(1,0,0,0);bone.scale=(1,1,1)
        scene.frame_set(1)
        target=Vector((.12,0,.95))
        bpy.ops.object.camera_add(location=(3,-6,3.05))
        camera=bpy.context.object;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.type='ORTHO';camera.data.ortho_scale=2.22;scene.camera=camera
        def area(name,position,power,color,size):
            data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
            obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=position
            obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
        area('Portrait warm key',(-3,-4,5),650,(1,.88,.74),4)
        area('Portrait neutral fill',(4,-2,3),400,(.79,.87,1),3)
        area('Portrait cool rim',(-1,3,4),750,(.58,.74,1),3)
        scene.world=bpy.data.worlds.new('Appearance portrait studio');scene.world.use_nodes=True
        scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.25,.30,1)
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
        scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
        scene.render.resolution_x=512;scene.render.resolution_y=640;scene.render.resolution_percentage=100
        scene.render.film_transparent=True
        scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
        scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
        scene.render.filepath=str(output/(kind+'.png'))
        bpy.ops.render.render(write_still=True)
        print('Rendered runtime appearance',kind,scene.render.filepath)


if __name__=='__main__':
    render_appearance_portraits(Path(__file__).resolve().parents[3])
