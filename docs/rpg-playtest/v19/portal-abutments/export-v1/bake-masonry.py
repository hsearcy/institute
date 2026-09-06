"""High-to-low bake preserving reviewed masonry source coordinates.

Keep high-detail objects separate: their local coordinates and object colors
drive the reviewed stone shader. Only optimized destination geometry is joined.
Call prepare_bake, bake_channel for each map, then finish_bake through Blender MCP
so individual expensive steps remain observable. This staged baker writes a candidate; the canonical build entry point installs
the reviewed full-height variant after its complete bake.
"""
import json
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def triangle_count(objects):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects)


def projection_groups(sources, clearance=.25):
    """Color overlapping expanded bounds so rays cannot hit adjacent stones."""
    bounds = []
    groups = []
    for index, source in enumerate(sources):
        points = [source.matrix_world @ Vector(corner) for corner in source.bound_box]
        low = [min(p[axis] for p in points) for axis in range(3)]
        high = [max(p[axis] for p in points) for axis in range(3)]
        neighbors = {other for other, (bmin, bmax) in enumerate(bounds)
                     if all(low[axis] <= bmax[axis] + clearance
                            and high[axis] >= bmin[axis] - clearance for axis in range(3))}
        group = next((g for g in groups if not neighbors.intersection(g)), None)
        if group is None:
            group = []
            groups.append(group)
        group.append(index)
        bounds.append((low, high))
    return groups


def widen_subpixel_islands(mesh, minimum_extent):
    """Give isolated thin bevel charts enough width to receive bake samples.

    A long chart can have substantial area yet be narrower than one pixel.
    Stretch only that chart's narrow UV dimension before repacking; geometry,
    source coordinates and the material's physical scale are unchanged.
    """
    uv = mesh.uv_layers.active.data
    parents = list(range(len(mesh.polygons)))

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    shared = {}
    for face in mesh.polygons:
        for loop_index in face.loop_indices:
            point = uv[loop_index].uv
            key = (mesh.loops[loop_index].vertex_index, round(point.x, 7), round(point.y, 7))
            if key in shared:
                parents[root(face.index)] = root(shared[key])
            else:
                shared[key] = face.index
    islands = {}
    for face in mesh.polygons:
        islands.setdefault(root(face.index), []).extend(face.loop_indices)
    changed = 0
    for loops in islands.values():
        for axis in range(2):
            low = min(uv[i].uv[axis] for i in loops)
            high = max(uv[i].uv[axis] for i in loops)
            extent = high - low
            if 0 < extent < minimum_extent:
                center = (low + high) * .5
                for i in loops:
                    uv[i].uv[axis] = center + (uv[i].uv[axis] - center) * minimum_extent / extent
                changed += 1
    return changed


def prepare_bake(scene, source_collection, directory, size=1024, minimum_chart_pixels=0,
                 preserve_planar_normals=False, worked_faces_flat=False):
    if worked_faces_flat and not preserve_planar_normals:
        raise ValueError('Explicit worked-face normals require preserved bake normals')
    directory = Path(directory).resolve()
    if 'public' in directory.parts:
        raise ValueError('Review candidates must be exported outside public assets')
    directory.mkdir(parents=True, exist_ok=True)
    bpy.context.window.scene = scene
    sources = [o for o in source_collection.objects if o.type == 'MESH']
    if not sources:
        raise ValueError('No masonry source meshes')
    destination = bpy.data.collections.new('Masonry optimized review candidate')
    scene.collection.children.link(destination)
    lows = []
    bpy.context.view_layer.update()
    for source_id, source in enumerate(sources):
        low = source.copy()
        low.data = source.data.copy()
        attribute = low.data.attributes.new('masonry_source_id', 'INT', 'FACE')
        for value in attribute.data:
            value.value = source_id
        low.name = source.name + ' optimized'
        destination.objects.link(low)
        bpy.ops.object.select_all(action='DESELECT')
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        decimate = low.modifiers.new('Preserve silhouette, bake fine wear', 'DECIMATE')
        decimate.ratio = .65 if 'shaft' in source.name.lower() else .12
        decimate.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        if preserve_planar_normals:
            # Collapsing a bevel can spread its inherited smooth normals across
            # the entire worked face. Reconstruct the low mesh's face weighting
            # before the tangent-space bake, preserving the source silhouette.
            low.data.normals_split_custom_set([(0, 0, 0)] * len(low.data.loops))
            # Some collapsed bevels become direct wall-to-bottom edges. Their
            # old smooth flag must not let a larger horizontal face dictate one
            # corner of the smaller vertical face (the dark diagonal streak).
            low.data.set_sharp_from_angle(angle=math.radians(45))
            weighted = low.modifiers.new('Preserve broad worked stone planes', 'WEIGHTED_NORMAL')
            weighted.mode = 'FACE_AREA_WITH_ANGLE'
            weighted.weight = 50
            weighted.keep_sharp = True
            bpy.ops.object.modifier_apply(modifier=weighted.name)
            # A collapsed bevel can still carry a bottom-facing custom corner
            # normal on a broad vertical triangle. Sharp-edge reconstruction
            # alone does not repair those inherited normals in Blender 4.5.
            # Keep the weighted basis except for severe (>49 degree) departures
            # on real worked faces; tiny bevel facets retain their soft normals.
            normals = [tuple(n.vector) for n in low.data.corner_normals]
            repaired = 0
            for face in low.data.polygons:
                if face.area < .005:
                    continue
                for index in face.loop_indices:
                    # Opt-in for broad dressed portal/abutment planes. Preserve
                    # the curved shaft basis and every small worn bevel facet;
                    # the identical result is copied into projection batches.
                    if (worked_faces_flat and 'shaft' not in source.name.lower()
                            or Vector(normals[index]).dot(face.normal) < .65):
                        normals[index] = tuple(face.normal)
                        repaired += 1
            low.data.normals_split_custom_set(normals)
            if repaired:
                print('Repaired collapsed corner normals:', source.name, repaired)
        lows.append(low)
    bpy.ops.object.select_all(action='DESELECT')
    for low in lows:
        low.select_set(True)
    bpy.context.view_layer.objects.active = lows[0]
    bpy.ops.object.join()
    low = lows[0]
    low.name = 'WornPier_Review'
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=.008,
                             correct_aspect=True, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    if minimum_chart_pixels:
        widened = widen_subpixel_islands(low.data, minimum_chart_pixels / size)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=.006, margin_method='FRACTION')
        bpy.ops.object.mode_set(mode='OBJECT')
        print('Widened subpixel chart dimensions:', widened)

    runtime = bpy.data.materials.new('WornPier_BakedReview')
    runtime.use_nodes = True
    low.data.materials.clear()
    low.data.materials.append(runtime)
    for face in low.data.polygons:
        face.material_index = 0
    if preserve_planar_normals:
        # BMesh extraction below must retain the same corner basis as the final
        # exported mesh. Otherwise a compensating normal map is baked against a
        # different smooth surface from the one actually shipped.
        normals = [tuple(normal.vector) for normal in low.data.corner_normals]
        saved_normals = low.data.attributes.new('masonry_bake_normal', 'FLOAT_VECTOR', 'CORNER')
        for value, normal in zip(saved_normals.data, normals):
            value.vector = normal
    # Shared atlas, isolated projection sources. A single all-source bake can
    # project a .045m cage onto the next course across a .02m masonry joint.
    # Keep the original source positions/materials intact for procedural dirt.
    batches = []
    for ids in projection_groups(sources):
        data = low.data.copy()
        mesh = bmesh.new()
        mesh.from_mesh(data)
        layer = mesh.faces.layers.int.get('masonry_source_id')
        if layer is None:
            raise ValueError('Optimization lost source identity required for safe projection')
        bmesh.ops.delete(mesh, geom=[f for f in mesh.faces if f[layer] not in ids], context='FACES')
        loose = [v for v in mesh.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(mesh, geom=loose, context='VERTS')
        mesh.to_mesh(data)
        mesh.free()
        if preserve_planar_normals:
            saved_normals = data.attributes.get('masonry_bake_normal')
            if saved_normals is None:
                raise ValueError('Projection extraction lost the exported corner-normal basis')
            data.normals_split_custom_set([tuple(value.vector) for value in saved_normals.data])
            data.attributes.remove(saved_normals)
        obj = bpy.data.objects.new('Masonry bake projection group', data)
        destination.objects.link(obj)
        obj.matrix_world = low.matrix_world.copy()
        obj.visible_shadow = False
        obj.hide_render = True
        obj.hide_set(True)
        batches.append(([sources[i] for i in ids], obj))
    if preserve_planar_normals:
        low.data.attributes.remove(low.data.attributes['masonry_bake_normal'])
    low.hide_render = True
    low.hide_set(True)
    target = runtime.node_tree.nodes.new('ShaderNodeTexImage')
    target.name = 'MASONRY_BAKE_TARGET'
    images = {}
    for kind in ('albedo', 'normal', 'orm'):
        image = bpy.data.images.new('WornPier_' + kind, width=size, height=size, alpha=False)
        if kind != 'albedo':
            image.colorspace_settings.name = 'Non-Color'
        images[kind] = image

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 12
    scene.render.bake.margin = 5
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = .045
    scene.render.bake.max_ray_distance = .12
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    state = dict(scene=scene, sources=sources, low=low, destination=destination,
                 material=runtime, target=target, images=images, directory=directory,
                 completed=set(), source_triangles=triangle_count(sources), size=size,
                 batches=batches, channel_batches={})
    print('Prepared masonry bake:', state['source_triangles'], 'source triangles,',
          triangle_count([low]), 'destination triangles,', len(batches), 'projection groups')
    return state


def bake_channel(state, kind, batch_index=None):
    if kind not in ('albedo', 'normal', 'orm'):
        raise ValueError('Unknown channel: ' + kind)
    bpy.context.window.scene = state['scene']
    bpy.ops.object.select_all(action='DESELECT')
    for source in state['sources']:
        source.hide_set(False)
        source.hide_render = False
    nodes = state['material'].node_tree.nodes
    for node in nodes:
        node.select = False
    state['target'].image = state['images'][kind]
    state['target'].select = True
    nodes.active = state['target']

    restore = []
    try:
        if kind == 'orm':
            materials = {m for o in state['sources'] for m in o.data.materials}
            for material in materials:
                nodes = material.node_tree.nodes
                links = material.node_tree.links
                shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
                output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
                original = output.inputs['Surface'].links[0].from_socket
                emission = nodes.new('ShaderNodeEmission')
                combine = nodes.new('ShaderNodeCombineColor')
                combine.mode = 'RGB'
                ao = nodes.new('ShaderNodeAmbientOcclusion')
                ao.inputs['Distance'].default_value = .18
                ao.samples = 16
                links.new(ao.outputs['AO'], combine.inputs['Red'])
                for shader_name, channel in [('Roughness', 'Green'), ('Metallic', 'Blue')]:
                    socket = shader.inputs[shader_name]
                    if socket.is_linked:
                        links.new(socket.links[0].from_socket, combine.inputs[channel])
                    else:
                        combine.inputs[channel].default_value = socket.default_value
                links.new(combine.outputs['Color'], emission.inputs['Color'])
                links.new(emission.outputs[0], output.inputs['Surface'])
                restore.append((material, output, original, [emission, combine, ao]))
        indices = range(len(state['batches'])) if batch_index is None else [batch_index]
        finished = state['channel_batches'].setdefault(kind, set())
        for index in indices:
            if index in finished:
                continue
            sources, destination = state['batches'][index]
            bpy.ops.object.select_all(action='DESELECT')
            for source in sources:
                source.select_set(True)
            destination.hide_set(False)
            destination.hide_render = False
            destination.select_set(True)
            bpy.context.view_layer.objects.active = destination
            state['scene'].render.bake.use_clear = not finished
            try:
                bpy.ops.object.bake(type={'albedo': 'DIFFUSE', 'normal': 'NORMAL', 'orm': 'EMIT'}[kind])
                finished.add(index)
            finally:
                destination.hide_set(True)
                destination.hide_render = True
        if len(finished) == len(state['batches']):
            state['completed'].add(kind)
    finally:
        for material, output, original, temporary in restore:
            material.node_tree.links.new(original, output.inputs['Surface'])
            for node in temporary:
                material.node_tree.nodes.remove(node)
    print('Baked masonry', kind)


def finish_bake(state):
    if state['completed'] != {'albedo', 'normal', 'orm'}:
        raise ValueError('All three maps must finish before export')
    material = state['material']
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.remove(state['target'])
    shader = nodes.get('Principled BSDF')
    textures = {}
    for kind, image in state['images'].items():
        image.filepath_raw = str(state['directory'] / ('worn-pier-' + kind + '.png'))
        image.file_format = 'PNG'
        image.save()
        image.pack()
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        textures[kind] = texture
    links.new(textures['albedo'].outputs['Color'], shader.inputs['Base Color'])
    normal = nodes.new('ShaderNodeNormalMap')
    links.new(textures['normal'].outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    split = nodes.new('ShaderNodeSeparateColor')
    split.mode = 'RGB'
    links.new(textures['orm'].outputs['Color'], split.inputs[0])
    links.new(split.outputs['Green'], shader.inputs['Roughness'])
    links.new(split.outputs['Blue'], shader.inputs['Metallic'])
    ao_group = bpy.data.node_groups.get('glTF Material Output')
    if not ao_group:
        ao_group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        ao_group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    ao = nodes.new('ShaderNodeGroup')
    ao.node_tree = ao_group
    links.new(split.outputs['Red'], ao.inputs['Occlusion'])
    bpy.ops.object.select_all(action='DESELECT')
    for source in state['sources']:
        source.hide_render = True
        source.hide_set(True)
    for _, destination in state['batches']:
        data = destination.data
        bpy.data.objects.remove(destination, do_unlink=True)
        bpy.data.meshes.remove(data)
    state['low'].hide_set(False)
    state['low'].hide_render = False
    state['low'].select_set(True)
    bpy.context.view_layer.objects.active = state['low']
    output = state['directory'] / 'worn-pier-review.glb'
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB',
                             use_selection=True, use_active_scene=True, export_yup=True,
                             export_apply=True, export_animations=False, export_image_format='AUTO')
    report = dict(source_triangles=state['source_triangles'],
                  triangles=triangle_count([state['low']]), bytes=output.stat().st_size,
                  atlas=state['size'], source_objects_preserved=len(state['sources']))
    (state['directory'] / 'worn-pier-review.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
    return output
