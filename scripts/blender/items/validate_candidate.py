"""Check real item GLBs before exact-export and equipped visual reviews."""
import hashlib
import json
import math
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]


def validate(path,item_id):
    path=Path(path);raw=path.read_bytes()
    magic,version,length=struct.unpack_from('<4sII',raw)
    assert magic==b'glTF' and version==2 and length==len(raw)
    size,kind=struct.unpack_from('<II',raw,12);assert kind==0x4e4f534a
    doc=json.loads(raw[20:20+size])
    binary=raw[28+size:]
    specs=json.loads((ROOT/'scripts/blender/items/catalogue.json').read_text())['items']
    spec=next(entry for entry in specs if entry['id']==item_id)
    roots=[node for node in doc['nodes'] if node.get('extras',{}).get('itemId')==item_id]
    assert len(roots)==1,'Expected one identifiable item root'
    meta=roots[0]['extras'];assert meta['attachment']==spec['attachment']
    assert meta['sourceUnits']=='meters'
    markers={role:next(node for node in doc['nodes'] if node['name']==meta[role.lower()+'Node']) for role in ('Grip','Tip')}
    assert markers['Grip'].get('translation',[0,0,0])==[0,0,0],'Grip must be the local palm center or wearable anchor'
    tip=markers['Tip'].get('translation',[0,0,0])
    assert len(tip)==3 and all(math.isfinite(value) for value in tip)
    assert sum(value*value for value in tip)>1e-8,'Tip must identify a distinct physical extremity'
    if spec['attachment']=='hand.R':
        assert tip[1]>0,'Exported +Y must point toward the held weapon tip'
    assert not doc.get('skins') and not doc.get('animations'),'Rigid item must follow hero mount'
    assert 'KHR_materials_transmission' not in doc.get('extensionsUsed',[])
    assert all('bufferView' in image and 'uri' not in image for image in doc.get('images',[]))
    triangles=0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            assert primitive.get('mode',4)==4
            index=primitive.get('indices',primitive['attributes']['POSITION'])
            triangles+=doc['accessors'][index]['count']//3
            for key in ('POSITION','NORMAL'):assert key in primitive['attributes']
            if 'TEXCOORD_0' in primitive['attributes']:
                accessor=doc['accessors'][primitive['attributes']['TEXCOORD_0']]
                assert accessor['componentType']==5126 and accessor['type']=='VEC2'
                view=doc['bufferViews'][accessor['bufferView']]
                offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)
                stride=view.get('byteStride',8)
                for vertex in range(accessor['count']):
                    uv=struct.unpack_from('<ff',binary,offset+vertex*stride)
                    assert all(math.isfinite(v) and -.00001<=v<=1.00001 for v in uv),'UV atlas out of bounds'
    assert 50<triangles<=12000,f'Item budget exceeded: {triangles}'
    assert len(doc['materials'])<=3
    assert sum(material.get('alphaMode')=='BLEND' for material in doc['materials'])<=1,'At most one small crystal shell'
    assert len(raw)<3_000_000,'Unexpected per-item payload'
    for node in doc['nodes']:
        for key in ('translation','rotation','scale','matrix'):
            assert all(math.isfinite(value) for value in node.get(key,[]))
    return {'id':item_id,'triangles':triangles,'bytes':len(raw),'materials':len(doc['materials']),'sha256':hashlib.sha256(raw).hexdigest(),'status':'Structural checks only; consult the separately recorded visual review scopes'}


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('path');parser.add_argument('item_id')
    args=parser.parse_args();print(json.dumps(validate(args.path,args.item_id),indent=2))
