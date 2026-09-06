import bpy,json,time
from pathlib import Path
module,scene=bpy.app.driver_namespace['phoenix_exact_v2'];caller=bpy.context.window.scene;start=time.time();restore=[]
try:
 root=next(o for o in scene.objects if o.get('itemId')=='phoenix')
 materials={m for o in root.children_recursive if o.type=='MESH' for m in o.data.materials}
 for m in materials:
  shader=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  for link in list(shader.inputs['Normal'].links):restore.append((m,link.from_socket,link.to_socket));m.node_tree.links.remove(link)
 path=Path('/home/houston/git/institute/tmp/item-models/phoenix/v2/export-v2-head-no-normal.png')
 module.render_study(scene,str(path),detail=True,focus=('phoenix',.65,.67),view_offset=(1.1,-3,.6))
 print(json.dumps({'path':str(path),'seconds':time.time()-start,'restoredScene':caller.name}))
finally:
 for m,a,b in restore:m.node_tree.links.new(a,b)
 bpy.context.window.scene=caller
