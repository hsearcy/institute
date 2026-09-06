import bpy,importlib.util,time,json,hashlib
from pathlib import Path
root=Path('/home/houston/git/institute');caller=bpy.context.window.scene;start=time.time()
spec=importlib.util.spec_from_file_location('item_prepare_rejection',root/'scripts/blender/items/bake_items.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
_,scene=bpy.app.driver_namespace['phoenix_source_v7']
def signature():
 return hashlib.sha256(repr([(o.name,[tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],[m.name for m in o.data.materials]) for o in scene.objects if o.type=='MESH']).encode()).hexdigest()
before=(len(bpy.data.scenes),len(bpy.data.objects),len(bpy.data.meshes));before_hash=signature();failure=None
try:
 try:m.prepare(scene,'phoenix',1024,structured_grip=True,small_mesh_ratio=.35)
 except ValueError as error:failure=str(error)
 assert failure and failure.startswith('Invalid closed source winding:'),failure
 after=(len(bpy.data.scenes),len(bpy.data.objects),len(bpy.data.meshes));after_hash=signature()
 assert before==after,(before,after)
 assert before_hash==after_hash
 assert bpy.context.window.scene==caller
 report={'seconds':time.time()-start,'entryPoint':'bake_items.prepare','expectedRejection':failure,'beforeCounts':before,'afterCounts':after,'sourceGeometryMaterialsUnchanged':before_hash==after_hash,'sourceFingerprint':before_hash,'restoredScene':caller.name,'scope':'Actual prepare rejects invalid closed source before bake scene creation or atlas work'}
 out=root/'tmp/item-models/topology-guard/prepare-rejection.json';out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:bpy.context.window.scene=caller
