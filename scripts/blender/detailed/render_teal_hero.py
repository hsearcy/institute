"""Neutral, bright studio evidence of the actual Blender mesh/materials."""
from pathlib import Path
import bpy
from mathutils import Vector


def render_teal_hero(collection, output, back=False):
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    previous=bpy.context.window.scene;graph=bpy.context.evaluated_depsgraph_get()
    snapshots=[]
    for obj in collection.objects:
        if obj.type!='MESH' or obj.hide_render:continue
        evaluated=obj.evaluated_get(graph)
        mesh=bpy.data.meshes.new_from_object(evaluated,depsgraph=graph);mesh.transform(obj.matrix_world)
        snapshots.append((obj.name,mesh))
    scene=bpy.data.scenes.new('Teal hero studio '+('back' if back else 'front'));bpy.context.window.scene=scene
    for name,mesh in snapshots:scene.collection.objects.link(bpy.data.objects.new('Study '+name,mesh))
    target=Vector((0,0,.96));position=(-2.6,6.5,2.7) if back else (2.8,-6.5,2.7)
    data=bpy.data.cameras.new('Teal studio camera');camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
    camera.location=position;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    data.type='ORTHO';data.ortho_scale=2.4;scene.camera=camera
    for name,pos,power,color,size in (
        ('Warm key',(-3,-4,5),600,(1,.88,.75),4),
        ('Sky fill',(4,-1,3),450,(.76,.89,1),4),
        ('Cape key',(-2,4,4),700,(.87,.94,1),4),
    ):
        light=bpy.data.lights.new(name,'AREA');light.energy=power;light.color=color;light.shape='DISK';light.size=size
        obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.location=pos
        obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012))
    ground=bpy.context.object;ground.name='Neutral studio ground'
    material=bpy.data.materials.new('Warm gray review ground');material.diffuse_color=(.26,.28,.30,1);ground.data.materials.append(material)
    scene.world=bpy.data.worlds.new('Teal hero neutral studio');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.35,.39,.43,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
    scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
    scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    scene.render.filepath=str(output)
    try:bpy.ops.render.render(write_still=True)
    finally:bpy.context.window.scene=previous
    return output
