"""Rebuild the original game models in Blender 4.5+.

  blender --background --factory-startup --python scripts/blender/build_assets.py

The production assets were created and iterated via Blender MCP, executing these
same helpers in a dedicated GUI session. This entry point also supports headless
rebuilds without an MCP server. It creates a fresh scene and preserves prior scenes.
"""
import bpy
from pathlib import Path

RPG_REPO_ROOT=Path(__file__).resolve().parents[2]
source=RPG_REPO_ROOT/'scripts/blender'
scene=bpy.data.scenes.new('Sunken Vault asset workshop')
bpy.context.window.scene=scene
for script in ('common.py','characters.py','props.py'):
    exec(compile((source/script).read_text(),str(source/script),'exec'))
OUT.mkdir(parents=True,exist_ok=True)
for name in ('hero','imp','guardian','pillar','arch','brazier','crystal','chest','wall'):
    print(export_asset(name,globals()['make_'+name]()))
