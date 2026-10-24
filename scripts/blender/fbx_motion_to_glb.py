"""Convert one Tripo v1.0 retarget FBX into a GLB that keeps its skeleton and clip.

blender -b --python fbx_motion_to_glb.py -- input.fbx output.glb
"""
import sys
import bpy

source, target = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=source, automatic_bone_orientation=False, ignore_leaf_bones=False)
bpy.ops.export_scene.gltf(filepath=target, export_format='GLB', export_animations=True,
                          export_animation_mode='ACTIONS', export_force_sampling=True,
                          export_frame_step=1, export_yup=True, export_apply=False)
