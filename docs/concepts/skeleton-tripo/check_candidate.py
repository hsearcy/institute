"""Verify candidate GLB and preservation of source texture bytes."""
from pathlib import Path
import hashlib,json,struct,subprocess,sys
kind=sys.argv[1]
root=Path(__file__).resolve().parents[3]
out=root/'docs/concepts'/(kind+'-tripo')
source=out/'source'/(kind+'-pbr_model.glb')
candidate=root/'web/public/assets/rpg/candidates'/(kind+'-tripo.glb')
def textures(path):
 data=path.read_bytes()
 magic,version,size=struct.unpack_from('<4sII',data)
 assert magic==b'glTF' and version==2 and size==len(data)
 length,tag=struct.unpack_from('<II',data,12)
 g=json.loads(data[20:20+length]);offset=20+length
 n,tag=struct.unpack_from('<II',data,offset)
 assert tag==0x004E4942
 blob=data[offset+8:offset+8+n]
 hashes=[]
 for im in g.get('images',[]):
  view=g['bufferViews'][im['bufferView']];a=view.get('byteOffset',0)
  b=blob[a:a+view['byteLength']]
  assert b.startswith(b'\x89PNG') or b.startswith(b'\xff\xd8')
  hashes.append(hashlib.sha256(b).hexdigest())
 for acc in g['accessors']:
  if acc.get('type')=='VEC3' and 'min' in acc:
   assert all(__import__('math').isfinite(v) for v in acc['min']+acc['max'])
 return sorted(hashes)
a,b=textures(source),textures(candidate)
assert a==b and len(a)>=3,'Source texture bytes changed'
for label,path in [('source',source),('candidate',candidate)]:
 result=subprocess.run(['python3',str(root/'docs/concepts/revenant-tripo/inspect_glb.py'),str(path)],capture_output=True,text=True,check=True)
 stats=json.loads(result.stdout)
 assert not stats['external_uris'] and not stats['skins'] and not stats['animations']
 assert stats['triangles']>0
 if label=='candidate':assert stats['triangles']<=96000
 (out/(label+'-stats.json')).write_text(result.stdout)
(out/'texture-check.json').write_text(json.dumps({'passed':True,'source_image_hashes':a,'candidate_image_hashes':b},indent=2)+'\n')
print(kind, 'PASS',stats['triangles'],'triangles',stats['bytes'],'bytes',len(b),'unchanged textures')
