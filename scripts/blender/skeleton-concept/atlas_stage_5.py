"""Bake shared PBR atlas and add the game's articulation contract."""
import bpy, os, json, numpy as np
ROOT='/home/hfsearcy/git/institute';OUT=ROOT+'/docs/concepts/skeleton-model'
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
meshes=[o for o in bpy.data.objects if o.type=='MESH']
N=2048
def bake(name,kind):
    im=bpy.data.images.new(name,width=N,height=N,alpha=False)
    if name!='Skeleton concept base color':im.colorspace_settings.name='Non-Color'
    for m in list(bpy.data.materials):
        if m.use_nodes:
            n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;m.node_tree.nodes.active=n
    scene.render.bake.use_clear=True;scene.render.bake.margin=4
    scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
    bpy.ops.object.bake(type=kind,uv_layer='AtlasUV')
    im.pack();return im
# Bake metallic via emission without scene lighting.
for m in list(bpy.data.materials):
    if not m.use_nodes:continue
    p=m.node_tree.nodes.get('Principled BSDF');out=m.node_tree.nodes.get('Material Output')
    e=m.node_tree.nodes.new('ShaderNodeEmission');v=p.inputs['Metallic'].default_value;e.inputs['Color'].default_value=(v,v,v,1);
    if p.inputs['Metallic'].is_linked:m.node_tree.links.new(p.inputs['Metallic'].links[0].from_socket,e.inputs['Color'])
    m.node_tree.links.new(e.outputs[0],out.inputs['Surface'])
metal=bake('Metal channel','EMIT')
bpy.ops.wm.save_as_mainfile(filepath='/home/hfsearcy/git/institute/docs/concepts/skeleton-model/atlas-v18-stage-5.blend')
result={'stage':5}
