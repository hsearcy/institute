import bpy,json,time,hashlib
from pathlib import Path
baker,state=bpy.app.driver_namespace['starfall_bake_v2'];caller=bpy.context.window.scene;started=time.time()
try:
 assert state['completed']=={'albedo','normal','orm'}
 inputs={}
 for kind in ('albedo','normal','orm'):
  path=state['directory']/('starfall-'+kind+'-checkpoint.png')
  receipt=json.loads((state['directory']/(kind+'-receipt.json')).read_text())
  digest=hashlib.sha256(path.read_bytes()).hexdigest();assert digest==receipt['sha256'],('Checkpoint changed',kind)
  fresh=bpy.data.images.load(str(path),check_existing=False);fresh.use_fake_user=True;fresh.colorspace_settings.name='sRGB' if kind=='albedo' else 'Non-Color'
  assert len(fresh.pixels)==1024*1024*4 and fresh.has_data,('Unreadable checkpoint',kind)
  fresh.pack()
  state['images'][kind]=fresh;inputs[kind]={'path':str(path),'sha256':digest}
 output=baker.finish(state)
 report={'seconds':time.time()-started,'output':str(output),'immutableInputs':inputs,'restoredScene':caller.name}
 (state['directory']/'finish-receipt.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:bpy.context.window.scene=caller
