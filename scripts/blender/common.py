"""Original Sunken Vault geometry helpers; executed in Blender via Blender MCP."""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi

RPG_REPO_ROOT=Path(globals().get('RPG_REPO_ROOT','/home/houston/git/institute'))
OUT = RPG_REPO_ROOT/'web/public/assets/rpg'
random.seed(214)
MATS = {}
CURRENT = None
PART = 'Body'

def mat(name, color, metal=0, rough=.6, emission=0):
    m = bpy.data.materials.new('Vault_' + name)
    m.diffuse_color = (*color,1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color,1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emission:
        p.inputs['Emission Color'].default_value = (*color,1)
        p.inputs['Emission Strength'].default_value = emission
    m['bucket'] = 'glow' if emission else 'metal' if metal > .45 else 'matte'
    MATS[name] = m
    return m

mat('stone', (.16,.20,.22),0,.88)
mat('stoneLight', (.26,.30,.31),0,.85)
mat('stoneDark', (.085,.11,.125),0,.9)
mat('bronze', (.47,.25,.075),.78,.34)
mat('gold', (.78,.49,.17),.8,.3)
mat('iron', (.095,.12,.135),.72,.45)
mat('leather', (.10,.054,.026),0,.85)
mat('teal', (.018,.24,.245),0,.72)
mat('tealLight', (.035,.37,.37),0,.66)
mat('tealDark', (.008,.095,.11),0,.8)
mat('shadow', (.008,.016,.02),0,.98)
mat('cyan', (.025,.55,.8),.22,.26,2)
mat('crystal', (.03,.24,.4),.3,.24)
mat('amber', (1,.28,.018),.3,.23,3)
mat('flame', (1,.62,.09),0,.4,4)
mat('wood', (.16,.07,.025),0,.8)

def begin(name):
    global CURRENT, PART
    PART='Body'
    CURRENT = bpy.data.collections.new('Vault_' + name)
    bpy.context.scene.collection.children.link(CURRENT)
    return CURRENT

def finish(o, name, material):
    o.name = name
    for c in list(o.users_collection): c.objects.unlink(o)
    CURRENT.objects.link(o)
    o.data.materials.append(MATS[material])
    o['part']=PART
    return o

def mesh(name, verts, faces, material):
    d=bpy.data.meshes.new(name); d.from_pydata(verts,[],faces); d.update()
    o=bpy.data.objects.new(name,d); CURRENT.objects.link(o)
    o.data.materials.append(MATS[material]); o['part']=PART
    return o

def bevel(o,w=.025,segments=2):
    bpy.context.view_layer.objects.active=o
    mod=o.modifiers.new('Hand-rounded edges','BEVEL'); mod.width=w; mod.segments=segments
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def cube(name,loc,scale,material,edge=.02):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,material)
    if edge: bevel(o,edge)
    return o

def ico(name,loc,scale,material,detail=2,jitter=0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail,radius=1,location=loc)
    o=bpy.context.object
    for v in o.data.vertices:
        f=1+random.uniform(-jitter,jitter)
        v.co.x*=scale[0]*f; v.co.y*=scale[1]*f; v.co.z*=scale[2]*f
    return finish(o,name,material)

def ringmesh(name,rings,material,n=12):
    # rings: center x,y,z, horizontal x/y radii; custom lathed bodies.
    verts=[]
    for x,y,z,rx,ry in rings:
        verts += [(x+rx*cos(i*2*pi/n),y+ry*sin(i*2*pi/n),z) for i in range(n)]
    faces=[tuple(reversed(range(n)))]
    for j in range(len(rings)-1):
        for i in range(n): faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    faces.append(tuple((len(rings)-1)*n+i for i in range(n)))
    return mesh(name,verts,faces,material)

def rod(name,a,b,r1,r2,material,n=10):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r1,radius2=r2,depth=(b-a).length,location=(a+b)/2)
    o=bpy.context.object; o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return finish(o,name,material)

def line(name,pts,radius,material,n=6):
    # Polygonal tubular molding / inlay, deliberately realtime geometry.
    verts=[]
    for i,p in enumerate(pts):
        p=Vector(p)
        tangent=Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)])
        tangent.normalize(); u=tangent.cross(Vector((0,1,0)))
        if u.length<.01: u=tangent.cross(Vector((1,0,0)))
        u.normalize(); v=tangent.cross(u).normalized()
        verts += [tuple(p+radius*(u*cos(j*2*pi/n)+v*sin(j*2*pi/n))) for j in range(n)]
    faces=[]
    for i in range(len(pts)-1):
        for j in range(n):faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
    return mesh(name,verts,faces,material)

def crystal(name,loc,radius,height,material='crystal',tilt=(0,0,0),n=6):
    o=ringmesh(name,[(0,0,0,radius*.65,radius*.65),(0,0,height*.15,radius,radius),(0,0,height*.72,radius*.85,radius*.85),(radius*.17,0,height,0,0)],material,n)
    o.location=loc; o.rotation_euler=tilt
    # Alternating facets supply depth even under soft game lighting.
    o.data.materials.append(MATS['cyan'])
    for p in o.data.polygons:
        if p.index % 7 == 3:p.material_index=1
    return o

def consolidate(collection):
    """Bake colors, merge by articulated part and PBR family: few draw calls."""
    groups={}
    for o in list(collection.objects):
        if o.type!='MESH':continue
        # Split nothing: model helpers use one PBR family each (crystal has glow accents).
        bucket=o.data.materials[0].get('bucket','matte')
        if bucket=='glow':bucket='glow_'+o.data.materials[0].name.split('Vault_')[-1].split('.')[0]
        if len({m.get('bucket','matte') for m in o.data.materials})>1:bucket='crystal'
        groups.setdefault((o.get('part','Body'),bucket),[]).append(o)
    for (part,bucket),objects in groups.items():
        vertexmat=bpy.data.materials.get('Vault_Vertex_'+bucket)
        if not vertexmat:
            vertexmat=bpy.data.materials.new('Vault_Vertex_'+bucket);vertexmat.use_nodes=True
            p=vertexmat.node_tree.nodes.get('Principled BSDF')
            p.inputs['Metallic'].default_value=.72 if bucket=='metal' else .1
            p.inputs['Roughness'].default_value=.35 if bucket=='metal' else .78
            c=vertexmat.node_tree.nodes.new('ShaderNodeVertexColor');c.layer_name='Color'
            vertexmat.node_tree.links.new(c.outputs['Color'],p.inputs['Base Color'])
            if bucket.startswith('glow_') or bucket=='crystal':
                # glTF cannot link vertex colors to emission; keep a constant hue.
                p.inputs['Emission Color'].default_value=tuple(objects[0].data.materials[0].diffuse_color) if bucket.startswith('glow_') else (.01,.18,.35,1)
                p.inputs['Emission Strength'].default_value=2.5 if bucket.startswith('glow_') else .5
                p.inputs['Roughness'].default_value=.28
        for o in objects:
            colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
            for face in o.data.polygons:
                col=o.data.materials[face.material_index].diffuse_color
                variation=random.uniform(.90,1.07) if bucket=='matte' else 1
                for li in face.loop_indices:colors.data[li].color=(*(min(1,c*variation) for c in col[:3]),1)
            o.data.materials.clear();o.data.materials.append(vertexmat)
            for face in o.data.polygons:face.material_index=0
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        merged=objects[0];merged.name=part+'_'+bucket
        bpy.context.scene.cursor.location=(0,0,0)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)

def export_asset(name,collection):
    consolidate(collection)
    bpy.ops.object.select_all(action='DESELECT')
    for o in collection.objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True)
    return {'file':name+'.glb','meshes':len(collection.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in collection.objects if o.type=='MESH')}
