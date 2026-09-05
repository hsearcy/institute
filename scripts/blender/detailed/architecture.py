"""Gothic stonework with courses, recesses, clustered columns and real damage."""

def buttress(x,y=0,height=4.6):
    # Wide base steps taper into a deep, irregular dressed-stone buttress.
    for z,w,d,h in [(.10,1.12,1.2,.20),(.29,.98,1.04,.18),(.47,.84,.90,.16)]:
        worn_block('Eroded buttress footing',(x,y,z),(w,d,h),'stone',.014,.028)
    z=.58;row=0
    while z<height-.42:
        h=min(.38+random.random()*.17,height-.42-z)
        width=.68 if z<height*.65 else .59
        worn_block('Offset buttress ashlar',(x+random.uniform(-.014,.014),y,z+h/2),(width,.79,h-.022),'stoneLight' if row%5==2 else 'stone',.014,.02)
        if row%3==1:crack('Hairline buttress fracture',(x+.12,y-.411,z+h*.55),.10,h*.62,.004)
        z+=h;row+=1
    for side in (-1,1):
        # Engaged slender shafts add a clustered Gothic profile.
        sx=x+side*.29
        for j in range(6):
            z=.64+j*(height-1.1)/6
            o=rod('Engaged colonette',(sx,y-.40,z),(sx,y-.40,z+(height-1.1)/6-.014),.057,.055,'stoneLight',12);smooth(o)
        for z in (.57,height-.47):
            ringmesh('Carved colonette collar',[(sx,y-.40,z,.08,.08),(sx,y-.40,z+.035,.095,.095),(sx,y-.40,z+.09,.065,.065)],'stone',12)
    for z,w,d,h in [(height-.40,.75,.87,.16),(height-.27,.90,1,.12),(height-.13,.97,1.09,.15)]:
        worn_block('Weathered capital molding',(x,y,z),(w,d,h),'stoneLight',.013,.021)
    # Carved foliate corbels are asymmetric, rounded relief rather than flat icons.
    for side in (-1,1):
        for j in range(3):
            xx=x+side*(.08+j*.082)
            zz=height-.44-j*.035
            plate('Carved acanthus leaf',[(xx-.020,y-.48,zz-.12),(xx+.024,y-.48,zz-.12),(xx+.058,y-.48,zz-.04),(xx+.046,y-.48,zz+.015),(xx+.028,y-.48,zz+.10),(xx,y-.48,zz+.15),(xx-.035,y-.48,zz+.07),(xx-.058,y-.48,zz-.025)],.035,'stone',.007)
            line('Leaf central vein',[(xx,y-.49,zz-.10),(xx,y-.52,zz+.06),(xx,y-.49,zz+.13)],.004,'stoneLight',5)
    # Recessed pointed niche, framed by narrow stone tracery.
    zc=height*.55
    plate('Buttress recessed panel',[(x-.13,y-.405,zc-.32),(x+.13,y-.405,zc-.32),(x+.13,y-.405,zc+.18),(x,y-.405,zc+.38),(x-.13,y-.405,zc+.18)],0,'stoneDark',.002)
    line('Inset pointed tracery',[(x-.15,y-.43,zc-.33),(x-.15,y-.43,zc+.18),(x,y-.43,zc+.42),(x+.15,y-.43,zc+.18),(x+.15,y-.43,zc-.33)],.018,'stoneLight',6)

def arch_profile(side,t):
    return (side*1.49*(1-t**1.2),2.9+1.55*sin(t*pi/2))

def arch_stonework():
    for side in (-1,1):buttress(side*1.69,0,3.02)
    for side in (-1,1):
        # Uneven radiating stone voussoirs, with three layers of molded depth.
        points=[arch_profile(side,i/15) for i in range(16)]
        for j in range(15):
            p,q=Vector(points[j]),Vector(points[j+1]);d=(q-p).normalized();normal=Vector((abs(d.y)*side,abs(d.x)))
            center=(p+q)/2;p=center+(p-center)*.96;q=center+(q-center)*.96
            thickness=.39+random.uniform(-.022,.028)
            corners=[p,q,q+normal*thickness,p+normal*thickness]
            front=-.465+random.uniform(-.02,.022);back=.49+random.uniform(-.02,.02)
            verts=[(v.x,y,v.y) for y in (front,back) for v in corners]
            o=mesh('Eroded radial arch block',verts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'stoneLight' if j%4==1 else 'stone')
            bevel(o,.017,2)
            for v in o.data.vertices:v.co+=mnoise.noise_vector(v.co*12)*.010
            smooth(o)
            mod=o.modifiers.new('Planar carved faces','WEIGHTED_NORMAL');mod.keep_sharp=True
            bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        for offset,radius,matname in [(0,.038,'stoneLight'),(.12,.023,'stone'),(.33,.034,'stoneLight')]:
            pts=[]
            for j in range(30):
                t=j/29;x,z=arch_profile(side,t)
                a=Vector(arch_profile(side,max(0,t-.01)));b=Vector(arch_profile(side,min(1,t+.01)))
                tangent=(b-a).normalized();normal=Vector((abs(tangent.y)*side,abs(tangent.x)))
                pts.append((x+normal.x*offset,-.501,z+normal.y*offset))
            line('Weathered archivolt bead',pts,radius,matname,8)
    # Pointed keystone with a carved mask and a tiny restrained crystal inset.
    plate('Keystone hanging shield',[(-.16,-.53,4.60),(.16,-.53,4.60),(.14,-.54,4.34),(0,-.55,4.22),(-.14,-.54,4.34)],.055,'stoneLight')
    sphere('Keystone carved skull',(0,-.61,4.43),(.086,.07,.10),'stone',16,10)
    for side in (-1,1):sphere('Mask eye recess',(side*.032,-.673,4.445),(.022,.008,.018),'shadow',10,6)
    line('Keystone brow',[(-.06,-.677,4.47),(0,-.69,4.45),(.06,-.677,4.47)],.009,'stoneLight',5)
    # Rubble shelves at foot, every fragment has texture and rounded chips.
    for i in range(12):
        side=-1 if i<6 else 1;x=side*(1.32+random.random()*.66)
        o=worn_block('Fallen arch chip',(x,-.5-random.random()*.3,.025+random.random()*.06),(.08+random.random()*.18,.10+random.random()*.17,.04+random.random()*.09),'stoneDark',.008,.013)
        o.rotation_euler.z=random.random()*3

def make_arch_v2():
    c=begin('arch');arch_stonework();return c

def make_pillar_v2():
    c=begin('pillar')
    buttress(0,0,4.8)
    # Four-quarter column bundle, not a flat toy tower cap.
    for side in (-1,1):
        for j in range(7):
            z=.57+j*.52
            o=rod('Rear quarter column',(side*.25,.33,z),(side*.25,.33,z+.50),.078,.075,'stone',12);smooth(o)
    worn_block('Fractured crown left',(-.22,-.015,4.87),(.44,.86,.20),'stone',.047,.018)
    worn_block('Fractured crown right',(.22,.025,4.84),(.40,.81,.15),'stoneDark',.036,.018)
    return c

def wall_courses(width=4.2,height=3.0,y=0,broken=False):
    # Staggered variable-width and variable-height beds of stone with real joints.
    z=0;row=0
    while z<height:
        h=min(.32+random.random()*.17,height-z)
        x=-width/2
        while x<width/2-.05:
            w=min(.45+random.random()*.54,width/2-x)
            maxh=height-(.3+.6*(sin(x*1.7)**2)) if broken else height
            if z+h<maxh or not broken:
                surface='stoneLight' if random.random()<.12 else 'stoneDark' if random.random()<.18 else 'stone'
                depth=.70+random.uniform(-.07,.06)
                o=worn_block('Old irregular wall ashlar',(x+w/2,y+random.uniform(-.024,.024),z+h/2),(w-.023,depth,h-.024),surface,.013,.02)
                if random.random()<.19:crack('Split limestone grain',(x+w*.64,y-depth/2-.018,z+h*.47),w*.15,h*.75,.004)
            x+=w
        z+=h;row+=1
    for i in range(5):
        worn_block('Segmented foundation',(-width/2+(i+.5)*width/5,y,.07),(width/5-.02,.94,.14),'stoneDark',.015,.024)

def make_wall_v2():
    c=begin('wall');wall_courses(4.2,3.2)
    for i in range(6):worn_block('Damaged wall coping',(-1.75+i*.7,0,3.26),(.69,.85,.17),'stone',.018,.026)
    return c

def make_broken_wall_v2():
    c=begin('broken-wall');wall_courses(4.2,2.55,broken=True)
    for i in range(24):
        x=random.uniform(-2.15,2.15);y=random.uniform(-.95,.65)
        o=worn_block('Collapsed rubble fragment',(x,y,.06+random.random()*.06),(.13+random.random()*.29,.12+random.random()*.24,.09+random.random()*.14),'stoneDark' if i%3==0 else 'stone',.02,.025)
        o.rotation_euler=(random.uniform(-.2,.2),random.uniform(-.3,.3),random.random()*pi)
    return c

def make_wall_bay_v2():
    c=begin('wall-bay')
    # An actual recessed niche: masonry behind a layered arch, side piers and vault.
    wall_courses(4.65,4.95,y=.65)
    arch_stonework()
    # Deep dark alcove face sits behind the arch so shadows have thickness.
    points=[(-1.43,.17,.1),(1.43,.17,.1),(1.43,.17,2.90)]
    points += [(x,.17,z) for x,z in (arch_profile(1,i/18) for i in range(1,19))]
    points += [(x,.17,z) for x,z in (arch_profile(-1,i/18) for i in range(17,-1,-1))]
    mesh('Deep shadowed alcove',points,[tuple(range(len(points)))],'stoneDark')
    # Narrow inner piers and a simple shuttered iron grille emphasize depth.
    for x in (-1.27,1.27):
        for j in range(5):worn_block('Inset alcove jamb',(x,-.005,.35+j*.55),(.15,.25,.52),'stoneDark',.007,.014)
    for i in range(9):
        x=-1.07+i*.2675;top=3.85-abs(x)*.63
        rod('Corroded iron grille',(x,-.018,.26),(x,-.018,top),.018,.016,'iron',6)
        plate('Grille spearpoint',[(x-.040,-.02,top-.03),(x+.04,-.02,top-.03),(x,-.02,top+.17)],.008,'iron',.003)
    for z in (.46,1.54,2.54):rod('Grille horizontal strap',(-1.22,-.019,z),(1.22,-.019,z),.020,.020,'iron',6)
    for x in (-1.04,-.5,0,.5,1.04):
        for z in (1.54,2.54):rivet((x,-.045,z),.018,'iron')
    return c
