"""Loss-aware game-view texture packing for baked GLBs (Pillow + NumPy + SciPy).

Keep 1024px color atlases as high-quality JPEG; 512px tangent normals and packed
surface maps remain PNG. Geometry, UVs, materials, and actual normal-map signs are
preserved. This avoids shipping several megabytes of subpixel noise per creature.
"""
from pathlib import Path
import io,json,struct,sys
from PIL import Image
import numpy as np
from pad_atlas import pad_atlases

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'web/public/assets/rpg'

def optimize(path, texture_directory=None, normal_size=512):
    if path.stem in ('masonry-pier', 'masonry-post'):
        # Its dedicated bake/export passed native-camera review with1K PBR
        # atlases. Preserve that output when optimizing the older asset kit.
        print(path.name, 'preserved dedicated reviewed masonry bake')
        return
    data=path.read_bytes();size,kind=struct.unpack_from('<II',data,12)
    doc=json.loads(data[20:20+size]);binary=data[28+size:]
    if doc['asset'].get('extras',{}).get('authoredHeroTexturePacking'):
        print(path.name, 'preserved dedicated authored hero material packing')
        return
    if not doc.get('images'):return
    already=doc['asset'].get('extras',{}).get('vaultTexturesOptimized',0)
    roles={}
    for m in doc.get('materials',[]):
        # AO should ground small forms without erasing them in the dark dungeon.
        if 'occlusionTexture' in m:m['occlusionTexture']['strength']=.55
        for field,role in [('normalTexture','normal'),('occlusionTexture','orm')]:
            if field in m:roles[doc['textures'][m[field]['index']]['source']]=role
        p=m.get('pbrMetallicRoughness',{})
        for field,role in [('baseColorTexture','albedo'),('metallicRoughnessTexture','orm')]:
            if field in p:roles[doc['textures'][p[field]['index']]['source']]=role
    replacements={}
    padded={}
    if already<3:
        source_name='skeleton' if path.stem=='imp' else path.stem
        directory=Path(texture_directory) if texture_directory else ROOT/'scripts/blender/textures'
        sources={role:directory/f'{source_name}-{role}.png' for role in ('albedo','normal','orm')}
        if all(p.exists() for p in sources.values()):
            padded=pad_atlases({role:Image.open(p) for role,p in sources.items()})
        else:
            raise FileNotFoundError(f'Original UV atlases required for padding: {source_name}')
    for index,image in enumerate(doc['images']):
        if already>=3:continue
        if index not in roles:continue
        view=doc['bufferViews'][image['bufferView']]
        role=roles[index];im=Image.fromarray(padded[role],'RGB');out=io.BytesIO()
        if role=='albedo':
            im.save(out,'JPEG',quality=89,subsampling=0,optimize=True)
            image['mimeType']='image/jpeg'
        else:
            limit=normal_size if role=='normal' else 512
            if max(im.size)>limit:im.thumbnail((limit,limit),Image.Resampling.LANCZOS)
            # 6-bit packed roughness/AO has ample precision after spatial filtering.
            if role=='orm':
                a=np.asarray(im,dtype=np.float32);a=np.rint(a/4)*4
                im=Image.fromarray(np.clip(a,0,255).astype(np.uint8),'RGB')
            im.save(out,'PNG',optimize=True)
            image['mimeType']='image/png'
        replacements[image['bufferView']]=out.getvalue()
    packed=bytearray()
    for i,view in enumerate(doc['bufferViews']):
        while len(packed)%4:packed.append(0)
        old=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        piece=replacements.get(i,old)
        view['byteOffset']=len(packed);view['byteLength']=len(piece);packed.extend(piece)
    while len(packed)%4:packed.append(0)
    doc['buffers'][0]['byteLength']=len(packed)
    doc['asset'].setdefault('extras',{})['vaultTexturesOptimized']=3
    metadata=json.dumps(doc,separators=(',',':')).encode()
    metadata+=b' '*((-len(metadata))%4)
    result=struct.pack('<4sII',b'glTF',2,28+len(metadata)+len(packed))+struct.pack('<II',len(metadata),0x4e4f534a)+metadata+struct.pack('<II',len(packed),0x004e4942)+packed
    tmp=path.with_suffix('.glb.tmp');tmp.write_bytes(result);tmp.replace(path)
    print(path.name,f'{len(data)/1024:.0f} KB -> {len(result)/1024:.0f} KB')

if __name__=='__main__':
    for path in ([OUT/(name+'.glb') for name in sys.argv[1:]] if len(sys.argv)>1 else sorted(OUT.glob('*.glb'))):optimize(path)
