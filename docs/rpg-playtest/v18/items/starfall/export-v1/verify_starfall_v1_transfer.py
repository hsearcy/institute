from pathlib import Path
import json,struct,hashlib,io
import numpy as np
from PIL import Image
base=Path('/home/houston/git/institute/tmp/item-models/starfall/v1/baked');raw=(base/'starfall-raw.glb').read_bytes();size,kind=struct.unpack_from('<II',raw,12);doc=json.loads(raw[20:20+size]);binary=raw[28+size:];roles={}
for mat in doc['materials']:
 pbr=mat.get('pbrMetallicRoughness',{})
 for owner,key,role in [(pbr,'baseColorTexture','albedo'),(pbr,'metallicRoughnessTexture','orm'),(mat,'normalTexture','normal')]:
  if key in owner:roles[role]=doc['textures'][owner[key]['index']]['source']
report={}
for role,index in roles.items():
 view=doc['bufferViews'][doc['images'][index]['bufferView']];start=view.get('byteOffset',0);payload=binary[start:start+view['byteLength']]
 expected=(base/f'starfall-{role}-checkpoint.png').read_bytes();a=np.asarray(Image.open(io.BytesIO(payload)).convert('RGB'));b=np.asarray(Image.open(io.BytesIO(expected)).convert('RGB'))
 assert a.shape==b.shape
 diff=np.abs(a.astype(int)-b.astype(int));report[role]={'embeddedSHA256':hashlib.sha256(payload).hexdigest(),'checkpointSHA256':hashlib.sha256(expected).hexdigest(),'byteIdentical':payload==expected,'pixelMaxDelta':int(diff.max()),'pixelMeanDelta':float(diff.mean()),'nonzeroPixels':int(np.count_nonzero(a.max(axis=2)))}
assert set(roles)=={'albedo','normal','orm'}
(base/'raw-transfer-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
assert all(v['pixelMaxDelta']<=1 for v in report.values()),'Unexpected source/export texture transfer difference'
