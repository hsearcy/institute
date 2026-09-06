import bpy,importlib.util,time,json,hashlib
from pathlib import Path
root=Path('/home/houston/git/institute');out=root/'tmp/item-models';caller=bpy.context.window.scene;started=time.time()
try:
 spec=importlib.util.spec_from_file_location('starfall_source_v1',root/'scripts/blender/items/build_studies.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 scene=module.build_study(['starfall']);bpy.app.driver_namespace['starfall_source_v1']=(module,scene)
 module.render_study(scene,out/'starfall-v1-front.png')
 module.render_study(scene,out/'starfall-v1-depth.png',detail=True,focus=('starfall',.48,1.10),view_offset=(2.2,-3,.8))
 report={'seconds':time.time()-started,'scope':'Initial unique leaf-blade construction study only; no export or installation','sourceSHA256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'scripts/blender/items/build_studies.py',root/'scripts/blender/items/surfaces.py',root/'scripts/blender/items/metal_weapons.py']},'restoredScene':caller.name}
 (out/'starfall-v1-source.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:bpy.context.window.scene=caller
