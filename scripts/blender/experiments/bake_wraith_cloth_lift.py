"""Blender-only albedo refinement; preserve the reviewed geometry/normal/ORM."""
import bpy
from pathlib import Path
root=Path('/home/houston/git/institute')
exec((root/'scripts/blender/detailed/wraith_cc0.py').read_text())
collection=make_wraith_cc0(root);collection.name='Vault_wraith-cloth-lift-source'
scene=bpy.context.scene
for obj in scene.objects:obj.hide_render=obj not in collection.objects.values()
bpy.ops.object.select_all(action='DESELECT')
solids=[o for o in collection.objects if o.type=='MESH']
for obj in solids:obj.select_set(True)
bpy.context.view_layer.objects.active=solids[0];bpy.ops.object.join();obj=solids[0]
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
scene.render.engine='CYCLES';scene.cycles.samples=12
scene.render.bake.margin=8;scene.render.bake.use_clear=True;scene.render.bake.use_selected_to_active=False
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
image=bpy.data.images.new('wraith-cloth-lift-albedo',width=2048,height=2048,alpha=False)
for material in obj.data.materials:
    nodes=material.node_tree.nodes
    for n in nodes:n.select=False
    target=nodes.new('ShaderNodeTexImage');target.image=image;target.select=True;nodes.active=target
bpy.ops.object.bake(type='DIFFUSE')
image.filepath_raw=str(root/'scripts/blender/experiments/exports/maps/wraith-cloth-lift-albedo.png');image.file_format='PNG';image.save()
print('Only cloth-adjusted albedo baked; geometry and surface maps remain unchanged')
