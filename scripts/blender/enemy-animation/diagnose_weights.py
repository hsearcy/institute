import bpy,numpy as np,math,json
from mathutils import Quaternion,Vector
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');mesh=next(o for o in bpy.data.objects if o.type=='MESH');H=float(json.loads(arm['rigMetadata'])['height'])
for side in ['L','R']:
 for n,a in [('Shin',110),('Thigh',-45),('Forearm',-85)]:
  b=arm.pose.bones[n+side];b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion(b.bone.matrix_local.to_3x3().inverted()@Vector((1,0,0)),math.radians(a))
for n in ['Spine','Chest']:
 b=arm.pose.bones[n];b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion(b.bone.matrix_local.to_3x3().inverted()@Vector((1,0,0)),math.radians(30))
bpy.context.view_layer.update();evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());p=np.array([v.co[:] for v in mesh.data.vertices])/H;q=np.array([v.co[:] for v in evaluated.data.vertices])/H
edges=np.array([e.vertices[:] for e in mesh.data.edges]);stretch=np.linalg.norm(q[edges[:,0]]-q[edges[:,1]],axis=1)-np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)
result={'edges':[]}
for ei in np.argsort(stretch)[-12:][::-1]:
 ids=edges[ei];result['edges'].append({'stretch':round(float(stretch[ei]),4),'vertices':[{'position':p[i].round(4).tolist(),'weights':{mesh.vertex_groups[g.group].name:round(g.weight,2) for g in mesh.data.vertices[i].groups}} for i in ids]})
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT)
