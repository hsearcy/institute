"""Opt-in scavenged equipment for native skeleton silhouette studies.

No public writes. Fits the pinned anatomical source before rigid articulation;
all attachments use existing joints and keep ribs/elbows/wrists exposed.
"""
import math
import re
import bpy
from mathutils import Vector
from mathutils.geometry import convex_hull_2d


def build(collection):
    factor=float(collection['sourceScale']);ground=float(collection['sourceGround'])
    def point(x,y,z):return Vector((x*factor,y*factor,(z-ground)*factor))
    def material(name,low,high,roughness,wear_color=None):
        m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
        p.inputs['Roughness'].default_value=roughness;p.inputs['Specular IOR Level'].default_value=.22
        noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5;noise.inputs['Detail'].default_value=2
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(*low,1);ramp.color_ramp.elements[1].color=(*high,1)
        l.new(noise.outputs['Fac'],ramp.inputs[0]);color=ramp.outputs['Color']
        if wear_color:
            worn=n.new('ShaderNodeAttribute');worn.attribute_name='RemnantWear'
            edge=n.new('ShaderNodeMath');edge.operation='POWER';edge.inputs[1].default_value=4
            l.new(worn.outputs['Fac'],edge.inputs[0])
            pressure=n.new('ShaderNodeAttribute');pressure.attribute_name='RemnantPressure'
            mix=n.new('ShaderNodeMixRGB');mix.blend_type='MIX';mix.inputs[2].default_value=(*wear_color,1)
            l.new(edge.outputs[0],mix.inputs[0]);l.new(color,mix.inputs[1])
            protected=n.new('ShaderNodeMixRGB');protected.blend_type='MULTIPLY';protected.inputs[2].default_value=(.55,.50,.43,1)
            l.new(pressure.outputs['Fac'],protected.inputs[0]);l.new(mix.outputs[0],protected.inputs[1]);color=protected.outputs[0]
            rough=n.new('ShaderNodeMapRange');rough.inputs['From Min'].default_value=0;rough.inputs['From Max'].default_value=1
            rough.inputs['To Min'].default_value=roughness;rough.inputs['To Max'].default_value=.9
            l.new(edge.outputs[0],rough.inputs['Value']);l.new(rough.outputs['Result'],p.inputs['Roughness'])
        l.new(color,p.inputs['Base Color'])
        return m
    leather=material('Scavenged umber leather',(.075,.047,.024),(.20,.14,.080),.79,wear_color=(.26,.183,.103))
    edging=material('Compressed leather edge',(.055,.031,.016),(.12,.070,.030),.66,wear_color=(.18,.115,.057))
    cloth=material('Faded warm grey cloth',(.085,.079,.064),(.19,.17,.12),.94)
    created=[]
    def mesh(name,vertices,faces,mat,joint,thickness=.003,bevel=.001,wear=None,pressure=None):
        data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.materials.append(mat);data.update()
        for label,values in [('RemnantWear',wear),('RemnantPressure',pressure)]:
            attribute=data.attributes.new(label,'FLOAT','POINT')
            for i,item in enumerate(attribute.data):item.value=values[i] if values else .25 if label=='RemnantPressure' and mat==edging else 0
        obj=bpy.data.objects.new(name,data);collection.objects.link(obj);obj['authoredEquipmentJoint']=joint;obj['authoredRemnant']=True;obj['part']=joint
        bpy.context.view_layer.objects.active=obj
        if thickness:
            m=obj.modifiers.new('Actual leather thickness','SOLIDIFY');m.thickness=thickness;m.offset=0;bpy.ops.object.modifier_apply(modifier=m.name)
        if bevel:
            m=obj.modifiers.new('Worn edge bevel','BEVEL');m.width=bevel;m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
        for face in obj.data.polygons:face.use_smooth=True
        created.append(obj);return obj
    def shell(name,start,end,axis,outward,radius0,radius1,angles,mat,joint,rows=4,columns=12,shaped=False):
        axis=axis.normalized();outward=(outward-axis*outward.dot(axis)).normalized();across=axis.cross(outward).normalized()
        vertices=[];faces=[];wear=[];pressure=[]
        for r in range(rows+1):
            t=r/rows;center=start.lerp(end,t);radius=radius0*(1-t)+radius1*t
            for c in range(columns+1):
                u=c/columns;a=angles[0]*(1-u)+angles[1]*u
                # Broad compression crease, not uniform noisy edge damage.
                shape=1-.025*math.sin(t*math.pi)*math.cos(u*math.tau)
                edge_t=t*(.78+.22*math.sin(u*math.pi)) if shaped else t
                center=start.lerp(end,edge_t)
                vertices.append(center+(outward*math.cos(a)+across*math.sin(a))*radius*shape)
                wear.append(1 if r in (0,rows) else .85 if c in (0,columns) else 0)
                pressure.append(.55 if shaped and r==0 else .16 if shaped and r==1 else 0)
        for r in range(rows):
            for c in range(columns):
                i=r*(columns+1)+c;faces.append((i,i+1,i+columns+2,i+columns+1))
        return mesh(name,vertices,faces,mat,joint,wear=wear,pressure=pressure)
    shoulder=point(-.185,-.020,1.442);elbow=point(-.339,.014,1.163);wrist=point(-.414,-.060,.942)
    upper=(elbow-shoulder).normalized();outside=Vector((-1,-.45,0))
    # A domed upper cap groups the actual shoulder joint. Its rounded lower
    # edge overlaps a crescent lame rather than two flat hanging rectangles.
    outward=(outside-upper*outside.dot(upper)).normalized();across=upper.cross(outward).normalized()
    vertices=[];faces=[];wear=[];pressure=[];profile=(.022,.047,.068,.080,.081,.076,.069);columns=12
    for row,radius in enumerate(profile):
        t=row/(len(profile)-1)
        for c in range(columns+1):
            u=c/columns;a=-1.60+3.20*u
            axial=-.062+.143*t-(.012*(1-math.sin(u*math.pi))*t**3)
            center=shoulder+upper*axial*factor
            vertices.append(center+(outward*math.cos(a)+across*math.sin(a))*radius*factor)
            wear.append(1 if row==0 or c in (0,columns) else 0)
            pressure.append(.45 if row==len(profile)-1 else .18 if row==len(profile)-2 else 0)
    for row in range(len(profile)-1):
        for c in range(columns):
            i=row*(columns+1)+c;faces.append((i,i+1,i+columns+2,i+columns+1))
    mesh('Fitted curved shoulder cap',vertices,faces,leather,'ArmUpperL',thickness=.005,wear=wear,pressure=pressure)
    shell('Shaped overlapping shoulder lame',shoulder+upper*.065*factor,shoulder+upper*.150*factor,upper,outside,.076*factor,.055*factor,(-1.40,1.40),leather,'ArmUpperL',shaped=True)
    # The narrow band visibly passes around the open inner side beneath the
    # cap, providing a real retaining connection without filling the axilla.
    vertices=[];faces=[];columns=16
    for row in range(2):
        for c in range(columns+1):
            a=1.60+(math.tau-3.20)*c/columns
            # At the open cap edges the band seats on leather. Around the
            # inner arm it follows the small humerus, not the cap's diameter.
            radius=(.026+.051*math.sin(a)**2)*factor
            center=shoulder+upper*(.046+.014*row)*factor
            vertices.append(center+(outward*math.cos(a)+across*math.sin(a))*radius)
    for c in range(columns):faces.append((c,c+1,c+columns+2,c+columns+1))
    mesh('Fitted inner shoulder retaining strap',vertices,faces,edging,'ArmUpperL',thickness=.0035)
    # The open side exposes the paired bones; neither joint is covered.
    lower=(wrist-elbow).normalized();start=elbow.lerp(wrist,.37);end=elbow.lerp(wrist,.73)
    cuff_out=(Vector((-1,.20,0))-lower*Vector((-1,.20,0)).dot(lower)).normalized();cuff_across=lower.cross(cuff_out).normalized()
    shell('Open-sided scavenged forearm cuff',start,end,lower,cuff_out,.040*factor,.034*factor,(-1.50,1.50),leather,'ArmLowerL',rows=5)
    # Measure the actual strengthened radius/ulna cross-section. The strap
    # bridges their natural gap as a taut band, while leaving the longitudinal
    # gap exposed between the two narrow bands.
    forearm=[v.co.copy() for obj in collection.objects if obj.type=='MESH'
             and re.sub(r'\.\d{3}$','',obj.get('anatomicalSource','')).endswith('.R')
             and any(label in obj.get('anatomicalSource','') for label in ('arm_radius','arm_ulna')) for v in obj.data.vertices]
    def fitted_point(center,a):
        section=[Vector(((v-center).dot(cuff_out),(v-center).dot(cuff_across))) for v in forearm if abs((v-center).dot(lower))<.012*factor]
        if len(section)<6:raise ValueError('Insufficient forearm cross-section for fitted cuff')
        hull=[section[i] for i in convex_hull_2d(section)];direction=Vector((math.cos(a),math.sin(a)))
        origin=sum(hull,Vector((0,0)))/len(hull)
        hull=[p-origin for p in hull]
        cross=lambda u,v:u.x*v.y-u.y*v.x
        radii=[]
        for i,p in enumerate(hull):
            edge=hull[(i+1)%len(hull)]-p;den=cross(direction,edge)
            if abs(den)<1e-9:continue
            radius=cross(p,edge)/den;t=cross(p,direction)/den
            if radius>0 and 0<=t<=1:radii.append(radius)
        if not radii:raise ValueError('Cannot intersect the convex forearm envelope')
        position=origin+direction*(min(radii)+.0025*factor)
        return center+cuff_out*position.x+cuff_across*position.y
    for index,t in enumerate((.41,.67)):
        center=elbow.lerp(wrist,t);radius=(.040+(.034-.040)*(t-.37)/.36)*factor+.0015
        vertices=[];faces=[];columns=18
        for row in range(2):
            c=center+lower*(row*2-1)*.007
            for column in range(columns+1):
                a=1.50+(math.tau-3)*column/columns
                distance=min(a-1.50,math.tau-1.50-a)
                blend=max(0,1-distance/.45);blend=blend*blend*(3-2*blend)
                surface=fitted_point(c,a)
                anchor=c+(cuff_out*math.cos(a)+cuff_across*math.sin(a))*radius
                vertices.append(surface.lerp(anchor,blend))
        for c in range(columns):faces.append((c,c+1,c+columns+2,c+columns+1))
        mesh('Fitted forearm cuff band '+str(index),vertices,faces,edging,'ArmLowerL',thickness=.003)
    # Separate cloth panels hang from the existing pelvis belt, leaving the
    # center/front pelvic opening and the entire rib cage visible.
    for side,length in [(-1,.145),(1,.195)]:
        vertices=[];faces=[];columns=5;rows=7
        for r in range(rows+1):
            t=r/rows
            for c in range(columns+1):
                u=c/columns;x=side*(.079+.092*u+.012*t)
                hem=((-.006,.008,.015,.045,.027,.036) if side<0 else (.030,.025,.009,.014,.033,.062))[c]
                z=1.012-length*t-hem*t**5
                # Gathered attachment opens into a few broad vertical folds;
                # lower cloth hangs under gravity with one curled torn edge.
                y=-.073-.019*math.sin(u*math.pi)-.016*t
                y+=.014*math.sin(u*3*math.pi+.35)*(.25+.75*math.sin(t*math.pi/2))
                y+=.006*math.sin(u*7*math.pi)*(1-t)**2+.011*(u**4)*t**3
                vertices.append(point(x,y,z))
        for r in range(rows):
            for c in range(columns):
                i=r*(columns+1)+c
                # One missing lower corner gives a real tear silhouette.
                if r==rows-1 and c==(0 if side<0 else columns-1):continue
                faces.append((i,i+1,i+columns+2,i+columns+1))
        mesh('Torn pelvis cloth '+str(side),vertices,faces,cloth,'Body',thickness=.0015,bevel=.0005)
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in created)
    if triangles>7000:raise ValueError('Remnant study exceeded bounded geometry budget: '+str(triangles))
    collection['nativeRemnantsTriangles']=triangles
    return created
