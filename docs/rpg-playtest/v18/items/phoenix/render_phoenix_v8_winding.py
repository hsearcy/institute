import bpy,bmesh,importlib.util,time,json,hashlib,numpy as np
from pathlib import Path
root=Path('/home/houston/git/institute');out=root/'tmp/item-models';caller=bpy.context.window.scene;started=time.time()
try:
 spec=importlib.util.spec_from_file_location('phoenix_source_v8',root/'scripts/blender/items/build_studies.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 scene=module.build_study(['phoenix']);bpy.app.driver_namespace['phoenix_source_v8']=(module,scene)
 old=bpy.app.driver_namespace['phoenix_source_v7'][1]
 def positions(s):
  parent=next(o for o in s.objects if o.get('itemId')=='phoenix');inv=parent.matrix_world.inverted()
  a=np.array([tuple(inv@o.matrix_world@v.co) for o in parent.children_recursive if o.type=='MESH' for v in o.data.vertices]);a=np.round(a,6);return a[np.lexsort((a[:,2],a[:,1],a[:,0]))]
 oldp,newp=positions(old),positions(scene);assert oldp.shape==newp.shape and np.array_equal(oldp,newp),'Winding-only change must preserve positions'
 volumes=[]
 for o in scene.objects:
  if o.type!='MESH':continue
  bm=bmesh.new();bm.from_mesh(o.data);vol=bm.calc_volume(signed=True);bm.free();volumes.append({'name':o.name,'signedVolume':vol})
 assert all(x['signedVolume']>0 for x in volumes),volumes
 module.render_study(scene,out/'phoenix-v8-head.png',detail=True,focus=('phoenix',.65,.67),view_offset=(1.1,-3,.6))
 report={'seconds':time.time()-started,'sourceSHA256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'scripts/blender/items/build_studies.py',root/'scripts/blender/items/surfaces.py',root/'scripts/blender/items/metal_weapons.py']},'restoredScene':caller.name,'scope':'V8 outward face winding only; vertex positions unchanged, no material/profile redesign','positionsUnchangedAtMicrometer':True,'volumes':volumes}
 (out/'phoenix-v8-source.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:bpy.context.window.scene=caller
