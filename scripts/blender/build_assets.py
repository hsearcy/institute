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
for script in ('detailed/geometry.py','detailed/architecture.py','detailed/characters.py','props.py','detailed/props.py','detailed/bake.py','detailed/rig_hero.py','detailed/articulate_enemies.py'):
    exec(compile((source/script).read_text(),str(source/script),'exec'))
OUT.mkdir(parents=True,exist_ok=True)
for name in ('pillar','arch','wall','wall-bay','broken-wall','hero','skeleton','wraith','guardian','brazier','crystal','chest'):
    random.seed(214)
    function=globals()['make_'+name.replace('-','_')+'_v2']
    print(bake_asset(name,function(),512 if name in ('pillar','brazier','crystal','chest') else 1024))
    if name=='hero':rig_hero(bpy.data.collections['Vault_hero'])
    if name in ('skeleton','guardian'):articulate_enemy(name,bpy.data.collections['Vault_'+name])
subprocess.run(['python',str(source/'detailed/optimize_assets.py')],check=True)
# Preserve the legacy load path as a compatible skeletal minion, not the old toy imp.
shutil.copyfile(OUT/'skeleton.glb',OUT/'imp.glb')
