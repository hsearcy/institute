import bpy,importlib.util,json,time,hashlib
from pathlib import Path
ROOT=Path('/home/houston/git/institute')
base=ROOT/'tmp/item-models/phoenix/v3'
candidate=base/'phoenix-candidate.glb'
caller=bpy.context.window.scene;started=time.time()
spec=importlib.util.spec_from_file_location('phoenix_exact_studies',ROOT/'scripts/blender/items/build_studies.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
scene=bpy.data.scenes.new('Phoenix exact packed v3 review')
try:
 bpy.context.window.scene=scene
 bpy.ops.import_scene.gltf(filepath=str(candidate))
 root=next(o for o in scene.objects if o.get('itemId')=='phoenix')
 assert root.get('gripNode') and root.get('tipNode')
 bpy.app.driver_namespace['phoenix_exact_v3']=(module,scene)
 views=[('front',{}),('back',{'back':True}),('high',{'game_angle':True}),('head',{'detail':True,'focus':('phoenix',.65,.67),'view_offset':(1.1,-3,.6)}),('grip',{'detail':True,'focus':('phoenix',-.01,.60),'view_offset':(.75,-4,.7)})]
 outputs=[]
 for name,kwargs in views:
  path=base/f'export-v3-{name}.png';module.render_study(scene,str(path),**kwargs);outputs.append(str(path))
 report={'candidate':str(candidate),'sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'seconds':time.time()-started,'outputs':outputs,'restoredScene':caller.name}
 (base/'exact-review.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:bpy.context.window.scene=caller
