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
    # A leaning seven-head-tall skeleton: visible spine, rib arcs, paired forearms.
    for j in range(7):
        z=.92+j*.064
        sphere('Separate vertebra',(0,.025,z),(.043,.047,.035),'bone',12,8)
        rod('Spinal process',(0,.047,z),(0,.09,z-.008),.019,.010,'bone',6)
    for side in (-1,1):
        for j in range(6):
            z=1.35-j*.067;w=.185-j*.017
            pts=[(side*.027,.05,z),(side*w,.023,z-.016),(side*(w+.010),-.068,z-.046),(side*w*.59,-.135,z-.051),(side*.033,-.136,z-.038)]
            line('Curved rib',pts,.015 if j<4 else .012,'bone',8)
        bone_segment('Clavicle',(side*.018,-.047,1.395),(side*.22,-.015,1.39),.026)
        plate('Pelvic ilium',[(side*.04,.03,.91),(side*.16,.01,.93),(side*.19,-.02,.82),(side*.095,-.09,.765),(side*.028,-.06,.82)],.023,'bone',.007)
        hip=(side*.105,.0,.80);knee=(side*.145,-.05,.45);ankle=(side*.15,.025,.12)
        bone_segment('Femur',hip,knee,.034)
        bone_segment('Tibia',knee,ankle,.027)
        bone_segment('Fibula',(knee[0]+side*.035,knee[1]+.015,knee[2]-.028),(ankle[0]+side*.028,ankle[1],ankle[2]+.016),.018)
        for j in range(4):
            xx=side*.15+(j-1.5)*.023
            bone_segment('Metatarsal',(xx,.025,.084),(xx,-.14,.045),.014)
        shoulder=(side*.245,.0,1.36);elbow=(side*.335,-.028,1.095);wrist=(side*.39,-.13,.885)
        bone_segment('Humerus',shoulder,elbow,.033)
        for dx in (-.018,.018):bone_segment('Paired forearm',(elbow[0]+dx,elbow[1],elbow[2]),(wrist[0]+dx,wrist[1],wrist[2]),.020)
        sphere('Wrist bones',wrist,(.045,.032,.065),'bone',12,8)
        for j in range(4):
            xx=wrist[0]+(j-1.5)*.02
            line('Long curled fingers',[(xx,wrist[1]-.012,wrist[2]-.015),(xx,wrist[1]-.055,wrist[2]-.085),(xx,wrist[1]-.09,wrist[2]-.066)],.009,'bone',6)
    # Broken asymmetrical plate harness, allowing the rib cage to remain visible.
    plate('Left cuirass fragment',[(-.22,-.13,1.365),(-.04,-.165,1.38),(-.035,-.166,1.22),(-.18,-.135,1.13),(-.24,-.09,1.22)],.035,'iron')
    for side in (-1,1):
        x=side*.255
        plate('Old angular pauldron',[(x-side*.12,-.045,1.415),(x+side*.065,-.015,1.445),(x+side*.155,-.04,1.35),(x+side*.10,-.15,1.27),(x-side*.07,-.18,1.30)],.035,'iron')
        line('Pauldron rolled border',[(x-side*.07,-.182,1.30),(x+side*.10,-.153,1.27),(x+side*.155,-.042,1.35)],.009,'bronze',6)
        for j in range(3):rivet((x+side*(-.045+j*.064),-.152,1.335),.011,'bronze')
        ringmesh('Ancient bracer',[(side*.38,-.11,.91,.045,.042),(side*.36,-.072,1.04,.057,.052)],'iron',10)
    line('Leather baldric',[(-.20,-.17,1.38),(-.10,-.18,1.20),(.12,-.09,.97)],.019,'leather',6)
    PART='Head'
    skull((0,-.015,1.59))
    # A fractured iron half-helm follows the skull rather than hiding it.
    plate('Broken nasal helm',[(-.12,.02,1.76),(0,-.01,1.815),(.12,.02,1.76),(.108,-.09,1.69),(0,-.145,1.72),(-.108,-.09,1.69)],.013,'iron')
    line('Helm brow band',[(-.117,-.087,1.70),(0,-.139,1.72),(.117,-.087,1.70)],.012,'bronze',6)
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

def make_guardian_v2():
    global PART
    c=begin('guardian')
    # An anatomical dark core supports asymmetric rough armor slabs.
    ico('Fractured dark stone torso',(0,.07,1.39),(.405,.25,.55),'stoneDark',2,.095)
    # The camera often sees the back. Cover it with actual projecting slabs,
    # rather than leaving the smooth anatomical core as the dominant silhouette.
    for side in (-1,1):
        plate('Rear scapular monolith',[(side*.035,.22,1.90),(side*.38,.18,1.87),(side*.52,.18,1.67),(side*.40,.34,1.43),(side*.095,.38,1.47)],-.115,'stone',.014)
        for j in range(3):
            z=1.13+j*.145
            plate('Overlapping dorsal bedrock',[(side*.025,.30,z+.15),(side*.30,.25,z+.12),(side*.41,.20,z-.05),(side*.22,.36,z-.095),(side*.015,.39,z-.015)],-.07,'stoneDark' if j==0 else 'stone',.011)
        plate('Rear shoulder cliff',[(side*.43,.11,1.91),(side*.66,.06,1.90),(side*.85,.09,1.69),(side*.73,.31,1.48),(side*.48,.29,1.65)],-.11,'stoneLight',.013)
        plate('Rear forearm split slab',[(side*.65,.06,1.39),(side*.86,.055,1.39),(side*.995,.03,1.10),(side*.93,.11,.94),(side*.72,.13,1.03)],-.085,'stone',.012)
    for side in (-1,1):
        hip=(side*.28,.035,.90);knee=(side*.34,-.02,.51);ankle=(side*.34,.03,.17)
        smooth(rod('Massive leg core',hip,knee,.165,.13,'stoneDark',14))
        smooth(rod('Lower leg core',knee,ankle,.135,.12,'stoneDark',12))
        for j in range(3):
            z=.64+j*.105
            plate('Thigh overlapping bedrock',[(side*.16,-.13,z+.08),(side*.39,-.12,z+.09),(side*.46,-.12,z-.06),(side*.24,-.18,z-.10)],.07,'stone',.02)
        plate('Shin monolith',[(side*.21,-.07,.18),(side*.48,-.07,.18),(side*.46,-.10,.49),(side*.30,-.18,.56),(side*.19,-.10,.46)],.10,'stone',.025)
        for j in range(3):
            x=side*.34+(j-1)*.085
            worn_block('Broad chiselled toe',(x,-.18,.095),(.094,.33,.16),'stoneDark',.012,.024)
        shoulder=(side*.57,.055,1.74);elbow=(side*.76,-.012,1.26);wrist=(side*.80,-.15,.92)
        smooth(rod('Upper arm stone tendon',shoulder,elbow,.17,.12,'stoneDark',14))
        smooth(rod('Forearm stone tendon',elbow,wrist,.13,.17,'stoneDark',12))
        for j in range(3):
            x=side*(.48+j*.115);z=1.88-j*.065
            plate('Layered shoulder bedrock',[(x-side*.13,.05,z),(x+side*.13,.05,z-.03),(x+side*.21,-.02,z-.19),(x+side*.07,-.23,z-.26),(x-side*.15,-.22,z-.15)],.08,'stone' if j%2 else 'stoneLight',.027)
        for j in range(2):
            z=1.06+j*.16
            plate('Forearm fractured armor',[(side*.65,-.12,z+.13),(side*.83,-.08,z+.17),(side*.98,-.12,z-.03),(side*.89,-.29,z-.11),(side*.68,-.28,z-.07)],.06,'stone',.022)
        sphere('Knuckle core',wrist,(.18,.17,.16),'stoneDark',16,10)
        for j in range(4):
            x=side*.80+(j-1.5)*.072
            worn_block('Stone clenched finger',(x,-.24,.875),(.080,.17,.22),'stone',.018,.023)
        # Unbalanced angular crystals grow between plates, rather than a toy crown.
        for j in range(4):detailed_crystal('Embedded shoulder shard',(side*(.44+j*.10),.04+j*.035,1.93-j*.046),.053+random.random()*.028,.18+random.random()*.36,(random.uniform(-.25,.31),side*(.08+j*.15),random.random()*2))
        detailed_crystal('Ulna crystal',(side*.9,-.015,1.23),.070,.37,(.2,side*.72,0))
        line('Thin breast fracture',[(side*.045,-.29,1.64),(side*.15,-.35,1.55),(side*.26,-.29,1.51),(side*.31,-.23,1.35)],.008,'cyan',6)
    plate('Left fractured breastplate',[(-.47,-.16,1.79),(-.06,-.29,1.82),(-.05,-.35,1.52),(-.17,-.35,1.29),(-.40,-.21,1.40)],.05,'stoneLight',.025)
    plate('Right fractured breastplate',[(.04,-.29,1.82),(.44,-.14,1.76),(.44,-.22,1.42),(.12,-.36,1.29),(.075,-.36,1.54)],.06,'stone',.021)
    for j in range(3):
        z=1.07+j*.115
        plate('Layered abdominal slab',[(-.23,-.17,z+.06),(.22,-.17,z+.06),(.19,-.23,z-.045),(0,-.29,z-.09),(-.20,-.23,z-.045)],.026,'stoneDark',.014)
    PART='Head'
    ico('Sculpted stone cranium',(0,-.040,2.045),(.235,.185,.245),'stoneDark',2,.10)
    ico('Heavy fractured jaw',(0,-.164,1.906),(.195,.149,.119),'stone',1,.09)
    plate('Massive broken chin',[(-.17,-.205,1.96),(-.11,-.296,1.925),(.10,-.299,1.931),(.18,-.22,1.95),(.10,-.254,1.82),(-.115,-.244,1.835)],.035,'stone',.012)
    plate('Rear skull crest',[(-.16,.069,2.22),(.095,.099,2.27),(.225,.088,2.08),(.13,.165,1.973),(-.13,.166,1.991),(-.22,.068,2.08)],-.045,'stone',.012)
    plate('Left jagged brow',[(-.225,-.143,2.17),(-.129,-.218,2.205),(-.022,-.229,2.141),(-.03,-.273,2.093),(-.149,-.258,2.12),(-.206,-.20,2.07)],.024,'stoneLight',.014)
    plate('Right broken brow',[(.014,-.217,2.164),(.12,-.192,2.195),(.222,-.118,2.134),(.199,-.201,2.071),(.087,-.269,2.09),(.022,-.265,2.065)],.032,'stone',.015)
    for side in (-1,1):
        sphere('Deep set stone eye hollow',(side*.094,-.211,2.066),(.072,.026,.041),'shadow',16,10)
        line('Guardian cyan eye',[(side*.051,-.247,2.061),(side*.127,-.234,2.083)],.008,'cyan',7)
        plate('Sculpted cheekbone',[(side*.18,-.161,2.087),(side*.22,-.12,2.028),(side*.142,-.237,1.93),(side*.049,-.242,1.972),(side*.055,-.225,2.02)],.020,'stone',.015)
    line('Broken jaw crevice',[(-.132,-.242,1.935),(-.064,-.267,1.926),(-.027,-.278,1.947),(.047,-.273,1.932),(.121,-.242,1.948)],.009,'shadow',5)
    for j in range(3):
        x=(j-1)*.107
        detailed_crystal('Broken crown growth',(x,.075,2.23),.043+.019*(j%2),.20+.11*(j%2),(.30-j*.19,x*2.3,random.random()*2))
    return c
