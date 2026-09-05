"""Surface review at an oblique dungeon camera, using restrained warm/cool light."""
import bpy
from mathutils import Vector
from pathlib import Path

def preview_set(names,positions,filename,scale=9,center=(0,0,2),width=1500,height=1000):
    depsgraph=bpy.context.evaluated_depsgraph_get()
    snapshots=[]
    for name,pos in zip(names,positions):
        collection=bpy.data.collections.get('Vault_'+name)
        for src in collection.objects:
            if src.type!='MESH':continue
            mesh=bpy.data.meshes.new_from_object(src.evaluated_get(depsgraph),depsgraph=depsgraph)
            snapshots.append((src.name,mesh,src.matrix_world.copy(),pos))
    scene=bpy.data.scenes.new('Detailed review '+filename);bpy.context.window.scene=scene
    for name,mesh,matrix,pos in snapshots:
        o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o)
        o.matrix_world=matrix;o.location+=Vector(pos);o.hide_render=False
    bpy.ops.mesh.primitive_plane_add(size=200)
    floor=bpy.context.object;floor.location.z=-.045
    m=bpy.data.materials.new('Review charcoal ground');m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.012,.017,.019,1);p.inputs['Roughness'].default_value=.82
    floor.data.materials.append(m)
    world=bpy.data.worlds.new('Review low ambient');scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.055,.075,.085,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.22
    target=Vector(center)
    bpy.ops.object.camera_add(location=target+Vector((7,-13,9)))
    cam=bpy.context.object;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=scale;scene.camera=cam
    for loc,power,color,size in [((-4,-3,6),620,(1,.63,.30),3.5),((4,2,7),820,(.15,.47,.68),3),((1,-6,4),170,(.55,.65,.65),4)]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size
        o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    path=Path('/home/houston/git/institute/scripts/blender/previews/v2')/(filename+'.png')
    path.parent.mkdir(exist_ok=True);scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    return scene
