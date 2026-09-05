"""Anatomical adventurer, skeletal soldier, wraith and fractured crystal brute."""

def hood_shell(loc=(0,0,1.64),rx=.17,rz=.21,material='teal',long=False):
    x,y,z=loc;verts=[];n=28
    rings=[(y+.13,z+.025,.025,.05),(y+.10,z+.03,rx*.70,rz*.78),(y+.015,z+.015,rx,rz),(y-.145,z,rx*.89,rz*.88)]
    for yy,zz,xxrad,zzrad in rings:
        for i in range(n):
            a=i*2*pi/n
            fold=1+.035*sin(a*5)
            verts.append((x+xxrad*cos(a)*fold,yy,zz+zzrad*sin(a)*fold))
    faces=[tuple(reversed(range(n)))]
    for j in range(len(rings)-1):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    o=mesh('Tailored hollow hood',verts,faces,material);smooth(o)
    mod=o.modifiers.new('Heavy wool thickness','SOLIDIFY');mod.thickness=.009
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    pts=[]
    for i in range(n+1):
        a=i*2*pi/n;fold=1+.035*sin(a*5)
        pts.append((x+rx*.89*cos(a)*fold,y-.15,z+rz*.88*sin(a)*fold))
    line('Hood sewn rolled hem',pts,.008,'tealLight' if material=='teal' else material,6)
    return o

def bone_segment(name,a,b,radius):
    smooth(rod(name,a,b,radius*.75,radius*.70,'bone',10))
    sphere(name+' joint A',a,(radius,radius*.86,radius),'bone',12,8)
    sphere(name+' joint B',b,(radius*.95,radius*.85,radius*.92),'bone',12,8)

def skull(loc=(0,-.02,1.63),size=1):
    x,y,z=loc
    head=sphere('Anatomical skull vault',(x,y,z),(.14*size,.115*size,.175*size),'bone',24,16)
    # True recessed eye sockets, rather than spheres stuck on a cartoon face.
    for side in (-1,1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1,location=(x+side*.059*size,y-.096*size,z+.018*size))
        cutter=bpy.context.object;cutter.scale=(.049*size,.085*size,.043*size);cutter.rotation_euler.y=side*.14
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        bpy.context.view_layer.objects.active=head
        mod=head.modifiers.new('Sculpted eye socket','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
        bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
        sphere('Deep socket darkness',(x+side*.058*size,y-.083*size,z+.017*size),(.036*size,.02*size,.030*size),'shadow',12,8)
        sphere('Soul eye ember',(x+side*.058*size,y-.108*size,z+.017*size),(.012*size,.006*size,.009*size),'cyan',10,6)
        sphere('Zygomatic cheekbone',(x+side*.093*size,y-.075*size,z-.065*size),(.038*size,.05*size,.033*size),'bone',12,8)
    plate('Nasal cavity',[(x-.021*size,y-.116*size,z-.048*size),(x+.021*size,y-.116*size,z-.048*size),(x,y-.126*size,z-.014*size)],.006,'shadow',.001)
    # Separate jaw and little teeth keep the mouth visually open.
    line('Lower mandible',[(x-.086*size,y-.023*size,z-.070*size),(x-.080*size,y-.104*size,z-.143*size),(x,y-.132*size,z-.154*size),(x+.080*size,y-.104*size,z-.143*size),(x+.086*size,y-.023*size,z-.070*size)],.020*size,'bone',8)
    for i in range(6):
        xx=x+(i-2.5)*.017*size
        cube('Upper tooth',(xx,y-.119*size,z-.104*size),(.013*size,.022*size,.027*size),'bone',.003)
        cube('Lower tooth',(xx,y-.12*size,z-.138*size),(.012*size,.020*size,.020*size),'bone',.003)
    return head

def forged_sword(grip,tip,material='steel',glowing=False):
    global PART
    previous=PART;PART='Sword'
    a=Vector(grip);b=Vector(tip);axis=(b-a).normalized()
    cross=Vector((1,.4,0));cross=(cross-axis*cross.dot(axis)).normalized();normal=axis.cross(cross).normalized()
    length=(b-a).length
    def p(t,w,d=0):return tuple(a+axis*t+cross*w+normal*d)
    rod('Leather sword grip',p(-.14,0),p(.005,0),.027,.025,'leather',12)
    for j in range(6):line('Grip binding',[p(-.12+j*.022,-.023),p(-.11+j*.022,.023)],.004,'bronze',5)
    sphere('Sword pommel',p(-.17,0),(.045,.037,.05),'bronze',14,8)
    line('Swept quillons',[p(.02,-.17,.035),p(.012,-.08,0),p(.008,0,0),p(.012,.08,0),p(.02,.17,.035)],.018,'bronze',8)
    verts=[p(.04,-.042),p(.04,.042),p(length*.74,.039),p(length,0),p(length*.74,-.039),p(.06,0,.018),p(length*.72,0,.018)]
    o=mesh('Forged ridged blade',verts,[(0,1,5),(1,2,6,5),(2,3,6),(3,4,6),(4,0,5,6)],material)
    mod=o.modifiers.new('Forged thickness','SOLIDIFY');mod.thickness=.012
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    if glowing:line('Incandescent blade fuller',[p(.10,0,.020),p(length*.73,0,.021),p(length*.91,0,.009)],.007,'amber',6)
    else:line('Blade blood groove',[p(.10,0,.020),p(length*.70,0,.020)],.004,'shadow',4)
    PART=previous

def make_skeleton_v2():
    global PART
    c=begin('skeleton')
    def soldier_bone(name,a,b,radius):bone_segment(name,a,b,radius*(1.28 if name=='Metatarsal' else 1.52))
    # A leaning seven-head-tall skeleton: visible spine, rib arcs, paired forearms.
    for j in range(7):
        z=.92+j*.064
        sphere('Separate vertebra',(0,.025,z),(.043,.047,.035),'bone',12,8)
        rod('Spinal process',(0,.047,z),(0,.09,z-.008),.019,.010,'bone',6)
    for side in (-1,1):
        for j in range(6):
            z=1.35-j*.067;w=.185-j*.017
            pts=[(side*.027,.05,z),(side*w,.023,z-.016),(side*(w+.010),-.068,z-.046),(side*w*.59,-.135,z-.051),(side*.033,-.136,z-.038)]
            line('Curved rib',pts,.024 if j<4 else .020,'bone',8)
        soldier_bone('Clavicle',(side*.018,-.047,1.395),(side*.22,-.015,1.39),.026)
        plate('Pelvic ilium',[(side*.04,.03,.91),(side*.16,.01,.93),(side*.19,-.02,.82),(side*.095,-.09,.765),(side*.028,-.06,.82)],.023,'bone',.007)
        hip=(side*.105,.0,.80);knee=(side*.145,-.05,.45);ankle=(side*.15,.025,.12)
        soldier_bone('Femur',hip,knee,.034)
        soldier_bone('Tibia',knee,ankle,.027)
        soldier_bone('Fibula',(knee[0]+side*.035,knee[1]+.015,knee[2]-.028),(ankle[0]+side*.028,ankle[1],ankle[2]+.016),.018)
        for j in range(4):
            xx=side*.15+(j-1.5)*.023
            soldier_bone('Metatarsal',(xx,.025,.084),(xx,-.14,.045),.014)
        shoulder=(side*.245,.0,1.36);elbow=(side*.335,-.028,1.095);wrist=(side*.39,-.13,.885)
        soldier_bone('Humerus',shoulder,elbow,.033)
        for dx in (-.018,.018):soldier_bone('Paired forearm',(elbow[0]+dx,elbow[1],elbow[2]),(wrist[0]+dx,wrist[1],wrist[2]),.020)
        sphere('Wrist bones',wrist,(.045,.032,.065),'bone',12,8)
        for j in range(4):
            xx=wrist[0]+(j-1.5)*.02
            line('Long curled fingers',[(xx,wrist[1]-.012,wrist[2]-.015),(xx,wrist[1]-.055,wrist[2]-.085),(xx,wrist[1]-.09,wrist[2]-.066)],.009,'bone',6)
    # Broken asymmetrical plate harness, allowing the rib cage to remain visible.
    plate('Left cuirass fragment',[(-.22,-.13,1.365),(-.04,-.165,1.38),(-.035,-.166,1.22),(-.18,-.135,1.13),(-.24,-.09,1.22)],.035,'iron')
    for side in (-1,1):
        x=side*.255
        smooth(ringmesh('Hammered shoulder cap',[(x,-.025,1.30,.13,.112),(x,-.025,1.335,.15,.13),(x,-.015,1.40,.125,.109),(x,-.005,1.43,.07,.06),(x,0,1.44,.015,.012)],'oldArmor',20))
        line('Pauldron rolled border',[(x+.15*cos(pi+j*pi/12),-.025+.13*sin(pi+j*pi/12),1.334) for j in range(13)],.007,'bronze',6)
        for j in range(3):rivet((x+side*(-.045+j*.064),-.152,1.335),.011,'bronze')
        ringmesh('Ancient bracer',[(side*.38,-.11,.91,.045,.042),(side*.36,-.072,1.04,.057,.052)],'iron',10)
    for side in (-1,1):
        x=side*.27
        plate('Skeleton chipped shoulder fragment',[(x-side*.075,-.143,1.36),(x+side*.09,-.13,1.39),(x+side*.155,-.081,1.31),(x+side*.11,-.13,1.24),(x+side*.073,-.152,1.263),(x+side*.052,-.16,1.236),(x-side*.045,-.173,1.29)],.023,'oldArmor',.007)
    plate('Skeleton exposed sternum',[(-.023,-.156,1.371),(.026,-.156,1.371),(.022,-.158,1.17),(0,-.164,1.105),(-.023,-.158,1.17)],.009,'bone',.004)
    line('Leather baldric',[(-.20,-.17,1.38),(-.10,-.18,1.20),(.12,-.09,.97)],.019,'leather',6)
    # Rear armor keeps a readable soldier silhouette when the horde faces inward.
    plate('Weathered rear cuirass',[(-.18,.09,1.36),(.18,.09,1.36),(.17,.115,1.18),(0,.15,1.10),(-.17,.115,1.18)],-.03,'oldArmor',.016)
    ringmesh('Torn leather war belt',[(0,0,.90,.156,.095),(0,0,.955,.15,.098)],'leather',16)
    for side in (-1,1):
        x=side*.15
        plate('Pitted shin guard',[(x-.041,-.04,.18),(x+.047,-.04,.18),(x+.061,-.068,.40),(x,-.10,.455),(x-.061,-.068,.40)],.032,'oldArmor',.009)
        line('Greave worn ridge',[(x,-.079,.19),(x,-.128,.405)],.007,'bronze',5)
    PART='Head'
    skull((0,-.015,1.59))
    # A fractured iron half-helm follows the skull rather than hiding it.
    smooth(ringmesh('Rounded corroded half helm',[(0,-.015,1.69,.148,.125),(0,-.012,1.735,.15,.13),(0,.0,1.795,.105,.085),(0,.005,1.82,.025,.022)],'oldArmor',20))
    line('Helm brow band',[(-.13,-.074,1.693),(-.07,-.128,1.695),(0,-.142,1.695),(.07,-.128,1.695),(.13,-.074,1.693)],.009,'bronze',6)
    PART='Cape'
    cloth_panel('Rotten soldier tabard',(0,.11,1.32),.16,.57,'tealDark',.12,.08,3)
    PART='Body';forged_sword((.40,-.145,.89),(.49,-.51,.16),'steel')
    return c

def make_hero_v2():
    global PART
    c=begin('hero')
    for side in (-1,1):
        x=side*.112
        smooth(rod('Fitted wool trousers',(x,.025,.27),(x,.018,.91),.064,.092,'tealDark',14))
        sphere('Worn boot',(x,-.057,.09),(.084,.16,.091),'leather',18,10)
        ringmesh('Boot cuff',[(x,.005,.14,.086,.081),(x,.005,.30,.084,.077),(x,.005,.34,.093,.085)],'leather',14)
        plate('Curved steel greave',[(x-.068,-.071,.20),(x+.068,-.071,.20),(x+.068,-.055,.48),(x,-.091,.515),(x-.068,-.055,.48)],.027,'iron')
        line('Greave bronze seam',[(x,-.105,.22),(x,-.117,.46),(x,-.105,.51)],.006,'bronze',5)
        plate('Knee shield',[(x-.075,-.089,.535),(x,-.11,.588),(x+.075,-.089,.535),(x,-.11,.49)],.025,'bronze')
        for j in range(4):
            z=.64+j*.057
            plate('Overlapping thigh lame',[(x-.086,-.071,z+.046),(x+.086,-.071,z+.046),(x+.08,-.102,z-.015),(x,-.124,z-.035),(x-.08,-.102,z-.015)],.008,'iron')
            rivet((x-side*.052,-.098,z+.022),.008,'bronze')
    smooth(ringmesh('Tailored padded torso',[(0,.025,.84,.155,.105),(0,.015,1.06,.165,.12),(0,.01,1.30,.215,.125),(0,.014,1.42,.19,.105)],'tealDark',20))
    plate('Chased bronze cuirass',[(-.203,-.09,1.36),(-.09,-.15,1.405),(.09,-.15,1.405),(.203,-.09,1.36),(.15,-.124,1.04),(0,-.165,.99),(-.15,-.124,1.04)],.048,'bronze')
    line('Raised cuirass rim',[(-.203,-.097,1.36),(-.09,-.157,1.405),(.09,-.157,1.405),(.203,-.097,1.36),(.15,-.131,1.04),(0,-.172,.99),(-.15,-.131,1.04),(-.203,-.097,1.36)],.007,'gold',6)
    for side in (-1,1):
        line('Engraved wing scroll',[(side*.025,-.187,1.13),(side*.09,-.182,1.19),(side*.08,-.180,1.26),(side*.14,-.149,1.32)],.004,'gold',5)
        for z in (1.12,1.23,1.34):rivet((side*.146,-.143,z),.008,'gold')
        shoulder=(side*.235,.015,1.34);elbow=(side*.29,-.037,1.13);hand=(side*.33,-.18,1.05 if side>0 else .985)
        smooth(rod('Wool sleeve',shoulder,elbow,.075,.064,'teal',14))
        smooth(rod('Leather forearm',elbow,hand,.069,.049,'leather',14))
        ringmesh('Flared armored bracer',[(side*.325,-.131,1.0,.060,.058),(side*.3,-.061,1.115,.075,.071)],'iron',12)
        sphere('Articulated gauntlet',hand,(.050,.056,.061),'iron',14,8)
        for j in range(3):
            sx=side*(.222+j*.033);z=1.389-j*.029
            plate('Shoulder overlapping shell',[(sx-side*.085,-.037,z),(sx+side*.060,.018,z+.015),(sx+side*.13,-.020,z-.04),(sx+side*.092,-.10,z-.09),(sx-side*.053,-.113,z-.077)],.030,'bronze' if j==0 else 'iron',.008)
        for j in range(3):rivet((side*(.23+j*.043),-.107,1.331-j*.011),.008)
    # Belts, pouches and overlapping faulds break up the waist.
    ringmesh('Wide leather belt',[(0,.01,.94,.177,.133),(0,.01,1.0,.178,.135)],'leather',18)
    cube('Belt buckle',(0,-.144,.975),(.075,.023,.060),'bronze',.009)
    cube('Buckle hollow',(0,-.159,.975),(.039,.010,.028),'shadow',.004)
    sphere('Belt satchel',(-.203,.049,.915),(.07,.068,.094),'leather',16,10)
    for side in (-1,1):
        for j in range(3):
            z=.87+j*.035
            plate('Hip fauld',[(side*.09,-.06,z+.033),(side*.21,-.03,z+.025),(side*.23,-.048,z-.042),(side*.11,-.083,z-.049)],.006,'bronze',.005)
    PART='Head';hood_shell((0,.01,1.636),.155,.198)
    sphere('Recessed face shadow',(0,-.092,1.63),(.11,.027,.15),'shadow',18,12)
    # Only the lower visor is visible inside a shaded hood; no giant glowing orb.
    plate('Dark bronze half mask',[(-.09,-.129,1.62),(0,-.148,1.645),(.09,-.129,1.62),(.072,-.13,1.54),(0,-.151,1.513),(-.072,-.13,1.54)],.012,'bronze',.003)
    for side in (-1,1):line('Narrow eye slit',[(side*.035,-.128,1.662),(side*.069,-.119,1.663)],.0035,'flame',5)
    PART='Cape'
    cloth_panel('Heavy flowing split cloak',(0,.122,1.405),.275,1.12,'teal',.35,.075,5)
    for side in (-1,1):
        line('Cloak worn embroidered edge',[(side*.18,.134,1.405),(side*.22,.25,1.07),(side*.25,.37,.70),(side*.271,.47,.32)],.005,'bronze',5)
    PART='Body';forged_sword((.345,-.19,1.05),(.95,-.61,1.72),'steel',True)
    # Authored contrapposto: bent advancing knee, counter-rotated shoulder line,
    # slight forward lean, and cloak swept across the rear silhouette.
    for o in c.objects:
        if o.type!='MESH':continue
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);o.select_set(False)
        for v in o.data.vertices:
            p=o.matrix_world@v.co;x,y,z=p
            if z<.94:
                bend=sin(max(0,min(1,z/.94))*pi)
                y-=.055*bend
                y+=(-.072 if x>0 else .036)*max(0,1-z/.94)
                x+=.024*(1 if x>0 else -1)*max(0,1-z/.94)
            turn=-.12*max(0,min(1,(z-.91)/.43))
            x,y=x*cos(turn)-y*sin(turn),x*sin(turn)+y*cos(turn)
            x-=.035*max(0,min(1,(z-.92)/.45))
            y-=.021*max(0,min(1,(z-1.1)/.5))
            if o.get('part')=='Cape':
                t=max(0,min(1,(1.405-z)/1.12));x+=.22*t*t;y+=.055*sin(t*pi)
            v.co=o.matrix_world.inverted()@Vector((x,y,z))
    return c

def make_wraith_v2():
    global PART
    c=begin('wraith')
    # Open-front layered robe with sinuous tattered skirt, not a cone silhouette.
    verts=[];nx=36;ny=20
    for j in range(ny+1):
        t=j/ny;z=1.52-1.43*t;rx=.20-.035*sin(t*pi)+.18*t*t;ry=.15+.10*t
        for i in range(nx+1):
            a=-pi/2+.44+(2*pi-.88)*i/nx
            fold=.024*sin(a*7+t*.9)+.010*sin(a*13-t*2)
            zz=z
            if j==ny:zz+=.16*(.5+.5*sin(a*6.7))+.035*cos(a*11)
            verts.append(((rx+fold)*cos(a),(ry+fold)*sin(a)+.10*t,zz))
    faces=[]
    for j in range(ny):
        for i in range(nx):
            if j>=ny-2 and i in (3,4,16,26):continue
            v=j*(nx+1)+i;faces.append((v,v+1,v+nx+2,v+nx+1))
    robe=mesh('Tattered wraith robe',verts,faces,'tealDark');smooth(robe)
    mod=robe.modifiers.new('Threadbare cloth edges','SOLIDIFY');mod.thickness=.008
    bpy.context.view_layer.objects.active=robe;bpy.ops.object.modifier_apply(modifier=mod.name)
    for side in (-1,1):
        shoulder=(side*.22,-.01,1.43);elbow=(side*.32,-.075,1.20);hand=(side*.43,-.19,1.25)
        bone_segment('Emerging wraith arm',shoulder,elbow,.029)
        bone_segment('Skeletal forearm',elbow,hand,.024)
        for j in range(4):
            xx=hand[0]+(j-1.5)*.018
            line('Long spellcasting claw',[(xx,hand[1],hand[2]),(xx+side*.01,hand[1]-.09,hand[2]+.018),(xx+side*.028,hand[1]-.125,hand[2]-.033)],.008,'bone',6)
        # Hanging sleeve tatters run behind raised forearms.
        panel=cloth_panel('Trailing torn sleeve',(side*.25,.015,1.43),.13,.66,'tealDark',.13,.13,3)
        panel.rotation_euler.y=side*.14
        plate('Wraith iron shoulder',[(side*.12,-.11,1.48),(side*.27,-.05,1.53),(side*.35,-.06,1.42),(side*.27,-.15,1.34)],.024,'iron',.007)
    PART='Head';hood_shell((0,-.013,1.67),.18,.24,'tealDark')
    sphere('Hollow hood darkness',(0,-.116,1.656),(.131,.04,.18),'shadow',18,12)
    for side in (-1,1):line('Wraith soul eye',[(side*.045,-.163,1.68),(side*.085,-.146,1.675)],.006,'cyan',6)
    PART='Cape';cloth_panel('Long wraith mantle',(0,.14,1.48),.31,1.34,'tealDark',.30,.14,5)
    return c

def guardian_granite_materials():
    # Granite uses broad uncracked cleavage faces and patchy grain. Major faults
    # are sparse authored geometry on selected masses, never a closed-cell grid.
    for key,label,base in [('stoneOld','fractured grey granite',(.17,.185,.175)),('stoneOldLight','fresh granite cleavage',(.28,.30,.28)),('stoneOldDark','deep granite recess',(.085,.097,.090))]:
        m=source_material(label,base,'stone',0,.90)
        nodes=m.node_tree.nodes;links=m.node_tree.links
        p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
        position=next(n for n in nodes if n.type=='NEW_GEOMETRY')
        pits=nodes.new('ShaderNodeTexNoise');pits.inputs['Scale'].default_value=43;pits.inputs['Detail'].default_value=2
        links.new(position.outputs['Position'],pits.inputs['Vector'])
        ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.30;ramp.color_ramp.elements[0].color=(.22,.22,.22,1)
        ramp.color_ramp.elements[1].position=.43;ramp.color_ramp.elements[1].color=(1,1,1,1)
        links.new(pits.outputs['Fac'],ramp.inputs[0])
        mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.32
        links.new(p.inputs['Base Color'].links[0].from_socket,mix.inputs[1]);links.new(ramp.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],p.inputs['Base Color'])
        bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.45;bump.inputs['Distance'].default_value=.009
        links.new(ramp.outputs[0],bump.inputs['Height']);links.new(p.inputs['Normal'].links[0].from_socket,bump.inputs['Normal']);links.new(bump.outputs['Normal'],p.inputs['Normal'])
        MATS[key]=m

def guardian_rock(name,loc,size,material='stoneOld',turn=(0,0,0)):
    # A thick, closed granite chunk: several true oblique cuts expose broad
    # cleavage planes on front, back and silhouette. No smooth rounded normals.
    import bmesh
    o=ico(name,loc,(1,1,1),material,2,.13)
    bm=bmesh.new();bm.from_mesh(o.data)
    cuts=[((.13,-1,.18),.66),((-.19,1,.11),.72),((.21,.13,1),.78),((1,.23,-.11),.82),((-1,-.17,.22),.79)]
    for _ in range(3):
        normal=Vector((random.uniform(-1,1),random.uniform(-1,1),random.uniform(-.8,1))).normalized()
        cuts.append((normal,random.uniform(.67,.88)))
    for normal,distance in cuts:
        n=Vector(normal).normalized()
        result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=n*distance,plane_no=n,clear_outer=True,clear_inner=False)
        edge_loop=[edge for edge in result['geom_cut'] if isinstance(edge,bmesh.types.BMEdge) and edge.is_boundary]
        if edge_loop:bmesh.ops.holes_fill(bm,edges=edge_loop,sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for v in bm.verts:v.co=Vector((v.co.x*size[0],v.co.y*size[1],v.co.z*size[2]))
    bm.to_mesh(o.data);bm.free();o.rotation_euler=turn
    # Narrow edge wear catches firelight while broad faces stay substantial.
    bevel(o,min(size)*.026,1)
    for face in o.data.polygons:face.use_smooth=False
    # A few interrupted directional faults on true cleavage faces. Most of each
    # boulder remains uncracked. These inherit the same articulated joint.
    selected=any(word in name.lower() for word in ('shoulder','pectoral','forearm','back','scapular','cranium'))
    if selected and min(size)>.14:
        from mathutils import Euler
        rear=any(word in name.lower() for word in ('back','scapular'))
        rotation=Euler(turn).to_matrix();origin=Vector(loc)
        def on_face(x,z):
            yy=(.72*Vector((-.19,1,.11)).length+.19*x-.11*z+.006) if rear else (-.66*Vector((.13,-1,.18)).length+.13*x+.18*z-.006)
            return tuple(origin+rotation@Vector((x*size[0],yy*size[1],z*size[2])))
        direction=-1 if random.random()<.5 else 1
        paths=[[(-.45,-.30*direction),(-.19,-.17*direction),(-.08,.08*direction),(.13,.12*direction)],[(.20,.16*direction),(.34,.29*direction),(.43,.45*direction)]]
        for points in paths:line('Broken granite fault',[on_face(x,z) for x,z in points],min(size)*.022,'shadow',5)
        if random.random()<.55:line('Branching mineral fracture',[on_face(-.08,.08*direction),on_face(-.22,.32*direction),on_face(-.19,.46*direction)],min(size)*.014,'shadow',5)
    return o

def guardian_crystal(name,loc,radius,height,tilt=(0,0,0)):
    # Opaque quartz facets get mineral color, not full-face emissive white stripes.
    # A single thin fissure carries the cyan light through the stone.
    from mathutils import Euler
    if 'guardianQuartz' not in MATS:
        mat('guardianQuartz',(.020,.145,.20),.22,.34)
        mat('guardianQuartzEdge',(.045,.285,.34),.18,.39)
    o=ringmesh(name,[(0,0,0,radius*.65,radius*.65),(0,0,height*.16,radius,radius),(0,0,height*.75,radius*.80,radius*.80),(radius*.20,0,height,0,0)],'guardianQuartz',5)
    o.location=loc;o.rotation_euler=tilt;o.data.materials.append(MATS['guardianQuartzEdge'])
    for face in o.data.polygons:
        if face.index%5==1:face.material_index=1
    bevel(o,min(radius*.024,.002),1)
    if height>.40:
        transform=Euler(tilt).to_matrix();origin=Vector(loc)
        line(name+' mineral glint',[tuple(origin+transform@Vector((radius*.78,-radius*.55,height*.19))),tuple(origin+transform@Vector((radius*.64,-radius*.44,height*.70))),tuple(origin+transform@Vector((radius*.20,0,height*.97)))],.0025,'cyan',4)
    return o

def make_guardian_v2():
    global PART
    guardian_granite_materials()
    c=begin('guardian')
    # Preserve named joint ownership through atlas baking. This allows overlapping
    # shoulder/back masses without guessing their attachments from centroids.
    c['enemyPivots']={'Body':(0,.08,1.18),'Head':(0,-.13,1.83)}
    for label,side in [('L',-1),('R',1)]:
        c['enemyPivots']['ArmUpper'+label]=(side*.60,.04,1.70)
        c['enemyPivots']['ArmLower'+label]=(side*.80,-.06,1.15)
        c['enemyPivots']['LegUpper'+label]=(side*.27,.04,.86)
        c['enemyPivots']['LegLower'+label]=(side*.36,-.08,.46)
    PART='Body'
    guardian_rock('Hunched granite torso',(0,.11,1.36),(.43,.30,.52),'stoneOldDark')
    guardian_rock('Broad curved back',(0,.23,1.64),(.45,.28,.32),'stoneOld')
    guardian_rock('Compact stone pelvis',(0,.05,.89),(.34,.25,.23),'stoneOldDark')
    for side in (-1,1):
        guardian_rock('Curved pectoral mass',(side*.22,-.16,1.53),(.28,.21,.29),'stoneOldLight' if side<0 else 'stoneOld',(.08,side*.15,side*.12))
        guardian_rock('Scapular bedrock',(side*.27,.31,1.63),(.26,.17,.28),'stoneOld',(.1,side*.2,side*.18))
        guardian_rock('Lower dorsal rock',(side*.22,.29,1.29),(.22,.17,.21),'stoneOldDark')
        line('Exposed breast fault',[(side*.04,-.348,1.72),(side*.12,-.375,1.62),(side*.12,-.379,1.51),(side*.23,-.355,1.43)],.006,'cyan',5)
        for j in range(2):
            guardian_crystal('Crystals between shoulder blades',(side*(.13+j*.13),.38,1.79-j*.12),.067,.36+j*.11,(-.35,side*.45,.2))
    for j in range(3):
        guardian_rock('Rounded abdominal course',(0,-.20,1.06+j*.15),(.25-j*.012,.15,.115),'stoneOld' if j%2 else 'stoneOldDark')
    for label,side in [('L',-1),('R',1)]:
        PART='LegUpper'+label
        guardian_rock('Heavy upper leg',(side*.29,.045,.75),(.185,.21,.25),'stoneOldDark')
        guardian_rock('Outer thigh shield',(side*.34,-.09,.76),(.19,.19,.22),'stoneOld',(.12,side*.12,0))
        PART='LegLower'+label
        guardian_rock('Rounded knee',(side*.36,-.095,.47),(.18,.19,.16),'stoneOldLight')
        guardian_rock('Short planted shin',(side*.365,-.015,.29),(.17,.17,.235),'stoneOld')
        guardian_rock('Broad heel',(side*.36,-.07,.12),(.205,.245,.12),'stoneOldDark')
        for j in range(3):
            guardian_rock('Separated worn stone toe',(side*.36+(j-1)*.12,-.255,.10),(.078,.145,.085),'stoneOld',(.08,0,(j-1)*.08))
        PART='ArmUpper'+label
        guardian_rock('Massive shoulder',(side*.60,.035,1.71),(.31,.29,.33),'stoneOld',(.12,side*.18,side*.17))
        guardian_rock('Exposed shoulder shelf',(side*.66,-.065,1.85),(.29,.24,.17),'stoneOldLight',(.04,side*.22,0))
        guardian_rock('Upper arm hanging boulder',(side*.72,.015,1.40),(.205,.20,.30),'stoneOldDark',(0,side*.17,0))
        for j in range(3):
            guardian_crystal('Shoulder crystal growth',(side*(.48+j*.14),.08+j*.035,1.94-j*.055),.092-j*.012,.60-j*.11+(.10 if side<0 else 0),(.12,side*(.2+j*.29),.15*j))
        for j in range(2):
            guardian_crystal('Split companion shoulder shard',(side*(.54+j*.23),-.025+j*.13,1.93-j*.10),.039+j*.012,.18+j*.12+(.035 if side>0 else 0),(-.28+j*.53,side*(.75-j*.39),side*(.43+j*.36)))
        PART='ArmLower'+label
        guardian_rock('Deep elbow joint',(side*.80,-.04,1.16),(.19,.185,.18),'stoneOldDark')
        guardian_rock('Oversized forearm',(side*.845,-.115,1.035),(.25,.255,.31),'stoneOld',(0,side*.08,side*.08))
        guardian_rock('Outer forearm crag',(side*.97,-.075,1.10),(.155,.18,.235),'stoneOldLight',(0,side*.20,0))
        guardian_rock('Heavy clenched fist',(side*.865,-.235,.81),(.25,.24,.195),'stoneOldDark')
        for j in range(3):
            guardian_rock('Rounded granite knuckle',(side*.865+(j-1)*.13,-.405,.835),(.088,.095,.12),'stoneOld')
        guardian_rock('Curled stone thumb',(side*.68,-.295,.79),(.10,.12,.14),'stoneOld',(0,side*.4,0))
        guardian_crystal('Forearm mineral seam',(side*1.015,-.04,1.10),.079,.42,(.3,side*.70,0))
        line('Glowing forearm fault',[(side*.89,-.37,1.23),(side*.84,-.38,1.12),(side*.88,-.39,1.02)],.006,'cyan',5)
    PART='Head'
    guardian_rock('Low stone cranium',(0,-.13,2.01),(.23,.205,.235),'stoneOld',(0,.08,0))
    guardian_rock('Heavy broad jaw',(0,-.235,1.84),(.205,.15,.125),'stoneOldLight')
    guardian_rock('Recessed face bridge',(0,-.303,1.975),(.05,.078,.115),'stoneOld')
    for side in (-1,1):
        guardian_rock('Heavy arched brow',(side*.115,-.265,2.075),(.135,.105,.072),'stoneOldLight',(0,side*.16,side*.16))
        sphere('Recessed guardian eye socket',(side*.097,-.301,2.014),(.069,.025,.04),'shadow',12,8)
        sphere('Blue mineral eye',(side*.092,-.326,2.014),(.025,.009,.016),'cyan',12,8)
        guardian_rock('Cheek and temple',(side*.169,-.248,1.952),(.091,.103,.122),'stoneOld',(0,side*.3,0))
    line('Jagged dark mouth seam',[(-.12,-.353,1.867),(-.04,-.377,1.859),(0,-.38,1.873),(.07,-.37,1.858),(.13,-.344,1.875)],.009,'shadow',5)
    PART='Body'
    return c
