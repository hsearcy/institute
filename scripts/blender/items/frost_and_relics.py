"""Distinct frost weapons and wearable relic sources; private studies only.

make_builders receives the existing study helper mapping, avoiding a circular
import or edits to the shared registry. All held items retain grip0, +Z tip,
-Y presentation face. These are candidates, not accepted public assets.
"""
import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector, Matrix


def make_builders(h):
    mesh,tube,collar=h['mesh'],h['tube'],h['collar']
    lathe,outline,curved=h['lathe_z'],h['solid_outline'],h['curved_path']
    material,surfaces=h['material'],h['SURFACES']

    def close_normals(obj):
        # All new solids are authored closed; orient their faces before the
        # independent topology preflight. Do not fill unplanned holes here.
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
        return obj

    def m(name,color,metal=0,rough=.5):
        return material(name,color,metal,rough)

    def materials(p):
        return dict(p,
            froststeel=m('Frost relic dark forged steel',(.046,.075,.095),.76,.38),
            frostedge=m('Frost relic ground steel edge',(.32,.39,.42),.88,.26),
            binding=m('Compressed indigo leather',(.018,.029,.063),0,.76),
            icebody=m('Deep blue mineral body',(.015,.055,.085),.10,.24),
            iceplane=m('Unequal blue mineral cutting plane',(.035,.13,.19),.12,.22),
            icefracture=m('Fresh fractured mineral impact',(.28,.43,.47),.06,.52),
            pale=m('Weathered pale branch',(.32,.35,.29),0,.86))

    def wrapped(root,p):
        shader=p['binding'].node_tree.nodes.get('Principled BSDF')
        if not shader.inputs['Base Color'].is_linked:
            rgb=p['binding'].node_tree.nodes.new('ShaderNodeRGB')
            rgb.outputs[0].default_value=shader.inputs['Base Color'].default_value
            p['binding'].node_tree.links.new(rgb.outputs[0],shader.inputs['Base Color'])
        grip=surfaces.wrapped_hilt(root,dict(p,leather=p['binding']),(.065,.081,.13,1))
        close_normals(grip)
        for z in (-.115,.127):
            close_normals(collar('Fitted indigo grip iron ferrule',z,.0265,.014,p['froststeel'],root))

    def section_solid(root,name,stations,p,material_ids=None):
        # A diamond with secondary bevel shoulders: broad forged faces and
        # a physically separate narrow cutting bevel, on both sides.
        profile=[(-1,0),(-.78,-.47),(-.20,-1),(.76,-.43),(1,0),(.76,.43),(-.20,.86),(-.78,.47)]
        verts=[];faces=[]
        for z,x,w,d in stations:
            verts += [(x+u*w,v*d,z) for u,v in profile]
        for row in range(len(stations)-1):
            for i in range(8):faces.append((row*8+i,row*8+(i+1)%8,(row+1)*8+(i+1)%8,(row+1)*8+i))
        faces.extend([tuple(reversed(range(8))),tuple((len(stations)-1)*8+i for i in range(8))])
        obj=mesh(name,verts,faces,p[0],root,bevel=.0008)
        for mat in p[1:]:obj.data.materials.append(mat)
        for face in obj.data.polygons:
            side=face.index%8
            face.material_index=(material_ids[side] if material_ids else 1 if side in (0,3,4,7) else 0) if face.index<len(faces)-2 else 0
        return close_normals(obj)

    def facet_chunk(root,name,center,scale,p,seed=0):
        # Unequal striking faces, with a genuine broad broken cap. Each chunk
        # remains a solid seated inside its supporting iron socket.
        n=6;verts=[]
        for z,r,dx,dy in [(-.5,.61,-.04,0),(-.17,1,0,0),(.30,.85,.12,-.03),(.52,.60,.02,.08)]:
            for i in range(n):
                a=i*math.tau/n+.12;f=1+.11*math.sin(i*2.2+seed)
                verts.append((center[0]+scale[0]*(math.cos(a)*r*f+dx),
                              center[1]+scale[1]*(math.sin(a)*r*f+dy),
                              center[2]+scale[2]*(z+(.065*math.sin(i*2.7+seed) if z>.5 else 0))))
        faces=[tuple(reversed(range(n)))]
        for row in range(3):
            for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
        faces.append(tuple(3*n+i for i in range(n)))
        obj=mesh(name,verts,faces,p['icebody'],root,bevel=.0008)
        obj.data.materials.append(p['iceplane']);obj.data.materials.append(p['icefracture'])
        for f in obj.data.polygons:
            f.material_index=2 if f.index==len(faces)-1 else 1 if f.index%n in (1,4) else 0
        return close_normals(obj)

    def icespear(root,p):
        p=materials(p);wrapped(root,p)
        close_normals(lathe('Rimepiercer forged tapered staff',
            [(-.35,.011),(-.325,.022),(-.17,.021),(.16,.020),(.45,.017),(.555,.026),(.59,.022)],p['froststeel'],root,32))
        section_solid(root,'Rimepiercer fitted tapered forged three-point seat',
            [(.454,0,.022,.017),(.489,0,.029,.020),(.538,0,.064,.022),(.572,0,.055,.022),(.593,0,.036,.021)],
            [p['froststeel'],p['frostedge']],[1,0,0,1,1,0,0,1])
        section_solid(root,'Rimepiercer continuous triangular spike',
            [(.545,0,.035,.021),(.616,.002,.075,.026),(.706,.006,.065,.026),(.928,.012,.027,.012),(1.068,.008,.0008,.0008)],
            [p['froststeel'],p['frostedge']])
        # Unequal mineral planes grow from the two steel barbs, whose heel
        # continues into the socket; no free-floating side crystals.
        section_solid(root,'Rimepiercer long split left frost barb',
            [(.53,-.016,.023,.016),(.588,-.057,.040,.019),(.682,-.112,.034,.016),(.772,-.145,.0008,.0008)],
            [p['icebody'],p['iceplane'],p['icefracture']],[1,0,0,2,1,0,0,1])
        section_solid(root,'Rimepiercer short rear frost barb',
            [(.54,.017,.022,.015),(.596,.066,.034,.018),(.704,.102,.0008,.0008)],
            [p['icebody'],p['iceplane'],p['icefracture']],[1,0,0,1,2,0,0,1]).location.y=.016
        for side in (-1,1):
            close_normals(outline('Rimepiercer socket retaining tongue',
                [(side*.022,.505),(side*.043,.548),(side*.043,.600),(side*.023,.576)],.006,p['frostedge'],root,.001)).location.y=-.026
        root['sourceDesign']='Long triangular steel spike; unequal seated split frost barbs; indigo grip'

    def hailcaller(root,p):
        p=materials(p);wrapped(root,p)
        close_normals(lathe('Hailcaller weighted forged haft',
            [(-.15,.024),(-.13,.029),(-.11,.022),(.16,.022),(.32,.028),(.445,.034),(.50,.050)],p['froststeel'],root,32))
        close_normals(lathe('Hailcaller hollow cupped iron growth bed',
            [(.425,.031),(.45,.059),(.484,.091),(.528,.106),(.55,.103),(.55,.089),(.515,.082),(.485,.064),(.45,.026)],p['froststeel'],root,32))
        for name,center,scale,seed,tilt in [
            ('dominant oblique mineral mass',(-.063,-.015,.64),(.132,.095,.30),2,-.32),
            ('slender opposed offshoot',(.086,.010,.604),(.060,.057,.195),5,.39),
            ('unequal rear offshoot',(.018,.066,.67),(.049,.051,.209),8,-.17)]:
            obj=facet_chunk(root,'Hailcaller '+name,center,scale,p,seed)
            c=Vector(center);obj.data.transform(Matrix.Translation(c) @ Matrix.Rotation(tilt,4,'Y') @ Matrix.Translation(-c))
            # A broad oblique break and selected flank, not parallel white caps.
            for vertex in obj.data.vertices:
                if vertex.co.z>center[2]+scale[2]*.25:vertex.co.z+=(vertex.co.x-center[0])*.42
            for face in obj.data.polygons:
                if face.material_index==2:face.material_index=1
            obj.data.polygons[14 if seed==2 else 11].material_index=2
        # Flat forged retaining fingers cross the unpolished heels and end
        # below the exposed striking faces, leaving the three masses legible.
        for side,z in [(-1,.624),(1,.579)]:
            close_normals(outline('Hailcaller forged socket claw',
                [(side*.055,.46),(side*.116,.493),(side*.145,z-.033),(side*.135,z),
                 (side*.115,z-.008),(side*.102,.525),(side*.045,.50)],.014,p['froststeel'],root,.002)).location.y=-.087
        close_normals(tube('Hailcaller rear socket lug',[(0,.035,.46),(0,.113,.526),(0,.137,.643)],
                          [.023,.026,.017],p['froststeel'],root,8))
        root['sourceDesign']='Three unequal angular striking masses seated in a heavy clawed socket'

    def winterbranch(root,p):
        p=materials(p)
        branches=[
            ([(-.014,0,-.145),(.001,.003,.03),(-.023,.009,.22),(-.015,.012,.34),(.039,.006,.52),(.099,.014,.70),(.070,.005,.874)],
             [.019,.023,.029,.035,.029,.019,.007]),
            ([(-.022,.009,.255),(-.075,.004,.37),(-.145,-.002,.49),(-.185,-.003,.588),(-.213,-.002,.575)],
             [.028,.025,.021,.014,.006]),
            ([(.041,.006,.527),(.117,.013,.57),(.167,.021,.621),(.168,.021,.658)],
             [.022,.017,.011,.005])]
        wood=[]
        for index,(points,radii) in enumerate(branches):
            points,radii=curved(points,radii,10)
            wood.append(close_normals(tube('Winterbranch continuous pale limb '+str(index),points,radii,p['pale'],root,16,ridged=.045)))
        bpy.ops.object.select_all(action='DESELECT')
        for obj in wood:obj.select_set(True)
        bpy.context.view_layer.objects.active=wood[0];bpy.ops.object.join();grown=wood[0]
        grown.name='Winterbranch unified low fork and weathered stem'
        remesh=grown.modifiers.new('Fused naturally swollen branch junctions','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.0035
        bpy.ops.object.modifier_apply(modifier=remesh.name)
        smooth=grown.modifiers.new('Restrained branch junction smoothing','SMOOTH');smooth.factor=.65;smooth.iterations=2;bpy.ops.object.modifier_apply(modifier=smooth.name)
        for f in grown.data.polygons:f.use_smooth=True
        bark=surfaces.scanned_bark(grown,branches,curved,Path(h['OUT'])/'references')
        bark.name='Winterbranch CC0 growth-aligned pale weathered bark'
        nodes,links=bark.node_tree.nodes,bark.node_tree.links;shader=nodes.get('Principled BSDF')
        diffuse=next(n for n in nodes if n.type=='TEX_IMAGE' and 'Diffuse' in n.image.name)
        desat=nodes.new('ShaderNodeHueSaturation');desat.inputs['Saturation'].default_value=.28;desat.inputs['Value'].default_value=1.15
        links.new(diffuse.outputs['Color'],desat.inputs['Color'])
        pale=nodes.new('ShaderNodeMixRGB');pale.inputs[0].default_value=.79;pale.inputs[1].default_value=(.37,.40,.34,1);links.new(desat.outputs['Color'],pale.inputs[2])
        links.new(pale.outputs[0],shader.inputs['Base Color'])
        close_normals(grown)
        # Drooping unequal smoky mineral buds sit inside grown wood calyces.
        for index,(x,y,z,size) in enumerate([(-.211,-.002,.532,.091),(.168,.021,.618,.067),(.070,.005,.827,.079)]):
            bud=facet_chunk(root,'Winterbranch split-grown smoky frost'+str(index),(x,y,z),(size*.25,size*.22,size),p,index+4)
            center=Vector((x,y,z))
            bud.data.transform(Matrix.Translation(center) @ Matrix.Rotation(.23 if index==0 else -.18,4,'Y') @ Matrix.Translation(-center))
            for face in bud.data.polygons:
                if face.material_index==2:face.material_index=0
            for side in (-1,1):
                close_normals(tube('Winterbranch exposed split wood finger',
                    [(x+side*size*.12,y+.003,z+size*.45),(x+side*size*.21,y+.002,z+size*.27),(x+side*size*.14,y+.001,z+size*.14)],
                    [size*.10,size*.08,size*.025],bark,root,7))
        root['sourceDesign']='Pale crooked wood, fused low fork and three unequal drooping mineral buds'

    def band(root,name,rx,ry,z,height,thickness,mat,segments=64):
        verts=[]
        for iz,radial in [(-height/2,0),(height/2,0),(-height/2,-thickness),(height/2,-thickness)]:
            for i in range(segments):
                a=i*math.tau/segments
                verts.append(((rx+radial)*math.cos(a),(ry+radial)*math.sin(a),z+iz))
        faces=[]
        for i in range(segments):
            j=(i+1)%segments
            faces.extend([(i,j,segments+j,segments+i),
                          (2*segments+i,3*segments+i,3*segments+j,2*segments+j),
                          (segments+i,segments+j,3*segments+j,3*segments+i),
                          (i,2*segments+i,2*segments+j,j)])
        return close_normals(mesh(name,verts,faces,mat,root,bevel=.0007))

    def worn_materials(p):
        q=materials(p)
        q.update(gold=m('Blackened crown gold',(.18,.091,.025),.84,.38),
                 goldedge=m('Crown exposed burnished lip',(.43,.235,.070),.88,.3),
                 garnet=m('Protected garnet enamel',(.15,.009,.014),.28,.26),
                 bronze=m('Bell warm cast bronze',(.26,.12,.045),.78,.4),
                 patina=m('Bell protected green patina',(.035,.088,.078),.35,.66),
                 purple=m('Compressed purple woven hanger',(.055,.018,.084),0,.8),
                 silver=m('Storm reliquary dark silver',(.095,.11,.135),.88,.32),
                 silveredge=m('Storm reliquary exposed silver edge',(.37,.42,.47),.9,.26),
                 violet=m('Stormstone deep violet mineral',(.034,.009,.088),.15,.27))
        return q

    def suspension(root,p,bottom=-.041,mat=None,name='Suspension'):
        # Closed oval iron link in presentation plane, with true open center.
        pts=[]
        for i in range(33):
            a=i*math.tau/32;pts.append((.012*math.sin(a),0,bottom/2+abs(bottom)*.42*math.cos(a)))
        return close_normals(tube(name+' closed mounting eye',pts,[.0035]*len(pts),mat or p['silver'],root,8))

    def inferno(root,p):
        p=worn_materials(p)
        band(root,'Inferno forged elliptical circlet',.13,.098,0,.024,.007,p['gold'])
        band(root,'Inferno restrained worn lower rim',.131,.099,-.0095,.004,.008,p['goldedge'])
        # Teeth follow the actual band surface; their lower roots overlap it.
        for index,(angle,height,lean,width) in enumerate([(-2.50,.042,-.009,.024),(-2.05,.062,.014,.027),(-1.57,.083,-.006,.033),(-1.04,.052,-.012,.025),(-.63,.036,.010,.022)]):
            tooth=outline('Inferno flame tooth '+str(index),
                [(-width,.006),(-width*.78,.028),(-width*.36,height*.77),
                 (lean,height),(width*.23,height*.48),(width,.025),(width*.78,.006)],
                .004,p['gold'],root,.001)
            tooth.rotation_euler.z=angle+math.pi/2
            tooth.location=(.126*math.cos(angle),.095*math.sin(angle),0);close_normals(tooth)
            inset=outline('Inferno recessed garnet flame '+str(index),
                [(-width*.48,.012),(-width*.37,.03),(lean*.65,height*.75),
                 (width*.44,.025),(width*.32,.012)],.0013,p['garnet'],root,.0005)
            inset.rotation_euler.z=angle+math.pi/2
            inset.location=(.132*math.cos(angle),.101*math.sin(angle),0);close_normals(inset)
        # Rear fastening plate bridges an actual fitted tie band, not a halo.
        close_normals(outline('Inferno rear hammered fastening plate',[(-.027,-.008),(-.028,.01),(.024,.01),(.028,-.008)],.002,p['goldedge'],root,.001)).location.y=.099
        for side in (-1,1):
            close_normals(tube('Inferno rear tie strap',[(side*.035,.092,0),(side*.052,.087,-.014),(side*.061,.080,-.023)], [.006,.005,.004],p['binding'],root,6))
        root['attachmentAnchor']='band-center';root['distalTip']=[0,-.095,.083]
        root['sourceDesign']='Open elliptical blackened gold circlet; five unequal flame teeth and rear fastening'

    def wardenheart(root,p):
        p=worn_materials(p);suspension(root,p,bottom=-.04,name='Winterheart')
        # Heart is deliberately asymmetric stone, not a geometric heart icon.
        shape=[(-.008,-.05),(-.047,-.040),(-.070,-.070),(-.063,-.117),(-.012,-.188),
               (.037,-.155),(.067,-.092),(.048,-.051),(.023,-.043)]
        stone=outline('Winterheart irregular blue granite heart',shape,.018,p['icebody'],root,.0014);close_normals(stone)
        stone.data.materials.append(p['iceplane']);stone.data.materials.append(p['icefracture'])
        for face in stone.data.polygons:
            if abs(face.normal.y)<.5:face.material_index=2 if face.center.z<-.11 else 1
        # Quiet mineral color variation, grain subordinate to actual planes.
        nt=p['icebody'].node_tree;bs=nt.nodes.get('Principled BSDF')
        noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=46;noise.inputs['Detail'].default_value=2
        ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.019,.045,.062,1);ramp.color_ramp.elements[1].color=(.10,.16,.185,1)
        nt.links.new(noise.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs[0],bs.inputs['Base Color'])
        for index,pts in enumerate([
            [(-.042,.019,-.044),(-.065,.009,-.066),(-.064,-.023,-.078),(-.047,-.025,-.088)],
            [(.031,.019,-.045),(.060,.009,-.065),(.059,-.023,-.083),(.041,-.025,-.093)],
            [(-.006,.019,-.186),(-.005,-.021,-.18),(.003,-.024,-.15)]]):
            close_normals(tube('Winterheart articulated iron claw '+str(index),pts,[.006]*len(pts),p['froststeel'],root,8))
        close_normals(tube('Winterheart protected cold seam',[(-.008,-.019,-.052),(-.017,-.019,-.084),(.008,-.019,-.114),(-.004,-.019,-.139)],[.0009,.0012,.0007,.0003],p['iceplane'],root,6))
        root['attachmentAnchor']='top-suspension';root['distalTip']=[-.012,0,-.189]
        root['sourceDesign']='Irregular granite heart in three seated articulated iron claws'

    def thunderbell(root,p):
        p=worn_materials(p)
        suspension(root,p,bottom=-.039,mat=p['bronze'],name='Thunderbell')
        close_normals(outline('Thunderbell purple suspension strap',[(-.013,-.021),(-.014,-.061),(.011,-.071),(.015,-.023)],.004,p['purple'],root,.001))
        # Revolved open bell with inner wall returning to the shoulder: actual
        # hollow mouth, scalloped skirt and variable cast-wall thickness.
        sections=[(-.059,.016),(-.073,.034),(-.107,.042),(-.15,.049),(-.191,.069),(-.214,.079),(-.219,.079),
                  (-.217,.071),(-.188,.061),(-.151,.041),(-.109,.034),(-.077,.026),(-.068,.01)]
        n=64;v=[]
        for row,(z,r) in enumerate(sections):
            for i in range(n):
                a=i*math.tau/n;scallop=.0045*math.cos(7*a) if row in (5,6,7) else 0
                v.append((r*math.cos(a),r*math.sin(a),z+scallop))
        faces=[]
        for row in range(len(sections)-1):
            for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
        faces.extend([tuple(reversed(range(n))),tuple((len(sections)-1)*n+i for i in range(n))])
        bell=close_normals(mesh('Thunderbell hollow cast body and scalloped mouth',v,faces,p['bronze'],root,bevel=.0006));bell.data.materials.append(p['patina'])
        for face in bell.data.polygons:
            face.material_index=1 if 7*n<=face.index<11*n else 0;face.use_smooth=True
        close_normals(tube('Thunderbell visible clapper stem',[(0,0,-.071),(0,0,-.194)],[.003,.004],p['froststeel'],root,10))
        close_normals(lathe('Thunderbell solid swinging clapper',[(-.238,.001),(-.232,.013),(-.22,.017),(-.206,.01),(-.197,.004)],p['bronze'],root,20))
        for z,r in [(-.092,.039),(-.17,.058)]:band(root,'Thunderbell worn cast raised band',r,r,z,.004,.0025,p['goldedge'])
        root['attachmentAnchor']='top-suspension';root['distalTip']=[0,0,-.239]
        root['sourceDesign']='Hollow flared bronze temple bell, scalloped rim, exposed clapper and purple hanger'

    def stormorbit(root,p):
        p=worn_materials(p);suspension(root,p,bottom=-.043,name='Stormorbit')
        close_normals(lathe('Stormorbit upper three-arm hub',[(-.053,.011),(-.046,.019),(-.038,.016),(-.034,.008)],p['silver'],root,24))
        # Three structural longitudinal arms; open windows reveal offset gem.
        for index,angle in enumerate([-.28,1.91,3.93]):
            pts=[]
            for j in range(19):
                a=.12+(math.pi-.24)*j/18;r=.087*math.sin(a)
                pts.append((r*math.cos(angle),r*math.sin(angle),-.131+.087*math.cos(a)))
            close_normals(tube('Stormorbit forged longitudinal cage arm '+str(index),pts,[.0045+.0015*math.sin(j*math.pi/18) for j in range(19)],p['silver'],root,8))
        band(root,'Stormorbit irregular equatorial retaining ring',.088,.088,-.135,.006,.004,p['silveredge'],48)
        close_normals(lathe('Stormorbit lower seated hub',[(-.233,.001),(-.226,.012),(-.217,.017),(-.209,.008)],p['silver'],root,24))
        crystal=facet_chunk(root,'Stormorbit offset faceted stormstone',(.014,-.010,-.126),(.053,.044,.123),dict(p,icebody=p['violet'],iceplane=p['icebody'],icefracture=p['iceplane']),3)
        for side in (-1,1):
            close_normals(tube('Stormorbit root retaining pin',[(side*.017,0,-.213),(side*.020,-.006,-.168)],[.005,.003],p['silver'],root,8))
        root['attachmentAnchor']='top-suspension';root['distalTip']=[0,0,-.234]
        root['sourceDesign']='Open three-arm dark silver cage around an offset violet stormstone'

    def wintercrown(root,p):
        p=materials(p);wrapped(root,p)
        close_normals(lathe('Endless Winter central forged shaft',[(-.30,.013),(-.277,.022),(-.14,.023),(.16,.021),(.61,.023),(.88,.032),(.965,.045)],p['froststeel'],root,32))
        # Three restrained twists become the crown roots, with no loose wire.
        for k in range(3):
            pts=[]
            for j in range(36):
                z=.17+j*.76/35;a=k*math.tau/3+j*.065;r=.021+.011*(j/35)**3
                pts.append((r*math.cos(a),r*math.sin(a),z))
            close_normals(tube('Endless Winter twisted forged ridge '+str(k),pts,[.005]*36,p['frostedge'],root,6))
        close_normals(lathe('Endless Winter crown root socket',[(.87,.027),(.916,.048),(.941,.068),(.971,.070),(.986,.054)],p['froststeel'],root,32))
        for i,(a,h,r) in enumerate([(-2.6,1.18,.11),(-1.6,1.265,.09),(-.5,1.20,.125),(.8,1.16,.095),(2,1.23,.105)]):
            tine=section_solid(root,'Endless Winter unequal icicle tine '+str(i),[(.933,0,.02,.014),(.99,r*.56,.032,.016),(h-.07,r,.02,.013),(h,r*.85,.0006,.0006)],[p['icebody'],p['iceplane']])
            tine.rotation_euler.z=a
            cap=section_solid(root,'Endless Winter restricted fractured tine tip '+str(i),[(h-.022,r*.9,.006,.0038),(h+.0008,r*.85,.00065,.00065)],[p['icefracture'],p['iceplane']]);cap.rotation_euler.z=a
        root['sourceDesign']='Twisted dark steel staff with an open unequal crown of five icicle tines'

    def tideglass(root,p):
        p=materials(p);wrapped(root,p)
        close_normals(lathe('Tideglass shell pommel',[(-.158,.003),(-.148,.028),(-.128,.033),(-.112,.024)],p['frostedge'],root,28))
        # Flowing broad wave, modeled ridge and hooked lower edge. Layered
        # mineral planes remain opaque for the measured item runtime budget.
        section_solid(root,'Tideglass continuous flowing wave blade',[(.148,0,.036,.021),(.23,.038,.097,.026),(.40,.079,.107,.03),(.62,.062,.073,.025),(.80,.008,.050,.02),(.936,-.047,.0007,.0007)],
                      [p['icebody'],p['frostedge'],p['iceplane']],[1,2,0,1,1,2,0,1])
        section_solid(root,'Tideglass lower recurved hook',[(.177,-.013,.03,.016),(.24,-.092,.039,.02),(.32,-.123,.017,.012),(.362,-.112,.0007,.0007)], [p['icebody'],p['frostedge']])
        for side in (-1,1):
            pts=[(side*.013,0,.123),(side*.08,-.005,.127),(side*.134,-.002,.169),(side*.129,.005,.229),(side*.094,.009,.252)]
            close_normals(tube('Tideglass open swept shell guard',pts,[.016,.015,.011,.009,.004],p['frostedge'],root,10))
        close_normals(outline('Tideglass lower shell seat',[(-.055,.111),(-.05,.156),(.05,.156),(.06,.129),(.02,.098)],.021,p['froststeel'],root,.002))
        root['sourceDesign']='Opaque layered teal wave blade, recurved heel and open silver shell guard'

    return {'icespear':icespear,'hailcaller':hailcaller,'winterbranch':winterbranch,
            'wintercrown':wintercrown,'tideglass':tideglass,'inferno':inferno,
            'wardenheart':wardenheart,'thunderbell':thunderbell,'stormorbit':stormorbit}
