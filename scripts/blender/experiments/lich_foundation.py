"""Unaccepted CC0 robe foundation study; never imported by full asset build.

Source/license/cache: ../sources/cc0-lich. Existing Blender scenes are preserved.
"""
import bpy
import bmesh
from mathutils import Matrix, Vector
from math import cos


def make_lich_foundation_study(root):
    scene = bpy.data.scenes.new('CC0 lich refined surface study')
    bpy.context.window.scene = scene
    bpy.ops.import_scene.gltf(filepath=str(root/'scripts/blender/sources/cc0-lich/lich-foundation.glb'))
    arm = next(o for o in scene.objects if o.type == 'ARMATURE')
    arm.animation_data_clear(); arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    src = next(o for o in scene.objects if o.type == 'MESH')
    depsgraph = bpy.context.evaluated_depsgraph_get()
    data = bpy.data.meshes.new_from_object(src.evaluated_get(depsgraph), depsgraph=depsgraph)
    data.transform(src.matrix_world)
    collection = bpy.data.collections.new('Vault_lich-refined-study')
    scene.collection.children.link(collection)
    obj = bpy.data.objects.new('Refined CC0 sentinel robe foundation', data)
    collection.objects.link(obj)
    # Weld UV duplicates without discarding face-corner UV coordinates. Imported
    # custom normals made adjacent cloth triangles appear disconnected/faceted.
    bm = bmesh.new(); bm.from_mesh(data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00008)
    # Relax only the very low, needle-thin garment tips; keep their asymmetry.
    tips = [v for v in bm.verts if v.co.z < .045]
    bmesh.ops.smooth_vert(bm, verts=tips, factor=.35, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    for face in bm.faces: face.smooth = True
    for edge in bm.edges:
        edge.smooth = len(edge.link_faces) == 2 and edge.link_faces[0].normal.dot(edge.link_faces[1].normal) > cos(1.05)
    bm.to_mesh(data); bm.free()
    if data.has_custom_normals:
        data.normals_split_custom_set([(0, 0, 0)]*len(data.loops))
    for material in list(data.materials):
        mat = material.copy()
        data.materials[data.materials.find(material.name)] = mat
        nodes = mat.node_tree.nodes; links = mat.node_tree.links
        shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        source = shader.inputs['Base Color'].links[0].from_socket
        for key in ('Emission Color', 'Emission Strength', 'Metallic', 'Roughness', 'Specular IOR Level', 'Normal'):
            for link in list(shader.inputs[key].links): links.remove(link)
        shader.inputs['Emission Strength'].default_value = 0
        shader.inputs['Metallic'].default_value = 0
        shader.inputs['Specular IOR Level'].default_value = .25
        shader.inputs['Roughness'].default_value = .86
        shift = nodes.new('ShaderNodeHueSaturation'); shift.label = 'Restrained desaturated crypt teal'
        shift.inputs['Hue'].default_value = .19
        shift.inputs['Saturation'].default_value = .45
        shift.inputs['Value'].default_value = .84
        links.new(source, shift.inputs['Color']); links.new(shift.outputs['Color'], shader.inputs['Base Color'])
        tex = nodes.new('ShaderNodeTexCoord')
        noise = nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 110
        noise.inputs['Detail'].default_value = 2; noise.inputs['Roughness'].default_value = .7
        links.new(tex.outputs['Generated'], noise.inputs['Vector'])
        rough = nodes.new('ShaderNodeMapRange'); rough.inputs['To Min'].default_value = .72; rough.inputs['To Max'].default_value = .96
        links.new(noise.outputs['Fac'], rough.inputs['Value']); links.new(rough.outputs['Result'], shader.inputs['Roughness'])
        bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .23; bump.inputs['Distance'].default_value = .005
        links.new(noise.outputs['Fac'], bump.inputs['Height']); links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    # Original source stays in its own collection, hidden for this candidate.
    src.hide_render = True; src.hide_set(True); arm.hide_render = True
    obj['part'] = 'Body'
    return collection


def articulate_lich_study(collection, with_joints=True):
    """Rigid source-weight regions; no leg-driven robe or deforming staff skin."""
    source = next(o for o in collection.objects if o.type == 'MESH')
    group_names = ['Hips','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase','Spine02','Spine01','Spine','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand','neck','Head','head_end','headfront']
    mapping = {'LeftArm':'ArmUpperL','LeftForeArm':'ArmLowerL','LeftHand':'ArmLowerL','RightArm':'ArmUpperR','RightForeArm':'ArmLowerR','RightHand':'ArmLowerR','Head':'Head','head_end':'Head','headfront':'Head'}
    labels = ['Body','Head','Cape','ArmUpperL','ArmLowerL','ArmUpperR','ArmLowerR']
    attribute = source.data.attributes.new('wraith_rigid_part','INT','FACE')
    for face in source.data.polygons:
        center = sum((source.data.vertices[i].co for i in face.vertices), Vector()) / len(face.vertices)
        scores = {name:0.0 for name in labels}
        for i in face.vertices:
            for group in source.data.vertices[i].groups:
                scores[mapping.get(group_names[group.group], 'Body')] += group.weight
        part = max(scores, key=scores.get)
        # The source staff is fused to the hand and has inconsistent leg/torso
        # skin weights. Its front-left shaft/crystal and cuff move rigidly with
        # the holding forearm, never with the source biped's hidden legs.
        if center.x > .265 and center.y < -.19 and .18 < center.z < 1.57:
            part = 'ArmLowerL'
        # Only the rear hanging mantle is separated; lower robe stays continuous.
        if center.y > .09 and .12 < center.z < 1.14 and abs(center.x) < .19:
            part = 'Cape'
        attribute.data[face.index].value = labels.index(part)
    pivots = {'Body':(-.0125,-.1067,1.1828),'Head':(.0183,-.0672,1.4724),'Cape':(0,.10,1.26),
              'ArmUpperL':(.1395,-.0895,1.344),'ArmLowerL':(.2559,-.1416,1.1599),
              'ArmUpperR':(-.1145,-.0417,1.3413),'ArmLowerR':(-.1859,.018,1.0786)}
    collection['enemyPivots'] = pivots
    joints = {}
    for name, pivot in (pivots.items() if with_joints else []):
        joint = bpy.data.objects.new('Joint_'+name,None); collection.objects.link(joint)
        joint.location = pivot; joint['enemyJoint'] = name; joints[name] = joint
    for name,joint in joints.items():
        parent = 'ArmUpper'+name[-1] if name.startswith('ArmLower') else 'Body' if name != 'Body' else None
        if parent:
            joint.parent=joints[parent];joint.location=Vector(pivots[name])-Vector(pivots[parent])
    bpy.context.view_layer.update()
    for name in labels:
        data=source.data.copy();bm=bmesh.new();bm.from_mesh(data)
        layer=bm.faces.layers.int['wraith_rigid_part']
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[layer] != labels.index(name)],context='FACES')
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
        bm.to_mesh(data);bm.free()
        if not data.polygons:
            bpy.data.meshes.remove(data);continue
        obj=bpy.data.objects.new(name+'_WraithStudy',data);collection.objects.link(obj)
        obj['part']=name
        if with_joints:obj.parent=joints[name]
        obj.matrix_world=Matrix.Identity(4)
    bpy.data.objects.remove(source,do_unlink=True)
    return joints


def attach_lich_joints(collection):
    pivots = {name:Vector(point) for name,point in collection['enemyPivots'].items()}
    joints = {}
    for name,pivot in pivots.items():
        obj=bpy.data.objects.new('Joint_'+name,None);collection.objects.link(obj)
        obj.location=pivot;obj['enemyJoint']=name;joints[name]=obj
    for name,obj in joints.items():
        parent='ArmUpper'+name[-1] if name.startswith('ArmLower') else 'Body' if name!='Body' else None
        if parent:obj.parent=joints[parent];obj.location=pivots[name]-pivots[parent]
    bpy.context.view_layer.update()
    for obj in collection.objects:
        if obj.type!='MESH':continue
        part=obj.get('part',obj.name.split('_')[0])
        world=obj.matrix_world.copy();obj.parent=joints[part];obj.matrix_world=world
    return joints


def make_lich_export_candidate(root):
    collection=make_lich_foundation_study(root)
    articulate_lich_study(collection,with_joints=False)
    points=[v.co for obj in collection.objects for v in obj.data.vertices]
    low=min(p.z for p in points);high=max(p.z for p in points)
    scale=(1.93340003490448-.06131713092327118)/(high-low)
    offset=.06131713092327118-low*scale
    for obj in collection.objects:
        for vertex in obj.data.vertices:
            vertex.co*=scale;vertex.co.z+=offset
    collection['enemyPivots']={name:[point[0]*scale,point[1]*scale,point[2]*scale+offset] for name,point in collection['enemyPivots'].items()}
    collection['preserveAuthoredUV']=True
    collection['atlasSize']=2048
    collection['runtimeSpecular']=.25
    return collection
