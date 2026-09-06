"""Reproduce the complete opted-in hero candidate; never promote automatically.

Run through Blender MCP, or import this module in Blender and call
build_authored_hero_candidate(repo_root). Missing ignored CC0 caches fail with
explicit fetch instructions. All existing scenes and public heroes are preserved.
"""
from pathlib import Path
import bpy,subprocess


def build_authored_hero_candidate(repo_root, output=None):
    root=Path(repo_root);directory=root/'scripts/blender/experiments'
    output=Path(output) if output is not None else directory/'exports/hero'
    if not output.resolve().is_relative_to((directory/'exports').resolve()):
        raise ValueError('Candidate builds must stay inside ignored experimental exports')
    output.mkdir(parents=True,exist_ok=True)
    previous=bpy.context.window.scene
    namespace={'__name__':'authored_hero_candidate_build'}
    for filename in ('rebuild_authored_hero_study.py','rig_authored_hero.py',
                     'inspect_authored_hero_motion.py','bake_authored_hero.py','export_authored_hero.py'):
        exec(compile((directory/filename).read_text(),str(directory/filename),'exec'),namespace)
    try:
        scene,collection,rig=namespace['rebuild_authored_hero_study'](root,name='authored-hero-rebuild')
        namespace['author_hero_actions'](rig)
        namespace['inspect_authored_hero_motion'](collection,rig,output/'motion.json')
        namespace['bake_hero_collection_materials'](collection,output/'maps')
        namespace['export_authored_hero_candidate'](collection,rig,output/'hero-raw.glb')
        subprocess.run(['python',str(directory/'pack_authored_hero.py'),str(output/'hero-raw.glb'),str(output/'hero-packed.glb')],check=True)
        subprocess.run(['python',str(directory/'validate_authored_hero_candidate.py'),str(output/'hero-packed.glb')],check=True)
        return output/'hero-packed.glb'
    finally:
        bpy.context.window.scene=previous
