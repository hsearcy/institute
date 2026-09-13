"""Install hash-matched candidates with recorded user or critic acceptance."""
import json,hashlib,shutil,sys,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'scripts/blender/items'))
from validate_candidate import validate
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def install():
 assets=ROOT/'web/public/assets/rpg/items'
 review=json.loads((ROOT/'docs/concepts/weapon-model-review/accepted.json').read_text())
 accepted={r['id']:r for r in review['weapons']}
 specs=json.loads((ROOT/'scripts/blender/items/catalogue.json').read_text())['items']
 pending=[]
 for spec in specs:
  item=spec['id'];glb=assets/'candidates'/f'{item}.glb';png=assets/'candidates'/f'{item}.png';r=accepted[item]
  assert (r.get('userApproved') is True or r.get('score',0)>=6) and r['sha256']==digest(glb),f'{item}: acceptance must match exact candidate'
  validation=validate(glb,item);assert png.exists(),f'{item}: missing derived thumbnail'
  raw=glb.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);meta=next(n['extras'] for n in doc['nodes'] if n.get('extras',{}).get('itemId')==item)
  source=ROOT/'docs/concepts/weapon-model-review/local'/item/'source.blend'
  if not source.exists():source=source.with_name(item+'.blend')
  receipt=dict(id=item,model=f'{item}.glb',thumbnail=f'{item}.png',sha256=digest(glb),candidateSha256=digest(glb),thumbnailSha256=digest(png),bytes=len(raw),
   source=dict(constructionSnapshot=str(source.relative_to(ROOT)),sha256=digest(source),method='Local Blender construction from existing concept art',concept=f'docs/concepts/enemy-character-references/weapons/{item}.png'),
   attachment=dict(node=spec['attachment'],units='meters',gripOrigin='Measured palm or wearable anchor at local origin',tipAxis='+Y',presentationFace='+Z',gripNode=meta['gripNode'],tipNode=meta['tipNode']),
   render=dict(triangles=validation['triangles'],materials=len(doc['materials']),meshes=len(doc['meshes']),mainPassDrawCalls=sum(len(m['primitives']) for m in doc['meshes']),embeddedImages=len(doc.get('images',[])),transmission=False,skinned=False),
   review=dict(userApproved=r.get('userApproved',False),score=r.get('score'),scope='User approved the displayed local candidates for installation; native equipment checks recorded separately',evidence='docs/concepts/weapon-model-review/accepted.json'))
  pending.append((glb,png,receipt))
 for glb,png,_ in pending:shutil.copy2(glb,assets/glb.name);shutil.copy2(png,assets/png.name)
 (assets/'manifest.json').write_text(json.dumps(dict(version=2,coordinateConvention='Rigid items use measured grip or wearable anchors.',items=[r for _,_,r in pending]),indent=2)+'\n')
 print(f'Installed {len(pending)} reviewed local models and thumbnails')
if __name__=='__main__':install()
