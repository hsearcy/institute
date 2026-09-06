"""Isolated authored skeleton/revenant source studies, not production builders.

Use the pinned CC0 Blender Studio anatomy cache. Preserve every existing scene;
source inspection and independent shape review precede optimization or export.
The runtime skeleton/revenant files remain unchanged until separately accepted.
"""
from pathlib import Path
import hashlib
import json
import bpy

SOURCES = {
    'realistic-skeleton.blend': 'd563a0fb2f0044d91737af9b4d57f211e84340c6ff1596a1b9f600aa35f40f2b',
    'realistic-skull.blend': '1e0bad1693cc1824be5efc2351a71105ff388af80f356e5bd48a0c9e4d83ec99',
}


def inspect_anatomy_sources(repo_root, output=None, include_high_skull=True):
    """Append sources into a dedicated scene; report original construction."""
    root=Path(repo_root);folder=root/'scripts/blender/sources/blender-studio'
    for name,digest in SOURCES.items():
        path=folder/name
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
            raise RuntimeError('Missing or invalid CC0 anatomy cache. Run python scripts/blender/sources/blender-studio/fetch.py')
    previous=bpy.context.window.scene
    scene=bpy.data.scenes.new('Authored enemy anatomical foundation')
    bpy.context.window.scene=scene
    selected=SOURCES if include_high_skull else {'realistic-skeleton.blend':SOURCES['realistic-skeleton.blend']}
    report={'sources':selected,'scene':scene.name,'objects':[]}
    try:
        for filename in selected:
            collection=bpy.data.collections.new('CC0 enemy source '+filename)
            scene.collection.children.link(collection)
            with bpy.data.libraries.load(str(folder/filename),link=False) as (source,target):
                target.objects=list(source.objects)
            for obj in target.objects:
                if obj:collection.objects.link(obj)
            bpy.context.view_layer.update()
            for obj in collection.objects:
                entry={'source':filename,'name':obj.name,'type':obj.type,'parent':obj.parent.name if obj.parent else None,'matrixWorld':[list(row) for row in obj.matrix_world]}
                if obj.type=='MESH':
                    points=[obj.matrix_world@v.co for v in obj.data.vertices]
                    entry.update(vertices=len(points),triangles=sum(len(p.vertices)-2 for p in obj.data.polygons),materials=[m.name if m else None for m in obj.data.materials],modifiers=[{'name':m.name,'type':m.type,'levels':getattr(m,'levels',None)} for m in obj.modifiers])
                    if points:entry['bounds']=[[min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)]]
                report['objects'].append(entry)
        if output:
            path=Path(output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(report,indent=2)+'\n')
        return scene,report
    finally:
        bpy.context.window.scene=previous


def build_anatomy_study(repo_root, source_scene_name='Authored enemy anatomical foundation'):
    """Untextured anatomical silhouette study; no runtime export or promotion."""
    from mathutils import Vector,Matrix
    source=bpy.data.scenes.get(source_scene_name)
    if source is None:source,_=inspect_anatomy_sources(repo_root,include_high_skull=False)
    previous=bpy.context.window.scene
    try:
        bpy.context.window.scene=source
        source_objects=[o for o in source.objects if o.name.startswith('GEO-skeletion.')]
        # Evaluate mirror symmetry and one smoothing level for the shape study.
        # The copied high source remains separate from any future runtime LOD.
        settings=[]
        for obj in source_objects:
            for modifier in obj.modifiers:
                if modifier.type=='SUBSURF':
                    settings.append((modifier,modifier.levels))
                    modifier.levels=0 if '.skull' in obj.name else 1
        try:
            bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
            copies=[]
            for obj in source_objects:
                data=bpy.data.meshes.new_from_object(obj.evaluated_get(graph),preserve_all_data_layers=True,depsgraph=graph)
                data.transform(obj.matrix_world)
                copies.append((obj.name.removeprefix('GEO-skeletion.'),data))
        finally:
            for modifier,level in settings:modifier.levels=level
            bpy.context.view_layer.update()
        scene=bpy.data.scenes.new('Authored skeleton neutral shape study')
        scene['rpgStudyOwner']='authored_enemy_review'
        collection=bpy.data.collections.new('Authored skeleton neutral shape');scene.collection.children.link(collection)
        bpy.context.window.scene=scene
        material=bpy.data.materials.new('Anatomy neutral clay');material.use_nodes=True
        p=material.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.38,.36,.32,1);p.inputs['Roughness'].default_value=.72;p.inputs['Specular IOR Level'].default_value=.25
        all_points=[v.co for _,data in copies for v in data.vertices]
        lower=Vector((min(p.x for p in all_points),min(p.y for p in all_points),min(p.z for p in all_points)))
        upper=Vector((max(p.x for p in all_points),max(p.y for p in all_points),max(p.z for p in all_points)))
        center_x=(lower.x+upper.x)*.5;scale=1.8/(upper.z-lower.z)
        transform=Matrix.Scale(scale,4)@Matrix.Translation((-center_x,0,-lower.z))
        for name,data in copies:
            data.transform(transform);data.materials.clear();data.materials.append(material)
            for face in data.polygons:face.use_smooth=True
            obj=bpy.data.objects.new('Authored anatomy '+name,data);collection.objects.link(obj);obj['anatomicalSource']=name
        collection['sourceSHA256']=SOURCES['realistic-skeleton.blend'];collection['status']='Source shape review only; no production replacement'
        collection['sourceScale']=scale;collection['sourceGround']=lower.z
        return scene,collection
    finally:
        bpy.context.window.scene=previous


def render_anatomy_study(scene,output,high=False,native=False,detail=False):
    """Neutral front or actual elevated angle; preserve the caller's scene."""
    from mathutils import Vector
    previous=bpy.context.window.scene
    try:
        bpy.context.window.scene=scene
        for obj in list(scene.objects):
            if obj.get('anatomyReviewLight'):bpy.data.objects.remove(obj,do_unlink=True)
        target=Vector((.27,-.13,1.30) if detail else (0,-.01,.91))
        camera=bpy.data.objects.new('Anatomy review camera',bpy.data.cameras.new('Anatomy review camera'));scene.collection.objects.link(camera)
        camera['anatomyReviewLight']=True
        camera.location=(1.3,-1.6,1.65) if detail else (3,-5,5.8) if high else (2.2,-6,1.95)
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.12;scene.camera=camera
        if native:camera.data.ortho_scale=3.2
        if detail:camera.data.ortho_scale=.68
        for name,location,power,color,size in [('key',(-3,-4,5),550,(1,.91,.81),4),('fill',(4,-1,3),350,(.81,.89,1),3),('rim',(-1,3,4),550,(.69,.78,1),3)]:
            data=bpy.data.lights.new('Anatomy '+name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
            if native:data.energy*=.38
            obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
            obj['anatomyReviewLight']=True
        world=bpy.data.worlds.new('Anatomy neutral backdrop');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.18,.2,.23,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4;scene.world=world
        if native:
            world.node_tree.nodes['Background'].inputs['Color'].default_value=(.055,.063,.070,1)
            world.node_tree.nodes['Background'].inputs['Strength'].default_value=.2
        scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
        scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100
        if native:scene.render.resolution_x=192;scene.render.resolution_y=192
        if detail:scene.render.resolution_x=640;scene.render.resolution_y=640
        scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
        scene.render.image_settings.file_format='PNG';scene.render.filepath=str(output)
        bpy.ops.render.render(write_still=True)
        return output
    finally:
        bpy.context.window.scene=previous


def _articulate_anatomy_study_active(collection, guarded=True):
    """Use real anatomical joints for a conservative guard study, without skins.

    The game's established R/L labels follow positive/negative model X, opposite
    the source anatomical labels. Explicit mapping avoids mirrored equipment.
    """
    from mathutils import Vector,Matrix,Quaternion
    import re,math
    factor=float(collection['sourceScale'])
    ground=float(collection['sourceGround'])
    def point(x,y,z):return Vector((x*factor,y*factor,(z-ground)*factor))
    pivots={'Body':point(0,0,.945),'Head':point(0,-.015,1.508)}
    for side,sign in [('R',1),('L',-1)]:
        # Measured source shoulder head and distal humeral articulation. The
        # former elbow was 19mm anterior to the joint, opening a visible gap
        # when the forearm folded back toward the chest.
        pivots.update({'ArmUpper'+side:point(sign*.185,-.020,1.442),'ArmLower'+side:point(sign*.339,.014,1.163),
                       'LegUpper'+side:point(sign*.102,0,.945),'LegLower'+side:point(sign*.119,-.018,.494)})
    joints={}
    for name,pivot in pivots.items():
        joint=bpy.data.objects.new('Joint_'+name,None);collection.objects.link(joint);joint.location=pivot;joint['enemyJoint']=name;joints[name]=joint
    for name,joint in joints.items():
        parent='Body' if name=='Head' or name.startswith('ArmUpper') else 'ArmUpper'+name[-1] if name.startswith('ArmLower') else 'LegUpper'+name[-1] if name.startswith('LegLower') else None
        if parent:
            joint.parent=joints[parent];joint.location=pivots[name]-pivots[parent]
    bpy.context.view_layer.update()
    bindings={}
    for obj in list(collection.objects):
        if obj.type!='MESH':continue
        name=re.sub(r'\.\d{3}$','',obj.get('anatomicalSource',''))
        side='R' if name.endswith('.L') else 'L'
        if obj.get('equipmentHand'):part='ArmLower'+obj['equipmentHand']
        elif obj.get('authoredHarness'):part='Body'
        elif 'skull' in name or 'spine_cervical' in name:part='Head'
        elif 'arm_humerus' in name:part='ArmUpper'+side
        elif 'arm_' in name or 'hand_center' in name or 'metacarpal' in name:part='ArmLower'+side
        elif re.match(r'(proximal|middle|distal)\.[a-z]+\.',name):part='ArmLower'+side
        elif 'leg_femur' in name:part='LegUpper'+side
        elif 'leg_' in name or 'foot_' in name or 'metatarsal' in name or re.match(r'(proximal|middle|distal)\.[1-5]\.',name):part='LegLower'+side
        else:part='Body'
        world=obj.matrix_world.copy();bindings[obj]=world
        obj.parent=joints[part];obj.matrix_world=world;obj['part']=part
    bpy.context.view_layer.update()
    for obj,world in bindings.items():
        error=max(abs(obj.matrix_world[i][j]-world[i][j]) for i in range(4) for j in range(4))
        if error>2e-6:raise ValueError('Rigid binding moved source geometry: '+obj.name)
    if guarded:
        # Pose direction is explicit in body coordinates: one compact guard,
        # one forward weapon line, rather than trial Euler angles on a hanging arm.
        joints['Body'].location.z-=.028
        joints['Body'].rotation_euler=(.10,0,-.025)
        joints['Head'].rotation_euler=(-.12,0,-.14)
        directions={
            'R':(Vector((.20,-.12,-.25)),Vector((-.12,-.17,.10))),
            'L':(Vector((-.11,-.09,-.29)),Vector((-.08,-.09,.16))),
        }
        for side,sign in [('R',1),('L',-1)]:
            upper=pivots['ArmLower'+side]-pivots['ArmUpper'+side]
            lower=point(sign*.414,-.060,.942)-pivots['ArmLower'+side]
            up_direction,low_direction=directions[side]
            # A humeral frame controls shoulder roll, followed by one elbow
            # hinge. Independent shortest-arc rotations introduced forearm
            # twist and rotated the radius/ulna away from the condyles.
            hinge=Vector((-sign,0,-.5))
            hinge=(hinge-upper.normalized()*hinge.dot(upper.normalized())).normalized()
            desired_hinge=up_direction.cross(low_direction).normalized()
            def frame(direction,axis):
                direction=direction.normalized()
                axis=(axis-direction*axis.dot(direction)).normalized()
                return Matrix((direction,axis,direction.cross(axis))).transposed()
            q_up=(frame(up_direction,desired_hinge)@frame(upper,hinge).transposed()).to_quaternion()
            a=lower-hinge*lower.dot(hinge)
            wanted=q_up.inverted()@low_direction
            b=wanted-hinge*wanted.dot(hinge)
            bend=math.atan2(hinge.dot(a.cross(b)),a.dot(b))
            joints['ArmUpper'+side].rotation_mode='QUATERNION'
            if side=='R':q_up=Quaternion(Vector((1,0,0)),-.68)@q_up
            joints['ArmUpper'+side].rotation_quaternion=q_up
            joints['ArmLower'+side].rotation_mode='QUATERNION'
            joints['ArmLower'+side].rotation_quaternion=Quaternion(hinge,bend)
        bpy.context.view_layer.update()
        # Modest wrist pronation turns the grasp toward the body instead of
        # displaying a flat palm to the camera. Preserve the wrist contact.
        for side,sign,source_side in [('R',1,'L'),('L',-1,'R')]:
            hands=[o for o in collection.objects if o.type=='MESH' and o.get('part')=='ArmLower'+side
                   and (o.get('equipmentHand')==side or any(label in o.get('anatomicalSource','') for label in ('hand_center','metacarpal','proximal.','middle.','distal.')))]
            center=next(o for o in hands if 'hand_center' in o.get('anatomicalSource',''))
            wrist=point(sign*.414,-.060,.942)
            axis=(center.matrix_world.to_3x3()@(wrist-pivots['ArmLower'+side])).normalized()
            world_wrist=center.matrix_world@wrist
            palm=center.matrix_world.to_3x3()@Vector((-sign,0,0))
            target=(joints['Body'].matrix_world.to_3x3()@Vector((.08,-1,.03))) if side=='L' else joints['Body'].matrix_world@(point(0,-.05,1.27)-pivots['Body'])-world_wrist
            palm=(palm-axis*palm.dot(axis)).normalized();target=(target-axis*target.dot(axis)).normalized()
            limit=1.05 if side=='L' else .45
            turn=max(-limit,min(limit,math.atan2(axis.dot(palm.cross(target)),palm.dot(target))))
            rotate=Matrix.Translation(world_wrist)@Matrix.Rotation(turn,4,axis)@Matrix.Translation(-world_wrist)
            for obj in hands:obj.matrix_world=rotate@obj.matrix_world
        if collection.get('equippedStudy'):
            # Move the complete held chain sideways, preserving the accepted
            # grip, wrist and elbow relationship; never spin a blade in a fist.
            joint=joints['ArmUpperR']
            joint.rotation_quaternion=Quaternion(Vector((0,1,0)),.40)@joint.rotation_quaternion
        bpy.context.view_layer.update()
        # A two-bone stance keeps both ankle targets at the same ground height
        # while the hips lower and the knees bend toward the forward pole.
        ankles={}
        for side,sign in [('R',1),('L',-1)]:
            h=pivots['LegUpper'+side].copy();h.z-=.028
            knee=pivots['LegLower'+side]
            old_ankle=point(sign*.125,-.018,.078)
            ankle=point(sign*.17,-.11 if side=='R' else .10,.078)
            a=(knee-pivots['LegUpper'+side]).length;b=(old_ankle-knee).length
            direction=ankle-h;distance=direction.length;axis=direction.normalized()
            if not abs(a-b)<distance<a+b:raise ValueError('Ankle target outside anatomical reach')
            along=(a*a-b*b+distance*distance)/(2*distance)
            pole=Vector((0,-1,0));pole=(pole-axis*pole.dot(axis)).normalized()
            target_knee=h+axis*along+pole*math.sqrt(max(0,a*a-along*along))
            q_up=(knee-pivots['LegUpper'+side]).rotation_difference(target_knee-h)
            q_low=(old_ankle-knee).rotation_difference(ankle-target_knee)
            joints['LegUpper'+side].location=h
            joints['LegUpper'+side].rotation_mode='QUATERNION';joints['LegUpper'+side].rotation_quaternion=q_up
            joints['LegLower'+side].rotation_mode='QUATERNION';joints['LegLower'+side].rotation_quaternion=q_up.inverted()@q_low
            ankles[side]=(old_ankle,ankle)
        bpy.context.view_layer.update()
        # Keep the feet planted instead of inheriting the lower-leg's tilt.
        # These are ordinary rigid mesh transforms, not an added runtime skin.
        for obj in collection.objects:
            if obj.type!='MESH':continue
            name=re.sub(r'\.\d{3}$','',obj.get('anatomicalSource',''))
            if not ('foot_' in name or 'metatarsal' in name or re.match(r'(proximal|middle|distal)\.[1-5]\.',name)):continue
            side='R' if name.endswith('.L') else 'L'
            old_ankle,ankle=ankles[side]
            obj.matrix_world=Matrix.Translation(ankle-old_ankle)
        bpy.context.view_layer.update()
        heights=[(obj.matrix_world@v.co).z for obj in collection.objects if obj.type=='MESH' and obj.get('anatomicalSource') for v in obj.data.vertices]
        if not 1.5<max(heights)-min(heights)<2.1:raise ValueError('Unexpected posed anatomy height; inspect joint transforms')
        floor=min(heights)
        equipment=[(obj.matrix_world@v.co).z for obj in collection.objects if obj.type=='MESH' and obj.get('equipmentHand') for v in obj.data.vertices]
        if equipment and min(equipment)<floor-.01:raise ValueError('Equipped weapon extends below anatomical feet; correct its pose before export')
        for joint in joints.values():
            if joint.parent is None:joint.location.z-=floor
        bpy.context.view_layer.update()
    collection['enemyPivots']={name:list(p) for name,p in pivots.items()}
    return joints


def articulate_anatomy_study(collection, guarded=True):
    """Evaluate parent matrices in the candidate's scene, then restore caller."""
    previous=bpy.context.window.scene
    def contains(parent):return parent==collection or any(contains(child) for child in parent.children)
    scene=next(s for s in bpy.data.scenes if contains(s.collection))
    try:
        bpy.context.window.scene=scene
        bpy.context.view_layer.update()
        if guarded:
            strengthen_anatomy_visibility(collection)
            curl_anatomical_hands(collection)
        return _articulate_anatomy_study_active(collection,guarded)
    finally:
        bpy.context.window.scene=previous


def strengthen_anatomy_visibility(collection):
    """Slight cross-section/hand gains; preserve authored joints and torso gaps."""
    import numpy as np,re
    from mathutils import Vector
    if collection.get('visibilityStrengthened'):return
    factor=float(collection['sourceScale']);ground=float(collection['sourceGround'])
    for obj in collection.objects:
        if obj.type!='MESH':continue
        name=re.sub(r'\.\d{3}$','',obj.get('anatomicalSource',''))
        side=1 if name.endswith('.L') else -1
        hand=('hand_center' in name or 'metacarpal' in name or re.match(r'(proximal|middle|distal)\.[a-z]+\.',name))
        if hand:
            wrist=Vector((side*.414*factor,-.060*factor,(.942-ground)*factor))
            for vertex in obj.data.vertices:vertex.co=wrist+(vertex.co-wrist)*1.18
        elif any(part in name for part in ('arm_ulna','arm_radius','leg_tibula','leg_fibula')):
            points=np.array([list(v.co) for v in obj.data.vertices]);center=points.mean(axis=0)
            _,axes=np.linalg.eigh(np.cov((points-center).T));axis=axes[:,-1]
            along=np.outer((points-center)@axis,axis)
            gain=1.22 if 'arm_' in name else 1.17
            distance=(points-center)@axis
            unit=(distance-distance.min())/(distance.max()-distance.min())
            end_fade=np.minimum(np.minimum(unit/.2,(1-unit)/.2),1).clip(0,1)
            altered=center+along+(points-center-along)*(1+(gain-1)*end_fade[:,None])
            for vertex,position in zip(obj.data.vertices,altered):vertex.co=position
        obj.data.update()
    collection['visibilityStrengthened']=True


def curl_anatomical_hands(collection):
    """Pose authored finger bones about their touching joint surfaces.

    The asymmetric partial grasp leaves each knuckle and phalanx intact; it is
    baked into this source study rather than adding runtime finger draw calls.
    """
    import numpy as np,re,math
    from mathutils import Vector,Matrix
    if collection.get('handsCurled'):return
    objects={re.sub(r'\.\d{3}$','',o.get('anatomicalSource','')):o for o in collection.objects if o.type=='MESH'}
    def joint_between(a,b):
        av=np.array([list(v.co) for v in a.data.vertices]);bv=np.array([list(v.co) for v in b.data.vertices])
        distance=((av[:,None,:]-bv[None,:,:])**2).sum(axis=2)
        # Average the nearest surface pairs to locate the contact, avoiding a
        # single corner vertex becoming an arbitrary finger rotation center.
        pairs=np.argpartition(distance.ravel(),min(11,distance.size-1))[:12]
        ai,bi=np.unravel_index(pairs,distance.shape)
        return Vector(tuple(((av[ai]+bv[bi])*.5).mean(axis=0)))
    for source_side,sign in [('L',1),('R',-1)]:
        knuckles=[]
        for finger,base_angle in [('index',.42),('middle',.65),('ring',.78),('little',.90),('thumb',.40)]:
            labels=['metacarpal','proximal']+([] if finger=='thumb' else ['middle'])+['distal']
            chain=[objects.get(f'{label}.{finger}.{source_side}') for label in labels]
            if any(o is None for o in chain):raise ValueError('Missing authored finger chain: '+finger+source_side)
            pivots=[joint_between(a,b) for a,b in zip(chain,chain[1:])]
            if finger!='thumb':knuckles.append(pivots[0])
            transform=Matrix.Identity(4)
            axis=Vector((0,sign,0)) if finger!='thumb' else Vector((.3*sign,sign,.25))
            for i,(obj,pivot) in enumerate(zip(chain[1:],pivots)):
                if source_side=='L' and collection.get('equippedStudy'):
                    angle=(.90 if finger!='thumb' else .68) if i==0 else 1.05 if i==1 else .72
                else:
                    angle=(base_angle+.14 if finger in ('ring','little') else base_angle) if i==0 else .82 if i==1 else .48
                transform=transform@Matrix.Translation(pivot)@Matrix.Rotation(angle,4,axis)@Matrix.Translation(-pivot)
                obj.data.transform(transform);obj.data.update()
        center=sum(knuckles,Vector())/len(knuckles)+Vector((-sign*.023,0,-.018))*float(collection['sourceScale'])
        collection['gripCenter'+('R' if sign==1 else 'L')]=list(center)
    collection['handsCurled']=True


def render_guard_review(repo_root,prefix,window_id,detail=False):
    """Bounded pair with an authoritative shared-GPU completion marker."""
    import time
    marker=Path('/tmp/blender-assets-window.json')
    previous=bpy.context.window.scene
    state={'window':window_id,'status':'busy','started':time.time(),'success':False}
    marker.write_text(json.dumps(state)+'\n')
    try:
        scene,collection=build_anatomy_study(repo_root)
        articulate_anatomy_study(collection,True)
        render_anatomy_study(scene,str(prefix)+'-high.png',True)
        if detail:render_anatomy_study(scene,str(prefix)+'-elbow.png',detail=True)
        render_anatomy_study(scene,str(prefix)+'-native.png',True,True)
        from bpy_extras.object_utils import world_to_camera_view
        from mathutils import Vector
        positions=[]
        for obj in collection.objects:
            name=obj.get('anatomicalSource','')
            if obj.type!='MESH' or not any(label in name for label in ('hand_center','ripcage','skull')):continue
            point=sum((obj.matrix_world@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
            projected=world_to_camera_view(scene,scene.camera,point)
            positions.append({'name':name,'part':obj.get('part'),'world':list(point),'normalizedScreen':list(projected)[:2]})
        Path(str(prefix)+'-pose.json').write_text(json.dumps({'positions':positions,'imageSize':[192,192],'scope':'Source guard study; not final runtime motion validation'},indent=2)+'\n')
        state['success']=True
        return scene,collection
    finally:
        bpy.context.window.scene=previous
        state.update(status='idle',finished=time.time(),restoredScene=previous.name)
        marker.write_text(json.dumps(state)+'\n')
