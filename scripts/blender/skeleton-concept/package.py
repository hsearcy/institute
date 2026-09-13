"""Pack the reviewed material channels for the browser without changing geometry."""
import bpy, numpy as np, os, json
ROOT='/home/hfsearcy/git/institute';OUT=ROOT+'/docs/concepts/skeleton-model'
mat=bpy.data.materials['Skeleton concept - baked PBR'];nodes=mat.node_tree.nodes;links=mat.node_tree.links
base=bpy.data.images['Skeleton concept base color']
base.filepath_raw=OUT+'/skeleton-base-color.jpg';base.file_format='JPEG';base.save()
jpg=bpy.data.images.load(base.filepath_raw,check_existing=False);jpg.pack()
for n in nodes:
    if n.type=='TEX_IMAGE' and n.image==base:n.image=jpg
ao=bpy.data.images['Skeleton concept ambient occlusion'];orm=bpy.data.images['Skeleton concept metal rough']
a=np.array(ao.pixels[:],dtype=np.float32).reshape(2048,2048,4);p=np.array(orm.pixels[:],dtype=np.float32).reshape(2048,2048,4)
p[:,:,0]=a[:,:,0]
orm.pixels.foreach_set(p.ravel());orm.scale(1024,1024);orm.pack()
sep=next(n for n in nodes if n.type=='SEPARATE_COLOR')
group=next(n for n in nodes if n.type=='GROUP')
links.new(sep.outputs['Red'],group.inputs['Occlusion'])
for n in list(nodes):
    if n.type=='TEX_IMAGE' and n.image==ao:nodes.remove(n)
bpy.ops.object.select_all(action='SELECT')
glb=ROOT+'/web/public/assets/rpg/candidates/skeleton-concept.glb'
bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',export_image_format='AUTO',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True)
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/skeleton-concept-v23.blend')
result={'bytes':os.path.getsize(glb),'format':'2048 JPEG base color, 2048 PNG normal, 1024 packed ORM'}
