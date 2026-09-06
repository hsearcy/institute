import bpy,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from pathlib import Path
root=Path('/home/houston/git/institute');cache=bpy.app.driver_namespace['root_portal_abutments_bake_v1'];scene=cache['reviewScene'];caller=bpy.context.window.scene
try:
 bpy.context.window.scene=scene;scene.view_layers[0].update()
 objects=[o for o in scene.objects if o.type=='MESH' and not o.name.startswith('AbutmentReview_Ground')]
 assert len(objects)==1;obj=objects[0];mesh=obj.data
 points=[obj.matrix_world@v.co for v in mesh.vertices];bvh=BVHTree.FromPolygons(points,[tuple(p.vertices) for p in mesh.polygons])
 target=Vector((-1.69,-.08,3.75));camera=target+Vector((-10,-20,15))*.3;rotation=(target-camera).to_track_quat('-Z','Y');right=rotation@Vector((1,0,0));up=rotation@Vector((0,1,0));direction=rotation@Vector((0,0,-1))
 low=cache['state']['low'];lowPoints=[low.matrix_world@v.co for v in low.data.vertices];lowTree=BVHTree.FromPolygons(lowPoints,[tuple(p.vertices) for p in low.data.polygons])
 report=[]
 for x,y in [(601,225),(622,459),(452,588),(595,230),(615,451),(445,580),(400,330)]:
  origin=camera+right*((x+.5)/900-.5)*3.7+up*(.5-(y+.5)/900)*3.7
  hit,normal,face,distance=bvh.ray_cast(origin,direction,100)
  if hit is None:report.append({'pixel':[x,y],'miss':True});continue
  polygon=mesh.polygons[face];verts=[points[i] for i in polygon.vertices];uvs=[Vector((*mesh.uv_layers.active.data[i].uv,0)) for i in polygon.loop_indices]
  uv=barycentric_transform(hit,*verts,*uvs);samples={}
  for kind,image in cache['state']['images'].items():
   w,h=image.size;u,v=max(0,min(w-1,int(uv.x*w))),max(0,min(h-1,int(uv.y*h)));index=(v*w+u)*4
   samples[kind]=[float(image.pixels[index+i]) for i in range(4)]
  closest,lowNormal,lowFace,lowDistance=lowTree.find_nearest(hit)
  sourceId=low.data.attributes['masonry_source_id'].data[lowFace].value;source=cache['state']['sources'][sourceId]
  sourcePoints=[source.matrix_world@v.co for v in source.data.vertices];sourceTree=BVHTree.FromPolygons(sourcePoints,[tuple(p.vertices) for p in source.data.polygons])
  projection=sourceTree.ray_cast(hit+normal*.045,-normal,.165)
  nearby=sourceTree.find_nearest(hit)
  report.append({'pixel':[x,y],'face':face,'point':list(hit),'normal':list(normal),'uv':list(uv)[:2],'maps':samples,'source':source.name,'sourceId':sourceId,'nearestSourceDistance':nearby[3],'flatNormalProjection':None if projection[0] is None else {'distance':projection[3],'point':list(projection[0])}})
 (root/'tmp/portal-abutments-bake-v1/pixel-ray-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:bpy.context.window.scene=caller
