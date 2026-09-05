"""Bake detailed source shaders to portable PBR texture atlases in Blender.

All nonemissive parts share one atlas/material; named parts are restored after
baking for cheap runtime presentation animation. GLBs embed their PNG textures.
"""
import bpy,bmesh,json,math,time
from pathlib import Path

def bake_asset(name,collection,size=1024):
    started=time.time();scene=bpy.context.scene
    for o in scene.objects:o.hide_render=o not in collection.objects.values()
    bpy.ops.object.select_all(action='DESELECT')
    solids=[];glows=[];parts={}
    for o in list(collection.objects):
        if o.type!='MESH':continue
        glow=all(m.get('bucket')=='glow' for m in o.data.materials)
        if glow:glows.append(o);continue
        part=o.get('part','Body');partid=parts.setdefault(part,len(parts))
        attr=o.data.attributes.new('part_id','INT','FACE')
        for a in attr.data:a.value=partid
        solids.append(o);o.select_set(True)
    bpy.context.view_layer.objects.active=solids[0]
    bpy.ops.object.join();obj=solids[0];obj.name='Detailed_'+name
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62),island_margin=.006,correct_aspect=True,scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=False
    scene.render.bake.margin=8;scene.render.bake.use_clear=True;scene.render.bake.use_selected_to_active=False
    scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
    mats=list(obj.data.materials);images={};targets={}
    for kind in ('albedo','normal','orm'):
        im=bpy.data.images.new(f'{name}-{kind}',width=size,height=size,alpha=False)
        if kind!='albedo':im.colorspace_settings.name='Non-Color'
        images[kind]=im
    for m in mats:
        node=m.node_tree.nodes.new('ShaderNodeTexImage');node.name='VAULT_BAKE_TARGET';node.select=True
        targets[m]=node
    def activate(kind):
        for m,node in targets.items():
            for n in m.node_tree.nodes:n.select=False
            node.image=images[kind];node.select=True;m.node_tree.nodes.active=node
        bpy.context.view_layer.objects.active=obj
    activate('albedo');bpy.ops.object.bake(type='DIFFUSE')
    print(name,'albedo baked',round(time.time()-started,1))
    activate('normal');bpy.ops.object.bake(type='NORMAL')
    print(name,'normal baked',round(time.time()-started,1))
    restore=[]
    for m in mats:
        n=m.node_tree.nodes;l=m.node_tree.links
        p=next(x for x in n if x.type=='BSDF_PRINCIPLED')
        out=next(x for x in n if x.type=='OUTPUT_MATERIAL')
        old=out.inputs['Surface'].links[0].from_socket
        emission=n.new('ShaderNodeEmission');combine=n.new('ShaderNodeCombineColor');combine.mode='RGB'
        ao=n.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=.28;ao.samples=16
        l.new(ao.outputs['AO'],combine.inputs['Red'])
        for shader_input,channel in [('Roughness','Green'),('Metallic','Blue')]:
            inp=p.inputs[shader_input]
            if inp.links:l.new(inp.links[0].from_socket,combine.inputs[channel])
            else:combine.inputs[channel].default_value=inp.default_value
        l.new(combine.outputs['Color'],emission.inputs['Color']);l.new(emission.outputs[0],out.inputs['Surface'])
        restore.append((m,out,old,[emission,combine,ao]))
    activate('orm');bpy.ops.object.bake(type='EMIT')
    for m,out,old,temp in restore:
        m.node_tree.links.new(old,out.inputs['Surface'])
        for n in temp:m.node_tree.nodes.remove(n)
    directory=RPG_REPO_ROOT/'scripts/blender/textures';directory.mkdir(parents=True,exist_ok=True)
    for kind,im in images.items():
        im.filepath_raw=str(directory/f'{name}-{kind}.png');im.file_format='PNG';im.save();im.pack()
    # The runtime material is standard metallic/roughness glTF, with baked normals.
    runtime=bpy.data.materials.new('Vault2_Baked_'+name);runtime.use_nodes=True
    p=runtime.node_tree.nodes.get('Principled BSDF');n=runtime.node_tree.nodes;l=runtime.node_tree.links
    tex={}
    for kind,im in images.items():
        a=n.new('ShaderNodeTexImage');a.image=im;a.label=kind;tex[kind]=a
    l.new(tex['albedo'].outputs['Color'],p.inputs['Base Color'])
    normal=n.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.85
    l.new(tex['normal'].outputs['Color'],normal.inputs['Color']);l.new(normal.outputs['Normal'],p.inputs['Normal'])
    split=n.new('ShaderNodeSeparateColor');split.mode='RGB';l.new(tex['orm'].outputs['Color'],split.inputs[0])
    l.new(split.outputs['Green'],p.inputs['Roughness']);l.new(split.outputs['Blue'],p.inputs['Metallic'])
    group=bpy.data.node_groups.get('glTF Material Output')
    if not group:
        group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
        group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    ao_output=n.new('ShaderNodeGroup');ao_output.node_tree=group
    l.new(split.outputs['Red'],ao_output.inputs['Occlusion'])
    obj.data.materials.clear();obj.data.materials.append(runtime)
    for f in obj.data.polygons:f.material_index=0
    # Preserve named independently animated submeshes, without multiplying materials.
    source=obj.data
    for part,partid in parts.items():
        data=source.copy();bm=bmesh.new();bm.from_mesh(data)
        layer=bm.faces.layers.int.get('part_id')
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[layer]!=partid],context='FACES')
        loose=[v for v in bm.verts if not v.link_faces]
        if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
        bm.to_mesh(data);bm.free()
        o=bpy.data.objects.new(part+'_Baked',data);collection.objects.link(o)
    bpy.data.objects.remove(obj,do_unlink=True)
    # Emission stays separate so crystals/eyes don't glow through solid stone.
    buckets={}
    for o in glows:buckets.setdefault((o.get('part','Body'),o.data.materials[0].name),[]).append(o)
    for (part,matname),objects in buckets.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        objects[0].name=part+'_Glow'
        bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in collection.objects:o.select_set(True);o.hide_render=False
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True,export_image_format='AUTO')
    info={'file':name+'.glb','triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in collection.objects),'nodes':len(collection.objects),'atlas':size,'seconds':round(time.time()-started,1)}
    print('BAKED',json.dumps(info))
    return info
