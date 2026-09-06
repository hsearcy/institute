"""Repeatable studio/game-elevation review for source and reimported masonry."""
from pathlib import Path

import bpy
from mathutils import Vector


def render_masonry_study(scene, output, direction=(17, -20, 25), height=4.5):
    previous = bpy.context.window.scene
    bpy.context.window.scene = scene
    target = Vector((.22, 0, height * (2.15 / 4.5)))
    if not scene.get('masonry_review_lighting'):
        world = bpy.data.worlds.new('Masonry neutral review world')
        world.use_nodes = True
        scene.world = world
        world.node_tree.nodes['Background'].inputs[0].default_value = (.12, .15, .18, 1)
        world.node_tree.nodes['Background'].inputs[1].default_value = .25
        bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.035))
        ground = bpy.context.object
        ground.name = 'MasonryReview_Ground'
        mat = bpy.data.materials.new('Masonry review ground')
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (.023, .03, .033, 1)
        shader.inputs['Roughness'].default_value = .92
        ground.data.materials.append(mat)
        bpy.ops.object.camera_add()
        scene.camera = bpy.context.object
        scene.camera.data.type = 'ORTHO'
        scene.camera.data.ortho_scale = 5.9
        for position, power, color, size in [((-3, -4, 7), 900, (1, .90, .76), 4),
                                             ((4, 2, 6), 700, (.50, .68, .82), 4),
                                             ((0, -5, 3), 200, (.9, .94, 1), 5)]:
            bpy.ops.object.light_add(type='AREA', location=position)
            light = bpy.context.object
            light.data.energy = power
            light.data.color = color
            light.data.shape = 'DISK'
            light.data.size = size
            light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
        scene['masonry_review_lighting'] = True
    scene.camera.location = target + Vector(direction) * .3
    # A short post retains a broad capital/base, so its diagonal footprint needs
    # additional vertical space in the elevated view.
    scene.camera.data.ortho_scale = 5.9 * height / 4.5 + (.5 if height < 3 else 0)
    scene.camera.rotation_euler = (target - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 850
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(Path(output).resolve())
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        bpy.context.window.scene = previous
    print('Rendered masonry review', output)
