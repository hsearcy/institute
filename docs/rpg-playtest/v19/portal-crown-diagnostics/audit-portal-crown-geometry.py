import bpy, bmesh, json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view
root=Path('/home/houston/git/institute'); cache=bpy.app.driver_namespace['root_portal_abutments_bake_v3_recovery2']; scene=cache['reviewScene']; low=cache['state']['low']; caller=bpy.context.window.scene
try:
 bpy.context.window.scene=scene; scene.view_layers[0].update()
 vertices=[];polygons=[];ids=[]
 for sid,o in enumerate(cache['state']['sources']):
  offset=len(vertices);vertices.extend(o.matrix_world@v.co for v in o.data.vertices)
  polygons.extend(tuple(offset+i for i in f.vertices) for f in o.data.polygons);ids.extend([sid]*len(o.data.polygons))
 sourceTree=BVHTree.FromPolygons(vertices,polygons)
 lowPoints=[low.matrix_world@v.co for v in low.data.vertices];lowTree=BVHTree.FromPolygons(lowPoints,[tuple(f.vertices) for f in low.data.polygons]);idattr=low.data.attributes['masonry_source_id']
 cam=scene.camera;rotation=cam.matrix_world.to_quaternion();right=rotation@Vector((1,0,0));up=rotation@Vector((0,1,0));direction=rotation@Vector((0,0,-1));width=cam.data.ortho_scale
 rows=[]
 for y in range(203,219):
  for x in range(558,580):
   origin=cam.matrix_world.translation+right*((x+.5)/1200-.5)*width+up*(.5-(y+.5)/900)*width*.75
   sh,sn,sf,sd=sourceTree.ray_cast(origin,direction,100);lh,ln,lf,ld=lowTree.ray_cast(origin,direction,100)
   if sh is not None and lh is not None:
    near=sourceTree.find_nearest(lh)
    rows.append(dict(pixel=[x,y],sourceId=ids[sf],lowSourceId=idattr.data[lf].value,sourceDistance=sd,lowDistance=ld,depthDelta=ld-sd,sourceNormal=list(sn),lowNormal=list(ln),normalDot=sn.dot(ln),nearestNormalDot=near[1].dot(ln),nearestDistance=near[3],sourcePoint=list(sh),lowPoint=list(lh),lowFace=lf))
 meshes=[]
 for sid in (50,61):
  o=cache['state']['sources'][sid];bm=bmesh.new();bm.from_mesh(o.data);volume=bm.calc_volume(signed=True);bm.free()
  meshes.append(dict(sourceId=sid,name=o.name,sourceVolume=volume,sourceTriangles=sum(len(f.vertices)-2 for f in o.data.polygons),lowTriangles=sum(len(f.vertices)-2 for f in low.data.polygons if idattr.data[f.index].value==sid)))
 edges={}
 for key,points,faces in [('source',vertices,polygons),('low',lowPoints,[tuple(f.vertices) for f in low.data.polygons])]:
  projected=[world_to_camera_view(scene,cam,p) for p in points];lines=[];seen=set()
  for face in faces:
   for a,b in zip(face,face[1:]+face[:1]):
    edge=tuple(sorted((a,b)))
    if edge in seen:continue
    seen.add(edge);p,q=projected[a],projected[b];xy=[p.x*1200,(1-p.y)*900,q.x*1200,(1-q.y)*900]
    if all(530<=xy[i]<=610 and 175<=xy[i+1]<=245 for i in (0,2)):lines.append(xy)
  edges[key]=lines
 report=dict(meshes=meshes,rays=rows,edges=edges)
 path=root/'tmp/portal-abutments-bake-v3-recovery2/crown-geometry-audit.json';path.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(dict(path=str(path),meshes=meshes,samples=len(rows),maxDepthDelta=max(abs(r['depthDelta']) for r in rows),opposedNormals=sum(r['nearestNormalDot']<0 for r in rows))))
finally:bpy.context.window.scene=caller
