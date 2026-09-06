import bpy,json,time
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
root=Path('/home/houston/git/institute');cache=bpy.app.driver_namespace['root_portal_abutments_bake_v3_recovery2'];scene=cache['reviewScene'];caller=bpy.context.window.scene;started=time.perf_counter();restore=[];clone=None
try:
 bpy.context.window.scene=scene;low=cache['state']['low'];clone=low.copy();clone.data=low.data.copy();clone.name='Crown source corner normals control';scene.collection.objects.link(clone);clone.hide_set(False);clone.hide_render=False
 for obj in scene.objects:
  if obj!=clone and obj.type=='MESH' and not obj.name.startswith('AbutmentReview_Ground'):
   restore.append((obj,obj.hide_render));obj.hide_render=True
 material=bpy.data.materials.new('Portal source normals flat control');material.use_nodes=True;shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.25,.25,.25,1);shader.inputs['Roughness'].default_value=.92
 clone.data.materials.clear();clone.data.materials.append(material)
 normals=[tuple(n.vector) for n in clone.data.corner_normals];sourceIds=clone.data.attributes['masonry_source_id'];changed=0;localNormal=clone.matrix_world.to_3x3().transposed();data=[]
 for sid in (50,61):
  source=cache['state']['sources'][sid];source.data.calc_loop_triangles();triangles=list(source.data.loop_triangles);points=[source.matrix_world@v.co for v in source.data.vertices];tree=BVHTree.FromPolygons(points,[tuple(t.vertices) for t in triangles],all_triangles=True);sourceNormals=[n.vector.copy() for n in source.data.corner_normals];worldNormal=source.matrix_world.to_3x3().inverted().transposed()
  for face in clone.data.polygons:
   if sourceIds.data[face.index].value!=sid:continue
   face.use_smooth=True
   for loopId in face.loop_indices:
    vertex=clone.data.vertices[clone.data.loops[loopId].vertex_index].co;sample=clone.matrix_world@(vertex.lerp(face.center,1e-4));nearest,normal,tid,distance=tree.find_nearest(sample);triangle=triangles[tid]
    p=[points[i] for i in triangle.vertices];n=[worldNormal@sourceNormals[i] for i in triangle.loops];interpolated=barycentric_transform(nearest,*p,*n).normalized();normals[loopId]=tuple((localNormal@interpolated).normalized());changed+=1
  data.append(dict(sourceId=sid,sourceTriangles=len(triangles)))
 clone.data.normals_split_custom_set(normals);clone.data.update();scene.render.filepath=str(root/'tmp/portal-abutments-bake-v3-recovery2/source-normals-flat-front.png');bpy.ops.render.render(write_still=True)
 print(json.dumps(dict(path=scene.render.filepath,changedCorners=changed,source=data,seconds=time.perf_counter()-started)))
 cache['crownSourceNormalsControl']=clone
finally:
 for obj,hidden in restore:obj.hide_render=hidden
 if clone:clone.hide_render=True;clone.hide_set(True)
 bpy.context.window.scene=caller
