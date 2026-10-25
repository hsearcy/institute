import bpy, sys
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
for o in bpy.context.scene.objects:
    print('OBJ', o.name, o.type, 'parent', o.parent.name if o.parent else None, 'loc', tuple(round(v, 3) for v in o.matrix_world.translation), 'rot', tuple(round(v, 3) for v in o.matrix_world.to_euler()), 'scale', tuple(round(v,3) for v in o.matrix_world.to_scale()))
    if o.type == 'MESH':
        print('  verts', len(o.data.vertices), 'groups', len(o.vertex_groups), [m.type for m in o.modifiers], [g.name for g in o.vertex_groups][:8])
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = Vector([min(p[i] for p in ws) for i in range(3)]); hi = Vector([max(p[i] for p in ws) for i in range(3)])
        print('  bounds', tuple(round(v,3) for v in lo), tuple(round(v,3) for v in hi))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
for b in ('Head', 'L_Hand', 'R_Hand', 'L_Foot', 'L_ToeBase', 'Spine02'):
    bone = arm.data.bones[b]; print('BONE', b, tuple(round(v,3) for v in (arm.matrix_world @ bone.head_local)), tuple(round(v,3) for v in (arm.matrix_world @ bone.tail_local)))
