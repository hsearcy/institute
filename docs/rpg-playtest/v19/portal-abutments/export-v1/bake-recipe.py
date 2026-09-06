"""Observable candidate-only bake of the reviewed bonded portal source.

Invoke individual stages through Blender MCP. Source materials retain their
object coordinates, and every stage restores the caller's active scene.
"""
import json
from pathlib import Path
import runpy
import time

import bpy


ROOT = Path(__file__).resolve().parents[3]
KEY = 'root_portal_abutments_bake_v1'
DIRECTORY = ROOT / 'tmp/portal-abutments-bake-v1'


def stage(action, channel=None, batch=None, view='front'):
    caller = bpy.context.window.scene
    started = time.perf_counter()
    report = {'action': action, 'channel': channel, 'batch': batch, 'view': view}
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    try:
        if action == 'prepare':
            if KEY in bpy.app.driver_namespace:
                raise RuntimeError('Bake already prepared; resume its stages')
            source = bpy.app.driver_namespace.get('root_portal_abutments_v4')
            if source is None:
                module = runpy.run_path(str(ROOT / 'scripts/blender/experiments/portal_abutments.py'))
                scene, collection = module['build_portal_abutments'](ROOT)
                source = dict(module=module, scene=scene, collection=collection)
                bpy.app.driver_namespace['root_portal_abutments_v4'] = source
            baker = runpy.run_path(str(ROOT / 'scripts/blender/detailed/bake_masonry.py'))
            state = baker['prepare_bake'](
                source['scene'], source['collection'], DIRECTORY, size=2048,
                preserve_planar_normals=True, worked_faces_flat=True)
            bpy.app.driver_namespace[KEY] = dict(baker=baker, state=state, source=source)
            report.update(sourceTriangles=state['source_triangles'],
                          lowTriangles=baker['triangle_count']([state['low']]),
                          batches=len(state['batches']), atlas=state['size'])
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
                scene = bpy.data.scenes.new('Bonded portal exact GLB review v1')
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
