"""Observable candidate-only bake of the reviewed bonded portal source.

Invoke individual stages through Blender MCP. Source materials retain their
object coordinates, and every stage restores the caller's active scene.
"""
import json
from pathlib import Path
import runpy
import time

import bpy
import bmesh


ROOT = Path(__file__).resolve().parents[3]
KEY = 'root_portal_abutments_bake_v3_recovery2'
DIRECTORY = ROOT / 'tmp/portal-abutments-bake-v3-recovery2'


def uv_audit(mesh, size):
    uv = mesh.uv_layers.active.data
    parents = list(range(len(mesh.polygons)))
    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index
    shared = {}
    area, below_pixel = 0, 0
    for face in mesh.polygons:
        points = [uv[i].uv for i in face.loop_indices]
        face_area = abs(sum(a.x*b.y-b.x*a.y for a, b in zip(points, points[1:]+points[:1]))) * .5
        area += face_area
        below_pixel += face_area*size*size < 1
        for i in face.loop_indices:
            point = uv[i].uv
            key = (mesh.loops[i].vertex_index, round(point.x, 7), round(point.y, 7))
            if key in shared:
                parents[root(face.index)] = root(shared[key])
            else:
                shared[key] = face.index
    charts = {}
    for face in mesh.polygons:
        charts.setdefault(root(face.index), []).extend(uv[i].uv.copy() for i in face.loop_indices)
    spans = [min(max(p[axis] for p in points)-min(p[axis] for p in points) for axis in (0,1))*size for points in charts.values()]
    return dict(occupiedFraction=area, charts=len(charts), facesBelowPixelArea=below_pixel,
                minimumChartExtentPixels=min(spans), chartsNarrowerThanTwoPixels=sum(s<2 for s in spans))


def stage(action, channel=None, batch=None, view='front'):
    caller = bpy.context.window.scene
    started = time.perf_counter()
    report = {'action': action, 'channel': channel, 'batch': batch, 'view': view}
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    try:
        if action == 'recover-albedo':
            if KEY in bpy.app.driver_namespace:
                raise RuntimeError('Recovery already prepared; resume its stages')
            original = bpy.app.driver_namespace['root_portal_abutments_bake_v3']
            baker = runpy.run_path(str(ROOT / 'scripts/blender/detailed/bake_masonry.py'))
            state = dict(original['state'])
            state['directory'] = DIRECTORY
            state['images'] = dict(state['images'])
            state['completed_images'] = {}
            state['completed'] = {'normal', 'orm'}
            state['channel_batches'] = {k: set(v) for k, v in state['channel_batches'].items() if k != 'albedo'}
            bpy.context.window.scene = state['scene']
            # Preserve the exact reviewed UVs/low mesh. Only the lost color
            # channel is recomputed; completed normal/ORM are checkpointed.
            for kind in ('normal', 'orm'):
                baker['checkpoint_image'](state, kind)
                baker['complete_image'](state, kind)
            material = bpy.data.materials.new('Recovered portal bake')
            material.use_nodes = True
            state['material'] = material
            state['target'] = material.node_tree.nodes.new('ShaderNodeTexImage')
            image = bpy.data.images.new('Recovered portal albedo', width=state['size'], height=state['size'], alpha=False)
            image.use_fake_user = True
            state['images']['albedo'] = image
            low = state['low']
            low.data.materials.clear(); low.data.materials.append(material)
            saved = low.data.attributes.new('masonry_bake_normal', 'FLOAT_VECTOR', 'CORNER')
            for value, normal in zip(saved.data, low.data.corner_normals): value.vector = normal.vector
            batches = []
            for ids in baker['projection_groups'](state['sources']):
                data = low.data.copy()
                bm = bmesh.new(); bm.from_mesh(data)
                layer = bm.faces.layers.int.get('masonry_source_id')
                if layer is None: raise ValueError('Recovery requires exact source identity')
                bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[layer] not in ids], context='FACES')
                loose = [v for v in bm.verts if not v.link_faces]
                if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
                bm.to_mesh(data); bm.free()
                attribute = data.attributes['masonry_bake_normal']
                data.normals_split_custom_set([tuple(v.vector) for v in attribute.data])
                data.attributes.remove(attribute)
                obj = bpy.data.objects.new('Recovered albedo projection group', data)
                state['destination'].objects.link(obj)
                obj.matrix_world = low.matrix_world.copy(); obj.visible_shadow = False
                obj.hide_set(True); obj.hide_render = True
                batches.append(([state['sources'][i] for i in ids], obj))
            low.data.attributes.remove(saved)
            low.hide_set(True); low.hide_render = True
            state['batches'] = batches
            bpy.app.driver_namespace[KEY] = dict(baker=baker, state=state, source=original['source'])
            report.update(batches=len(batches), reusedChannels=['normal', 'orm'], uv=uv_audit(low.data, state['size']))
        elif action == 'prepare':
            if KEY in bpy.app.driver_namespace:
                raise RuntimeError('Bake already prepared; resume its stages')
            source = bpy.app.driver_namespace.get('root_portal_abutments_v4')
            if source is None:
                module = runpy.run_path(str(ROOT / 'scripts/blender/experiments/portal_abutments.py'))
                scene, collection = module['build_portal_abutments'](ROOT)
                module['render_portal_abutments'](scene, DIRECTORY / 'source-reference.png', render_still=False)
                source = dict(module=module, scene=scene, collection=collection)
                bpy.app.driver_namespace['root_portal_abutments_v4'] = source
            baker = runpy.run_path(str(ROOT / 'scripts/blender/detailed/bake_masonry.py'))
            state = baker['prepare_bake'](
                source['scene'], source['collection'], DIRECTORY, size=2048,
                preserve_planar_normals=True, worked_faces_flat=True,
                minimum_chart_pixels=6, atlas_margin_pixels=6, bake_margin_pixels=2)
            bpy.app.driver_namespace[KEY] = dict(baker=baker, state=state, source=source)
            report.update(sourceTriangles=state['source_triangles'],
                          lowTriangles=baker['triangle_count']([state['low']]),
                          batches=len(state['batches']), atlas=state['size'],
                          uv=uv_audit(state['low'].data, state['size']))
        else:
            cache = bpy.app.driver_namespace[KEY]
            baker, state = cache['baker'], cache['state']
            if action == 'bake':
                baker['bake_channel'](state, channel, batch_index=batch)
                report['completed'] = {key: sorted(value) for key, value in state['channel_batches'].items()}
            elif action == 'export':
                bpy.context.window.scene = state['scene']
                report['path'] = str(baker['finish_bake'](state))
            elif action == 'reimport':
                if 'reviewScene' in cache:
                    raise RuntimeError('Exact export review scene already exists')
                scene = bpy.data.scenes.new('Bonded portal exact GLB review v3')
                bpy.context.window.scene = scene
                original = state['scene']
                scene.world = original.world
                for obj in original.objects:
                    if obj.type in {'LIGHT', 'CAMERA'} or obj.name.startswith('AbutmentReview_Ground'):
                        clone = obj.copy()
                        if obj.type == 'CAMERA':
                            clone.data = obj.data.copy()
                            scene.camera = clone
                        scene.collection.objects.link(clone)
                bpy.ops.import_scene.gltf(filepath=str(DIRECTORY / 'worn-pier-review.glb'))
                scene.render.engine = 'CYCLES'
                scene.cycles.device = 'CPU'
                scene.cycles.samples = 16
                scene.cycles.use_denoising = True
                scene.render.resolution_x, scene.render.resolution_y = 1200, 900
                scene.render.resolution_percentage = 100
                scene.view_settings.view_transform = original.view_settings.view_transform
                scene.view_settings.look = original.view_settings.look
                scene.render.image_settings.file_format = 'PNG'
                cache['reviewScene'] = scene
                report['scene'] = scene.name
            elif action in {'render', 'control'}:
                scene = cache['reviewScene']
                output = str(DIRECTORY / ((channel + '-' if action == 'control' else 'export-') + view + '.png'))
                restore = []
                try:
                    if action == 'control':
                        for obj in scene.objects:
                            if obj.type != 'MESH' or obj.name.startswith('AbutmentReview_Ground'):
                                continue
                            for slot in obj.material_slots:
                                original = slot.material
                                material = original.copy()
                                shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                                inputs = ['Normal'] if channel == 'normal-off' else ['Base Color', 'Normal', 'Roughness', 'Metallic']
                                for name in inputs:
                                    for link in list(shader.inputs[name].links):
                                        material.node_tree.links.remove(link)
                                if channel != 'normal-off':
                                    shader.inputs['Base Color'].default_value = (.25, .25, .25, 1)
                                    shader.inputs['Roughness'].default_value = .92
                                    shader.inputs['Metallic'].default_value = 0
                                restore.append((slot, original))
                                slot.material = material
                    if view == 'front':
                        bpy.context.window.scene = scene
                        scene.render.filepath = output
                        bpy.ops.render.render(write_still=True)
                    else:
                        cache['source']['module']['render_portal_abutment_detail'](scene, output, view)
                finally:
                    for slot, original in restore:
                        slot.material = original
                report['path'] = output
            else:
                raise ValueError('Unknown stage ' + action)
    finally:
        bpy.context.window.scene = caller
        report['seconds'] = time.perf_counter() - started
        report['sceneRestored'] = caller.name
        suffix = '-'.join(str(value) for value in (action, channel, batch, view if action in {'render', 'control'} else None) if value is not None)
        (DIRECTORY / (suffix + '.json')).write_text(json.dumps(report, indent=2) + '\n')
    return report
