import bpy,json,math,time
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path('/home/houston/git/institute/tmp/item-models');caller=bpy.context.window.scene;start=time.time()
module,scene=bpy.app.driver_namespace['cinder_material_v18'];obj=next(o for o in scene.objects if o.name.startswith('Thermally fractured charcoal mass'))
original=list(obj.data.materials);mat=bpy.data.materials.new('V18 neutral actual coal facets');mat.use_nodes=True
p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.30,.30,.30,1);p.inputs['Metallic'].default_value=0;p.inputs['Roughness'].default_value=.45
try:
 obj.data.materials.clear();obj.data.materials.append(mat)
 module.render_study(scene,out/'cinder-v18-facet-neutral.png',detail=True,focus=('cinderwand',.53,.34),view_offset=(2.3,-1.6,1.5))
finally:
 obj.data.materials.clear()
 for m in original:obj.data.materials.append(m)
 bpy.context.window.scene=caller
module,scene=bpy.app.driver_namespace['phoenix_source_v4'];stats=[]
for obj in scene.objects:
 if obj.type!='MESH':continue
 attr=obj.data.attributes.get('PhoenixBronzeWear')
 if attr:
  vals=[v.value for v in attr.data]
  stats.append({'object':obj.name,'attributeMin':min(vals),'attributeMax':max(vals),'count':len(vals),'negative':sum(v<-.25 for v in vals),'rootSamples':vals[:24]})
target=Vector((0,0,.65));forward=-Vector((1.1,-3,.6)).normalized();right=forward.cross(Vector((0,0,1))).normalized();up=right.cross(forward)
trees=[(o,BVHTree.FromPolygons([v.co for v in o.data.vertices],[list(p.vertices) for p in o.data.polygons])) for o in scene.objects if o.type=='MESH']
samples=[]
for x,y in [(382,532),(346,332),(285,336),(405,616),(545,733)]:
 origin=target+right*((x-600)*.67/1200)+up*((400-y)*.67/1200)-forward*2
 nearest=None
 for o,tree in trees:
  inv=o.matrix_world.inverted();pos,normal,face,distance=tree.ray_cast(inv@origin,inv.to_3x3()@forward)
  if pos is None:continue
  world=o.matrix_world@pos;dist=(world-origin).length
  if nearest is None or dist<nearest[0]:nearest=(dist,o,face)
 if nearest:
  _,o,face=nearest;poly=o.data.polygons[face];attr=o.data.attributes.get('PhoenixBronzeWear');value=sum(attr.data[i].value for i in poly.vertices)/len(poly.vertices) if attr else 0
  material=o.data.materials[poly.material_index];ramp=next((n for n in material.node_tree.nodes if n.type=='VALTORGB'),None)
  samples.append({'pixel':[x,y],'object':o.name,'wearApproxFaceMean':value,'roughnessMapped':.44-.14*value if 'aged gilded bronze' in material.name else None,'baseColorBeforeAO':list(ramp.color_ramp.evaluate(.5*value+.5)) if ramp and 'aged gilded bronze' in material.name else None,'attributePresent':attr is not None,'material':material.name})
report={'seconds':time.time()-start,'scope':'Actual Cinder v18 mesh neutral oblique view only; unchanged original materials restored. Phoenix v4 vertex-material fields and visible ray-hit face means; roughness mapping excludes lighting/AO. No material edits.','phoenixAttributeStats':stats,'phoenixVisibleSamples':samples,'restoredScene':caller.name}
(out/'item-v18-v4-control.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
