"""Isolated staged item baking using the measured joined-source projection path.

Prepare only reviewed source candidates. Output remains in ignored item-models;
the parent owns public installation and equipped/native acceptance.
"""
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[3]


def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result


def prepare(source_scene,item_id,size=1024,*,structured_blade=False,split_material_boundaries=False):
    if source_scene.get('diagnosticOnly'):
        raise ValueError('Optical control scenes are not export candidates')
    previous=bpy.context.window.scene
    directory=ROOT/'tmp/item-models'/item_id
    directory.mkdir(parents=True,exist_ok=True)
    sys.path.insert(0,str(ROOT/'scripts/blender/experiments'))
    helper=load(ROOT/'scripts/blender/detailed/bake_masonry.py','item_projection_helper')
    joined=load(ROOT/'scripts/blender/experiments/bake_authored_enemy.py','item_joined_bake_helper')
    try:
        bpy.context.window.scene=source_scene
        root=next(o for o in source_scene.objects if o.get('itemId')==item_id)
        root_inverse=root.matrix_world.inverted()
        source_meta={key:value for key,value in root.items()}
        scene=bpy.data.scenes.new('Item bake '+item_id)
        high=bpy.data.collections.new(item_id+' isolated high');scene.collection.children.link(high)
        destination=bpy.data.collections.new(item_id+' low and projection targets');scene.collection.children.link(destination)
        sources=[];glows=[]
        graph=bpy.context.evaluated_depsgraph_get()
        for original in root.children:
            if original.type!='MESH':continue
            data=bpy.data.meshes.new_from_object(original.evaluated_get(graph),preserve_all_data_layers=True,depsgraph=graph)
            data.transform(root_inverse@original.matrix_world)
            obj=bpy.data.objects.new(original.name+' source',data);high.objects.link(obj)
            direct=all(m.use_nodes and m.node_tree.nodes.get('Principled BSDF') and
                       (m.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value>0 or
                        m.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value<1) for m in data.materials)
            (glows if direct else sources).append(obj)
        bpy.context.window.scene=scene
        lows=[]
        for source_id,source in enumerate(sources):
            authored_blade=structured_blade and item_id=='cleaver' and source.name.startswith('Forged blade Ashsplitter')
            if authored_blade:
                builder=load(ROOT/'scripts/blender/items/metal_weapons.py','item_structured_blade')
                low=builder._single_edge(None,*source.data.materials,low=True)
                destination.objects.link(low);scene.collection.objects.unlink(low)
            else:
                low=bpy.data.objects.new(source.name+' low',source.data.copy());destination.objects.link(low)
            attr=low.data.attributes.new('item_source_id','INT','FACE')
            for value in attr.data:value.value=source_id
            triangles=helper.triangle_count([low])
            ratio=1 if authored_blade else .035 if 'grown' in source.name or 'leather wrapped' in source.name else .075 if 'Forged blade' in source.name else .045 if 'charcoal mass' in source.name else .25 if triangles>1500 else 1
            if ratio<1:
                bpy.ops.object.select_all(action='DESELECT');low.select_set(True);bpy.context.view_layer.objects.active=low
                modifier=low.modifiers.new('Preserve source silhouette for projection','DECIMATE');modifier.ratio=ratio;modifier.use_collapse_triangulate=True
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            if split_material_boundaries and len(low.data.materials)>1:
                # A hard steel/bevel color boundary belongs to the mesh seam,
                # not an antialiased diagonal inside a tiny shared atlas chart.
                # Separate and rejoin preserves the normals and source IDs but
                # keeps the UV projector from welding across that boundary.
                bpy.ops.object.select_all(action='DESELECT');low.select_set(True);bpy.context.view_layer.objects.active=low
                bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
                bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
                lows.extend(bpy.context.selected_objects)
            else:lows.append(low)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in lows:obj.select_set(True)
        bpy.context.view_layer.objects.active=lows[0];bpy.ops.object.join();low=lows[0];low.name=item_id+'_Baked'
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(65),island_margin=.005,correct_aspect=True,scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        helper.widen_subpixel_islands(low.data,3/size)
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.uv.select_all(action='SELECT');bpy.ops.uv.pack_islands(rotate=True,scale=True,margin=.004,margin_method='FRACTION');bpy.ops.object.mode_set(mode='OBJECT')
        normal_attr=low.data.attributes.new('item_bake_normal','FLOAT_VECTOR','CORNER')
        for value,normal in zip(normal_attr.data,low.data.corner_normals):value.vector=normal.vector
        material=bpy.data.materials.new('Item '+item_id+' baked');material.use_nodes=True
        low.data.materials.clear();low.data.materials.append(material)
        for face in low.data.polygons:face.material_index=0
        target=material.node_tree.nodes.new('ShaderNodeTexImage');target.name='AUTHORED_ENEMY_BAKE_TARGET'
        batches=[]
        for ids in helper.projection_groups(sources,clearance=.008):
            data=low.data.copy();bm=bmesh.new();bm.from_mesh(data);layer=bm.faces.layers.int['item_source_id']
            bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[layer] not in ids],context='FACES')
            bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(data);bm.free()
            normals=data.attributes['item_bake_normal'];data.normals_split_custom_set([tuple(v.vector) for v in normals.data]);data.attributes.remove(normals)
            obj=bpy.data.objects.new(item_id+' isolated projection',data);destination.objects.link(obj);obj.hide_set(True);obj.hide_render=True;obj.visible_shadow=False
            batches.append(([sources[i] for i in ids],obj))
        low.data.attributes.remove(low.data.attributes['item_bake_normal']);low.hide_set(True);low.hide_render=True
        images={}
        for kind in ('albedo','normal','orm'):
            image=bpy.data.images.new(item_id+'_'+kind,width=size,height=size,alpha=False)
            if kind!='albedo':image.colorspace_settings.name='Non-Color'
            images[kind]=image
        scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
        scene.render.bake.margin=0;scene.render.bake.use_selected_to_active=True
        scene.render.bake.cage_extrusion=.006;scene.render.bake.max_ray_distance=.025
        scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
        state=dict(scene=scene,destination=destination,low=low,sources=sources,batches=batches,material=material,target=target,images=images,directory=directory,size=size,completed=set(),channel_batches={},helper=helper,source_triangles=helper.triangle_count(sources))
        result=joined.joined_source_comparison(state,directory/'baked')
        result.update(item_id=item_id,metadata=source_meta,glows=glows,joined_helper=joined,
                      geometry_normals_only=item_id=='apprentice')
        print(json.dumps({'item':item_id,'source':result['source_triangles'],'low':helper.triangle_count([result['low']]),'projectionGroups':len(result['batches']),'directEmissiveOrAlphaParts':len(glows)}))
        return result
    finally:bpy.context.window.scene=previous


def bake(state,channel):
    """One observable channel per shared Blender ownership window."""
    if channel not in ('albedo','normal','orm'):raise ValueError(channel)
    links=[]
    try:
        # The narrow sword's sub-texel procedural bump becomes coarse grain in
        # a 1K bake. Preserve modeled bevel/wrap normals; color/roughness retain
        # the source's handled material variation. This candidate treatment is
        # scoped to Apprentice and requires exact-export visual comparison.
        if channel=='normal' and state.get('geometry_normals_only'):
            for material in {m for obj in state['sources'] for m in obj.data.materials}:
                for node in material.node_tree.nodes:
                    if node.type!='BUMP':continue
                    for link in list(node.outputs['Normal'].links):
                        links.append((material,link.from_socket,link.to_socket))
                        material.node_tree.links.remove(link)
        state['joined_helper'].bake(state,channel)
    finally:
        for material,source,target in links:material.node_tree.links.new(source,target)


def channel_variant(state,label,channel='normal'):
    """Preserve reviewed geometry/maps while testing a single baked channel."""
    previous=bpy.context.window.scene
    try:
        bpy.context.window.scene=state['scene']
        material=bpy.data.materials.new('Item normal transfer '+label);material.use_nodes=True
        target=material.node_tree.nodes.new('ShaderNodeTexImage');target.name='AUTHORED_ENEMY_BAKE_TARGET'
        def copy_target(source):
            obj=source.copy();obj.data=source.data.copy();state['destination'].objects.link(obj)
            obj.data.materials.clear();obj.data.materials.append(material)
            obj.hide_set(True);obj.hide_render=True
            return obj
        channels={channel} if isinstance(channel,str) else set(channel)
        images=dict(state['images'])
        for kind in channels:
            images[kind]=bpy.data.images.new(label+' '+kind,width=state['size'],height=state['size'],alpha=False)
            images[kind].colorspace_settings.name='sRGB' if kind=='albedo' else 'Non-Color'
        directory=state['directory'].parent/label;directory.mkdir(parents=True,exist_ok=True)
        return dict(state,material=material,target=target,images=images,directory=directory,
                    low=copy_target(state['low']),batches=[(sources,copy_target(destination)) for sources,destination in state['batches']],
                    completed={'albedo','orm','normal'}-channels,channel_batches={kind:set() if kind in channels else set(range(len(state['batches']))) for kind in ('albedo','normal','orm')})
    finally:
        bpy.context.window.scene=previous


def normal_variant(state,label):
    return channel_variant(state,label,'normal')


def bake_guard_roughness(state,roughness=.54,blackened=False):
    """Change only the crossguard's material in an existing source snapshot."""
    restore=[];added=[]
    try:
        for source in state['sources']:
            indices={i for i,material in enumerate(source.data.materials) if 'handled forged hilt steel' in material.name}
            for index in indices:
                material=source.data.materials[index].copy();material.name='Item Apprentice brushed crossguard bake'
                shader=material.node_tree.nodes.get('Principled BSDF')
                for link in list(shader.inputs['Roughness'].links):material.node_tree.links.remove(link)
                shader.inputs['Roughness'].default_value=roughness
                if blackened:
                    shader.inputs['Metallic'].default_value=.65
                    darken=material.node_tree.nodes.new('ShaderNodeVectorMath');darken.operation='MULTIPLY';darken.inputs[1].default_value=(.32,.36,.38)
                    material.node_tree.links.new(shader.inputs['Base Color'].links[0].from_socket,darken.inputs[0])
                    material.node_tree.links.new(darken.outputs['Vector'],shader.inputs['Base Color'])
                new_index=len(source.data.materials);source.data.materials.append(material);added.append((source,new_index,material))
                for face in source.data.polygons:
                    if face.material_index==index and all(source.data.vertices[v].co.z>.06 for v in face.vertices):
                        restore.append((face,index));face.material_index=new_index
        if not restore:raise ValueError('No actual crossguard faces selected')
        print('Crossguard-only roughness faces',len(restore),roughness)
        if blackened:bake(state,'albedo')
        bake(state,'orm')
    finally:
        for face,index in restore:face.material_index=index
        for source,index,material in reversed(added):
            source.data.materials.pop(index=index)
            if material.users==0:bpy.data.materials.remove(material)


def finish(state):
    """Raw embedded candidate; global atlas padding follows outside Blender."""
    if state['completed']!={'albedo','normal','orm'}:raise ValueError('All maps must complete first')
    previous=bpy.context.window.scene
    try:
        bpy.context.window.scene=state['scene']
        mat=state['material'];nodes,links=mat.node_tree.nodes,mat.node_tree.links
        nodes.remove(state['target']);shader=nodes.get('Principled BSDF');textures={}
        for kind,image in state['images'].items():
            image.filepath_raw=str(state['directory']/(state['item_id']+'-'+kind+'.png'));image.file_format='PNG';image.save();image.pack()
            tex=nodes.new('ShaderNodeTexImage');tex.image=image;textures[kind]=tex
        links.new(textures['albedo'].outputs['Color'],shader.inputs['Base Color'])
        normal=nodes.new('ShaderNodeNormalMap');links.new(textures['normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
        split=nodes.new('ShaderNodeSeparateColor');split.mode='RGB';links.new(textures['orm'].outputs['Color'],split.inputs[0])
        links.new(split.outputs['Green'],shader.inputs['Roughness']);links.new(split.outputs['Blue'],shader.inputs['Metallic'])
        group=bpy.data.node_groups.get('glTF Material Output')
        if not group:
            group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
        ao=nodes.new('ShaderNodeGroup');ao.node_tree=group;links.new(split.outputs['Red'],ao.inputs['Occlusion'])
        collection=bpy.data.collections.new(state['item_id']+' export candidate');state['scene'].collection.children.link(collection)
        root=bpy.data.objects.new('Item_'+state['item_id'],None);collection.objects.link(root)
        for key,value in state['metadata'].items():root[key]=value
        objects=[]
        for source in [state['low'],*state['glows']]:
            obj=bpy.data.objects.new(source.name+' export',source.data.copy());collection.objects.link(obj);obj.parent=root;objects.append(obj)
        for role,z in [('Grip',0),('Tip',max(v.co.z for o in objects for v in o.data.vertices))]:
            node=bpy.data.objects.new(state['item_id']+'_'+role,None);collection.objects.link(node);node.parent=root;node.location.z=z;node['attachmentRole']=role
            root[role.lower()+'Node']=node.name
        bpy.ops.object.select_all(action='DESELECT')
        for obj in collection.objects:obj.select_set(True)
        output=state['directory']/(state['item_id']+'-raw.glb')
        bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True,export_image_format='AUTO')
        report={'id':state['item_id'],'triangles':state['helper'].triangle_count(objects),'bytes':output.stat().st_size,'materials':len({m for o in objects for m in o.data.materials}),'gripNode':root['gripNode'],'tipNode':root['tipNode'],'atlas':state['size'],'status':'Raw candidate; requires global texture padding and exact-export review'}
        (state['directory']/(state['item_id']+'-raw.json')).write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report));return output
    finally:bpy.context.window.scene=previous
