import bpy,json,numpy as np
from collections import defaultdict
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path
_,state=bpy.app.driver_namespace['phoenix_bake_v2'];mesh=state['low'].data
im=bpy.data.images.load(str(state['directory']/'phoenix-albedo-checkpoint.png'),check_existing=False)
a=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(a);a=a.reshape((1024,1024,4))
uv=mesh.uv_layers.active.data;attr=mesh.attributes['item_source_id'];stats=defaultdict(lambda:{'faces':0,'zero':0,'zeroArea':0,'area':0,'examples':[]});parent=list(range(len(mesh.polygons)));seen={}
def find(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
def union(i,j):parent[find(i)]=find(j)
bvhs={};face_groups={}
for group,(sources,dst) in enumerate(state['batches']):
 ids={v.value for v in dst.data.attributes['item_source_id'].data}
 for i in ids:face_groups[i]=group
 src=sources[0];bvhs[group]=BVHTree.FromPolygons([src.matrix_world@v.co for v in src.data.vertices],[list(p.vertices) for p in src.data.polygons])
for p in mesh.polygons:
 sid=attr.data[p.index].value;stat=stats[sid];stat['faces']+=1;stat['area']+=p.area
 coords=[uv[i].uv for i in p.loop_indices];u=sum(v.x for v in coords)/len(coords);v=sum(v.y for v in coords)/len(coords)
 pixel=a[min(1023,max(0,int(v*1024))),min(1023,max(0,int(u*1024))),:3]
 if max(pixel)<.002:
  stat['zero']+=1;stat['zeroArea']+=p.area
  if len(stat['examples'])<3:
   center=state['low'].matrix_world@p.center;normal=p.normal.normalized();bvh=bvhs[face_groups[sid]];hit=bvh.ray_cast(center+normal*.006,-normal,.031);nearest=bvh.find_nearest(center)
   stat['examples'].append({'face':p.index,'uv':[u,v],'center':list(center),'normal':list(normal),'rayHit':hit[0] is not None,'rayDistance':hit[3],'nearestDistance':nearest[3]})
 for loop in p.loop_indices:
  q=uv[loop].uv;key=(mesh.loops[loop].vertex_index,round(q.x,7),round(q.y,7))
  if key in seen:union(p.index,seen[key])
  else:seen[key]=p.index
charts={}
for p in mesh.polygons:
 r=find(p.index);entry=charts.setdefault(r,[1,1,0,0])
 for i in p.loop_indices:
  v=uv[i].uv;entry[0]=min(entry[0],v.x);entry[1]=min(entry[1],v.y);entry[2]=max(entry[2],v.x);entry[3]=max(entry[3],v.y)
spans=[min(b[2]-b[0],b[3]-b[1])*1024 for b in charts.values()]
names=state.get('superseded_sources',[])
report={'parts':[{**v,'id':k,'name':names[k].name if k<len(names) else str(k),'zeroAreaFraction':v['zeroArea']/v['area'] if v['area'] else 0} for k,v in sorted(stats.items())],'charts':len(charts),'minimumChartSpanPixels':min(spans),'chartsUnder3Pixels':sum(x<3 for x in spans),'chartsUnder6Pixels':sum(x<6 for x in spans),'cage':state['scene'].render.bake.cage_extrusion,'rayDistance':state['scene'].render.bake.max_ray_distance}
path=state['directory'].parent/'transfer-coverage-audit.json';path.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
