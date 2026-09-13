"""Run through bpy MCP. Check rest surfaces, UVs, weights and texture bytes."""
import bpy,json,hashlib,struct,numpy as np
from mathutils.kdtree import KDTree
from pathlib import Path
ROOT=Path('/home/hfsearcy/git/institute')
def import_data(path):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(path))
 meshes=[o for o in bpy.data.objects if o.type=='MESH' and len(o.data.materials)>0];points=[];uvs=[];triangles=0;weight_error=0;max_influences=0
 for o in meshes:
  per=[[] for _ in o.data.vertices]
  for loop in o.data.loops:per[loop.vertex_index].append(tuple(o.data.uv_layers.active.data[loop.index].uv))
  for v,uv in zip(o.data.vertices,per):
   points.append(tuple(o.matrix_world@v.co));uvs.append(uv)
   if v.groups:weight_error=max(weight_error,abs(sum(g.weight for g in v.groups)-1));max_influences=max(max_influences,len(v.groups))
  triangles+=sum(len(p.vertices)-2 for p in o.data.polygons)
 points=np.array(points);points[:,2]-=points[:,2].min()
 return points,uvs,triangles,weight_error,max_influences
def images(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);binary=b[28+n:];out=[]
 for im in j['images']:
  v=j['bufferViews'][im['bufferView']];start=v.get('byteOffset',0);out.append(hashlib.sha256(binary[start:start+v['byteLength']]).hexdigest())
 return sorted(out)
report={}
for kind in ['skeleton','revenant','guardian','vault-guardian-boss']:
 source=ROOT/'web/public/assets/rpg'/f'{kind}.glb';candidate=source.parent/'animated'/source.name
 p,uv,tris,_,_=import_data(source);q,vq,tris2,we,mi=import_data(candidate)
 tree=KDTree(len(p))
 for i,co in enumerate(p):tree.insert(co,i)
 tree.balance();max_error=0;uv_error=0
 for co,coords in zip(q,vq):
  _,i,err=tree.find(co);max_error=max(max_error,err)
  nearby=tree.find_range(co,1e-5);known=[u for _,j,_ in nearby for u in uv[j]]
  if not known:uv_error=999;continue
  for u in coords:uv_error=max(uv_error,min(max(abs(u[0]-v[0]),abs(u[1]-v[1])) for v in known))
 item={'candidate_sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'triangles':tris2,'source_triangles':tris,'max_rest_position_error_m':max_error,'max_uv_error':uv_error,'max_weight_sum_error':we,'max_influences':mi,'texture_bytes_identical':images(source)==images(candidate)}
 item['pass']=tris==tris2 and tris>=94999 and max_error<1e-5 and uv_error<1e-5 and we<1e-5 and mi<=4 and item['texture_bytes_identical'];report[kind]=item
(ROOT/'docs/concepts/enemy-animation/source-preservation.json').write_text(json.dumps(report,indent=2));result=report
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT)
