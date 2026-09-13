"""Review renders from reimported GLB, not source-only shader renders."""
import bpy, math, os
from mathutils import Vector
ROOT='/home/hfsearcy/git/institute'; OUT=ROOT+'/docs/concepts/skeleton-model'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=ROOT+'/web/public/assets/rpg/candidates/skeleton-concept.glb')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=768;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Review world');scene.world.color=(.18,.18,.18)
scene.view_settings.view_transform='AgX'
def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size,color in [('Key',(-3,-4,5),450,4,(1,.88,.73)),('Fill',(3,-2,3),300,3,(.72,.84,1)),('Rim',(0,3,4),500,3,(1,.92,.81))]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;aim(o,(0,0,1))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.018));ground=bpy.context.object;ground.name='Review floor'
m=bpy.data.materials.new('Review warm gray');m.diffuse_color=(.115,.125,.125,1);ground.data.materials.append(m)
camd=bpy.data.cameras.new('ReviewCamera');cam=bpy.data.objects.new('ReviewCamera',camd);bpy.context.collection.objects.link(cam);scene.camera=cam;camd.type='ORTHO';camd.ortho_scale=2.16
jobs=[('skull-close',(.45,-2,1.79),(0,0,1.72),.40,800,800),('torso-close',(.55,-2,1.42),(0,0,1.37),.64,800,800),('cloth-close',(.55,-2,.91),(0,0,.86),.78,800,800)]
for name,angle in [('front',0),('side',90),('back',180),('three-quarter',32)]:
    a=math.radians(angle);jobs.append((name,(3*math.sin(a),-3*math.cos(a),1.30),(0,0,.96),2.16,768,1024))
jobs.append(('game-size',(1.8,-3,1.32),(0,0,.96),2.16,160,200))
for name,location,target,scale,width,height in jobs:
    cam.location=location;aim(cam,target);camd.ortho_scale=scale;scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.filepath=OUT+'/'+name+'.png';bpy.ops.render.render(write_still=True)
cam.location=(1.8,-3,1.32);aim(cam,(0,0,.96));camd.ortho_scale=2.16;scene.render.resolution_x=768;scene.render.resolution_y=1024
for name,rot in [('rightUpperArm',(-.38,0,-.16)),('rightForearm',(-.65,0,0)),('leftUpperArm',(.15,0,.12)),('rightThigh',(-.22,0,0)),('rightShin',(.35,0,0)),('leftThigh',(.13,0,0)),('head',(0,0,-.13))]:
    roles={'rightUpperArm':'ArmUpperR','rightForearm':'ArmLowerR','leftUpperArm':'ArmUpperL','rightThigh':'LegUpperR','rightShin':'LegLowerR','leftThigh':'LegUpperL','head':'Head'}
    o=bpy.data.objects.get('Joint_'+roles.get(name,name)) or bpy.data.objects.get(name)
    if o:o.rotation_mode='XYZ';o.rotation_euler=rot
scene.render.filepath=OUT+'/posed.png';bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/review-scene-v27.blend')
result={'renders':[job[0] for job in jobs]+['posed'],'source':'reimported final GLB'}
