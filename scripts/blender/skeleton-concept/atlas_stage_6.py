"""Bake shared PBR atlas and add the game's articulation contract."""
import bpy, os, json, numpy as np
ROOT='/home/hfsearcy/git/institute';OUT=ROOT+'/docs/concepts/skeleton-model'
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
meshes=[o for o in bpy.data.objects if o.type=='MESH']
N=2048
base=bpy.data.images['Skeleton concept base color'];normal=bpy.data.images['Skeleton concept tangent normal'];ao=bpy.data.images['Skeleton concept ambient occlusion'];rough=bpy.data.images['Skeleton concept roughness'];metal=bpy.data.images['Metal channel']
bp=np.array(base.pixels[:],dtype=np.float32).reshape(N,N,4);ap=np.array(ao.pixels[:],dtype=np.float32).reshape(N,N,4);bp[:,:,:3]*=(.18+.82*ap[:,:,:3]**2);base.pixels.foreach_set(bp.ravel());base.pack()
rp=np.array(rough.pixels[:],dtype=np.float32).reshape(N,N,4);mp=np.array(metal.pixels[:],dtype=np.float32).reshape(N,N,4)
orm=bpy.data.images.new('Skeleton concept metal rough',width=N,height=N,alpha=False);orm.colorspace_settings.name='Non-Color'
rp[:,:,2]=mp[:,:,0];rp[:,:,0]=1;rp[:,:,3]=1;orm.pixels.foreach_set(rp.ravel());orm.pack()
mat=bpy.data.materials.new('Skeleton concept - baked PBR');mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF')
def tex(im):node=n.new('ShaderNodeTexImage');node.image=im;return node
l.new(tex(base).outputs['Color'],p.inputs['Base Color'])
nm=n.new('ShaderNodeNormalMap');l.new(tex(normal).outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],p.inputs['Normal'])
sep=n.new('ShaderNodeSeparateColor');l.new(tex(orm).outputs['Color'],sep.inputs[0]);l.new(sep.outputs['Green'],p.inputs['Roughness']);l.new(sep.outputs['Blue'],p.inputs['Metallic'])
gn=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');gn.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat');group=n.new('ShaderNodeGroup');group.node_tree=gn;l.new(tex(ao).outputs['Color'],group.inputs['Occlusion'])
# Retain small eyes with their dedicated emissive material. Main surfaces use one atlas.
eyemat=bpy.data.materials.new('Soul eye emission');eyemat.use_nodes=True;ep=eyemat.node_tree.nodes.get('Principled BSDF');ep.inputs['Base Color'].default_value=(0,.12,.1,1);ep.inputs['Emission Color'].default_value=(0,.7,.6,1);ep.inputs['Emission Strength'].default_value=1.6
for o in meshes:
    is_eye='Cold teal soul' in o.name
    o.data.materials.clear();o.data.materials.append(eyemat if is_eye else mat)
    old=o.data.uv_layers.get('SurfaceUV');o.data.uv_layers.remove(old);o.data.uv_layers.active.name='UVMap'
    for p0 in o.data.polygons:p0.material_index=0
for parent in [o for o in bpy.data.objects if o.type=='EMPTY']:
    obs=[o for o in list(bpy.data.objects) if o.type=='MESH' and o.parent==parent and 'Cold teal soul' not in o.name]
    if len(obs)<2:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();obs[0].name=parent.name+'_surface'
mapping={'sword':'Sword','cape':'Cape','hips':'Body','head':'Head','rightUpperArm':'ArmUpperR','leftUpperArm':'ArmUpperL','rightForearm':'ArmLowerR','leftForearm':'ArmLowerL','rightThigh':'LegUpperR','leftThigh':'LegUpperL','rightShin':'LegLowerR','leftShin':'LegLowerL'}
for old,role in mapping.items():
    o=bpy.data.objects.get(old);o.name='Joint_'+role;o['enemyJoint']=role
bpy.ops.object.select_all(action='SELECT')
glb=ROOT+'/web/public/assets/rpg/candidates/skeleton-concept.glb'
bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/skeleton-concept-v22.blend')
stats={'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'mesh_count':len([o for o in bpy.data.objects if o.type=='MESH']),'glb_bytes':os.path.getsize(glb),'baked_atlas_size':N}
open(OUT+'/build-stats.json','w').write(json.dumps(stats,indent=2));result=stats
