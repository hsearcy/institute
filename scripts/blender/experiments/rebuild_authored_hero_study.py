"""Recover the opt-in authored hero study after a Blender restart.

Run through Blender MCP with the user's exact model-creation prompt. This never
exports or replaces a public hero, and never removes another Blender scene.
"""
from pathlib import Path
import bpy


def rebuild_authored_hero_study(root, name='authored-hero-equipped-study', equipped=True, source_scene=None):
    root=Path(root)
    namespace={}
    for filename in ('authored_hero.py','rig_authored_hero.py'):
        exec((root/'scripts/blender/experiments'/filename).read_text(),namespace)
    if source_scene is None:source_scene=namespace['load_authored_warrior'](root)
    collection=namespace['source_review'](source_scene,name=name,height=1.85)
    namespace['control_metal_response'](collection)
    # Put the derived collection into its own scene before any mutations.
    scene=bpy.data.scenes.new('Authored hero equipped reconstruction')
    scene.collection.children.link(collection)
    source_scene.collection.children.unlink(collection)
    bpy.context.window.scene=scene
    if equipped:namespace['draw_authored_sword'](collection)
    namespace['optimize_authored_hero'](collection)
    rig=namespace['attach_authored_hero_rig'](collection)
    namespace['set_authored_pose'](rig,'cast')
    collection['sourceSHA256']=namespace['SOURCE_SHA']
    collection['status']='Reviewed authored Wayfarer foundation; isolated rebuild stage'
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons)
                  for o in collection.objects if o.type=='MESH')
    print('Reconstructed hero study:',scene.name,collection.name,
          'triangles',triangles,'bones',len(rig.data.bones))
    return scene,collection,rig
