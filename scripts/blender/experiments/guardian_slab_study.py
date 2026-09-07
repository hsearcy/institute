"""Isolated guardian construction study; never writes public assets.

Preserves the detailed guardian's named rigid pivots. Broad interlocking slabs,
an embedded head and unequal mineral beds are reviewed before any low/bake work.
Invoke build() once, then render() in separately coordinated Blender windows.
"""
from pathlib import Path
import json
import math
import random
import bpy
import bmesh
from mathutils import Vector, Euler


def build(root='/home/houston/git/institute', version='v1'):
    root = Path(root)
    previous = bpy.context.window.scene
    scene = bpy.data.scenes.new('Guardian slab study ' + version)
    try:
        bpy.context.window.scene = scene
        ns = {'RPG_REPO_ROOT': root}
        for name in ('common.py', 'detailed/materials.py', 'detailed/geometry.py', 'detailed/characters.py'):
            path = root / 'scripts/blender' / name
            exec(compile(path.read_text(), str(path), 'exec'), ns)
            if name == 'detailed/materials.py':
                ns['MATS'].update(ns['detailed_materials']())
        random.seed(711)
        collection = ns['begin']('guardian-slab-' + version)
        original_line = ns['line']

        def closed_line(*args, **kwargs):
            obj = original_line(*args, **kwargs)
            bm = bmesh.new(); bm.from_mesh(obj.data)
            boundary = [edge for edge in bm.edges if edge.is_boundary]
            if boundary: bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(obj.data); bm.free()
            return obj

        ns['line'] = closed_line
        pivots = {'Body': (0, .08, 1.18), 'Head': (0, -.13, 1.83)}
        for label, side in [('L', -1), ('R', 1)]:
            pivots.update({'ArmUpper' + label: (side * .60, .04, 1.70),
                           'ArmLower' + label: (side * .80, -.06, 1.15),
                           'LegUpper' + label: (side * .27, .04, .86),
                           'LegLower' + label: (side * .36, -.08, .46)})
        collection['enemyPivots'] = pivots
        collection['status'] = 'Source candidate; no source/export/native acceptance yet'
        collection['sourceVersion'] = version
        collection['sourceReference'] = 'docs/concepts/math-dungeon-rpg/04-horde-viewport.png'

        # Broad faces stay quiet. Actual planes/bevels carry the mineral shape;
        # grain is shallow, without the previous strong procedural relief.
        for key, color in [('stoneOld', (.115, .108, .088)),
                           ('stoneOldLight', (.185, .170, .128)),
                           ('stoneOldDark', (.045, .050, .044))]:
            material = ns['mat'](key + ' slab ' + version, color, 0, .86)
            ns['MATS'][key] = material
            nodes, links = material.node_tree.nodes, material.node_tree.links
            p = nodes.get('Principled BSDF')
            p.inputs['Specular IOR Level'].default_value = .25
            position = nodes.new('ShaderNodeNewGeometry')
            broad = nodes.new('ShaderNodeTexNoise'); broad.inputs['Scale'].default_value = 3.4
            broad.inputs['Detail'].default_value = 2
            links.new(position.outputs['Position'], broad.inputs['Vector'])
            ramp = nodes.new('ShaderNodeValToRGB')
            ramp.color_ramp.elements[0].color = (*(v * .72 for v in color), 1)
            ramp.color_ramp.elements[1].color = (*(v * 1.22 for v in color), 1)
            links.new(broad.outputs['Fac'], ramp.inputs[0]); links.new(ramp.outputs['Color'], p.inputs['Base Color'])
            grain = nodes.new('ShaderNodeTexNoise'); grain.inputs['Scale'].default_value = 43
            grain.inputs['Detail'].default_value = 2
            links.new(position.outputs['Position'], grain.inputs['Vector'])
            bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .24
            bump.inputs['Distance'].default_value = .003
            links.new(grain.outputs['Fac'], bump.inputs['Height']); links.new(bump.outputs['Normal'], p.inputs['Normal'])
        ns['mat']('mineralEye', (.025, .30, .43), 0, .3, .85)

        def part(label):
            ns['PART'] = label

        def rock(name, center, size, material='stoneOldDark', turn=(0, 0, 0)):
            # Retain the established closed fractured-joint construction.
            return ns['guardian_rock'](name, center, size, material, turn)

        def slab(name, center, outline, depth, material='stoneOld', turn=(0, 0, 0), ridge=.035, fractured=False):
            """Closed asymmetric wedge with a few broad cleavage faces."""
            n = len(outline)
            vertices = [(x, -depth / 2, z) for x, z in outline]
            vertices += [(x * .86, depth / 2, z * .92) for x, z in outline]
            if fractured:
                # One continuous oblique cleavage face; avoid the repeated
                # radial triangle fan that made the first study toy-like.
                for i, (x, y, z) in enumerate(vertices[:n]):
                    vertices[i] = (x, y + x * .10 + z * .06, z)
                faces = [tuple(reversed(range(n)))]
            else:
                vertices += [(0, -depth / 2 - ridge, .025)]
                faces = [(i, (i + 1) % n, n * 2) for i in range(n)]
            faces += [tuple(range(n, 2 * n))]
            faces += [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)]
            obj = ns['mesh'](name, vertices, faces, material)
            bm = bmesh.new(); bm.from_mesh(obj.data)
            if fractured:
                sign = -1 if sum(ord(c) for c in name) % 2 else 1
                cuts = [((sign * .9, -.55, .65), .13), ((-sign * .25, .85, .9), .075)]
                if name == 'Dominant shoulder wedge L':
                    cuts[0] = ((-.55, -1, .30), .235)
                for normal, fraction in cuts:
                    normal = Vector(normal).normalized()
                    projected = [v.co.dot(normal) for v in bm.verts]
                    distance = max(projected) - (max(projected) - min(projected)) * fraction
                    cut = bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                                                  dist=.00001, plane_co=normal * distance, plane_no=normal,
                                                  clear_outer=True, clear_inner=False)
                    boundary = [e for e in cut['geom_cut'] if isinstance(e, bmesh.types.BMEdge) and e.is_boundary]
                    if boundary: bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(obj.data); bm.free()
            obj.location = center; obj.rotation_euler = turn
            ns['bevel'](obj, .007, 2)
            for face in obj.data.polygons:
                face.use_smooth = False
            obj['construction'] = 'Closed fitted cleavage wedge'
            return obj

        def cleaved_rock(name, center, outline, depth, front_offsets, material='stoneOld', turn=(0, 0, 0)):
            """Unequal convex cleavage planes with independent front/back extents."""
            points = [(x, -depth / 2 + front_offsets[i], z) for i, (x, z) in enumerate(outline)]
            points += [(x * .79 + .025, depth / 2 + .016 * math.sin(i * 2.3), z * .84 - .014)
                       for i, (x, z) in enumerate(outline)]
            bm = bmesh.new()
            for point in points: bm.verts.new(point)
            bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
            # The hull may retain unused input vertices; remove only those
            # unconnected points of this newly created construction mesh.
            loose = [v for v in bm.verts if not v.link_faces]
            if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            mesh = bpy.data.meshes.new(name); bm.to_mesh(mesh); bm.free()
            obj = bpy.data.objects.new(name, mesh); collection.objects.link(obj)
            obj.data.materials.append(ns['MATS'][material]); obj['part'] = ns['PART']
            obj.location = center; obj.rotation_euler = turn
            ns['bevel'](obj, .005, 2)
            obj['construction'] = 'Closed irregular cleaved rock volume'
            return obj

        # The back/torso supports a shoulder arch instead of a stack of equal
        # abdominal pebbles. Chest leaves the articulated head visibly recessed.
        part('Body')
        rock('Continuous hunched bedrock', (0, .14, 1.40), (.48, .32, .57))
        slab('Dorsal keystone', (0, .27, 1.79), [(-.39, -.25), (.35, -.28), (.46, .06), (.20, .32), (-.25, .28), (-.45, .04)], .30, 'stoneOld', (.10, 0, 0), fractured=True)
        rock('Recessed pelvis bridge', (0, .04, .90), (.33, .24, .24))
        slab('Dominant diagonal chest mass', (-.16, -.115, 1.51), [(-.44, .02), (-.26, -.20), (.24, -.31), (.36, -.10), (.18, .08), (-.33, .24)], .34, 'stoneOld', (.07, -.06, -.08), fractured=True)
        slab('Opposing clavicular lock', (.27, -.165, 1.67), [(-.22, -.13), (.12, -.22), (.29, -.035), (.17, .20), (-.10, .18), (-.25, .045)], .29, 'stoneOldLight', (.03, .18, .06), fractured=True)
        slab('Oblique abdominal shield', (.025, -.20, 1.13), [(-.25, -.19), (.19, -.16), (.27, .04), (.10, .19), (-.22, .13)], .20, 'stoneOld', (.02, .10, -.12), fractured=True)
        # Embedded asymmetric dorsal crystal beds, not a continuous crown comb.
        for loc, radius, height, tilt in [((-.27, .35, 1.93), .135, .48, (-.38, -.32, .1)),
                                          ((-.10, .38, 1.90), .075, .31, (-.25, .16, -.2)),
                                          ((.27, .30, 1.91), .11, .36, (-.2, .40, .15))]:
            ns['guardian_crystal']('Embedded dorsal mineral', loc, radius, height, tilt)

        for label, side in [('L', -1), ('R', 1)]:
            part('LegUpper' + label)
            rock('Deep hip joint ' + label, (side * .285, .035, .76), (.17, .19, .24))
            slab('Long thigh plate ' + label, (side * .32, -.07, .73), [(-.16, -.22), (.14, -.20), (.18, .10), (.09, .24), (-.17, .16)], .25, 'stoneOld', (.08, side * .10, side * .06))
            part('LegLower' + label)
            slab('Knee and shin shield ' + label, (side * .36, -.055, .35), [(-.17, -.22), (.16, -.22), (.18, .12), (.08, .25), (-.17, .18)], .30, 'stoneOldLight', (.05, 0, 0))
            rock('Planted heel ' + label, (side * .36, -.015, .115), (.215, .23, .115))
            slab('Broad grounded forefoot ' + label, (side * .36, -.24, .105), [(-.22, -.095), (.22, -.095), (.21, .055), (.09, .12), (-.15, .10)], .32, 'stoneOld')
            # One shallow offset toe fault preserves a broad foot silhouette.
            ns['line']('Forefoot split ' + label, [(side * .36 + .035, -.405, .035), (side * .36 + .023, -.405, .12)], .006, 'shadow', 4)

            part('ArmUpper' + label)
            rock('Inset shoulder joint ' + label, (side * .60, .045, 1.67), (.24, .25, .29))
            outline = ([(-.39, -.10), (-.23, -.31), (.23, -.21), (.38, .12), (.06, .35), (-.31, .25)] if side < 0
                       else [(-.29, -.18), (.10, -.23), (.31, -.02), (.23, .20), (-.08, .27), (-.28, .09)])
            shoulder_z = 1.84 if side < 0 else 1.69
            # One dominant oblique left slab overlaps the diagonal chest.
            # The smaller opposing wedges lock around, rather than flank,
            # the deeply embedded head. Existing anatomical pivots remain.
            shoulder = (cleaved_rock('Dominant oblique shoulder rock L', (-.61, .015, 1.84),
                            [(-.39, -.055), (-.24, -.27), (.13, -.23), (.38, -.035), (.29, .19), (.045, .30), (-.25, .215)],
                            .52, [.04, -.018, -.025, .015, -.005, .055, -.035], 'stoneOldLight', (.10, -.20, -.20))
                        if side < 0 else slab('Dominant shoulder wedge ' + label, (side * .61, -.015, shoulder_z), outline,
                            .43, 'stoneOld', (.10, side * .24, side * .16), fractured=True))
            rock('Tapering upper arm ' + label, (side * .72, .01, 1.38), (.18, .18, .27))
            bed_z = 2.075 if side < 0 else 1.94
            # Carve the split into the shoulder itself. The only removed
            # object is this freshly created Boolean cutter, never an existing
            # source object or another task's scene/data.
            cx = side * .60
            if side < 0:
                # A rear/outer fracture exits the side at unequal depths. The
                # front remains a broad oblique rock face, not two roof peaks.
                cut_vertices = [(-1.10, -.035, 1.965), (-.51, -.012, 2.025),
                                (-.47, .36, 1.995), (-1.10, .34, 1.91),
                                (-1.10, -.035, 2.48), (-.51, -.012, 2.48),
                                (-.47, .36, 2.48), (-1.10, .34, 2.48)]
            else:
                cut_vertices = [(cx + x, y, z) for x, y, z in
                                [(-.026, -.015, bed_z - .16), (.24, .04, bed_z - .09),
                                 (.24, .31, bed_z - .14), (-.026, .28, bed_z - .18),
                                 (-.06, -.015, bed_z + .24), (.34, .04, bed_z + .24),
                                 (.34, .31, bed_z + .24), (-.06, .28, bed_z + .24)]]
            cutter = ns['mesh']('Temporary new mineral cleft cutter', cut_vertices,
                               [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], 'shadow')
            bpy.context.view_layer.update(); bpy.context.view_layer.objects.active = shoulder
            modifier = shoulder.modifiers.new('Actual irregular split mineral bed', 'BOOLEAN')
            modifier.operation = 'DIFFERENCE'; modifier.solver = 'EXACT'; modifier.object = cutter
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            bpy.data.objects.remove(cutter, do_unlink=True)
            for index, (radius, height) in enumerate([(.145, .48 if side < 0 else .37), (.085, .27)]):
                ns['guardian_crystal']('Shoulder mineral bed ' + label,
                                      (side * (.59 + index * .11), .055 + index * .09, bed_z - .14 - index * .025),
                                      radius, height, (.10, side * (.24 + .36 * index), side * .12))

            part('ArmLower' + label)
            rock('Deep elbow pivot ' + label, (side * .80, -.04, 1.15), (.17, .17, .17))
            slab('Tapered heavy forearm ' + label, (side * .86, -.15, 1.01), [(-.23, -.25), (.23, -.20), (.25, .11), (.08, .27), (-.18, .19)], .39, 'stoneOld', (.08, side * .16, side * .06), .045)
            rock('Clenched hand mass ' + label, (side * .875, -.24, .77), (.23, .23, .17), 'stoneOldDark')
            slab('Knuckle ridge ' + label, (side * .875, -.375, .82), [(-.23, -.07), (.22, -.08), (.20, .08), (.04, .11), (-.20, .08)], .12, 'stoneOldLight', (.08, 0, side * .05))
            rock('Opposed thumb ' + label, (side * .67, -.29, .78), (.095, .13, .12), 'stoneOld', (0, side * .32, 0))
            ns['guardian_crystal']('Embedded forearm shard ' + label, (side * 1.015, -.035, 1.10), .10, .29, (.25, side * .65, 0))

        part('Head')
        # Two unequal natural stone volumes form a partial recess. There is no
        # perimeter shell/visor ring and no attached eyebrow or muzzle bars.
        cleaved_rock('Overhanging irregular brow rock', (-.012, -.205, 2.022),
                     [(-.24, -.004), (-.14, -.013), (.015, .006), (.14, -.008), (.218, .036),
                      (.145, .14), (-.027, .185), (-.218, .118), (-.272, .039)],
                     .315, [.015, -.012, .014, -.009, .045, -.002, .020, -.015, .035],
                     'stoneOld', (.025, -.045, -.03))
        cleaved_rock('Offset broken cheek and jaw stone', (.026, -.185, 1.83),
                     [(-.205, .108), (-.16, -.018), (-.035, -.092), (.12, -.048),
                      (.194, .035), (.144, .128), (.005, .105), (-.091, .125)],
                     .30, [.019, -.018, .025, -.030, .020, -.008, .010, .012],
                     'stoneOld', (.015, .08, -.055))
        cleaved_rock('Recessed continuous facial bed', (.008, -.291, 1.971),
                     [(-.18, -.022), (-.115, -.061), (.115, -.047), (.186, .012),
                      (.135, .068), (-.072, .065), (-.178, .028)],
                     .105, [.004, .012, .006, -.004, .009, .003, -.002], 'stoneOldDark')
        for side in (-1, 1):
            ns['sphere']('Narrow inset mineral glimmer', (side * .102, -.350, 1.982 if side < 0 else 1.980),
                         (.039, .010, .008), 'mineralEye', 12, 8)
        bpy.context.view_layer.update()
        report = audit(collection)
        collection['sourceTriangles'] = report['triangles']
        return scene, collection, report
    finally:
        bpy.context.window.scene = previous


def audit(collection):
    objects = [o for o in collection.objects if o.type == 'MESH']
    result = {'objects': len(objects), 'triangles': 0, 'parts': {}, 'invalid': []}
    minimum, maximum = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        bm = bmesh.new(); bm.from_mesh(obj.data)
        bad = not all(e.is_manifold for e in bm.edges) or bm.calc_volume(signed=True) <= 0
        if bad: result['invalid'].append(obj.name)
        bm.free()
        result['triangles'] += sum(len(p.vertices) - 2 for p in obj.data.polygons)
        part = obj.get('part', 'MISSING'); result['parts'][part] = result['parts'].get(part, 0) + 1
        for vertex in obj.data.vertices:
            p = obj.matrix_world @ vertex.co
            for i in range(3): minimum[i] = min(minimum[i], p[i]); maximum[i] = max(maximum[i], p[i])
    result['bounds'] = [list(minimum), list(maximum)]
    # Retain both full-mesh and structural reports so a decorative defect
    # cannot be mistaken for a complete export-validity pass.
    result['invalidStructural'] = [o.name for o in objects if o.get('construction') and o.name in result['invalid']]
    if result['invalidStructural']: raise ValueError(result['invalidStructural'])
    return result


def render(scene, output, view='high'):
    previous = bpy.context.window.scene
    try:
        bpy.context.window.scene = scene
        target = Vector((0, -.02, 1.28))
        if not scene.camera:
            camera = bpy.data.objects.new('Guardian source camera', bpy.data.cameras.new('Guardian source camera'))
            scene.collection.objects.link(camera); camera.data.type = 'ORTHO'; scene.camera = camera
            for name, location, power, color, size in [('key', (-3, -4, 6), 650, (1, .91, .79), 4), ('fill', (4, -1, 4), 400, (.80, .89, 1), 3), ('rim', (-1, 4, 5), 600, (.67, .80, 1), 3)]:
                data = bpy.data.lights.new('Guardian ' + name, 'AREA'); data.energy = power; data.color = color; data.size = size
                light = bpy.data.objects.new(data.name, data); scene.collection.objects.link(light); light.location = location
                light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
            world = bpy.data.worlds.new('Guardian neutral source backdrop'); world.use_nodes = True
            world.node_tree.nodes['Background'].inputs['Color'].default_value = (.11, .13, .16, 1)
            world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35; scene.world = world
        camera = scene.camera
        camera.location = (3.2, -5.5, 5.8) if view == 'high' else (-3.0, 5.5, 3.6) if view == 'back' else (1.8, -6, 2.4)
        camera.data.ortho_scale = 3.2
        if view == 'head': target = Vector((0, -.08, 1.9)); camera.location = (1.6, -4, 3.0); camera.data.ortho_scale = 1.55
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.use_denoising = True
        scene.render.resolution_x = 768; scene.render.resolution_y = 768; scene.render.resolution_percentage = 100
        scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
        scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
    finally:
        bpy.context.window.scene = previous
