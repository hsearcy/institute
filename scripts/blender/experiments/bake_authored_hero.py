"""Preserve authored UV sets while baking portable hero PBR materials.

Used by the dedicated canonical hero rebuild. This stage writes only its own
conversion cache; controlled steel and alpha hair preserve the reviewed source.
"""
from pathlib import Path
import bpy
import numpy as np


def bake_authored_material(source, directory, label, size=2048):
    """Bake the reviewed shader over its original full UV domain.

    Each source material has a separate authored atlas. Overlapping coordinates
    across materials are intentional; never smart-project over those source UVs.
    """
    directory=Path(directory);directory.mkdir(parents=True,exist_ok=True)
    previous=bpy.context.window.scene
    scene=bpy.data.scenes.new('Hero material conversion '+label)
    bpy.context.window.scene=scene
    scene.render.engine='CYCLES';scene.cycles.samples=1
    scene.render.bake.use_clear=True;scene.render.bake.margin=0
    scene.render.bake.use_selected_to_active=False
    bpy.ops.mesh.primitive_plane_add(size=2)
    plane=bpy.context.object
    material=source.copy();material.name='Conversion source '+label
    plane.data.materials.append(material)
    nodes=material.node_tree.nodes;links=material.node_tree.links
    shader=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
    if shader is None:
        bpy.context.window.scene=previous
        raise ValueError('Separate conversion required for non-Principled material '+source.name)
    out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    # Hair source uses a transparent mix; sample its color/alpha inputs directly.
    emission=nodes.new('ShaderNodeEmission')
    target=nodes.new('ShaderNodeTexImage')
    images={}

    def activate(role,dimension,noncolor=False):
        image=bpy.data.images.new('AuthoredHero_'+label+'_'+role,width=dimension,height=dimension,alpha=False)
        if noncolor:image.colorspace_settings.name='Non-Color'
        for node in nodes:node.select=False
        target.image=image;target.select=True;nodes.active=target
        images[role]=image
        return image

    def connect_input(socket,destination):
        for old_link in list(destination.links):links.remove(old_link)
        if socket.is_linked:links.new(socket.links[0].from_socket,destination)
        else:
            value=socket.default_value
            if destination.type=='RGBA' and isinstance(value,(float,int)):
                value=(value,value,value,1)
            destination.default_value=value

    def emit_input(socket,role,dimension,noncolor=False):
        activate(role,dimension,noncolor)
        connect_input(socket,emission.inputs['Color'])
        links.new(emission.outputs[0],out.inputs['Surface'])
        bpy.ops.object.bake(type='EMIT')

    emit_input(shader.inputs['Base Color'],'albedo',size)
    has_alpha=shader.inputs['Alpha'].is_linked or shader.inputs['Alpha'].default_value<1
    if has_alpha:
        emit_input(shader.inputs['Alpha'],'alpha',size,True)
        # The authored beard also mixes the already-transparent Principled
        # surface with a Transparent BSDF. Preserve its effective coverage.
        mixes=[n for n in nodes if n.type=='MIX_SHADER']
        if mixes:
            if len(mixes)!=1:raise ValueError('Review nested alpha shader '+source.name)
            mix=mixes[0]
            branches=[i.links[0].from_node if i.is_linked else None for i in mix.inputs[1:]]
            if shader not in branches or not any(n and n.type=='BSDF_TRANSPARENT' for n in branches):
                raise ValueError('Review nonstandard alpha shader '+source.name)
            factor=nodes.new('ShaderNodeMath');factor.operation='MULTIPLY'
            connect_input(shader.inputs['Alpha'],factor.inputs[0])
            if branches[1]==shader:
                connect_input(mix.inputs[0],factor.inputs[1])
            else:
                inverse=nodes.new('ShaderNodeMath');inverse.operation='SUBTRACT'
                inverse.inputs[0].default_value=1
                connect_input(mix.inputs[0],inverse.inputs[1])
                links.new(inverse.outputs[0],factor.inputs[1])
            links.new(factor.outputs[0],emission.inputs['Color'])
            bpy.ops.object.bake(type='EMIT')
        rgb=np.empty(size*size*4,dtype=np.float32);images['albedo'].pixels.foreach_get(rgb)
        alpha=np.empty_like(rgb);images['alpha'].pixels.foreach_get(alpha)
        rgb[3::4]=alpha[0::4]
        rgba=bpy.data.images.new('AuthoredHero_'+label+'_rgba',width=size,height=size,alpha=True)
        rgba.pixels.foreach_set(rgb);rgba.update();images['albedo']=rgba

    # Normal baking evaluates the reviewed per-metal normal-strength remap.
    links.new(shader.outputs['BSDF'],out.inputs['Surface'])
    activate('normal',min(size,1024),True)
    bpy.ops.object.bake(type='NORMAL')
    combine=nodes.new('ShaderNodeCombineColor');combine.mode='RGB'
    combine.inputs['Red'].default_value=1
    connect_input(shader.inputs['Roughness'],combine.inputs['Green'])
    connect_input(shader.inputs['Metallic'],combine.inputs['Blue'])
    links.new(combine.outputs['Color'],emission.inputs['Color'])
    links.new(emission.outputs[0],out.inputs['Surface'])
    activate('orm',min(size,1024),True);bpy.ops.object.bake(type='EMIT')

    runtime=bpy.data.materials.new('AuthoredHero_'+label);runtime.use_nodes=True
    n=runtime.node_tree.nodes;l=runtime.node_tree.links;p=n.get('Principled BSDF')
    p.inputs['Roughness'].default_value=.65
    p.inputs['Specular IOR Level'].default_value=shader.inputs['Specular IOR Level'].default_value
    textures={}
    for role in ('albedo','normal','orm'):
        image=images[role];image.filepath_raw=str(directory/(label+'-'+role+'.png'))
        image.file_format='PNG';image.save();image.pack()
        texture=n.new('ShaderNodeTexImage');texture.image=image;textures[role]=texture
    l.new(textures['albedo'].outputs['Color'],p.inputs['Base Color'])
    if has_alpha:
        l.new(textures['albedo'].outputs['Alpha'],p.inputs['Alpha'])
        runtime.surface_render_method='DITHERED'
        runtime['gltfAlphaMode']='MASK';runtime['gltfAlphaCutoff']=.4
    normal=n.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=1
    l.new(textures['normal'].outputs['Color'],normal.inputs['Color']);l.new(normal.outputs['Normal'],p.inputs['Normal'])
    split=n.new('ShaderNodeSeparateColor');split.mode='RGB'
    l.new(textures['orm'].outputs['Color'],split.inputs[0])
    l.new(split.outputs['Green'],p.inputs['Roughness']);l.new(split.outputs['Blue'],p.inputs['Metallic'])
    runtime['authoredSourceMaterial']=source.name
    bpy.context.window.scene=previous
    return runtime


def used_materials(collection):
    return sorted({o.data.materials[p.material_index] for o in collection.objects
                   if o.type=='MESH' for p in o.data.polygons if o.data.materials[p.material_index]},key=lambda m:m.name)


def bake_hero_collection_materials(collection,directory,converted=None):
    """Convert only this candidate's used materials; preserve the source scene."""
    converted={} if converted is None else converted
    for source in used_materials(collection):
        if source in converted:continue
        nodes=source.node_tree.nodes
        principled=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
        glass=next((n for n in nodes if n.type=='BSDF_GLASS'),None)
        if glass and principled is None:
            material=bpy.data.materials.new('AuthoredHero cornea');material.use_nodes=True
            p=material.node_tree.nodes.get('Principled BSDF')
            p.inputs['Base Color'].default_value=glass.inputs['Color'].default_value
            p.inputs['Roughness'].default_value=max(.04,glass.inputs['Roughness'].default_value)
            # The clear shell asks Three.js to render the entire scene again.
            # Discard only this shell so the separate authored iris remains
            # visible; an opaque shell instead produces blank white eyes.
            p.inputs['Transmission Weight'].default_value=0
            p.inputs['Alpha'].default_value=0
            material['gltfAlphaMode']='MASK';material['gltfAlphaCutoff']=.4
            p.inputs['IOR'].default_value=1.45
            converted[source]=material
            continue
        if principled is None:raise ValueError('Unsupported source shader '+source.name)
        if not any(n.type=='TEX_IMAGE' and n.image for n in nodes) and 'forged blade' not in source.name:
            material=source.copy();material.name='AuthoredHero '+source.name
            p=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            for link in list(p.inputs['Normal'].links):material.node_tree.links.remove(link)
            converted[source]=material
            continue
        key=next((part for part in ('set1','set2','set3') if part in source.name),None)
        if key:size=2048
        elif source.name.startswith('face'):key='face';size=1024
        elif source.name.startswith('hair'):key='hair';size=1024
        elif 'Eyelash' in source.name:key='eyelashes';size=512
        elif 'EyeBlend' in source.name:key='eye-blend';size=256
        elif source.name.startswith('eye'):key='eyes';size=256
        elif 'forged blade' in source.name:key='blade';size=512
        else:raise ValueError('Review texture budget for '+source.name)
        converted[source]=bake_authored_material(source,directory,key,size)
        print('Converted authored hero material',key,flush=True)
    for obj in collection.objects:
        if obj.type!='MESH':continue
        for index,material in enumerate(list(obj.data.materials)):
            if material in converted:obj.data.materials[index]=converted[material]
    return converted
