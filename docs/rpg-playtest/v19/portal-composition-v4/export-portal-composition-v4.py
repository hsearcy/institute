import bpy,bmesh,json,time
from pathlib import Path
from mathutils import Vector
root=Path('/home/houston/git/institute');cache=bpy.app.driver_namespace['root_portal_crown_normal_repair'];caller=bpy.context.window.scene;scene=bpy.data.scenes.new('Portal composition subset export');started=time.perf_counter()
try:
 bpy.context.window.scene=scene;original=cache['state']['low'];ids=list(range(len(cache['state']['sources'])));outerUpper=[]
 for sid,source in enumerate(cache['state']['sources']):
  points=[source.matrix_world@Vector(p) for p in source.bound_box]
  if sid>=62 and min(abs(p.x) for p in points)>3.08 and max(p.z for p in points)>2.72:outerUpper.append(sid)
 objects=[];report=[]
 for name,keep in [('Portal_LoweredOuterWings',set(ids)-set(outerUpper)),('Portal_AlcoveSurround',set(range(62)))]:
  data=original.data.copy();saved=data.attributes.new('composition_normals','FLOAT_VECTOR','CORNER')
  for item,normal in zip(saved.data,original.data.corner_normals):item.vector=normal.vector
  bm=bmesh.new();bm.from_mesh(data);layer=bm.faces.layers.int['masonry_source_id'];bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[layer] not in keep],context='FACES');loose=[v for v in bm.verts if not v.link_faces]
  if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
  assert all(e.is_manifold for e in bm.edges),'Only complete closed source stones may be removed'
  volume=bm.calc_volume(signed=True);bm.to_mesh(data);bm.free();data.normals_split_custom_set([tuple(v.vector) for v in data.attributes['composition_normals'].data]);data.attributes.remove(data.attributes['composition_normals'])
  obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.matrix_world=original.matrix_world.copy();obj.hide_set(False);obj.hide_render=False;obj.select_set(True);objects.append(obj)
  report.append(dict(name=name,triangles=sum(len(f.vertices)-2 for f in data.polygons),volume=volume,sourceIds=sorted(keep)))
 bpy.context.view_layer.objects.active=objects[0];path=root/'tmp/portal-composition-v4-parts.glb'
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False,export_image_format='AUTO')
 result=dict(path=str(path),bytes=path.stat().st_size,objects=report,removedUpperOuterSourceIds=outerUpper,seconds=time.perf_counter()-started)
 path.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(path=str(path),bytes=result['bytes'],parts=[dict(name=x['name'],triangles=x['triangles']) for x in report],removed=len(outerUpper),seconds=result['seconds'])))
finally:bpy.context.window.scene=caller
