"""Rebuild the detailed game models and UV-baked PBR maps in Blender 4.5+.

  blender --background --factory-startup --python scripts/blender/build_assets.py

The production assets were created and iterated via Blender MCP, executing these
same helpers in a dedicated GUI session. This entry point also supports headless
rebuilds without an MCP server. It creates a fresh scene and preserves prior scenes.
"""
import bpy
from pathlib import Path
import random,shutil,subprocess

RPG_REPO_ROOT=Path(__file__).resolve().parents[2]
source=RPG_REPO_ROOT/'scripts/blender'
scene=bpy.data.scenes.new('Vault detailed workshop')
bpy.context.window.scene=scene
for script in ('common.py','detailed/materials.py'):
    exec(compile((source/script).read_text(),str(source/script),'exec'))
MATS.update(detailed_materials())
for script in ('detailed/geometry.py','detailed/architecture.py','detailed/characters.py','detailed/hero_variants.py','props.py','detailed/props.py','detailed/landmarks.py','detailed/ice_cluster.py','detailed/bake.py','detailed/rig_hero.py','detailed/articulate_enemies.py'):
    exec(compile((source/script).read_text(),str(source/script),'exec'))
OUT.mkdir(parents=True,exist_ok=True)
for name in ('pillar','arch','wall','wall-bay','broken-wall','hero','hero-cinder','hero-glacier','hero-tempest','skeleton','wraith','guardian','brazier','crystal','chest','furnace','reliquary','ice_cluster'):
    random.seed(312 if name in ('furnace','reliquary') else 214)
    function=globals()['make_'+name.replace('-','_')+'_v2']
    collection=function()
    print(bake_asset(name,collection,512 if name in ('pillar','brazier','crystal','chest','ice_cluster') else 1024))
    if name=='hero' or name.startswith('hero-'):rig_hero(collection,name)
    if name in ('skeleton','guardian'):articulate_enemy(name,collection)
subprocess.run(['python',str(source/'detailed/optimize_assets.py')],check=True)
# Preserve the legacy load path as a compatible skeletal minion, not the old toy imp.
shutil.copyfile(OUT/'skeleton.glb',OUT/'imp.glb')
# Runtime masonry uses a seamless surface, separate from the model UV atlases.
surface_script=source/'detailed/bake_stone_surface.py'
exec(compile(surface_script.read_text(),str(surface_script),'exec'),{'__file__':str(surface_script)})

# Portraits are always rendered from the final optimized runtime GLBs.
portrait_script=source/'detailed/render_appearances.py'
portrait_namespace={'__name__':'vault_portraits','__file__':str(portrait_script)}
exec(compile(portrait_script.read_text(),str(portrait_script),'exec'),portrait_namespace)
portrait_namespace['render_appearance_portraits'](RPG_REPO_ROOT)
