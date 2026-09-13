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
jobs=[('helmet-front',(0,-2,1.76),(0,0,1.74),.34),('helmet-side',(2,0,1.76),(0,0,1.74),.34),('helmet-quarter',(.8,-2,1.76),(0,0,1.74),.34),('hands-quarter',(.9,-2,1),(0,-.035,.974),.8),('hands-front',(0,-2,1),(0,-.035,.974),.80),('hands-back',(0,2,1),(0,-.035,.974),.80),('left-hand-side',(2,-.035,1),(.29,-.04,.973),.19),('right-grip-side',(-2,-.1,1),(-.31,-.065,.974),.19)]
scene.render.resolution_x=900;scene.render.resolution_y=700
for name,loc,target,scale in jobs:

 for ob in bpy.data.objects:
  if ob.type=='MESH' and ob.parent and ob.parent.name in ['leftHand','rightHand']:
   ob.hide_render=(name=='right-grip-side' and ob.parent.name=='leftHand') or (name=='left-hand-side' and ob.parent.name=='rightHand')
 cam.location=loc;aim(cam,target);camd.ortho_scale=scale;scene.render.filepath=OUT+'/'+name+'.png';bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/helmet-hands-export-review-v27.blend')
result={'form_views':[j[0] for j in jobs]}
