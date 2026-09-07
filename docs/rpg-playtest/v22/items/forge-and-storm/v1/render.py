import bpy,importlib.util,time,json,hashlib
from pathlib import Path
ROOT=Path('/home/houston/git/institute');OUT=ROOT/'tmp/item-models/forge-sources-v1';OUT.mkdir(parents=True,exist_ok=True)
caller=bpy.context.window.scene;started=time.time()
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
try:
 module=load('forge_sources_v1',ROOT/'scripts/blender/items/build_studies.py')
 baker=load('forge_sources_preflight',ROOT/'scripts/blender/items/bake_items.py')
 ids=['phoenix_talon','sunforged','arcfang','skybreaker','stormsilver','tempest']
 scenes={};reports={}
 for group in (ids[:3],ids[3:]):
  scene=module.build_study(group);bpy.context.window.scene=scene;graph=bpy.context.evaluated_depsgraph_get()
  for item_id in group:
   root=next(o for o in scene.objects if o.get('itemId')==item_id)
   directory=OUT/item_id;directory.mkdir(exist_ok=True)
   reports[item_id]=baker.validate_source_topology(root,graph,directory)
  scenes[group[0]]=scene
 bpy.app.driver_namespace['forge_sources_v1']=(module,scenes)
 bpy.context.window.scene=caller
 for key,scene in scenes.items():
  middle='sunforged' if key=='phoenix_talon' else 'stormsilver'
  module.render_study(scene,OUT/(key+'-front.png'),focus=(middle,.43,2.55),view_offset=(.3,-4,1))
 print(json.dumps({'seconds':time.time()-started,'ids':ids,'scope':'First source studies only; no export or public changes','sourceSHA256':hashlib.sha256((ROOT/'scripts/blender/items/forge_and_storm.py').read_bytes()).hexdigest(),'restoredScene':caller.name}))
finally:bpy.context.window.scene=caller
