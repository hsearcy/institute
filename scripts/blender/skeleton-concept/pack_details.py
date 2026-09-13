"""Keep the 2K detail albedo; size normal and scalar maps for browser use."""
import bpy,os,json
ROOT='/home/hfsearcy/git/institute';OUT=ROOT+'/docs/concepts/skeleton-model'
for name,size in [('Head normal',1024),('Head ORM',512)]:
 im=bpy.data.images[name];im.scale(size,size);im.pack()
bpy.ops.object.select_all(action='SELECT');glb=ROOT+'/web/public/assets/rpg/candidates/skeleton-concept.glb'
bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',export_image_format='AUTO',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True)
bpy.data.orphans_purge(do_recursive=True);bpy.ops.wm.save_as_mainfile(filepath=OUT+'/skeleton-concept-v27.blend')
stats={'bytes':os.path.getsize(glb),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'mesh_count':len([o for o in bpy.data.objects if o.type=='MESH']),'detail_albedo':2048,'detail_normal':1024,'detail_orm':512,'body_geometry_changed':False,'existing_skeleton_geometry_used':False}
open(OUT+'/build-stats.json','w').write(json.dumps(stats,indent=2));result=stats
