import bpy,importlib.util,time,json,hashlib
from pathlib import Path
root=Path('/home/houston/git/institute');out=root/'tmp/item-models';caller=bpy.context.window.scene;started=time.time()
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
try:
 module=load('starfall_source_v6',root/'scripts/blender/items/build_studies.py')
 scene=module.build_study(['starfall']);bpy.app.driver_namespace['starfall_source_v6']=(module,scene)
 original=bpy.app.driver_namespace['starfall_source_v5'][1]
 get_blade=lambda candidate:next(o for o in candidate.objects if o.type=='MESH' and o.name.startswith('Starfall continuous leaf-shaped'))
 coordinates=lambda obj:[tuple(v.co) for v in obj.data.vertices]
 assert coordinates(get_blade(scene))==coordinates(get_blade(original)),'Blade geometry changed'
 bpy.context.window.scene=scene
 baker=load('starfall_v6_preflight',root/'scripts/blender/items/bake_items.py')
 source=next(o for o in scene.objects if o.get('itemId')=='starfall')
 target=out/'starfall/v6';target.mkdir(parents=True,exist_ok=True)
 topology=baker.validate_source_topology(source,bpy.context.evaluated_depsgraph_get(),target)
 bpy.context.window.scene=caller
 module.render_study(scene,out/'starfall-v6-blade.png',detail=True,focus=('starfall',.54,.94),view_offset=(1.1,-3,.6))
 report={'seconds':time.time()-started,'scope':'Smooth fuller source material boundary only; blade vertex coordinates preserved; no export or installation','sourceSHA256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'scripts/blender/items/build_studies.py',root/'scripts/blender/items/surfaces.py',root/'scripts/blender/items/metal_weapons.py']},'topology':{'rejectedParts':topology['rejectedParts'],'openParts':topology['openParts']},'restoredScene':caller.name}
 (out/'starfall-v6-source.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:bpy.context.window.scene=caller
