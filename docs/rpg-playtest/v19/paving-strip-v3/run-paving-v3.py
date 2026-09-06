import bpy,bmesh,runpy,json,time
from pathlib import Path
root=Path('/home/houston/git/institute');caller=bpy.context.window.scene;started=time.perf_counter()
try:
 key='root_paving_strip_v3'
 if key not in bpy.app.driver_namespace:
  module=runpy.run_path(str(root/'scripts/blender/experiments/paving_strip.py'));scene,collection=module['build_paving_strip'](root)
  bpy.app.driver_namespace[key]=dict(module=module,scene=scene,collection=collection)
 cache=bpy.app.driver_namespace[key];scene,collection=cache['scene'],cache['collection'];report=[]
 for obj in collection.objects:
  bm=bmesh.new();bm.from_mesh(obj.data)
  report.append(dict(name=obj.name,triangles=sum(len(f.verts)-2 for f in bm.faces),closed=all(e.is_manifold for e in bm.edges),volume=bm.calc_volume(signed=True)))
  bm.free()
 assert all(o['closed'] and o['volume']>0 for o in report)
 uvError=max(abs(obj.data.uv_layers.active.data[i].uv[a]-((obj.data.vertices[obj.data.loops[i].vertex_index].co.x/4.8) if a==0 else (-obj.data.vertices[obj.data.loops[i].vertex_index].co.y/4.8))) for obj in collection.objects for i in range(len(obj.data.loops)) for a in (0,1))
 cache['module']['render_paving_strip'](scene,collection,str(root/'tmp/paving-strip-v3-source.png'))
 result=dict(objects=report,totalTriangles=sum(o['triangles'] for o in report),worldUVMaxError=uvError,seconds=time.perf_counter()-started)
 (root/'tmp/paving-strip-v3-source.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(objects=len(report),totalTriangles=result['totalTriangles'],worldUVMaxError=uvError,seconds=result['seconds'])))
finally:bpy.context.window.scene=caller
