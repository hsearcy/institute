"""Build the eighteen armour and jewellery models (shared/src/rpgGear.ts bases).

Headless, one process per call:

    blender -b --factory-startup --python scripts/blender/items/build_gear.py -- --ids leather_cap,iron_helm

Each base is authored from project-owned procedural construction (no external
geometry), shaded with layered procedural PBR materials, joined to one mesh,
baked to one 1K atlas (albedo via emission so metal does not darken, tangent
normal, glTF ORM), exported as a self-contained GLB, then the exact GLB is
re-imported into an isolated studio scene to render the transparent inventory
icon (384px WebP). Work files stay in ignored tmp/gear-models/<id>/; `--install` copies the
GLB and icon to web/public/assets/rpg/gear/.

Rarity is never baked in: one model per base. The UI frames rarity.
"""
import bmesh
import bpy
import hashlib
import json
import math
import shutil
import sys
import time
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'tmp' / 'gear-models'
PUBLIC = ROOT / 'web' / 'public' / 'assets' / 'rpg' / 'gear'
CATALOGUE = json.loads((ROOT / 'scripts' / 'blender' / 'items' / 'catalogue.json').read_text())['gear']
ATLAS = 1024
BUDGET = 9000  # runtime triangles per gear model
SOCKETS = {}

# ---------------------------------------------------------------- scene utils

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    SOCKETS.clear()


def activate(obj):
    for other in bpy.context.view_layer.objects:
        other.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)


def apply_all(obj):
    activate(obj)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def finish(obj, material, smooth=True, angle=50, bevel=0.0, subsurf=0, solidify=0.0):
    if solidify:
        mod = obj.modifiers.new('solid', 'SOLIDIFY'); mod.thickness = solidify; mod.offset = -1
    if bevel:
        mod = obj.modifiers.new('bevel', 'BEVEL'); mod.width = bevel; mod.segments = 2; mod.limit_method = 'ANGLE'
    if subsurf:
        mod = obj.modifiers.new('sub', 'SUBSURF'); mod.levels = subsurf; mod.render_levels = subsurf
    apply_all(obj)
    obj.data.materials.clear(); obj.data.materials.append(material)
    activate(obj)
    if smooth:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    return obj


def link(name, mesh):
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def from_bm(name, bm):
    mesh = bpy.data.meshes.new(name); bm.to_mesh(mesh); bm.free()
    return link(name, mesh)


def transform(obj, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    obj.location = loc; obj.rotation_euler = [math.radians(a) for a in rot]; obj.scale = scale
    activate(obj); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def sphere(name, r, mat, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), seg=32, rings=16, cut=None, **kw):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    if cut is not None:  # keep z >= cut*r (a dome); open bottom
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, cut * r), plane_no=(0, 0, -1), clear_outer=True)
    obj = transform(from_bm(name, bm), loc, rot, scale)
    return finish(obj, mat, **kw)


def ico(name, r, mat, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), sub=1, **kw):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    return finish(transform(from_bm(name, bm), loc, rot, scale), mat, smooth=False, **kw)


def torus(name, major, minor, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), seg=48, ring=12, **kw):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=seg, minor_segments=ring)
    obj = bpy.context.active_object; obj.name = name
    return finish(transform(obj, loc, rot, scale), mat, **kw)


def cylinder(name, r, depth, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), verts=32, caps=True, r2=None, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    return finish(transform(from_bm(name, bm), loc, rot, scale), mat, **kw)


def box(name, size, mat, loc=(0, 0, 0), rot=(0, 0, 0), **kw):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    obj = transform(from_bm(name, bm), loc, rot, size)
    kw.setdefault('bevel', min(size) * .25)
    return finish(obj, mat, **kw)


def prism(name, outline, depth, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), **kw):
    """Extrude a closed 2D outline (XZ plane, extruded along -Y/+Y)."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, -depth / 2, z)) for x, z in outline]
    face = bm.faces.new(verts)
    result = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [v for v in result['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0, depth, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    kw.setdefault('bevel', depth * .3); kw.setdefault('angle', 35)
    return finish(transform(from_bm(name, bm), loc, rot, scale), mat, **kw)


def tube(name, points, radius, mat, cyclic=False, res=10, taper=None, flat=1.0, **kw):
    """A swept round (or flattened) tube along points."""
    curve = bpy.data.curves.new(name, 'CURVE'); curve.dimensions = '3D'
    spline = curve.splines.new('POLY'); spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1)
        if taper: point.radius = taper(points.index(co) / max(1, len(points) - 1))
    spline.use_cyclic_u = cyclic
    curve.bevel_depth = radius; curve.bevel_resolution = max(1, res // 4); curve.use_fill_caps = True
    obj = link(name, curve)
    activate(obj); bpy.ops.object.convert(target='MESH')
    obj = bpy.context.active_object
    if flat != 1.0:
        obj.scale = (1, 1, 1)
    return finish(obj, mat, **kw)


def smooth_path(points, steps=6):
    """Catmull-Rom resample, so tubes follow curves instead of corners."""
    result = []
    pts = [Vector(p) for p in points]
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(len(pts) - 1, i + 2)]
        for s in range(steps):
            t = s / steps; t2 = t * t; t3 = t2 * t
            result.append(tuple(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)))
    result.append(tuple(pts[-1]))
    return result


def ring_points(radius, z=0, count=48, sx=1, sy=1, start=0, arc=360):
    full = arc >= 360
    n = count if full else count + 1
    return [(math.cos(math.radians(start + arc * i / count)) * radius * sx, math.sin(math.radians(start + arc * i / count)) * radius * sy, z) for i in range(n)]


def skin(name, nodes, edges, mat, subsurf=2, **kw):
    """Skin-modifier body from (co, (rx, ry)) nodes; organic garments and hands."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([n[0] for n in nodes], edges, [])
    obj = link(name, mesh)
    obj.modifiers.new('skin', 'SKIN')
    for vertex, node in zip(obj.data.skin_vertices[0].data, nodes):
        vertex.radius = node[1]
    obj.data.skin_vertices[0].data[0].use_root = True
    mod = obj.modifiers.new('sub', 'SUBSURF'); mod.levels = subsurf; mod.render_levels = subsurf
    apply_all(obj)
    return finish(obj, mat, **kw)


def array_along(name, maker, points, align=True):
    """Instances of a small part placed at points (rivets, links, scales)."""
    parts = []
    for index, (co, rot) in enumerate(points):
        parts.append(maker(f'{name}.{index}', co, rot))
    return parts


def chain(name, mat, radius, sx=1.0, sy=1.0, z=0, count=40, link_r=.009, wire=.0026, center=(0, 0, 0), arc=360, start=0, plane='XZ'):
    """Interlocking oval links around an ellipse; alternate links turn 90 degrees."""
    parts = []
    pts = ring_points(radius, z, count, sx, sy, start, arc)
    if arc >= 360: pts = pts + [pts[0]]
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        mid = (a + b) / 2; direction = (b - a).normalized()
        bpy.ops.mesh.primitive_torus_add(major_radius=link_r, minor_radius=wire, major_segments=12, minor_segments=6)
        obj = bpy.context.active_object; obj.name = f'{name}.{i}'
        obj.scale = (1.55, 1, 1)
        quat = direction.to_track_quat('X', 'Z')
        obj.rotation_mode = 'QUATERNION'; obj.rotation_quaternion = quat
        if i % 2: obj.rotation_quaternion = quat @ Matrix.Rotation(math.pi / 2, 4, 'X').to_quaternion()
        obj.location = mid
        activate(obj); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if plane == 'XZ':
            obj.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
        obj.data.transform(Matrix.Translation(center))
        parts.append(finish(obj, mat, angle=60))
    return parts

# ---------------------------------------------------------------- materials


def material(name, base, rough=.5, metal=0.0, bump=.3, scale=60.0, wear=0.0, variation=.25,
             pattern=None, pattern_scale=20.0, pattern_strength=.6, edge=None, emission=None, dark=None):
    """Layered procedural PBR: tonal variation, micro bump, construction pattern,
    pointiness edge wear (brighter, smoother rubbed edges) and cavity darkening."""
    # Colours are authored as display (sRGB) values; shader inputs are linear.
    lin = lambda c: tuple(x ** 2.2 for x in c) if c else c
    base, edge, dark = lin(base), lin(edge), lin(dark)
    if emission: emission = (lin(emission[0]), emission[1])
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree; nodes = nt.nodes; links = nt.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial'); bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    coord = nodes.new('ShaderNodeTexCoord')
    noise = nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = scale * .12; noise.inputs['Detail'].default_value = 8
    links.new(coord.outputs['Object'], noise.inputs['Vector'])
    fine = nodes.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = scale; fine.inputs['Detail'].default_value = 10; fine.inputs['Roughness'].default_value = .65
    links.new(coord.outputs['Object'], fine.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    low = dark or tuple(c * (1 - variation) for c in base)
    ramp.color_ramp.elements[0].color = (*low, 1); ramp.color_ramp.elements[1].color = (*base, 1)
    ramp.color_ramp.elements[0].position = .3; ramp.color_ramp.elements[1].position = .75
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    color = ramp.outputs['Color']
    height = fine.outputs['Fac']
    # Construction pattern (stitch rows, quilting, scales, weave) as height + darkened grooves.
    if pattern:
        pat = pattern(nodes, links, coord, pattern_scale)
        mixh = nodes.new('ShaderNodeMath'); mixh.operation = 'MULTIPLY_ADD'
        mixh.inputs[1].default_value = pattern_strength
        links.new(pat, mixh.inputs[0]); links.new(fine.outputs['Fac'], mixh.inputs[2])
        height = mixh.outputs[0]
        groove = nodes.new('ShaderNodeMix'); groove.data_type = 'RGBA'; groove.blend_type = 'MULTIPLY'
        inv = nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1
        links.new(pat, inv.inputs[1])
        clamp = nodes.new('ShaderNodeMath'); clamp.operation = 'MULTIPLY'; clamp.inputs[1].default_value = .55; clamp.use_clamp = True
        links.new(inv.outputs[0], clamp.inputs[0])
        links.new(clamp.outputs[0], groove.inputs['Factor'])
        links.new(color, groove.inputs['A']); groove.inputs['B'].default_value = (.35, .3, .27, 1)
        color = groove.outputs['Result']
    # Edge wear and cavity from pointiness: convex edges brighten, recesses darken.
    geo = nodes.new('ShaderNodeNewGeometry')
    edge_ramp = nodes.new('ShaderNodeMapRange'); edge_ramp.inputs['From Min'].default_value = .545; edge_ramp.inputs['From Max'].default_value = .62
    links.new(geo.outputs['Pointiness'], edge_ramp.inputs['Value'])
    cavity = nodes.new('ShaderNodeMapRange'); cavity.inputs['From Min'].default_value = .49; cavity.inputs['From Max'].default_value = .44
    links.new(geo.outputs['Pointiness'], cavity.inputs['Value'])
    worn = nodes.new('ShaderNodeMix'); worn.data_type = 'RGBA'; worn.blend_type = 'MIX'
    wear_amt = nodes.new('ShaderNodeMath'); wear_amt.operation = 'MULTIPLY'; wear_amt.inputs[1].default_value = wear
    links.new(edge_ramp.outputs['Result'], wear_amt.inputs[0])
    links.new(wear_amt.outputs[0], worn.inputs['Factor']); links.new(color, worn.inputs['A'])
    worn.inputs['B'].default_value = (*(edge or tuple(min(1, c * 1.7 + .08) for c in base)), 1)
    shade = nodes.new('ShaderNodeMix'); shade.data_type = 'RGBA'; shade.blend_type = 'MULTIPLY'
    cav_amt = nodes.new('ShaderNodeMath'); cav_amt.operation = 'MULTIPLY'; cav_amt.inputs[1].default_value = .45
    links.new(cavity.outputs['Result'], cav_amt.inputs[0])
    links.new(cav_amt.outputs[0], shade.inputs['Factor']); links.new(worn.outputs['Result'], shade.inputs['A'])
    shade.inputs['B'].default_value = (.25, .22, .2, 1)
    color = shade.outputs['Result']
    # Roughness: base +/- noise, smoother where worn.
    r = nodes.new('ShaderNodeMapRange'); r.inputs['To Min'].default_value = max(.04, rough - .12); r.inputs['To Max'].default_value = min(1, rough + .12)
    links.new(noise.outputs['Fac'], r.inputs['Value'])
    r2 = nodes.new('ShaderNodeMath'); r2.operation = 'MULTIPLY_ADD'; r2.inputs[1].default_value = -.25 * wear; r2.use_clamp = True
    links.new(edge_ramp.outputs['Result'], r2.inputs[0]); links.new(r.outputs['Result'], r2.inputs[2])
    m = nodes.new('ShaderNodeValue'); m.outputs[0].default_value = metal
    b = nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = bump; b.inputs['Distance'].default_value = .002
    links.new(height, b.inputs['Height'])
    links.new(color, bsdf.inputs['Base Color']); links.new(r2.outputs[0], bsdf.inputs['Roughness'])
    links.new(m.outputs[0], bsdf.inputs['Metallic']); links.new(b.outputs['Normal'], bsdf.inputs['Normal'])
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission[0], 1); bsdf.inputs['Emission Strength'].default_value = emission[1]
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    SOCKETS[mat.name] = {'color': color, 'rough': r2.outputs[0], 'metal': m.outputs[0], 'bsdf': bsdf, 'out': out,
                         'emission': emission}
    return mat


def wave(kind='BANDS', direction='X', distortion=0.0, profile='SIN'):
    def make(nodes, links, coord, scale):
        w = nodes.new('ShaderNodeTexWave'); w.wave_type = kind
        if kind == 'BANDS': w.bands_direction = direction
        else: w.rings_direction = direction
        w.wave_profile = profile; w.inputs['Scale'].default_value = scale; w.inputs['Distortion'].default_value = distortion
        links.new(coord.outputs['Object'], w.inputs['Vector'])
        return w.outputs['Fac']
    return make


def quilt(nodes, links, coord, scale):
    """Diamond quilting: two diagonal band sets multiplied."""
    outs = []
    for angle in (45, -45):
        mapping = nodes.new('ShaderNodeMapping'); mapping.inputs['Rotation'].default_value = (0, math.radians(angle), 0)
        links.new(coord.outputs['Object'], mapping.inputs['Vector'])
        w = nodes.new('ShaderNodeTexWave'); w.bands_direction = 'X'; w.wave_profile = 'SIN'; w.inputs['Scale'].default_value = scale
        links.new(mapping.outputs['Vector'], w.inputs['Vector'])
        pw = nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = .35
        links.new(w.outputs['Fac'], pw.inputs[0]); outs.append(pw.outputs[0])
    mul = nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    links.new(outs[0], mul.inputs[0]); links.new(outs[1], mul.inputs[1])
    return mul.outputs[0]


def scales(nodes, links, coord, scale):
    """Overlapping scale rows: Voronoi distance stretched vertically, offset brick-like."""
    mapping = nodes.new('ShaderNodeMapping'); mapping.inputs['Scale'].default_value = (1, 1, 1.6)
    links.new(coord.outputs['Object'], mapping.inputs['Vector'])
    vor = nodes.new('ShaderNodeTexVoronoi'); vor.feature = 'F1'; vor.inputs['Scale'].default_value = scale; vor.inputs['Randomness'].default_value = .15
    links.new(mapping.outputs['Vector'], vor.inputs['Vector'])
    inv = nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1
    links.new(vor.outputs['Distance'], inv.inputs[1])
    pw = nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 2.2
    links.new(inv.outputs[0], pw.inputs[0])
    return pw.outputs[0]


def grain(nodes, links, coord, scale):
    """Leather grain: fine voronoi cells."""
    vor = nodes.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = scale
    links.new(coord.outputs['Object'], vor.inputs['Vector'])
    m = nodes.new('ShaderNodeMath'); m.operation = 'POWER'; m.inputs[1].default_value = .4
    links.new(vor.outputs['Distance'], m.inputs[0])
    return m.outputs[0]


def library():
    L = {}
    L['leather'] = material('leather', (.36, .2, .11), rough=.62, bump=.35, scale=90, wear=.5, pattern=grain, pattern_scale=160, pattern_strength=.4, edge=(.56, .36, .2))
    L['dark_leather'] = material('dark_leather', (.16, .09, .055), rough=.55, bump=.3, scale=90, wear=.45, pattern=grain, pattern_scale=170, pattern_strength=.4, edge=(.38, .24, .14))
    L['suede'] = material('suede', (.45, .32, .2), rough=.9, bump=.2, scale=140, wear=.25, variation=.2)
    L['iron'] = material('iron', (.33, .32, .3), rough=.68, metal=.82, bump=.25, scale=22, wear=1.0, variation=.5, edge=(.86, .85, .82), dark=(.24, .23, .22))
    L['black_iron'] = material('black_iron', (.2, .2, .21), rough=.62, metal=.85, bump=.25, scale=22, wear=1.0, variation=.4, edge=(.7, .69, .66))
    L['steel'] = material('steel', (.7, .72, .75), rough=.4, metal=.95, bump=.15, scale=20, wear=.9, variation=.3, edge=(.95, .95, .93), dark=(.42, .43, .45))
    L['gold'] = material('gold', (.9, .66, .28), rough=.36, metal=1, bump=.15, scale=22, wear=.8, variation=.3, edge=(1, .9, .6), dark=(.55, .36, .12))
    L['brass'] = material('brass', (.62, .45, .2), rough=.4, metal=.95, bump=.15, scale=50, wear=.6, variation=.25, edge=(.9, .76, .45))
    L['silver'] = material('silver', (.82, .84, .87), rough=.34, metal=1, bump=.12, scale=22, wear=.8, variation=.3, edge=(.98, .98, .98), dark=(.5, .5, .53))
    L['copper'] = material('copper', (.78, .44, .26), rough=.42, metal=.95, bump=.2, scale=22, wear=.9, variation=.3, edge=(1, .7, .5), dark=(.3, .5, .4))
    L['bone'] = material('bone', (.86, .8, .66), rough=.6, bump=.35, scale=70, wear=.4, variation=.25, edge=(.96, .93, .84))
    L['cord'] = material('cord', (.3, .19, .1), rough=.8, bump=.5, scale=60, pattern=wave('BANDS', 'Z', 2, 'SAW'), pattern_scale=180, pattern_strength=.8)
    L['ruby'] = material('ruby', (.55, .02, .06), rough=.08, bump=.05, scale=20, variation=.4, edge=(1, .45, .45), wear=.6, emission=((.6, .02, .04), .6))
    L['sapphire'] = material('sapphire', (.05, .22, .7), rough=.08, bump=.05, scale=20, variation=.4, edge=(.55, .8, 1), wear=.6, emission=((.05, .2, .8), .5))
    L['moonstone'] = material('moonstone', (.7, .82, .95), rough=.12, bump=.05, scale=15, variation=.3, edge=(1, 1, 1), wear=.5, emission=((.45, .6, .9), .35))
    L['amethyst'] = material('amethyst', (.38, .1, .62), rough=.08, bump=.05, scale=20, variation=.4, edge=(.85, .6, 1), wear=.6, emission=((.4, .1, .7), .5))
    L['amber'] = material('amber', (.85, .45, .05), rough=.1, bump=.05, scale=20, variation=.35, edge=(1, .8, .4), wear=.5, emission=((.8, .4, .05), .4))
    L['linen'] = material('linen', (.52, .45, .33), rough=.88, bump=.25, scale=110, variation=.2, pattern=quilt, pattern_scale=14, pattern_strength=.9)
    L['wraps'] = material('wraps', (.68, .6, .46), rough=.9, bump=.4, scale=120, variation=.2, pattern=wave('BANDS', 'Z', 1.5, 'SIN'), pattern_scale=55, pattern_strength=.9)
    L['blue_cloth'] = material('blue_cloth', (.1, .2, .36), rough=.85, bump=.2, scale=120, variation=.25, pattern=wave('BANDS', 'Z', 0, 'SIN'), pattern_scale=260, pattern_strength=.2)
    L['red_cloth'] = material('red_cloth', (.45, .07, .07), rough=.85, bump=.2, scale=120, variation=.25, pattern=wave('BANDS', 'Z', 0, 'SIN'), pattern_scale=260, pattern_strength=.2)
    L['violet_leather'] = material('violet_leather', (.2, .1, .3), rough=.5, bump=.3, scale=90, wear=.45, pattern=grain, pattern_scale=170, pattern_strength=.35, edge=(.45, .3, .55))
    L['teal_leather'] = material('teal_leather', (.08, .27, .3), rough=.55, bump=.3, scale=90, wear=.45, pattern=grain, pattern_scale=170, pattern_strength=.35, edge=(.3, .55, .55))
    L['scales'] = material('scales', (.55, .55, .55), rough=.5, metal=.9, bump=.9, scale=50, wear=.4, variation=.35, pattern=scales, pattern_scale=16, pattern_strength=2.2, edge=(.85, .85, .82), dark=(.2, .2, .21))
    L['lapis'] = material('lapis', (.1, .18, .5), rough=.3, bump=.1, scale=40, variation=.4, wear=.4, edge=(.4, .55, .9))
    L['rune_steel'] = material('rune_steel', (.66, .68, .7), rough=.3, metal=.95, bump=.35, scale=40, wear=.5, variation=.18, pattern=wave('BANDS', 'Z', 6, 'SAW'), pattern_scale=30, pattern_strength=.5, edge=(.92, .92, .9))
    return L

# ---------------------------------------------------------------- models
# Units are meters; each object sits roughly in a 0.25-0.6 m box centred near the origin.


def loft(name, sections, mat, count=40, solid=.008, subsurf=1, power=2.0, **kw):
    """Hollow garment shell lofted through superellipse rings (z, rx, ry, cx, cy).

    Ends stay open so the openings show real cloth thickness."""
    bm = bmesh.new(); rings = []
    for section in sections:
        z, rx, ry = section[:3]; cx = section[3] if len(section) > 3 else 0; cy = section[4] if len(section) > 4 else 0
        ring = []
        for i in range(count):
            a = 2 * math.pi * i / count; c, s = math.cos(a), math.sin(a)
            ring.append(bm.verts.new((cx + rx * math.copysign(abs(c) ** (2 / power), c), cy + ry * math.copysign(abs(s) ** (2 / power), s), z)))
        rings.append(ring)
    for lower, upper in zip(rings, rings[1:]):
        for i in range(count):
            bm.faces.new((lower[i], lower[(i + 1) % count], upper[(i + 1) % count], upper[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = from_bm(name, bm)
    if solid:
        mod = obj.modifiers.new('solid', 'SOLIDIFY'); mod.thickness = solid; mod.offset = -1
    if subsurf:
        mod = obj.modifiers.new('sub', 'SUBSURF'); mod.levels = subsurf; mod.render_levels = subsurf
    return finish(obj, mat, **kw)


def sleeve(name, side, mat, length=.1, droop=40, r0=(.07, .062), r1=(.06, .055), solid=.007):
    """Short tube from the shoulder outward and down; open cuff."""
    obj = loft(name, [(0, r0[0], r0[1]), (length * .5, (r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2), (length, r1[0], r1[1])], mat, count=28, solid=solid)
    obj.data.transform(Matrix.Rotation(math.radians(side * (90 + droop)), 4, 'Y'))
    obj.data.transform(Matrix.Translation((side * .12, 0, .17)))
    return obj


TORSO = [(-.26, .158, .108), (-.18, .15, .102), (-.1, .143, .098), (-.02, .15, .102), (.06, .162, .108),
         (.13, .17, .108), (.18, .168, .1), (.215, .13, .085), (.232, .078, .06), (.25, .068, .054)]


def torso(L, mat, name='torso', bulk=1.0, power=2.4, top=None):
    sections = [(z, rx * bulk, ry * bulk) for z, rx, ry in (top or TORSO)]
    return loft(name, sections, mat, power=power, solid=.009, count=32)


def opening_trim(name, mat, z, rx, ry, r=.008, power=2.4, count=48, cx=0):
    pts = []
    for i in range(count):
        a = 2 * math.pi * i / count; c, s = math.cos(a), math.sin(a)
        pts.append((cx + rx * math.copysign(abs(c) ** (2 / power), c), ry * math.copysign(abs(s) ** (2 / power), s), z))
    return tube(name, pts, r, mat, cyclic=True)


def leather_cap(L):
    sphere('cap_dome', .14, L['leather'], loc=(0, 0, 0), scale=(1, 1.08, .9), cut=-.05, seg=40, rings=20, solidify=.01)
    torus('cap_band', .14, .016, L['dark_leather'], loc=(0, 0, -.002), scale=(1, 1.08, 1.25), ring=10)
    for angle in (0, 90, 180, 270):  # raised stitched seams over the crown
        pts = [(math.cos(math.radians(angle)) * .143 * math.sin(math.radians(t)), math.sin(math.radians(angle)) * .143 * math.sin(math.radians(t)) * 1.08, .126 * math.cos(math.radians(t)) + .002) for t in range(0, 92, 6)]
        tube(f'seam{angle}', pts, .0045, L['dark_leather'])
    sphere('cap_button', .016, L['copper'], loc=(0, 0, .128), scale=(1, 1, .6), seg=16, rings=8)
    for side in (1, -1):  # ear flaps with knotted laces
        flap = [(-.05, 0), (.05, 0), (.045, -.08), (0, -.11), (-.045, -.08)]
        prism(f'flap{side}', flap, .01, L['leather'], loc=(side * .143, 0, -.005), rot=(0, 0, 90 * side), bevel=.004)
        tube(f'lace{side}', smooth_path([(side * .15, 0, -.1), (side * .155, .006, -.13), (side * .152, -.004, -.155)], 4), .0045, L['cord'])
        sphere(f'lacebead{side}', .009, L['copper'], loc=(side * .152, -.004, -.16), seg=12, rings=8)


def iron_helm(L):
    sphere('helm_dome', .14, L['iron'], scale=(1, 1.1, 1.08), cut=0, seg=40, rings=20, solidify=.008)
    cylinder('helm_skirt', .14, .07, L['iron'], loc=(0, 0, -.035), scale=(1, 1.1, 1), caps=False, verts=40, solidify=.008)
    torus('helm_brow', .145, .012, L['black_iron'], loc=(0, 0, .0), scale=(1, 1.1, 1.3), ring=10)
    torus('helm_rim', .145, .008, L['black_iron'], loc=(0, 0, -.07), scale=(1, 1.1, 1), ring=8)
    pts = [(0, .155 * math.cos(math.radians(t)) * 1.1 * .99, .151 * math.sin(math.radians(t))) for t in range(10, 171, 8)]
    tube('helm_crest', pts, .011, L['black_iron'])
    for i in range(16):  # rivets on brow band
        a = math.radians(i * 22.5 + 11)
        sphere(f'rivet{i}', .0065, L['steel'], loc=(math.cos(a) * .158, math.sin(a) * .171, 0), seg=10, rings=6)
    nasal = [(-.016, .01), (.016, .01), (.012, -.1), (0, -.115), (-.012, -.1)]
    prism('helm_nasal', nasal, .008, L['iron'], loc=(0, -.163, -.0), bevel=.003)
    for side in (1, -1):  # cheek guards
        cheek = [(-.045, 0), (.045, 0), (.04, -.07), (.01, -.1), (-.035, -.075)]
        prism(f'cheek{side}', cheek, .007, L['iron'], loc=(side * .128, -.06, -.068), rot=(0, 0, side * 58), bevel=.003)
        for k, z in enumerate((-.085, -.12)):
            sphere(f'cheekrivet{side}{k}', .005, L['steel'], loc=(side * .138, -.07, z), seg=8, rings=6)


def rune_circlet(L):
    cylinder('circlet_band', .12, .022, L['silver'], scale=(1, 1.12, 1), caps=False, verts=56, solidify=.006, bevel=.0015)
    torus('circlet_lip_top', .12, .003, L['gold'], loc=(0, 0, .011), scale=(1, 1.12, 1), ring=6)
    torus('circlet_lip_bot', .12, .003, L['gold'], loc=(0, 0, -.011), scale=(1, 1.12, 1), ring=6)
    # Tall filigree crest: a pointed leaf peak flanked by two smaller curls.
    peak = [(-.055, -.011), (-.04, .006), (-.022, .02), (-.014, .045), (-.006, .07), (0, .088), (.006, .07), (.014, .045), (.022, .02), (.04, .006), (.055, -.011)]
    prism('circlet_peak', peak, .006, L['gold'], loc=(0, -.133, 0), bevel=.0022)
    ico('circlet_gem', .019, L['sapphire'], loc=(0, -.139, .03), scale=(.8, .55, 1.25), sub=2)
    torus('circlet_setting', .018, .0028, L['gold'], loc=(0, -.138, .03), rot=(90, 0, 0), scale=(.85, 1.3, 1), ring=6, seg=24)
    for side in (1, -1):
        leaf = [(0, 0), (.012, .015), (.016, .04), (.006, .03), (-.004, .012)]
        prism(f'curl{side}', [(x * side, z) for x, z in leaf] if side > 0 else [(x * side, z) for x, z in reversed(leaf)], .005, L['gold'], loc=(side * .048, -.128, .006), rot=(0, 0, side * 22), bevel=.0016)
    for i, a in enumerate((-50, -28, 28, 50)):  # rune plates
        r = math.radians(a - 90)
        x, y = math.cos(r) * .124, math.sin(r) * .139
        box(f'rune{i}', (.018, .004, .016), L['rune_steel'], loc=(x, y, 0), rot=(0, 0, a))
        ico(f'runegem{i}', .0045, L['sapphire'] if i % 2 else L['moonstone'], loc=(x * 1.035, y * 1.035, 0), sub=1)


def padded_tunic(L):
    torso(L, L['linen'])
    for side in (1, -1):
        sleeve(f'sleeve{side}', side, L['linen'], length=.11)
        cuff = Matrix.Translation((side * .12, 0, .17)) @ Matrix.Rotation(math.radians(side * 130), 4, 'Y')
        ring = opening_trim(f'cuff{side}', L['dark_leather'], .108, .062, .057, r=.009, power=2)
        ring.data.transform(cuff)
    opening_trim('collar', L['dark_leather'], .248, .07, .056, r=.011)
    opening_trim('hem', L['dark_leather'], -.258, .16, .11, r=.009)
    opening_trim('belt', L['leather'], -.11, .147, .101, r=.016)
    box('buckle', (.042, .012, .036), L['brass'], loc=(0, -.118, -.11))
    box('buckle_in', (.026, .014, .02), L['dark_leather'], loc=(0, -.12, -.11), bevel=.002)
    for i in range(4):  # chest lacing over a slit
        z = .2 - i * .028; y = -.104 - (i * .002)
        tube(f'lace{i}a', [(-.02, y, z), (.02, y, z - .02)], .0032, L['cord'])
        tube(f'lace{i}b', [(.02, y, z), (-.02, y, z - .02)], .0032, L['cord'])
    for side in (1, -1):
        for i in range(4):
            torus(f'eyelet{side}{i}', .005, .0018, L['brass'], loc=(side * .022, -.103 - i * .002, .2 - i * .028), rot=(90, 0, 0), seg=10, ring=5)


def scale_mail(L):
    torso(L, L['scales'], bulk=1.03)
    torso(L, L['dark_leather'], name='mail_lining', bulk=.97)
    for side in (1, -1):
        sleeve(f'msleeve{side}', side, L['scales'], length=.07, r0=(.072, .064), r1=(.066, .06))
        ring = opening_trim(f'mcuff{side}', L['brass'], .068, .068, .062, r=.008, power=2)
        ring.data.transform(Matrix.Translation((side * .12, 0, .17)) @ Matrix.Rotation(math.radians(side * 130), 4, 'Y'))
        pts = smooth_path([(side * .05, -.105, .225), (side * .1, -.07, .245), (side * .12, .02, .245), (side * .07, .1, .215)], 5)
        tube(f'strap{side}', pts, .011, L['dark_leather'])
        sphere(f'stud{side}', .009, L['brass'], loc=(side * .055, -.108, .222), seg=12, rings=6)
    opening_trim('mcollar', L['brass'], .248, .072, .058, r=.012)
    opening_trim('mhem', L['brass'], -.258, .164, .112, r=.01)
    opening_trim('mbelt', L['dark_leather'], -.11, .151, .104, r=.017)
    box('mbuckle', (.044, .014, .038), L['brass'], loc=(0, -.122, -.11))


def warden_plate(L):
    torso(L, L['blue_cloth'], bulk=.98)
    # Breastplate: a front shell following the torso, with a centre ridge.
    plate = loft('breastplate', [(z, rx * 1.06, ry * 1.12, 0, -.006) for z, rx, ry in TORSO[2:8]], L['steel'], power=2.2, solid=.008)
    for v in plate.data.vertices:  # cut away the back half: keep front shell only
        if v.co.y > .03: v.co.y = .03 + (v.co.y - .03) * .2
    for side in (1, -1):  # layered pauldrons over the shoulders
        for k, (dz, dx, s) in enumerate(((0, 0, 1), (-.035, .03, .92), (-.065, .05, .82))):
            sphere(f'pauldron{side}{k}', .085 * s, L['steel'], loc=(side * (.16 + dx), 0, .205 + dz), scale=(1.15, 1.08, .78), rot=(0, side * (28 + k * 12), 0), cut=0, seg=28, rings=14, solidify=.006)
            torus(f'ptrim{side}{k}', .085 * s, .0045, L['gold'], loc=(side * (.16 + dx), 0, .205 + dz), rot=(0, side * (28 + k * 12), 0), scale=(1.15, 1.08, 1), ring=6)
    for i, z in enumerate((-.13, -.19)):  # faulds: two broad overlapping lames
        loft(f'fauld{i}', [(z - .035, .156 + i * .008, .11 + i * .005), (z + .02, .149 + i * .006, .104 + i * .004)], L['steel'], count=32, power=2.4, solid=.006, subsurf=0, bevel=.002)
    opening_trim('fauld_trim', L['gold'], -.095, .147, .103, r=.006)
    opening_trim('gorget', L['steel'], .245, .075, .06, r=.017)
    opening_trim('gorget_trim', L['gold'], .262, .074, .059, r=.005)
    shield = [(-.042, .048), (.042, .048), (.042, .0), (0, -.055), (-.042, 0)]
    prism('emblem', shield, .01, L['gold'], loc=(0, -.13, .1), bevel=.003)
    ico('emblem_gem', .019, L['sapphire'], loc=(0, -.138, .1), scale=(1, .55, 1.2), sub=2)
    opening_trim('breast_trim', L['gold'], .19, .178, .121, r=.005)


def hand(L, mat, name='hand', curl=.3):
    """Glove from a skin skeleton. Back of the hand faces -Y (the camera);
    fingers curl a little toward +Y; the thumb runs up the side of the palm."""
    nodes = [((0, 0, -.06), (.04, .03)), ((0, 0, -.02), (.044, .026)), ((0, 0, .03), (.05, .025)), ((0, 0, .058), (.051, .023))]
    edges = [(0, 1), (1, 2), (2, 3)]
    for i, x in enumerate((-.035, -.0118, .0118, .035)):
        length = (.042, .052, .055, .048)[i]
        base = len(nodes); nodes.append(((x * .98, 0, .07), (.0125, .0118))); edges.append((3, base)); prev = base
        for k in range(1, 4):
            t = k / 3; bend = curl * t * 1.6
            co = (x * (1 + .06 * t), math.sin(bend) * length * .7, .07 + math.cos(bend) * length * t)
            nodes.append((co, (.0118 - .0016 * t, .0112 - .0016 * t))); edges.append((prev, len(nodes) - 1)); prev = len(nodes) - 1
    t0 = len(nodes)
    nodes += [((.045, .006, -.012), (.016, .014)), ((.062, .012, .014), (.0125, .0118)), ((.07, .014, .038), (.0112, .0105))]
    edges += [(1, t0), (t0, t0 + 1), (t0 + 1, t0 + 2)]
    return skin(name, nodes, edges, mat, subsurf=1)


def pair(maker, offset, rot=0):
    """Build one, then mirror a copy beside it (pairs read as gloves/boots)."""
    before = set(bpy.data.objects)
    maker()
    made = [o for o in bpy.data.objects if o not in before]
    for obj in made:
        copy = obj.copy(); copy.data = obj.data.copy(); bpy.context.scene.collection.objects.link(copy)
        copy.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        copy.data.flip_normals()
        copy.data.transform(Matrix.Rotation(math.radians(rot), 4, 'Z'))
        copy.data.transform(Matrix.Translation(offset))
        # Tag the mirrored side so export can split it off: the game wears each side on its own bone.
        group = copy.vertex_groups.new(name='pair_copy')
        group.add(range(len(copy.data.vertices)), 1.0, 'REPLACE')


def flared_cuff(name, mat, z0=-.05, z1=-.13, r0=(.046, .036), r1=(.062, .052), solid=.006):
    return loft(name, [(z1, *r1), ((z0 + z1) / 2, (r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2), (z0, *r0)], mat, count=32, solid=solid, power=2)


def cloth_wraps(L):
    def one():
        hand(L, L['wraps'], 'wrap_hand', curl=.3)
        flared_cuff('wrap_cuff', L['wraps'], z0=-.04, z1=-.11, r0=(.043, .033), r1=(.05, .04))
        for z in (-.105, -.07):
            opening_trim(f'wrap_band{z}', L['cord'], z, .049 if z < -.08 else .046, .039 if z < -.08 else .036, r=.004, power=2)
        tube('wrap_tail', smooth_path([(.03, -.03, -.1), (.05, -.04, -.13), (.045, -.045, -.16)], 4), .007, L['wraps'], taper=lambda t: 1 - t * .4)
    pair(one, (-.075, .085, 0), rot=12)


def iron_gauntlets(L):
    def one():
        hand(L, L['dark_leather'], 'gaunt_hand', curl=.4)
        flared_cuff('gaunt_cuff', L['iron'], z0=-.04, z1=-.135, r0=(.05, .04), r1=(.066, .056), solid=.006)
        opening_trim('gaunt_rim', L['black_iron'], -.135, .066, .056, r=.0055, power=2)
        opening_trim('gaunt_rim2', L['black_iron'], -.085, .058, .048, r=.004, power=2)
        sphere('gaunt_back', .055, L['iron'], loc=(0, .0, .025), scale=(1, .5, 1.05), rot=(-90, 0, 0), cut=.15, seg=24, rings=12, solidify=.005)
        for i, x in enumerate((-.035, -.0118, .0118, .035)):
            box(f'knuckle{i}', (.022, .016, .016), L['iron'], loc=(x, -.016, .074))
            box(f'finger{i}', (.019, .012, .02), L['black_iron'], loc=(x, -.011, .1), rot=(15, 0, 0))
        for k in range(3):
            sphere(f'grivet{k}', .0055, L['steel'], loc=(-.025 + k * .025, -.03, .03), seg=8, rings=6)
    pair(one, (-.085, .095, 0), rot=14)


def spellweave_gloves(L):
    def one():
        hand(L, L['violet_leather'], 'spell_hand', curl=.22)
        flared_cuff('spell_cuff', L['violet_leather'], z0=-.04, z1=-.14, r0=(.046, .035), r1=(.068, .058), solid=.005)
        opening_trim('spell_cuff_trim', L['gold'], -.14, .068, .058, r=.005, power=2)
        opening_trim('spell_cuff_trim2', L['gold'], -.045, .047, .036, r=.004, power=2)
        ico('spell_gem', .017, L['amethyst'], loc=(0, -.027, .02), scale=(1, .6, 1.25), sub=2)
        torus('spell_setting', .017, .003, L['gold'], loc=(0, -.025, .02), rot=(90, 0, 0), scale=(1, 1.25, 1), ring=6, seg=20)
        for side in (1, -1):
            tube(f'spell_vein{side}', smooth_path([(0, -.027, .04), (side * .015, -.025, .056), (side * .03, -.022, .066)], 4), .0022, L['gold'])
            tube(f'spell_vein_lo{side}', smooth_path([(0, -.027, .0), (side * .02, -.026, -.018), (side * .03, -.024, -.04)], 4), .0022, L['gold'])
    pair(one, (-.085, .095, 0), rot=14)


def boot(L, shaft_mat, sole_mat, height=.22, toe=.13, bulk=1.0, name='boot'):
    s = bulk
    nodes = [((0, 0, height), (.05 * s, .052 * s)), ((0, 0, height * .5), (.044 * s, .046 * s)), ((0, 0, .06), (.042 * s, .05 * s)),
             ((0, .0, .035), (.044 * s, .052 * s)), ((0, -toe * .5, .03), (.044 * s, .042 * s)), ((0, -toe, .026), (.034 * s, .03 * s)),
             ((0, .03, .03), (.04 * s, .038 * s))]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (3, 6)]
    obj = skin(name, nodes, edges, shaft_mat, subsurf=2)
    # Flatten everything below the sole line so the boot stands.
    for v in obj.data.vertices:
        if v.co.z < .008: v.co.z = .008
    outline = [(math.sin(math.radians(a)) * .048 * s, (math.cos(math.radians(a)) * .5 + .5) * -(toe + .045) + .055, ) for a in range(0, 360, 20)]
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, 0)) for x, y in outline]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, verts=[v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)], vec=(0, 0, .016))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    finish(from_bm(name + '_sole', bm), sole_mat, bevel=.004, angle=40)
    return obj


def soft_boots(L):
    def one():
        boot(L, L['suede'], L['dark_leather'], height=.17, name='soft')
        torus('soft_fold', .053, .013, L['suede'], loc=(0, 0, .165), scale=(1, 1.03, 1.2), ring=10)
        for i in range(3):
            z = .13 - i * .03
            tube(f'soft_lace{i}', [(-.02, -.046, z), (.02, -.048, z - .016)], .0025, L['cord'])
            tube(f'soft_lace{i}b', [(.02, -.046, z), (-.02, -.048, z - .016)], .0025, L['cord'])
    pair(one, (-.11, .06, 0), rot=10)


def traveler_boots(L):
    def one():
        boot(L, L['leather'], L['dark_leather'], height=.24, name='trav')
        cylinder('trav_cuff', .058, .045, L['dark_leather'], loc=(0, 0, .232), r2=.064, scale=(1, 1.04, 1), caps=False, verts=28, solidify=.004, bevel=.002)
        for i, z in enumerate((.17, .1)):
            torus(f'trav_strap{i}', .05 - i * .002, .006, L['dark_leather'], loc=(0, 0, z), scale=(1, 1.05, 1.6), ring=8)
            box(f'trav_buckle{i}', (.022, .006, .018), L['brass'], loc=(.042, -.024, z), rot=(0, 0, 30))
        box('trav_toe', (.05, .03, .012), L['brass'], loc=(0, -.13, .026), rot=(-18, 0, 0), bevel=.004)
    pair(one, (-.12, .06, 0), rot=10)


def windstep_boots(L):
    def one():
        boot(L, L['teal_leather'], L['dark_leather'], height=.21, bulk=.93, name='wind')
        sphere('wind_toecap', .033, L['silver'], loc=(0, -.118, .03), scale=(1, 1.1, .7), cut=0, seg=20, rings=10, solidify=.003)
        torus('wind_top', .045, .007, L['silver'], loc=(0, 0, .19), scale=(1, 1.05, 1), ring=8)
        # One swept wing with three scalloped feather tips, rising backward from the ankle.
        wing = [(0, 0), (.02, .03), (.05, .06), (.085, .085), (.07, .06), (.088, .058), (.068, .036), (.08, .028), (.055, .012), (.03, -.004)]
        prism('wing', wing, .006, L['silver'], loc=(.047, .0, .085), rot=(0, 0, 90), scale=(1, 1, 1), bevel=.002)
        for k, (x, z) in enumerate(((.03, .025), (.05, .04), (.065, .052))):  # raised feather quills
            tube(f'quill{k}', [(.051, -.004 + x * .2, .085 + z * .4), (.051, x, .085 + z)], .0018, L['silver'])
        ico('wind_gem', .011, L['moonstone'], loc=(.05, -.004, .09), sub=2)
    pair(one, (-.11, .07, 0), rot=10)


def bone_charm(L):
    pts = ring_points(.1, 0, 40, .75, 1.0, start=0)
    pts = [(x, 0, y + .1) for x, y, _ in pts]
    tube('charm_cord', pts, .0045, L['cord'], cyclic=True)
    # curved fang: tapered tube along an arc
    arc = [(math.sin(math.radians(t)) * .07 - .025, 0, -math.cos(math.radians(t)) * .07 + .055) for t in range(0, 110, 6)]
    tube('charm_fang', arc, .022, L['bone'], taper=lambda t: max(.04, 1 - t ** 1.3 * .96))
    torus('charm_wrap', .02, .005, L['cord'], loc=(-.025, 0, -.012), rot=(0, 0, 0), ring=6, seg=20)
    torus('charm_wrap2', .019, .005, L['cord'], loc=(-.025, 0, -.002), rot=(0, 0, 0), ring=6, seg=20)
    for i, (x, z, r, m) in enumerate(((-.05, .03, .012, 'bone'), (.0, .008, .013, 'amber'), (.05, .03, .012, 'bone'), (-.068, .06, .009, 'amber'), (.068, .06, .009, 'amber'))):
        sphere(f'bead{i}', r, L[m], loc=(x, 0, z), seg=14, rings=8)


def star_pendant(L):
    chain('star_chain', L['silver'], .1, .75, 1.0, count=36, center=(0, 0, .1))
    star = []
    for i in range(10):
        r = .045 if i % 2 == 0 else .019
        a = math.radians(90 + i * 36)
        star.append((math.cos(a) * r, math.sin(a) * r))
    prism('star', star, .012, L['gold'], loc=(0, 0, -.045), bevel=.004, angle=30)
    ico('star_gem', .012, L['sapphire'], loc=(0, -.008, -.045), scale=(1, .6, 1), sub=2)
    torus('star_bail', .009, .0028, L['gold'], loc=(0, 0, .006), ring=6, seg=16, rot=(0, 90, 0))


def heart_amulet(L):
    chain('heart_chain', L['gold'], .1, .75, 1.0, count=36, center=(0, 0, .11))
    heart = []
    for i in range(40):
        t = math.radians(i * 9)
        heart.append((16 * math.sin(t) ** 3 * .0028, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) * .0028))
    gem = prism('heart_gem', heart, .03, L['ruby'], loc=(0, 0, -.045), bevel=.009, angle=80)
    outline = [(x * 1.12, 0, z * 1.12 - .045) for x, z in heart]
    tube('heart_bezel', outline, .0045, L['gold'], cyclic=True)
    for i in range(4):  # gold claws
        a = math.radians(45 + i * 90)
        tube(f'claw{i}', smooth_path([(math.cos(a) * .052, -.004, math.sin(a) * .05 - .045), (math.cos(a) * .043, -.017, math.sin(a) * .04 - .045)], 3), .004, L['gold'], taper=lambda t: 1 - t * .6)
    torus('heart_bail', .011, .0035, L['gold'], loc=(0, 0, .003), ring=6, seg=16, rot=(0, 90, 0))


def ring_band(name, mat, inner=.026, width=.012, thick=.0055, seg=48):
    """Ring band with a rounded D profile."""
    torus(name, inner + thick, thick, mat, rot=(90, 0, 0), scale=(1, width / (2 * thick), 1), seg=seg, ring=14)


def copper_ring(L):
    ring_band('copper_band', L['copper'], width=.013, thick=.005)
    for i in range(14):  # hammered facets: tiny raised studs around the band
        a = math.radians(i * 360 / 14)
        sphere(f'cstud{i}', .0028, L['copper'], loc=(math.cos(a) * .0355, 0, math.sin(a) * .0355), scale=(1, 1.6, 1), seg=8, rings=6)


def silver_band(L):
    ring_band('silver_core', L['silver'], width=.01, thick=.0045)
    for k, y in enumerate((-.0058, .0058)):  # twisted rope edges
        pts = [(math.cos(math.radians(t)) * (.0305 + .0012 * math.sin(math.radians(t * 12 + k * 90))), y + .0012 * math.cos(math.radians(t * 12 + k * 90)), math.sin(math.radians(t)) * (.0305)) for t in range(0, 360, 4)]
        tube(f'rope{k}', pts, .0022, L['silver'], cyclic=True)
    ico('silver_gem', .006, L['moonstone'], loc=(0, 0, .037), sub=2)


def moon_signet(L):
    ring_band('signet_band', L['gold'], width=.012, thick=.006)
    cylinder('signet_face', .018, .009, L['gold'], loc=(0, 0, .036), scale=(1, .85, 1), verts=32, bevel=.002)
    cylinder('signet_inlay', .0145, .002, L['lapis'], loc=(0, 0, .0406), scale=(1, .85, 1), verts=32, bevel=.0005)
    moon = []
    for i in range(25):
        a = math.radians(-120 + i * 10)
        moon.append((math.cos(a) * .012, math.sin(a) * .012))
    for i in range(25):
        a = math.radians(120 - i * 10)
        moon.append((math.cos(a) * .0095 + .0055, math.sin(a) * .0095))
    prism('signet_moon', moon[:-1], .003, L['silver'], loc=(-.002, 0, .0425), rot=(90, 0, 0), scale=(.9, .8, 1), bevel=.0008)
    ico('signet_star', .0028, L['moonstone'], loc=(.007, .004, .042), sub=1)
    for side in (1, -1):
        sphere(f'shoulder{side}', .006, L['gold'], loc=(side * .016, 0, .031), scale=(1, 1.4, 1), seg=12, rings=6)


BUILDERS = {name: fn for name, fn in globals().items() if callable(fn) and name in {g['id'] for g in CATALOGUE}}

# ---------------------------------------------------------------- bake + export


def join_all(item_id):
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object; obj.name = item_id; obj.data.name = item_id
    # Recentre on the bounds: icon framing and the turntable spin about the centre.
    lo = Vector([min(v.co[i] for v in obj.data.vertices) for i in range(3)])
    hi = Vector([max(v.co[i] for v in obj.data.vertices) for i in range(3)])
    obj.data.transform(Matrix.Translation(-(lo + hi) / 2))
    # Where the authored origin (helm brow band, torso waist, glove palm) lands after
    # recentring, in Blender axes. The game fits worn gear to the body from it.
    obj['sourceOrigin'] = [round(-(lo[i] + hi[i]) / 2, 5) for i in range(3)]
    obj.data.calc_loop_triangles()
    return obj


def unwrap(obj):
    activate(obj); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.006, area_weight=1.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake(obj, directory, item_id, samples=8):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = samples
    scene.render.bake.margin = 6; scene.render.bake.margin_type = 'EXTEND'
    images = {}
    for kind, colorspace in (('albedo', 'sRGB'), ('orm', 'Non-Color'), ('normal', 'Non-Color')):
        image = bpy.data.images.new(f'{item_id}_{kind}', ATLAS, ATLAS, alpha=False)
        image.colorspace_settings.name = colorspace
        images[kind] = image
    mats = [slot.material for slot in obj.material_slots]

    def target(image):
        for mat in mats:
            node = mat.node_tree.nodes.get('bake_target') or mat.node_tree.nodes.new('ShaderNodeTexImage')
            node.name = 'bake_target'; node.image = image
            mat.node_tree.nodes.active = node

    def emit(channel):
        temps = []
        for mat in mats:
            s = SOCKETS[mat.name]; nt = mat.node_tree
            em = nt.nodes.new('ShaderNodeEmission'); temps.append((nt, em))
            if channel == 'albedo':
                nt.links.new(s['color'], em.inputs['Color'])
            else:
                comb = nt.nodes.new('ShaderNodeCombineColor'); temps.append((nt, comb))
                comb.inputs['Red'].default_value = 1
                nt.links.new(s['rough'], comb.inputs['Green']); nt.links.new(s['metal'], comb.inputs['Blue'])
                nt.links.new(comb.outputs['Color'], em.inputs['Color'])
            nt.links.new(em.outputs['Emission'], s['out'].inputs['Surface'])
        return temps

    timings = {}
    for channel in ('albedo', 'orm'):
        started = time.monotonic()
        temps = emit(channel); target(images[channel])
        scene.cycles.samples = 4
        bpy.ops.object.bake(type='EMIT')
        for nt, node in temps: nt.nodes.remove(node)
        for mat in mats:
            s = SOCKETS[mat.name]; mat.node_tree.links.new(s['bsdf'].outputs['BSDF'], s['out'].inputs['Surface'])
        timings[channel] = round(time.monotonic() - started, 2)
    started = time.monotonic()
    target(images['normal']); scene.cycles.samples = 8
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    timings['normal'] = round(time.monotonic() - started, 2)
    for kind, image in images.items():
        image.filepath_raw = str(directory / f'{item_id}-{kind}.png'); image.file_format = 'PNG'; image.save()
    return images, timings


def runtime_material(obj, images, item_id):
    mat = bpy.data.materials.new(f'{item_id}_baked'); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
    tex = {}
    for kind in images:
        node = nt.nodes.new('ShaderNodeTexImage'); node.image = images[kind]; tex[kind] = node
    nt.links.new(tex['albedo'].outputs['Color'], bsdf.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(tex['orm'].outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tex['normal'].outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    obj.data.materials.clear(); obj.data.materials.append(mat)


def split_pair(obj):
    """Gloves and boots: separate the mirrored copy into '<id>_mirror'. The
    original side stays '<id>' (thumb toward +x, so it is the left hand/foot)."""
    if 'pair_copy' not in obj.vertex_groups: return []
    activate(obj); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT')
    obj.vertex_groups.active = obj.vertex_groups['pair_copy']; bpy.ops.object.vertex_group_select()
    bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    parts = [o for o in bpy.context.selected_objects if o is not obj]
    for part in parts:
        part.name = obj.name + '_mirror'; part.data.name = part.name
        part.vertex_groups.clear()
    obj.vertex_groups.clear()
    return parts


def export(obj, path, item):
    obj['gearBaseId'] = item['id']; obj['gearKind'] = item['kind']; obj['sourceUnits'] = 'meters'
    mirrors = split_pair(obj)
    activate(obj)
    for part in mirrors:
        part['gearBaseId'] = item['id']; part['gearKind'] = item['kind']; part['gearSide'] = 'mirror'; part['sourceOrigin'] = obj['sourceOrigin']; part.select_set(True)
    if mirrors: obj['gearSide'] = 'original'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_extras=True,
                              export_image_format='JPEG', export_jpeg_quality=82, export_yup=True,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials='EXPORT', export_animations=False)


def thumbnail(glb, png, item, size=384):
    """Re-import the exact GLB into an empty studio and render the icon."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [o for o in scene.objects if o.type == 'MESH']
    points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo = Vector([min(p[i] for p in points) for i in range(3)]); hi = Vector([max(p[i] for p in points) for i in range(3)])
    target = (lo + hi) / 2
    preview = item['preview']
    az, el = math.radians(preview['azimuth']), math.radians(preview['elevation'])
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.location = target + direction * 3
    cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'
    inverse = cam.rotation_euler.to_matrix().transposed()
    projected = [inverse @ (p - target) for p in points]
    span = max(max(p[i] for p in projected) - min(p[i] for p in projected) for i in (0, 1))
    cam.data.ortho_scale = span * preview.get('margin', 1.12)
    world = bpy.data.worlds.new('w'); world.use_nodes = True; scene.world = world
    world.node_tree.nodes['Background'].inputs[0].default_value = (.13, .16, .2, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .35
    # Same "metal" studio as the relic thumbnails: warm key, cool rim, top fill.
    for loc, power, color, sx, sy in (((-1.6, -3, -.3), 470, (1, .94, .83), 1.3, 3.2),
                                      ((2.2, -2.6, 1.1), 210, (.73, .86, 1), 1.6, 2.4),
                                      ((1.2, 1.1, 2.1), 620, (.77, .88, 1), .8, 2.1)):
        light = bpy.data.objects.new('softbox', bpy.data.lights.new('softbox', 'AREA')); scene.collection.objects.link(light)
        light.location = target + Vector(loc); light.data.energy = power * .3; light.data.color = color
        light.data.shape = 'RECTANGLE'; light.data.size = sx; light.data.size_y = sy
        light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
    scene.view_settings.view_transform = 'AgX'
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 48; scene.cycles.use_denoising = True
    scene.render.resolution_x = size; scene.render.resolution_y = size; scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'WEBP'; scene.render.image_settings.color_mode = 'RGBA'; scene.render.image_settings.quality = 88
    scene.render.filepath = str(png)
    bpy.ops.render.render(write_still=True)


def glb_stats(path):
    import struct
    raw = path.read_bytes(); size, = struct.unpack_from('<I', raw, 12)
    doc = json.loads(raw[20:20 + size])
    tris = sum(doc['accessors'][p['indices']]['count'] // 3 for m in doc['meshes'] for p in m['primitives'])
    return {'bytes': len(raw), 'triangles': tris, 'materials': len(doc.get('materials', [])),
            'images': [i.get('mimeType') for i in doc.get('images', [])], 'external': any('uri' in b for b in doc.get('buffers', []))}


def build(item, install=False):
    started = time.monotonic()
    item_id = item['id']; directory = OUT / item_id; directory.mkdir(parents=True, exist_ok=True)
    reset()
    L = library()
    globals()[item_id](L)
    obj = join_all(item_id)
    source_tris = len(obj.data.loop_triangles)
    if source_tris > BUDGET:
        mod = obj.modifiers.new('budget', 'DECIMATE'); mod.ratio = BUDGET / source_tris
        apply_all(obj); obj.data.calc_loop_triangles()
    unwrap(obj)
    bpy.ops.wm.save_as_mainfile(filepath=str(directory / 'source.blend'), compress=True)
    images, timings = bake(obj, directory, item_id)
    # Runtime size: full-res albedo, half-res normal and ORM (they carry broad forms).
    for kind in ('normal', 'orm'): images[kind].scale(ATLAS // 2, ATLAS // 2)
    runtime_material(obj, images, item_id)
    glb = directory / f'{item_id}.glb'; export(obj, glb, item)
    png = directory / f'{item_id}.webp'; thumbnail(glb, png, item)
    receipt = {'id': item_id, **glb_stats(glb), 'sourceTriangles': source_tris, 'bakeSeconds': timings,
               'glbSHA256': hashlib.sha256(glb.read_bytes()).hexdigest(), 'thumbnailBytes': png.stat().st_size,
               'seconds': round(time.monotonic() - started, 1)}
    if install:
        PUBLIC.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(glb, PUBLIC / glb.name); shutil.copyfile(png, PUBLIC / png.name)
        receipt['installed'] = True
    (directory / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('GEAR_RECEIPT ' + json.dumps(receipt))
    return receipt


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ids = None; install = '--install' in argv
    if '--ids' in argv: ids = argv[argv.index('--ids') + 1].split(',')
    for item in CATALOGUE:
        if ids and item['id'] not in ids: continue
        build(item, install)
