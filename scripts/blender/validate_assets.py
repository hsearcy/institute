"""Validate self-contained game GLBs and write their integration manifest."""
import json,struct,math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'web/public/assets/rpg'
expected=('hero','imp','guardian','pillar','arch','brazier','crystal','chest','wall')
stats={}
for name in expected:
    path=OUT/(name+'.glb');data=path.read_bytes()
    magic,version,total=struct.unpack_from('<4sII',data)
    assert (magic,version,total)==(b'glTF',2,len(data)),path
    length,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4E4F534A
    doc=json.loads(data[20:20+length])
    assert all('uri' not in b for b in doc.get('buffers',[]))
    assert not doc.get('images'), 'Materials must be self-contained vertex colors'
    triangles=0
    positions=[]
    primitives=0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            primitives+=1
            assert primitive.get('mode',4)==4
            attrs=primitive['attributes']
            assert all(key in attrs for key in ('POSITION','NORMAL','COLOR_0'))
            accessor=doc['accessors'][attrs['POSITION']]
            assert all(math.isfinite(x) for x in accessor['min']+accessor['max'])
            positions.append((accessor['min'],accessor['max']))
            indices=doc['accessors'][primitive['indices']]
            assert indices['count']%3==0
            if 'max' in indices:assert indices['max'][0]<accessor['count']
            triangles+=indices['count']//3
    stats[name]={'url':'/assets/rpg/'+name+'.glb','bytes':len(data),'triangles':triangles,'drawCalls':primitives,'nodes':[n['name'] for n in doc['nodes'] if 'mesh' in n]}
    assert len(data)<600_000,(name,len(data))
manifest={'generator':'Blender 4.5.13 via Blender MCP 1.6 / protocol 5','source':'scripts/blender/build_assets.py','userPrompt':'use blender mcp to create high quality models.','coordinateSystem':{'up':'+Y','forward':'+Z','origin':'ground center','unit':'meter'},'assets':stats}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Validated {len(stats)} GLBs: {sum(x["triangles"] for x in stats.values()):,} triangles, {sum(x["bytes"] for x in stats.values()):,} bytes total.')
