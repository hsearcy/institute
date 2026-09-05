"""Validate self-contained game GLBs and write their integration manifest."""
import json,struct,math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'web/public/assets/rpg'
expected=('hero','imp','guardian','pillar','arch','brazier','crystal','chest','wall','wall-bay','broken-wall','skeleton','wraith','furnace','reliquary','ice_cluster')
stats={}
for name in expected:
    path=OUT/(name+'.glb');data=path.read_bytes()
    magic,version,total=struct.unpack_from('<4sII',data)
    assert (magic,version,total)==(b'glTF',2,len(data)),path
    length,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4E4F534A
    doc=json.loads(data[20:20+length])
    assert all('uri' not in b for b in doc.get('buffers',[]))
    binary=data[28+length:]
    for view in doc.get('bufferViews',[]):
        assert view.get('byteOffset',0)+view['byteLength']<=len(binary)
    for image in doc.get('images',[]):
        assert 'uri' not in image and 'bufferView' in image, 'Textures must be embedded'
        view=doc['bufferViews'][image['bufferView']];start=view.get('byteOffset',0)
        assert view['byteLength']>100
        assert binary[start:start+8]==b'\x89PNG\r\n\x1a\n' or binary[start:start+2]==b'\xff\xd8'
    triangles=0
    positions=[]
    primitives=0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            primitives+=1
            assert primitive.get('mode',4)==4
            attrs=primitive['attributes']
            assert all(key in attrs for key in ('POSITION','NORMAL'))
            material=doc['materials'][primitive['material']]
            if material.get('pbrMetallicRoughness',{}).get('baseColorTexture') is not None:
                assert 'TEXCOORD_0' in attrs
                assert 'normalTexture' in material and 'occlusionTexture' in material
                assert 'metallicRoughnessTexture' in material['pbrMetallicRoughness']
            accessor=doc['accessors'][attrs['POSITION']]
            assert all(math.isfinite(x) for x in accessor['min']+accessor['max'])
            positions.append((accessor['min'],accessor['max']))
            indices=doc['accessors'][primitive['indices']]
            assert indices['count']%3==0
            if 'max' in indices:assert indices['max'][0]<accessor['count']
            triangles+=indices['count']//3
    stats[name]={'url':'/assets/rpg/'+name+'.glb','bytes':len(data),'triangles':triangles,'drawCalls':primitives,'embeddedTextures':len(doc.get('images',[])),'nodes':[n['name'] for n in doc['nodes'] if 'mesh' in n]}
    if name in ('skeleton','imp','guardian'):
        joints=[node.get('extras',{}).get('enemyJoint') for node in doc['nodes']]
        assert all(key in joints for key in ('Head','Body','ArmUpperL','ArmUpperR','ArmLowerL','ArmLowerR','LegUpperL','LegUpperR','LegLowerL','LegLowerR'))
        assert not doc.get('skins'), 'Enemies must remain rigid for shared instancing'
        stats[name]['rigidJoints']=[key for key in joints if key]
    if name=='hero':
        clips=doc.get('animations',[])
        assert {a['name'] for a in clips}=={'idle','walk','cleave','cast'}
        assert len(doc.get('skins',[]))==1 and len(doc['skins'][0]['joints'])==8
        assert all('JOINTS_0' in p['attributes'] and 'WEIGHTS_0' in p['attributes'] for m in doc['meshes'] for p in m['primitives'])
        stats[name]['animations']={a['name']:max(doc['accessors'][s['input']]['max'][0] for s in a['samplers']) for a in clips}
        stats[name]['joints']=[doc['nodes'][i]['name'] for i in doc['skins'][0]['joints']]
    assert len(data)<8_000_000,(name,len(data))
    if name=='ice_cluster':assert len(data)<600_000 and triangles<5000
relief_walls=[stats[name] for name in ('wall-bay','broken-wall')]
assert sum(asset['bytes'] for asset in relief_walls)<5_000_000
assert sum(asset['triangles'] for asset in relief_walls)<71_173
manifest={'revision':2,'generator':'Blender 4.5.13 via Blender MCP 1.6 / protocol 5; UV-baked PBR surface atlases','source':'scripts/blender/build_assets.py','userPrompt':'use blender mcp to create high quality models.','coordinateSystem':{'up':'+Y','forward':'+Z','origin':'ground center','unit':'meter'},'assets':stats}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Validated {len(stats)} GLBs: {sum(x["triangles"] for x in stats.values()):,} triangles, {sum(x["bytes"] for x in stats.values()):,} bytes total.')
