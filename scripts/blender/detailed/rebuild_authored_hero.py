"""Canonical default hero, preserving the reviewed authored source and UVs.

The legacy armor variants retain their independent builder. Missing licensed
source caches fail with fetch instructions; never replace this hero with a
procedural fallback. Existing Blender scenes are preserved by the builder.
"""
from pathlib import Path
import runpy,shutil


def rebuild_authored_hero(repo_root, portrait=True):
    root=Path(repo_root);source=root/'scripts/blender'
    build=runpy.run_path(str(source/'experiments/build_authored_hero_candidate.py'))['build_authored_hero_candidate']
    candidate=build(root,source/'experiments/exports/hero-canonical')
    output=root/'web/public/assets/rpg/hero.glb'
    temporary=output.with_suffix('.glb.tmp')
    shutil.copyfile(candidate,temporary);temporary.replace(output)
    if portrait:
        render=runpy.run_path(str(source/'detailed/render_authored_hero_portrait.py'))['render_authored_hero_portrait']
        render(root)
    return output
