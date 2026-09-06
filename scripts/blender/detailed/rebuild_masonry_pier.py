"""Canonical rebuild of reviewed full-height piers and three-course posts."""
from pathlib import Path
import runpy
import shutil


def rebuild_masonry_pier(repo_root, short=False):
    root = Path(repo_root)
    source = root / 'scripts/blender/detailed'
    builder = runpy.run_path(str(source / 'masonry_pier.py'))
    baker = runpy.run_path(str(source / 'bake_masonry.py'))
    name = 'masonry-post' if short else 'masonry-pier'
    scene, collection = builder['build_masonry_pier'](root, short=short)
    state = baker['prepare_bake'](scene, collection, root / f'tmp/{name}-build',
                                 minimum_chart_pixels=4 if short else 0)
    for channel in ('albedo', 'normal', 'orm'):
        baker['bake_channel'](state, channel)
    candidate = baker['finish_bake'](state)
    target = root / f'web/public/assets/rpg/{name}.glb'
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(candidate, target)
    return target
