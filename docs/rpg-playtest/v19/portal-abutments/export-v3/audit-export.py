from pathlib import Path
import hashlib, io, json, struct, sys
from PIL import Image

directory=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/home/houston/git/institute/tmp/portal-abutments-bake-v3')
blob=(directory/'worn-pier-review.glb').read_bytes()
magic,version,total=struct.unpack_from('<III',blob)
assert magic==0x46546c67 and version==2 and total==len(blob)
json_size,json_type=struct.unpack_from('<II',blob,12)
assert json_type==0x4e4f534a
gltf=json.loads(blob[20:20+json_size])
bin_size,bin_type=struct.unpack_from('<II',blob,20+json_size)
assert bin_type==0x004e4942
binary=blob[28+json_size:28+json_size+bin_size]
primitives=[p for mesh in gltf['meshes'] for p in mesh['primitives']]
images=[]
for entry in gltf['images']:
    view=gltf['bufferViews'][entry['bufferView']]
    start=view.get('byteOffset',0)
    data=binary[start:start+view['byteLength']]
    image=Image.open(io.BytesIO(data))
    images.append(dict(name=entry.get('name'),dimensions=image.size,bytes=len(data),extrema=image.getextrema()))
position=gltf['accessors'][primitives[0]['attributes']['POSITION']]
report=dict(sha256=hashlib.sha256(blob).hexdigest(),bytes=len(blob),
    triangles=sum(gltf['accessors'][p['indices']]['count']//3 for p in primitives),
    meshes=len(gltf['meshes']),primitives=len(primitives),materials=len(gltf['materials']),
    images=images,extensions=gltf.get('extensionsUsed',[]),animations=len(gltf.get('animations',[])),
    skins=len(gltf.get('skins',[])),positionAccessorBounds={k:position[k] for k in ('min','max')},
    samplers=gltf.get('samplers',[]))
assert report['triangles']==32518
assert len(primitives)==1 and len(gltf['materials'])==1
assert len(images)==3 and all(x['dimensions']==(2048,2048) for x in images)
assert not report['extensions'] and not report['animations'] and not report['skins']
(directory/'glb-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
assert all(max(hi for lo,hi in x['extrema'][:3])>0 for x in images), 'Embedded texture is entirely black'
