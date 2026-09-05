"""Create a separate, non-destructive studio scene for asset inspection."""
import bpy
from mathutils import Vector
from pathlib import Path

def preview(names,positions,filename,width=1400,height=900,scale=8.3,target_z=1.0):
    scene=bpy.data.scenes.new('Vault preview '+filename)
    bpy.context.window.scene=scene
    for name,pos in zip(names,positions):
        collection=bpy.data.collections.get('Vault_'+name)
        for original in collection.objects:
            o=original.copy();o.data=original.data
            scene.collection.objects.link(o);o.location+=Vector(pos)
    bpy.ops.mesh.primitive_plane_add(size=200)
    floor=bpy.context.object;floor.name='Preview ground'
    floor.location.z=-.035
    m=bpy.data.materials.new('Preview slate');m.diffuse_color=(.025,.035,.043,1);m.use_nodes=True
    m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.025,.035,.043,1)
    m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.8
    floor.data.materials.append(m)
    world=bpy.data.worlds.new('Preview world');scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.16,.20,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.35
    target=Vector((0,0,target_z))
    bpy.ops.object.camera_add(location=(5,-10,6.6));cam=bpy.context.object
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=scale;scene.camera=cam
    for loc,power,color,size in [((-3,-4,7),1400,(1,.79,.55),5),((4,3,6),1800,(.23,.72,1),4),((0,-3,4),250,(.72,.87,1),3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object
        o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size
        o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    directory=Path(globals().get('RPG_REPO_ROOT','/home/houston/git/institute'))/'scripts/blender/previews';directory.mkdir(exist_ok=True)
    scene.render.filepath=str(directory/(filename+'.png'))
    bpy.ops.render.render(write_still=True)
    return scene
