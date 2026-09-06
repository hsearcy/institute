import bpy,json,time
from pathlib import Path
root=Path('/home/houston/git/institute');caller=bpy.context.window.scene;cache=bpy.app.driver_namespace['root_paving_strip_v3'];scene=bpy.data.scenes.new('Paving native geometry study');started=time.perf_counter()
try:
 bpy.context.window.scene=scene
 def material(name,color,rough):
  m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
 stone=material('Paving_Registered_Surface',(.25,.22,.16),.94);cut=material('Paving_Edge_Control',(.065,.055,.038),.97);dirt=material('Paving_Mortar_Control',(.055,.043,.027),.98)
 image=bpy.data.images.load(str(root/'web/public/assets/rpg/dungeon-cobbles-v2.png'),check_existing=True);texture=stone.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image;stone.node_tree.links.new(texture.outputs['Color'],stone.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 clones=[]
 for source in cache['collection'].objects:
  obj=source.copy();obj.data=source.data.copy();scene.collection.objects.link(obj)
  for i,m in enumerate(obj.data.materials):
   obj.data.materials[i]=stone if m.name.startswith('Existing cobble photo') else cut if m.name.startswith('Exposed stone edge') else dirt
  obj.select_set(True);clones.append(obj)
 bpy.context.view_layer.objects.active=clones[0];bpy.ops.object.join();obj=clones[0];obj.name='RegisteredPavingGeometryStudy'
 path=root/'tmp/paving-strip-v3-native.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False,export_image_format='AUTO')
 print(json.dumps(dict(path=str(path),bytes=path.stat().st_size,seconds=time.perf_counter()-started,scope='Geometry/UV registration study; native surfaces replaced by current game floor, cut/mortar constant controls, not final material bake')))
finally:bpy.context.window.scene=caller
