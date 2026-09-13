"""Run through bpy MCP in a fresh saved-file process. Keep source GLB intact."""
from pathlib import Path
import bpy
import json
from math import pi
from mathutils import Matrix

root = Path('/home/hfsearcy/git/institute')
out = root / 'docs/concepts/revenant-tripo'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(out / 'source/revenant-pbr_model.glb'))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
for obj in meshes:
    obj.matrix_world = Matrix.Rotation(-pi / 2, 4, 'Z') @ obj.matrix_world
before = sum(len(obj.data.polygons) for obj in meshes)
for obj in meshes:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new('Browser reduction to 95000 triangles', 'DECIMATE')
    modifier.ratio = min(1.0, 95000 / before)
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
after = sum(len(obj.data.polygons) for obj in meshes)
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:
    obj.select_set(True)
candidate = root / 'web/public/assets/rpg/candidates/revenant-tripo.glb'
bpy.ops.export_scene.gltf(filepath=str(candidate), export_format='GLB',
                         use_selection=True, export_image_format='AUTO',
                         export_yup=True, export_animations=False)
report = dict(source_triangles=before, candidate_triangles=after,
              candidate_bytes=candidate.stat().st_size,
              texture_images=[dict(name=im.name, size=list(im.size)) for im in bpy.data.images if im.size[0] > 0],
              method='Blender collapse decimation; original UVs and PBR textures retained; no new generation')
(out / 'reduction.json').write_text(json.dumps(report, indent=2) + '\n')
bpy.context.scene['source_task_id'] = '2a61a568-b810-4bf8-8b94-5b0c8f91edab'
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'revenant-browser.blend'))
result = report
