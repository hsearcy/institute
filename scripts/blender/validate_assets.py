"""Validate self-contained game GLBs and write their integration manifest."""
import json,struct,math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'web/public/assets/rpg'
expected=('hero','hero-cinder','hero-glacier','hero-tempest','imp','guardian','pillar','arch','brazier','crystal','chest','wall','wall-bay','broken-wall','skeleton','revenant','wraith','furnace','reliquary','ice_cluster')
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
    if name in ('skeleton','imp','revenant','guardian'):
        joints=[node.get('extras',{}).get('enemyJoint') for node in doc['nodes']]
        assert all(key in joints for key in ('Head','Body','ArmUpperL','ArmUpperR','ArmLowerL','ArmLowerR','LegUpperL','LegUpperR','LegLowerL','LegLowerR'))
        assert not doc.get('skins'), 'Enemies must remain rigid for shared instancing'
        stats[name]['rigidJoints']=[key for key in joints if key]
    if name=='wraith':
        joints={i:node.get('extras',{}).get('enemyJoint') for i,node in enumerate(doc['nodes']) if node.get('extras',{}).get('enemyJoint')}
        assert set(joints.values())=={'Body','Head','Cape','ArmUpperL','ArmUpperR','ArmLowerL','ArmLowerR'}
        assert not doc.get('skins') and not doc.get('animations')
        parents={child:i for i,node in enumerate(doc['nodes']) for child in node.get('children',[])}
        for index,key in joints.items():
            expected_parent='ArmUpper'+key[-1] if key.startswith('ArmLower') else 'Body' if key!='Body' else None
            assert joints.get(parents.get(index))==expected_parent
        staff=next(i for i,node in enumerate(doc['nodes']) if node.get('extras',{}).get('rigidEquipment')=='staff')
        assert joints[parents[staff]]=='ArmLowerL'
        assert triangles<12_000 and primitives==7 and len(doc['images'])==3
        stats[name]['rigidJoints']=list(joints.values())
        stats[name]['provenance']={'license':'CC0','creator':'Samfa12-tech / Meshy','source':'https://github.com/Samfa12-tech/The-Horde-RT-demo','commit':'463aed23d879ea673600bd1121fd0989a518599b','sourceSha256':'049979a83aca55358f54af8d3af1f7d518607bef634474a4ef015bfdff947a42','licenseEvidence':'scripts/blender/sources/cc0-lich'}
    if name=='hero' or name.startswith('hero-'):
        clips=doc.get('animations',[])
        assert {a['name'] for a in clips}=={'idle','walk','cleave','cast'}
        assert len(doc.get('skins',[]))==1 and len(doc['skins'][0]['joints'])==8
        assert all('JOINTS_0' in p['attributes'] and 'WEIGHTS_0' in p['attributes'] for m in doc['meshes'] for p in m['primitives'])
        stats[name]['animations']={a['name']:max(doc['accessors'][s['input']]['max'][0] for s in a['samplers']) for a in clips}
        stats[name]['joints']=[doc['nodes'][i]['name'] for i in doc['skins'][0]['joints']]
    assert len(data)<8_000_000,(name,len(data))
    if name.startswith('hero-'):
        assert len(data)<4_000_000 and triangles<25_000
        portrait=OUT/'appearances'/(name.removeprefix('hero-')+'.png')
        assert portrait.read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
        stats[name]['portrait']='/assets/rpg/appearances/'+portrait.name
    if name=='revenant':
        assert len(data)<3_000_000 and triangles<25_000
        sword=next(i for i,n in enumerate(doc['nodes']) if n.get('extras',{}).get('enemyJoint')=='Sword')
        right_forearm=next(n for n in doc['nodes'] if n.get('extras',{}).get('enemyJoint')=='ArmLowerR')
        assert sword in right_forearm['children']
    if name=='ice_cluster':assert len(data)<600_000 and triangles<5000
relief_walls=[stats[name] for name in ('wall-bay','broken-wall')]
assert sum(asset['bytes'] for asset in relief_walls)<5_000_000
assert sum(asset['triangles'] for asset in relief_walls)<71_173
manifest={'revision':2,'generator':'Blender 4.5.13 via Blender MCP 1.6 / protocol 5; UV-baked PBR surface atlases','source':'scripts/blender/build_assets.py','userPrompt':'use blender mcp to create high quality models.','coordinateSystem':{'up':'+Y','forward':'+Z','origin':'ground center','unit':'meter'},'assets':stats}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Validated {len(stats)} GLBs: {sum(x["triangles"] for x in stats.values()):,} triangles, {sum(x["bytes"] for x in stats.values()):,} bytes total.')
