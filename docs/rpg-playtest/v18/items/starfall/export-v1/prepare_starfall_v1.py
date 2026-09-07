import bpy,importlib.util,time,json,hashlib
from pathlib import Path
root=Path('/home/houston/git/institute');out=root/'tmp/item-models/starfall/v1';out.mkdir(parents=True,exist_ok=True)
source_module,scene=bpy.app.driver_namespace['starfall_source_v5'];caller=bpy.context.window.scene;started=time.time()
try:
 snapshot=out/'starfall-source-v5.blend'
 if not snapshot.exists():bpy.data.libraries.write(str(snapshot),{scene},fake_user=True,compress=True)
 spec=importlib.util.spec_from_file_location('starfall_baker_v1',root/'scripts/blender/items/bake_items.py');baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
 state=baker.prepare(scene,'starfall',1024,structured_blade=True,structured_grip=True,split_material_boundaries=True);state['directory']=out/'baked';state['directory'].mkdir(parents=True,exist_ok=True);state['geometry_normals_only']=True
 for image in state['images'].values():image.use_fake_user=True
 bpy.app.driver_namespace['starfall_bake_v1']=(baker,state)
 triangles=state['helper'].triangle_count([state['low']])
 report={'seconds':time.time()-started,'sourceRecipe':scene.get('itemRecipeSha256'),'sourceSnapshotSHA256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'sourceTriangles':state['source_triangles'],'lowTriangles':state['helper'].triangle_count([state['low']]),'projectionGroups':len(state['batches']),'atlasSize':state['size'],'geometryNormalsOnly':True,'structuredGrip':True,'structuredBlade':True,'splitMaterialBoundaries':True,'restoredScene':caller.name}
 (out/'prepare.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
 assert triangles<=12000,('Low target over budget before bake',triangles)
finally:bpy.context.window.scene=caller
