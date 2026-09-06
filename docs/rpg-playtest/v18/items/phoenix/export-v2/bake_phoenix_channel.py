import bpy,time,json,hashlib,numpy as np
from pathlib import Path
# Caller supplies channel='albedo'|'normal'|'orm'. Exactly one channel per call.
baker,state=bpy.app.driver_namespace['phoenix_bake_v2'];caller=bpy.context.window.scene;started=time.time()
try:
 baker.bake(state,channel)
 image=state['images'][channel];image.use_fake_user=True
 pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);rgb=pixels.reshape(-1,4)[:,:3]
 assert np.isfinite(rgb).all() and float(rgb.max())>.02, ('Invalid/blank baked image',channel,float(rgb.max()))
 output=state['directory']/('phoenix-'+channel+'-checkpoint.png');image.filepath_raw=str(output);image.file_format='PNG';image.save();image.pack()
 report={'channel':channel,'seconds':time.time()-started,'checkpoint':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'rgbMax':rgb.max(axis=0).tolist(),'nonzeroPixels':int(np.count_nonzero(np.max(rgb,axis=1)>.005)),'completed':sorted(state['completed']),'restoredScene':caller.name}
 (state['directory']/(channel+'-receipt.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:bpy.context.window.scene=caller
