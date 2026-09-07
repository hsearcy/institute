"""Create high-source geometry matching v7's surviving groups; originals untouched."""
import bpy,bmesh,json,time,runpy
from pathlib import Path
from mathutils import Vector
root=Path('/home/houston/git/institute')
key='root_portal_grouped_source_v7'
assert key not in bpy.app.driver_namespace,'Resume existing source; do not duplicate'
cache=bpy.app.driver_namespace['root_portal_crown_normal_repair']
info=json.loads((root/'tmp/portal-composition-v7-parts.json').read_text())['objects'][0]
caller=bpy.context.window.scene
scene=bpy.data.scenes.new('Grouped portal source v7')
collection=bpy.data.collections.new('Grouped portal source v7 geometry');scene.collection.children.link(collection)
started=time.perf_counter();objects={};audits=[]
try:
 bpy.context.window.scene=scene
 for sid in info['sourceIds']:
  original=cache['state']['sources'][sid]
  obj=original.copy();obj.data=original.data.copy();obj.parent=None;obj.matrix_world=original.matrix_world.copy();obj.name='Grouped v7 '+original.name;collection.objects.link(obj);obj.hide_render=False;obj.hide_set(False);obj['masonry_source_id']=sid
  planes=[c for c in info['cuts'] if c['sourceId']==sid]
  if planes:
   data=obj.data;saved=data.attributes.new('grouped_normals','FLOAT_VECTOR','CORNER')
   for item,normal in zip(saved.data,data.corner_normals):item.vector=normal.vector
   bm=bmesh.new();bm.from_mesh(data);nlayer=bm.loops.layers.float_vector['grouped_normals']
   for cut in planes:
    co=obj.matrix_world.inverted()@Vector(cut['planePoint']);no=obj.matrix_world.to_3x3().transposed()@Vector(cut['planeNormal'])
    result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=co,plane_no=no,dist=.000001,clear_outer=True)
    boundary=[e for e in result['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
    if boundary:
     filled=bmesh.ops.holes_fill(bm,edges=boundary,sides=0)['faces'];bm.normal_update()
     for face in filled:
      face.material_index=1;face.smooth=False
      for loop in face.loops:loop[nlayer]=face.normal
   bm.to_mesh(data);bm.free();data.normals_split_custom_set([tuple(v.vector) for v in data.attributes['grouped_normals'].data]);data.attributes.remove(data.attributes['grouped_normals'])
  bm=bmesh.new();bm.from_mesh(obj.data);volume=bm.calc_volume(signed=True);bad=sum(not e.is_manifold for e in bm.edges);zero=sum(f.calc_area()<1e-12 for f in bm.faces);tri=sum(len(f.verts)-2 for f in bm.faces);bm.free()
  assert volume>0 and not bad and not zero,(sid,volume,bad,zero)
  objects[sid]=obj;audits.append(dict(sourceId=sid,name=obj.name,triangles=tri,signedVolume=volume,nonmanifoldEdges=bad,zeroAreaFaces=zero))
 state=dict(scene=scene,collection=collection,objects=objects,sourceIds=info['sourceIds'])
 bpy.app.driver_namespace[key]=state
 directory=root/'tmp/portal-grouped-source-v7';directory.mkdir(exist_ok=True)
 report=dict(objects=len(objects),triangles=sum(a['triangles'] for a in audits),sourceIds=info['sourceIds'],audits=audits,seconds=time.perf_counter()-started,scope='New high-source scene matches grouped v7 survival/cuts. Original source and baked textures untouched. Material AO evaluates only surviving geometry.')
 (directory/'source-audit.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({k:report[k] for k in ['objects','triangles','seconds']}))
finally:bpy.context.window.scene=caller
