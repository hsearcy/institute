"""Project-authored equipment studies, executed inside Blender through MCP.

No public assets are modified. Source materials are reviewed before UV baking.
Call build_study() then render_study(scene, output), restoring the caller's scene.
"""
import json
import importlib.util
import hashlib
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path('/home/houston/git/institute')
OUT = ROOT / 'tmp/item-models'
CATALOGUE = json.loads((ROOT / 'scripts/blender/items/catalogue.json').read_text())
_spec=importlib.util.spec_from_file_location('item_study_surfaces',ROOT/'scripts/blender/items/surfaces.py')
SURFACES=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(SURFACES)
_metal_spec=importlib.util.spec_from_file_location('item_metal_weapons',ROOT/'scripts/blender/items/metal_weapons.py')
METAL_WEAPONS=importlib.util.module_from_spec(_metal_spec);_metal_spec.loader.exec_module(METAL_WEAPONS)


def material(name, color, metal=0, rough=.5, emission=0, grain=0):
    mat = bpy.data.materials.new('Item study ' + name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Emission Color'].default_value = (*color, 1)
    bsdf.inputs['Emission Strength'].default_value = emission
    if grain:
        tex = nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 125
        tex.inputs['Detail'].default_value = 2
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .18
        bump.inputs['Distance'].default_value = grain
        links.new(tex.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
        ramp = nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (*[v * .56 for v in color], 1)
        ramp.color_ramp.elements[1].color = (*[min(1, v * 1.18) for v in color], 1)
        links.new(tex.outputs['Fac'], ramp.inputs['Fac'])
        links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def palette():
    mats = {
        'steel': material('forged blue steel', (.19, .26, .31), .86, .29, grain=.00045),
        'edge': material('honed bevel', (.48, .54, .57), .92, .22),
        'dark': material('black iron recess', (.025, .033, .042), .76, .43),
        'brass': material('aged brass', (.30, .18, .062), .8, .32, grain=.0003),
        'copper': material('repaired copper', (.36, .105, .038), .82, .38, grain=.0003),
        'leather': material('oxblood grip leather', (.075, .017, .012), 0, .71, grain=.0008),
        'navy': material('navy grip', (.014, .038, .055), 0, .68, grain=.0006),
        'bark': material('charred bark', (.026, .018, .012), 0, .9, grain=.0017),
        'wood': material('split warm heartwood', (.13, .048, .014), 0, .84, grain=.0006),
        'ember': material('sheltered ember', (.72, .085, .008), .05, .53, emission=1.6),
        'ice': material('deep glacial body', (.019, .105, .17), .18, .24),
        'ice_mid': material('cold internal plane', (.07, .24, .33), .24, .29),
        'ice_edge': material('frosted cutting edge', (.38, .65, .71), .12, .44),
        'ceramic': material('cobalt insulator', (.021, .041, .15), .12, .23),
        'arc': material('recessed violet conductor', (.12, .12, .48), .28, .3, emission=.45),
        'char': material('matte charcoal cleft', (.008,.009,.010),0,.86,grain=.0005),
        'cutwood': material('exposed split fibers', (.34,.18,.074),0,.82,grain=.001),
        'guard': material('handled forged hilt steel',(.26,.28,.29),.86,.36,grain=.0006),
    }
    # The source materials have directional structure at readable scale. The
    # eventual maps bake these nodes; no procedural shader is needed in-game.
    for key in ('steel','edge','brass','copper','bark','wood','leather','navy'):
        mat=mats[key];nodes=mat.node_tree.nodes;links=mat.node_tree.links
        bsdf=nodes.get('Principled BSDF')
        texcoord=nodes.new('ShaderNodeTexCoord')
        stretch=nodes.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY'
        stretch.inputs[1].default_value=(42,42,2.5) if key in ('bark','wood') else (75,25,3)
        links.new(texcoord.outputs['Generated'],stretch.inputs[0])
        noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1;noise.inputs['Detail'].default_value=2.4
        links.new(stretch.outputs[0],noise.inputs['Vector'])
        ramp=nodes.new('ShaderNodeValToRGB')
        low,high=(.68,.95) if key in ('bark','wood','leather','navy') else (.24,.43)
        ramp.color_ramp.elements[0].color=(low,low,low,1);ramp.color_ramp.elements[1].color=(high,high,high,1)
        links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],bsdf.inputs['Roughness'])
        if key in ('bark','wood'):
            bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.45;bump.inputs['Distance'].default_value=.0035
            links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
    nodes=mats['guard'].node_tree.nodes;links=mats['guard'].node_tree.links
    geom=nodes.new('ShaderNodeNewGeometry');ramp=nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position=.38;ramp.color_ramp.elements[0].color=(.085,.10,.11,1)
    ramp.color_ramp.elements[1].position=.62;ramp.color_ramp.elements[1].color=(.48,.49,.50,1)
    mid=ramp.color_ramp.elements.new(.5);mid.color=(.25,.27,.28,1)
    links.new(geom.outputs['Pointiness'],ramp.inputs[0]);links.new(ramp.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
    return mats


def mesh(name, verts, faces, mat, parent=None, bevel=0, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(mat)
    obj.parent = parent
    if smooth:
        for face in data.polygons:
            face.use_smooth = True
    if bevel:
        mod = obj.modifiers.new('Forged edge bevel', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        mod.affect = 'EDGES'
        normal = obj.modifiers.new('Planar weighted normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
    return obj


def tube(name, points, radii, mat, parent, sides=12, phase=0, ridged=0):
    verts, faces = [], []
    for i, (point, radius) in enumerate(zip(points, radii)):
        point = Vector(point)
        tangent = Vector(points[min(i+1, len(points)-1)]) - Vector(points[max(0, i-1)])
        tangent.normalize()
        across = tangent.cross(Vector((0, 1, 0)))
        if across.length < .01:
            across = tangent.cross(Vector((1, 0, 0)))
        across.normalize()
        depth = tangent.cross(across).normalized()
        for j in range(sides):
            angle = j * math.tau / sides + phase
            rr = radius * (1 + ridged * math.sin(j * 2.37 + i * .75))
            verts.append(tuple(point + rr * (across * math.cos(angle) + depth * math.sin(angle))))
    for i in range(len(points)-1):
        for j in range(sides):
            a, b = i*sides+j, i*sides+(j+1)%sides
            faces.append((a, b, b+sides, a+sides))
    faces.extend([tuple(reversed(range(sides))), tuple((len(points)-1)*sides+j for j in range(sides))])
    return mesh(name, verts, faces, mat, parent, smooth=not ridged)


def collar(name, z, radius, height, mat, parent, center=(0,0)):
    x, y = center
    return tube(name, [(x,y,z-height/2),(x,y,z+height/2)], [radius,radius], mat, parent, sides=16)


def ring(name, center, radius, thickness, mat, parent, plane='xy', segments=32):
    points = []
    for i in range(segments+1):
        a = i*math.tau/segments
        offset = (radius*math.cos(a),radius*math.sin(a),0) if plane=='xy' else (radius*math.cos(a),0,radius*math.sin(a))
        points.append(tuple(Vector(center)+Vector(offset)))
    return tube(name, points, [thickness]*len(points), mat, parent, sides=6)


def grip(parent, p, length=.20, navy=False):
    tube('Tapered grip core', [(0,0,-length/2),(0,0,length/2)], [.024,.022], p['navy' if navy else 'leather'], parent, 12)
    # A broad flat leather ribbon overlaps the previous turn; no wire coils.
    verts=[]
    for i in range(241):
        t=i/240;angle=t*math.tau*7.5;radius=.0245-.002*t
        for side in (-1,1):
            verts.append(((radius+.00015*side)*math.cos(angle),(radius+.00015*side)*math.sin(angle),-length/2+t*length+side*.015))
    wrap=mesh('Overlapping flat leather wrap',verts,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(240)],p['navy' if navy else 'leather'],parent,smooth=True)
    solid=wrap.modifiers.new('Leather ribbon thickness','SOLIDIFY');solid.thickness=.0004
    for z in (-length/2-.008,length/2+.008):
        collar('Grip ferrule',z,.028,.017,p['brass'],parent)


def blade(parent, p, sections, name='Forged blade'):
    # Each level has two cutting edges and front/back ridges. Actual oblique
    # planes, not a flat extruded polygon, carry the broad steel highlight.
    verts=[]
    for z,x,width,depth in sections:
        verts.extend([(x-width,0,z),(x,-depth,z),(x+width,0,z),(x,depth,z)])
    faces=[]
    for i in range(len(sections)-1):
        for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
    faces.extend([(3,2,1,0),tuple((len(sections)-1)*4+j for j in range(4))])
    obj=mesh(name,verts,faces,p['steel'],parent,bevel=.0015)
    obj.data.materials.append(p['edge'])
    for face in obj.data.polygons:
        if face.index%4==0:face.material_index=1
    return obj


def apprentice(root,p):
    SURFACES.wrapped_hilt(root,p)
    for z in (-.109,.120):
        solid_outline('Fitted brass grip ferrule',[(-.024,z-.006),(-.024,z+.006),(.024,z+.006),(.024,z-.006)],.018,p['brass'],root,.0015)
    # A lenticular steel wheel, with a raised peened center and continuous
    # bevel shoulders, gives the pommel actual volume on both sides.
    verts=[];faces=[]
    front=[(-.019*math.sqrt(max(0,1-(radius/.033)**2)),radius) for radius in (.003,.009,.015,.021,.026,.030,.032)]
    rings=front+[(-.003,.033),(.003,.033)]+[(-y,r) for y,r in reversed(front)]
    sides=64
    for y,radius in rings:
        for j in range(sides):
            angle=j*math.tau/sides;verts.append((radius*math.cos(angle),y,-.146+radius*math.sin(angle)))
    for k in range(len(rings)-1):
        for j in range(sides):faces.append((k*sides+j,k*sides+(j+1)%sides,(k+1)*sides+(j+1)%sides,(k+1)*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple((len(rings)-1)*sides+j for j in range(sides))])
    mesh('Continuous lenticular forged wheel pommel',verts,faces,p['guard'],root,smooth=True)
    # Forged quillons widen into the tang and have a raised front ridge. Their
    # thickness tapers outward as in the museum construction reference.
    verts=[];faces=[]
    stations=[(-.165,.093,.009,.010),(-.143,.116,.012,.014),(-.08,.140,.016,.018),(0,.146,.023,.022),(.08,.140,.016,.018),(.143,.116,.012,.014),(.165,.093,.009,.010)]
    section=[(-1,0),(-.7,-1),(.7,-1),(1,0),(.7,1),(-.7,1)]
    for x,z,height,depth in stations:
        for yy,zz in section:verts.append((x,yy*depth,z+zz*height))
    for k in range(len(stations)-1):
        for j in range(6):faces.append((k*6+j,k*6+(j+1)%6,(k+1)*6+(j+1)%6,(k+1)*6+j))
    faces.extend([tuple(reversed(range(6))),tuple((len(stations)-1)*6+j for j in range(6))])
    guard_material=p['guard'].copy();guard_material.name='Item Apprentice brushed crossguard'
    guard_shader=guard_material.node_tree.nodes.get('Principled BSDF')
    guard_shader.inputs['Roughness'].default_value=.54;guard_shader.inputs['Metallic'].default_value=.65
    darken=guard_material.node_tree.nodes.new('ShaderNodeVectorMath');darken.operation='MULTIPLY';darken.inputs[1].default_value=(.32,.36,.38)
    guard_material.node_tree.links.new(guard_shader.inputs['Base Color'].links[0].from_socket,darken.inputs[0])
    guard_material.node_tree.links.new(darken.outputs['Vector'],guard_shader.inputs['Base Color'])
    mesh('Forged guard with tapered section and central ridge',verts,faces,guard_material,root,bevel=.002)
    solid_outline('Rectangular tang seat',[(-.038,.127),(-.034,.192),(.034,.192),(.038,.127)],.016,p['brass'],root,.0018)
    SURFACES.forged_surface(root,p)


def cinderwand(root,p):
    trunk=[(-.018,0,-.15),(-.004,.003,-.04),(.004,.002,.12),(-.026,.008,.30),(-.012,0,.45),(.035,.009,.58),(.027,.016,.73)]
    branches=[(trunk,[.020,.022,.024,.032,.044,.026,.003]),
      ([(-.020,.007,.36),(-.071,.009,.47),(-.100,.006,.58),(-.091,.006,.625),(-.081,.007,.674)],[.034,.031,.023,.020,.017]),
      ([(.008,.008,.45),(.085,.012,.52),(.102,.022,.59)],[.023,.014,.007])]
    wood=[]
    for i,(points,radii) in enumerate(branches):
        points,radii=curved_path(points,radii,10)
        wood.append(tube('Continuous grown limb '+str(i),points,radii,p['bark'],root,16,ridged=.07))
    # Join and sculpt only the wood volume. Swollen junctions grow together,
    # retaining a true empty cleft between tapered limbs.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in wood:obj.select_set(True)
    bpy.context.view_layer.objects.active=wood[0];bpy.ops.object.join()
    grown=wood[0];grown.name='Continuous grown fork with swollen branch junction'
    remesh=grown.modifiers.new('Unified grown wood volume','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.002
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    soften=grown.modifiers.new('Natural junction smoothing','SMOOTH');soften.factor=.7;soften.iterations=3
    bpy.ops.object.modifier_apply(modifier=soften.name)
    for face in grown.data.polygons:face.use_smooth=True
    SURFACES.scanned_bark(grown,branches,curved_path,OUT/'references')
    # A snapped tip exposes an uneven fibrous cross section. Its splinters
    # continue the grain, breaking the paired antler-tip silhouette.
    end=Vector((-.081,.007,.674))
    for v in grown.data.vertices:
        if v.co.x<-.055 and v.co.z>.651:
            v.co.z=min(v.co.z,.674+.6*(v.co.x+.081)+.18*(v.co.y-.007))
    verts=[tuple(end+Vector((.017*math.cos(j*math.tau/13),.017*math.sin(j*math.tau/13),.0102*math.cos(j*math.tau/13)+.003*math.sin(j*2.4)))) for j in range(13)]
    mesh('Oblique exposed wood break',verts,[tuple(range(13))],p['cutwood'],root)
    for j in range(6):
        a=j*math.tau/6+.7;x=end.x+.012*math.cos(a);y=end.y+.012*math.sin(a)
        z=.674+.6*(x+.081)+.18*(y-.007)
        tube('Unequal exposed wood splinter',[(x,y,z-.005),(x+.002,y,z+.008+(j%3)*.003)],[.0025,.0005],p['cutwood'],root,5)
    # Broad split grain follows each limb's actual growth; unequal channels
    # leave coherent bark panels instead of all-over speckled texture.
    for b,(control,radii) in enumerate(branches[:2]):
        points,rs=curved_path(control,radii,8)
        for j in range(5):
            a=j*math.tau/5+.27
            path=[]
            for i,(pt,r) in enumerate(zip(points,rs)):
                turn=a+.22*math.sin(i*.055+b)
                path.append((pt[0]+r*.93*math.cos(turn),pt[1]+r*.93*math.sin(turn),pt[2]))
            tube('Long split grain',path,[max(.0006,r*.08) for r in rs],p['wood' if j==1 else 'char'],root,5)
    for z,x,r in ((-.065,-.006,.023),(.064,.004,.026),(.295,-.026,.035)):
        collar('Thin copper mending strap',z,r,.014,p['copper'],root,(x,.004))
    # Coal rests in the lower cleft and is clasped by short charred roots.
    SURFACES.fractured_coal(root,p)
    for x,side in ((-.054,-1),(.023,1)):
        pts,rs=curved_path([(x,0,.47),(x,-.012,.53),(-.014+side*.020,-.016,.55)],[.014,.009,.002],8)
        tube('Charred cleft clasp',pts,rs,p['bark'],root,9,ridged=.07)


def solid_outline(name,outline,depth,mat,parent,bevel=0):
    verts=[(x,y,z) for y in (-depth,depth) for x,z in outline]
    n=len(outline);faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    return mesh(name,verts,faces,mat,parent,bevel=bevel)


def curved_path(points,radii,steps):
    points=[Vector(p) for p in points];result=[];rs=[]
    for i in range(len(points)-1):
        a,b,c,d=points[max(0,i-1)],points[i],points[i+1],points[min(len(points)-1,i+2)]
        for j in range(steps):
            t=j/steps
            q=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
            result.append(tuple(q));rs.append(radii[i]+(radii[i+1]-radii[i])*t)
    result.append(tuple(points[-1]));rs.append(radii[-1])
    return result,rs


def crystal(root,name,center,radius,height,mat,sides=5):
    verts=[]
    for ring_z,scale,twist in ((0,.75,0),(height*.28,1,.12),(height*.70,.67,-.07)):
        for j in range(sides):
            a=j*math.tau/sides+twist
            verts.append((center[0]+radius*scale*math.cos(a),center[1]+radius*scale*math.sin(a),center[2]+ring_z))
    verts.append((center[0]+radius*.37,center[1]-.012,center[2]+height))
    faces=[tuple(reversed(range(sides)))]
    for level in range(2):
        for j in range(sides):faces.append((level*sides+j,level*sides+(j+1)%sides,(level+1)*sides+(j+1)%sides,(level+1)*sides+j))
    faces.extend((2*sides+j,2*sides+(j+1)%sides,3*sides) for j in range(sides))
    return mesh(name,verts,faces,mat,root)


def glacier(root,p):
    # A seated silver socket carries one broad curved crystal blade. The grip
    # retains actual leather overlaps instead of the rejected ribbon coils.
    SURFACES.wrapped_hilt(root,dict(p,leather=p['navy']),(.042,.073,.091,1))
    for z in (-.109,.120):
        solid_outline('Glacier silver grip ferrule',[(-.024,z-.006),(-.024,z+.006),(.024,z+.006),(.024,z-.006)],.018,p['steel'],root,.0015)
    solid_outline('Asymmetric forged frost guard',[(-.115,.080),(-.130,.091),(-.092,.133),(-.034,.151),(.051,.143),(.114,.110),(.105,.101),(.042,.119),(-.032,.126),(-.082,.113)],.015,p['guard'],root,.002)
    solid_outline('Deep silver blade socket',[(-.036,.128),(-.046,.210),(-.030,.241),(.025,.225),(.044,.194),(.035,.128)],.022,p['steel'],root,.002)
    # Broad planar faces meet a narrower cutting bevel. Unequal intermediate
    # ridge positions give depth without unrelated crystals pasted on the face.
    crystal_dark=material('Glacier deep internal fracture',(.006,.022,.034),.12,.22)
    crystal_face=material('Glacier cool mineral face',(.018,.071,.103),.16,.16)
    crystal_edge=material('Glacier selective frosted edge',(.18,.34,.40),.10,.38)
    for mat in (crystal_dark,crystal_face):
        mat.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.65
        mat.node_tree.nodes.get('Principled BSDF').inputs['Coat Roughness'].default_value=.11
    sections=[(.178,0,.035,.021),(.246,.003,.052,.028),(.335,.016,.068,.031),(.455,.038,.060,.030),(.578,.067,.050,.027),(.686,.102,.032,.018),(.798,.143,.0005,.0008)]
    vertices=[];faces=[];materials=[]
    profile=[(-1,0),(-.78,-.50),(-.28,-1),(.48,-.72),(1,0),(.57,.55),(-.14,.85),(-.77,.40)]
    for k,(z,x,width,depth) in enumerate(sections):
        for j,(across,front) in enumerate(profile):
            if j==2:across+=(-.04,.13,-.02,.18,.02,-.12,0)[k]
            if j==3:across+=(0,-.07,.09,-.08,.11,0,0)[k]
            vertices.append((x+across*width,front*depth,z))
    for k in range(len(sections)-1):
        for j in range(8):
            faces.append((k*8+j,k*8+(j+1)%8,(k+1)*8+(j+1)%8,(k+1)*8+j));materials.append(2 if j==3 or (j==0 and k in (0,1,4,5)) else 1 if j in (1,5) else 0)
    faces.extend([tuple(reversed(range(8))),tuple((len(sections)-1)*8+j for j in range(8))]);materials.extend([0,0])
    shell=material('Thin translucent glacier shell',(.056,.14,.19),.025,.13)
    shader=shell.node_tree.nodes.get('Principled BSDF');shader.inputs['Alpha'].default_value=.18
    shader.inputs['Coat Weight'].default_value=.7;shader.inputs['Coat Roughness'].default_value=.10
    shell.surface_render_method='DITHERED';shell['gltfAlphaMode']='BLEND'
    mesh('Continuous translucent glacial hull',vertices,faces,shell,root,bevel=.0006)
    # The checker control proved the full-length opaque core was blocking
    # the window. Keep only one short inset fracture beneath the clear hull.
    fault_outline=[(-.015,.428),(.072,.476),(.087,.520),(.044,.502),(.006,.469)]
    fault_vertices=[(x,.22*x-.08*(z-.45)-.017,z) for x,z in fault_outline]
    fault_material=material('Partially clear internal mineral fault',(.032,.092,.130),.015,.20)
    fault_shader=fault_material.node_tree.nodes.get('Principled BSDF')
    fault_shader.inputs['Alpha'].default_value=.28
    fault_shader.inputs['Coat Weight'].default_value=.22
    fault_material.surface_render_method='DITHERED';fault_material['gltfAlphaMode']='BLEND'
    front_lamina=mesh('Broad terminating oblique mineral fault',fault_vertices,[(0,1,2,3,4)],fault_material,root)
    front_lamina.data.materials.append(crystal_edge)
    solid=front_lamina.modifiers.new('Thin broken mineral plane','SOLIDIFY')
    solid.thickness=.00065;solid.material_offset_rim=1
    # Two metal tongues overlap the unpolished heel so the tang is physically
    # retained; there is no floating crystal at the grip/guard junction.
    for side in (-1,1):
        solid_outline('Silver socket retaining lip',[(-.037,.176),(-.046,.229),(-.024,.249),(-.020,.214)],.006,p['edge'],root,.001).location.y=side*.027
    pommel=solid_outline('Ice fang counterweight',[(-.027,-.117),(-.032,-.144),(-.010,-.171),(.019,-.161),(.026,-.119)],.017,p['steel'],root,.003)


def lathe_z(name,profile,material,parent,sides=64):
    vertices=[];faces=[]
    for z,radius in profile:
        for j in range(sides):
            angle=j*math.tau/sides;vertices.append((radius*math.cos(angle),radius*math.sin(angle),z))
    for k in range(len(profile)-1):
        for j in range(sides):faces.append((k*sides+j,k*sides+(j+1)%sides,(k+1)*sides+(j+1)%sides,(k+1)*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple((len(profile)-1)*sides+j for j in range(sides))])
    return mesh(name,vertices,faces,material,parent,smooth=True)


def thunderrod(root,p):
    SURFACES.wrapped_hilt(root,dict(p,leather=p['navy']),(.042,.073,.091,1))
    for z in (-.109,.120):
        lathe_z('Rolled brass grip ferrule',[(z-.007,.024),(z-.005,.027),(z+.004,.027),(z+.007,.024)],p['brass'],root)
    lathe_z('Conductor spine',[(.118,.021),(.130,.025),(.483,.023),(.507,.032)],p['copper'],root)
    # A single porcelain body has rounded rain sheds and a narrow neck. The
    # flanges have continuous glazed cross-sections instead of stacked caps.
    ceramic=material('Storm porcelain with restrained glaze',(.016,.036,.059),.02,.36)
    profile=[(.155,.026),(.166,.031)]
    for z,r in ((.20,.047),(.274,.043),(.348,.040),(.422,.036)):
        profile.extend([(z-.024,.028),(z-.014,r-.008),(z-.004,r-.001),(z,r),(z+.003,r-.001),(z+.005,.028),(z+.018,.026)])
    profile.extend([(.459,.026),(.469,.024)])
    lathe_z('Continuous glazed cobalt insulator',profile,ceramic,root)
    lathe_z('Turned conductor head seat',[(.469,.021),(.477,.038),(.481,.042),(.492,.042),(.500,.036),(.511,.029)],p['brass'],root)
    aged_copper=p['copper'].copy();aged_copper.name='Copper electrode with localized heat and sheltered oxidation'
    nodes,links=aged_copper.node_tree.nodes,aged_copper.node_tree.links;shader=nodes.get('Principled BSDF')
    copper_color=shader.inputs['Base Color'].links[0].from_socket
    copper_roughness=shader.inputs['Roughness'].links[0].from_socket
    heat=nodes.new('ShaderNodeAttribute');heat.attribute_name='ElectrodeHeat'
    shelter=nodes.new('ShaderNodeAttribute');shelter.attribute_name='ElectrodeShelter'
    warm=nodes.new('ShaderNodeMixRGB');warm.inputs[2].default_value=(.032,.013,.008,1)
    links.new(heat.outputs['Fac'],warm.inputs[0]);links.new(copper_color,warm.inputs[1])
    dark=nodes.new('ShaderNodeMixRGB');dark.inputs[2].default_value=(.029,.043,.040,1)
    links.new(shelter.outputs['Fac'],dark.inputs[0]);links.new(warm.outputs[0],dark.inputs[1]);links.new(dark.outputs[0],shader.inputs['Base Color'])
    mask=nodes.new('ShaderNodeMath');mask.operation='MAXIMUM';links.new(heat.outputs['Fac'],mask.inputs[0]);links.new(shelter.outputs['Fac'],mask.inputs[1])
    rough=nodes.new('ShaderNodeMixRGB');rough.inputs[2].default_value=(.65,.65,.65,1)
    links.new(mask.outputs[0],rough.inputs[0]);links.new(copper_roughness,rough.inputs[1]);links.new(rough.outputs[0],shader.inputs['Roughness'])
    oxide_metal=nodes.new('ShaderNodeMapRange');oxide_metal.inputs['From Min'].default_value=0;oxide_metal.inputs['From Max'].default_value=1
    oxide_metal.inputs['To Min'].default_value=.82;oxide_metal.inputs['To Max'].default_value=.42
    links.new(heat.outputs['Fac'],oxide_metal.inputs['Value']);links.new(oxide_metal.outputs['Result'],shader.inputs['Metallic'])
    # Three forged conductors terminate around one common discharge gap. The
    # unequal shoulders remain, but the tips have purposeful opposing faces.
    for angle,reach,top in ((.18,.116,.777),(2.40,.094,.776),(4.50,.102,.779)):
        x,y=math.cos(angle),math.sin(angle)
        points,radii=curved_path([(x*.025,y*.025,.498),(x*.076,y*.076,.563),(x*reach,y*reach,.643),(x*reach*.82,y*reach*.82,top-.010),(x*.026,y*.026,top)], [.016,.014,.011,.008,.007],10)
        vertices=[];faces=[];sides=24
        lateral=Vector((-y,x,0))
        for i,(point,radius) in enumerate(zip(points,radii)):
            tangent=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
            depth=tangent.cross(lateral).normalized()
            t=max(0,min(1,(i/(len(points)-1)-.72)/.28));t=t*t*(3-2*t)
            # Upset then hammer the last section into a broad tapered terminal.
            # The final nose contracts slightly, preserving formed bevel edges.
            nose=1-.20*max(0,(t-.8)/.2)
            for j in range(sides):
                a=j*math.tau/sides
                c,s=math.cos(a),math.sin(a)
                exponent=1-.42*t
                across=math.copysign(abs(c)**exponent,c)
                through=math.copysign(abs(s)**exponent,s)
                vertices.append(tuple(Vector(point)+lateral*(across*radius*(1+1.7*t)*nose)+depth*(through*radius*(1-.67*t))))
        for i in range(len(points)-1):
            for j in range(sides):
                a=i*sides+j;b=i*sides+(j+1)%sides
                faces.append((a,b,b+sides,a+sides))
        faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))])
        electrode=mesh('Continuous forged paddle electrode',vertices,faces,aged_copper,root,smooth=True)
        heat_attribute=electrode.data.attributes.new('ElectrodeHeat','FLOAT','POINT')
        shelter_attribute=electrode.data.attributes.new('ElectrodeShelter','FLOAT','POINT')
        for vertex in electrode.data.vertices:
            along=(vertex.index//sides)/(len(points)-1)
            # Full oxide coverage on the formed face and short neck, with a
            # graduated transition that leaves the long copper shaft clean.
            tip=max(0,min(1,(along-.76)/.14));tip=tip*tip*(3-2*tip)
            base=max(0,min(1,(.20-along)/.20));base=base*base*(3-2*base)
            heat_attribute.data[vertex.index].value=tip
            shelter_attribute.data[vertex.index].value=base*.82
        electrode.data.polygons[-1].use_smooth=False
        foot=Vector(points[0]);axis=(Vector(points[3])-foot).normalized()
        seat=tube('Fitted six-flat electrode root seat',[tuple(foot-axis*.003),tuple(foot+axis*.007),tuple(foot+axis*.012)],[.021,.021,.017],p['dark'],root,6)
        for face in seat.data.polygons:face.use_smooth=False
        bevel=seat.modifiers.new('Narrow formed ferrule edges','BEVEL');bevel.width=.0006;bevel.segments=2
        normal=seat.modifiers.new('Preserve ferrule flat faces','WEIGHTED_NORMAL');normal.keep_sharp=True
        tube('Compressed copper root washer',[tuple(foot-axis*.005),tuple(foot-axis*.001)],[.023,.023],p['copper'],root,32)
    # A continuous insulating stem seats the central core on the head; it is
    # no longer an isolated oval bead floating between the electrodes.
    lathe_z('Seated tapered cobalt central insulator',[(.493,.016),(.505,.021),(.550,.022),(.585,.025),(.603,.023),(.627,.014),(.640,.007)],ceramic,root)
    lathe_z('Central insulator retaining ferrule',[(.499,.022),(.503,.026),(.512,.026),(.516,.022)],p['brass'],root)
    lathe_z('Rounded weighted rod butt',[(-.169,.005),(-.166,.022),(-.154,.030),(-.134,.030),(-.120,.024),(-.115,.022)],p['brass'],root)


def moonstaff(root,p):
    # A long ash shaft continues through the palm; the crescent is a forged
    # curved section seated into a split ferrule, rather than a floating icon.
    ash=material('Silvered ashwood with longitudinal grain',(.12,.14,.145),0,.49)
    nodes,links=ash.node_tree.nodes,ash.node_tree.links;shader=nodes.get('Principled BSDF')
    coord=nodes.new('ShaderNodeTexCoord');stretch=nodes.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY';stretch.inputs[1].default_value=(11,11,2.4)
    links.new(coord.outputs['Generated'],stretch.inputs[0])
    grain=nodes.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=1;grain.inputs['Detail'].default_value=3
    links.new(stretch.outputs[0],grain.inputs['Vector'])
    color=nodes.new('ShaderNodeValToRGB');color.color_ramp.elements[0].position=.22;color.color_ramp.elements[0].color=(.024,.032,.030,1);color.color_ramp.elements[1].position=.79;color.color_ramp.elements[1].color=(.085,.112,.103,1)
    links.new(grain.outputs['Fac'],color.inputs[0]);links.new(color.outputs['Color'],shader.inputs['Base Color'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24;bump.inputs['Distance'].default_value=.00020
    links.new(grain.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    lathe_z('Continuous silvered ash shaft',[(-.288,.013),(-.276,.017),(-.145,.018),(-.119,.0135),(.133,.0135),(.15,.018),(.48,.016),(.765,.020),(.833,.018)],ash,root,48)
    SURFACES.wrapped_hilt(root,dict(p,leather=p['navy']),(.028,.045,.060,1))
    pewter=material('Handled lunar silver',(.13,.17,.19),.92,.28)
    # Local occlusion describes sheltered metal at the fitted brace and bezel
    # junctions; broad exposed silver stays clean and reflective.
    nodes,links=pewter.node_tree.nodes,pewter.node_tree.links;shader=nodes.get('Principled BSDF')
    shelter=nodes.new('ShaderNodeAmbientOcclusion');shelter.inputs['Distance'].default_value=.022
    response=nodes.new('ShaderNodeMapRange');response.inputs['To Min'].default_value=.52;response.inputs['To Max'].default_value=1
    links.new(shelter.outputs['AO'],response.inputs['Value'])
    shade=nodes.new('ShaderNodeMixRGB');shade.blend_type='MULTIPLY';shade.inputs[0].default_value=1;shade.inputs[1].default_value=(.13,.17,.19,1)
    links.new(response.outputs['Result'],shade.inputs[2]);links.new(shade.outputs[0],shader.inputs['Base Color'])
    recess=material('Sheltered pewter socket',(.052,.072,.084),.67,.48)
    for z in (-.109,.120):
        lathe_z('Seated silver grip binding',[(z-.007,.019),(z-.004,.024),(z+.004,.024),(z+.007,.020)],pewter,root,48)
    lathe_z('Tapered butt ferrule',[(-.301,.008),(-.297,.018),(-.290,.021),(-.264,.021),(-.259,.017)],recess,root,48)
    lathe_z('Crescent forged socket',[ (.765,.019),(.771,.028),(.789,.028),(.812,.023),(.845,.024),(.862,.014)],pewter,root,64)
    # Broad, convex front and rear surfaces share one continuous radial profile.
    # The upper horn reaches farther than the lower, and both thin into points.
    vertices=[];faces=[];sections=97;sides=16
    for i in range(sections):
        t=i/(sections-1);angle=math.radians(43+270*t)
        taper=max(.025,math.sin(math.pi*t)**.65)
        radius=.153+.010*math.sin(math.pi*t)
        width=(.022+.008*math.sin(math.pi*t))*taper
        depth=(.012+.002*math.sin(math.pi*t))*taper
        radial=Vector((math.cos(angle),0,math.sin(angle)))
        center=Vector((-.010,0,1.018))+radial*radius
        for j in range(sides):
            a=j*math.tau/sides;c,s=math.cos(a),math.sin(a)
            # Rounded rectangle gives real broad metal planes and narrow bevels.
            across=math.copysign(abs(c)**.58,c);front=math.copysign(abs(s)**.58,s)
            vertices.append(tuple(center+radial*(across*width)+Vector((0,front*depth,0))))
    for i in range(sections-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((sections-1)*sides+j for j in range(sides))])
    moon=mesh('Continuous forged open crescent',vertices,faces,pewter,root,smooth=True)
    # A dark fitted cup supports the domed stone inside a continuous rim;
    # two shaped braces preserve the broad open crescent silhouette.
    stone=material('Opaque pale blue moonstone',(.060,.135,.19),0,.34)
    shader=stone.node_tree.nodes.get('Principled BSDF');shader.inputs['Coat Weight'].default_value=.50;shader.inputs['Coat Roughness'].default_value=.14
    # Broad mineral clouds live beneath the uninterrupted polished surface.
    # No micro-bump, glitter, extra fracture geometry or transmission pass.
    nodes,links=stone.node_tree.nodes,stone.node_tree.links
    coord=nodes.new('ShaderNodeTexCoord');cloud=nodes.new('ShaderNodeTexNoise');cloud.inputs['Scale'].default_value=3.1;cloud.inputs['Detail'].default_value=1;cloud.inputs['Roughness'].default_value=.55
    links.new(coord.outputs['Generated'],cloud.inputs['Vector'])
    mineral=nodes.new('ShaderNodeValToRGB');mineral.color_ramp.elements[0].position=.30;mineral.color_ramp.elements[0].color=(.023,.071,.12,1)
    mineral.color_ramp.elements[1].position=.70;mineral.color_ramp.elements[1].color=(.155,.265,.29,1);mineral.color_ramp.interpolation='EASE'
    links.new(cloud.outputs['Fac'],mineral.inputs[0]);links.new(mineral.outputs['Color'],shader.inputs['Base Color'])
    center=Vector((.025,-.005,1.033))
    for name,radii,mat,y in [('Moonstone fitted back cup',(.049,.014,.069),recess,.010),('Lenticular polished moonstone',(.043,.028,.061),stone,-.006)]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=32,location=tuple(center+Vector((0,y,0))))
        obj=bpy.context.object;obj.name=name;obj.scale=radii;obj.data.materials.append(mat);obj.parent=root
        for face in obj.data.polygons:face.use_smooth=True
    # A rolled oval bezel follows the stone rim continuously. The front lip
    # overlaps the gem edge; the broader rear skirt seats the forged braces.
    rim_vertices=[];rim_faces=[];ring_count=64
    for size,y in ((1.00,.020),(1.06,.009),(1.08,-.006),(1.03,-.018),(.93,-.023),(.90,-.017)):
        for j in range(ring_count):
            a=j*math.tau/ring_count
            rim_vertices.append(tuple(center+Vector((.047*size*math.cos(a),y,.067*size*math.sin(a)))))
    for i in range(5):
        for j in range(ring_count):
            a=i*ring_count+j;b=i*ring_count+(j+1)%ring_count
            rim_faces.append((a,b,b+ring_count,a+ring_count))
    mesh('Rolled fitted oval moonstone bezel',rim_vertices,rim_faces,pewter,root,smooth=True)
    for angle,entry in ((math.radians(147),math.radians(146)),(math.radians(253),math.radians(267))):
        radial=Vector((math.cos(angle),0,math.sin(angle)))
        start=Vector((-.010,.006,1.018))+radial*.156
        end=center+Vector((math.cos(entry)*.049,.013,math.sin(entry)*.070))
        elbow=start.lerp(end,.44)+Vector((.008,.004,-.012))
        pts,widths=curved_path([tuple(start),tuple(elbow),tuple(end)],[.016,.009,.011],12)
        verts=[];faces=[];sides=12
        for i,(point,width) in enumerate(zip(pts,widths)):
            tangent=(Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)])).normalized()
            across=Vector((-tangent.z,0,tangent.x)).normalized()
            for j in range(sides):
                a=j*math.tau/sides;c,q=math.cos(a),math.sin(a)
                verts.append(tuple(Vector(point)+across*(math.copysign(abs(c)**.58,c)*width)+Vector((0,-math.copysign(abs(q)**.58,q)*.004,0))))
        for i in range(len(pts)-1):
            for j in range(sides):
                a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
        faces.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+j for j in range(sides))])
        mesh('Swept tapered crescent setting brace',verts,faces,pewter,root,smooth=True)


def phoenix(root,p):
    """A forged wing cradle with a seated garnet heart, built around a real tang."""
    bronze=material('Phoenix aged gilded bronze',(.24,.115,.033),.82,.35)
    shadow=material('Phoenix sheltered oxidized bronze',(.042,.023,.011),.60,.54)
    edge=material('Phoenix handled bronze arris',(.32,.185,.065),.86,.30)
    enamel=material('Phoenix deep red feather enamel',(.060,.006,.009),.12,.34)
    enamel.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.35
    # Restrained sheltered metal and clean broad middles; no uniform granular
    # coating that would obscure the convex forged surfaces after projection.
    nodes,links=bronze.node_tree.nodes,bronze.node_tree.links
    ao=nodes.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=.018
    ramp=nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color=(.055,.033,.014,1)
    ramp.color_ramp.elements[1].color=(.24,.115,.033,1)
    links.new(ao.outputs['AO'],ramp.inputs[0]);links.new(ramp.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
    SURFACES.wrapped_hilt(root,p,(.11,.030,.020,1))
    lathe_z('Phoenix continuous tapered tang',[(-.14,.014),(.137,.014),(.156,.021),(.40,.017),(.48,.027),(.53,.032)],shadow,root,48)
    for z in (-.109,.120):
        lathe_z('Phoenix seated grip ferrule',[(z-.007,.019),(z-.004,.024),(z+.004,.024),(z+.007,.020)],bronze,root,48)
    lathe_z('Phoenix counterweight butt',[(-.169,.006),(-.166,.019),(-.153,.027),(-.133,.027),(-.121,.021),(-.116,.019)],bronze,root,64)
    lathe_z('Phoenix flared cradle socket',[(.433,.021),(.440,.027),(.456,.028),(.473,.036),(.494,.036),(.514,.027)],bronze,root,64)

    def feather(name,points,widths,thickness,mat):
        path,widths=curved_path(points,widths,12)
        vertices=[];faces=[];sides=12
        for i,(point,width) in enumerate(zip(path,widths)):
            tangent=(Vector(path[min(i+1,len(path)-1)])-Vector(path[max(0,i-1)])).normalized()
            across=Vector((-tangent.z,0,tangent.x)).normalized()
            taper=max(.02,width/max(widths))
            for j in range(sides):
                angle=j*math.tau/sides;c,s=math.cos(angle),math.sin(angle)
                vertices.append(tuple(Vector(point)+across*(math.copysign(abs(c)**.68,c)*width)+Vector((0,math.copysign(abs(s)**.72,s)*thickness*taper,0))))
        for i in range(len(path)-1):
            for j in range(sides):
                a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
        faces.extend([tuple(reversed(range(sides))),tuple((len(path)-1)*sides+j for j in range(sides))])
        return mesh(name,vertices,faces,mat,root,smooth=True)

    # Unequal wings are rooted deeply inside the socket. Their broad convex
    # leading surfaces continue into tapered tips, with open space around the
    # heart and shorter secondary feathers overlapping on the outer side.
    for side,points in [(-1,[(0,.003,.484),(-.065,.006,.543),(-.136,.005,.666),(-.173,0,.836)]),(1,[(.006,.005,.488),(.072,.009,.555),(.133,.002,.669),(.153,-.003,.784)])]:
        feather('Phoenix primary swept wing',points,[.024,.030,.023,.00035],.008,bronze)
        path,_=curved_path(points,[1,1,1,1],24)
        # Secondary roots are sampled from the actual primary centerline,
        # fully enclosed by its broader cross section. Each shorter flight
        # exits along the outer sweep and has its own unequal free tip.
        # This preserves layered feathers without inner cut paddles or shared
        # upper-tip intersections.
        for u,x,z,width in ((.28,.221,.735,.018),(.46,.203,.792,.015)):
            origin=Vector(path[round(u*(len(path)-1))])
            tip=Vector((side*x,.005,z-(.040 if side>0 else 0)))
            elbow=origin.lerp(tip,.52)+Vector((side*.008,.002,-.010))
            feather('Phoenix rooted shorter flight feather',[tuple(origin),tuple(elbow),tuple(tip)],[.005,width,.0003],.0045,bronze)
    for side in (-1,1):
        # Fitted enamel inset occupies a protected short root panel; it is
        # recessed behind the leading bronze edge, not painted over the wing.
        feather('Phoenix protected feather enamel',[(side*.038,-.004,.528),(side*.075,-.003,.576),(side*.105,-.002,.628)],[.004,.008,.0005],.0015,enamel)

    heart=material('Phoenix dark garnet heart',(.095,.012,.005),.02,.28)
    shader=heart.node_tree.nodes.get('Principled BSDF');shader.inputs['Coat Weight'].default_value=.42
    nodes,links=heart.node_tree.nodes,heart.node_tree.links
    coord=nodes.new('ShaderNodeTexCoord');cloud=nodes.new('ShaderNodeTexNoise');cloud.inputs['Scale'].default_value=3.4;cloud.inputs['Detail'].default_value=1
    links.new(coord.outputs['Generated'],cloud.inputs['Vector'])
    colors=nodes.new('ShaderNodeValToRGB');colors.color_ramp.elements[0].color=(.025,.003,.002,1);colors.color_ramp.elements[1].color=(.20,.032,.006,1)
    links.new(cloud.outputs['Fac'],colors.inputs[0]);links.new(colors.outputs['Color'],shader.inputs['Base Color'])
    # A deep continuous metal cup cradles the heart. The setting remains
    # attached through its rear web to the socket, rather than floating.
    for name,radii,mat,y in [('Phoenix garnet fitted cup',(.047,.025,.061),shadow,.011),('Phoenix polished garnet heart',(.042,.026,.055),heart,-.006)]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=32,location=(0,y,.605))
        obj=bpy.context.object;obj.name=name;obj.scale=radii;obj.parent=root;obj.data.materials.append(mat)
        for face in obj.data.polygons:face.use_smooth=True
    feather('Phoenix rear cup support',[(0,.022,.493),(0,.035,.551),(0,.027,.623)],[.023,.018,.015],.005,shadow)
    for side in (-1,1):
        feather('Phoenix fitted heart retaining claw',[(side*.021,.006,.551),(side*.038,-.014,.568),(side*.034,-.026,.584)],[.009,.007,.0025],.004,edge)
    feather('Phoenix crown retaining claw',[(0,.021,.650),(0,-.003,.665),(0,-.025,.648)],[.008,.009,.003],.004,edge)


def cleaver(root,p):
    METAL_WEAPONS.cleaver(root,p,(SURFACES,solid_outline,lathe_z,material))


BUILDERS={'apprentice':apprentice,'cinderwand':cinderwand,'glacier':glacier,'thunderrod':thunderrod,'cleaver':cleaver,'moonstaff':moonstaff,'phoenix':phoenix}


def build_study(ids=None):
    previous=bpy.context.window.scene
    scene=bpy.data.scenes.new('Unique item source study')
    bpy.context.window.scene=scene
    p=palette(); ids=ids or list(BUILDERS)
    try:
        for index,item_id in enumerate(ids):
            spec=next(entry for entry in CATALOGUE['items'] if entry['id']==item_id)
            root=bpy.data.objects.new('Item_'+item_id,None)
            scene.collection.objects.link(root)
            root['itemId']=item_id;root['attachment']=spec['attachment'];root['sourceUnits']='meters'
            root['gripNode']=item_id+'_Grip';root['tipNode']=item_id+'_Tip'
            for field,default in [('azimuth',20),('elevation',12),('margin',1.18),('roll',0)]:
                root['preview'+field.capitalize()]=spec['preview'].get(field,default)
            BUILDERS[item_id](root,p)
            # Some authored parts retain local translation/scale (gemstones,
            # sockets). Their raw vertex coordinates are not item coordinates.
            bpy.context.view_layer.update()
            inverse=root.matrix_world.inverted()
            tip_height=-math.inf
            for part in root.children:
                if part.type!='MESH':continue
                transform=inverse@part.matrix_world
                tip_height=max(tip_height,max((transform@v.co).z for v in part.data.vertices))
            for name,z in (('Grip',0),('Tip',tip_height)):
                marker=bpy.data.objects.new(item_id+'_'+name,None)
                scene.collection.objects.link(marker);marker.parent=root;marker.location.z=z
                marker['attachmentRole']=name;root[name.lower()+'Node']=marker.name
            root.location.x=(index-(len(ids)-1)/2)*.49
        scene['item_ids']=','.join(ids)
        scene['itemSourceOwner']='scripts/blender/items'
        scene['itemRecipeSha256']=hashlib.sha256(
            Path(__file__).read_bytes()+Path(SURFACES.__file__).read_bytes()
            +Path(METAL_WEAPONS.__file__).read_bytes()).hexdigest()
        OUT.mkdir(parents=True,exist_ok=True)
    finally:bpy.context.window.scene=previous
    return scene


def render_study(scene,output,game_angle=False,back=False,detail=False,focus=None,view_offset=None):
    previous=bpy.context.window.scene;bpy.context.window.scene=scene
    try:
        world=bpy.data.worlds.new('Item neutral studio');world.use_nodes=True;scene.world=world
        world.node_tree.nodes['Background'].inputs[0].default_value=(.13,.16,.20,1)
        world.node_tree.nodes['Background'].inputs[1].default_value=.32
        target=Vector((0,0,.39 if detail else .32))
        if focus:
            item,z,scale=focus
            target=next(o for o in scene.objects if o.get('itemId')==item).location+Vector((0,0,z))
        lights=[((-2,-3,4),420,3,(1,.91,.78)),((2,1,3),500,2,(.60,.78,1)),((0,-2,1),80,2,(.85,.91,1))]
        if detail:lights=[((-1.5,-.6,1.4),170,.7,(1,.94,.85)),((2,1,3),140,2,(.64,.79,1)),((0,-2,1),35,2,(.90,.95,1))]
        for position,power,size,color in lights:
            data=bpy.data.lights.new('Item studio softbox','AREA');obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj)
            obj.location=position;data.energy=power;data.shape='DISK';data.size=size;data.color=color
            obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
        data=bpy.data.cameras.new('Item camera');camera=bpy.data.objects.new('Item camera',data);scene.collection.objects.link(camera);scene.camera=camera
        data.type='ORTHO';data.ortho_scale=focus[2] if focus else 1.08 if detail else 2.22
        camera.location=target+Vector(view_offset if view_offset is not None else (.75,-4,.7) if detail else (.3,4 if back else -4,1.0) if not game_angle else (2,-3,3.5))
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=True
        scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100
        scene.render.film_transparent=False;scene.view_settings.view_transform='AgX'
        scene.render.image_settings.file_format='PNG';scene.render.filepath=str(output)
        bpy.ops.render.render(write_still=True)
    finally:
        # Review helpers are transient so subsequent renders do not stack lights.
        for obj in list(scene.objects):
            if obj.type in {'CAMERA','LIGHT'}:bpy.data.objects.remove(obj,do_unlink=True)
        bpy.context.window.scene=previous
    print('Item source rendered',output)
