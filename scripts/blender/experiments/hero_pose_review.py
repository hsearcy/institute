"""Faithful full-pose and isolated grip snapshots for independent review."""
import bpy,bmesh
from mathutils import Matrix,Vector


def grip_snapshot(collection,rig,name):
    """Keep only the right glove and equipped weapon, avoiding figure overlap."""
    snapshot=bpy.data.collections.new('Vault_'+name)
    bpy.context.scene.collection.children.link(snapshot)
    graph=bpy.context.evaluated_depsgraph_get()
    grip=rig.matrix_world@rig.pose.bones['hand.R'].matrix@rig.data.bones['hand.R'].matrix_local.inverted()@Vector((-.600,-.125,1.025))
    for src in collection.objects:
        if src.type!='MESH' or src.hide_render:continue
        part=src.get('sourcePart','')
        if not (part.startswith('clothing') or part=='equipped_sword'):continue
        if part=='equipped_sword' and 'blade' in src.name.lower():continue
        mesh=bpy.data.meshes.new_from_object(src.evaluated_get(graph),depsgraph=graph)
        if part.startswith('clothing'):
            keep=set()
            for face in src.data.polygons:
                center=sum((src.data.vertices[i].co for i in face.vertices),Vector())/len(face.vertices)
                if center.x<-.32 and .9<center.z<1.36:keep.add(face.index)
            bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES')
            loose=[v for v in bm.verts if not v.link_faces]
            if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
            bm.to_mesh(mesh);bm.free()
        mesh.transform(Matrix.Translation(-grip)@src.matrix_world)
        obj=bpy.data.objects.new(name+'_'+src.name,mesh);snapshot.objects.link(obj)
    return snapshot


def pose_snapshot(collection,name):
    """Freeze the currently evaluated full assembly before changing the pose."""
    snapshot=bpy.data.collections.new('Vault_'+name)
    bpy.context.scene.collection.children.link(snapshot)
    graph=bpy.context.evaluated_depsgraph_get()
    for src in collection.objects:
        if src.type!='MESH' or src.hide_render:continue
        mesh=bpy.data.meshes.new_from_object(src.evaluated_get(graph),depsgraph=graph)
        mesh.transform(src.matrix_world)
        obj=bpy.data.objects.new(name+'_'+src.name,mesh);snapshot.objects.link(obj)
    return snapshot
