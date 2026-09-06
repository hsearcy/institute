"""Uninstalled photo-registered paving study. Construct through Blender MCP.

Ten silhouettes are traced from the existing cobble photograph, not a grid.
Coordinates use the 1254px reference view and retain the game's 4.8m repeat.
The source is a bounded wall-side strip; it does not alter collision or saves.
"""
from pathlib import Path
import math
import random

import bpy
import bmesh
from mathutils import Vector


REFERENCE_SIZE = 1254
TILE_METERS = 4.8
CONTOURS = [
    [(234,187),(300,184),(357,202),(365,283),(356,352),(367,400),(344,445),(317,453),(292,437),(248,426),(233,356)],
    [(379,281),(432,271),(513,275),(523,338),(512,383),(471,395),(392,391),(372,370)],
    [(534,279),(589,271),(693,267),(705,304),(694,350),(655,369),(550,385),(530,366)],
    [(711,283),(744,273),(764,290),(780,343),(754,359),(711,363),(698,317)],
    [(228,429),(276,435),(303,458),(310,511),(300,554),(263,558),(208,550),(196,520),(204,462)],
    [(370,410),(415,410),(463,396),(472,438),(457,550),(442,581),(352,596),(319,580),(318,521),(341,462)],
    [(486,425),(523,410),(613,391),(647,398),(655,441),(644,491),(661,571),(650,609),(573,593),(483,574),(475,549)],
    [(716,380),(755,380),(779,416),(782,477),(793,522),(784,590),(755,616),(702,630),(666,608),(668,550),(688,493),(681,457)],
    [(359,612),(428,601),(518,598),(533,616),(535,697),(543,779),(509,792),(374,805),(359,785),(350,731),(345,655)],
    [(551,632),(577,631),(613,639),(646,641),(654,681),(642,747),(601,759),(558,770),(550,719)],
]


def build_paving_strip(repo_root):
    root = Path(repo_root)
    scene = bpy.data.scenes.new('Photo registered paving strip v2')
    bpy.context.window.scene = scene
    collection = bpy.data.collections.new('Ten worn paving stones')
    scene.collection.children.link(collection)
    photo = bpy.data.images.load(str(root / 'web/public/assets/rpg/dungeon-cobbles-v2.png'), check_existing=True)
    stone = bpy.data.materials.new('Existing cobble photo at world scale')
    stone.use_nodes = True
    nodes, links = stone.node_tree.nodes, stone.node_tree.links
    shader = nodes.get('Principled BSDF')
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = photo
    links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = .94
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Distance'].default_value = .003
    bump.inputs['Strength'].default_value = .24
    links.new(texture.outputs['Color'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])

    cut = bpy.data.materials.new('Exposed stone edge at physical grain scale')
    cut.use_nodes = True
    nodes, links = cut.node_tree.nodes, cut.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .97
    position = nodes.new('ShaderNodeNewGeometry')
    grain = nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 140
    grain.inputs['Detail'].default_value = 2
    links.new(position.outputs['Position'], grain.inputs['Vector'])
    color = nodes.new('ShaderNodeValToRGB')
    color.color_ramp.elements[0].color = (.045,.037,.025,1)
    color.color_ramp.elements[1].color = (.088,.075,.05,1)
    links.new(grain.outputs['Fac'],color.inputs[0])
    links.new(color.outputs[0],shader.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Distance'].default_value = .0018
    links.new(grain.outputs['Fac'],bump.inputs['Height'])
    links.new(bump.outputs['Normal'],shader.inputs['Normal'])

    dirt = bpy.data.materials.new('Packed mortar and fractured grit')
    dirt.use_nodes = True
    nodes, links = dirt.node_tree.nodes, dirt.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .98
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 95
    noise.inputs['Detail'].default_value = 3
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (.024, .019, .012, 1)
    ramp.color_ramp.elements[1].color = (.11, .09, .057, 1)
    links.new(noise.outputs['Fac'], ramp.inputs[0])
    links.new(ramp.outputs[0], shader.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Distance'].default_value = .009
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])

    def prism(name, contour, top, material, bevel=.009, tilt=(0, 0)):
        # glTF maps Blender -Y to game +Z. The game floor uses (X,Z)/4.8.
        points = [(x / REFERENCE_SIZE * TILE_METERS, -(1-y / REFERENCE_SIZE)*TILE_METERS) for x,y in contour]
        center = Vector((sum(p[0] for p in points)/len(points), sum(p[1] for p in points)/len(points)))
        heights = [top+(x-center.x)*tilt[0]+(y-center.y)*tilt[1] for x,y in points]
        n = len(points)
        vertices = [(x,y,-.025) for x,y in points]+[(x,y,h) for (x,y),h in zip(points,heights)]
        faces = [tuple(range(n-1,-1,-1)), tuple(range(n,n*2))]
        faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        mesh.materials.append(material)
        if material == stone:
            mesh.materials.append(cut)
            for face in mesh.polygons:
                if face.index >= 2: face.material_index = 1
        bm=bmesh.new(); bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(mesh); bm.free()
        bpy.context.view_layer.objects.active=obj
        if bevel:
            modifier=obj.modifiers.new('Broad worn shoulders','BEVEL')
            modifier.width=bevel; modifier.segments=3
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        uv=obj.data.uv_layers.new(name='World registered photograph')
        for face in obj.data.polygons:
            for index in face.loop_indices:
                p=obj.data.vertices[obj.data.loops[index].vertex_index].co
                uv.data[index].uv=(p.x/TILE_METERS,-p.y/TILE_METERS)
        return obj

    for i, contour in enumerate(CONTOURS):
        top = [.012,.016,.01,.008,.011,.021,.028,.014,.009,.013][i]
        tilt = (.012,-.008) if i==5 else ((-.025,.012) if i==7 else (0,0))
        # A lost shoulder follows the original large slab's upper-left corner.
        if i==6:
            prism('Dirt occupying the missing slab corner', contour, .007, dirt, .005)
            contour=[(520,417)]+contour[2:]+[(490,453)]
        prism('Photo stone %02d'%i, contour, top, stone, tilt=tilt)
    # Settled broken fragments remain in the missing corner at unequal heights.
    prism('Settled slab corner',[(487,427),(510,420),(488,447),(480,460)],.011,stone,.004,(-.015,.008))
    rng=random.Random(513)
    for i in range(14):
        x=479+rng.random()*29; y=422+rng.random()*40
        radius=2+rng.random()*3
        poly=[(x+math.cos(a)*radius,y+math.sin(a)*radius*.65) for a in (0,1.4,2.6,4.0,5.2)]
        prism('Fracture chip %02d'%i,poly,.009+rng.random()*.006,stone,.0015)
    return scene, collection


def render_paving_strip(scene, collection, output, top_view=False):
    """Reference photograph stays on the supporting floor beneath the study."""
    caller=bpy.context.window.scene
    bpy.context.window.scene=scene
    try:
        ground=scene.objects.get('Registered existing flat floor')
        if ground is None:
            mesh=bpy.data.meshes.new('Reference floor tile')
            mesh.from_pydata([(0,0,-.001),(0,-4.8,-.001),(4.8,-4.8,-.001),(4.8,0,-.001)],[],[(0,1,2,3)])
            mesh.update()
            uv=mesh.uv_layers.new()
            for i,point in enumerate([(0,0),(0,1),(1,1),(1,0)]): uv.data[i].uv=point
            ground=bpy.data.objects.new('Registered existing flat floor',mesh)
            scene.collection.objects.link(ground)
            material=next(o.data.materials[0] for o in collection.objects if o.name.startswith('Photo stone'))
            mesh.materials.append(material)
            scene.world=bpy.data.worlds.new('Paving source ambient')
            scene.world.use_nodes=True
            scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.17,.20,.25,1)
            scene.world.node_tree.nodes['Background'].inputs[1].default_value=.24
            for name,location,power,size,color in [('Warm key',(-1,-2,5),700,3.0,(1,.79,.57)),('Cool fill',(4,4,5),430,4.0,(.62,.76,1))]:
                light=bpy.data.lights.new(name,'AREA'); light.energy=power; light.shape='DISK'; light.size=size; light.color=color
                obj=bpy.data.objects.new(name,light); scene.collection.objects.link(obj); obj.location=location
                obj.rotation_euler=(Vector((2,-2.5,0))-obj.location).to_track_quat('-Z','Y').to_euler()
            camera=bpy.data.cameras.new('Paving review camera')
            obj=bpy.data.objects.new(camera.name,camera);scene.collection.objects.link(obj);scene.camera=obj
        focus=Vector((1.92,-2.82,.02))
        scene.camera.location=focus+(Vector((0,0,8)) if top_view else Vector((4,-5,7)))
        scene.camera.rotation_euler=(focus-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.camera.data.type='ORTHO'; scene.camera.data.ortho_scale=3.45
        scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=True
        scene.render.resolution_x=1000;scene.render.resolution_y=900;scene.render.resolution_percentage=100
        scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
        scene.render.image_settings.file_format='PNG';scene.render.filepath=str(output)
        bpy.ops.render.render(write_still=True)
    finally:
        bpy.context.window.scene=caller
