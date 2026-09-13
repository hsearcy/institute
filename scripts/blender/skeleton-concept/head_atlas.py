"""Bake a dedicated head atlas. STAGE is supplied by the MCP caller (1 to 5)."""
import bpy, os
OUT='/home/hfsearcy/git/institute/docs/concepts/skeleton-model'
STAGE=globals().get('STAGE',1)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12 if STAGE==3 else 1
head=[o for o in bpy.data.objects if o.type=='MESH' and o.parent and o.parent.name in ['head','leftHand','rightHand'] and 'Cold teal soul' not in o.name]
bpy.ops.object.select_all(action='DESELECT')
for o in head:o.select_set(True)
bpy.context.view_layer.objects.active=head[0]
if STAGE==1:
    for o in head:
        uv=o.data.uv_layers.new(name='HeadUV');o.data.uv_layers.active=uv;uv.active_render=True
    # Restore source shaders after the earlier metallic-channel bake.
    for m in bpy.data.materials:
        if m.use_nodes:
            p=m.node_tree.nodes.get('Principled BSDF');out=m.node_tree.nodes.get('Material Output')
            if p and out:m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.2,island_margin=.0015);bpy.ops.object.mode_set(mode='OBJECT')
    # All source image vectors/tangent bases still refer to SurfaceUV.
saved=[]
if STAGE in [1,5]:
    source='Base Color' if STAGE==1 else 'Metallic'
    for m in bpy.data.materials:
        if not m.use_nodes:continue
        p=m.node_tree.nodes.get('Principled BSDF');out=m.node_tree.nodes.get('Material Output')
        if not p or not out:continue
        previous=out.inputs['Surface'].links[0].from_socket;e=m.node_tree.nodes.new('ShaderNodeEmission')
        socket=p.inputs[source]
        if socket.is_linked:m.node_tree.links.new(socket.links[0].from_socket,e.inputs['Color'])
        elif STAGE==1:e.inputs['Color'].default_value=socket.default_value
        else:e.inputs['Color'].default_value=(*([socket.default_value]*3),1)
        m.node_tree.links.new(e.outputs[0],out.inputs['Surface']);saved.append((m,out,previous,e))
name,kind={1:('Head base color','EMIT'),2:('Head normal','NORMAL'),3:('Head AO','AO'),4:('Head roughness','ROUGHNESS'),5:('Head metallic','EMIT')}[STAGE]
im=bpy.data.images.new(name,width=2048,height=2048,alpha=False)
if STAGE!=1:im.colorspace_settings.name='Non-Color'
for m in bpy.data.materials:
    if m.use_nodes:
        n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;m.node_tree.nodes.active=n
scene.render.bake.use_clear=True;scene.render.bake.margin=5
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
bpy.ops.object.bake(type=kind,uv_layer='HeadUV');im.pack()
for m,out,previous,e in saved:m.node_tree.links.new(previous,out.inputs['Surface']);m.node_tree.nodes.remove(e)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/detail-v26-stage-'+str(STAGE)+'.blend')
result={'head_atlas_stage':STAGE,'resolution':2048,'body_uv_changed':False}
