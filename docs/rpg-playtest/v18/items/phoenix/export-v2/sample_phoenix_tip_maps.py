import json,struct,io
from pathlib import Path
import numpy as np
from PIL import Image
base=Path('tmp/item-models/phoenix/v2');raw=(base/'phoenix-candidate.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);binary=raw[28+n:]
def acc(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']];off=v.get('byteOffset',0)+a.get('byteOffset',0)
 return np.ndarray((a['count'],size),dtype=dtype,buffer=binary,offset=off,strides=(v.get('byteStride',np.dtype(dtype).itemsize*size),np.dtype(dtype).itemsize))
p=d['meshes'][0]['primitives'][0];pos=acc(p['attributes']['POSITION']);uv=acc(p['attributes']['TEXCOORD_0']);indices=acc(p['indices']).reshape(-1,3);centers=pos[indices].mean(axis=1);texcoord=uv[indices].mean(axis=1);sel=np.flatnonzero((centers[:,1]>.77)&(centers[:,0]<0));m=d['materials'][0];maps={}
for role,owner,key in [('albedo',m['pbrMetallicRoughness'],'baseColorTexture'),('normal',m,'normalTexture'),('orm',m['pbrMetallicRoughness'],'metallicRoughnessTexture')]:
 im=d['images'][d['textures'][owner[key]['index']]['source']];v=d['bufferViews'][im['bufferView']];off=v.get('byteOffset',0);a=np.asarray(Image.open(io.BytesIO(binary[off:off+v['byteLength']])).convert('RGB'));maps[role]=a
rows=[]
for i in sel[::max(1,len(sel)//12)]:
 u,v=texcoord[i];rows.append({'triangle':int(i),'center':centers[i].tolist(),'uv':[float(u),float(v)],'maps':{k:a[min(1023,int(v*1024)),min(1023,int(u*1024))].tolist() for k,a in maps.items()}})
out={'selectedTriangles':len(sel),'samples':rows};(base/'tip-map-samples.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
