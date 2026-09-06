"""Pack a UV-preserving experimental hero GLB without modifying its geometry.

Body color remains1024px high-quality JPEG; alpha-bearing materials remain PNG.
Normal/ORM atlases are512px. Original2K bakes are retained in the ignored source
export directory. This does not promote candidates or alter production heroes.
"""
from pathlib import Path
import io,json,struct
from PIL import Image


def simplify_cornea(doc):
    """Reveal the authored iris without a scene-wide refraction pass.

    Also handles older raw conversion caches so packing cannot reintroduce the
    expensive extension after the canonical material builder has been fixed.
    Geometry, UVs, textures, skin weights and clips are untouched.
    """
    corneas=[m for m in doc.get('materials',[]) if m.get('name')=='AuthoredHero cornea']
    if len(corneas)!=1:raise ValueError('Expected one authored hero cornea material')
    cornea=corneas[0]
    color=cornea.setdefault('pbrMetallicRoughness',{}).setdefault('baseColorFactor',[1,1,1,1])
    color[3]=0
    cornea['alphaMode']='MASK';cornea['alphaCutoff']=.4
    cornea.setdefault('extras',{}).update(gltfAlphaMode='MASK',gltfAlphaCutoff=.4)
    extensions=corneas[0].get('extensions',{})
    extensions.pop('KHR_materials_transmission',None)
    if not extensions:corneas[0].pop('extensions',None)
    if not any('KHR_materials_transmission' in m.get('extensions',{}) for m in doc.get('materials',[])):
        for key in ('extensionsUsed','extensionsRequired'):
            if key in doc:
                doc[key]=[name for name in doc[key] if name!='KHR_materials_transmission']
                if not doc[key]:doc.pop(key)
    doc['asset'].setdefault('extras',{})['authoredHeroRasterCornea']=1


def pack_authored_hero(source,destination):
    source=Path(source);destination=Path(destination)
    if destination.parent.name!='review' and 'experiments' not in destination.parts:
        raise ValueError('Experimental hero packing requires a review path')
    data=source.read_bytes();size,kind=struct.unpack_from('<II',data,12)
    if kind!=0x4e4f534a:raise ValueError('Expected GLB JSON first')
    doc=json.loads(data[20:20+size]);binary=data[28+size:]
    simplify_cornea(doc)
    roles={};alpha_images=set()
    for material in doc.get('materials',[]):
        extras=material.get('extras',{})
        if extras.get('gltfAlphaMode')=='MASK':
            material['alphaMode']='MASK';material['alphaCutoff']=extras.get('gltfAlphaCutoff',.4)
        pbr=material.get('pbrMetallicRoughness',{})
        for container,field,role in ((pbr,'baseColorTexture','albedo'),(pbr,'metallicRoughnessTexture','orm'),(material,'normalTexture','normal')):
            if field in container:
                index=doc['textures'][container[field]['index']]['source'];roles[index]=role
                if role=='albedo' and material.get('alphaMode','OPAQUE')!='OPAQUE':alpha_images.add(index)
    replacements={}
    for index,image in enumerate(doc.get('images',[])):
        if index not in roles:continue
        if 'bufferView' not in image:raise ValueError('Expected embedded authored texture')
        view=doc['bufferViews'][image['bufferView']]
        original=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        im=Image.open(io.BytesIO(original));out=io.BytesIO();role=roles[index]
        limit=1024 if role=='albedo' else 512
        if max(im.size)>limit:im.thumbnail((limit,limit),Image.Resampling.LANCZOS)
        if role=='albedo' and index not in alpha_images:
            im.convert('RGB').save(out,'JPEG',quality=94,subsampling=0,optimize=True);image['mimeType']='image/jpeg'
        else:
            im.convert('RGBA' if index in alpha_images else 'RGB').save(out,'PNG',optimize=True);image['mimeType']='image/png'
        replacements[image['bufferView']]=out.getvalue()
    packed=bytearray()
    for i,view in enumerate(doc['bufferViews']):
        packed.extend(b'\0'*((-len(packed))%4))
        old=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        piece=replacements.get(i,old)
        if i not in replacements:assert piece==old
        view['byteOffset']=len(packed);view['byteLength']=len(piece);packed.extend(piece)
    packed.extend(b'\0'*((-len(packed))%4));doc['buffers'][0]['byteLength']=len(packed)
    doc['asset'].setdefault('extras',{})['authoredHeroTexturePacking']=1
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    result=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(packed))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(packed),0x004e4942)+packed
    destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(result)
    print(f'{source.name}: {len(data):,} -> {len(result):,} bytes; geometry/animation buffers preserved')
    return doc

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('source');parser.add_argument('destination')
    args=parser.parse_args();pack_authored_hero(args.source,args.destination)
