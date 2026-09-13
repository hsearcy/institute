"""Bake shared PBR atlas and add the game's articulation contract."""
import bpy, os, json, numpy as np
ROOT='/home/hfsearcy/git/institute';OUT=ROOT+'/docs/concepts/skeleton-model'
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
meshes=[o for o in bpy.data.objects if o.type=='MESH']
# The first UV layer is the source texture projection. The second is a shared atlas.
for o in meshes:
    old=o.data.uv_layers.active;old.name='SurfaceUV'
    o.data.uv_layers.new(name='AtlasUV');o.data.uv_layers.active_index=1
for m in list(bpy.data.materials):
    if not m.use_nodes:continue
    uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='SurfaceUV'
    for node in m.node_tree.nodes:
        if node.type=='TEX_IMAGE':m.node_tree.links.new(uv.outputs['UV'],node.inputs['Vector'])
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.2,island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
N=1024
def bake(name,kind):
    im=bpy.data.images.new(name,width=N,height=N,alpha=False)
    if kind!='DIFFUSE':im.colorspace_settings.name='Non-Color'
    for m in list(bpy.data.materials):
        if m.use_nodes:
            n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;m.node_tree.nodes.active=n
    scene.render.bake.use_clear=True;scene.render.bake.margin=12
    scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
    bpy.ops.object.bake(type=kind)
    im.pack();return im
base=bake('Skeleton concept base color','DIFFUSE')
normal=bake('Skeleton concept tangent normal','NORMAL')
ao=bake('Skeleton concept ambient occlusion','AO')
rough=bake('Skeleton concept roughness','ROUGHNESS')
# Bake metallic via emission without scene lighting.
for m in list(bpy.data.materials):
    if not m.use_nodes:continue
    p=m.node_tree.nodes.get('Principled BSDF');out=m.node_tree.nodes.get('Material Output')
    e=m.node_tree.nodes.new('ShaderNodeEmission');v=p.inputs['Metallic'].default_value;e.inputs['Color'].default_value=(v,v,v,1);m.node_tree.links.new(e.outputs[0],out.inputs['Surface'])
metal=bake('Metal channel','EMIT')
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
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/skeleton-concept-v7.blend')
stats={'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'mesh_count':len([o for o in bpy.data.objects if o.type=='MESH']),'glb_bytes':os.path.getsize(glb),'baked_atlas_size':N}
open(OUT+'/build-stats.json','w').write(json.dumps(stats,indent=2));result=stats
