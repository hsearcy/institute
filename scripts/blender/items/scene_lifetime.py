"""Audit and archive explicitly selected obsolete item source studies only.

Does not search for or purge global orphans. Accepted/bake/export/character
scenes are outside this helper's scope; callers supply exact obsolete names.
"""
import hashlib
import json
from pathlib import Path

import bpy


def audit():
    return [dict(name=scene.name, item_ids=scene.get('item_ids'),
                 objects=len(scene.objects),
                 mesh_vertices=sum(len(obj.data.vertices) for obj in scene.objects
                                   if obj.type == 'MESH'))
            for scene in bpy.data.scenes
            if scene.name.startswith('Unique item source study')]


def archive_and_retire(names, directory, preserve_names):
    """Require reviewed exact names and a new recovery archive before unlinking."""
    names=set(names); protected=set(preserve_names)
    if names & protected:
        raise ValueError('An explicitly preserved study was selected')
    caller=bpy.context.window.scene
    scenes=[bpy.data.scenes[name] for name in sorted(names)]
    for scene in scenes:
        if scene == caller or not scene.name.startswith('Unique item source study'):
            raise ValueError('Only inactive item source studies may be retired')
        if not scene.get('item_ids'):
            raise ValueError('Missing item source ownership metadata')
    directory=Path(directory)
    directory.mkdir(parents=True,exist_ok=True)
    archive=directory/'obsolete-item-studies.blend'
    report=directory/'obsolete-item-studies.json'
    if archive.exists() or report.exists():
        raise FileExistsError('Recovery archives must never be overwritten')
    scene_set=set(scenes)
    objects={obj for scene in scenes for obj in scene.objects
             if set(obj.users_scene).issubset(scene_set)}
    meshes={obj.data for obj in objects if obj.type=='MESH'}
    before=[row for row in audit() if row['name'] in names]
    # Blender writes the dependency closure, preserving original geometry,
    # materials, world, and image references in the recovery file.
    bpy.data.libraries.write(str(archive),scene_set,path_remap='ABSOLUTE',
                             fake_user=True,compress=True)
    if archive.stat().st_size < 100:
        raise RuntimeError('Recovery archive was not written')
    digest=hashlib.sha256(archive.read_bytes()).hexdigest()
    result=dict(scenes=before,archive=str(archive),sha256=digest,
                status='archived; retirement pending')
    report.write_text(json.dumps(result,indent=2)+'\n')
    for obj in objects:
        bpy.data.objects.remove(obj,do_unlink=True)
    for scene in scenes:
        bpy.data.scenes.remove(scene)
    for mesh in meshes:
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    result['status']='archived and retired'
    result['removed_objects']=len(objects)
    report.write_text(json.dumps(result,indent=2)+'\n')
    return result
