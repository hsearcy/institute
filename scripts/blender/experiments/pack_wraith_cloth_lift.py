"""Replace only candidate albedo; preserve geometry, joints, normal and ORM bytes."""
from pathlib import Path
import io,json,struct,sys
from PIL import Image
root=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/'scripts/blender/detailed'))
from pad_atlas import pad_atlases
folder=root/'scripts/blender/experiments/exports/maps'
images={role:Image.open(folder/('wraith-cloth-lift-albedo.png' if role=='albedo' else f'wraith-candidate-{role}.png')) for role in ('albedo','normal','orm')}
padded=pad_atlases(images)
output=io.BytesIO();Image.fromarray(padded['albedo'],'RGB').save(output,'JPEG',quality=89,subsampling=0,optimize=True)
public=root/'web/public/assets/rpg/review';data=(public/'wraith-candidate.glb').read_bytes()
length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length]);binary=data[28+length:]
texture=doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index'];image=doc['images'][doc['textures'][texture]['source']]
replace=image['bufferView'];image['name']='wraith-cloth-lift-albedo'
packed=bytearray()
for index,view in enumerate(doc['bufferViews']):
    while len(packed)%4:packed.append(0)
    old=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
    payload=output.getvalue() if index==replace else old
    view['byteOffset']=len(packed);view['byteLength']=len(payload);packed.extend(payload)
while len(packed)%4:packed.append(0)
doc['buffers'][0]['byteLength']=len(packed);doc['asset']['extras']['wraithClothMidtones']=1
metadata=json.dumps(doc,separators=(',',':')).encode();metadata+=b' '*((-len(metadata))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(metadata)+len(packed))+struct.pack('<II',len(metadata),0x4e4f534a)+metadata+struct.pack('<II',len(packed),0x004e4942)+packed
(public/'wraith-cloth-lift.glb').write_bytes(result)
# Every non-albedo buffer view is byte-identical to the approved baseline.
old_doc=json.loads(data[20:20+length])
for index,(old,new) in enumerate(zip(old_doc['bufferViews'],doc['bufferViews'])):
    if index==replace:continue
    assert binary[old.get('byteOffset',0):old.get('byteOffset',0)+old['byteLength']]==packed[new['byteOffset']:new['byteOffset']+new['byteLength']]
print('Wrote',len(result),'bytes; only albedo buffer payload changed')
