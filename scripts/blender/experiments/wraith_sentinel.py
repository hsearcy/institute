"""Unaccepted wraith structural experiment. Not imported by the asset build.

Execute common.py, detailed/materials.py, geometry.py, then this file in a
dedicated Blender scene. Public wraith is authored by characters.py.
No candidate may replace the public GLB before independent visual acceptance.
"""

def make_wraith_v2():
    global PART
    saved_materials=MATS.copy()
    MATS['wraithWool']=source_material('crypt sentinel coarse charcoal wool',(.014,.027,.030),'cloth',0,.97)
    MATS['wraithWorn']=source_material('crypt sentinel worn folds',(.025,.045,.047),'cloth',0,.96)
    MATS['wraithLining']=source_material('crypt sentinel dark lining',(.009,.013,.015),'cloth',0,.99)
    MATS['wraithBone']=source_material('crypt sentinel old bone',(.30,.255,.185),'bone',0,.93)
    for key in ('wraithWool','wraithWorn','wraithLining'):
        shader=next(n for n in MATS[key].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        shader.inputs['Specular IOR Level'].default_value=.12
    exec((RPG_REPO_ROOT/'scripts/blender/experiments/cc0_anatomy.py').read_text(),globals())
    c=begin('wraith')
    def skin(name,verts,faces,material,thickness=.012):
        obj=mesh(name,verts,faces,material)
        # Torn panels contain unused grid points: remove them before cloth
        # simulation so loose particles cannot fall and distort normalization.
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
        bm.to_mesh(obj.data);bm.free();smooth(obj)
        if thickness:
            mod=obj.modifiers.new('Actual cloth edge thickness','SOLIDIFY');mod.thickness=thickness
            bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
        return obj
    def sweep(name,points,radii,material='wraithBone',sides=9):
        points=[Vector(p) for p in points];verts=[]
        for i,(point,radius) in enumerate(zip(points,radii)):
            tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
            normal=tangent.cross(Vector((0,1,0)))
            if normal.length<.01:normal=tangent.cross(Vector((1,0,0)))
            normal.normalize();binormal=tangent.cross(normal).normalized()
            for j in range(sides):
                angle=j*2*pi/sides;verts.append(tuple(point+normal*cos(angle)*radius+binormal*sin(angle)*radius*.79))
        faces=[tuple(reversed(range(sides)))]
        for i in range(len(points)-1):
            for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
        faces.append(tuple((len(points)-1)*sides+j for j in range(sides)))
        return smooth(mesh(name,verts,faces,material))
    def finish_sculpt(objects,name,voxel=.008,ratio=.65):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();obj=objects[0]
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        obj.data.remesh_voxel_size=voxel;obj.data.remesh_voxel_adaptivity=0
        bpy.ops.object.voxel_remesh()
        mod=obj.modifiers.new('Relax sculpted anatomy','SMOOTH');mod.factor=.65;mod.iterations=3;bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=obj.modifiers.new('Sculpt realtime topology','DECIMATE');mod.ratio=ratio;bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.name=name;smooth(obj);obj['part']=PART
        return obj
    def fold_field(angle,t):
        # Unequal folds converge towards the forward/high left shoulder.
        value=0
        for anchor,strength,width,turn in [(-2.45,.032,.16,.80),(-.55,.023,.19,-.55),(.9,.038,.18,.38),(2.35,.022,.22,-.72)]:
            delta=math.atan2(sin(angle-anchor-turn*t),cos(angle-anchor-turn*t))
            value+=strength*math.exp(-(delta/width)**2)-strength*.48*math.exp(-((delta-width*.9)/(width*.65))**2)
        return value
    # Leaned torso volume establishes cloth tension; the upper robe is shaped
    # from waist pinch to the unequal shoulders instead of vertical curtains.
    nx=64;ny=20;verts=[]
    for j in range(ny+1):
        t=j/ny
        for i in range(nx+1):
            a=-pi/2+2*pi*i/nx
            radius=.16+.059*t;fold=fold_field(a,t)*(sin(pi*t)*.60+.40)
            shoulder_lift=-.056*cos(a)
            z=.87+t*(.57+shoulder_lift)
            x=.08-.21*t+(.93*radius+fold)*cos(a)
            y=-.18*t+(.77*radius+fold)*sin(a)
            # Shoulder-to-waist bias creates diagonal compressed cloth ribs.
            y+=.012*sin((t*2.8+a*.53)*pi)*math.exp(-((t-.32)/.25)**2)
            verts.append((x,y,z))
    faces=[]
    for j in range(ny):
        for i in range(nx):
            v=j*(nx+1)+i;faces.append((v,v+1,v+nx+2,v+nx+1))
    waist_seam=list(verts[:nx+1])
    upper_robe=skin('Oblique shoulder to waist robe',verts,faces,'wraithWool',0)
    # Below the waist, a physically simulated drape hangs around two offset
    # collision volumes. Only its waist seam is pinned; hem tears are irregular.
    nx=64;ny=25;verts=[];faces=[]
    for j in range(ny+1):
        t=j/ny
        for i in range(nx+1):
            opening=.10+.23*t
            a=-pi/2+opening+(2*pi-2*opening)*i/nx
            radius=.149+.165*t;fold=fold_field(a,0)*(.40+.60*t)
            length=.81-.23*math.exp(-((a+1.10)/.48)**2)-.19*math.exp(-((a-.25)/.54)**2)-.11*math.exp(-((a-3.3)/.31)**2)
            x=.08+.10*t*t+(radius+fold)*cos(a)
            y=.085*t+(.1232+.13*t+fold)*sin(a)
            z=.870-length*t
            verts.append(waist_seam[i] if j==0 else (x,y,z))
    for j in range(ny):
        for i in range(nx):
            # Two decisive missing patches; avoid a repeated sawtooth hem.
            if (j>=20 and 15<=i<=18) or (j>=23 and 45<=i<=49):continue
            v=j*(nx+1)+i;faces.append((v,v+1,v+nx+2,v+nx+1))
    skirt=skin('Gravity draped asymmetric skirt',verts,faces,'wraithWool',0)
    pin=skirt.vertex_groups.new(name='Waist seam')
    pin.add(list(range(nx+1)),1,'REPLACE');pin.add(list(range(nx+1,2*(nx+1))),.55,'REPLACE')
    colliders=[]
    for loc,size in [((-.07,.0,.61),(.09,.095,.23)),((.135,.105,.41),(.10,.11,.31))]:
        obj=sphere('Temporary concealed leg collider',loc,size,'shadow',12,8);colliders.append(obj)
        obj.modifiers.new('Cloth collision','COLLISION')
    scene=bpy.context.scene;scene.frame_set(1)
    bpy.context.view_layer.objects.active=skirt
    cloth=skirt.modifiers.new('Native cloth waist drape','CLOTH');cloth.settings.quality=5
    cloth.settings.mass=.3;cloth.settings.tension_stiffness=32;cloth.settings.compression_stiffness=32
    cloth.settings.shear_stiffness=18;cloth.settings.bending_stiffness=.6
    cloth.settings.vertex_group_mass=pin.name;cloth.settings.air_damping=3
    cloth.collision_settings.distance_min=.009;cloth.collision_settings.collision_quality=3
    cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=36
    for frame in range(1,37):scene.frame_set(frame);bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active=skirt;bpy.ops.object.modifier_apply(modifier=cloth.name)
    for index,point in enumerate(waist_seam):skirt.data.vertices[index].co=point
    for collider in colliders:bpy.data.objects.remove(collider,do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT');upper_robe.select_set(True);skirt.select_set(True);bpy.context.view_layer.objects.active=upper_robe;bpy.ops.object.join()
    skirt=upper_robe;skirt.name='Continuous shoulder to hem garment'
    bm=bmesh.new();bm.from_mesh(skirt.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(skirt.data);bm.free();smooth(skirt)
    mod=skirt.modifiers.new('Continuous woven robe thickness','SOLIDIFY');mod.thickness=.006;bpy.ops.object.modifier_apply(modifier=mod.name)
    # Compressed shoulder cowl: raised left shoulder folds down around the neck,
    # with a short diagonal lower edge rather than a second full cape.
    verts=[];faces=[];nx=64;ny=22
    for j in range(ny+1):
        t=j/ny
        for i in range(nx+1):
            a=-pi/2+2*pi*i/nx
            radius=.12+(.24+.12*max(0,cos(a))+.08*max(0,-sin(a)))*t
            fold=.008*sin(a*5+t*4)*sin(t*pi)
            # Start above every collision surface. Previous cone intersected
            # shoulders before frame one and accumulated unstable cloth piles.
            z=1.605-.036*cos(a)+.008*sin(a*3)*sin(pi*t)
            verts.append((-.057+(radius+fold)*cos(a),-.14+(.86*radius+fold)*sin(a),z))
    for j in range(ny):
        for i in range(nx):
            v=j*(nx+1)+i;faces.append((v,v+1,v+nx+2,v+nx+1))
    cowl=skin('Compressed uneven shoulder cowl',verts,faces,'wraithWorn',0);cowl['part']='Cape'
    simulate_mantle=cowl
    # Opposed gestures: left arm reaches forward/down, right hand guards inward.
    gestures=[('L',(-.22,-.12,1.47),(-.39,-.27,1.31),(-.49,-.44,1.18)),('R',(.17,-.015,1.40),(.36,.105,1.14),(.43,-.05,1.30))]
    for label,shoulder,elbow,wrist in gestures:
        S=Vector(shoulder);E=Vector(elbow);W=Vector(wrist)
        make_cc0_wraith_arm(label,S,E,W)
    # Native draping over a hunched torso and the actual upper arms gives the
    # mantle physically connected shoulder folds. Neck seam stays attached;
    # free lower cloth falls across the arm roots and oblique chest panel.
    cowl=simulate_mantle
    pin=cowl.vertex_groups.new(name='Mantle neckline attachment')
    pin.add(list(range(65)),1,'REPLACE');pin.add(list(range(65,130)),.7,'REPLACE')
    # Cloth is gathered onto one raised shoulder; the opposite side retains
    # a longer free drop. This changes the pattern, not just fold frequency.
    gathered=[j*65+i for j in (5,6) for i in (46,47,48)]
    for index in gathered:cowl.data.vertices[index].co.z=1.57
    pin.add(gathered,.8,'REPLACE')
    colliders=[]
    for loc,size in [((-.055,-.09,1.33),(.205,.135,.205)),((-.18,-.11,1.43),(.135,.15,.115)),((.13,-.005,1.35),(.145,.14,.12))]:
        obj=sphere('Temporary shoulder drape collider',loc,size,'shadow',20,12);colliders.append(obj);obj.modifiers.new('Mantle collision','COLLISION')
    for label,S,E,W in gestures:
        obj=sweep('Temporary upper arm drape collider',[S,Vector(S).lerp(Vector(E),.45),E],[.066,.064,.052],sides=12);colliders.append(obj);obj.modifiers.new('Mantle collision','COLLISION')
    scene.frame_set(1);bpy.context.view_layer.objects.active=cowl
    cloth=cowl.modifiers.new('Physically draped shoulder mantle','CLOTH');cloth.settings.quality=8;cloth.settings.mass=.24
    cloth.settings.tension_stiffness=28;cloth.settings.compression_stiffness=28;cloth.settings.shear_stiffness=18;cloth.settings.bending_stiffness=.75
    cloth.settings.vertex_group_mass=pin.name;cloth.settings.air_damping=5
    cloth.collision_settings.distance_min=.006;cloth.collision_settings.collision_quality=7
    cloth.collision_settings.use_self_collision=True;cloth.collision_settings.self_distance_min=.004
    cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=64
    for frame in range(1,65):scene.frame_set(frame);bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active=cowl;bpy.ops.object.modifier_apply(modifier=cloth.name)
    for obj in colliders:bpy.data.objects.remove(obj,do_unlink=True)
    solid=cowl.modifiers.new('Mantle woven thickness','SOLIDIFY');solid.thickness=.008;bpy.ops.object.modifier_apply(modifier=solid.name)
    # An elongated actual skull is partially concealed by an angular collapsed
    # hood. Its orbital hollows are carved into a continuous remeshed volume.
    PART='Head';cx=-.065
    make_cc0_wraith_skull((cx,-.245,1.63))
    for side in (-1,1):sphere('Dim recessed sentinel eye',(cx+side*.038,-.311,1.658),(.006,.0035,.004),'cyan',10,6)
    # Deep unequal hood lip, creased brow and swept peak, never an oval shell.
    verts=[];faces=[];n=48
    rings=[(.14,.056,.105,1.625),(.058,.106,.150,1.688),(-.035,.114,.150,1.668),(-.112,.116,.147,1.650),(-.176,.096,.137,1.615)]
    for r,(depth,rx,rz,zz) in enumerate(rings):
        for i in range(n):
            a=-.62+i/(n-1)*(pi+1.18);peak=.006*math.exp(-((math.atan2(sin(a-pi/2),cos(a-pi/2))+.20)/.35)**2)
            pinch=.021*math.exp(-((a-2.6)/.26)**2)-.022*math.exp(-((a-3.55)/.30)**2)
            pinch+=.012*sin(a*4+r*.5)*sin(pi*r/(len(rings)-1))
            x=cx+(rx+pinch)*cos(a)-.014*sin(a)
            y=-.23+depth+.011*sin(a*3+r*.8)
            z=zz+rz*sin(a)+peak*(.5 if r==0 else 1)-.020*cos(a)
            # Slumped crown folds over the face instead of terminating in a
            # tall leaf tip; creases run towards its asymmetrical brow corners.
            z-=.015*max(0,sin(a))**6*(r/4)
            if r==4:z-=.008*max(0,sin(a))**3
            verts.append((x,y,z))
    faces=[tuple(reversed(range(n)))]
    for j in range(len(rings)-1):
        for i in range(n-1):faces.append((j*n+i,j*n+i+1,(j+1)*n+i+1,(j+1)*n+i))
    # Extend the actual hood's rear lower edge into the back garment.
    # It closes the visible nape opening with connected cloth, not a plug.
    right=Vector(verts[0]);left=Vector(verts[n-1]);previous=(n-1,0)
    for row in range(1,6):
        t=row/5
        ends=[left.lerp(Vector((-.18,.055,1.405)),t),right.lerp(Vector((.055,.07,1.405)),t)]
        current=(len(verts),len(verts)+1);verts.extend(tuple(p) for p in ends)
        faces.append((previous[0],previous[1],current[1],current[0]));previous=current
    hood=skin('Peaked collapsed sentinel hood',verts,faces,'wraithWool',0)
    pin=hood.vertex_groups.new(name='Brow and nape cloth attachments')
    # The edge is open below the cheeks. Anchor only the nape corners and the
    # brow contact; the crown and temple cloth can compress around the head.
    pin.add([len(verts)-2,len(verts)-1],1,'REPLACE')
    pin.add([(len(rings)-1)*n+i for i in range(n)],.90,'REPLACE')
    bpy.context.view_layer.objects.active=hood
    sub=hood.modifiers.new('Hood cloth simulation resolution','SUBSURF');sub.subdivision_type='SIMPLE';sub.levels=2;bpy.ops.object.modifier_apply(modifier=sub.name)
    collider=sphere('Temporary hood cranial collision',(cx,-.230,1.658),(.096,.102,.145),'shadow',24,16);collider.modifiers.new('Head collision','COLLISION')
    scene.frame_set(1);bpy.context.view_layer.objects.active=hood
    cloth=hood.modifiers.new('Native collapsed hood cloth','CLOTH');cloth.settings.quality=8;cloth.settings.mass=.18
    cloth.settings.tension_stiffness=30;cloth.settings.compression_stiffness=30;cloth.settings.shear_stiffness=16;cloth.settings.bending_stiffness=.55
    cloth.settings.vertex_group_mass='Brow and nape cloth attachments';cloth.settings.air_damping=5
    cloth.collision_settings.distance_min=.006;cloth.collision_settings.collision_quality=5
    cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=30
    for frame in range(1,31):scene.frame_set(frame);bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active=hood;bpy.ops.object.modifier_apply(modifier=cloth.name);bpy.data.objects.remove(collider,do_unlink=True)
    mod=hood.modifiers.new('Hood retained cloth topology','DECIMATE');mod.ratio=.40;bpy.ops.object.modifier_apply(modifier=mod.name)
    solid=hood.modifiers.new('Hood woven edge thickness','SOLIDIFY');solid.thickness=.005;bpy.ops.object.modifier_apply(modifier=solid.name)
    smooth(hood)
    from mathutils import Matrix
    hinge=Vector((cx,-.18,1.47));bow=Matrix.Rotation(.20,3,'X')
    for obj in c.objects:
        if obj.type!='MESH' or obj.get('part')!='Head':continue
        inverse=obj.matrix_world.inverted()
        for vertex in obj.data.vertices:vertex.co=inverse@(hinge+bow@(obj.matrix_world@vertex.co-hinge))
    PART='Body'
    # Preserve renderer compatibility and its exact original height/ground range.
    all_points=[obj.matrix_world@v.co for obj in c.objects if obj.type=='MESH' for v in obj.data.vertices]
    low=min(p.z for p in all_points);high=max(p.z for p in all_points)
    for obj in c.objects:
        if obj.type!='MESH':continue
        inverse=obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            p=obj.matrix_world@vertex.co;p.z=.06131713092327118+(p.z-low)/(high-low)*(1.93340003490448-.06131713092327118);vertex.co=inverse@p
    # One continuous main robe belongs to Body; the short shoulder mantle uses
    # the existing Cape part. No new skeleton or renderer hierarchy is added.
    MATS.clear();MATS.update(saved_materials);PART='Body';scene.frame_set(1)
    return c
