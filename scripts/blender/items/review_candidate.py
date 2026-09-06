"""Render the exact packed item in an isolated scene using source study lighting."""
import importlib.util
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]


def review(path,item_id,prefix):
    previous=bpy.context.window.scene
    spec=importlib.util.spec_from_file_location('item_export_review',ROOT/'scripts/blender/items/build_studies.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    scene=bpy.data.scenes.new('Exact packed item '+item_id)
    try:
        bpy.context.window.scene=scene
        bpy.ops.import_scene.gltf(filepath=str(path))
        root=next(obj for obj in scene.objects if obj.get('itemId')==item_id)
        assert root.get('gripNode') and root.get('tipNode')
        module.render_study(scene,str(prefix)+'-front.png')
        module.render_study(scene,str(prefix)+'-back.png',back=True)
        module.render_study(scene,str(prefix)+'-high.png',game_angle=True)
        module.render_study(scene,str(prefix)+'-hilt.png',detail=True,focus=(item_id,.015,.65))
        return scene
    finally:
        bpy.context.window.scene=previous


def thumbnail(scene,item_id,path,size=512):
    """Frame the exact accepted geometry from its embedded preview metadata."""
    previous=bpy.context.window.scene
    temporary=[]
    try:
        bpy.context.window.scene=scene
        root=next(o for o in scene.objects if o.get('itemId')==item_id)
        points=[o.matrix_world@v.co for o in root.children_recursive if o.type=='MESH' for v in o.data.vertices]
        lower=Vector(tuple(min(p[i] for p in points) for i in range(3)))
        upper=Vector(tuple(max(p[i] for p in points) for i in range(3)))
        target=(lower+upper)*.5
        azimuth=math.radians(root['previewAzimuth']);elevation=math.radians(root['previewElevation'])
        direction=Vector((math.sin(azimuth)*math.cos(elevation),-math.cos(azimuth)*math.cos(elevation),math.sin(elevation)))
        camera=bpy.data.objects.new('Exact item thumbnail camera',bpy.data.cameras.new('Exact item thumbnail camera'))
        scene.collection.objects.link(camera);temporary.append(camera);scene.camera=camera
        camera.location=target+direction*4;camera.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler()
        camera.rotation_euler.rotate_axis('Z',math.radians(root.get('previewRoll',0)))
        camera.data.type='ORTHO'
        inverse=camera.rotation_euler.to_matrix().transposed()
        projected=[inverse@(p-target) for p in points]
        span=max(max(p[i] for p in projected)-min(p[i] for p in projected) for i in (0,1))
        camera.data.ortho_scale=span*root['previewMargin']
        for location,power,color,light_size in [((-2,-3,4),360,(1,.91,.78),1.4),((2,1,3),340,(.60,.78,1),2),((0,-2,1),45,(.85,.91,1),3)]:
            light=bpy.data.objects.new('Item thumbnail softbox',bpy.data.lights.new('Item thumbnail softbox','AREA'))
            scene.collection.objects.link(light);temporary.append(light);light.location=location
            light.data.energy=power;light.data.color=color;light.data.shape='DISK';light.data.size=light_size
            light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
        scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=True
        scene.render.resolution_x=size;scene.render.resolution_y=size;scene.render.resolution_percentage=100
        scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
        scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    finally:
        for obj in temporary:bpy.data.objects.remove(obj,do_unlink=True)
        bpy.context.window.scene=previous
