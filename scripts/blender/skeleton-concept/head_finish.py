"""Package only the new head material. Keep accepted head geometry unchanged."""
import bpy,numpy as np
OUT='/home/hfsearcy/git/institute/docs/concepts/skeleton-model'
base=bpy.data.images['Head base color'];base.filepath_raw=OUT+'/head-base-color.jpg';base.file_format='JPEG';base.save()
base=bpy.data.images.load(base.filepath_raw,check_existing=False);base.pack()
normal=bpy.data.images['Head normal']
ao=np.array(bpy.data.images['Head AO'].pixels[:],dtype=np.float32).reshape(2048,2048,4)
rough=np.array(bpy.data.images['Head roughness'].pixels[:],dtype=np.float32).reshape(2048,2048,4)
metal=np.array(bpy.data.images['Head metallic'].pixels[:],dtype=np.float32).reshape(2048,2048,4)
rough[:,:,0]=ao[:,:,0];rough[:,:,2]=metal[:,:,0];rough[:,:,3]=1
orm=bpy.data.images.new('Head ORM',width=2048,height=2048,alpha=False);orm.colorspace_settings.name='Non-Color';orm.pixels.foreach_set(rough.ravel());orm.scale(1024,1024);orm.pack()
mat=bpy.data.materials.new('Skeleton head - baked PBR');mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF')
def tex(im):node=n.new('ShaderNodeTexImage');node.image=im;return node
l.new(tex(base).outputs['Color'],p.inputs['Base Color'])
nm=n.new('ShaderNodeNormalMap');l.new(tex(normal).outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],p.inputs['Normal'])
sep=n.new('ShaderNodeSeparateColor');l.new(tex(orm).outputs['Color'],sep.inputs[0]);l.new(sep.outputs['Green'],p.inputs['Roughness']);l.new(sep.outputs['Blue'],p.inputs['Metallic'])
gn=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');gn.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat');group=n.new('ShaderNodeGroup');group.node_tree=gn;l.new(sep.outputs['Red'],group.inputs['Occlusion'])
head=[o for o in bpy.data.objects if o.type=='MESH' and o.parent and o.parent.name in ['head','leftHand','rightHand'] and 'Cold teal soul' not in o.name]
for o in head:
    o.data.materials.clear();o.data.materials.append(mat)
    for layer in list(o.data.uv_layers):
        if layer.name!='HeadUV':o.data.uv_layers.remove(layer)
    o.data.uv_layers.active.name='UVMap';o.data.uv_layers.active.active_render=True
    for poly in o.data.polygons:poly.material_index=0
kept=[]
for parent,name in [('head','SkeletonHeadClean'),('leftHand','SkeletonLeftHandClean'),('rightHand','SkeletonRightHandClean')]:
 obs=[o for o in bpy.data.objects if o.type=='MESH' and o.parent and o.parent.name==parent and 'Cold teal soul' not in o.name]
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
 if len(obs)>1:bpy.ops.object.join()
 ob=bpy.context.object;ob.name=name;mw=ob.matrix_world.copy();ob.parent=None;ob.matrix_world=mw;kept.append(ob)
for other in list(bpy.data.objects):
 if other not in kept:bpy.data.objects.remove(other,do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/clean-details-v26.blend')
result={'detail_atlas':2048,'packed_orm':1024,'replacements':[o.name for o in kept]}
