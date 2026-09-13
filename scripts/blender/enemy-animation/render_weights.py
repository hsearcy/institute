import bpy,math,os,json
from mathutils import Vector,Quaternion
ROOT='/home/hfsearcy/git/institute';KIND=globals().get('KIND','skeleton');REV=globals().get('REV',1);OUT=ROOT+'/docs/concepts/enemy-animation/'+KIND
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=ROOT+'/web/public/assets/rpg/animated/'+KIND+'.glb')
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');metadata=json.load(open(OUT+'/rig-metadata.json'));H=metadata['height']
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
camd=bpy.data.cameras.new('ReviewCamera');cam=bpy.data.objects.new('ReviewCamera',camd);bpy.context.collection.objects.link(cam);scene.camera=cam;camd.type='ORTHO';camd.ortho_scale=H*1.15

scene.cycles.samples=12;scene.render.resolution_x=800;scene.render.resolution_y=1000
cam.location=(H*1.3,-H*2,H*.7);aim(cam,(0,0,H*.50))
scene.render.filepath=OUT+'/rest-v'+str(REV)+'.png';bpy.ops.render.render(write_still=True)
def bend(name,angle):
 bone=arm.pose.bones[name];bone.rotation_mode='QUATERNION';axis=bone.bone.matrix_local.to_3x3().inverted()@Vector((1,0,0));bone.rotation_quaternion=Quaternion(axis,angle)
for side in ['L','R']:bend('Forearm'+side,-math.pi/4);bend('Shin'+side,math.pi/4)
scene.render.filepath=OUT+'/bend45-v'+str(REV)+'.png';bpy.ops.render.render(write_still=True)
# A rear view exposes ownership mistakes hidden by armor and props.
cam.location=(-H*1.3,H*2,H*.7);aim(cam,(0,0,H*.5));scene.render.filepath=OUT+'/bend45-back-v'+str(REV)+'.png';bpy.ops.render.render(write_still=True)
for side in ['L','R']:bend('Shin'+side,math.radians(110));bend('Thigh'+side,math.radians(-45));bend('Forearm'+side,math.radians(-85))
bend('Spine',math.radians(30));bend('Chest',math.radians(30))
cam.location=(H*1.3,-H*2,H*.7);aim(cam,(0,0,H*.5));scene.render.filepath=OUT+'/deep-bend-v'+str(REV)+'.png';bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/bend-review-v'+str(REV)+'.blend');result={'kind':KIND,'views':['rest','bend45','bend45-back']}
