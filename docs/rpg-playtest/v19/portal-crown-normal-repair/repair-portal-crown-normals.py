import bpy,bmesh,runpy,json,time
from pathlib import Path
root=Path('/home/houston/git/institute');key='root_portal_crown_normal_repair';directory=root/'tmp/portal-crown-normal-repair';directory.mkdir(exist_ok=True);caller=bpy.context.window.scene;started=time.perf_counter()
def stage(action,batch=None):
 try:
  if action=='prepare':
   assert key not in bpy.app.driver_namespace,'Resume existing repair'
   original=bpy.app.driver_namespace['root_portal_abutments_bake_v3_recovery2'];previous=original['state'];baker=runpy.run_path(str(root/'scripts/blender/detailed/bake_masonry.py'));state=dict(previous);state['directory']=directory;state['completed']={'albedo','orm'};state['completed_images']={k:v for k,v in previous['completed_images'].items() if k!='normal'};state['channel_batches']={};state['preserve_existing_maps']={'normal'};state['images']=dict(previous['images'])
   state['images']['normal']=bpy.data.images.load(previous['completed_images']['normal']['path'],check_existing=False);state['images']['normal'].colorspace_settings.name='Non-Color';state['images']['normal'].use_fake_user=True
   scene=state['scene'];bpy.context.window.scene=scene;destination=bpy.data.collections.new('Portal two voussoir normal repair');scene.collection.children.link(destination);state['destination']=destination
   control=original['crownSourceNormalsControl'];low=control.copy();low.data=control.data.copy();low.name='WornPier_CrownNormalRepair';destination.objects.link(low);low.hide_render=True;low.hide_set(True);state['low']=low
   assert len(low.data.vertices)==len(previous['low'].data.vertices)
   assert all((a.co-b.co).length==0 for a,b in zip(low.data.vertices,previous['low'].data.vertices))
   assert all((a.uv-b.uv).length==0 for a,b in zip(low.data.uv_layers.active.data,previous['low'].data.uv_layers.active.data))
   material=bpy.data.materials.new('Portal repaired normal atlas');material.use_nodes=True;state['material']=material;state['target']=material.node_tree.nodes.new('ShaderNodeTexImage');low.data.materials.clear();low.data.materials.append(material)
   saved=low.data.attributes.new('repair_corner_normal','FLOAT_VECTOR','CORNER')
   for item,normal in zip(saved.data,low.data.corner_normals):item.vector=normal.vector
   batches=[]
   for sid in (50,61):
    data=low.data.copy();bm=bmesh.new();bm.from_mesh(data);layer=bm.faces.layers.int['masonry_source_id'];bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[layer]!=sid],context='FACES');loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(data);bm.free();data.normals_split_custom_set([tuple(x.vector) for x in data.attributes['repair_corner_normal'].data]);data.attributes.remove(data.attributes['repair_corner_normal']);obj=bpy.data.objects.new('Crown normal repair projection '+str(sid),data);destination.objects.link(obj);obj.matrix_world=low.matrix_world.copy();obj.hide_render=True;obj.hide_set(True);obj.visible_shadow=False;batches.append(([state['sources'][sid]],obj))
   low.data.attributes.remove(saved);state['batches']=batches;bpy.app.driver_namespace[key]=dict(state=state,baker=baker,source=original['source']);result=dict(action=action,batches=2,geometryAndUVUnchanged=True,reusedMaps=['albedo','orm'],repairSourceIds=[50,61])
  else:
   cache=bpy.app.driver_namespace[key];bpy.context.window.scene=cache['state']['scene']
   if action=='bake':cache['baker']['bake_channel'](cache['state'],'normal',batch_index=batch);result=dict(action=action,batch=batch,completed=sorted(cache['state']['channel_batches']['normal']))
   elif action=='export':result=dict(action=action,path=str(cache['baker']['finish_bake'](cache['state'])))
   else:raise ValueError(action)
  result['seconds']=time.perf_counter()-started;print(json.dumps(result));(directory/(action+('-'+str(batch) if batch is not None else '')+'.json')).write_text(json.dumps(result,indent=2)+'\n')
 finally:bpy.context.window.scene=caller
