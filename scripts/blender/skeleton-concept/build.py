"""New skeleton concept model. Run by bpy-dev Blender MCP in an empty file.

The skull uses a new CC0 foundation by Vladimir Petkovic. All other geometry
is authored here. No geometry from the existing game skeleton is read. Front is Blender -Y.
Image reference: docs/concepts/enemy-character-references/01-skeleton.png.
"""
import bpy, math, random, json, os, bmesh
import numpy as np
from mathutils import Vector
from math import sin, cos, pi
ROOT='/home/hfsearcy/git/institute'
OUT=ROOT+'/docs/concepts/skeleton-model'
os.makedirs(OUT,exist_ok=True)
random.seed(137)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
parts=[]; groups={}; current='spine'

def material(name, colors, metallic, roughness, mode):
    m=bpy.data.materials.new(name); m.use_nodes=True
    n=m.node_tree.nodes; l=m.node_tree.links; p=n.get('Principled BSDF')
    p.inputs['Metallic'].default_value=metallic; p.inputs['Roughness'].default_value=roughness
    N=512; yy,xx=np.mgrid[0:N,0:N]/N
    rng=np.random.default_rng(124+len(bpy.data.materials))
    noise=np.zeros((N,N))
    fy=np.fft.fftfreq(N)[:,None];fx=np.fft.fftfreq(N)[None,:]
    for sigma,amp in [(35,.11),(13,.08),(4,.045),(1,.025)]:
        field=rng.normal(size=(N,N));kernel=np.exp(-2*pi*pi*sigma*sigma*(fx*fx+fy*fy))
        smooth=np.fft.ifft2(np.fft.fft2(field)*kernel).real
        smooth/=max(smooth.std(),.00001);noise+=smooth*amp
    grain=rng.random((N,N))
    t=np.clip(.48+noise*2+(grain-.5)*.15,0,1)
    if mode=='metal': t=np.clip((t-.62)*3.5,0,1)
    if mode=='cloth': t=np.clip(t*.55+np.sin(xx*1600)*.045+np.sin(yy*1600)*.045,0,1)
    rgba=np.ones((N,N,4),dtype=np.float32)
    rgba[:,:,:3]=np.array(colors[0])[None,None,:]*(1-t[:,:,None])+np.array(colors[1])[None,None,:]*t[:,:,None]
    im=bpy.data.images.new(name+'_albedo',width=N,height=N); im.pixels.foreach_set(rgba.ravel()); im.pack()
    tex=n.new('ShaderNodeTexImage'); tex.image=im; l.new(tex.outputs['Color'],p.inputs['Base Color'])
    height=t*.45+(grain-.5)*(.30 if mode=='metal' else .08)
    dx=np.roll(height,1,axis=1)-np.roll(height,-1,axis=1); dy=np.roll(height,1,axis=0)-np.roll(height,-1,axis=0)
    rgba[:,:,:3]=np.stack((.5+dx*.25,.5+dy*.25,np.full_like(dx,1)),axis=2)
    normal=bpy.data.images.new(name+'_normal',width=N,height=N); normal.colorspace_settings.name='Non-Color'; normal.pixels.foreach_set(rgba.ravel()); normal.pack()
    nt=n.new('ShaderNodeTexImage'); nt.image=normal; nm=n.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=.38 if mode=='metal' else .35
    l.new(nt.outputs['Color'],nm.inputs['Color']); l.new(nm.outputs['Normal'],p.inputs['Normal'])
    if mode=='metal':
        rgba[:,:,:3]=np.repeat(np.clip(.62+t*.22+grain*.10,0,1)[:,:,None],3,axis=2)
        rm=bpy.data.images.new(name+'_roughness',width=N,height=N);rm.colorspace_settings.name='Non-Color';rm.pixels.foreach_set(rgba.ravel());rm.pack()
        rt=n.new('ShaderNodeTexImage');rt.image=rm;l.new(rt.outputs['Color'],p.inputs['Roughness'])
    return m
bone=material('Old ivory - porous mineral',[(.38,.32,.22),(.69,.62,.46)],0,.82,'bone')
metal=material('Blackened steel - iron corrosion',[(.19,.23,.26),(.32,.16,.065)],.42,.70,'metal')
edge=material('Worn steel edges',[(.32,.33,.31),(.56,.53,.43)],.60,.49,'metal')
clothmat=material('Teal linen - woven and weathered',[(.028,.070,.075),(.10,.21,.22)],0,.97,'cloth')
leather=material('Old leather straps',[(.028,.018,.012),(.13,.083,.041)],0,.91,'cloth')
dark=material('Deep socket bone',[(.023,.018,.012),(.10,.069,.029)],0,.91,'bone')
# CC0 photographic corroded steel by Amal Kumar, Poly Haven.
n=metal.node_tree.nodes;l=metal.node_tree.links;n.clear();p=n.new('ShaderNodeBsdfPrincipled');out=n.new('ShaderNodeOutputMaterial');l.new(p.outputs['BSDF'],out.inputs['Surface'])
def source_tex(filename,linear=False):
    im=bpy.data.images.load(ROOT+'/scripts/blender/sources/rusty-metal-04/'+filename,check_existing=True)
    if linear:im.colorspace_settings.name='Non-Color'
    im.pack();t=n.new('ShaderNodeTexImage');t.image=im;return t
l.new(source_tex('rusty_metal_04_diff_2k.jpg').outputs['Color'],p.inputs['Base Color'])
arm=source_tex('rusty_metal_04_arm_2k.png',True);sep=n.new('ShaderNodeSeparateColor');l.new(arm.outputs['Color'],sep.inputs[0]);l.new(sep.outputs['Green'],p.inputs['Roughness']);l.new(sep.outputs['Blue'],p.inputs['Metallic'])
normal=source_tex('rusty_metal_04_nor_gl_2k.png',True);nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.60;l.new(normal.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],p.inputs['Normal'])

# Continuous world-space porous bone color and relief, baked later to UV textures.
n=bone.node_tree.nodes;l=bone.node_tree.links;p=n.get('Principled BSDF')
geo=n.new('ShaderNodeNewGeometry');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=16;noise.inputs['Detail'].default_value=4
l.new(geo.outputs['Position'],noise.inputs['Vector'])
ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.23;ramp.color_ramp.elements[0].color=(.37,.31,.21,1);ramp.color_ramp.elements[1].position=.78;ramp.color_ramp.elements[1].color=(.68,.61,.45,1)
l.new(noise.outputs['Fac'],ramp.inputs['Fac']);l.new(ramp.outputs['Color'],p.inputs['Base Color'])
fine=n.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=360;fine.inputs['Detail'].default_value=2;l.new(geo.outputs['Position'],fine.inputs['Vector'])
bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.15;bump.inputs['Distance'].default_value=.0007;l.new(fine.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],p.inputs['Normal'])
eye=bpy.data.materials.new('Cold teal soul'); eye.use_nodes=True
ep=eye.node_tree.nodes.get('Principled BSDF'); ep.inputs['Base Color'].default_value=(.005,.21,.20,1); ep.inputs['Emission Color'].default_value=(.008,.9,.78,1); ep.inputs['Emission Strength'].default_value=2.1

def mesh(name,verts,faces,mat=bone,sub=0):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob); ob.data.materials.append(mat)
    for p in me.polygons:p.use_smooth=True
    if sub:
        mod=ob.modifiers.new('Sculpted surface','SUBSURF');mod.levels=sub
        bpy.context.view_layer.objects.active=ob; bpy.ops.object.modifier_apply(modifier=mod.name)
    parts.append(ob); groups[ob.name]=current
    return ob

def uvball(name,loc,scale,mat=bone,seg=24,rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    parts.append(o);groups[o.name]=current;return o

def tube(name,pts,radii,mat=bone,sides=10):
    vs=[];fs=[]
    for i,p in enumerate(pts):
        p=Vector(p); d=Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)])
        d.normalize();ref=Vector((0,1,0)) if abs(d.y)<.9 else Vector((1,0,0)); a=d.cross(ref).normalized();b=d.cross(a).normalized()
        radius=radii[i] if isinstance(radii,list) else radii
        rx,ry=radius if isinstance(radius,tuple) else (radius,radius)
        for k in range(sides):vs.append(p+a*cos(k*2*pi/sides)*rx+b*sin(k*2*pi/sides)*ry)
        if i:
            for k in range(sides):a0=(i-1)*sides+k;b0=(i-1)*sides+(k+1)%sides;fs.append((a0,b0,b0+sides,a0+sides))
    fs += [tuple(range(sides-1,-1,-1)),tuple((len(pts)-1)*sides+k for k in range(sides))]
    return mesh(name,vs,fs,mat)

def longbone(name,a,b,r=.018):
    a=Vector(a);b=Vector(b);d=b-a
    pts=[a+d*t+Vector((sin(t*pi)*r*.23,sin(t*pi)*r*.7,0)) for t in [0,.04,.12,.25,.45,.7,.86,.96,1]]
    return tube(name,pts,[r*x for x in [1.13,1.45,1.1,.72,.65,.75,1.1,1.40,1.03]],sides=12)

def plate(name,rows,mat=metal,thick=.008):
    # Rows describe (center, half width, depth); custom curved forged shell.
    vs=[]; fs=[]; steps=14
    for i,(c,w,d) in enumerate(rows):
        for j in range(steps+1):
            u=j/steps*2-1
            vs.append((c[0]+w*u,c[1]+d*u*u+.0017*sin(j*2.7+i*3),c[2]+.002*sin(j*2+i)))
            if i and j: a=(i-1)*(steps+1)+j-1;fs.append((a,a+1,a+steps+2,a+steps+1))
    o=mesh(name,vs,fs,mat)
    mod=o.modifiers.new('Forged thickness','SOLIDIFY');mod.thickness=thick
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    bevel=o.modifiers.new('Hand worn rim','BEVEL');bevel.width=.002;bevel.segments=2;bpy.ops.object.modifier_apply(modifier=bevel.name)
    # Rolled side rims and bottom edge.
    for j in [0,steps]:tube(name+' rolled rim',[vs[i*(steps+1)+j] for i in range(len(rows))],.0055,edge,8)
    tube(name+' lower rim',vs[-steps-1:],.0055,edge,8)
    return o

def strap(name,pts,width=.023):
    o=tube(name,pts,[(width,.004)]*len(pts),leather,8);return o

def rivet(p,rad=.004):return uvball('Hammered rivet',p,(rad,rad*.55,rad),edge,12,8)

def cloth(name,x0,x1,z0,z1,y,back=False):
    nx=28;nz=42;vs=[];fs=[]
    for j in range(nz+1):
        t=j/nz
        for i in range(nx+1):
            u=i/nx;xx=x0+(x1-x0)*u
            end=z1+.085*sin(u*4*pi+.8)+.025*sin(u*11*pi)+.05*abs(u-.5)
            zz=z0+(end-z0)*t
            yy=y
            for pos,amp,width in [(.09,.019,.04),(.27,-.023,.055),(.46,.028,.055),(.64,-.020,.045),(.84,.017,.04)]:
                centre=pos+.075*sin(t*3+pos*8)*t
                yy+=amp*math.exp(-((u-centre)/(width+.03*t))**2)
            yy+=.008*sin(u*17*pi+t*3)*(.3+.7*t)+.009*math.exp(-((u-(.8-.52*t))/.07)**2)
            if back: yy+=.045*sin(t*pi)
            vs.append((xx+.009*sin(t*6+u*4)*t,yy,zz))
            if i and j:
                # Irregular tears cut into the bottom and a few small holes.
                hole=(j>36 and i in [3,4,19,20]) or (j in [25,26,27] and i in [7,8]) or (j in [17,18] and i==22)
                if not hole:a=(j-1)*(nx+1)+i-1;fs.append((a,a+1,a+nx+2,a+nx+1))
    o=mesh(name,vs,fs,clothmat)
    if name in ['Long folded front tabard','Torn shoulder back drape']:
        # Physical drape from the authored gathered starting form, pinned at the belt/shoulder.
        pins=o.vertex_groups.new(name='Sewn attachment');pins.add(list(range(nx+1)),1,'REPLACE')
        sim=o.modifiers.new('Gravity drape','CLOTH');sim.settings.vertex_group_mass=pins.name
        sim.settings.quality=7;sim.settings.mass=.22;sim.settings.tension_stiffness=25;sim.settings.compression_stiffness=25;sim.settings.shear_stiffness=8;sim.settings.bending_stiffness=.35
        sim.point_cache.frame_start=1;sim.point_cache.frame_end=36
        bpy.context.scene.gravity=(.18,.12,-9.81)
        for f in range(1,37):bpy.context.scene.frame_set(f)
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sim.name)
        bpy.context.scene.frame_set(1)
    # Broad diagonal compression folds after gravity. These branch from the attachment.
    if name in ['Long folded front tabard','Torn shoulder back drape']:
        direction=-1 if not back else 1
        for j in range(nz+1):
            t=j/nz
            for i in range(nx+1):
                u=i/nx;v=o.data.vertices[j*(nx+1)+i]
                fold=(.038*math.exp(-((t-(.13+.29*u))/.045)**2)
                     -.020*math.exp(-((t-(.23+.29*u))/.038)**2)
                     +.021*math.exp(-((t-(.37-.20*u))/.040)**2))
                v.co.y+=direction*fold*sin(pi*u)**.6
        o.data.update()
    m=o.modifiers.new('Woven thickness','SOLIDIFY');m.thickness=.004;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
    # Frayed threads stay short and follow the cloth silhouette.
    for i in range(2,nx,3):
        p=Vector(o.data.vertices[nz*(nx+1)+i].co);tube('Short frayed linen thread',[p,p+Vector((.002,0,-.008)),p+Vector((.004,.002,-.014))],.0008,clothmat,5)
    return o

# Torso: stacked vertebrae with processes and actual open curved ribs.
current='spine'
for i in range(25):
    z=1.03+i*.031 if i<17 else 1.55+(i-17)*.0125
    sc=1 if i<17 else .58
    uvball('Vertebra %02d'%i,(0,.026,z),(.030*sc,.023*sc,.017*sc),bone,16,10)
    tube('Spinous process',[(0,.032,z),(0,.032+.029*sc,z-.006*sc),(0,.032+.042*sc,z-.010*sc)],[.012*sc,.008*sc,.002*sc],bone,8)
    for s in [-1,1]:tube('Transverse process',[(0,.026,z),(s*.039*sc,.038,z-.004)],[.011*sc,.005*sc],bone,8)
for i in range(9):
    z=1.49-i*.030;w=.103+.052*sin((i+1)/10*pi)-max(0,i-5)*.011;dep=.073+.027*sin(i/9*pi)
    for s in [-1,1]:
        pts=[]
        for j in range(25):
            t=j/24; a=t*pi*.99
            pts.append((s*(.008+w*sin(a)),.018+dep*cos(a),z-.059*sin(a)+.017*t))
        radii=[(.009*(1-.28*j/24),.012*(1-.22*j/24)) for j in range(25)]
        tube('Curved rib %s %s'%(s,i),pts,radii,bone,10)
        tube('Rib vertebral articulation',[pts[0],(s*.018,.056,z),(0,.028,z)],[.008,.009,.008],bone,8)
        if i<7:
            end=pts[-1];tube('Costal cartilage into sternum',[end,(s*.016,-.089,end[2]+.017),(0,-.095,max(1.285,end[2]+.034))],[.007,.006,.007],bone,8)
longbone('Sternum',(0,-.086,1.51),(0,-.101,1.30),.020)
for s in [-1,1]:
    tube('Clavicle',[(0,-.072,1.535),(s*.065,-.066,1.546),(s*.14,-.017,1.55),(s*.185,.006,1.53)],[.015,.010,.012,.016])
    plate('Scapula', [((s*.092,.091,1.52),.063,-.011),((s*.10,.097,1.47),.052,-.011),((s*.078,.083,1.40),.007,-.002)],bone,.007)

# Pelvis: flared ilium and open obturator arches.
current='hips'
for s in [-1,1]:
    plate('Iliac wing',[((s*.085,.003,1.11),.047,.012),((s*.098,-.006,1.055),.052,.035),((s*.075,-.023,1.00),.028,.013)],bone,.010)
    pts=[(s*(.064+.041*cos(a)), -.015-.035*sin(a), .978+.048*sin(a)) for a in np.linspace(0,2*pi,25)]
    tube('Obturator pelvic arch',pts,.012)
uvball('Sacrum',(0,.028,1.014),(.029,.023,.065))

# Fresh CC0 anatomical skull by Vladimir Petkovic, via Khronos sample assets.
# This is not the game's existing skeleton. Provenance is stored with the source.
current='head'
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=ROOT+'/scripts/blender/sources/scattering-skull/ScatteringSkull.glb')
bpy.context.view_layer.update()
imported=[o for o in bpy.data.objects if o not in before]
for o in imported:
    if o.type=='MESH':
        mw=o.matrix_world.copy();o.parent=None
        for v in o.data.vertices:
            p=mw@v.co;v.co=(p.x*.78,p.y*.66-.005,p.z*.80+1.610)
        o.matrix_world.identity();o.name='Anatomical skull CC0 Vladimir Petkovic'
        o.data.materials.clear();o.data.materials.append(bone)
        groups[o.name]='head';parts.append(o)
        for p in o.data.polygons:p.use_smooth=True
    else:bpy.data.objects.remove(o,do_unlink=True)
for side in [-1,1]:uvball('Restrained soul eye',(side*.032,-.079,1.738),(.004,.004,.004),eye,16,10)

# Helmet: open underside, nasal guard, broad lower band and separate cheek plates.
vs=[];fs=[];N=48;R=15
for i in range(R+1):
    t=i/R;ang=t*pi*.51
    for j in range(N):
        a=j*2*pi/N;vs.append((.094*sin(ang)*cos(a),.009+.106*sin(ang)*sin(a),1.757+.115*cos(ang)))
        if i:a0=(i-1)*N+j;b0=(i-1)*N+(j+1)%N;fs.append((a0,b0,b0+N,a0+N))
helm=mesh('Riveted iron helmet dome',vs,fs,metal)
mod=helm.modifiers.new('Plate thickness','SOLIDIFY');mod.thickness=.004;bpy.context.view_layer.objects.active=helm;bpy.ops.object.modifier_apply(modifier=mod.name)
for z in [1.753,1.765]:tube('Helmet rolled band',[(.095*cos(a),.009+.107*sin(a),z) for a in np.linspace(0,2*pi,65)],.0035,edge,8)
tube('Helmet crest seam',[(0,.009-.108*cos(a),1.759+.115*sin(a)) for a in np.linspace(0,pi,30)],.0045,edge,8)
plate('Nasal guard',[((0,-.081,1.787),.008,.001),((0,-.087,1.752),.010,.001),((0,-.086,1.724),.004,.001)],metal,.004)
for s in [-1,1]:
    plate('Helmet hanging cheek guard',[((s*.086,-.002,1.752),.014,.02),((s*.087,-.009,1.701),.013,.02),((s*.091,-.011,1.676),.017,.02)],metal,.004)
for a in np.linspace(0,2*pi,15,endpoint=False):rivet((.096*cos(a),.009+.108*sin(a),1.762),.003)

# Limbs and hands. Every limb has taper, bone heads, and separate paired bones.
for s,label in [(-1,'right'),(1,'left')]:
    current=label+'UpperArm'; shoulder=(s*.202,.006,1.516);elbow=(s*.255,-.006,1.229);wrist=(s*.293,-.035,1.016)
    longbone('Humerus '+label,shoulder,elbow,.018)
    uvball('Humeral head',shoulder,(.026,.024,.026))
    for dx in [-.009,.009]:uvball('Elbow condyle',(elbow[0]+dx,elbow[1],elbow[2]),(.013,.015,.015))
    current=label+'Forearm'
    longbone('Ulna '+label,(elbow[0]-s*.012,.007,1.221),(wrist[0]-s*.008,-.030,1.021),.010)
    longbone('Radius '+label,(elbow[0]+s*.010,-.009,1.224),(wrist[0]+s*.012,-.044,1.014),.010)
    plate('Forearm vambrace '+label,[((s*.263,-.026,1.201),.025,.025),((s*.276,-.048,1.149),.024,.018),((s*.291,-.059,1.036),.017,.016)],metal,.006)
    for z,x in [(1.185,s*.266),(1.060,s*.287)]:
        strap('Bracer binding',[(x+.031*cos(a),-.010+.027*sin(a),z) for a in np.linspace(0,2*pi,30)],.008)
        rivet((x,-.060,z))
    current=label+'Hand'
    uvball('Carpal bones',wrist,(.021,.016,.014))
    for f in range(4):
        x=wrist[0]+s*(f-1.5)*.012
        longbone('Metacarpal',(x,-.037,1.008),(x+s*.005,-.040,.963),.005)
        end=.909+abs(f-1.2)*.009
        pts=[(x+s*.005,-.040,.963),(x+s*.009,-.048,.939),(x+s*.008,-.063,end+.010),(x+s*.004,-.069,end)]
        for j in range(3):longbone('Finger phalanx',pts[j],pts[j+1],.0043-j*.0006)
    for a,b in [((wrist[0]-s*.014,-.043,.994),(wrist[0]-s*.037,-.061,.970)),((wrist[0]-s*.037,-.061,.970),(wrist[0]-s*.040,-.074,.947))]:longbone('Thumb',a,b,.006)
    current=label+'Thigh';hip=(s*.099,.006,.984);knee=(s*.119,-.014,.565);ankle=(s*.121,.009,.118)
    longbone('Femur '+label,hip,knee,.024)
    uvball('Femoral head',hip,(.028,.026,.029))
    for dx in [-.014,.014]:uvball('Femoral condyle',(knee[0]+dx,knee[1],knee[2]),(.020,.027,.022))
    uvball('Patella',(knee[0],-.042,.565),(.020,.012,.023))
    current=label+'Shin'
    longbone('Tibia '+label,(knee[0],-.010,.540),(ankle[0],.004,.132),.019)
    longbone('Fibula '+label,(knee[0]+s*.023,.011,.532),(ankle[0]+s*.022,.018,.135),.008)
    plate('Shin greave '+label,[((s*.121,-.040,.519),.029,.025),((s*.121,-.063,.475),.040,.036),((s*.121,-.049,.334),.029,.026),((s*.121,-.031,.158),.018,.022)],metal,.007)
    for z in [.174,.445]:
        strap('Greave leather binding',[(s*.121+.043*cos(a),.002+.047*sin(a),z) for a in np.linspace(0,2*pi,35)],.014)
        rivet((s*.121,-.053,z))
    strap('Crossed knee wrap',[(s*.087,-.030,.540),(s*.125,-.048,.508),(s*.153,-.020,.482)],.018)
    current=label+'Foot'
    uvball('Heel',(s*.122,.019,.056),(.024,.041,.019))
    uvball('Talus',(s*.121,.002,.117),(.020,.024,.026))
    longbone('Talar neck',(s*.121,.002,.104),(s*.121,-.022,.071),.016)
    for f in range(5):
        x=s*.12+(f-2)*.012
        longbone('Foot metatarsal',(s*.121+(f-2)*.006,-.004,.080),(x,-.086,.038),.007)
        longbone('Toe',(x,-.086,.038),(x,-.124+abs(f-1)*.007,.030),.0055)
        uvball('Toe tip',(x,-.126+abs(f-1)*.007,.030),(.006,.008,.006),bone,12,8)

# Split breastplate leaves the right half of rib cage exposed.
current='spine'
plate('Asymmetric half cuirass',[((-.087,-.073,1.505),.064,.014),((-.092,-.114,1.440),.082,.042),((-.081,-.130,1.344),.071,.026),((-.103,-.110,1.258),.050,.021)],metal,.009)
for z,x in [(1.470,-.034),(1.410,-.023),(1.350,-.016),(1.291,-.059), (1.460,-.152),(1.360,-.15)]:rivet((x,-.136 if z<1.44 else -.105,z))
strap('Diagonal chest baldric',[(.165,-.026,1.554),(.124,-.090,1.490),(.052,-.115,1.414),(-.028,-.136,1.328),(-.11,-.100,1.266)],.024)
strap('Rear baldric',[(-.15,.050,1.532),(-.086,.119,1.45),(.030,.120,1.35),(.13,.070,1.26)],.023)
current='rightUpperArm'
# Shoulder shell with downward lames.
vs=[];fs=[]
for j in range(13):
    t=j/12;phi=.22+t*1.60
    for i in range(25):
        a=-pi+i/24*pi*1.55
        vs.append((-.196+.079*sin(phi)*cos(a),.012+.089*sin(phi)*sin(a),1.491+.090*cos(phi)))
        if j and i:q=(j-1)*25+i-1;fs.append((q,q+1,q+26,q+25))
o=mesh('Domed forged single pauldron',vs,fs,metal)
m=o.modifiers.new('Forged thickness','SOLIDIFY');m.thickness=.007;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
tube('Pauldron rolled perimeter',vs[-25:],.0065,edge,8)
for idx in [0,24]:tube('Pauldron side rim',[vs[j*25+idx] for j in range(13)],.0035,edge,8)
for i in range(2,24,3):
    p=Vector(vs[10*25+i]);p+=Vector(((p.x+.196)*.065,(p.y-.012)*.065,.001));rivet(p,.0048)
plate('Pauldron lower lame',[((-.226,-.020,1.477),.050,.028),((-.235,-.035,1.441),.047,.031),((-.24,-.029,1.420),.041,.027)],metal,.007)
for x,z in [(-.265,1.507),(-.16,1.514),(-.272,1.434),(-.202,1.424)]:rivet((x,-.054,z))

# Visible fastening hardware and hand-forged edge construction.
current='spine'
tube('Chest baldric square buckle',[(.031,-.139,1.420),(.053,-.139,1.445),(.077,-.126,1.422),(.053,-.139,1.396),(.031,-.139,1.420)],.0035,edge,8)
tube('Chest buckle tongue',[(.040,-.145,1.425),(.064,-.143,1.410)],.002,edge,6)
for z in np.linspace(1.34,1.49,6):
    x=-.016-(z-1.34)*.22;rivet((x,-.136+(z-1.34)*.19,z),.0045)
# Small, irregular exposed scratches on the chest plate.
for i in range(17):
    x=random.uniform(-.130,-.048);z=random.uniform(1.34,1.46);y=-.138+.035*((x+.085)/.07)**2
    tube('Steel edge scratch',[(x,y,z),(x+random.uniform(.004,.015),y-.001,z+random.uniform(.002,.006))],.00055,edge,5)
# Textile layers: front loin panel, two side strips, and shoulder-back torn drape.
current='hips'
cloth('Long folded front tabard',-.080,.079,1.074,.440,-.076)
cloth('Left torn side panel',.091,.159,1.065,.620,.018)
cloth('Right torn side panel',-.159,-.089,1.065,.685,.029)
cloth('Back skirt folds',-.105,.103,1.071,.535,.088,True)
current='cape';cloth('Torn shoulder back drape',-.169,-.020,1.536,.800,.123,True)
current='hips'
for z in [1.075,1.095]:strap('Broad waist belt',[(.157*cos(a),.083*sin(a),z+.008*sin(a*2)) for a in np.linspace(0,2*pi,65)],.018)
tube('Iron belt buckle',[(.021*cos(a),-.096,1.084+.027*sin(a)) for a in np.linspace(0,2*pi,30)],.004,edge,8)
tube('Buckle tongue',[(0,-.101,1.059),(0,-.103,1.108)],.0025,edge,6)
for x in [-.130,-.095,-.052,.060,.10,.132]:rivet((x,-.079,1.09),.003)
for s in [-1,1]:
    plate('Hip armor tasset',[((s*.13,-.035,1.062),.035,.014),((s*.139,-.042,1.016),.035,.023),((s*.137,-.032,.976),.025,.015)],metal,.005)

# Sword with diamond cross-section, separate cutting bevels, guard, wrap, pommel.
current='sword';sx=-.312;sy=-.079
tube('Sword leather grip',[(sx,sy,.969),(sx-.003,sy,.874)],[.011,.010],leather,12)
for z in np.linspace(.884,.96,9):tube('Hilt wrap',[(sx+.011*cos(a),sy+.011*sin(a),z+.004*a/(2*pi)) for a in np.linspace(0,2*pi,20)],.0018,edge,6)
uvball('Sword pommel',(sx,sy,.985),(.018,.013,.022),metal,20,12)
tube('Sword crossguard',[(sx-.065,sy,.848),(sx-.046,sy,.866),(sx,sy,.867),(sx+.046,sy,.866),(sx+.065,sy,.848)],[.005,.008,.010,.008,.005],edge,10)
vs=[];fs=[]
for z,w in [(.858,.028),(.81,.027),(.55,.022),(.30,.018),(.105,.012),(.054,0)]:
    drift=(.858-z)*-.105
    vs.extend([(sx+drift-w,sy,z),(sx+drift,sy-.007,z),(sx+drift+w,sy,z),(sx+drift,sy+.007,z)])
for i in range(5):
    for j in range(4):fs.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
mesh('Notched iron longsword',vs,fs,metal)
for s in [-1,1]:tube('Sword cutting bevel',[(sx+(.858-z)*-.105+s*w,sy,z) for z,w in [(.858,.028),(.81,.027),(.55,.022),(.30,.018),(.105,.012),(.054,0)]],.0018,edge,6)

# Reliable UVs with fixed texel density preserve pitting and weave on small parts.
objects=[o for o in bpy.data.objects if o.type=='MESH']
for o in objects:
    if groups.get(o.name)=='head':
        for v in o.data.vertices:
            w=o.matrix_world@v.co;w.x*=1.08;w.y*=1.04;w.z=1.70+(w.z-1.70)*1.05-.018;v.co=o.matrix_world.inverted()@w
for o in objects:
    if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')
    uv=o.data.uv_layers.active.data
    for poly in o.data.polygons:
        axis=max(range(3),key=lambda k:abs(poly.normal[k]))
        axes=[k for k in range(3) if k!=axis]
        for li in poly.loop_indices:
            co=o.matrix_world @ o.data.vertices[o.data.loops[li].vertex_index].co
            uv[li].uv=(co[axes[0]]*3.7,co[axes[1]]*3.7)
    if len(o.data.polygons)>40:
        bpy.context.view_layer.objects.active=o
        dec=o.modifiers.new('Game topology budget','DECIMATE');dec.ratio=.12 if 'Anatomical skull' in o.name else .55 if o.data.materials[0]==bone else .60 if any(k in o.name for k in ['Long folded','Torn shoulder']) else .70 if (any(k in o.name.lower() for k in ['rib','rim','rivet','buckle']) or groups.get(o.name,'').endswith('Foot')) else .19
        bpy.ops.object.modifier_apply(modifier=dec.name)
joint_positions={'hips':(0,0,1.03),'spine':(0,0,1.12),'head':(0,0,1.6),'sword':(-.312,-.079,.969),'cape':(-.08,.12,1.52)}
for s,label in [(-1,'right'),(1,'left')]:
    joint_positions.update({label+'UpperArm':(s*.202,.006,1.516),label+'Forearm':(s*.255,-.006,1.229),label+'Hand':(s*.293,-.035,1.016),label+'Thigh':(s*.099,.006,.984),label+'Shin':(s*.119,-.014,.565),label+'Foot':(s*.121,.009,.118)})
root=bpy.data.objects.new('SkeletonConcept',None);bpy.context.collection.objects.link(root)
joints={}
for name,pos in joint_positions.items():
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=pos;joints[name]=o
bpy.context.view_layer.update()
for name,o in joints.items():
    parent='hips'
    if name=='hips':p=root
    elif name in ['head','cape']:p=joints['spine']
    elif name=='sword':p=joints['rightHand']
    elif name.endswith('UpperArm'):p=joints['spine']
    elif name.endswith('Forearm'):p=joints[name.replace('Forearm','UpperArm')]
    elif name.endswith('Hand'):p=joints[name.replace('Hand','Forearm')]
    elif name.endswith('Shin'):p=joints[name.replace('Shin','Thigh')]
    elif name.endswith('Foot'):p=joints[name.replace('Foot','Shin')]
    else:p=joints['hips']
    mw=o.matrix_world.copy();o.parent=p;o.matrix_world=mw;bpy.context.view_layer.update()
for group in joint_positions:
    for mat in [bone,metal,edge,clothmat,leather,dark,eye]:
        obs=[o for o in list(bpy.data.objects) if o.type=='MESH' and groups.get(o.name)==group and o.data.materials[0]==mat]
        if not obs:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs:o.select_set(True)
        bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=obs[0];o.name=group+'__'+mat.name.split(' - ')[0]
        mw=o.matrix_world.copy();o.parent=joints[group];o.matrix_world=mw

# Metadata provides provenance without reusing the old asset.
root['source']='Authored from empty scene by scripts/blender/skeleton-concept/build.py'
root['reference']='01-skeleton.png';root['existing_skeleton_geometry_used']=False;root['skull_foundation']='CC0 Vladimir Petkovic, Khronos ScatteringSkull; local provenance.json'
bpy.context.view_layer.update()
glb=ROOT+'/web/public/assets/rpg/candidates/skeleton-concept.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/skeleton-concept-v15.blend')
stats={'mesh_count':len([o for o in bpy.data.objects if o.type=='MESH']),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'glb_bytes':os.path.getsize(glb),'existing_skeleton_geometry_used':False,'new_cc0_skull_foundation':True}
open(OUT+'/build-stats.json','w').write(json.dumps(stats,indent=2))
result=stats
