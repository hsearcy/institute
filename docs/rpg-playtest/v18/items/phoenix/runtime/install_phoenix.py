from pathlib import Path
import json,hashlib,shutil
root=Path('/home/houston/git/institute');base=root/'tmp/item-models/phoenix/v3';entry=json.loads((base/'manifest-entry.json').read_text())
assert entry['review']['continuousMotion']['score']==8,'Independent motion gate must pass before installation'
assert all(entry['review'][key]==8 for key in ['sourceConstruction','sourceMaterial','exactExportConstruction','exactExportMaterial','nativeStaticAttachmentScale','nativeStaticMaterial','standaloneThumbnail'])
assert entry['review']['actualInventoryCard']['score']==8
for name,digest in [('phoenix-candidate.glb',entry['sha256']),('phoenix-thumbnail.png',entry['thumbnailSha256'])]:assert hashlib.sha256((base/name).read_bytes()).hexdigest()==digest
public=root/'web/public/assets/rpg/items';manifest=public/'manifest.json';data=json.loads(manifest.read_text());prior=[x for x in data['items'] if x['id']!='phoenix'];assert len(prior)==4
shutil.copy2(base/'phoenix-candidate.glb',public/'phoenix.glb');shutil.copy2(base/'phoenix-thumbnail.png',public/'phoenix.png')
data['items']=prior+[entry];manifest.write_text(json.dumps(data,indent=2)+'\n')
registry=root/'web/src/rpg/itemModels.ts';source=registry.read_text();line="  phoenix: { model: 'items/phoenix', thumbnail: '/assets/rpg/items/phoenix.png' },\n"
if line not in source:
 assert 'phoenix:' not in source
 assert source.endswith('};\n');registry.write_text(source[:-3]+line+'};\n')
assert [x for x in json.loads(manifest.read_text())['items'] if x['id']!='phoenix']==prior
print(json.dumps({'installed':entry['id'],'sha256':entry['sha256'],'thumbnailSha256':entry['thumbnailSha256'],'priorEntriesPreserved':len(prior),'routeFreeValidation':'pending'}))
