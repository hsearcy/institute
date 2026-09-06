"""Isolated pointed-portal source study; never installs a public asset.

Reuses the reviewed pier's limestone shader, with a separate load-bearing
jamb/impost and radial, jointed archivolt. Blender Z is up.
"""
from pathlib import Path
import math
import random
import runpy

import bpy
import bmesh
from mathutils import Vector, noise


def build_masonry_portal(repo_root):
    root = Path(repo_root)
    builder = runpy.run_path(str(root / 'scripts/blender/detailed/masonry_pier.py'))
    scene, collection = builder['build_masonry_pier'](root)
    scene.name = 'Root recessed limestone portal study'
    collection.name = 'Portal source'
    # Retain the proven material node graphs, not any of the pier geometry.
    materials = {}
    for obj in list(collection.objects):
        for mat in obj.data.materials:
            materials.setdefault(mat.name.split('.')[0], mat)
        bpy.data.objects.remove(obj, do_unlink=True)
    stone = [materials['V2 limestone ' + str(i)] for i in range(3)]
    dressed = materials['Dressed shaft and trim']
    fracture = materials['Exposed limestone fracture']
    rng = random.Random(81360)

    def finish(obj, material, wear=.006):
        for old in list(obj.users_collection):
            old.objects.unlink(obj)
        collection.objects.link(obj)
        obj.data.materials.append(material)
        shade = rng.random()
        obj.color = (shade, shade, shade, 1)
        bpy.context.view_layer.objects.active = obj
        bevel = obj.modifiers.new('Worn dressed arris', 'BEVEL')
        bevel.width = .013
        bevel.segments = 3
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1, use_grid_fill=True)
        bm.normal_update()
        for vertex in bm.verts:
            point = obj.matrix_world @ vertex.co
            vertex.co += vertex.normal * noise.fractal(point * 7.1, .85, 2, 3) * wear
        bm.to_mesh(obj.data)
        bm.free()
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        normal = obj.modifiers.new('Broad stone planes', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
        normal.weight = 40
        bpy.ops.object.modifier_apply(modifier=normal.name)
        return obj

    def block(name, position, dimensions, material, wear=.006):
        bpy.ops.mesh.primitive_cube_add(size=1, location=position)
        obj = bpy.context.object
        obj.name = name
        obj.scale = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        return finish(obj, material, wear)

    spring = 2.70
    # Broad limestone abutments support the whole arch ring. The front molding
    # is cut into each bed, with joints matching the structural courses.
    for side in (-1, 1):
        for height, width, depth, z in [(.18, 1.02, 1.29, .09),
                                       (.13, .92, 1.17, .245),
                                       (.12, .80, 1.08, .37)]:
            block('Stepped portal plinth', (side * 1.91, .025, z),
                  (width, depth, height), dressed)
        course_heights = [.32, .39, .35, .40, .34, .30]
        z = .43
        for index, height in enumerate(course_heights):
            # Alternating through and divided stones describe a bonded jamb.
            if index % 2:
                for back in (-1, 1):
                    block('Bonded deep jamb', (side * 1.91, back * .235, z + height / 2),
                          (.76, .45, height - .014), stone[(index + (side > 0)) % 3])
            else:
                block('Through jamb bed', (side * 1.91, 0, z + height / 2),
                      (.76, .93, height - .014), stone[index % 3])
            # A single broad roll carries into the main archivolt, not a nest
            # of uninterrupted wire-like beads.
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.12,
                depth=height - .015, location=(side * 1.76, -.49, z + height / 2))
            roll = bpy.context.object
            roll.name = 'Jointed portal shaft'
            finish(roll, dressed, .002)
            z += height
        for height, width, depth in [(.09, .86, 1.04), (.08, .96, 1.15)]:
            block('Load-bearing impost', (side * 1.91, -.015, z + height / 2),
                  (width, depth, height), dressed, .004)
            z += height
        assert abs(z - spring) < .00001

    # Two-centred ogive, 3m opening, with radial joints through every profile.
    # Each voussoir is a closed solid with a recessed soffit and worked roll.
    # Cross-section pairs are radial offset and depth (front is negative Y).
    section = [(0, .47), (.62, .47), (.62, -.40), (.49, -.40),
               (.47, -.47), (.37, -.47), (.34, -.58), (.28, -.62),
               (.20, -.59), (.15, -.50), (.11, -.47), (0, -.47)]
    radius = 3.0
    for side in (-1, 1):
        for index in range(11):
            joint = .0015 + .0006 * (1 + math.sin(index * 2.3)) / 2
            start = index / 11 * math.pi / 3 + joint
            end = (math.acos(1.5 / (radius + .62)) + .003 if index == 10
                   else (index + 1) / 11 * math.pi / 3 - joint)
            points = []
            segments = 4
            for step in range(segments + 1):
                angle = start + (end - start) * step / segments
                for offset, depth in section:
                    r = radius + offset
                    points.append((side * (-1.5 + r * math.cos(angle)), depth,
                                   spring + r * math.sin(angle)))
            n = len(section)
            faces = [tuple(reversed(range(n))), tuple(segments * n + j for j in range(n))]
            for step in range(segments):
                for j in range(n):
                    faces.append((step * n + j, step * n + (j + 1) % n,
                                  (step + 1) * n + (j + 1) % n, (step + 1) * n + j))
            mesh = bpy.data.meshes.new('Radial stone with continuous worked section')
            mesh.from_pydata(points, [], faces)
            mesh.update()
            obj = bpy.data.objects.new('Jointed molded voussoir', mesh)
            collection.objects.link(obj)
            finish(obj, stone[(index + (side > 0)) % 3], .0035)
            # The two arcs intersect at the crown; clip their outer portions at
            # the true centre joint rather than leaving a doubled pointed tip.
            bm = bmesh.new()
            bm.from_mesh(mesh)
            result = bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                plane_co=(side * .004, 0, 0), plane_no=(side, 0, 0), dist=.000001, clear_inner=True)
            edges = [edge for edge in result['geom_cut'] if isinstance(edge, bmesh.types.BMEdge) and edge.is_boundary]
            if edges:
                bmesh.ops.holes_fill(bm, edges=edges, sides=0)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bm.to_mesh(mesh)
            bm.free()
            mesh.update()
    # Shelter history follows real recesses and the lower wall, rather than
    # adding equally dark noise to all worked faces. These are this study's
    # freshly constructed materials; no accepted pier material is modified.
    for material in [*stone, dressed]:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        shader = nodes.get('Principled BSDF')
        prior_color = shader.inputs['Base Color'].links[0].from_socket
        prior_roughness = shader.inputs['Roughness'].links[0].from_socket
        # Replace the pier's broad height ramp with localized portal history.
        for node in list(nodes):
            if node.bl_idname != 'ShaderNodeMapRange':
                continue
            maximum = node.inputs['From Max'].default_value
            if abs(maximum - 1.18) < .001:
                node.inputs['To Min'].default_value = 0
            elif abs(maximum - .85) < .001:
                node.inputs['To Min'].default_value = .88
        geo = nodes.new('ShaderNodeNewGeometry')
        xyz = nodes.new('ShaderNodeSeparateXYZ')
        links.new(geo.outputs['Position'], xyz.inputs[0])
        patch = nodes.new('ShaderNodeTexNoise')
        patch.inputs['Scale'].default_value = 3.1
        patch.inputs['Detail'].default_value = 2.4
        links.new(geo.outputs['Position'], patch.inputs['Vector'])
        ao = nodes.new('ShaderNodeAmbientOcclusion')
        ao.inputs['Distance'].default_value = .21
        ao.samples = 24
        recess = nodes.new('ShaderNodeMath')
        recess.operation = 'SUBTRACT'
        recess.inputs[0].default_value = 1
        links.new(ao.outputs['AO'], recess.inputs[1])
        def op(operation, a, b=None):
            node = nodes.new('ShaderNodeMath')
            node.operation = operation
            for index, value in enumerate([a] if b is None else [a, b]):
                if isinstance(value, (int, float)):
                    node.inputs[index].default_value = value
                else:
                    links.new(value, node.inputs[index])
            return node.outputs[0]

        def ramp(value, lower, upper, start=0, end=1):
            node = nodes.new('ShaderNodeMapRange')
            node.clamp = True
            node.inputs['From Min'].default_value = lower
            node.inputs['From Max'].default_value = upper
            node.inputs['To Min'].default_value = start
            node.inputs['To Max'].default_value = end
            links.new(value, node.inputs['Value'])
            return node.outputs['Result']

        x, y, height = xyz.outputs['X'], xyz.outputs['Y'], xyz.outputs['Z']
        # Follow one actual recessed radial channel in the carved section.
        radial_x = op('ADD', op('ABSOLUTE', x), 1.5)
        radial_z = op('SUBTRACT', height, spring)
        radius_at_surface = op('SQRT', op('ADD', op('MULTIPLY', radial_x, radial_x),
                                         op('MULTIPLY', radial_z, radial_z)))
        channel = ramp(op('ABSOLUTE', op('SUBTRACT', radius_at_surface, 3.405)), 0, .070, .85, 0)
        front = ramp(y, -.46, -.425, 1, 0)
        above_impost = ramp(height, spring + .025, spring + .13)
        broken = ramp(patch.outputs['Fac'], .42, .62, .05, 1)
        channel_deposit = op('MULTIPLY', op('MULTIPLY', channel, front),
                            op('MULTIPLY', above_impost, broken))
        # A short, unequal streak below the left impost joins a sheltered joint.
        streak_width = op('ADD', .035, op('MULTIPLY', patch.outputs['Fac'], .025))
        streak_x = ramp(op('DIVIDE', op('ABSOLUTE', op('ADD', x, 1.86)), streak_width), 0, 1, .7, 0)
        streak_z = op('MULTIPLY', ramp(height, 1.62, 2.15), ramp(height, 2.58, 2.70, 1, 0))
        streak = op('MULTIPLY', op('MULTIPLY', streak_x, streak_z), front)
        # One patch crosses several lower joints, with a noisy irregular top.
        lower_noise = nodes.new('ShaderNodeTexNoise')
        lower_noise.inputs['Scale'].default_value = 1.85
        lower_noise.inputs['Detail'].default_value = 3
        links.new(geo.outputs['Position'], lower_noise.inputs['Vector'])
        low_patch = op('MULTIPLY', ramp(lower_noise.outputs['Fac'], .44, .61),
                       ramp(height, .35, 1.18, .75, 0))
        low_patch = op('MULTIPLY', low_patch, ramp(x, -.4, .7, 1, .28))
        shelter_mask = op('MULTIPLY', recess.outputs[0], op('MULTIPLY', broken, .45))
        mask = op('MAXIMUM', op('MAXIMUM', channel_deposit, streak),
                  op('MAXIMUM', low_patch, shelter_mask))
        age = nodes.new('ShaderNodeMixRGB')
        links.new(mask, age.inputs[0])
        links.new(prior_color, age.inputs[1])
        age.inputs[2].default_value = (.026, .029, .022, 1)
        links.new(age.outputs[0], shader.inputs['Base Color'])
        rough = nodes.new('ShaderNodeMath')
        rough.operation = 'MAXIMUM'
        links.new(prior_roughness, rough.inputs[0])
        links.new(mask, rough.inputs[1])
        links.new(rough.outputs[0], shader.inputs['Roughness'])
    scene['portal_study_only'] = True
    print('Portal source:', len(collection.objects), 'objects')
    return scene, collection
