"""Blender MCP candidate export; does not replace the public runtime wraith."""
import bpy
from pathlib import Path
RPG_REPO_ROOT=Path('/home/houston/git/institute')
source=RPG_REPO_ROOT/'scripts/blender'
OUT=RPG_REPO_ROOT/'web/public/assets/rpg/review';OUT.mkdir(parents=True,exist_ok=True)
exec((source/'experiments/lich_foundation.py').read_text())
collection=make_lich_export_candidate(RPG_REPO_ROOT)
collection.name='Vault_wraith-candidate'
# The production baker's shading/packing is retained, with the authored UVs
# preserved. Keep this isolated until final GLB and gameplay acceptance.
code=(source/'detailed/bake.py').read_text()
code=code.replace("bpy.ops.uv.smart_project(angle_limit=math.radians(62),island_margin=.006,correct_aspect=True,scale_to_bounds=True)","pass # preserve the authored source UV layout")
code=code.replace("directory=RPG_REPO_ROOT/'scripts/blender/textures'", "directory=RPG_REPO_ROOT/'scripts/blender/experiments/exports/maps'")
code=code.replace("    tex={}\n", "    p.inputs['Specular IOR Level'].default_value=.25\n    tex={}\n")
exec(code)
bake_asset('wraith-candidate',collection,2048)
attach_lich_joints(collection)
bpy.ops.object.select_all(action='DESELECT')
for obj in collection.objects:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'wraith-candidate.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True)
print('UV-preserving candidate exported with seven rigid joints')
