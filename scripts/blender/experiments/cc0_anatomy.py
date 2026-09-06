"""Adapt licensed Blender Studio anatomy into the experimental wraith pose.

Source provenance, CC0 license and content hashes: ../sources/blender-studio/.
This module is not used by the production asset build.
"""
import bpy
import re
from mathutils import Matrix, Vector


def cc0_sources():
    global CC0_BONES, CC0_SKULL
    if globals().get('CC0_BONES') and globals().get('CC0_SKULL'):
        return
    folder=RPG_REPO_ROOT/'scripts/blender/sources/blender-studio'
    with bpy.data.libraries.load(str(folder/'realistic-skeleton.blend'),link=False) as (source,target):
        target.objects=[n for n in source.objects if any(k in n for k in ('arm_','hand_center','metacarpal.','proximal.','middle.','distal.'))]
    CC0_BONES={re.sub(r'\.\d{3}$', '', o.name.removeprefix('GEO-skeletion.')):o for o in target.objects if o}
    # Appended source objects remain unlinked. Only independent adapted copies
    # enter the dedicated candidate collection; existing scenes are untouched.
    with bpy.data.libraries.load(str(folder/'realistic-skull.blend'),link=False) as (source,target):
        target.objects=['Skull - Realistic']
    CC0_SKULL=target.objects[0]


def cc0_source_matrix(obj):
    # Unlinked library objects have unevaluated identity matrix_world. Their
    # authored local transforms are valid and share the skeleton coordinates.
    basis = obj.matrix_basis.copy()
    return cc0_source_matrix(obj.parent) @ obj.matrix_parent_inverse @ basis if obj.parent else basis


def cc0_points(obj):
    return [cc0_source_matrix(obj)@v.co for v in obj.data.vertices]


def cc0_center(obj):
    points=cc0_points(obj)
    return sum(points,Vector())/len(points)


def cc0_end(obj,direction,high=False):
    points=cc0_points(obj);order=sorted(points,key=lambda p:p.dot(direction),reverse=high)
    take=order[:max(4,len(order)//12)]
    return sum(take,Vector())/len(take)


def cc0_copy(obj,name,transform,material='wraithBone',ratio=None):
    mesh=obj.data.copy();new=bpy.data.objects.new(name,mesh);CURRENT.objects.link(new)
    for vertex in mesh.vertices:vertex.co=transform@(cc0_source_matrix(obj)@vertex.co)
    mesh.materials.clear();mesh.materials.append(MATS[material]);new['part']=PART
    for polygon in mesh.polygons:polygon.use_smooth=True
    if ratio:
        bpy.context.view_layer.objects.active=new
        mod=new.modifiers.new('Preserve authored anatomical landmarks','DECIMATE');mod.ratio=ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return new


def cc0_segment(objects,start,end,target_start,target_end):
    direction=end-start;desired=target_end-target_start
    rotation=direction.rotation_difference(desired).to_matrix().to_4x4()
    scale=Matrix.Scale(desired.length/direction.length,4)
    matrix=Matrix.Translation(target_start)@rotation@scale@Matrix.Translation(-start)
    return [cc0_copy(o,'Authored '+o.name.removeprefix('GEO-skeletion.'),matrix) for o in objects]


def make_cc0_wraith_arm(label,S,E,W):
    cc0_sources()
    # Source L is positive X; the established game asset's L is negative X.
    side='R' if label=='L' else 'L'
    bone=lambda name:CC0_BONES[name+'.'+side]
    humerus=bone('arm_humerus');radius=bone('arm_radius');ulna=bone('arm_ulna')
    shoulder=cc0_end(humerus,Vector((0,0,1)),True)
    elbow=cc0_end(humerus,Vector((0,0,1)),False)
    cc0_segment([humerus],shoulder,elbow,S,E)
    upper=(cc0_end(radius,Vector((0,0,1)),True)+cc0_end(ulna,Vector((0,0,1)),True))/2
    wrist=(cc0_end(radius,Vector((0,0,1)),False)+cc0_end(ulna,Vector((0,0,1)),False))/2
    cc0_segment([radius,ulna],upper,wrist,E,W)
    center=bone('hand_center')
    longitudinal=(cc0_center(bone('distal.middle'))-wrist).normalized()
    lateral=(cc0_center(bone('metacarpal.index'))-cc0_center(bone('metacarpal.little'))).normalized()
    lateral=(lateral-longitudinal*lateral.dot(longitudinal)).normalized()
    normal=longitudinal.cross(lateral).normalized()
    basis=Matrix((lateral,normal,longitudinal)).transposed()
    desired=Vector((.03,-.44,-.90)) if label=='L' else Vector((-.96,-.24,.10))
    desired.normalize()
    across=Vector((1,0,0)) if label=='L' else Vector((0,0,1))
    across=(across-desired*across.dot(desired)).normalized()
    facing=desired.cross(across).normalized()
    target_basis=Matrix((across,facing,desired)).transposed()
    align=(target_basis@basis.transposed()).to_4x4()
    transform=Matrix.Translation(W)@align@Matrix.Scale(1.12,4)@Matrix.Translation(-wrist)
    cc0_copy(center,'Authored carpal bones '+label,transform)
    for finger in ('index','middle','ring','little','thumb'):
        meta=bone('metacarpal.'+finger);cc0_copy(meta,'Authored metacarpal '+finger+' '+label,transform)
        stages=['proximal','distal'] if finger=='thumb' else ['proximal','middle','distal']
        accumulated=Matrix.Identity(4)
        for number,stage in enumerate(stages):
            obj=bone(stage+'.'+finger);joint=cc0_end(obj,longitudinal,False)
            bend=([.10,.22,.32] if label=='L' else [.44,.57,.48])[number]
            bend*=.62 if finger=='thumb' else {'index':.85,'middle':1,'ring':1.16,'little':1.30}[finger]
            # Finger flexions are cumulative around real phalangeal pivots.
            rotate=Matrix.Translation(joint)@Matrix.Rotation(bend,4,lateral)@Matrix.Translation(-joint)
            accumulated=accumulated@rotate
            cc0_copy(obj,'Authored '+stage+' '+finger+' '+label,transform@accumulated)


def make_cc0_wraith_skull(center=(-.065,-.250,1.630)):
    cc0_sources()
    obj=CC0_SKULL;points=cc0_points(obj)
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    midpoint=(low+high)/2
    # Retain the source's actual facial planes, orbital cavity, cheek arches,
    # maxilla and jaw; only modestly elongate it for the crypt sentinel.
    size=high-low;scale=Matrix.Diagonal(Vector((.170/size.x,.174/size.y,.264/size.z,1)))
    transform=Matrix.Translation(Vector(center))@scale@Matrix.Translation(-midpoint)
    return cc0_copy(obj,'Authored CC0 crypt sentinel skull',transform,ratio=.24)
