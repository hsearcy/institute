import bpy,json,time
from pathlib import Path
from mathutils import Vector
module,scene=bpy.app.driver_namespace['cinder_material_v16'];caller=bpy.context.window.scene;started=time.time()
obj=next(o for o in scene.objects if o.name.startswith('Thermally fractured charcoal mass'))
materials=list(obj.data.materials)
mat=bpy.data.materials.new('Diagnostic neutral coal surface');mat.use_nodes=True
shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.20,.20,.20,1);shader.inputs['Metallic'].default_value=0;shader.inputs['Roughness'].default_value=.50
target=Vector((0,0,.53));forward=-Vector((.85,-3,.65)).normalized();right=forward.cross(Vector((0,0,1))).normalized();up=right.cross(forward)
faces=[]
for face in obj.data.polygons:
    relative=obj.matrix_world@face.center-target
    xy=[600+relative.dot(right)*1200/.34,400-relative.dot(up)*1200/.34]
    if 480<=xy[0]<=557 and 315<=xy[1]<=488:
        faces.append({'id':face.index,'vertices':list(face.vertices),'smooth':face.use_smooth,'normal':list(face.normal),'area':face.area,'imageCenter':xy})
try:
    obj.data.materials.clear();obj.data.materials.append(mat)
    module.render_study(scene,Path('/home/houston/git/institute/tmp/item-models/cinder-v16-right-flat.png'),detail=True,focus=('cinderwand',.53,.34),view_offset=(.85,-3,.65))
    report={'seconds':time.time()-started,'scope':'Same actual coal geometry/camera under neutral map-free material; projected nominated right-face polygon centers, includes occluded/back faces','faces':faces,'smoothCount':sum(f['smooth'] for f in faces),'faceCount':len(faces),'restoredScene':caller.name}
    Path('/home/houston/git/institute/tmp/item-models/cinder-v16-right-flat.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='faces'}))
finally:
    obj.data.materials.clear()
    for material in materials:obj.data.materials.append(material)
    bpy.context.window.scene=caller
