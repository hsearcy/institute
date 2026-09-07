"""Distinct fire and storm weapon sources; no public asset writes."""
import math
import bpy


def make_builders(h):
    mesh=h['mesh'];material=h['material'];lathe=h['lathe_z'];outline=h['solid_outline'];tube=h['tube'];surfaces=h['SURFACES']

    def metals(label,tint):
        return (material(label+' worked blade flats',tint,.86,.31),
                material(label+' ground cutting edge',(.23,.27,.30),.9,.34),
                material(label+' protected spine',(.025,.031,.039),.70,.45))

    def blade(root,label,stations,mats,section_count=64,curved=False):
        """Continuous closed eight-plane forged blade with sampled longitudinal curvature."""
        def sample(z):
            for index,(a,b) in enumerate(zip(stations,stations[1:])):
                if z<=b[0]:
                    t=(z-a[0])/(b[0]-a[0])
                    if not curved:return [a[k]+(b[k]-a[k])*t for k in range(1,4)]
                    before=stations[max(0,index-1)];after=stations[min(len(stations)-1,index+2)]
                    values=[]
                    for k in range(1,4):
                        m0=(b[k]-before[k])/(b[0]-before[0]);m1=(after[k]-a[k])/(after[0]-a[0]);span=b[0]-a[0]
                        value=(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*span*m0+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*span*m1
                        values.append(max(.0004,value) if k>1 else value)
                    return values
            return stations[-1][1:]
        profile=[(-1,0),(-.68,-.82),(-.28,-1),(.68,-.82),(1,0),(.68,.82),(-.28,1),(-.68,.82)]
        verts=[];faces=[];indices=[]
        for row in range(section_count+1):
            z=stations[0][0]+(stations[-1][0]-stations[0][0])*row/section_count
            x,w,d=sample(z)
            verts.extend((x+u*w,v*d,z) for u,v in profile)
        for row in range(section_count):
            for side in range(8):
                a=row*8+side;b=row*8+(side+1)%8
                faces.append((a,b,b+8,a+8));indices.append(1 if side in (0,3,4,7) else 0)
        faces.extend([tuple(reversed(range(8))),tuple(section_count*8+i for i in range(8))]);indices.extend([2,1])
        obj=mesh(label+' continuous forged blade',verts,faces,mats[0],root,smooth=True)
        for mat in mats[1:]:obj.data.materials.append(mat)
        for face,index in zip(obj.data.polygons,indices):face.material_index=index
        for edge in obj.data.edges:edge.use_edge_sharp=edge.vertices[0]%8==edge.vertices[1]%8
        return obj

    def hilt(root,p,label,leather=None,pommel='round'):
        surfaces.wrapped_hilt(root,dict(p,leather=leather or p['leather']),(.045,.045,.050,1))
        dark=material(label+' dark fitted hilt steel',(.05,.058,.065),.72,.44)
        for name,levels in [('lower',[(-.119,.022),(-.115,.026),(-.103,.026),(-.101,.024)]),('upper',[(.110,.022),(.114,.025),(.125,.025),(.131,.021)])]:
            obj=lathe(label+' seated '+name+' ferrule',levels,dark,root)
            for v in obj.data.vertices:v.co.y*=.79
        if pommel=='round':
            levels=[]
            for j in range(41):
                z=-.169+.052*j/40;t=j/40
                r=.025*math.sin(math.pi*t/1.48)**.55+.0005
                levels.append((z,r))
            lathe(label+' turned pear counterweight',levels,dark,root)
        elif pommel=='beak':
            outline(label+' swept hooked beak pommel',[(-.020,-.116),(-.031,-.132),(-.024,-.159),(.006,-.177),(.041,-.172),(.023,-.158),(.020,-.135),(.021,-.116)][::-1],.014,dark,root,.005)
        return dark

    def annulus(root,label,cx,cz,outer,inner,depth,mat):
        verts=[];faces=[];n=64
        for y,r in [(-depth,outer),(-depth,inner),(depth,outer),(depth,inner)]:
            verts.extend((cx+r*math.cos(i*math.tau/n),y,cz+r*math.sin(i*math.tau/n)) for i in range(n))
        for i in range(n):
            j=(i+1)%n
            faces.extend([(i,j,n+j,n+i),(2*n+j,2*n+i,3*n+i,3*n+j),(j,i,2*n+i,2*n+j),(n+i,n+j,3*n+j,3*n+i)])
        return mesh(label,verts,faces,mat,root,bevel=.0012)

    def phoenix_talon(root,p):
        label='Phoenix Talon';dark=hilt(root,p,label,pommel='beak')
        body,edge,spine=metals(label,(.115,.079,.040))
        bronze=material(label+' exposed warm bronze',(.19,.09,.027),.78,.34)
        blade(root,label,[(.137,0,.022,.014),(.25,.009,.036,.015),(.43,.050,.053,.016),(.61,.105,.058,.012),(.73,.128,.044,.009),(.81,.093,.022,.006),(.835,.060,.0005,.0005)],(body,edge,spine),96,curved=True)
        outline(label+' swept feather guard',[(-.135,.201),(-.103,.190),(-.074,.171),(-.026,.155),(.035,.146),(.075,.114),(.065,.105),(.035,.126),(-.026,.135),(-.080,.154),(-.120,.173)],.019,bronze,root,.004)
        outline(label+' inner overlapping quillon feather',[(-.108,.158),(-.065,.155),(-.025,.142),(-.045,.138),(-.090,.144)],.013,dark,root,.002)

    def sunforged(root,p):
        label='Sunforged';dark=hilt(root,p,label)
        gold=material(label+' worn sun bronze',(.24,.145,.045),.8,.36)
        body,edge,spine=metals(label,(.12,.117,.095))
        blade(root,label,[(.133,0,.025,.015),(.21,0,.041,.016),(.43,0,.040,.014),(.70,0,.031,.012),(.91,0,.020,.007),(.981,0,.0005,.0005)],(body,edge,spine))
        annulus(root,label+' open forged sun guard',0,.160,.078,.060,.012,gold)
        for i in range(8):
            angle=i*math.tau/8
            pts=[]
            for radius,offset in [(.021,-.012),(.074,-.006),(.074,.006),(.021,.012)]:
                pts.append((radius*math.cos(angle)+offset*math.sin(angle),.160+radius*math.sin(angle)-offset*math.cos(angle)))
            outline(label+' tapered sun guard spoke',pts,.010,gold,root,.0015)
        outline(label+' seated horizontal quillons',[(-.151,.164),(-.142,.174),(-.065,.155),(.065,.155),(.142,.174),(.151,.164),(.074,.136),(-.074,.136)],.015,dark,root,.003)

    def arcfang(root,p):
        label='Arc Fang';dark=hilt(root,p,label,p['navy'],pommel='beak')
        body,edge,spine=metals(label,(.069,.076,.115))
        blade(root,label,[(.132,0,.023,.014),(.24,.022,.037,.014),(.36,.057,.038,.012),(.44,.036,.029,.010),(.53,.088,.027,.009),(.62,.077,.022,.006),(.691,.110,.0005,.0005)],(body,edge,spine),48)
        outline(label+' unequal conducting tooth guard',[(-.096,.215),(-.079,.209),(-.065,.164),(-.018,.149),(.024,.149),(.059,.169),(.077,.193),(.085,.183),(.065,.143),(.025,.129),(-.028,.129),(-.083,.150)],.017,dark,root,.003)

    def skybreaker(root,p):
        label='Skybreaker';dark=hilt(root,p,label,p['navy'])
        mats=metals(label,(.098,.119,.145))
        core=blade(root,label,[(.132,0,.028,.017),(.28,0,.062,.018),(.54,.014,.064,.016),(.74,.012,.054,.013),(.88,.018,.041,.010),(.94,.020,.035,.008)],mats)
        # Two unequal real points emerge from one seated blade shoulder.
        left=blade(root,label+' left split point',[(.865,-.010,.021,.010),(.973,-.026,.016,.006),(1.067,-.041,.0005,.0005)],mats,24)
        right=blade(root,label+' right split point',[(.865,.044,.021,.010),(.939,.062,.015,.006),(1.016,.067,.0005,.0005)],mats,24)
        # Unite the intersecting shoulders into one forged fork, removing
        # the separate capped faces that made the first tips look grafted on.
        bpy.context.view_layer.objects.active=core
        for tip in (left,right):
            modifier=core.modifiers.new('Continuous forged point junction','BOOLEAN');modifier.operation='UNION';modifier.solver='EXACT';modifier.object=tip
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            bpy.data.objects.remove(tip,do_unlink=True)
        outline(label+' broad winged guard',[(-.160,.203),(-.126,.197),(-.063,.160),(-.028,.151),(.028,.151),(.095,.181),(.149,.189),(.159,.180),(.083,.151),(.028,.131),(-.031,.131),(-.091,.162),(-.150,.184)],.020,dark,root,.004)

    def stormsilver(root,p):
        label='Stormsilver';dark=hilt(root,p,label,p['navy'])
        mats=metals(label,(.145,.165,.182))
        blade(root,label,[(.131,0,.021,.013),(.23,0,.031,.014),(.57,0,.028,.011),(.81,0,.021,.008),(.981,0,.0005,.0005)],mats)
        outline(label+' swept basket root',[(-.072,.163),(-.048,.164),(-.024,.146),(.028,.145),(.055,.167),(.067,.160),(.033,.126),(-.031,.127)],.016,dark,root,.003)
        for side in (-1,1):
            points=[(side*.044,0,.150),(side*.091,-.006,.095),(side*.100,-.005,-.005),(side*.070,-.003,-.087),(side*.026,0,-.119)]
            centers,radii=h['curved_path'](points,[.008,.007,.006,.006,.007],12)
            tube(label+' continuous swept basket bow',centers,radii,mats[0],root,12)
        centers,radii=h['curved_path']([(-.030,-.017,.145),(-.065,-.055,.080),(0,-.067,-.025),(.054,-.040,-.070),(.026,0,-.118)],[.006]*5,12)
        tube(label+' front protective basket sweep',centers,radii,mats[0],root,12)

    def tempest(root,p):
        label='Tempest Caller';dark=hilt(root,p,label,p['navy'])
        silver=material(label+' wind worn silver vane',(.13,.15,.17),.82,.34)
        shaft=lathe(label+' continuous storm staff',[(-.119,.020),(.13,.020),(.18,.024),(.73,.018),(.88,.029)],dark,root)
        # Open offset spiral with a real taper and two fitted fork roots.
        centers=[];radii=[]
        for i in range(85):
            t=i/84;angle=-math.pi*.72+t*math.pi*1.72;r=.154*(1-.63*t)
            centers.append((.017+r*math.cos(angle),0,1.054+r*math.sin(angle)));radii.append(.017*(1-.75*t))
        tube(label+' tapered spiral storm vane',centers,radii,silver,root,16)
        for side in (-1,1):
            points=[(0,0,.79),(side*.034,0,.884),(side*.079,0,.947)]
            centers,radii=h['curved_path'](points,[.024,.018,.013],14);tube(label+' grown forged fork',centers,radii,dark,root,16)
        outline(label+' continuous inner stone support',[(.005,.869),(.022,.878),(.058,.943),(.061,1.020),(.048,1.035),(.030,1.022),(.035,.958),(.009,.908)][::-1],.012,dark,root,.003)
        stone=material(label+' sheltered violet stormstone',(.025,.012,.066),.18,.23)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=(.035,0,1.058))
        obj=bpy.context.object;obj.name=label+' seated stormstone';obj.scale=(.031,.020,.039);obj.parent=root;obj.data.materials.append(stone)
        for f in obj.data.polygons:f.use_smooth=True
        outline(label+' fitted stormstone foot',[(.006,1.026),(.014,1.041),(.052,1.041),(.064,1.023),(.044,1.013),(.016,1.013)],.019,dark,root,.002)

    return dict(phoenix_talon=phoenix_talon,sunforged=sunforged,arcfang=arcfang,skybreaker=skybreaker,stormsilver=stormsilver,tempest=tempest)
