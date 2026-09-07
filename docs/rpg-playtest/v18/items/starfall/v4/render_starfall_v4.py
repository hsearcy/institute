import bpy,importlib.util,time,json,hashlib
from pathlib import Path
root=Path('/home/houston/git/institute');out=root/'tmp/item-models';caller=bpy.context.window.scene;started=time.time()
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
try:
 module=load('starfall_source_v4',root/'scripts/blender/items/build_studies.py')
 scene=module.build_study(['starfall']);bpy.app.driver_namespace['starfall_source_v4']=(module,scene)
 def fingerprint(candidate):
  return hashlib.sha256(repr(sorted([tuple(tuple(float(value) for value in vertex.co) for vertex in obj.data.vertices) for obj in candidate.objects if obj.type=='MESH'])).encode()).hexdigest()
 geometry_unchanged=fingerprint(scene)==fingerprint(bpy.app.driver_namespace['starfall_source_v3'][1])
 assert geometry_unchanged,'Material-only study changed source mesh coordinates'
 bpy.context.window.scene=scene
 baker=load('starfall_v4_preflight',root/'scripts/blender/items/bake_items.py')
 source=next(o for o in scene.objects if o.get('itemId')=='starfall')
 target=out/'starfall/v4';target.mkdir(parents=True,exist_ok=True)
 topology=baker.validate_source_topology(source,bpy.context.evaluated_depsgraph_get(),target)
 bpy.context.window.scene=caller
 module.render_study(scene,out/'starfall-v4-front.png')
 module.render_study(scene,out/'starfall-v4-rear.png',back=True)
 module.render_study(scene,out/'starfall-v4-grip.png',detail=True,focus=('starfall',-.02,.49),view_offset=(1.1,-4,.5))
 report={'seconds':time.time()-started,'scope':'Broad steel response and full rear/grip coverage with unchanged source geometry; no export or installation','sourceSHA256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'scripts/blender/items/build_studies.py',root/'scripts/blender/items/surfaces.py',root/'scripts/blender/items/metal_weapons.py']},'geometryUnchangedFromV3':geometry_unchanged,'topology':{'rejectedParts':topology['rejectedParts'],'openParts':topology['openParts']},'restoredScene':caller.name}
 (out/'starfall-v4-source.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:bpy.context.window.scene=caller
