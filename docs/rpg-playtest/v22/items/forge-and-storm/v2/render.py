import bpy,importlib.util,time,json
from pathlib import Path
ROOT=Path('/home/houston/git/institute');OUT=ROOT/'tmp/item-models/forge-sources-v2';OUT.mkdir(parents=True,exist_ok=True)
caller=bpy.context.window.scene;started=time.time()
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
try:
 prior=bpy.app.driver_namespace['forge_sources_v1'][0]
 archive=ROOT/'tmp/item-models/forge-sources-v1/source-recipe';archive.mkdir(exist_ok=True)
 for module in prior.ITEM_MODULES:(archive/Path(module.__file__).name).write_bytes(module.item_recipe_bytes)
 module=load('forge_sources_v2',ROOT/'scripts/blender/items/build_studies.py');baker=load('forge_v2_preflight',ROOT/'scripts/blender/items/bake_items.py')
 ids=['phoenix_talon','skybreaker','tempest'];scene=module.build_study(ids);bpy.app.driver_namespace['forge_sources_v2']=(module,scene)
 bpy.context.window.scene=scene
 for item_id in ids:
  directory=OUT/item_id;directory.mkdir(exist_ok=True)
  baker.validate_source_topology(next(o for o in scene.objects if o.get('itemId')==item_id),bpy.context.evaluated_depsgraph_get(),directory)
 bpy.context.window.scene=caller
 module.render_study(scene,OUT/'corrected-front.png',focus=('skybreaker',.43,2.55),view_offset=(.3,-4,1))
 print(json.dumps({'seconds':time.time()-started,'ids':ids,'scope':'First structural corrections only; no export','restoredScene':caller.name}))
finally:bpy.context.window.scene=caller
