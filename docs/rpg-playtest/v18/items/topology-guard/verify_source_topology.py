import bpy,importlib.util,json,time
from pathlib import Path
root=Path('/home/houston/git/institute');caller=bpy.context.window.scene;start=time.time();result=[]
spec=importlib.util.spec_from_file_location('item_topology_guard_verification',root/'scripts/blender/items/bake_items.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
try:
 for key,should_fail in [('phoenix_source_v7',True),('phoenix_source_v8',False),('starfall_source_v1',False)]:
  _,scene=bpy.app.driver_namespace[key];bpy.context.window.scene=scene;item=next(o for o in scene.objects if o.get('itemId'));out=root/'tmp/item-models/topology-guard'/key;out.mkdir(parents=True,exist_ok=True)
  before=(len(bpy.data.scenes),len(bpy.data.objects),len(bpy.data.meshes))
  try:
   report=m.validate_source_topology(item,bpy.context.evaluated_depsgraph_get(),out);failed=False
  except ValueError as e:
   report=json.loads((out/'source-topology.json').read_text());failed=True
  after=(len(bpy.data.scenes),len(bpy.data.objects),len(bpy.data.meshes))
  assert before==after,(key,before,after)
  assert failed==should_fail,(key,failed,report)
  result.append({'source':key,'rejected':failed,'rejectedParts':report['rejectedParts'],'openParts':report['openParts'],'sceneObjectMeshCountsUnchanged':True})
 print(json.dumps({'seconds':time.time()-start,'results':result,'restoredScene':caller.name}))
 (root/'tmp/item-models/topology-guard/verification.json').write_text(json.dumps({'seconds':time.time()-start,'results':result,'restoredScene':caller.name},indent=2)+'\n')
finally:bpy.context.window.scene=caller
