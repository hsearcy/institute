"""Contact sheet of a segmented GLB: one ortho render per part (review only)."""
import bpy, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
glb, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
meshes = sorted([o for o in bpy.context.scene.objects if o.type == 'MESH'], key=lambda o: o.name)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'TEXTURE'
scene.render.resolution_x = 220; scene.render.resolution_y = 300
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.15
cam.location = (2.5, 0, .0); cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)
for i, m in enumerate(meshes):
    for o in meshes: o.hide_render = o is not m
    scene.render.filepath = f'{out}/part-{i:02d}-{m.name}.png'
    bpy.ops.render.render(write_still=True)
for o in meshes: o.hide_render = False
scene.render.filepath = f'{out}/all.png'; bpy.ops.render.render(write_still=True)
