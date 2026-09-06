"""Equipped authored skeleton candidate; no canonical/runtime writes.

Uses the pinned CC0 Blender Studio anatomy and the accepted CC0 warrior hilt.
Source scenes remain separate. Independent review precedes any asset promotion.
"""
from pathlib import Path
import importlib.util,json,math,time
import bpy
from mathutils import Vector,Matrix


def module(path,name):
    spec=importlib.util.spec_from_file_location(name,str(path));value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value


def bone_material():
    mat=bpy.data.materials.new('Enemy aged ivory source');mat.use_nodes=True
    n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF')
    p.inputs['Roughness'].default_value=.78;p.inputs['Specular IOR Level'].default_value=.23
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=7;noise.inputs['Detail'].default_value=3
    colors=n.new('ShaderNodeValToRGB');colors.color_ramp.elements[0].position=.18;colors.color_ramp.elements[0].color=(.25,.215,.16,1)
    colors.color_ramp.elements[1].position=.82;colors.color_ramp.elements[1].color=(.48,.425,.33,1)
    l.new(noise.outputs['Fac'],colors.inputs[0]);l.new(colors.outputs['Color'],p.inputs['Base Color'])
    grain=n.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=140;grain.inputs['Detail'].default_value=2
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.002
    l.new(grain.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    return mat


def leather_material():
    mat=bpy.data.materials.new('Enemy worn harness leather');mat.use_nodes=True
    n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(.065,.038,.024,1);p.inputs['Roughness'].default_value=.84;p.inputs['Specular IOR Level'].default_value=.19
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=100;noise.inputs['Detail'].default_value=3
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22;bump.inputs['Distance'].default_value=.003
    l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    return mat


def harness(collection):
    material=leather_material()
    def strap(name,points,width,closed=False):
        points=[Vector(p) for p in points];vertices=[];faces=[]
        for i,p in enumerate(points):
            tangent=(points[(i+1)%len(points)]-points[i-1]) if closed else points[min(i+1,len(points)-1)]-points[max(0,i-1)]
            normal=Vector((p.x,p.y,0)).normalized() if closed else Vector((0,-1,0))
            across=tangent.cross(normal).normalized()
            edge=width*(.90 if i in (3,9) else 1)
            vertices.extend([p-across*edge*.5,p+across*edge*.5])
        for i in range(len(points) if closed else len(points)-1):
            j=(i+1)%len(points);faces.append((i*2,j*2,j*2+1,i*2+1))
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(material);mesh.update()
        obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj);obj['authoredHarness']=True;obj['part']='Body'
        bpy.context.view_layer.objects.active=obj
        solid=obj.modifiers.new('Leather strap thickness','SOLIDIFY');solid.thickness=.005;bpy.ops.object.modifier_apply(modifier=solid.name)
        bevel=obj.modifiers.new('Worn rounded strap edge','BEVEL');bevel.width=.0015;bevel.segments=2;bpy.ops.object.modifier_apply(modifier=bevel.name)
        return obj
    strap('Narrow scavenged diagonal harness',[(-.18,-.065,1.43),(-.165,-.11,1.40),(-.11,-.145,1.33),(-.045,-.155,1.25),(.025,-.13,1.17),(.087,-.075,1.085),(.105,-.061,1.045)],.022)
    strap('Harness shoulder return',[(-.18,-.065,1.43),(-.19,-.015,1.47),(-.175,.055,1.43),(-.11,.085,1.30),(-.02,.073,1.15),(.115,.033,1.04)],.023)
    strap('Worn pelvis belt',[(.147*math.cos(i*math.tau/28),.083*math.sin(i*math.tau/28),1.019+.005*math.sin(i*math.tau/28)) for i in range(28)],.028,True)
    metal=bpy.data.materials.new('Harness dark iron buckle');metal.use_nodes=True
    shader=metal.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.10,.085,.065,1);shader.inputs['Metallic'].default_value=.72;shader.inputs['Roughness'].default_value=.58
    center=Vector((.105,-.061,1.022));normal=Vector((.105/.147**2,-.061/.083**2,0)).normalized();horizontal=Vector((0,0,1)).cross(normal).normalized()
    vertices=[];faces=[]
    for depth in (0,.004):
        for width,height in ((.017,.014),(.011,.008)):
            for x,z in ((-1,-1),(1,-1),(1,1),(-1,1)):vertices.append(center+horizontal*width*x+Vector((0,0,height*z))+normal*depth)
    for i in range(4):
        j=(i+1)%4
        faces.extend([(i,j,4+j,4+i),(8+i,12+i,12+j,8+j),(i,8+i,8+j,j),(4+i,4+j,12+j,12+i)])
    mesh=bpy.data.meshes.new('Hollow forged harness buckle');mesh.from_pydata(vertices,[],faces);mesh.materials.append(metal);mesh.update()
    obj=bpy.data.objects.new('Harness buckle at strap junction',mesh);collection.objects.link(obj);obj['authoredHarness']=True;obj['part']='Body'


def add_authored_weapon(root,scene,collection):
    folder=Path(root)/'scripts/blender/experiments'
    source=module(folder/'authored_hero.py','enemy_weapon_source')
    rig=module(folder/'rig_authored_hero.py','enemy_weapon_extract')
    prior=bpy.context.window.scene
    try:
        source_scene=source.load_authored_warrior(root)
        parts=source.source_review(source_scene,'enemy-weapon-source',height=1.85)
        source.control_metal_response(parts)
        rig.draw_authored_sword(parts)
        target=Vector(collection['gripCenterR']);origin=Vector((-.600,-.125,1.025))
        transform=Matrix.Translation(target)@Matrix.Scale(.78,4)@Matrix.Translation(-origin)
        for obj in list(parts.objects):
            if obj.get('sourcePart')!='equipped_sword':continue
            copy=bpy.data.objects.new('Enemy_'+obj.name,obj.data.copy());collection.objects.link(copy)
            copy.data.transform(transform);copy['equipmentHand']='R';copy['part']='ArmLowerR';copy['sourceAsset']='CC0 hooded warrior hilt and authored forged blade'
            # Keep the reviewed broad steel bevels; two shallow nicks break the
            # otherwise perfect edge without changing the grip or guard.
            if 'blade' in copy.name.lower():
                for vertex in copy.data.vertices:
                    if vertex.index in (8,10):vertex.co.x+=(.002 if vertex.index==8 else -.002)
        collection['weaponSourceSHA']=source.SOURCE_SHA
    finally:bpy.context.window.scene=prior


def build_candidate(root):
    anatomy=module(Path(root)/'scripts/blender/experiments/authored_enemies.py','equipped_anatomy')
    prior=bpy.context.window.scene
    try:
        scene,collection=anatomy.build_anatomy_study(root)
        bpy.context.window.scene=scene
        collection['equippedStudy']=True
        anatomy.strengthen_anatomy_visibility(collection);anatomy.curl_anatomical_hands(collection)
        mat=bone_material()
        for obj in collection.objects:
            if obj.type=='MESH':obj.data.materials.clear();obj.data.materials.append(mat)
        harness(collection);add_authored_weapon(root,scene,collection)
        bpy.context.window.scene=scene
        joints=anatomy.articulate_anatomy_study(collection,True)
        collection['status']='Equipped candidate only; source/export/native review required'
        scene.name='Authored skeleton equipped candidate'
        return scene,collection,joints,anatomy
    finally:bpy.context.window.scene=prior


def render_candidate(root,prefix):
    prior=bpy.context.window.scene;marker=Path('/tmp/blender-assets-window.json');started=time.time()
    marker.write_text(json.dumps({'window':Path(prefix).name,'status':'busy','started':started})+'\n')
    success=False
    try:
        scene,collection,joints,anatomy=build_candidate(root)
        anatomy.render_anatomy_study(scene,str(prefix)+'-high.png',high=True)
        anatomy.render_anatomy_study(scene,str(prefix)+'-arm.png',detail=True)
        anatomy.render_anatomy_study(scene,str(prefix)+'-native.png',high=True,native=True)
        triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in collection.objects if o.type=='MESH')
        Path(str(prefix)+'-source.json').write_text(json.dumps({'triangles':triangles,'joints':list(joints),'sourceOnly':True,'scene':scene.name,'collection':collection.name},indent=2)+'\n')
        success=True;return scene,collection
    finally:
        bpy.context.window.scene=prior
        marker.write_text(json.dumps({'window':Path(prefix).name,'status':'idle','started':started,'finished':time.time(),'success':success,'restoredScene':prior.name})+'\n')
