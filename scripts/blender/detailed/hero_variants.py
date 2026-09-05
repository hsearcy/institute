"""Three authored progression armors built on the same young hero and eight bones."""
import bpy,math,random
from mathutils import Vector

HERO_APPEARANCES=('cinder','glacier','tempest')

def appearance_palette(kind):
    if kind=='cinder':
        metal=(.065,.047,.032);trim=(.33,.13,.035);cloth=(.25,.013,.012);dark=(.075,.005,.009);arc=(1,.21,.012)
    elif kind=='glacier':
        metal=(.32,.40,.46);trim=(.54,.66,.71);cloth=(.012,.045,.11);dark=(.004,.014,.045);arc=(.10,.63,.91)
    else:
        metal=(.031,.040,.068);trim=(.22,.16,.34);cloth=(.075,.012,.145);dark=(.023,.004,.057);arc=(.50,.055,.92)
    result={}
    for key,base,rough in [('bronze',metal,.44),('iron',tuple(v*.64 for v in metal),.50),('gold',trim,.32),('steel',tuple(min(.8,v*1.22+.08)for v in metal),.31)]:
        result[key]=source_material(kind+' '+key,base,'metal',.75,rough)
    for key,base in [('teal',cloth),('tealDark',dark),('tealLight',tuple(min(.5,v*1.7+.015)for v in cloth))]:
        result[key]=source_material(kind+' '+key,base,'cloth',0,.84)
    result['variantArc']=mat(kind+' rune inlay',arc,0,.4,2.4)
    result['amber']=result['variantArc']
    result['frostSteel']=source_material(kind+' pale fracture',(.35,.48,.57),'metal',.30,.62)
    return result

def pose_appearance_additions(objects):
    # Match the existing hero's authored counterrotation/lean. All extra armor is
    # added before the common bake/rig so weighting follows the normal part rules.
    for obj in objects:
        if obj.type!='MESH':continue
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        for vertex in obj.data.vertices:
            p=obj.matrix_world@vertex.co;x,y,z=p
            if z<.94:
                bend=math.sin(max(0,min(1,z/.94))*math.pi);y-=.055*bend
                y+=(-.072 if x>0 else .036)*max(0,1-z/.94)
                x+=.024*(1 if x>0 else -1)*max(0,1-z/.94)
            turn=-.12*max(0,min(1,(z-.91)/.43))
            x,y=x*math.cos(turn)-y*math.sin(turn),x*math.sin(turn)+y*math.cos(turn)
            x-=.035*max(0,min(1,(z-.92)/.45));y-=.021*max(0,min(1,(z-1.1)/.5))
            vertex.co=obj.matrix_world.inverted()@Vector((x,y,z))

def variant_pauldron(kind,side):
    global PART
    PART='Body'
    if kind=='cinder':
        for j in range(2):
            x=side*(.265+j*.064);z=1.47-j*.068
            plate('Cinder forged angular pauldron',[(x-side*.08,-.06,z-.015),(x+side*.02,.075,z+.025),(x+side*.17,.028,z-.015),(x+side*.18,-.055,z-.095),(x+side*.055,-.155,z-.145),(x-side*.07,-.145,z-.09)],.035,'bronze',.006)
        line('Amber pauldron fault',[(side*.245,-.173,1.405),(side*.285,-.180,1.38),(side*.305,-.164,1.40),(side*.370,-.15,1.355)],.0045,'variantArc',5)
        plate('Ember bracer fin',[(side*.29,-.10,1.12),(side*.38,-.08,1.17),(side*.43,-.13,1.07),(side*.35,-.20,1.015)],.020,'bronze',.004)
    elif kind=='glacier':
        for j in range(3):
            x=side*(.25+j*.055);z=1.48-j*.037
            plate('Faceted frost petal',[(x-side*.060,-.045,z-.12),(x-side*.033,.057,z-.028),(x+side*.018,.075,z+.079-j*.01),(x+side*.09,.019,z+.008),(x+side*.12,-.10,z-.09),(x+side*.016,-.153,z-.14)],.041,'frostSteel' if j%2==0 else 'steel',.003)
        line('Ice shoulder incision',[(side*.24,-.16,1.37),(side*.285,-.177,1.40),(side*.315,-.167,1.435)],.004,'variantArc',5)
        plate('Glacial bracer ridge',[(side*.285,-.13,1.11),(side*.33,-.105,1.19),(side*.389,-.147,1.08),(side*.346,-.218,1.01)],.022,'frostSteel',.003)
    else:
        for j in range(2):
            x=side*(.27+j*.055);z=1.43-j*.045
            plate('Swept storm pauldron',[(x-side*.09,-.11,z-.055),(x-side*.04,.06,z+.015),(x+side*.05,.11,z+.12),(x+side*.20,.08,z+.18),(x+side*.14,-.04,z+.008),(x+side*.09,-.16,z-.075)],.039,'bronze' if j==0 else 'iron',.005)
        line('Violet pauldron lightning',[(side*.22,-.143,1.41),(side*.28,-.16,1.435),(side*.30,-.168,1.39),(side*.36,-.136,1.415),(side*.42,-.10,1.51)],.004,'variantArc',5)
        plate('Swept storm vambrace',[(side*.29,-.085,1.11),(side*.34,-.04,1.21),(side*.415,-.08,1.23),(side*.37,-.16,1.04),(side*.31,-.20,1.01)],.025,'bronze',.004)

def make_hero_appearance(kind):
    global PART
    if kind not in HERO_APPEARANCES:raise ValueError(kind)
    saved=MATS.copy();MATS.update(appearance_palette(kind))
    collection=make_hero_v2();collection.name='Vault_hero-'+kind
    before=set(collection.objects)
    for side in (-1,1):variant_pauldron(kind,side)
    PART='Body'
    if kind=='cinder':
        for side in (-1,1):
            plate('Cinder overlapping breast plate',[(side*.025,-.188,1.375),(side*.14,-.165,1.38),(side*.176,-.15,1.18),(side*.045,-.197,1.12)],.014,'bronze',.005)
            line('Molten chest fissure',[(side*.045,-.220,1.355),(side*.073,-.221,1.29),(side*.053,-.227,1.264),(side*.091,-.211,1.20)],.0042,'variantArc',5)
    elif kind=='glacier':
        plate('Cold steel kite cuirass',[(-.155,-.17,1.36),(0,-.219,1.42),(.155,-.17,1.36),(.105,-.20,1.18),(0,-.237,1.085),(-.105,-.20,1.18)],.016,'steel',.005)
        for angle in (0,math.pi/3,-math.pi/3):
            dx=.064*math.cos(angle);dz=.064*math.sin(angle)
            line('Frost heraldic incision',[(-dx,-.263,1.285-dz),(dx,-.263,1.285+dz)],.004,'variantArc',5)
    else:
        plate('Ornate storm breastplate',[(-.173,-.161,1.365),(-.075,-.211,1.435),(0,-.225,1.395),(.075,-.211,1.435),(.173,-.161,1.365),(.106,-.215,1.16),(0,-.241,1.07),(-.106,-.215,1.16)],.015,'bronze',.004)
        for side in (-1,1):
            line('Violet cuirass circuit',[(side*.14,-.209,1.36),(side*.09,-.251,1.33),(side*.115,-.239,1.275),(side*.055,-.269,1.225),(side*.045,-.262,1.155)],.004,'variantArc',5)
            line('Storm silver filigree',[(side*.055,-.254,1.38),(side*.081,-.24,1.355),(side*.06,-.253,1.328),(side*.03,-.257,1.346)],.0045,'gold',5)
    PART='Head'
    if kind=='tempest':
        for side in (-1,1):
            plate('Swept storm hood crown',[(side*.102,-.054,1.65),(side*.143,-.015,1.68),(side*.204,.022,1.805),(side*.165,.07,1.773),(side*.106,.045,1.708)],.017,'bronze',.003)
            line('Crown violet trace',[(side*.115,-.08,1.67),(side*.146,-.018,1.719),(side*.192,.018,1.784)],.003,'variantArc',5)
    elif kind=='glacier':
        for side in (-1,1):plate('Frost temple guard',[(side*.092,-.101,1.56),(side*.128,-.048,1.59),(side*.143,-.065,1.72),(side*.102,-.120,1.685)],.015,'steel',.003)
    else:
        for side in (-1,1):plate('Cinder temple plate',[(side*.091,-.11,1.55),(side*.139,-.055,1.60),(side*.145,-.041,1.72),(side*.095,-.109,1.69)],.014,'bronze',.004)
    pose_appearance_additions(set(collection.objects)-before)
    if kind=='cinder':
        for obj in collection.objects:
            if obj.get('part')!='Cape':continue
            for vertex in obj.data.vertices:
                p=obj.matrix_world@vertex.co;p.z=1.405-(1.405-p.z)*.67
                vertex.co=obj.matrix_world.inverted()@p
    collection['appearance']=kind
    MATS.clear();MATS.update(saved);PART='Body'
    return collection

def make_hero_cinder_v2():return make_hero_appearance('cinder')
def make_hero_glacier_v2():return make_hero_appearance('glacier')
def make_hero_tempest_v2():return make_hero_appearance('tempest')
