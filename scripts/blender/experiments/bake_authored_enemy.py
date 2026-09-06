"""Staged neutral-rest high-to-low authored skeleton candidate bake.

Never writes public assets. Source/pose, optimization, bake, exported rig and
native presentation require distinct review before a canonical replacement.
"""
from pathlib import Path
import json,math,re
import bpy,bmesh
from mathutils import Vector,Matrix
from equipped_skeleton import build_candidate,module


def prepare(root,directory,size=2048):
    previous=bpy.context.window.scene
    try:
        posed,collection,joints,anatomy=build_candidate(root)
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
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.uv.pack_islands(rotate=True,scale=True,margin=.003,margin_method='FRACTION');bpy.ops.object.mode_set(mode='OBJECT')
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
        state=dict(scene=scene,sources=sources,low=low,destination=destination,material=material,target=target,images=images,directory=directory,completed=set(),source_triangles=masonry.triangle_count(sources),size=size,batches=batches,channel_batches={},parts=parts,pivots=pivots,guard=guard,helper=masonry,root=Path(root))
        print(json.dumps({'source':state['source_triangles'],'low':masonry.triangle_count([low]),'groups':len(batches),'parts':parts}))
        return state
    finally:bpy.context.window.scene=previous


def bake(state,kind,batch_index=None):
    previous=bpy.context.window.scene
    try:state['helper'].bake_channel(state,kind,batch_index)
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
        joints={}
        for name,pivot in state['pivots'].items():
            obj=bpy.data.objects.new('Joint_'+name,None);result.objects.link(obj);obj['enemyJoint']=name;joints[name]=obj
        for name,obj in joints.items():
            parent='Body' if name=='Head' or name.startswith('ArmUpper') else 'ArmUpper'+name[-1] if name.startswith('ArmLower') else 'LegUpper'+name[-1] if name.startswith('LegLower') else None
            obj.parent=joints[parent] if parent else root;obj.location=state['pivots'][name]-(state['pivots'][parent] if parent else Vector())
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
        (state['directory']/'skeleton-candidate.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));return output
    finally:bpy.context.window.scene=previous
