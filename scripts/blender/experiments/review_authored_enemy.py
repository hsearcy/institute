"""Reimport the exact candidate and apply its separate reviewed guard metadata.

The GLB itself stays in neutral rest. Each review creates an isolated scene and
restores the caller, allowing rear equipment and local joint checks on the
exported geometry rather than the retained high source.
"""
from pathlib import Path
import json
import bpy
from mathutils import Vector,Quaternion
from equipped_skeleton import module


def load(path,guarded=True):
    previous=bpy.context.window.scene
    try:
        scene=bpy.data.scenes.new('Authored skeleton exact GLB review')
        bpy.context.window.scene=scene
        bpy.ops.import_scene.gltf(filepath=str(Path(path).resolve()))
        root=next(o for o in scene.objects if o.get('authoredEnemy'))
        guard=json.loads(root['guardPoseYUp'])
        joints={o['enemyJoint']:o for o in scene.objects if o.get('enemyJoint')}
        if guarded:
            for name,pose in guard.items():
                obj=joints[name]
                x,y,z=pose['position'];obj.location+=Vector((x,-z,y))
                x,y,z,w=pose['quaternion'];rest=obj.rotation_quaternion.copy();obj.rotation_mode='QUATERNION';obj.rotation_quaternion=rest@Quaternion((w,x,-z,y))
        bpy.context.view_layer.update()
        return scene,joints
    finally:bpy.context.window.scene=previous


def render(root,path,prefix,views=('high','back','detail','native'),guarded=True):
    scene,joints=load(path,guarded)
    anatomy=module(Path(root)/'scripts/blender/experiments/authored_enemies.py','enemy_exact_review')
    for view in views:
        anatomy.render_anatomy_study(scene,str(prefix)+'-'+view+'.png',high=view in ('high','native'),native=view=='native',detail=view=='detail',back=view=='back')
    return scene,joints


def render_material_controls(root,path,prefix):
    anatomy=module(Path(root)/'scripts/blender/experiments/authored_enemies.py','enemy_material_controls')
    report={}
    for control in ('no-normal','no-ao'):
        scene,_=load(path,True);removed=0
        for material in {m for obj in scene.objects if obj.type=='MESH' for m in obj.data.materials}:
            for node in material.node_tree.nodes:
                socket=node.inputs.get('Normal') if node.type=='BSDF_PRINCIPLED' and control=='no-normal' else node.inputs.get('Occlusion') if node.type=='GROUP' and control=='no-ao' else None
                if socket:
                    for link in list(socket.links):material.node_tree.links.remove(link);removed+=1
                    if control=='no-ao':socket.default_value=1
        anatomy.render_anatomy_study(scene,str(prefix)+'-'+control+'.png',detail=True)
        report[control]={'linksRemoved':removed,'scene':scene.name}
    return report
