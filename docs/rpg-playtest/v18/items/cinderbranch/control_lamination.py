import bpy,json,math,time
from pathlib import Path
from mathutils import Vector,Matrix
module,scene=bpy.app.driver_namespace['cinder_material_v16'];caller=bpy.context.window.scene;started=time.time()
obj=next(o for o in scene.objects if o.name.startswith('Thermally fractured charcoal mass'))
original=obj.data;data=original.copy();obj.data=data
mat=bpy.data.materials.new('Diagnostic predicted coal lamination');mat.use_nodes=True
nodes,links=mat.node_tree.nodes,mat.node_tree.links;nodes.clear()
attr=nodes.new('ShaderNodeAttribute');attr.attribute_name='CinderLaminationDiagnostic'
ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.01,.02,.35,1);ramp.color_ramp.elements[1].color=(1,.035,.006,1)
ramp.color_ramp.elements[1].position=.65;middle=ramp.color_ramp.elements.new(.15);middle.color=(.02,.45,.08,1)
emit=nodes.new('ShaderNodeEmission');out=nodes.new('ShaderNodeOutputMaterial');links.new(attr.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],emit.inputs['Color']);links.new(emit.outputs[0],out.inputs['Surface'])
data.materials.clear();data.materials.append(mat)
mask=data.attributes.new('CinderLaminationDiagnostic','FLOAT','POINT')
turn=Matrix.Rotation(.38,3,'Z')@Matrix.Rotation(-.10,3,'X');inverse=turn.inverted();center=Vector((-.026,-.027,.530))
values=[]
try:
    for vertex in data.vertices:
        q=inverse@(vertex.co-center);t=max(0,min(1,(q.z+.035)/.070))
        q.x=(q.x-.004*math.sin(t*math.pi)+.008*t)/(1-.45*t);q.y/=1-.15*t
        q=Vector((q.x/.025,q.y/.018,q.z/.035)).normalized()
        layer=q.z+.18*q.x+.035*math.sin(q.y*6);amplitude=0
        for height,phase in ((-.46,.4),(.035,2.1),(.48,4.3)):
            d=layer-height-.025*math.sin(q.x*4+phase)
            coverage=.30+.70*max(0,math.sin(q.y*3+q.x*6+phase))
            amplitude+=abs(.028*math.exp(-(d/.024)**2)-.045*math.exp(-((d-.038)/.042)**2))*coverage
        value=min(1,amplitude/.045);mask.data[vertex.index].value=value;values.append(value)
    module.render_study(scene,Path('/home/houston/git/institute/tmp/item-models/cinder-v16-lamination-mask.png'),detail=True,focus=('cinderwand',.53,.34),view_offset=(.85,-3,.65))
    report={'seconds':time.time()-started,'diagnostic':'Reconstructed pre-skew radial direction, predicted geometric lamination amplitude. Blue zero; green0.15; red0.65+. Boolean cut faces use interpolated field, not proof of their displacement.','nonzeroFraction':sum(v>.01 for v in values)/len(values),'vertices':len(values),'sourceGeometryRestored':True,'restoredScene':caller.name}
    Path('/home/houston/git/institute/tmp/item-models/cinder-v16-lamination-mask.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:obj.data=original;bpy.context.window.scene=caller
