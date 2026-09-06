"""Analytic forged surfaces and CC0 scan-derived bark geometry for item studies."""
import math
from pathlib import Path

import bpy
from mathutils import Vector, Matrix, kdtree


def forged_surface(root, materials):
    """Continuous ground bevels and spoon-ended fuller, without faceted caps."""
    nx,nz=40,160
    verts=[];faces=[];material_ids=[]
    levels=[(.178,.038,.012),(.235,.040,.012),(.28,.0387,.0114),(.55,.029,.009),(.725,.020,.0065),(.835,.0003,.0003)]
    def sample(z,index):
        for a,b in zip(levels,levels[1:]):
            if z<=b[0]:
                t=(z-a[0])/(b[0]-a[0]);return a[index]+t*(b[index]-a[index])
        return levels[-1][index]
    for side in (-1,1):
        for j in range(nz+1):
            z=levels[0][0]+(levels[-1][0]-levels[0][0])*j/nz
            width,depth=sample(z,1),sample(z,2)
            enter=max(0,min(1,(z-.246)/.042))
            leave=max(0,min(1,(.752-z)/.062))
            arc=math.sqrt(max(0,1-(1-enter)**2))*leave
            for i in range(nx+1):
                u=i/nx*2-1
                cutting=max(0,min(1,(abs(u)-.64)/.36))
                flat=depth*(1-cutting)+.0004*cutting
                groove=0
                if arc>.001:
                    across=abs(u)/(.25*arc)
                    if across<1:groove=.0042*(.5+.5*math.cos(across*math.pi))*enter*leave
                verts.append((u*width,side*(flat-groove),z))
    plane=(nx+1)*(nz+1)
    for side in range(2):
        for j in range(nz):
            for i in range(nx):
                a=side*plane+j*(nx+1)+i
                f=(a,a+1,a+nx+2,a+nx+1)
                faces.append(f if side==0 else tuple(reversed(f)))
                material_ids.append(1 if abs((i+.5)/nx*2-1)>.64 else 0)
    for j in range(nz):
        for i in (0,nx):
            a=j*(nx+1)+i;b=a+nx+1
            faces.append((a,b,b+plane,a+plane));material_ids.append(1)
    for j in (0,nz):
        for i in range(nx):
            a=j*(nx+1)+i
            faces.append((a,a+plane,a+plane+1,a+1));material_ids.append(0)
    data=bpy.data.meshes.new('Continuous forged blade surface')
    data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new('Forged blade with continuous spoon fuller',data)
    bpy.context.scene.collection.objects.link(obj);obj.parent=root
    data.materials.append(materials['steel']);data.materials.append(materials['edge'])
    for face,mat_id in zip(data.polygons,material_ids):
        face.use_smooth=True;face.material_index=mat_id
    return obj


def wrapped_hilt(root,materials,wear_color=(.18,.067,.033,1)):
    """Compressed leather over an oval wooden grip, with thin overlapping edges."""
    sides,levels=64,260;verts=[];faces=[]
    for j in range(levels+1):
        z=-.105+.221*j/levels
        for i in range(sides):
            angle=i*math.tau/sides
            phase=((z+.105)/.028-angle/math.tau)%1
            seam=.00060*math.exp(-phase/.045)
            scale=1-.07*j/levels
            # A rounded rectangular core gives broad compressed leather faces;
            # the surface is not a row of separate toroidal bolsters.
            c,s=math.cos(angle),math.sin(angle)
            pressure=.00055*max(0,-s)**2*math.sin(math.pi*j/levels)**2
            x=(.024*scale+seam-pressure)*math.copysign(abs(c)**.58,c)
            y=(.017*scale+seam-pressure)*math.copysign(abs(s)**.58,s)
            verts.append((x,y,z))
    for j in range(levels):
        for i in range(sides):
            a=j*sides+i;b=j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple(levels*sides+i for i in range(sides))])
    data=bpy.data.meshes.new('Compressed overlapping leather grip')
    data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new('Flat leather wrapped oval grip',data);bpy.context.scene.collection.objects.link(obj);obj.parent=root
    leather=materials['leather'].copy();leather.name='Handled leather with local pressure wear'
    wear=data.attributes.new('GripWear','FLOAT','POINT')
    for vertex in data.vertices:
        z=vertex.co.z
        wear.data[vertex.index].value=.33*max(0,-vertex.co.y/.017)*max(0,math.sin((z+.105)/.221*math.pi))**2
    nodes,links=leather.node_tree.nodes,leather.node_tree.links;bsdf=nodes.get('Principled BSDF')
    prior=bsdf.inputs['Base Color'].links[0].from_socket
    attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='GripWear'
    mixed=nodes.new('ShaderNodeMixRGB');mixed.inputs[2].default_value=wear_color
    links.new(attribute.outputs['Fac'],mixed.inputs[0]);links.new(prior,mixed.inputs[1]);links.new(mixed.outputs[0],bsdf.inputs['Base Color'])
    data.materials.append(leather)
    for f in data.polygons:f.use_smooth=True
    return obj


def fractured_coal(root,materials):
    """Unequal short charcoal planes separated by chipped cellular valleys."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=6,radius=1)
    obj=bpy.context.object;obj.name='Thermally fractured charcoal mass';obj.parent=root
    seeds=[Vector(p).normalized() for p in [(-.50,-.8,.5),(.50,-.8,.2),(-.25,-.8,-.65),(.65,.3,-.3),(-.6,.4,.2),(.1,.3,.85),(.2,.4,-.75)]]
    center=Vector((-.026,-.027,.530));records=[]
    turn=Matrix.Rotation(.38,3,'Z')@Matrix.Rotation(-.10,3,'X')
    for vertex in obj.data.vertices:
        q=vertex.co.copy()
        scores=sorted(((q.dot(n)+.016*math.sin(q.x*19+i*3)*math.sin(q.z*13+i),i) for i,n in enumerate(seeds)),reverse=True)
        gap=scores[0][0]-scores[1][0];index=scores[0][1]
        # Each broad region is nearly planar. Uneven recession into the gap
        # and short layered chips disturb the lip without inflating soft lobes.
        plane=.82/max(.48,q.dot(seeds[index]))
        width=.045+.022*math.sin(q.z*17+q.x*8)**2
        valley=max(0,1-gap/width)
        scallop=.75+.25*math.sin(q.z*35+q.x*23)*math.sin(q.y*29-q.z*17)
        radius=plane-.16*valley**1.6*scallop
        radius+=.0012*math.sin(q.z*71+q.x*9)*math.sin(q.y*42+q.x*51)
        radius-=.004*(.5+.5*math.sin(q.z*96+q.x*7))**12*(1-valley)
        # A few broad, interrupted brittle lips cross the exposed planes.
        # Actual relief catches raking light on the formerly smooth right
        # face; the lower face no longer relies on dense fine pitting.
        if index==1:
            # The diagnosed right-front face needs an actual broad change of
            # level, not several small wrinkles returning to the same plane.
            # One sloping shelf cuts across it; unequal missing sections break
            # its lip while the upper field remains recessed by a real step.
            # Intersect two genuinely different fracture planes. A radial
            # height step left both large fields almost parallel in v17.
            # This oblique upper plane changes the normal by about 25deg;
            # unequal edge losses interrupt its intersection with the lower.
            normal=seeds[index]+Vector((-.18,0,.48))
            offset=.835-.018*max(0,math.sin(q.y*13+q.x*7))**3
            upper=offset/max(.30,q.dot(normal))
            radius=min(radius,upper-.16*valley**1.6*scallop)
        else:
            layer=q.z+.18*q.x+.035*math.sin(q.y*6)
            for height,phase in ((-.46,.4),(.035,2.1),(.48,4.3)):
                d=layer-height-.025*math.sin(q.x*4+phase)
                coverage=.30+.70*max(0,math.sin(q.y*3+q.x*6+phase))
                lip=.028*math.exp(-(d/.024)**2)-.045*math.exp(-((d-.038)/.042)**2)
                radius+=lip*coverage*(1-valley)**1.8
        vertex.co=center+turn@Vector((q.x*.025*radius,q.y*.018*radius,q.z*.035*radius))
        records.append((q,gap))
    charcoal=materials['char'].copy();charcoal.name='Brittle laminated charcoal across exposed faces'
    nodes,links=charcoal.node_tree.nodes,charcoal.node_tree.links;shader=nodes.get('Principled BSDF')
    broad=nodes.new('ShaderNodeTexNoise');broad.inputs['Scale'].default_value=5;broad.inputs['Detail'].default_value=2
    layers=nodes.new('ShaderNodeTexWave');layers.wave_type='BANDS';layers.bands_direction='Z'
    layers.inputs['Scale'].default_value=12;layers.inputs['Distortion'].default_value=7
    layers.inputs['Detail Scale'].default_value=1.8
    mixed=nodes.new('ShaderNodeMixRGB');mixed.inputs[0].default_value=.12
    links.new(broad.outputs['Fac'],mixed.inputs[1]);links.new(layers.outputs['Color'],mixed.inputs[2])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.0006
    prior=shader.inputs['Normal'].links[0].from_socket
    links.new(prior,bump.inputs['Normal']);links.new(mixed.outputs[0],bump.inputs['Height']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.006,.007,.008,1);ramp.color_ramp.elements[1].color=(.015,.016,.018,1)
    links.new(broad.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],shader.inputs['Base Color'])
    obj.data.materials.append(charcoal)
    for face in obj.data.polygons:face.use_smooth=True
    vertices=[];faces=[]
    for face in obj.data.polygons:
        q=sum((records[i][0] for i in face.vertices),Vector())/3
        gap=sum(records[i][1] for i in face.vertices)/3
        # Interrupt naturally occurring seam interiors, never trace a drawn
        # line. The quiet rear stays entirely charcoal.
        active=(q.z>.03 and q.z<.37 and q.x>-.20) or (-.55<q.z<-.39 and q.x<.13)
        if gap>.027 or q.y>-.65 or not active:continue
        start=len(vertices)
        for i in face.vertices:
            p=obj.data.vertices[i].co;vertices.append(tuple(p+(p-center).normalized()*.00004))
        faces.append((start,start+1,start+2))
    if not faces:raise ValueError('Missing incandescent fracture interiors')
    data=bpy.data.meshes.new('Recessed irregular ember pockets');data.from_pydata(vertices,[],faces);data.update()
    hot=bpy.data.objects.new('Interrupted incandescent coal interiors',data);bpy.context.scene.collection.objects.link(hot);hot.parent=root;data.materials.append(materials['ember'])
    # A substantial missing upper corner interrupts the rectangular outline.
    # Two offset brittle ledges expose the laminated break rather than adding
    # another superficial incision to an intact block.
    for offset,dimensions,angle in [((-.019,-.010,.027),(.031,.047,.038),.41),((-.006,-.006,.035),(.027,.036,.019),-.28)]:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=center+turn@Vector(offset))
        cutter=bpy.context.object;cutter.name='Temporary oblique brittle charcoal loss';cutter.dimensions=dimensions
        cutter.rotation_euler=(turn@Matrix.Rotation(angle,3,'Y')@Matrix.Rotation(.23,3,'Z')).to_euler()
        bpy.context.view_layer.objects.active=cutter;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        modifier=obj.modifiers.new('Sloping fractured charcoal corner','BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(cutter,do_unlink=True)
    # Shape the entire exposed mass into a skewed wedge. The seated lower
    # footprint stays unchanged while both upper sides converge unequally;
    # this removes the remaining upright block silhouette, not just its notch.
    inverse=turn.inverted()
    for part in (obj,hot):
        for vertex in part.data.vertices:
            q=inverse@(vertex.co-center)
            t=max(0,min(1,(q.z+.035)/.070))
            q.x=q.x*(1-.45*t)+.004*math.sin(t*math.pi)-.008*t
            q.y*=1-.15*t
            vertex.co=center+turn@q
    return obj


def scanned_bark(obj, branches, curved_path, directory):
    """Bind scan coordinates to growth paths, displace actual plate relief.

    Poly Haven Pine Bark by Dimitrios Savva, CC0. Each sampled centerline stores
    its tangent and arclength so grain follows the fork rather than world Z.
    """
    directory=Path(directory)
    images={}
    for kind in ('Diffuse','Displacement','Rough'):
        path=directory/(kind+'.jpg')
        if not path.exists():raise FileNotFoundError('Run items/fetch_references.py: '+str(path))
        images[kind]=bpy.data.images.load(str(path),check_existing=True)
        if kind!='Diffuse':images[kind].colorspace_settings.name='Non-Color'
    centers=[]
    for branch,(control,radii) in enumerate(branches):
        points,rs=curved_path(control,radii,18);length=0
        for i,point in enumerate(points):
            if i:length+=(Vector(point)-Vector(points[i-1])).length
            tangent=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
            across=tangent.cross(Vector((0,1,0))).normalized()
            centers.append((Vector(point),tangent,across,tangent.cross(across),length,rs[i],branch))
    kd=kdtree.KDTree(len(centers))
    for index,c in enumerate(centers):kd.insert(c[0],index)
    kd.balance()
    im=images['Displacement'];pixels=list(im.pixels);w,h=im.size
    uv_points=[]
    for vertex in obj.data.vertices:
        _,index,_=kd.find(vertex.co)
        center,tangent,across,depth,length,radius,branch=centers[index]
        radial=vertex.co-center
        along=radial.dot(tangent);radial-=tangent*along
        u=(math.atan2(radial.dot(depth),radial.dot(across))/math.tau+.5)*.33+branch*.19
        v=(length+along)*.82+branch*.11
        uv_points.append((u,v))
        value=pixels[(int((v%1)*(h-1))*w+int((u%1)*(w-1)))*4]
        if radial.length>1e-5:
            # Raised plates vary by millimeters, with dark fissures remaining
            # lower. This is baked down later, never a runtime subdivision.
            relief=(value-.45)*.012*min(1,radius/.021)
            vertex.co+=radial.normalized()*relief
    char=obj.data.attributes.new('CleftChar','FLOAT','POINT')
    for vertex in obj.data.vertices:
        distance=(vertex.co-Vector((-.014,-.008,.528))).length
        strength=max(0,min(1,(.125-distance)/.085))
        char.data[vertex.index].value=strength*strength*(3-2*strength)
    uv=obj.data.uv_layers.new(name='Growth aligned bark scan')
    for loop in obj.data.loops:uv.data[loop.index].uv=uv_points[loop.vertex_index]
    mat=bpy.data.materials.new('CC0 pine bark grown and charred');mat.use_nodes=True
    n,l=mat.node_tree.nodes,mat.node_tree.links;bsdf=n.get('Principled BSDF')
    tex={}
    for kind,im in images.items():
        node=n.new('ShaderNodeTexImage');node.image=im;tex[kind]=node
    color=n.new('ShaderNodeMixRGB');color.blend_type='MULTIPLY';color.inputs[0].default_value=1;color.inputs[2].default_value=(.44,.34,.27,1)
    l.new(tex['Diffuse'].outputs['Color'],color.inputs[1])
    mask=n.new('ShaderNodeAttribute');mask.attribute_name='CleftChar'
    burn=n.new('ShaderNodeMixRGB');burn.inputs[2].default_value=(.006,.004,.003,1)
    l.new(mask.outputs['Fac'],burn.inputs[0]);l.new(color.outputs[0],burn.inputs[1]);l.new(burn.outputs[0],bsdf.inputs['Base Color'])
    l.new(tex['Rough'].outputs['Color'],bsdf.inputs['Roughness'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.35;bump.inputs['Distance'].default_value=.0018
    l.new(tex['Displacement'].outputs['Color'],bump.inputs['Height']);l.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
    obj.data.materials.clear();obj.data.materials.append(mat)
    for face in obj.data.polygons:face.material_index=0
    obj.data.update()
    return mat
