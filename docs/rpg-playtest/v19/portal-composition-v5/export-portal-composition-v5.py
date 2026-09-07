"""Native-only fracture study: preserved atlas surfaces, explicit cut-face material."""
import bpy,bmesh,json,time
from pathlib import Path
from mathutils import Vector
root=Path('/home/houston/git/institute');cache=bpy.app.driver_namespace['root_portal_crown_normal_repair'];caller=bpy.context.window.scene;scene=bpy.data.scenes.new('Portal fractured termination subset');started=time.perf_counter()
try:
 bpy.context.window.scene=scene;original=cache['state']['low'];ids=list(range(len(cache['state']['sources'])));outerUpper=[];terminal=[]
 for sid,source in enumerate(cache['state']['sources']):
  points=[source.matrix_world@Vector(p) for p in source.bound_box]
  if sid>=62 and min(abs(p.x) for p in points)>3.08 and max(p.z for p in points)>2.72:outerUpper.append(sid)
  if sid>=62 and min(abs(p.x) for p in points)>3.8 and min(p.z for p in points)>2.2 and max(p.z for p in points)<2.72:terminal.append(sid)
 assert len(terminal)==4,terminal
 fracture=bpy.data.materials.new('Portal_Fracture_Control');fracture.use_nodes=True;shader=fracture.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.18,.175,.155,1);shader.inputs['Roughness'].default_value=.98
 objects=[];report=[]
 for name,keep in [('Portal_LoweredOuterWings',set(ids)-set(outerUpper)),('Portal_AlcoveSurround',set(range(62)))]:
  data=original.data.copy();data.materials.append(fracture);saved=data.attributes.new('composition_normals','FLOAT_VECTOR','CORNER')
  for item,normal in zip(saved.data,original.data.corner_normals):item.vector=normal.vector
  bm=bmesh.new();bm.from_mesh(data);layer=bm.faces.layers.int['masonry_source_id'];nlayer=bm.loops.layers.float_vector['composition_normals'];uv=bm.loops.layers.uv.active
  bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[layer] not in keep],context='FACES')
  cuts=[]
  if name=='Portal_LoweredOuterWings':
   for sid in terminal:
    faces=[f for f in bm.faces if f[layer]==sid];verts={v for f in faces for v in f.verts};side=1 if sum(v.co.x for v in verts)>0 else -1
    for co,no in [((side*4.57,.04,2.66),(side*.70,.35 if side>0 else -.28,1)),((side*4.73,-.23,2.61),(side*.70,-.9,.6))]:
     faces=[f for f in bm.faces if f[layer]==sid];edges={e for f in faces for e in f.edges};verts={v for f in faces for v in f.verts}
     result=bmesh.ops.bisect_plane(bm,geom=list(verts)+list(edges)+faces,plane_co=co,plane_no=no,dist=.000001,clear_outer=True)
     boundary=[e for e in result['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
     if boundary:
      made=bmesh.ops.holes_fill(bm,edges=boundary,sides=0)['faces'];bm.normal_update()
      for face in made:
       face[layer]=sid;face.material_index=1;face.smooth=False
       for loop in face.loops:
        loop[nlayer]=face.normal;point=loop.vert.co;normal=face.normal
        horizontal=abs(normal.z)>=max(abs(normal.x),abs(normal.y))
        u=(-point.y if not horizontal and abs(normal.x)>abs(normal.y) else point.x)/1.7
        v=(-point.y if horizontal else point.z)/1.7
        # Cut controls use the game's TextureLoader convention after export.
        loop[uv].uv=(u,1-v)
      cuts.append(dict(sourceId=sid,faces=len(made),planePoint=co,planeNormal=no))
  loose=[v for v in bm.verts if not v.link_faces]
  if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
  assert all(e.is_manifold for e in bm.edges),'Fractures must close the stone'
  volume=bm.calc_volume(signed=True);assert volume>0
  bm.to_mesh(data);bm.free();data.normals_split_custom_set([tuple(v.vector) for v in data.attributes['composition_normals'].data]);data.attributes.remove(data.attributes['composition_normals'])
  obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.matrix_world=original.matrix_world.copy();obj.hide_set(False);obj.hide_render=False;obj.select_set(True);objects.append(obj)
  report.append(dict(name=name,triangles=sum(len(f.vertices)-2 for f in data.polygons),volume=volume,cuts=cuts,sourceIds=sorted(keep)))
 bpy.context.view_layer.objects.active=objects[0];path=root/'tmp/portal-composition-v5-parts.glb'
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False,export_image_format='AUTO')
 result=dict(path=str(path),bytes=path.stat().st_size,objects=report,terminalSourceIds=terminal,seconds=time.perf_counter()-started,scope='Native geometry study; cut faces need matched existing wall material override, not final baked cut material')
 path.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(path=str(path),bytes=result['bytes'],terminalSourceIds=terminal,cuts=sum(len(x['cuts']) for x in report),seconds=result['seconds'])))
finally:bpy.context.window.scene=caller
