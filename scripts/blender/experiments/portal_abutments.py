"""Uninstalled portal abutment study. Preserve reviewed arch; bond new wall to it.

Oblique fracture faces cross the wall depth at a few outer corner stones;
intact beds remain level. Base materials reuse the portal node graphs and
localized history. Exposed fracture faces receive their own value/roughness.
"""
from pathlib import Path
import math
import random
import runpy

import bpy
import bmesh
from mathutils import Vector, noise


def build_portal_abutments(repo_root):
    root = Path(repo_root)
    portal = runpy.run_path(str(root / 'scripts/blender/experiments/masonry_portal.py'))
    scene, collection = portal['build_masonry_portal'](root)
    scene.name = 'Root bonded portal abutment source v4'
    materials = {}
    for obj in collection.objects:
        for mat in obj.data.materials:
            materials.setdefault(mat.name.split('.')[0], mat)
    stones = [materials['V2 limestone ' + str(i)] for i in range(3)]
    fracture = stones[0].copy()
    fracture.name = 'Exposed abutment fracture'
    nodes, links = fracture.node_tree.nodes, fracture.node_tree.links
    shader = nodes.get('Principled BSDF')
    original_color = shader.inputs['Base Color'].links[0].from_socket
    exposed = nodes.new('ShaderNodeMixRGB')
    exposed.inputs[0].default_value = .16
    exposed.inputs[2].default_value = (.23, .225, .20, 1)
    links.new(original_color, exposed.inputs[1])
    links.new(exposed.outputs[0], shader.inputs['Base Color'])
    original_roughness = shader.inputs['Roughness'].links[0].from_socket
    rough = nodes.new('ShaderNodeMath')
    rough.operation = 'MAXIMUM'
    rough.inputs[1].default_value = .95
    links.new(original_roughness, rough.inputs[0])
    links.new(rough.outputs[0], shader.inputs['Roughness'])
    for node in nodes:
        if node.bl_idname == 'ShaderNodeBump':
            node.inputs['Distance'].default_value *= 1.5
    rng = random.Random(83145)
    beds = [0, .18, .31, .43, .75, 1.14, 1.49, 1.89, 2.23, 2.53, 2.70, 3.08, 3.50, 3.90, 4.31, 4.69, 5.08, 5.35]
    created = []

    def outer_edge(z):
        if z < .43:
            return 2.425
        if z < 2.53:
            return 2.29
        if z < 2.70:
            return 2.40
        return max(0, math.sqrt(max(0, 3.62 ** 2 - (z - 2.70) ** 2)) - 1.5) + .006

    def stone(side, start, end, bottom, top, inner, index):
        # The first block is scribed to the jointed arch's true outer profile.
        boundary = lambda z: outer_edge(z) - .002 if inner else start + .012
        steps = 4 if inner and bottom >= 2.7 else 1
        front = -.43 if end <= 3.12 + .001 else -.27
        if top <= .43 or bottom >= 2.53 and top <= 2.70:
            front -= .095
        back = .47
        points = [(boundary(bottom), bottom), (end - .012, bottom), (end - .012, top)]
        points += [(boundary(top - (top-bottom)*j/steps), top - (top-bottom)*j/steps)
                   for j in range(steps + 1)]
        # Remove coincident closure before making the closed solid.
        if (Vector(points[0]) - Vector(points[-1])).length < 1e-7:
            points.pop()
        count = len(points)
        verts = [(side*x, depth, z) for depth in (front, back) for x, z in points]
        faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
        faces += [(i, (i+1) % count, (i+1) % count + count, i+count) for i in range(count)]
        mesh = bpy.data.meshes.new('Bonded arch spandrel bed')
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new('Portal wall bonded bed %s %02d' % (side, index), mesh)
        collection.objects.link(obj)
        obj.data.materials.append(stones[index % 3])
        obj.data.materials.append(fracture)
        shade = rng.random()
        obj.color = (shade, shade, shade, 1)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        # Each fracture crosses both the course and the depth. These are local
        # corner losses; most of the coping and all supporting beds stay level.
        cuts = [((side * 4.42, .12, 5.30 if side > 0 else 5.19),
                 (side * 1.10, .78 if side > 0 else -.47, 1)),
                ((side * 4.68, -.27, 5.14 if side > 0 else 5.02),
                 (side * .45, -1.45 if side > 0 else .87, 1)),
                # A small secondary facet breaks the front lip of the outer
                # loss, without cutting into another intact supporting bed.
                ((side * 4.73, -.23, 5.10), (side * .80, -.65, .55)),
                # Clip the unsupported back tip where the top spandrel meets
                # the arch. The front contact and full bed remain unchanged.
                ((side * 1.07, .53, 5.30), (-side * .60, 1, 1))]
        for co, normal in cuts:
            result = bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                plane_co=co, plane_no=normal, dist=.00001, clear_outer=True)
            edges = [edge for edge in result['geom_cut'] if isinstance(edge, bmesh.types.BMEdge) and edge.is_boundary]
            if edges:
                filled = bmesh.ops.holes_fill(bm, edges=edges, sides=0)
                for face in filled['faces']:
                    face.material_index = 1
        if not bm.faces:
            bm.free()
            bpy.data.objects.remove(obj, do_unlink=True)
            return
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        bpy.context.view_layer.objects.active = obj
        bevel = obj.modifiers.new('Worked joint shoulders', 'BEVEL')
        bevel.width = .011
        bevel.segments = 3
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1, use_grid_fill=True)
        bm.normal_update()
        for vertex in bm.verts:
            vertex.co += vertex.normal * noise.fractal(vertex.co * 9.7, .8, 2, 3) * .0035
        bm.to_mesh(mesh)
        bm.free()
        for face in mesh.polygons:
            face.use_smooth = True
        normals = obj.modifiers.new('Dressed stone plane normals', 'WEIGHTED_NORMAL')
        normals.keep_sharp = True
        normals.weight = 40
        bpy.ops.object.modifier_apply(modifier=normals.name)
        created.append(obj)

    for side in (-1, 1):
        index = 0
        for row in range(len(beds)-1):
            bottom, top = beds[row]+.014, beds[row+1]-.014
            start = max(outer_edge(bottom), outer_edge(top))+.012
            joints = [start]
            # Fixed return at3.12 stays aligned through every course; ordinary
            # bond joints stagger on either side, never move that return edge.
            for stop in (3.12, 4.8):
                if stop <= start+.12:
                    continue
                span = stop-joints[-1]
                count = max(1, round(span/.75))
                origin = joints[-1]
                for j in range(1, count):
                    joints.append(origin + span*j/count + (.08 if row % 2 else -.08))
                joints.append(stop)
            for j in range(len(joints)-1):
                stone(side, joints[j], joints[j+1], bottom, top, j == 0, index)
                index += 1
    scene['portal_abutment_study_only'] = True
    scene['portal_abutment_wall_objects'] = len(created)
    print('Portal abutments:', len(created), 'wall objects; total', len(collection.objects))
    return scene, collection


def render_portal_abutments(scene, output, *, render_still=True):
    """One neutral elevated source review; no world-lighting or camera changes."""
    caller = bpy.context.window.scene
    try:
        bpy.context.window.scene = scene
        target = Vector((0, 0, 2.62))
        world = bpy.data.worlds.new('Portal abutment neutral review world')
        world.use_nodes = True
        scene.world = world
        world.node_tree.nodes['Background'].inputs[0].default_value = (.12, .15, .18, 1)
        world.node_tree.nodes['Background'].inputs[1].default_value = .25
        bpy.ops.mesh.primitive_plane_add(size=100, location=(0, 0, -.04))
        ground = bpy.context.object
        ground.name = 'AbutmentReview_Ground'
        material = bpy.data.materials.new('Abutment review ground')
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (.023, .03, .033, 1)
        shader.inputs['Roughness'].default_value = .92
        ground.data.materials.append(material)
        bpy.ops.object.camera_add()
        scene.camera = bpy.context.object
        scene.camera.data.type = 'ORTHO'
        scene.camera.data.ortho_scale = 10.6
        scene.camera.location = target + Vector((17, -20, 25))*.3
        scene.camera.rotation_euler = (target-scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
        for position, power, color, size in [((-3,-4,7),900,(1,.90,.76),4),
                                             ((4,2,6),700,(.50,.68,.82),4),
                                             ((0,-5,3),200,(.9,.94,1),5)]:
            bpy.ops.object.light_add(type='AREA', location=position)
            light = bpy.context.object
            light.data.energy = power
            light.data.color = color
            light.data.shape = 'DISK'
            light.data.size = size
            light.rotation_euler = (target-light.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 16
        scene.cycles.use_denoising = True
        scene.render.resolution_x = 1200
        scene.render.resolution_y = 900
        scene.render.resolution_percentage = 100
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = 'AgX - Medium High Contrast'
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = str(Path(output).resolve())
        if render_still:
            bpy.ops.render.render(write_still=True)
    finally:
        bpy.context.window.scene = caller


def audit_portal_abutments(collection):
    """Check the authored closed solids before any reduction or texture bake."""
    failures = []
    triangles = 0
    fracture_faces = 0
    points = []
    for obj in collection.objects:
        if obj.type != 'MESH':
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        boundary = sum(edge.is_boundary for edge in bm.edges)
        nonmanifold = sum(not edge.is_manifold for edge in bm.edges)
        zero_area = sum(face.calc_area() < 1e-12 for face in bm.faces)
        volume = bm.calc_volume(signed=True)
        if boundary or nonmanifold or zero_area or volume <= 0:
            failures.append({'object': obj.name, 'boundaryEdges': boundary,
                             'nonmanifoldEdges': nonmanifold, 'zeroAreaFaces': zero_area,
                             'signedVolume': volume})
        triangles += sum(len(face.verts)-2 for face in bm.faces)
        if obj.name.startswith('Portal wall bonded bed'):
            fracture_faces += sum(face.material_index == 1 for face in bm.faces)
        bm.free()
        points += [obj.matrix_world @ Vector(point) for point in obj.bound_box]
    return {'objects': len(collection.objects), 'triangles': triangles,
            'fractureFaces': fracture_faces, 'failures': failures,
            'bounds': {'min': [min(p[i] for p in points) for i in range(3)],
                       'max': [max(p[i] for p in points) for i in range(3)]}}


def render_portal_abutment_detail(scene, output, view):
    """Review existing source from behind or at the fitted outer arch joint."""
    config = {
        'rear': ((0, 0, 2.70), (-17, 20, 25), 11.8, (1200, 900)),
        'joint': ((-1.69, -.08, 3.75), (-10, -20, 15), 3.7, (900, 900)),
    }[view]
    target, direction, scale, resolution = config
    caller = bpy.context.window.scene
    camera = scene.camera
    saved = (camera.matrix_world.copy(), camera.data.ortho_scale,
             scene.render.resolution_x, scene.render.resolution_y, scene.render.filepath)
    try:
        bpy.context.window.scene = scene
        target = Vector(target)
        camera.location = target + Vector(direction)*.3
        camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = scale
        scene.render.resolution_x, scene.render.resolution_y = resolution
        scene.render.filepath = str(Path(output).resolve())
        bpy.ops.render.render(write_still=True)
    finally:
        camera.matrix_world, camera.data.ortho_scale = saved[:2]
        scene.render.resolution_x, scene.render.resolution_y, scene.render.filepath = saved[2:]
        bpy.context.window.scene = caller
