"""Pad completed item atlases globally and pack a candidate without geometry edits."""
import importlib.util
import io
import json
import struct
from pathlib import Path

from PIL import Image

ROOT=Path(__file__).resolve().parents[3]


def pack(source,destination):
    source,destination=Path(source),Path(destination)
    if 'public' in destination.parts:raise ValueError('Unreviewed output must stay a candidate')
    raw=source.read_bytes();size,kind=struct.unpack_from('<II',raw,12)
    if raw[:4]!=b'glTF' or kind!=0x4e4f534a:raise ValueError('Expected binary glTF2')
    doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
    catalogue=json.loads((ROOT/'scripts/blender/items/catalogue.json').read_text())['items']
    for node in doc['nodes']:
        meta=node.get('extras',{})
        if 'itemId' not in meta:continue
        preview=next(item['preview'] for item in catalogue if item['id']==meta['itemId'])
        for field in ('azimuth','elevation','margin','roll'):
            meta['preview'+field.capitalize()]=preview.get(field,0)
    roles={}
    for material in doc.get('materials',[]):
        if 'KHR_materials_transmission' in material.get('extensions',{}):raise ValueError('Item must not trigger scene transmission pass')
        pbr=material.get('pbrMetallicRoughness',{})
        if material.get('extras',{}).get('gltfAlphaMode')=='BLEND':
            alpha=pbr.get('baseColorFactor',[1,1,1,1])[3]
            if not 0<alpha<1:raise ValueError('Declared crystal shell must retain fractional alpha')
            material['alphaMode']='BLEND';material.pop('alphaCutoff',None)
        for container,key,role in ((pbr,'baseColorTexture','albedo'),(pbr,'metallicRoughnessTexture','orm'),(material,'normalTexture','normal')):
            if key in container:roles[role]=doc['textures'][container[key]['index']]['source']
    if set(roles)!={'albedo','normal','orm'}:raise ValueError('Expected complete PBR atlas set')
    images={}
    for role,index in roles.items():
        view=doc['bufferViews'][doc['images'][index]['bufferView']]
        data=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        images[role]=Image.open(io.BytesIO(data)).convert('RGB')
    spec=importlib.util.spec_from_file_location('item_global_padding',ROOT/'scripts/blender/detailed/pad_atlas.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    arrays=module.pad_atlases(images);replacement={}
    for role,index in roles.items():
        im=Image.fromarray(arrays[role]);out=io.BytesIO()
        if role=='albedo':im.save(out,'JPEG',quality=94,subsampling=0,optimize=True);mime='image/jpeg'
        else:im.save(out,'PNG',optimize=True);mime='image/png'
        image=doc['images'][index];replacement[image['bufferView']]=out.getvalue();image['mimeType']=mime
    packed=bytearray()
    for index,view in enumerate(doc['bufferViews']):
        packed.extend(b'\0'*((-len(packed))%4))
        original=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        payload=replacement.get(index,original)
        if index not in replacement:assert payload==original
        view['byteOffset']=len(packed);view['byteLength']=len(payload);packed.extend(payload)
    packed.extend(b'\0'*((-len(packed))%4));doc['buffers'][0]['byteLength']=len(packed)
    doc['asset'].setdefault('extras',{})['itemGlobalAtlasPadding']=1
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    output=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(packed))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(packed),0x004e4942)+packed
    destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(output)
    print(json.dumps({'source':str(source),'candidate':str(destination),'bytes':len(output),'geometryPayloadsPreserved':True,'globallyPaddedAtlases':list(roles)}))
    return doc


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('source');parser.add_argument('destination')
    args=parser.parse_args();pack(args.source,args.destination)
