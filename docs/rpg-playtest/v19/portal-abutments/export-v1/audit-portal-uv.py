from pathlib import Path
import struct,json,numpy as np
r=Path('/home/houston/git/institute');b=(r/'tmp/portal-abutments-bake-v1/worn-pier-review.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);data=b[28+n:]
def accessor(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];offset=v.get('byteOffset',0)+a.get('byteOffset',0);return np.ndarray((a['count'],dim),dtype=dtype,buffer=data,offset=offset,strides=(v.get('byteStride',np.dtype(dtype).itemsize*dim),np.dtype(dtype).itemsize))
p=j['meshes'][0]['primitives'][0];ids=accessor(p['indices']).reshape(-1,3);uv=accessor(p['attributes']['TEXCOORD_0']);parent=np.arange(len(ids));edge_map={}
def root(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=int(parent[i])
 return i
for face,triangle in enumerate(ids):
 points=[tuple(np.round(uv[v].astype(float),7)) for v in triangle]
 for a,c in zip(points,points[1:]+points[:1]):
  edge=tuple(sorted((a,c)))
  if edge in edge_map:parent[root(face)]=root(edge_map[edge])
  else:edge_map[edge]=face
charts={}
for i in range(len(ids)):charts.setdefault(root(i),[]).append(i)
report=[]
for f in [16666,16465,14327,14509,25947]:
 v=uv[ids[f]].astype(float)*2048;chart=charts[root(f)];alluv=uv[ids[chart]].reshape(-1,2).astype(float)*2048;span=alluv.max(0)-alluv.min(0);area=abs(float((v[1,0]-v[0,0])*(v[2,1]-v[0,1])-(v[1,1]-v[0,1])*(v[2,0]-v[0,0])))*.5
 report.append({'face':f,'triangleUVPixels':v.tolist(),'triangleAreaPixels':area,'chartTriangles':len(chart),'chartExtentPixels':span.tolist(),'chartMinPixels':alluv.min(0).tolist(),'chartMaxPixels':alluv.max(0).tolist()})
(r/'tmp/portal-abutments-bake-v1/uv-chart-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
