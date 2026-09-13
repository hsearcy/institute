"""Local volumetric worn relic candidates. Concept projection decorates real geometry.
Run in the installed bpy interpreter; never writes a live item.
"""
from pathlib import Path
import bpy, math, json, random
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'web/public/assets/rpg/items/candidates'
SOURCE=ROOT/'docs/concepts/weapon-model-review/local'
SPECS={x['id']:x for x in json.loads((ROOT/'scripts/blender/items/catalogue.json').read_text())['items']}
TAU=math.tau
objects=[]; mats=[]; concept=None; cx=0; unit=800

def texture(name,gem=False,dark=False):
    import numpy as np
    n=256;rng=np.random.default_rng(19 if gem else 37)
    yy,xx=np.mgrid[0:n,0:n]/n
    noise=rng.random((n,n)); wave=np.sin(xx*39+np.sin(yy*22))*np.sin(yy*47)
    if gem:
        seeds=rng.random((28,2));d=np.sort(np.stack([(xx-x)**2+(yy-y)**2 for x,y in seeds]),axis=0)
        vein=np.clip(1-(d[1]-d[0])*850,0,1)**4
        base=np.stack([.03+.02*noise,.015+.014*noise,.075+.04*noise],axis=-1)
        base+=vein[:,:,None]*np.array([.40,.36,.50]);base+=wave[:,:,None]*.018
    else:
        base=np.stack([.25+.12*noise,.23+.10*noise,.20+.08*noise],axis=-1)
        patina=np.clip(wave-.3,0,1)[:,:,None]
        base=base*(1-patina*.4)+patina*np.array([.02,.065,.055])
    if dark:base*=.30
    rgba=np.concatenate([np.clip(base,0,1),np.ones((n,n,1))],axis=-1).astype('float32')
    im=bpy.data.images.new(name,width=n,height=n);im.pixels.foreach_set(rgba.ravel());im.pack();return im

def material(name,image,metal,rough,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
    m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
    if emission:
        m.node_tree.links.new(tex.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=emission
    return m

def mesh(name,vs,fs,mat=1,project=False):
    d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(name,d);bpy.context.scene.collection.objects.link(o)
    d.materials.append(mats[mat]);uv=d.uv_layers.new(name='UVMap')
    for poly in d.polygons:
        for i in poly.loop_indices:
            v=d.vertices[d.loops[i].vertex_index].co
            if project: value=((v.x*unit+cx)/concept.size[0],(v.z*unit)/concept.size[1])
            else:value=((v.x*2.3+.5)%1,(v.z*1.7+.37)%1)
            uv.data[i].uv=(min(1,max(0,value[0])),min(1,max(0,value[1])))
    objects.append(o);return o

def tube(name,pts,radius=.008,mat=1,sides=8):
    vs=[];fs=[]
    for i,p in enumerate(pts):
        p=Vector(p);t=Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)])
        t.normalize();normal=t.cross(Vector((0,1,0)))
        if normal.length<.01:normal=t.cross(Vector((1,0,0)))
        normal.normalize();other=t.cross(normal)
        r=radius[i] if isinstance(radius,list) else radius
        for j in range(sides):vs.append(p+r*(normal*math.cos(j*TAU/sides)+other*math.sin(j*TAU/sides)))
    for i in range(len(pts)-1):
        for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;fs.append((a,b,b+sides,a+sides))
    fs.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+j for j in range(sides))]);o=mesh(name,vs,fs,mat)
    for p in o.data.polygons[:-2]:p.use_smooth=True
    return o

def loop(name,center,rx,rz,t=.006,mat=1,turn=0,n=24):
    pts=[]
    for i in range(n+1):
        a=i*TAU/n;x=rx*math.cos(a);pts.append((center[0]+x*math.cos(turn),center[1]+x*math.sin(turn),center[2]+rz*math.sin(a)))
    return tube(name,pts,t,mat,6)

def photo_point(px,py,depth=0):return ((px-cx)/unit,depth,(concept.size[1]-py)/unit)

def relief(name,pixels,depth=-.03,thickness=.014,curve=None,mat=0,bend=None):
    front=[Vector(photo_point(x,y,0 if (curve or bend) else depth)) for x,y in pixels]
    n=len(front);vs=front+[v+Vector((0,thickness,0)) for v in front]
    # Triangulate in the image plane, then restore curved depth.
    flat=[Vector((v.x,0,v.z)) for v in front];tri=tessellate_polygon([flat]);fs=[]
    for t in tri:
        ids=list(t);fs.append(tuple(ids));fs.append(tuple(reversed([i+n for i in ids])))
    fs.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    o=mesh(name,vs,fs,mat,mat==0)
    o.data.materials.append(mats[1])
    for i,p in enumerate(o.data.polygons):
        if i>=len(tri)*2 or i%2==1:p.material_index=1
    if curve or bend:
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Curved forged sheet','SUBSURF');mod.subdivision_type='SIMPLE';mod.levels=2 if curve else 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for v in o.data.vertices:v.co.y+=(curve(v.co.x) if curve else bend(v.co.x,v.co.z))
    return o

def jewel(name,position,scale,mat=2,sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=position);o=bpy.context.object;o.name=name
    for v in o.data.vertices:v.co.x*=scale[0];v.co.y*=scale[1];v.co.z*=scale[2]
    o.data.materials.append(mats[mat])
    for old_uv in list(o.data.uv_layers):o.data.uv_layers.remove(old_uv)
    uv=o.data.uv_layers.new(name='UVMap')
    for poly in o.data.polygons:
        for i in poly.loop_indices:
            v=o.data.vertices[o.data.loops[i].vertex_index].co+o.location
            uv.data[i].uv=((v.x*unit+cx)/concept.size[0],v.z*unit/concept.size[1]) if mat==0 else ((v.x*3+.5)%1,(v.z*3)%1)
    objects.append(o);return o

def lathe(name,rings,n=64,mat=1,project=False):
    vs=[];fs=[]
    for radius,z in rings:
        for j in range(n):a=j*TAU/n;vs.append((radius*math.sin(a),-radius*math.cos(a),z))
    for i in range(len(rings)-1):
        for j in range(n):a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    return mesh(name,vs,fs,mat,project)

def crown():
    global cx,unit
    cx=373;unit=700
    outline=[(24,357),(42,279),(63,249),(82,208),(81,176),(96,206),(92,241),(85,272),(98,301),(121,309),(145,286),(153,252),(143,225),(150,192),(171,162),(174,130),(184,166),(191,186),(210,201),(219,219),(204,222),(205,248),(220,270),(246,280),(270,278),(295,265),(314,237),(320,215),(314,198),(302,190),(300,185),(333,136),(355,95),(366,54),(365,24),(386,60),(398,94),(402,122),(392,155),(396,181),(416,207),(435,205),(432,230),(444,259),(469,277),(496,281),(522,271),(541,250),(541,227),(527,218),(522,216),(547,187),(563,157),(563,126),(578,153),(588,185),(583,208),(574,229),(581,252),(603,279),(626,302),(651,304),(663,286),(659,263),(647,256),(661,231),(666,202),(660,174),(679,204),(688,237),(687,266),(709,307),(719,356),(682,345),(625,333),(552,321),(470,315),(414,329),(372,370),(333,330),(274,315),(196,324),(117,336),(52,352)]
    curve=lambda x:-.31*math.sqrt(max(0,1-(x/.51)**2))
    relief('Flame crown forged front',outline,curve=curve,thickness=.016)
    # Rear circlet is an actual oval band, open center and physical inner wall.
    pts=[(.497*math.cos(a),.31*math.sin(a),.154) for a in [i*math.pi/64 for i in range(65)]]
    tube('Rear rolled circlet',pts,.027,1,10)
    for side in [-1,1]:tube('Circlet side connection',[(side*.497,0,.154),(side*.49,-.07,.154),(side*.478,-.109,.164)],.025,1,10)
    pts=[photo_point(x,y,curve((x-cx)/unit)-.004) for x,y in outline];tube('Raised crown perimeter',pts+[pts[0]],.0035,1,6)
    for x,y,r in [(371,246,20),(171,261,12),(570,261,12),(58,299,8),(685,299,8)]:
        pos=Vector(photo_point(x,y,curve((x-cx)/unit)-.012));jewel('Seated garnet',pos,(r/unit,.017,r/unit),0,2)
    return (0,0,.105)

def pendant():
    global cx,unit
    cx=187;unit=850
    # Full faceted heart: unequal lobes, a notched top, and a tapered lower point.
    outline=[(185,534),(214,520),(258,531),(300,565),(319,613),(306,669),(280,718),(242,758),(201,796),(181,806),(147,771),(106,724),(75,672),(62,613),(71,566),(111,537),(151,526)]
    front=[Vector(photo_point(x,y,-.008)) for x,y in outline];center=Vector(photo_point(187,647,-.096));vs=front+[center]+[v+Vector((0,.016,0)) for v in front]+[Vector(photo_point(187,647,.050))];n=len(front);fs=[]
    for i in range(n):fs.extend([(i,(i+1)%n,n),(n+1+i,2*n+1,n+1+(i+1)%n),(i,n+1+i,n+1+(i+1)%n,(i+1)%n)])
    stone=mesh('Faceted stone heart',vs,fs,0,True);stone.data.materials.append(mats[1])
    for i,p in enumerate(stone.data.polygons):
        if i%3==2:
            p.material_index=1
            for corner in p.loop_indices:stone.data.uv_layers.active.data[corner].uv=(.28,.34)
    wrap=lambda x,z:-.012-.084*max(0,1-abs(z-.28)/.20-abs(x)/.17)
    for name,poly in [('Central forged talon',[(163,376),(186,367),(208,377),(201,461),(215,505),(204,589),(190,682),(175,625),(166,534),(165,470)]),('Left iron claw',[(161,435),(112,471),(81,490),(75,534),(31,574),(22,629),(33,684),(62,726),(90,750),(73,706),(52,659),(54,602),(82,567),(111,536),(107,506),(145,482)]),('Right iron claw',[(211,435),(255,471),(291,488),(300,531),(334,567),(347,611),(341,666),(318,713),(287,744),(304,698),(320,649),(317,600),(292,566),(263,542),(270,510),(230,480)]),('Lower socket',[(151,781),(178,762),(197,783),(226,785),(216,825),(189,862),(162,826)])]:
        relief(name,poly,thickness=.020,bend=wrap)
    for x,y in [(99,499),(274,499),(185,474),(187,811)]:
        p=Vector(photo_point(x,y));p.y=wrap(p.x,p.z)-.01;jewel('Riveted hinge',p,(.012,.011,.012),1,2)
    tube('Pendant suspension bail',[(0,0,.59),(0,-.025,.575),(0,-.028,.55)],.013,1)
    for i in range(30):
        a=i*TAU/30;loop('Linked suspension chain',(math.sin(a)*.15,0,.775+math.cos(a)*.212),.017,.027,.005,1,0 if i%2==0 else math.pi/2,n=12)
    return (0,0,.987)

def bell():
    global cx,unit
    cx=197;unit=800;H=concept.size[1]
    profile=[(0,293),(60,293),(83,308),(98,330),(108,356),(120,454),(135,554),(157,624),(177,669)]
    rings=[(r/unit,(H-y)/unit) for r,y in profile];rings+= [(164/unit,(H-662)/unit),(144/unit,(H-619)/unit),(120/unit,(H-550)/unit),(106/unit,(H-454)/unit),(94/unit,(H-356)/unit),(68/unit,(H-323)/unit),(0,(H-320)/unit)]
    o=lathe('Hollow bronze bell with interior',rings,72,0,True)
    o.data.materials.append(mats[1])
    for poly in o.data.polygons:
        poly.use_smooth=True
        if poly.center.y>-.025 or poly.center.z>(H-321)/unit:
            poly.material_index=1
            for i in poly.loop_indices:
                v=o.data.vertices[o.data.loops[i].vertex_index].co
                o.data.uv_layers.active.data[i].uv=((v.x*2+.5)%1,(v.z*2)%1)
    # Six physical rim scallops; the wall remains open below the clapper.
    for v in o.data.vertices:
        if v.co.z<(H-615)/unit:v.co.z+=.018*math.cos(math.atan2(v.co.x,-v.co.y)*6)
    for y,r in [(335,102),(369,111),(590,145)]:
        z=(H-y)/unit;pts=[(r/unit*math.sin(i*TAU/72),-r/unit*math.cos(i*TAU/72),z) for i in range(73)];tube('Rolled bell decorative bead',pts,.005,1,6)
    tube('Interior clapper stem',[(0,0,(H-330)/unit),(0,0,(H-693)/unit)],.008,1)
    jewel('Bronze clapper',(0,0,(H-707)/unit),(.050,.050,.056),1,3)
    loop('Cast suspension loop',(0,0,(H-258)/unit),.057,.055,.013,1,n=28)
    # Braided solid strap follows a closed loop through the metal hanger.
    for k in range(5):
        pts=[]
        for i in range(41):
            t=i/40;pts.append(((k-2)*.014+.009*math.sin(t*TAU*7+k),-.006+.009*math.cos(t*TAU*7+k),(H-225+200*t)/unit))
        tube('Raised purple strap braid',pts,.008,2,8)
    relief('Engraved strap ferrule',[(153,102),(237,101),(238,165),(152,165)],depth=-.025,thickness=.007)
    return (0,0,(H-25)/unit)

def orb():
    global cx,unit
    cx=211;unit=700;H=concept.size[1];center=Vector((0,0,(H-392)/unit))
    jewel('Stormstone full faceted volume',center,(.180,.165,.211),2,3)
    for angle in [0,TAU/3,TAU*2/3]:
        pts=[]
        for i in range(33):
            t=i*math.pi/32;r=.225*math.sin(t);pts.append((r*math.sin(angle),-r*math.cos(angle),center.z+.27*math.cos(t)))
        tube('Swept metal cage rib',pts,[.012+.009*math.sin(i*math.pi/32) for i in range(33)],1,8)
    for angle in [math.pi/3,math.pi,5*math.pi/3]:
        pts=[]
        for i in range(22):
            t=.64*math.pi+i*.36*math.pi/21;r=.225*math.sin(t);pts.append((r*math.sin(angle),-r*math.cos(angle),center.z+.27*math.cos(t)))
        tube('Lower cage fork',pts,.022,1,8)
    for dz,sgn in [(.255,1),(-.265,-1)]:
        lathe('Stepped cage collar',[(.062,center.z+dz),(.063,center.z+dz+sgn*.016),(.045,center.z+dz+sgn*.024),(.047,center.z+dz+sgn*.039),(.026,center.z+dz+sgn*.052),(.026,center.z+dz+sgn*.071),(.012,center.z+dz+sgn*.086)],40,1)
    r=.225*math.sin(.64*math.pi);z=center.z+.27*math.cos(.64*math.pi)
    vs=[];fs=[];count=72
    for i in range(count):
        a=i*TAU/count;zz=z+.035*math.cos(a*3)
        for dr,dz in [(.008,.028),(-.008,.028),(-.008,-.028),(.008,-.028)]:vs.append(((r+dr)*math.sin(a),-(r+dr)*math.cos(a),zz+dz))
    for i in range(count):
        for j in range(4):fs.append((i*4+j,((i+1)%count)*4+j,((i+1)%count)*4+(j+1)%4,i*4+(j+1)%4))
    mesh('Broad fitted lower cage straps',vs,fs,1)
    tube('Hanger neck',[(0,0,center.z+.32),(0,0,center.z+.37)],.012,1)
    lathe('Terminal solid finial',[(.025,center.z-.33),(.027,center.z-.35),(0,center.z-.39)],24,1)
    loop('Orb hanger',(0,0,center.z+.405),.047,.052,.008,1,n=28)
    relief('Engraved central cage spear',[(200,150),(219,150),(226,311),(243,347),(230,398),(219,510),(207,536),(197,476),(182,409),(188,352),(198,300)],thickness=.014,bend=lambda x,z:-.008-.225*math.sqrt(max(0,1-((z-center.z)/.28)**2)))
    jewel('Front star medallion seat',(0,-.240,center.z-.015),(.075,.016,.075),0,2)
    pts=[]
    for i in range(16):a=i*TAU/16;r=.071 if i%2==0 else .026;pts.append((r*math.sin(a),-.24,center.z-.015+r*math.cos(a)))
    mesh('Eight-point raised compass star',pts+[(0,-.257,center.z-.015)],[(i,(i+1)%16,16) for i in range(16)],1)
    loop('Star rim',(0,-.236,center.z-.015),.076,.076,.004,1,n=36)
    return (0,0,center.z+.46)

def build(item):
    global objects,mats,concept
    bpy.ops.wm.read_factory_settings(use_empty=True);objects=[]
    concept=bpy.data.images.load(str(ROOT/f'docs/concepts/weapon-model-review/references/{item}-front.png'));concept.pack()
    metal=texture('Worn forged metal',dark=item!='inferno');gem=texture('Violet fractured crystal',True)
    mats=[material('Concept engraved surface',concept,.32,.65),material('Forged metal back and edges',metal,.78 if item=='inferno' else .55,.37 if item=='inferno' else .68),material('Stormstone' if item=='stormorbit' else 'Purple strap',gem,.22 if item=='stormorbit' else 0,.45 if item=='stormorbit' else .72,.06 if item=='stormorbit' else 0)]
    grip=Vector({'inferno':crown,'wardenheart':pendant,'thunderbell':bell,'stormorbit':orb}[item]())
    bpy.context.view_layer.update();points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
    span=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)];scale=SPECS[item]['length']/max(span)
    for o in objects:
        transform=o.matrix_world.copy()
        for v in o.data.vertices:v.co=(transform@v.co-grip)*scale
        o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(1,1,1)
    root=bpy.data.objects.new('Item_'+item,None);bpy.context.scene.collection.objects.link(root)
    for o in objects:o.parent=root
    root['itemId']=item;root['attachment']=SPECS[item]['attachment'];root['sourceUnits']='meters';root['gripNode']=item+'_Grip';root['tipNode']=item+'_Tip'
    for field in ['azimuth','elevation','margin','roll']:root['preview'+field.capitalize()]=SPECS[item]['preview'].get(field,0)
    distal=max((v.co for o in objects for v in o.data.vertices),key=lambda p:p.length_squared)
    for role,pos in [('Grip',Vector()),('Tip',distal)]:
        node=bpy.data.objects.new(item+'_'+role,None);bpy.context.scene.collection.objects.link(node);node.parent=root;node.location=pos;node['attachmentRole']=role
    for o in objects:o.data.calc_loop_triangles()
    triangles=sum(len(o.data.loop_triangles) for o in objects);assert triangles<=12000,(item,triangles)
    OUT.mkdir(parents=True,exist_ok=True);folder=SOURCE/item;folder.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/(item+'.blend')))
    path=OUT/(item+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_extras=True,export_animations=False,export_yup=True)
    receipt={'id':item,'method':'Local full-volume geometry with concept-projected engraving and textured PBR backs','triangles':triangles,'bytes':path.stat().st_size,'concept':f'references/{item}-front.png','grip':'Physical wearable anchor','status':'Candidate; independent visual review required'}
    (folder/'source.json').write_text(json.dumps(receipt,indent=2)+'\n');print(receipt)

if __name__=='__main__':
    import sys
    for item in sys.argv[1:] or ['inferno','wardenheart','thunderbell','stormorbit']:build(item)
