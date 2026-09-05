"""Rigid enemy joints retaining baked UVs/materials and shared instancing geometry.

Connected construction islands move as intact bones/armor pieces. This runs after
baking so adding articulation never alters the texture atlas or its readability.
"""
import bpy,bmesh
from mathutils import Vector

def articulate_enemy(name,collection):
    brute=name=='guardian'
    def classify(part,p):
        if part in ('Head','Sword','Cape'):return part
        x,y,z=p;side='R' if x>0 else 'L'
        if abs(x)>(.50 if brute else .205) and z>(.72 if brute else .80):
            return 'ArmUpper'+side if z>(1.31 if brute else 1.12) else 'ArmLower'+side
        if z<(1.02 if brute else .79) and abs(x)>(.14 if brute else .045):
            return 'LegUpper'+side if z>(.49 if brute else .45) else 'LegLower'+side
        return 'Body'
    for src in list(collection.objects):
        if src.type!='MESH':continue
        part=src.name.split('_')[0];verts=src.data.vertices
        adjacency=[[] for _ in verts]
        for edge in src.data.edges:
            a,b=edge.vertices;adjacency[a].append(b);adjacency[b].append(a)
        visited=set();labels={};parts={}
        for v in verts:
            if v.index in visited:continue
            queue=[v.index];visited.add(v.index);island=[]
            while queue:
                i=queue.pop();island.append(i)
                for j in adjacency[i]:
                    if j not in visited:visited.add(j);queue.append(j)
            center=sum((src.matrix_world@verts[i].co for i in island),Vector())/len(island)
            key=classify(part,center);label=parts.setdefault(key,len(parts))
            for i in island:labels[i]=label
        attr=src.data.attributes.new('joint_part','INT','FACE')
        for face in src.data.polygons:attr.data[face.index].value=labels[face.vertices[0]]
        suffix='Glow' if 'Glow' in src.name else 'Baked'
        for key,label in parts.items():
            data=src.data.copy();bm=bmesh.new();bm.from_mesh(data)
            layer=bm.faces.layers.int['joint_part']
            bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[layer]!=label],context='FACES')
            bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
            bm.to_mesh(data);bm.free()
            obj=bpy.data.objects.new(key+'_'+suffix,data);collection.objects.link(obj)
            obj.matrix_world=src.matrix_world;obj['joint']=key
        bpy.data.objects.remove(src,do_unlink=True)
    if brute:
        pivots={'Body':(0,.07,1.15),'Head':(0,-.04,1.89),'Cape':(0,.2,1.8),'Sword':(.8,-.15,.92)}
        for side,sign in [('L',-1),('R',1)]:
            pivots.update({'ArmUpper'+side:(sign*.57,.055,1.74),'ArmLower'+side:(sign*.76,-.012,1.26),'LegUpper'+side:(sign*.28,.035,.90),'LegLower'+side:(sign*.34,-.02,.51)})
    else:
        pivots={'Body':(0,0,1.04),'Head':(0,-.015,1.43),'Cape':(0,.11,1.32),'Sword':(.40,-.145,.89)}
        for side,sign in [('L',-1),('R',1)]:
            pivots.update({'ArmUpper'+side:(sign*.245,0,1.36),'ArmLower'+side:(sign*.335,-.028,1.095),'LegUpper'+side:(sign*.105,0,.80),'LegLower'+side:(sign*.145,-.05,.45)})
    used={obj['joint'] for obj in collection.objects if obj.type=='MESH'}
    joints={}
    for key,pivot in pivots.items():
        if key not in used:continue
        obj=bpy.data.objects.new('Joint_'+key,None);collection.objects.link(obj)
        obj.empty_display_type='PLAIN_AXES';obj.empty_display_size=.08;obj.location=pivot
        obj['enemyJoint']=key;joints[key]=obj
    for key,joint in joints.items():
        parent=None
        if key.startswith('ArmLower'):parent='ArmUpper'+key[-1]
        elif key.startswith('LegLower'):parent='LegUpper'+key[-1]
        elif key=='Sword':parent='ArmLowerR'
        elif key in ('Head','Cape') or key.startswith('ArmUpper'):parent='Body'
        if parent in joints:
            world=joint.matrix_world.copy();joint.parent=joints[parent]
            joint.location=Vector(pivots[key])-Vector(pivots[parent])
    bpy.context.view_layer.update()
    for obj in list(collection.objects):
        if obj.type=='MESH':
            world=obj.matrix_world.copy();obj.parent=joints[obj['joint']];obj.matrix_world=world
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects:obj.select_set(True);obj.hide_render=False
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True)
    print(name,'rigid joints:',list(joints),'mesh parts:',sum(o.type=='MESH' for o in collection.objects))
    return joints
