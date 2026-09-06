"""Bounded articulated hero study, preserving the reviewed CC0 equipment.

This is experimental source only. Public hero assets and their existing clips are
unchanged until the source, poses, final export and game view pass review.
"""
import bpy
import bmesh
import math
from mathutils import Vector, Quaternion, Euler, Matrix


def source_part(obj):
    return obj.get('sourcePart',obj.name).removeprefix('SourceReview_')


def optimize_authored_hero(collection):
    """Spend geometry on equipment silhouettes, not the microscopic eye spheres."""
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects:
        if obj.type != 'MESH':
            continue
        source = source_part(obj)
        ratio = .012 if source.startswith('eye_outer') else .60 if source.startswith('clothing') else .62 if source.startswith('head.0') else 1
        if ratio == 1:
            continue
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new('Game source density', 'DECIMATE')
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def hero_bones():
    bones = {
        'root':((0,0,0),(0,0,.2),None),
        'pelvis':((0,0,.96),(0,0,1.18),'root'),
        'chest':((0,0,1.18),(0,0,1.58),'pelvis'),
        'head':((0,0,1.58),(0,0,1.80),'chest'),
        'cape':((0,.14,1.58),(0,.19,1.13),'chest'),
        'cape.mid':((0,.19,1.13),(0,.22,.68),'cape'),
        'cape.hem':((0,.22,.68),(0,.20,.23),'cape.mid'),
    }
    for side,sign in (('R',-1),('L',1)):
        bones.update({
            'arm.'+side:((sign*.19,0,1.51),(sign*.37,-.035,1.32),'chest'),
            'forearm.'+side:((sign*.37,-.035,1.32),(sign*.49,-.065,1.14),'arm.'+side),
            'hand.'+side:((sign*.49,-.065,1.14),(sign*.60,-.07,1.035),'forearm.'+side),
            'leg.'+side:((sign*.13,0,.98),(sign*.145,.02,.57),'pelvis'),
            'shin.'+side:((sign*.145,.02,.57),(sign*.15,.005,.16),'leg.'+side),
            'foot.'+side:((sign*.15,.005,.16),(sign*.15,-.15,.065),'shin.'+side),
        })
    return bones


def mesh_islands(mesh):
    neighbours = [[] for _ in mesh.vertices]
    for edge in mesh.edges:
        a,b = edge.vertices
        neighbours[a].append(b);neighbours[b].append(a)
    seen = set()
    for first in range(len(neighbours)):
        if first in seen:
            continue
        stack = [first];seen.add(first);island = []
        while stack:
            index = stack.pop();island.append(index)
            for adjacent in neighbours[index]:
                if adjacent not in seen:
                    seen.add(adjacent);stack.append(adjacent)
        yield island


def draw_authored_sword(collection):
    """Draw the authored hilt, retaining its empty scabbard on the belt.

    Selection uses the reviewed source's normalized bounds, not unstable polygon
    indices. UVs, normals and material slots survive the separation unchanged.
    """
    clothing=next(o for o in collection.objects if o.type=='MESH' and source_part(o).startswith('clothing'))
    chosen=set();found=[]
    for island in mesh_islands(clothing.data):
        points=[clothing.data.vertices[i].co for i in island]
        low=Vector(tuple(min(p[j] for p in points) for j in range(3)))
        high=Vector(tuple(max(p[j] for p in points) for j in range(3)))
        hilt=.11<low.x<.13 and .23<high.x<.24 and low.y<-.33 and 1.20<high.z<1.23
        if hilt:chosen.update(island);found.append('hilt')
    if found!=['hilt']:
        raise ValueError('Reviewed sword topology no longer matches: '+repr(found))
    mesh=clothing.data.copy();mesh.name='Authored equipped sword UV mesh'
    for target,remove_selected in ((mesh,False),(clothing.data,True)):
        bm=bmesh.new();bm.from_mesh(target);bm.verts.ensure_lookup_table()
        remove=[v for v in bm.verts if (v.index in chosen)==remove_selected]
        bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(target);bm.free();target.update()
    sword=bpy.data.objects.new('Authored_equipped_sword',mesh);collection.objects.link(sword)
    sword['sourcePart']='equipped_sword';sword['equipmentHand']='hand.R'
    source_grip=Vector((.160532,-.272125,1.119668))
    grip=Vector((-.600,-.125,1.025))
    rotation=Vector((.27,.55,-.89)).rotation_difference(Vector((0,-1,0)))
    transform=Matrix.Translation(grip)@rotation.to_matrix().to_4x4()@Matrix.Translation(-source_grip)
    mesh.transform(transform)
    make_forged_blade(collection,transform)
    # Curl only the distal finger region of the right glove. The continuous arc
    # preserves the palm/cuff and source UVs; the opposed thumb is outside it.
    knuckle=Vector((-.618,-.05,1.025));direction=Vector((0,0,-1))
    normal=Vector((1,0,0))
    for vertex in clothing.data.vertices:
        p=vertex.co.copy()
        if -.57<p.x<-.49 and p.y<-.12 and p.z<1.125:
            amount=max(0,min(1,(p.x+.57)/.025))
            amount*=max(0,min(1,(-.12-p.y)/.025))
            amount*=max(0,min(1,(1.125-p.z)/.04))
            amount=amount*amount*(3-2*amount)
            pivot=Vector((-.533,-.140,1.110))
            closed=pivot+Euler((.35,.45,0),'XYZ').to_quaternion()@(p-pivot)
            vertex.co=p.lerp(closed,amount)
            continue
        if p.x>-.54 or p.z>1.09 or p.y>.085:continue
        along=(p-knuckle).dot(direction)
        if along<=0:continue
        # Bend both the centerline and cross-section around the measured shaft.
        # A displacement-only bend leaves the distal phalanges pointing outward.
        radius=.018;angle=min(along/radius,3.55)
        cross=(p-knuckle).dot(normal)
        vertex.co+=direction*((radius-cross)*math.sin(angle)-along)
        vertex.co+=normal*(radius-(radius-cross)*math.cos(angle)-cross)
    # The side-contact ray pick identifies one upper finger/web patch at
    # (-.610,-.176,1.025). Sculpt it coherently toward the outer fist; projecting
    # individual vertices radially caused a pointed flap on the handle.
    contact=Vector((-.610,-.176,1.025))
    for vertex in clothing.data.vertices:
        delta=vertex.co-contact
        weight=max(0,1-(delta.x/.030)**2)*max(0,1-(delta.y/.018)**2)*max(0,1-(delta.z/.030)**2)
        weight=weight*weight*(3-2*weight)
        vertex.co+=Vector((-.022,0,.002))*weight
    clothing.data.update()
    return sword


def make_forged_blade(collection,transform):
    """Closed diamond-section blade, fitted inside the authored crossguard."""
    vertices=[];faces=[]
    sections=((0,.033,.009),(.055,.032,.008),(.67,.020,.005),(.82,.003,.001),(.855,.0004,.0004))
    for z,width,thickness in sections:
        vertices.extend(((-width,0,z),(0,-thickness,z),(width,0,z),(0,thickness,z)))
    faces.append((3,2,1,0))
    for row in range(len(sections)-1):
        for side in range(4):faces.append((row*4+side,row*4+(side+1)%4,(row+1)*4+(side+1)%4,(row+1)*4+side))
    faces.append(tuple((len(sections)-1)*4+i for i in range(4)))
    mesh=bpy.data.meshes.new('Closed forged blade facets');mesh.from_pydata(vertices,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        for li in face.loop_indices:
            index=mesh.loops[li].vertex_index;uv.data[li].uv=((index%4)/3,sections[index//4][0]/.855)
    source_axis=Vector((.27,.55,-.89))
    blade_matrix=Matrix.Translation(Vector((.197,-.217,1.014)))@Vector((0,0,1)).rotation_difference(source_axis).to_matrix().to_4x4()
    mesh.transform(transform@blade_matrix)
    obj=bpy.data.objects.new('Authored_equipped_blade',mesh);collection.objects.link(obj)
    obj['sourcePart']='equipped_sword';obj['equipmentHand']='hand.R'
    material=bpy.data.materials.new('AuthoredHero forged blade');material.use_nodes=True
    nodes=material.node_tree.nodes;links=material.node_tree.links;p=nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(.42,.47,.50,1);p.inputs['Metallic'].default_value=.72
    texcoord=nodes.new('ShaderNodeTexCoord');stretch=nodes.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY'
    stretch.inputs[1].default_value=(30,2,1);links.new(texcoord.outputs['UV'],stretch.inputs[0])
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=12;noise.inputs['Detail'].default_value=2
    links.new(stretch.outputs[0],noise.inputs['Vector'])
    rough=nodes.new('ShaderNodeMapRange');rough.inputs['To Min'].default_value=.25;rough.inputs['To Max'].default_value=.37
    links.new(noise.outputs['Fac'],rough.inputs[0]);links.new(rough.outputs[0],p.inputs['Roughness'])
    mesh.materials.append(material)
    return obj


def segment_distance(point,head,tail):
    axis = tail-head
    factor = max(0,min(1,(point-head).dot(axis)/axis.length_squared))
    return (point-head-axis*factor).length


def attach_authored_hero_rig(collection):
    spec = hero_bones()
    armature = bpy.data.armatures.new('Authored hero articulated anatomy')
    rig = bpy.data.objects.new('Hero_Armature',armature)
    collection.objects.link(rig)
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name,(head,tail,parent) in spec.items():
        bone = armature.edit_bones.new(name)
        bone.head=head;bone.tail=tail
        if parent:
            # Parent entries may occur later in the specification.
            pass
    for name,(_,_,parent) in spec.items():
        if parent:armature.edit_bones[name].parent=armature.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    segments = {name:(Vector(a),Vector(b)) for name,(a,b,_) in spec.items()}

    def blend_segments(point,names):
        distances = sorted((segment_distance(point,*segments[name]),name) for name in names)[:2]
        # Smooth two-bone blends for cloth; armor islands use one rigid influence.
        values = [(name,1/(distance+.045)**4) for distance,name in distances]
        total = sum(weight for _,weight in values)
        return [(name,weight/total) for name,weight in values]

    for obj in list(collection.objects):
        if obj.type != 'MESH':continue
        source = source_part(obj)
        groups={name:obj.vertex_groups.new(name=name) for name in spec}
        for island in mesh_islands(obj.data):
            coordinates=[obj.data.vertices[index].co for index in island]
            low=Vector(tuple(min(p[i] for p in coordinates) for i in range(3)))
            high=Vector(tuple(max(p[i] for p in coordinates) for i in range(3)))
            center=(low+high)*.5
            side='L' if center.x>0 else 'R'
            arm_region=low.z>.88 and abs(center.x)>.3 and high.z>1.05
            boot=source.startswith('clothing') and high.z<.45 and len(island)>200
            cape=source.startswith('clothing') and high.z-low.z>1.25 and high.x-low.x>.6
            long_sword=source.startswith('clothing') and low.x>.16 and high.x>.4 and low.z<.3 and high.z>1.0
            torso_plate=source.startswith('clothing') and low.z>1.13 and high.z>1.57 and high.x-low.x<.42 and len(island)>1000
            rigid=source.startswith('clothing') and len(island)<900 and not cape and not (high.z<1.06 and low.z<.5 and high.z-low.z>.25)
            if long_sword:fixed='pelvis'
            elif torso_plate:fixed='chest'
            elif rigid and not boot:
                if high.z<.45:fixed='foot.'+side if center.z<.2 else 'shin.'+side
                elif abs(center.x)>.3:fixed=min(('arm.'+side,'forearm.'+side,'hand.'+side),key=lambda n:segment_distance(center,*segments[n]))
                elif low.z>1.4 and abs(center.x)>.12:fixed='arm.'+side
                else:fixed='chest' if center.z>1.2 else 'pelvis'
            else:fixed=None
            for index in island:
                point=obj.data.vertices[index].co
                if source=='equipped_sword':weights=[('hand.R',1)]
                elif not source.startswith('clothing'):
                    weights=[('head',1)]
                    if source.startswith('hood') and point.z<1.65:
                        head=max(0,min(1,(point.z-1.55)/.1));weights=[('head',head),('chest',1-head)]
                elif fixed:weights=[(fixed,1)]
                elif boot:
                    shaft=max(0,min(1,(point.z-.10)/.17))
                    weights=[('shin.'+side,shaft),('foot.'+side,1-shaft)]
                elif cape:
                    weights=blend_segments(point,('cape','cape.mid','cape.hem'))
                elif arm_region or (abs(point.x)>.26 and point.z>1.05):
                    wrist,hand_tip=segments['hand.'+side]
                    distal=(point-wrist).dot((hand_tip-wrist).normalized())
                    if arm_region and distal>.045:
                        weights=[('hand.'+side,1)]
                    elif arm_region and distal>0:
                        grip=distal/.045
                        weights=[('hand.'+side,grip),('forearm.'+side,1-grip)]
                    else:weights=blend_segments(point,('arm.'+side,'forearm.'+side,'hand.'+side))
                elif point.z>1.08:weights=blend_segments(point,('chest','pelvis'))
                elif point.z>.8:
                    leg_weight=max(0,min(.65,(1.05-point.z)/.35))
                    weights=[('pelvis',1-leg_weight),('leg.'+('L' if point.x>0 else 'R'),leg_weight)]
                else:
                    weights=blend_segments(point,('leg.'+('L' if point.x>0 else 'R'),'shin.'+('L' if point.x>0 else 'R'),'foot.'+('L' if point.x>0 else 'R')))
                for name,weight in weights:
                    if weight>0:groups[name].add([index],weight,'REPLACE')
        obj.parent=rig
        modifier=obj.modifiers.new('Authored hero articulated deformation','ARMATURE');modifier.object=rig
        # Match glTF/WebGL linear skinning in source reviews; do not hide joint
        # pinching behind Blender-only dual-quaternion deformation.
        modifier.use_deform_preserve_volume=False
    for pose in rig.pose.bones:pose.rotation_mode='QUATERNION'
    rig['heroRigRevision']='authored-19-bone-study'
    origin=bpy.data.objects.new('CastOrigin',None);collection.objects.link(origin)
    origin.parent=rig;origin.parent_type='BONE';origin.parent_bone='hand.L'
    hand=rig.data.bones['hand.L']
    parent_rest=rig.matrix_world@hand.matrix_local@Matrix.Translation((0,hand.length,0))
    origin.matrix_parent_inverse=parent_rest.inverted()
    origin.matrix_basis=Matrix.Translation((.578,-.090,1.035))
    origin.empty_display_size=.018
    origin['purpose']='Left palm cast attachment; release at clip frame10/50fps'
    rig['castReleaseSeconds']=.18
    return rig


def set_authored_pose(rig,kind='ready',phase=0):
    """Direct FK study; world travel is never authored into the rig."""
    for bone in rig.pose.bones:
        bone.rotation_quaternion=(1,0,0,0);bone.location=(0,0,0);bone.scale=(1,1,1)

    def turn(name,angles):
        basis=rig.data.bones[name].matrix_local.to_quaternion()
        rotation=Euler(angles,'XYZ').to_quaternion()
        rig.pose.bones[name].rotation_quaternion=basis.inverted()@rotation@basis

    def aim(name,direction):
        bpy.context.view_layer.update()
        bone=rig.pose.bones[name]
        delta=(bone.tail-bone.head).rotation_difference(Vector(direction))
        origin=bone.head.copy()
        bone.matrix=Matrix.Translation(origin)@delta.to_matrix().to_4x4()@Matrix.Translation(-origin)@bone.matrix
        bpy.context.view_layer.update()

    def blade_direction(direction):
        bpy.context.view_layer.update()
        bone=rig.pose.bones['hand.R']
        rest=rig.data.bones['hand.R'].matrix_local.to_quaternion()
        current=bone.matrix.to_quaternion()@rest.inverted()@Vector((0,-1,0))
        delta=current.rotation_difference(Vector(direction));origin=bone.head.copy()
        bone.matrix=Matrix.Translation(origin)@delta.to_matrix().to_4x4()@Matrix.Translation(-origin)@bone.matrix
        bpy.context.view_layer.update()

    def plant_leg(side,target):
        bpy.context.view_layer.update()
        upper=rig.pose.bones['leg.'+side];lower=rig.pose.bones['shin.'+side]
        hip=upper.head.copy();target=Vector(target)
        a=rig.data.bones[upper.name].length;b=rig.data.bones[lower.name].length
        axis=target-hip;distance=max(.001,min(axis.length,a+b-.0001));axis.normalize()
        along=(a*a-b*b+distance*distance)/(2*distance)
        height=math.sqrt(max(0,a*a-along*along))
        bend=Vector((0,-1,0));bend-=axis*bend.dot(axis);bend.normalize()
        knee=hip+axis*along+bend*height
        aim(upper.name,knee-hip);aim(lower.name,target-lower.head)
        aim('foot.'+side,(0,-.155,-.095))

    # Elbows and knees have independent articulation, with a mild ready stance.
    turn('arm.R',(.03,-.20,-.08));turn('arm.L',(.02,.20,.05))
    turn('forearm.R',(-.18,-.12,.08));turn('forearm.L',(-.10,.08,-.05))
    turn('leg.R',(-.045,0,-.025));turn('leg.L',(.045,0,.025))
    turn('shin.R',(.07,0,0));turn('shin.L',(.06,0,0))
    if kind=='idle':
        breath=math.sin(phase)
        turn('chest',(.006*breath,0,.012*breath));turn('head',(.005*breath,0,-.009*breath))
        turn('cape',(.014*breath,0,.012*math.sin(phase-.5)))
        turn('cape.mid',(.018*math.sin(phase-.5),0,0));turn('cape.hem',(.024*math.sin(phase-1),0,0))
    elif kind=='walk':
        stride=math.sin(phase)
        turn('leg.R',(-.28*stride,0,-.02));turn('leg.L',(.28*stride,0,.02))
        turn('shin.R',(.38*max(0,-stride)+.03,0,0));turn('shin.L',(.38*max(0,stride)+.03,0,0))
        turn('pelvis',(0,0,.045*stride));turn('chest',(0,0,-.06*stride))
        turn('arm.L',(.13*stride,.20,.05));turn('forearm.L',(-.15,.08,-.05))
        turn('cape',(.06*stride,0,-.035*stride));turn('cape.mid',(-.06*math.sin(phase-.5),0,0));turn('cape.hem',(.08*math.sin(phase-1),0,0))
    elif kind=='cast_gather':
        turn('chest',(-.02,0,.09));turn('head',(-.025,0,-.06))
        aim('arm.L',(.10,-.05,-.24));aim('forearm.L',(-.11,-.17,.10))
        turn('hand.L',(-.10,0,-.15));turn('cape',(-.035,0,-.025))
    elif kind=='cast':
        turn('chest',(.035,0,-.10));turn('head',(-.04,0,.08))
        aim('arm.L',(.19,-.09,.08));aim('forearm.L',(.02,-.20,.07))
        turn('hand.L',(-.12,0,-.12));turn('cape',(.06,0,.035));turn('cape.mid',(-.08,0,0))
    elif kind=='cleave_windup':
        turn('pelvis',(0,0,.10));turn('chest',(-.025,0,.22));turn('head',(.025,0,-.14))
        aim('arm.R',(-.18,.04,.16));aim('forearm.R',(.02,-.22,.015))
        turn('hand.R',(.10,.08,0));turn('arm.L',(-.12,.12,.12))
        blade_direction((0,.22,.98))
        turn('cape',(-.045,0,-.05));turn('cape.mid',(.035,0,.025))
    elif kind=='cleave':
        turn('pelvis',(0,0,-.14));turn('chest',(.11,0,-.35));turn('head',(-.04,0,.18))
        rig.pose.bones['pelvis'].location=rig.data.bones['pelvis'].matrix_local.to_3x3().inverted()@Vector((-.02,-.035,-.04))
        aim('arm.R',(-.21,-.12,-.07));aim('forearm.R',(-.18,-.13,-.06))
        turn('hand.R',(.06,.10,0));aim('arm.L',(.16,.06,-.20));aim('forearm.L',(.04,-.08,.19))
        blade_direction((-.62,-.72,-.30))
        plant_leg('L',(.15,-.065,.16));plant_leg('R',(-.15,.055,.16))
        turn('cape',(.075,0,.05));turn('cape.mid',(-.10,0,-.025))
    bpy.context.view_layer.update()
    ground_authored_pose(rig)


def ground_authored_pose(rig):
    # Keep the supporting sole grounded in authored studies and sampled clips.
    rig.pose.bones['root'].location=(0,0,0)
    bpy.context.view_layer.update()
    depsgraph=bpy.context.evaluated_depsgraph_get()
    meshes=[obj for obj in rig.children if obj.type=='MESH']
    low=min((obj.matrix_world@Vector(corner)).z for obj in meshes for corner in obj.evaluated_get(depsgraph).bound_box)
    basis=rig.data.bones['root'].matrix_local.to_3x3()
    rig.pose.bones['root'].location=basis.inverted()@Vector((0,0,max(0,-low)+.004))
    bpy.context.view_layer.update()


def author_hero_actions(rig):
    """Four sampled clips; root X/Y travel belongs to the game, never the asset."""
    # 50fps places the existing cosmetic .18s contact at an exact sample; idle
    # and walk retain their original3.2s/.8s durations. Gameplay owns contact.
    scene=bpy.context.scene;scene.render.fps=50
    rig.animation_data_create()
    if rig.animation_data.nla_tracks:
        raise ValueError('Use a fresh study rig; refusing to replace existing actions')
    actions={}

    def snapshot(kind,phase=0):
        set_authored_pose(rig,kind,phase)
        return {p.name:(p.rotation_quaternion.copy(),p.location.copy(),p.scale.copy()) for p in rig.pose.bones}

    def key(frame):
        for bone in rig.pose.bones:
            bone.keyframe_insert('rotation_quaternion',frame=frame)
            bone.keyframe_insert('location',frame=frame)
            bone.keyframe_insert('scale',frame=frame)

    def stash(name,action,end):
        track=rig.animation_data.nla_tracks.new();track.name=name
        strip=track.strips.new(name,1,action);strip.action_frame_start=1;strip.action_frame_end=end
        track.mute=True;rig.animation_data.action=None;actions[name]=action

    for name,end,step in (('idle',161,5),('walk',41,1)):
        action=bpy.data.actions.new(name);rig.animation_data.action=action
        for frame in range(1,end+1,step):
            set_authored_pose(rig,name,(frame-1)/(end-1)*math.tau);key(frame)
        stash(name,action,end)
    for name,schedule in (
        ('cast',((1,'ready'),(5,'cast_gather'),(10,'cast'),(19,'cast'),(56,'ready'))),
        ('cleave',((1,'ready'),(5,'cleave_windup'),(10,'cleave'),(17,'cleave'),(56,'ready'))),
    ):
        targets=[(frame,snapshot(kind)) for frame,kind in schedule]
        action=bpy.data.actions.new(name);rig.animation_data.action=action
        for index in range(len(targets)-1):
            start,a=targets[index];end,b=targets[index+1]
            for frame in range(start,end+1):
                t=(frame-start)/(end-start);t=t*t*(3-2*t)
                for bone in rig.pose.bones:
                    aq,al,asc=a[bone.name];bq,bl,bsc=b[bone.name]
                    bone.rotation_quaternion=aq.slerp(bq,t)
                    bone.location=al.lerp(bl,t);bone.scale=asc.lerp(bsc,t)
                ground_authored_pose(rig)
                key(frame)
        stash(name,action,56)
    set_authored_pose(rig,'ready')
    rig['animationContract']='idle/walk/cleave/cast; no horizontal root travel'
    return actions
