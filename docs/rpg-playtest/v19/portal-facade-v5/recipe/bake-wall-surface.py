"""Candidate-only planar maps matching the reviewed portal limestone recipe."""
from pathlib import Path
import bpy, hashlib, json, time
root=Path('/home/houston/git/institute')
source=root/'scripts/blender/sources/rock-face-03'
out=root/'tmp/portal-wall-surface-v1';out.mkdir(exist_ok=True)
manifest=json.loads((source/'manifest.json').read_text())
for key in ('Diffuse','Rough','Displacement'):
    assert hashlib.sha256((source/(key+'.jpg')).read_bytes()).hexdigest()==manifest[key]['sha256']
caller=bpy.context.window.scene
scene=bpy.data.scenes.new('Root portal matching wall surface candidate')
t0=time.monotonic()
try:
    bpy.context.window.scene=scene
    bpy.ops.mesh.primitive_plane_add(size=2)
    plane=bpy.context.object
    mat=bpy.data.materials.new('Portal matched unbaked limestone');mat.use_nodes=True;plane.data.materials.append(mat)
    n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear()
    output=n.new('ShaderNodeOutputMaterial');emit=n.new('ShaderNodeEmission');l.new(emit.outputs[0],output.inputs['Surface'])
    diffuse=n.new('ShaderNodeTexImage');diffuse.image=bpy.data.images.load(str(source/'Diffuse.jpg'),check_existing=True)
    sat=n.new('ShaderNodeHueSaturation');sat.inputs['Saturation'].default_value=.32;sat.inputs['Value'].default_value=1.25;l.new(diffuse.outputs['Color'],sat.inputs['Color'])
    mix=n.new('ShaderNodeMixRGB');mix.inputs[0].default_value=.7;mix.inputs[1].default_value=(.20,.205,.183,1);l.new(sat.outputs['Color'],mix.inputs[2])
    rough=n.new('ShaderNodeTexImage');rough.image=bpy.data.images.load(str(source/'Rough.jpg'),check_existing=True);rough.image.colorspace_settings.name='Non-Color'
    remap=n.new('ShaderNodeMapRange');remap.inputs['To Min'].default_value=.72;remap.inputs['To Max'].default_value=.96;l.new(rough.outputs['Color'],remap.inputs['Value'])
    scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.bake.margin=0
    artifacts={}
    for key,socket in [('albedo',mix.outputs[0]),('roughness',remap.outputs['Result'])]:
        img=bpy.data.images.new('Portal wall matched '+key,width=1024,height=1024,alpha=False)
        if key!='albedo':img.colorspace_settings.name='Non-Color'
        target=n.new('ShaderNodeTexImage');target.image=img
        for node in n:node.select=False
        n.active=target;target.select=True;l.new(socket,emit.inputs['Color'])
        bpy.ops.object.bake(type='EMIT')
        path=out/(key+'.png');img.filepath_raw=str(path);img.file_format='PNG';img.save()
        artifacts[key]={'path':str(path.relative_to(root)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}
        n.remove(target)
    report={'seconds':time.monotonic()-t0,'sourceManifest':str(source/'manifest.json'),'artifacts':artifacts,'recipe':'same diffuse desaturation/value/mix and roughness remap as masonry_pier.py; placement history remains vertex-based'}
    (out/'evidence.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
finally:
    bpy.context.window.scene=caller
