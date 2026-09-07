import bpy,importlib.util,json,time,hashlib
from pathlib import Path
ROOT=Path('/home/houston/git/institute')
base=ROOT/'tmp/item-models/starfall/v1'
candidate=base/'starfall-candidate.glb'
caller=bpy.context.window.scene;started=time.time()
spec=importlib.util.spec_from_file_location('starfall_exact_studies',ROOT/'scripts/blender/items/build_studies.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
cached=bpy.app.driver_namespace.get('starfall_exact_v1')
scene=cached[1] if cached else bpy.data.scenes.new('Starfall exact packed v1 review')
try:
 bpy.context.window.scene=scene
 if not cached:bpy.ops.import_scene.gltf(filepath=str(candidate))
 root=next(o for o in scene.objects if o.get('itemId')=='starfall')
 assert root.get('gripNode') and root.get('tipNode')
 bpy.app.driver_namespace['starfall_exact_v1']=(module,scene)
 views=[('front',{}),('back',{'back':True}),('high',{'game_angle':True}),('blade',{'detail':True,'focus':('starfall',.54,.94),'view_offset':(1.1,-3,.6)}),('grip',{'detail':True,'focus':('starfall',-.02,.49),'view_offset':(1.1,-4,.5)})]
 outputs=[]
 for name,kwargs in views:
  if name not in requested_views:continue
  path=base/f'export-v1-{name}.png';module.render_study(scene,str(path),**kwargs);outputs.append(str(path))
 report={'candidate':str(candidate),'sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'seconds':time.time()-started,'outputs':outputs,'restoredScene':caller.name}
 (base/('exact-review-'+str(label)+'.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:bpy.context.window.scene=caller
