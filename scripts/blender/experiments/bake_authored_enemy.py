"""Staged neutral-rest high-to-low authored skeleton candidate bake.

Never writes public assets. Source/pose, optimization, bake, exported rig and
native presentation require distinct review before a canonical replacement.
"""
from pathlib import Path
import json,math,re
import bpy,bmesh
from mathutils import Vector,Matrix
from equipped_skeleton import build_candidate,module


def prepare(root,directory,size=2048,native_shafts=False,source_candidate=None):
    previous=bpy.context.window.scene
    try:
        posed,collection,joints,anatomy=source_candidate or build_candidate(root,native_shafts=native_shafts)
        if native_shafts and not collection.get('nativeShaftComparison'):
            raise ValueError('Supplied source candidate lacks the requested native shaft comparison')
        bpy.context.window.scene=posed
        pivots={name:Vector(value) for name,value in collection['enemyPivots'].items()}
        saved={name:joint.matrix_basis.copy() for name,joint in joints.items()}
        guard={}
        for name,joint in joints.items():
            rest=pivots[name]-(pivots[joint.parent['enemyJoint']] if joint.parent else Vector())
            delta=joint.location-rest;q=joint.rotation_quaternion if joint.rotation_mode=='QUATERNION' else joint.rotation_euler.to_quaternion()
            guard[name]={'position':[delta.x,delta.z,-delta.y],'quaternion':[q.x,q.z,-q.y,q.w]}
            joint.location=rest;joint.rotation_mode='QUATERNION';joint.rotation_quaternion=(1,0,0,0)
        bpy.context.view_layer.update()
        weapon=next((o for o in collection.objects if o.get('equipmentHand')=='R'),None)
        weapon_grip=(weapon.matrix_world@Vector(collection['gripCenterR'])) if weapon else None
        scene=bpy.data.scenes.new('Authored skeleton neutral bake workshop')
        high=bpy.data.collections.new('Authored skeleton neutral high source');scene.collection.children.link(high)
        sources=[]
        try:
            for obj in collection.objects:
                if obj.type!='MESH':continue
                data=obj.data.copy();name=re.sub(r'\.\d{3}$','',obj.get('anatomicalSource',''))
                foot=('foot_' in name or 'metatarsal' in name or re.match(r'(proximal|middle|distal)\.[1-5]\.',name))
                # Guarded source feet deliberately counter-rotate for planting.
                # Neutral feet instead keep their original ground-aligned mesh.
                data.transform(Matrix.Identity(4) if foot else obj.matrix_world)
                source=bpy.data.objects.new('Neutral '+obj.name,data);high.objects.link(source)
                for key,value in obj.items():source[key]=value
                source['enemySourcePart']=obj.get('part','Body');sources.append(source)
        finally:
            for name,joint in joints.items():joint.matrix_basis=saved[name]
            bpy.context.view_layer.update()
        bpy.context.window.scene=scene
        destination=bpy.data.collections.new('Authored skeleton low bake');scene.collection.children.link(destination)
        parts={};lows=[]
        for source_id,source in enumerate(sources):
            low=bpy.data.objects.new(source.name+' low',source.data.copy());destination.objects.link(low)
            part=parts.setdefault(source['enemySourcePart'],len(parts))
            for label,value in [('enemy_source_id',source_id),('enemy_part_id',part)]:
                attr=low.data.attributes.new(label,'INT','FACE')
                for item in attr.data:item.value=value
            label=source.get('anatomicalSource','')
            ratio=.30 if label=='skull' else .20 if 'ripcage' in label else .18 if label=='hip' else .22 if any(k in label for k in ('proximal.','middle.','distal.','metacarpal')) else .12
            if source.get('equipmentHand') or source.get('authoredHarness'):ratio=1
            if ratio<1:
                bpy.ops.object.select_all(action='DESELECT');low.select_set(True);bpy.context.view_layer.objects.active=low
                modifier=low.modifiers.new('Anatomical silhouette density','DECIMATE');modifier.ratio=ratio;modifier.use_collapse_triangulate=True
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            lows.append(low)
        bpy.ops.object.select_all(action='DESELECT')
        for low in lows:low.select_set(True)
        bpy.context.view_layer.objects.active=lows[0];bpy.ops.object.join();low=lows[0];low.name='AuthoredSkeleton_LowAtlas'
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(62),island_margin=.004,correct_aspect=True,scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        masonry=module(Path(root)/'scripts/blender/detailed/bake_masonry.py','enemy_projection_helpers')
        masonry.widen_subpixel_islands(low.data,3/size)
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.uv.select_all(action='SELECT')
        if 'FINISHED' not in bpy.ops.uv.pack_islands(rotate=True,scale=True,margin=.003,margin_method='FRACTION'):raise RuntimeError('UV packing did not finish')
        bpy.ops.object.mode_set(mode='OBJECT')
        material=bpy.data.materials.new('AuthoredSkeleton_Baked');material.use_nodes=True
        low.data.materials.clear();low.data.materials.append(material)
        for face in low.data.polygons:face.material_index=0
        target=material.node_tree.nodes.new('ShaderNodeTexImage');target.name='AUTHORED_ENEMY_BAKE_TARGET'
        batches=[]
        for ids in masonry.projection_groups(sources,clearance=.025):
            data=low.data.copy();bm=bmesh.new();bm.from_mesh(data);layer=bm.faces.layers.int['enemy_source_id']
            bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[layer] not in ids],context='FACES')
            bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(data);bm.free()
            obj=bpy.data.objects.new('Isolated anatomy bake group',data);destination.objects.link(obj);obj.hide_render=True;obj.hide_set(True);obj.visible_shadow=False
            batches.append(([sources[i] for i in ids],obj))
        low.hide_render=True;low.hide_set(True)
        images={}
        for kind in ('albedo','normal','orm'):
            image=bpy.data.images.new('AuthoredSkeleton_'+kind,width=size,height=size,alpha=False)
            if kind!='albedo':image.colorspace_settings.name='Non-Color'
            images[kind]=image
        scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8
        scene.render.bake.margin=8;scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=.004;scene.render.bake.max_ray_distance=.03
        scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
        directory=Path(directory).resolve()
        if 'public' in directory.parts:raise ValueError('Unreviewed candidate must stay outside public assets')
        directory.mkdir(parents=True,exist_ok=True)
        state=dict(scene=scene,sources=sources,original_sources=sources,weapon_grip=weapon_grip,low=low,destination=destination,material=material,target=target,images=images,directory=directory,completed=set(),source_triangles=masonry.triangle_count(sources),size=size,batches=batches,channel_batches={},parts=parts,pivots=pivots,guard=guard,helper=masonry,root=Path(root))
        if native_shafts:state['native_shaft_comparison']=json.loads(collection['nativeShaftComparison'])
        print(json.dumps({'source':state['source_triangles'],'low':masonry.triangle_count([low]),'groups':len(batches),'parts':parts}))
        return state
    finally:bpy.context.window.scene=previous


def bake(state,kind,batch_index=None):
    if kind=='normal' and state.get('normal_batches'):
        batches=state['normal_batches']
        state=dict(state,batches=batches,sources=list(dict.fromkeys(source for sources,_ in batches for source in sources)))
    previous=bpy.context.window.scene
    visibility=[]
    normal_links=[]
    try:
        bpy.context.window.scene=state['scene']
        own=set(state['sources'])
        for obj in state['scene'].objects:
            if obj.type!='MESH':continue
            if obj in own or not obj.hide_render or not obj.hide_get():
                visibility.append((obj,obj.hide_render,obj.hide_get()))
            if obj not in own:obj.hide_render=True;obj.hide_set(True)
        # Color-only and normal bakes have no Monte Carlo lighting integral.
        # Keep samples for ORM's real ambient-occlusion evaluation instead.
        state['scene'].cycles.samples=8 if kind=='orm' else 1
        # Each target contains only one subset of a shared atlas. Per-group
        # dilation can overwrite a different group's already-baked UV islands.
        # The packer pads the completed full atlas globally from valid texels.
        state['scene'].render.bake.margin=0
        if kind=='normal' and state.get('exclude_bone_micrograin'):
            for material in {m for obj in state['sources'] for m in obj.data.materials}:
                if not material.name.startswith('Enemy aged ivory source'):continue
                shader=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
                for link in list(shader.inputs['Normal'].links):
                    normal_links.append((material,link.from_socket,link.to_socket));material.node_tree.links.remove(link)
        if kind=='albedo':_bake_base_color(state,batch_index)
        else:state['helper'].bake_channel(state,kind,batch_index)
    finally:
        for material,source,target in normal_links:material.node_tree.links.new(source,target)
        for obj,render,viewport in visibility:obj.hide_render=render;obj.hide_set(viewport)
        bpy.context.window.scene=previous


def _bake_base_color(state,batch_index=None):
    """Diffuse-color baking attenuates metallic color; emit the actual base color."""
    for source in state['sources']:source.hide_render=False;source.hide_set(False)
    nodes=state['material'].node_tree.nodes
    for node in nodes:node.select=False
    state['target'].image=state['images']['albedo'];state['target'].select=True;nodes.active=state['target']
    restore=[]
    try:
        for material in {m for obj in state['sources'] for m in obj.data.materials}:
            nodes=material.node_tree.nodes;links=material.node_tree.links
            shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
            output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
            original=output.inputs['Surface'].links[0].from_socket
            emit=nodes.new('ShaderNodeEmission');base=shader.inputs['Base Color']
            if base.is_linked:links.new(base.links[0].from_socket,emit.inputs['Color'])
            else:emit.inputs['Color'].default_value=base.default_value
            links.new(emit.outputs[0],output.inputs['Surface']);restore.append((material,output,original,emit))
        completed=state['channel_batches'].setdefault('albedo',set())
        for index in range(len(state['batches'])) if batch_index is None else [batch_index]:
            if index in completed:continue
            sources,destination=state['batches'][index];bpy.ops.object.select_all(action='DESELECT')
            for source in sources:source.select_set(True)
            destination.hide_set(False);destination.hide_render=False;destination.select_set(True);bpy.context.view_layer.objects.active=destination
            state['scene'].render.bake.use_clear=not completed
            try:bpy.ops.object.bake(type='EMIT');completed.add(index)
            finally:destination.hide_set(True);destination.hide_render=True
        if len(completed)==len(state['batches']):state['completed'].add('albedo')
    finally:
        for material,output,original,emit in restore:
            material.node_tree.links.new(original,output.inputs['Surface']);material.node_tree.nodes.remove(emit)


def resolution_comparison(state,size,directory):
    """Fork atlas targets on identical UVs without discarding the first bake."""
    previous=bpy.context.window.scene
    try:
        bpy.context.window.scene=state['scene']
        return _resolution_comparison_active(state,size,directory)
    finally:bpy.context.window.scene=previous


def _resolution_comparison_active(state,size,directory):
    directory=Path(directory).resolve()
    if 'public' in directory.parts:raise ValueError('Comparison stays outside public assets')
    directory.mkdir(parents=True,exist_ok=True)
    material=bpy.data.materials.new('AuthoredSkeleton_Baked_'+str(size));material.use_nodes=True
    target=material.node_tree.nodes.new('ShaderNodeTexImage');target.name='AUTHORED_ENEMY_BAKE_TARGET'
    def copy_destination(obj):
        result=obj.copy();result.data=obj.data.copy();state['destination'].objects.link(result)
        result.data.materials.clear();result.data.materials.append(material)
        result.hide_render=True;result.hide_set(True)
        return result
    low=copy_destination(state['low'])
    batches=[(sources,copy_destination(destination)) for sources,destination in state['batches']]
    images={}
    for kind in ('albedo','normal','orm'):
        image=bpy.data.images.new('AuthoredSkeleton_'+str(size)+'_'+kind,width=size,height=size,alpha=False)
        if kind!='albedo':image.colorspace_settings.name='Non-Color'
        images[kind]=image
    return dict(state,low=low,batches=batches,images=images,size=size,directory=directory,
                material=material,target=material.node_tree.nodes['AUTHORED_ENEMY_BAKE_TARGET'],
                completed=set(),channel_batches={})


def joined_source_comparison(state,directory):
    """Test one high object per isolated group with identical shader domains.

    Generated shader coordinates are object-bounds coordinates. Store them
    explicitly before joining; otherwise the source color and bump would change.
    The original meshes, materials and partial images are retained untouched.
    """
    previous=bpy.context.window.scene
    try:
        bpy.context.window.scene=state['scene']
        result=_resolution_comparison_active(state,state['size'],directory)
        materials={};sources=[];batches=[]
        for originals,destination in state['batches']:
            copies=[]
            for source in originals:
                obj=source.copy();obj.data=source.data.copy();state['destination'].objects.link(obj)
                obj.hide_render=False;obj.hide_set(False)
                _freeze_generated_coordinates(obj,materials)
                copies.append(obj)
            bpy.ops.object.select_all(action='DESELECT')
            for obj in copies:obj.select_set(True)
            bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join()
            combined=copies[0];combined.name='Joined isolated anatomical source'
            sources.append(combined)
            batches.append(([combined],result['batches'][len(batches)][1]))
            combined.hide_render=True;combined.hide_set(True)
        result.update(sources=sources,batches=batches,superseded_sources=state['sources'])
        return result
    finally:bpy.context.window.scene=previous


def finish(state):
    if state['completed']!={'albedo','normal','orm'}:raise ValueError('Finish all three channels first')
    previous=bpy.context.window.scene
    try:
        bpy.context.window.scene=state['scene'];nodes=state['material'].node_tree.nodes;links=state['material'].node_tree.links
        nodes.remove(state['target']);shader=nodes.get('Principled BSDF');shader.inputs['Specular IOR Level'].default_value=.25
        textures={}
        for kind,image in state['images'].items():
            image.filepath_raw=str(state['directory']/('skeleton-candidate-'+kind+'.png'));image.file_format='PNG';image.save();image.pack()
            tex=nodes.new('ShaderNodeTexImage');tex.image=image;textures[kind]=tex
        links.new(textures['albedo'].outputs['Color'],shader.inputs['Base Color'])
        normal=nodes.new('ShaderNodeNormalMap');links.new(textures['normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],shader.inputs['Normal'])
        split=nodes.new('ShaderNodeSeparateColor');split.mode='RGB';links.new(textures['orm'].outputs['Color'],split.inputs[0]);links.new(split.outputs['Green'],shader.inputs['Roughness']);links.new(split.outputs['Blue'],shader.inputs['Metallic'])
        group=bpy.data.node_groups.get('glTF Material Output')
        if not group:
            group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
        ao=nodes.new('ShaderNodeGroup');ao.node_tree=group;links.new(split.outputs['Red'],ao.inputs['Occlusion'])
        result=bpy.data.collections.new('Authored skeleton rigid candidate');state['scene'].collection.children.link(result)
        root=bpy.data.objects.new('AuthoredSkeleton',None);result.objects.link(root);root['authoredEnemy']=True;root['guardPoseYUp']=json.dumps(state['guard']);root['sourceLicense']='CC0 Blender Studio anatomy; CC0 hooded warrior hilt'
        if state.get('native_shaft_comparison'):root['authoredEnemyHeight']=1.85
        joints={}
        for name,pivot in state['pivots'].items():
            obj=bpy.data.objects.new('Joint_'+name,None);result.objects.link(obj);obj['enemyJoint']=name;joints[name]=obj
        for name,obj in joints.items():
            parent='ArmLowerR' if name=='Sword' else 'Body' if name=='Head' or name.startswith('ArmUpper') else 'ArmUpper'+name[-1] if name.startswith('ArmLower') else 'LegUpper'+name[-1] if name.startswith('LegLower') else None
            obj.parent=joints[parent] if parent else root;obj.location=state['pivots'][name]-(state['pivots'][parent] if parent else Vector())
            if name in state.get('rest_rotations',{}):obj.rotation_mode='QUATERNION';obj.rotation_quaternion=state['rest_rotations'][name]
        bpy.context.view_layer.update()
        for part,partid in state['parts'].items():
            data=state['low'].data.copy();bm=bmesh.new();bm.from_mesh(data);layer=bm.faces.layers.int['enemy_part_id']
            bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[layer]!=partid],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(data);bm.free()
            obj=bpy.data.objects.new(part+'_Baked',data);result.objects.link(obj);obj.parent=joints[part];obj.matrix_world=Matrix.Identity(4)
        bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
        for obj in state['sources']:obj.hide_render=True;obj.hide_set(True)
        for obj in result.objects:obj.select_set(True)
        output=state['directory']/'skeleton-candidate.glb'
        bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True,export_copyright='CC0 Blender Studio realistic anatomy; CC0 hooded warrior hilt; Embercrypt adaptation')
        report={'triangles':state['helper'].triangle_count([o for o in result.objects if o.type=='MESH']),'bytes':output.stat().st_size,'joints':list(joints),'parts':list(state['parts']),'guardPoseYUp':state['guard'],'atlas':state['size'],'sourceSHA256':'d563a0fb2f0044d91737af9b4d57f211e84340c6ff1596a1b9f600aa35f40f2b','weaponSHA256':'3f48d820b532677426ebae5ad77175faefc55f0ef4b071f523a4a97b5ab253ce'}
        report['transfer']={'excludeBoneMicrograin':bool(state.get('exclude_bone_micrograin')),
                            'normalProjectionGroups':len(state.get('normal_batches',state['batches'])),
                            'handChartArea':state.get('hand_chart_area'),
                            'nativeShaftComparison':state.get('native_shaft_comparison')}
        (state['directory']/'skeleton-candidate.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));return output
    finally:bpy.context.window.scene=previous


def separate_held_weapon(state,original_sources=None,grip=None):
    """Retain exact texels/geometry while exposing the real held-weapon pivot.

    glTF local +Y points along the blade so the existing settle solver can lay
    the sword against the floor. Anatomical leg/arm joint bases stay neutral.
    """
    originals=original_sources if original_sources is not None else state['original_sources']
    grip=Vector(grip) if grip is not None else state['weapon_grip'].copy()
    ids={i for i,obj in enumerate(originals) if obj.get('equipmentHand')=='R'}
    if not ids:raise ValueError('No authored held weapon to separate')
    blade=next(obj for i,obj in enumerate(originals) if i in ids and 'blade' in obj.name.lower())
    import numpy as np
    points=np.array([v.co[:] for v in blade.data.vertices]);center=points.mean(0)
    _,_,vectors=np.linalg.svd(points-center,full_matrices=False);axis=Vector(vectors[0])
    if axis.dot(Vector(center)-grip)<0:axis.negate()
    parts=dict(state['parts']);partid=parts.setdefault('Sword',len(parts))
    for obj in [state['low'],*(destination for _,destination in state['batches'])]:
        source_ids=obj.data.attributes['enemy_source_id'].data;part_ids=obj.data.attributes['enemy_part_id'].data
        for source_id,part_id in zip(source_ids,part_ids):
            if source_id.value in ids:part_id.value=partid
    state['parts']=parts;state['pivots']=dict(state['pivots'],Sword=grip)
    state['guard']=dict(state['guard'],Sword={'position':[0,0,0],'quaternion':[0,0,0,1]})
    state['rest_rotations']={'Sword':Vector((0,0,1)).rotation_difference(axis)}
    return {'grip':list(grip),'bladeAxis':list(axis),'weaponSources':sorted(ids)}


def _freeze_generated_coordinates(obj,materials):
    coordinates=obj.data.attributes.new('EnemySourceGenerated','FLOAT_VECTOR','POINT')
    lower=Vector(tuple(min(v.co[i] for v in obj.data.vertices) for i in range(3)))
    span=Vector(tuple(max(v.co[i] for v in obj.data.vertices)-lower[i] for i in range(3)))
    for vertex,attribute in zip(obj.data.vertices,coordinates.data):
        attribute.vector=tuple((vertex.co[i]-lower[i])/span[i] if span[i]>1e-8 else 0 for i in range(3))
    for index,material in enumerate(list(obj.data.materials)):
        if material not in materials:
            copy=material.copy();materials[material]=copy
            nodes=copy.node_tree.nodes;links=copy.node_tree.links
            attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='EnemySourceGenerated'
            for node in list(nodes):
                if node.type=='TEX_COORD':
                    for link in list(node.outputs['Generated'].links):links.new(attribute.outputs['Vector'],link.to_socket)
                elif node.type in ('TEX_NOISE','TEX_VORONOI','TEX_WAVE','TEX_MAGIC','TEX_GRADIENT') and not node.inputs['Vector'].is_linked:
                    links.new(attribute.outputs['Vector'],node.inputs['Vector'])
                elif node.type=='OBJECT_INFO' and any(node.outputs[n].is_linked for n in ('Random','Color')):
                    raise ValueError('Object-specific shader requires separate source: '+material.name)
        obj.data.materials[index]=materials[material]


def _mesh_components(mesh):
    parents=list(range(len(mesh.vertices)))
    def find(i):
        while parents[i]!=i:
            parents[i]=parents[parents[i]];i=parents[i]
        return i
    for edge in mesh.edges:
        a,b=edge.vertices;parents[find(a)]=find(b)
    groups={}
    for vertex in mesh.vertices:groups.setdefault(find(vertex.index),set()).add(vertex.index)
    return list(groups.values())


def isolated_carpal_normal_control(state,directory,original_sources=None):
    """Fork targets and isolate the separate carpals inside each hand object.

    Nonadjacent-object grouping alone cannot protect eight closely fitted bones
    stored in one source mesh. This diagnostic preserves UVs and geometry while
    projecting each disconnected carpal only onto its own low component.
    """
    originals=original_sources if original_sources is not None else state['original_sources']
    previous=bpy.context.window.scene
    try:
        bpy.context.window.scene=state['scene']
        result=_resolution_comparison_active(state,state['size'],directory)
        hand_ids={i for i,o in enumerate(originals) if o.get('anatomicalSource','').startswith('hand_center')}
        def extract(obj,keep,label):
            copied=obj.copy();copied.data=obj.data.copy();state['destination'].objects.link(copied)
            bm=bmesh.new();bm.from_mesh(copied.data);bm.verts.ensure_lookup_table()
            bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in keep],context='VERTS')
            bm.to_mesh(copied.data);bm.free();copied.name=label;copied.hide_render=True;copied.hide_set(True)
            return copied
        normal_batches=[]
        for sources,destination in result['batches']:
            ids=destination.data.attributes['enemy_source_id'].data
            keep={destination.data.loops[i].vertex_index for face,source_id in zip(destination.data.polygons,ids) if source_id.value not in hand_ids for i in face.loop_indices}
            if keep:normal_batches.append((sources,extract(destination,keep,'Noncarpal normal target')))
        materials={};report=[]
        for source_id in sorted(hand_ids):
            original=originals[source_id]
            source=original.copy();source.data=original.data.copy();state['destination'].objects.link(source)
            _freeze_generated_coordinates(source,materials)
            high_components=_mesh_components(source.data)
            ids=result['low'].data.attributes['enemy_source_id'].data
            keep={result['low'].data.loops[i].vertex_index for face,label in zip(result['low'].data.polygons,ids) if label.value==source_id for i in face.loop_indices}
            low=extract(result['low'],keep,'Carpal low region')
            low_components=_mesh_components(low.data)
            if len(high_components)!=len(low_components):raise ValueError('Carpal connectivity changed during decimation')
            high_centers=[sum((source.data.vertices[i].co for i in group),Vector())/len(group) for group in high_components]
            unused=set(range(len(high_components)))
            for group in low_components:
                center=sum((low.data.vertices[i].co for i in group),Vector())/len(group)
                index=min(unused,key=lambda i:(high_centers[i]-center).length);unused.remove(index)
                error=(high_centers[index]-center).length
                if error>.015:raise ValueError('Ambiguous carpal component match')
                high=extract(source,high_components[index],'Isolated carpal source')
                target=extract(low,group,'Isolated carpal target')
                normal_batches.append(([high],target))
            source.hide_render=True;source.hide_set(True)
            report.append({'source':original.name,'components':len(high_components)})
        result['normal_batches']=normal_batches
        result['original_sources']=originals
        print(json.dumps({'isolatedCarpals':report,'normalGroups':len(normal_batches)}))
        return result
    finally:bpy.context.window.scene=previous


def enlarged_hand_chart_comparison(state,directory,original_sources=None,scale=4):
    """Allocate more atlas area to real hand charts, with exact batch UV copies."""
    originals=original_sources if original_sources is not None else state['original_sources']
    previous=bpy.context.window.scene
    try:
        bpy.context.window.scene=state['scene']
        result=_resolution_comparison_active(state,state['size'],directory)
        result.pop('normal_batches',None)
        hands={i for i,o in enumerate(originals) if o.get('part','').startswith('ArmLower') and any(o.get('anatomicalSource','').startswith(prefix) for prefix in ('proximal.','middle.','distal.','metacarpal.','hand_center.'))}
        low=result['low'];mesh=low.data;uv=mesh.uv_layers.active.data
        ids=mesh.attributes['enemy_source_id'].data
        loops={}
        for face,label in zip(mesh.polygons,ids):
            if label.value in hands:loops.setdefault(label.value,[]).extend(face.loop_indices)
        def area():
            value=0
            for face,label in zip(mesh.polygons,ids):
                if label.value not in hands:continue
                points=[uv[i].uv.copy() for i in face.loop_indices]
                for i in range(1,len(points)-1):
                    a=points[i]-points[0];b=points[i+1]-points[0];value+=abs(a.x*b.y-a.y*b.x)*.5
            return value
        before=area()
        for indexes in loops.values():
            center=sum((uv[i].uv for i in indexes),Vector((0,0)))/len(indexes)
            for i in indexes:uv[i].uv=center+(uv[i].uv-center)*scale
        bpy.ops.object.select_all(action='DESELECT');low.hide_set(False);low.select_set(True);bpy.context.view_layer.objects.active=low
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.select_all(action='SELECT')
        packed=bpy.ops.uv.pack_islands(rotate=True,scale=True,margin=.003,margin_method='FRACTION')
        if 'FINISHED' not in packed:raise RuntimeError('UV packing did not finish')
        bpy.ops.object.mode_set(mode='OBJECT');low.hide_set(True)
        # Edit-mode synchronization replaces RNA collections. Never propagate
        # UV handles captured before entering edit mode into bake targets.
        uv=mesh.uv_layers.active.data;ids=mesh.attributes['enemy_source_id'].data
        low_bound=min(min(item.uv) for item in uv);high_bound=max(max(item.uv) for item in uv)
        if low_bound<-.00001 or high_bound>1.00001:raise ValueError('Packed UVs outside atlas')
        after=area()
        if after < before*2:raise ValueError('Hand charts did not gain the required measured area')
        def corners(mesh):
            labels=mesh.attributes['enemy_source_id'].data
            for face,label in zip(mesh.polygons,labels):
                vertices=tuple(sorted(tuple(mesh.vertices[i].co) for i in face.vertices))
                for loop in face.loop_indices:
                    yield (label.value,vertices,tuple(mesh.vertices[mesh.loops[loop].vertex_index].co)),loop
        reference={key:uv[index].uv.copy() for key,index in corners(mesh)}
        for _,destination in result['batches']:
            data=destination.data.uv_layers.active.data
            for key,index in corners(destination.data):data[index].uv=reference[key]
        result['original_sources']=originals
        result['hand_chart_area']={'before':before,'after':after,'scale':scale,'sources':len(hands),'bounds':[low_bound,high_bound]}
        print(json.dumps(result['hand_chart_area']))
        return result
    finally:bpy.context.window.scene=previous
