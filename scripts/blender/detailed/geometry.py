"""Irregular masonry, shaped plate armor and cloth helpers."""
import bpy, bmesh, math, random
from math import sin,cos,pi
from mathutils import Vector,noise as mnoise

def smooth(o):
    for p in o.data.polygons:p.use_smooth=True
    return o

def worn_block(name,loc,size,material='stone',wear=.018,edge=.025):
    o=cube(name,loc,size,material,0)
    # Unequal corners stop repeated ashlar looking like identical Lego blocks.
    for v in o.data.vertices:
        for j in range(3):v.co[j]+=random.uniform(-wear,wear)
    if random.random()<.54 and min(size)>.10:
        # Remove an actual angular chip from a front edge. Normal maps alone do
        # not break silhouettes or expose the fresh plane inside a worn corner.
        radius=min(size)*random.uniform(.14,.26)
        side=random.choice((-1,1))
        chip=(loc[0]+side*(size[0]/2-radius*.36),loc[1]-size[1]/2+radius*.08,loc[2]+random.choice((-1,1))*(size[2]/2-radius*.22))
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=radius,location=chip)
        cutter=bpy.context.object;cutter.rotation_euler=(random.random(),random.random(),random.random())
        bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Broken stone corner','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
        bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
    bevel(o,edge,2)
    for v in o.data.vertices:
        v.co+=mnoise.noise_vector(v.co*13+Vector((2,5,1)))*wear*.37
    smooth(o)
    weighted=o.modifiers.new('Stone planar normals','WEIGHTED_NORMAL');weighted.keep_sharp=True;weighted.weight=35
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=weighted.name)
    return o

def sphere(name,loc,scale,material,segments=20,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc)
    o=bpy.context.object
    for v in o.data.vertices:
        v.co.x*=scale[0];v.co.y*=scale[1];v.co.z*=scale[2]
    finish(o,name,material);smooth(o);return o

def plate(name,outline,depth,material='iron',edge=.012):
    # x,y,z outline with a raised central ridge; used for shields/armor slabs.
    if material.startswith('stone'):
        outline=[tuple(Vector(v)+Vector((random.uniform(-.022,.022),random.uniform(-.016,.016),random.uniform(-.019,.019)))) for v in outline]
    n=len(outline);center=sum((Vector(v) for v in outline),Vector())/n
    center.y-=depth
    verts=list(outline)+[tuple(center)]
    faces=[(i,(i+1)%n,n) for i in range(n)]
    o=mesh(name,verts,faces,material)
    mod=o.modifiers.new('Plate thickness','SOLIDIFY');mod.thickness=.025
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    if edge:bevel(o,edge,2)
    return o

def crack(name,loc,width,height,depth=.006):
    x,y,z=loc
    pts=[(x-width*.3,y,z+height*.5),(x-width*.13,y-.003,z+height*.22),(x+width*.25,y,z),(x-width*.06,y,z-height*.27),(x+width*.16,y,z-height*.5)]
    line(name,pts,depth,'shadow',4)
    return pts

def rivet(loc,size=.012,material='gold'):
    sphere('Hand hammered rivet',loc,(size,size*.6,size),material,8,5)

def torus(name,loc,major,minor,material,rot=(0,0,0),n=24):
    bpy.ops.mesh.primitive_torus_add(major_segments=n,minor_segments=6,location=loc,major_radius=major,minor_radius=minor,rotation=rot)
    return finish(bpy.context.object,name,material)

def cloth_panel(name,top,width,length,material='teal',backward=.2,ragged=.06,folds=4):
    # A tailored shoulder-to-hem drape with unequal edge tears and deep folds.
    nx=28;ny=18;verts=[]
    for j in range(ny+1):
        t=j/ny
        for i in range(nx+1):
            u=i/nx*2-1
            h=(sin(u*folds*pi+.5)*.5+.5)
            x=top[0]+u*width*(.65+.35*t)
            y=top[1]+backward*t+.045*sin(u*folds*pi)*(t*.65+.35)+.012*sin(t*10+u*3)
            z=top[2]-length*t+.025*cos(u*folds*pi)*t
            if j==ny:z+=ragged*(abs(sin(u*8.3))+.4*sin(u*17.2))
            verts.append((x,y,z))
    faces=[]
    for j in range(ny):
        for i in range(nx):
            a=j*(nx+1)+i
            if j==ny-1 and i in (2,3,19):continue
            faces.append((a,a+1,a+nx+2,a+nx+1))
    o=mesh(name,verts,faces,material);smooth(o)
    solid=o.modifiers.new('Woven cloth edge','SOLIDIFY');solid.thickness=.008
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name)
    return o

def detailed_crystal(name,loc,radius,height,tilt=(0,0,0)):
    o=crystal(name,loc,radius,height,'crystal',tilt,n=6)
    bevel(o,.008,1)
    return o
