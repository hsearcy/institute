"""Replace only the head surface of the accepted candidate with the clean head atlas."""
import bpy,os,json
ROOT='/home/hfsearcy/git/institute';OUT=ROOT+'/docs/concepts/skeleton-model'
pairs=[('Joint_Head','SkeletonHeadClean'),('leftHand','SkeletonLeftHandClean'),('rightHand','SkeletonRightHandClean')]
with bpy.data.libraries.load(OUT+'/clean-details-v26.blend',link=False) as (src,dst):dst.objects=[p[1] for p in pairs]
loaded={o.name:o for o in dst.objects}
for jointname,partname in pairs:
 joint=bpy.data.objects[jointname]
 for o in list(bpy.data.objects):
  if o.type=='MESH' and o.parent==joint and 'Cold teal soul' not in o.name:bpy.data.objects.remove(o,do_unlink=True)
 ob=loaded[partname];bpy.context.collection.objects.link(ob);bpy.context.view_layer.update();mw=ob.matrix_world.copy();ob.parent=joint;ob.matrix_world=mw
sword=bpy.data.objects['Joint_Sword'];mw=sword.matrix_world.copy();mw.translation.z+=.058;sword.matrix_world=mw
bpy.context.view_layer.update();bpy.ops.object.select_all(action='SELECT')
glb=ROOT+'/web/public/assets/rpg/candidates/skeleton-concept.glb'
bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',export_image_format='AUTO',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True)
bpy.data.orphans_purge(do_recursive=True);bpy.ops.wm.save_as_mainfile(filepath=OUT+'/skeleton-concept-v26.blend')
stats={'bytes':os.path.getsize(glb),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'mesh_count':len([o for o in bpy.data.objects if o.type=='MESH']),'head_atlas':2048,'body_geometry_changed':False}
open(OUT+'/build-stats.json','w').write(json.dumps(stats,indent=2));result=stats
