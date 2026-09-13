"""Bake shared PBR atlas and add the game's articulation contract."""
import bpy, os, json, numpy as np
ROOT='/home/hfsearcy/git/institute';OUT=ROOT+'/docs/concepts/skeleton-model'
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
meshes=[o for o in bpy.data.objects if o.type=='MESH']
for material in list(bpy.data.materials):
    if not material.users:bpy.data.materials.remove(material)
# The first UV layer is the source texture projection. The second is a shared atlas.
for o in meshes:
    old=o.data.uv_layers.active;old.name='SurfaceUV'
    o.data.uv_layers.new(name='AtlasUV');o.data.uv_layers.active_index=1;o.data.uv_layers['AtlasUV'].active_render=True
for m in list(bpy.data.materials):
    if not m.use_nodes:continue
    uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='SurfaceUV'
    for node in m.node_tree.nodes:
        if node.type=='TEX_IMAGE':m.node_tree.links.new(uv.outputs['UV'],node.inputs['Vector'])
        if node.type=='NORMAL_MAP':node.uv_map='SurfaceUV'
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.2,island_margin=.003);bpy.ops.object.mode_set(mode='OBJECT')
# Reserve more atlas area for the skull and helmet.
for o in meshes:
    if o.parent and o.parent.name=='head':
        for loop in o.data.uv_layers['AtlasUV'].data:loop.uv*=1.7
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.pack_islands(rotate=True,margin=.003);bpy.ops.object.mode_set(mode='OBJECT')
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
# Albedo is emitted color, independent of diffuse/specular energy split.
saved=[]
for m in list(bpy.data.materials):
    if not m.use_nodes:continue
    p=m.node_tree.nodes.get('Principled BSDF');out=m.node_tree.nodes.get('Material Output')
    previous=out.inputs['Surface'].links[0].from_socket
    e=m.node_tree.nodes.new('ShaderNodeEmission')
    if p.inputs['Base Color'].is_linked:m.node_tree.links.new(p.inputs['Base Color'].links[0].from_socket,e.inputs['Color'])
    else:e.inputs['Color'].default_value=p.inputs['Base Color'].default_value
    m.node_tree.links.new(e.outputs[0],out.inputs['Surface']);saved.append((m,out,previous,e))
base=bake('Skeleton concept base color','EMIT')
for m,out,previous,e in saved:
    m.node_tree.links.new(previous,out.inputs['Surface']);m.node_tree.nodes.remove(e)
bpy.ops.wm.save_as_mainfile(filepath='/home/hfsearcy/git/institute/docs/concepts/skeleton-model/atlas-v18-stage-1.blend')
result={'stage':1}
