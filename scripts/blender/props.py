"""Modular carved architecture and readable interactive dungeon props."""

def column_at(x=0,y=0,height=3.2):
    cube('Foundation',(x,y,.12),(.94,.94,.24),'stoneDark',.045)
    cube('Plinth bevel',(x,y,.30),(.81,.81,.15),'stoneLight',.038)
    cube('Foot molding',(x,y,.43),(.68,.68,.11),'stone',.02)
    rod('Octagonal shaft',(x,y,.46),(x,y,height-.56),.30,.255,'stone',8)
    for i in range(8):
        a=i*2*pi/8
        rod('Fluted ribs',(x+.27*cos(a),y+.27*sin(a),.49),(x+.23*cos(a),y+.23*sin(a),height-.58),.045,.037,'stoneLight',6)
    for z in (.62,height-.71):
        ringmesh('Shaft collar',[(x,y,z,.32,.32),(x,y,z+.06,.34,.34),(x,y,z+.12,.30,.30)],'stoneDark',8)
    cube('Capital',(x,y,height-.40),(.65,.65,.20),'stoneLight',.03)
    cube('Cornice',(x,y,height-.25),(.83,.83,.13),'stone',.025)
    cube('Crown coping',(x,y,height-.10),(.94,.94,.18),'stoneLight',.035)
    # Carved bronze inset and tiny recessed rune.
    cube('Inset tablet',(x,y-.294,height*.56),(.20,.03,.43),'stoneDark',.018)
    line('Inlaid sigil',[(x,y-.318,height*.56+.14),(x+.055,y-.318,height*.56),(x,y-.318,height*.56-.14),(x-.055,y-.318,height*.56),(x,y-.318,height*.56+.14)],.012,'bronze')

def make_pillar():
    c=begin('pillar');column_at();return c

def make_arch():
    c=begin('arch')
    # Voussoirs follow a pointed Gothic profile, individual joints remain visible.
    for side in (-1,1):
        x=side*1.52
        cube('Arch footing',(x,0,.13),(1.05,1.05,.26),'stoneDark',.04)
        for j in range(6):
            o=cube('Pier ashlar',(x,random.uniform(-.012,.012),.47+j*.43),(.70,.74,.407),'stoneLight' if j%3==0 else 'stone',.026)
            o.rotation_euler.z=random.uniform(-.007,.007)
        for dx in (-.25,.25):rod('Slender jamb colonette',(x+dx,-.41,.30),(x+dx,-.41,2.93),.075,.068,'stoneLight',8)
        cube('Impost',(x,0,2.98),(.91,.99,.19),'stoneLight',.025)
    # Profile reaches 4.58 at the apex. Extruded trapezoid blocks on each side.
    for side in (-1,1):
        points=[]
        for i in range(13):
            t=i/12
            points.append((side*1.53*(1-t**1.35),2.98+1.6*sin(t*pi/2)))
        for i in range(12):
            p,q=Vector(points[i]),Vector(points[i+1]);d=(q-p).normalized();normal=Vector((abs(d.y)*side,abs(d.x)))
            center=(p+q)/2
            p=center+(p-center)*.965;q=center+(q-center)*.965
            corners=[p-normal*.02,q-normal*.02,q+normal*.40,p+normal*.40]
            verts=[(v.x,y,v.y) for y in (-.39,.39) for v in corners]
            block=mesh('Pointed arch voussoir',verts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'stoneLight' if i%3==0 else 'stone')
            bevel(block,.018,1)
        line('Arch outer molding',[(x,-.425,z) for x,z in points],.036,'stoneLight',8)
    ico('Keystone crest',(0,-.1,4.58),(.19,.42,.30),'stoneLight',1)
    crystal('Portal keystone light',(0,-.452,4.43),.065,.25,'cyan')
    return c

def make_brazier():
    global PART
    c=begin('brazier')
    ringmesh('Octagonal pedestal',[(0,0,0,.32,.32),(0,0,.13,.35,.35),(0,0,.21,.23,.23),(0,0,.74,.16,.16),(0,0,.86,.27,.27)],'stone',8)
    for z in (.18,.72):ringmesh('Bronze pedestal bands',[(0,0,z,.24,.24),(0,0,z+.045,.24,.24)],'bronze',8)
    ringmesh('Fluted iron bowl',[(0,0,.81,.16,.16),(0,0,.93,.31,.31),(0,0,1.02,.38,.38),(0,0,1.07,.38,.38),(0,0,1.07,.31,.31),(0,0,.93,.12,.12)],'iron',12)
    for i in range(8):
        a=i*2*pi/8
        line('Crown prong',[(.24*cos(a),.24*sin(a),.92),(.35*cos(a),.35*sin(a),1.08),(.35*cos(a),.35*sin(a),1.25)],.023,'bronze')
    PART='Flame'
    for i in range(6):
        a=i*2*pi/6
        ico('Glowing coal',(.14*cos(a),.14*sin(a),1.015),(.11,.095,.035),'amber',1)
        # Asymmetric tapered flame mesh, renderer can animate whole Flame group.
        x=.12*cos(a);y=.12*sin(a)
        ringmesh('Tongue of fire',[(x,y,1.04,.085,.07),(x-.025,y,1.19,.075,.052),(x+.035,y,1.34,.035,.025),(x+.075,y,1.46+.09*(i%2),0,0)],'amber',7)
    ringmesh('White hot fire',[(0,0,1.03,.12,.12),(.02,0,1.2,.095,.085),(-.055,.01,1.45,.03,.03),(.02,.01,1.64,0,0)],'flame',8)
    return c

def make_crystal():
    c=begin('crystal')
    for i in range(8):
        a=i*2*pi/8
        ico('Crystal bed rubble',(.32*cos(a),.26*sin(a),.10),(.22,.18,.12),'stoneDark',1,.15)
    crystal('Main hexagonal crystal',(0,0,.09),.18,1.26,tilt=(.05,-.13,.15))
    for i in range(6):
        a=i*2*pi/6
        crystal('Satellite crystal',(.26*cos(a),.24*sin(a),.09),.10,.47+.19*(i%3),tilt=(.32*sin(a),-.32*cos(a),a))
    return c

def make_chest():
    global PART
    c=begin('chest')
    for side in (-1,1):
        cube('Carved foot',(side*.43,0,.08),(.18,.66,.16),'iron',.026)
    cube('Chest base',(0,0,.19),(1.04,.69,.11),'bronze',.028)
    # Separate planks with visible seams.
    for i in range(6):cube('Dark oak panel',(-.43+i*.172,0,.39),(.163,.64,.38),'wood',.012)
    for x in (-.48,.48):cube('Side straps',(x,0,.40),(.064,.69,.41),'bronze',.012)
    PART='Lid'
    verts=[];n=12
    for x in (-.515,.515):
        for i in range(n+1):
            a=i*pi/n;verts.append((x,.345*cos(a),.57+.24*sin(a)))
    faces=[]
    for i in range(n):faces.append((i,i+1,n+2+i,n+1+i))
    faces += [tuple(reversed(range(n+1))),tuple(range(n+1,2*(n+1)))]
    mesh('Barrel chest lid',verts,faces,'wood')
    for x in (-.48,0,.48):
        line('Lid iron ribs',[(x,.35*cos(i*pi/n),.575+.245*sin(i*pi/n)) for i in range(n+1)],.025,'bronze',6)
    cube('Lid rim',(0,0,.57),(1.075,.725,.054),'gold',.013)
    for x in (-.48,.48):
        for z in (.31,.46):ico('Hammered rivet',(x,-.353,z),(.022,.016,.022),'gold',1)
    PART='Body'
    cube('Lock plate',(0,-.368,.49),(.18,.048,.24),'gold',.02)
    cube('Lock recess',(0,-.399,.49),(.09,.02,.15),'shadow',.012)
    ico('Enchanted lock',(0,-.418,.51),(.04,.014,.055),'cyan',1)
    return c

def make_wall():
    c=begin('wall')
    for row in range(5):
        n=5 if row%2==0 else 6
        for i in range(n):
            width=.78 if row%2==0 else (.38 if i in (0,5) else .78)
            x=-1.6+i*.8 if row%2==0 else -1.8+i*.8
            if row%2 and i==0:x=-1.8
            if row%2 and i==5:x=1.8
            cube('Weathered masonry',(x,0,.25+row*.46),(width,.70,.435),'stoneLight' if random.random()<.2 else 'stone',.028)
    cube('Wall footing',(0,0,.09),(4.10,.88,.18),'stoneDark',.03)
    cube('Wall coping',(0,0,2.38),(4.10,.86,.17),'stoneLight',.03)
    return c
