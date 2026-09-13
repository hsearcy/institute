"""Idempotent concept-to-model submissions. Keys and signed URLs stay out of records."""
from pathlib import Path
import argparse, hashlib, importlib.util, json, os, shlex, sys
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/concepts/weapon-model-review'
spec=importlib.util.spec_from_file_location('tripo_skill',Path.home()/'.agents/skills/threejs-3d-generator/scripts/threejs_3d_asset.py')
api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
def key():
 for line in (ROOT/'.env').read_text().splitlines():
  if line.strip().startswith(('TRIPO_API_KEY=','export TRIPO_API_KEY=')):
   value=line.split('=',1)[1].strip();return shlex.split(value)[0] if value else ''
 return os.environ.get('TRIPO_API_KEY','')
def save(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,indent=2)+'\n')
def run(action,item):
 credential=key()
 if not credential:raise SystemExit('TRIPO_API_KEY=MISSING')
 if action=='probe':
  os.environ['TRIPO_API_KEY']=credential;sys.argv=['threejs_3d_asset.py','probe'];api.main();return
 dest=OUT/'generated'/item;receipt=dest/'task.json'
 if action=='submit' and not receipt.exists():
  ref=OUT/'references'/f'{item}-front.png';token=api.multipart_upload(credential,ref)
  settings=dict(type='image_to_model',model_version='v3.1-20260211',geometry_quality='detailed',texture_quality='detailed',texture=True,pbr=True,texture_alignment='original_image',orientation='align_image',enable_image_autofix=False,quad=False,generate_parts=False,smart_low_poly=True,face_limit=12000,export_uv=True,model_seed=20260913,texture_seed=20260913)
  task_id=api.submit_task(credential,dict(settings,file=dict(type='png',file_token=token)))
  save(receipt,dict(task_id=task_id,settings=settings,reference=str(ref.relative_to(ROOT)),sha256=hashlib.sha256(ref.read_bytes()).hexdigest()))
 if not receipt.exists():raise SystemExit('No task receipt for '+item)
 task_id=json.loads(receipt.read_text())['task_id'];task=api.get_task(credential,task_id)
 safe={k:task[k] for k in ['task_id','type','status','progress','error_code','error_msg','consumed_credit','credits_consumed'] if k in task}
 if task.get('status')=='success':
  safe['downloads']={}
  for name,url in (task.get('output')or{}).items():
   if name not in ['pbr_model','model','rendered_image'] or not isinstance(url,str) or not url.startswith('https://'):continue
   existing=list((dest/'source').glob(f'{item}-{name}.*'))
   path=existing[0] if existing else api.download_url(url,dest/'source',item,name)
   safe['downloads'][name]=dict(path=str(path.relative_to(ROOT)),bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
 save(dest/'status.json',safe);print(item,json.dumps(safe))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['probe','submit','status']);p.add_argument('items',nargs='*');a=p.parse_args()
 if a.action=='probe':run('probe','')
 for item in a.items:run(a.action,item)
