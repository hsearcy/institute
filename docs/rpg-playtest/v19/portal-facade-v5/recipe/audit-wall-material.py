import struct,json,io
from pathlib import Path
import numpy as np
from PIL import Image
root=Path('/home/houston/git/institute');b=(root/'tmp/rpg-portal-bake-v7/worn-pier-review.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);data=b[28+n:]
def acc(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']];c={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];return np.frombuffer(data,dtype=dtype,count=a['count']*c,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,c)
pos,norm,uv,ix=acc(0),acc(1),acc(2),acc(3).ravel();tri=pos[ix.reshape(-1,3)];p=tri.mean(axis=1);normal=norm[ix.reshape(-1,3)].mean(axis=1)
selected=(abs(p[:,0])>1.6)&(abs(p[:,0])<2.24)&(p[:,1]>.8)&(p[:,1]<2.3)&(normal[:,2]>.98)&(p[:,2]<.50)
coords=uv[ix.reshape(-1,3)][selected].mean(axis=1)
v=j['bufferViews'][j['images'][2]['bufferView']];im=np.asarray(Image.open(io.BytesIO(data[v['byteOffset']:v['byteOffset']+v['byteLength']])).convert('RGB'))
# glTF texture coordinates refer to the stored top-left image rows.
samples=im[np.minimum((coords[:,1]*im.shape[0]).astype(int),im.shape[0]-1),np.minimum((coords[:,0]*im.shape[1]).astype(int),im.shape[1]-1)]/255
wall=np.asarray(Image.open(root/'tmp/portal-wall-surface-v1/albedo.png').convert('RGB')).reshape(-1,3)/255
linear=lambda c:np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
report={'selectedTriangles':int(selected.sum()),'portalFrontJambSRGBMedian':np.median(samples,axis=0).tolist(),'portalFrontJambLinearMedian':np.median(linear(samples),axis=0).tolist(),'wallMapSRGBMedian':np.median(wall,axis=0).tolist(),'wallMapLinearMedian':np.median(linear(wall),axis=0).tolist()}
print(json.dumps(report,indent=2));(root/'tmp/portal-wall-material-audit.json').write_text(json.dumps(report,indent=2))
