import bpy,json,time
from pathlib import Path
root=Path('/home/houston/git/institute');cache=bpy.app.driver_namespace['root_portal_abutments_bake_v3_recovery2'];scene=cache['reviewScene'];caller=bpy.context.window.scene;started=time.perf_counter();restore=[];clones=[]
try:
 bpy.context.window.scene=scene
 material=bpy.data.materials.new('Portal source geometry flat control');material.use_nodes=True
 shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.25,.25,.25,1);shader.inputs['Roughness'].default_value=.92
 for obj in scene.objects:
  if obj.type=='MESH' and not obj.name.startswith('AbutmentReview_Ground'):
   restore.append((obj,obj.hide_render));obj.hide_render=True
 for source in cache['state']['sources']:
  obj=source.copy();obj.data=source.data.copy();obj.name='Source flat geometry control '+source.name;scene.collection.objects.link(obj);clones.append(obj)
  obj.hide_render=False;obj.hide_set(False);obj.data.materials.clear();obj.data.materials.append(material)
  for face in obj.data.polygons:face.material_index=0
 scene.render.filepath=str(root/'tmp/portal-abutments-bake-v3-recovery2/source-flat-front.png');bpy.ops.render.render(write_still=True)
 print(json.dumps(dict(path=scene.render.filepath,sourceObjects=len(clones),seconds=time.perf_counter()-started)))
finally:
 for obj,hidden in restore:obj.hide_render=hidden
 for obj in clones:obj.hide_render=True;obj.hide_set(True)
 bpy.context.window.scene=caller
