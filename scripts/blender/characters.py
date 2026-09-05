"""Hand-authored character silhouettes with separated cape, weapon and shoulders."""

def make_hero():
    global PART
    c=begin('hero')
    # Wide planted boots and layered cuisses establish a compact dungeon silhouette.
    for side in (-1,1):
        x=side*.145
        rod('Wool trousers',(x,.02,.30),(x,.03,.89),.092,.12,'tealDark')
        cube('Sabatons',(x,-.08,.10),(.21,.36,.20),'iron',.045)
        cube('Toe gilt',(x,-.225,.13),(.18,.06,.09),'bronze',.022)
        o=ringmesh('Greave',[(x,0,.18,.105,.115),(x,0,.40,.092,.105),(x,-.01,.52,.115,.13)],'bronze',8)
        ico('Knee guard',(x,-.11,.51),(.12,.06,.14),'gold',1)
        for z in (.70,.78,.86):
            o=cube('Overlapping thigh lamella',(x,-.10,z),(.22,.10,.115),'bronze',.017)
            o.rotation_euler.y=side*.1
    ringmesh('Padded cuirass',[(0,0,.82,.23,.16),(0,0,1.08,.25,.18),(0,0,1.34,.34,.18),(0,0,1.40,.22,.15)],'tealDark')
    # Angular breastplate, central raised ridge and inset enamel.
    verts=[(-.27,-.16,1.34),(.27,-.16,1.34),(.21,-.20,1.05),(0,-.24,.97),(-.21,-.20,1.05),(0,-.27,1.25)]
    mesh('Bronze breastplate',verts,[(0,1,5),(1,2,5),(2,3,5),(3,4,5),(4,0,5)],'bronze')
    line('Cuirass chased edging',[verts[i] for i in (0,1,2,3,4,0)],.013,'gold')
    mesh('Enamel heraldry',[(-.12,-.263,1.30),(.12,-.263,1.30),(0,-.276,1.10)],[(0,1,2)],'tealLight')
    ico('Heart clasp',(0,-.285,1.26),(.048,.025,.065),'cyan',1)
    cube('Leather belt',(0,-.005,.95),(.50,.34,.085),'leather')
    cube('Sun buckle',(0,-.192,.95),(.115,.045,.11),'gold',.013)
    cube('Buckle inset',(0,-.22,.95),(.063,.01,.056),'tealDark',.006)
    for x in (-.265,.265):cube('Hip pouch',(x,.09,.93),(.14,.18,.21),'leather',.033)
    for side in (-1,1):
        # Slightly asymmetric action-ready arms; not a T pose.
        shoulder=(side*.33,0,1.29); elbow=(side*.43,-.04,1.06); hand=(side*.47,-.21,.97 if side<0 else 1.05)
        rod('Sleeve',shoulder,elbow,.12,.105,'teal')
        rod('Arm bracer',elbow,hand,.11,.085,'bronze')
        ico('Gauntlet',hand,(.09,.085,.11),'iron',2)
        for layer in range(3):
            ico('Layered shoulder plate',(side*(.32+layer*.045),.01,1.35-layer*.045),(.19-layer*.024,.19,.10),'bronze' if layer else 'gold',2)
        ico('Pauldron enamel',(side*.37,-.01,1.425),(.10,.11,.016),'teal',2)
    PART='Head'
    # Deep open hood built as an elliptical shell, with an angular bronze visor.
    verts=[];n=20
    rings=[(.15,1.60,.045,.08),(.095,1.61,.20,.22),(-.04,1.61,.245,.255),(-.215,1.60,.213,.225)]
    for y,z,rx,rz in rings:
        verts += [(rx*cos(i*2*pi/n),y,z+rz*sin(i*2*pi/n)) for i in range(n)]
    faces=[]
    for j in range(3):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    faces.append(tuple(reversed(range(n))))
    hood=mesh('Sculpted open hood',verts,faces,'teal')
    for poly in hood.data.polygons:poly.use_smooth=True
    solid=hood.modifiers.new('Cloth thickness','SOLIDIFY');solid.thickness=.02
    bpy.context.view_layer.objects.active=hood;bpy.ops.object.modifier_apply(modifier=solid.name)
    line('Hood gold seam',[(.216*cos(i*2*pi/n),-.222,1.60+.228*sin(i*2*pi/n)) for i in range(n+1)],.009,'gold')
    ico('Face darkness',(0,-.16,1.59),(.177,.055,.19),'shadow',2)
    mesh('Angular faceplate',[(-.14,-.226,1.62),(-.065,-.252,1.65),(0,-.275,1.62),(.065,-.252,1.65),(.14,-.226,1.62),(.115,-.23,1.49),(0,-.28,1.455),(-.115,-.23,1.49)],[(0,1,2,6,7),(2,3,4,5,6)],'bronze')
    for x in (-.076,.076):
        eye=cube('Warm eye slit',(x,-.257,1.638),(.052,.011,.014),'flame',.005)
        eye.rotation_euler.y=-.15 if x<0 else .15
    # Cloth cape has scalloped hem and longitudinal folds, visible from above.
    PART='Cape'
    verts=[];nx=16;ny=10
    for j in range(ny+1):
        t=j/ny
        for i in range(nx+1):
            u=i/nx*2-1
            w=.23+.16*t
            x=u*w
            y=.15+.39*t+.055*sin(u*4*pi)*t
            z=1.38-1.0*t+.05*sin(u*4*pi)*t+.075*(u*u)*t
            verts.append((x,y,z))
    faces=[]
    for j in range(ny):
        for i in range(nx):
            a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
    cape=mesh('Folded flowing cape',verts,faces,'teal')
    cape.data.materials.append(MATS['tealLight'])
    for p in cape.data.polygons:
        if p.index%nx in (2,3,10,11):p.material_index=1
    for u in (-1,1):
        pts=[]
        for j in range(11):
            t=j/10;pts.append((u*(.23+.16*t),.15+.39*t,1.38-1*t+.075*t))
        line('Cape hem braid',pts,.008,'gold')
    PART='Sword'
    # Pointed broad blade with a center ridge and luminous fuller.
    grip=(.49,-.22,1.06); tip=(1.22,-.64,1.75)
    axis=(Vector(tip)-Vector(grip)).normalized();cross=Vector((1,.4,0)).normalized();thick=axis.cross(cross).normalized()
    def p(t,w,d=0):return tuple(Vector(grip)+axis*t+cross*w+thick*d)
    length=(Vector(tip)-Vector(grip)).length
    rod('Bound sword grip',p(-.17,0),p(.01,0),.034,.034,'leather')
    ico('Pommel',p(-.19,0),(.05,.05,.05),'gold',1)
    rod('Swept crossguard',p(.01,-.15),p(.01,.15),.032,.025,'gold')
    bladeverts=[p(.04,-.06),p(.04,.06),p(length*.77,.043),p(length,0),p(length*.77,-.043),p(.08,0,.032),p(length*.75,0,.024)]
    blade=mesh('Ridge-forged blade',bladeverts,[(0,1,5),(1,2,6,5),(2,3,6),(3,4,6),(4,0,5,6)],'gold')
    solid=blade.modifiers.new('Forged blade thickness','SOLIDIFY');solid.thickness=.014
    bpy.context.view_layer.objects.active=blade;bpy.ops.object.modifier_apply(modifier=solid.name)
    line('Amber blade rune',[p(.13,0,.035),p(length*.78,0,.03),p(length*.92,0,.015)],.016,'amber')
    return c

def make_imp():
    global PART
    c=begin('imp')
    ico('Hunched rubble torso',(0,.035,.64),(.26,.18,.28),'stone',2,.13)
    ico('Ridge back',(0,.11,.78),(.28,.17,.18),'stoneDark',1,.12)
    for side in (-1,1):
        hip=(side*.15,.04,.46);knee=(side*.23,-.10,.29);ankle=(side*.23,.045,.12)
        rod('Thigh sinew',hip,knee,.10,.085,'stoneDark',6)
        ico('Chipped knee',knee,(.10,.085,.10),'stoneLight',1,.12)
        rod('Backward shin',knee,ankle,.073,.065,'stone',6)
        ico('Clawed foot',(side*.23,-.025,.07),(.115,.16,.075),'stoneDark',1)
        for offset in (-.05,.01,.06):rod('Foot talon',(side*.23+offset,-.10,.07),(side*.23+offset,-.20,.028),.025,0,'bronze',5)
        shoulder=(side*.27,.015,.77); elbow=(side*.38,-.02,.56);hand=(side*.44,-.14,.35)
        ico('Broken shoulder plate',shoulder,(.15,.13,.145),'stoneLight',1,.15)
        rod('Long upper arm',shoulder,elbow,.08,.058,'stoneDark',6)
        rod('Stone forearm',elbow,hand,.085,.06,'stone',6)
        ico('Long knuckle',hand,(.075,.08,.09),'stoneLight',1)
        for dx in (-.05,0,.05):
            line('Hooked claw',[(hand[0]+dx,hand[1]-.015,hand[2]),(hand[0]+dx,hand[1]-.10,hand[2]-.09),(hand[0]+dx,hand[1]-.14,hand[2]-.045)],.014,'bronze',5)
    PART='Head'
    ico('Wedge skull',(0,-.06,.92),(.20,.16,.215),'stone',2,.09)
    ico('Heavy jaw',(0,-.17,.84),(.135,.09,.085),'stoneDark',1)
    for side in (-1,1):
        brow=cube('Angular brow',(side*.087,-.195,.99),(.15,.075,.055),'stoneLight',.016);brow.rotation_euler.y=side*.24
        ico('Spirit eye',(side*.078,-.215,.956),(.04,.02,.028),'cyan',1)
        line('Swept horn',[(side*.16,.02,1.03),(side*.26,.06,1.14),(side*.23,.04,1.25)],.044,'stoneDark')
    crystal('Back shard',(.11,.14,.79),.055,.25,tilt=(.4,-.35,.1))
    return c

def make_guardian():
    global PART
    c=begin('guardian')
    ico('Monolithic core',(0,.06,1.37),(.62,.38,.64),'stoneDark',2,.12)
    # Chest has offset fracture plates, not one sphere.
    for side in (-1,1):
        ico('Chest shield',(side*.27,-.235,1.58),(.32,.17,.29),'stoneLight',1,.09)
        ico('Abdominal slab',(side*.20,-.255,1.17),(.24,.14,.23),'stone',1,.08)
        hip=(side*.30,.05,.90);knee=(side*.39,-.07,.49);foot=(side*.41,-.13,.16)
        rod('Deep joint',hip,knee,.17,.15,'stoneDark',8)
        ico('Thigh plate',(side*.32,-.04,.78),(.23,.23,.31),'stone',1,.1)
        ico('Gargoyle knee',knee,(.23,.23,.20),'stoneLight',1,.1)
        rod('Shin',knee,foot,.17,.20,'stone',7)
        ico('Broad stone foot',(side*.40,-.16,.14),(.28,.38,.16),'stoneDark',1,.04)
        for offset in (-.15,0,.15):ico('Toe block',(side*.40+offset,-.42,.12),(.09,.14,.105),'stoneLight',1,.05)
        shoulder=(side*.65,.04,1.78);elbow=(side*.86,-.035,1.28);fist=(side*.92,-.19,.86)
        ico('Huge fractured pauldron',shoulder,(.37,.36,.33),'stone',2,.15)
        rod('Shoulder joint',shoulder,elbow,.20,.18,'stoneDark',8)
        ico('Elbow cap',elbow,(.24,.24,.21),'stoneLight',1,.12)
        rod('Forearm core',elbow,fist,.20,.25,'stoneDark',8)
        ico('Slab gauntlet',(side*.91,-.14,1.05),(.25,.28,.29),'stone',1,.1)
        ico('Boulder fist',fist,(.25,.28,.22),'stoneLight',1,.08)
        for j in range(3):
            crystal('Shoulder crystal',(side*(.49+j*.15),.045+j*.055,1.94-j*.028),.10,.38+.11*(j%2),tilt=(.10,side*.4,0))
        crystal('Forearm crystal',(side*.99,-.08,1.13),.065,.33,tilt=(0,side*.65,0))
    PART='Head'
    ico('Ancient visor head',(0,-.11,2.02),(.30,.25,.31),'stoneLight',2,.05)
    ico('Chin',(0,-.28,1.86),(.22,.15,.115),'stoneDark',1)
    cube('Dark visor recess',(0,-.338,2.035),(.46,.065,.12),'shadow',.025)
    for side in (-1,1):
        eye=cube('Luminous guardian eye',(side*.115,-.377,2.05),(.13,.025,.045),'cyan',.01);eye.rotation_euler.y=side*.18
        ico('Brow',(side*.16,-.31,2.16),(.20,.14,.09),'stone',1)
    crystal('Crown center',(0,.02,2.2),.115,.46)
    for x in (-.20,.20):crystal('Crown points',(x,.07,2.17),.07,.34,tilt=(.15,x,0))
    # Central diamond and fracture inlays remain readable from the game camera.
    crystal('Heart of the vault',(0,-.42,1.34),.11,.34,'cyan',tilt=(pi/2,0,0))
    for side in (-1,1):line('Chest fracture',[(side*.07,-.40,1.58),(side*.16,-.41,1.48),(side*.31,-.36,1.46)],.019,'cyan')
    return c
