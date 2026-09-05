"""Original opaque blue ice scenery: fractured prisms, frost, and mineral seams.

Built through Blender MCP. No transmission sorting or large emissive faces are
needed at runtime; baked albedo/normal/ORM keep this reusable scenery inexpensive.
"""
import bpy,random,math
from mathutils import Vector,Euler

def ice_surface(key,base,roughness,frost=False):
    material=mat(key,base,0,roughness)
    nodes=material.node_tree.nodes;links=material.node_tree.links
    p=nodes.get('Principled BSDF');p.inputs['IOR'].default_value=1.31
    position=nodes.new('ShaderNodeNewGeometry')
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=4.5;noise.inputs['Detail'].default_value=3
    links.new(position.outputs['Position'],noise.inputs['Vector'])
    color=nodes.new('ShaderNodeValToRGB')
    color.color_ramp.elements[0].position=.20;color.color_ramp.elements[0].color=(*(v*.35 for v in base),1)
    color.color_ramp.elements[1].position=.78;color.color_ramp.elements[1].color=(*(min(1,v*1.55)for v in base),1)
    links.new(noise.outputs['Fac'],color.inputs[0]);links.new(color.outputs['Color'],p.inputs['Base Color'])
    grain=nodes.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=92 if frost else 17;grain.inputs['Detail'].default_value=2
    links.new(position.outputs['Position'],grain.inputs['Vector'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22 if frost else .10;bump.inputs['Distance'].default_value=.007 if frost else .004
    links.new(grain.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],p.inputs['Normal'])
    return material

def ice_shard(name,base,radius,height,tilt,frost_face=1):
    sides=6;angles=[i*2*math.pi/sides+random.uniform(-.07,.07)for i in range(sides)]
    radii=[radius*random.uniform(.78,1.12)for _ in range(sides)]
    vertices=[]
    for layer in range(3):
        for i,a in enumerate(angles):
            r=radii[i]*(.72 if layer==0 else 1 if layer==1 else .77)
            z=0 if layer==0 else height*random.uniform(.12,.19) if layer==1 else height*random.uniform(.69,.86)
            vertices.append((r*math.cos(a)+layer*.012,r*math.sin(a)-layer*.008,z))
    # A jagged, displaced apex gives unequal closed terminal faces.
    vertices.append((radius*.29,-radius*.18,height))
    faces=[tuple(reversed(range(sides)))]
    for layer in range(2):
        for i in range(sides):faces.append((layer*sides+i,layer*sides+(i+1)%sides,(layer+1)*sides+(i+1)%sides,(layer+1)*sides+i))
    for i in range(sides):faces.append((2*sides+i,2*sides+(i+1)%sides,3*sides))
    obj=mesh(name,vertices,faces,'iceDepth');obj.location=base;obj.rotation_euler=tilt
    obj.data.materials.append(MATS['iceBlue']);obj.data.materials.append(MATS['iceFrost'])
    for polygon in obj.data.polygons:
        side=(polygon.index-1)%sides
        polygon.material_index=2 if side==frost_face and polygon.index>6 else 1 if side in (2,4) else 0
    bevel(obj,.006,1)
    # Only a couple of interrupted seams catch pale light; no cyan flood-fill.
    rotation=Euler(tilt).to_matrix();origin=Vector(base)
    edge=(frost_face+1)%sides
    p0=Vector(vertices[sides+edge]);p1=Vector(vertices[2*sides+edge]);tip=Vector(vertices[-1])
    def world(p):return tuple(origin+rotation@p)
    line('Broken pale ice seam',[world(p0.lerp(p1,.15)),world(p0.lerp(p1,.67))],.0035,'iceGlint',4)
    if height>1.4:line('Sharp crown glint',[world(p1.lerp(tip,.18)),world(p1.lerp(tip,.85))],.0028,'iceGlint',4)
    return obj

def make_ice_cluster_v2():
    global PART
    collection=begin('ice_cluster')
    ice_surface('iceDepth',(.009,.038,.080),.26)
    ice_surface('iceBlue',(.020,.095,.155),.31)
    ice_surface('iceFrost',(.20,.32,.36),.72,True)
    mat('iceGlint',(.26,.43,.48),0,.52)
    for name,base,radius,height,tilt,face in [
        ('Tall split ice prism',(.02,.09,.035),.34,2.46,(.025,-.10,.16),4),
        ('Leaning rear ice blade',(.38,.27,.025),.28,1.90,(-.18,.25,-.22),2),
        ('Broken left ice spur',(-.37,.02,.025),.285,1.56,(.16,-.29,.44),4),
        ('Short angled ice spear',(.41,-.22,.02),.24,1.05,(.28,.40,-.40),1),
        ('Front fractured ice tooth',(-.19,-.32,.02),.21,.75,(.30,-.11,.24),3),
    ]:ice_shard(name,base,radius,height,tilt,face)
    for i in range(10):
        angle=random.random()*2*math.pi;r=random.uniform(.13,.63)
        o=ico('Frozen fractured footing',(r*math.cos(angle),r*math.sin(angle),.055),(.10+random.random()*.09,.10+random.random()*.06,.05+random.random()*.04),'iceDepth' if i%3 else 'iceFrost',1,.13)
        for vertex in o.data.vertices:vertex.co.z=max(vertex.co.z,-.05)
        bevel(o,.004,1)
    bpy.context.view_layer.update()
    positions=[obj.matrix_world@v.co for obj in collection.objects for v in obj.data.vertices]
    offset=Vector(((min(p.x for p in positions)+max(p.x for p in positions))/2,(min(p.y for p in positions)+max(p.y for p in positions))/2,min(p.z for p in positions)))
    for obj in collection.objects:obj.location-=offset
    return collection
