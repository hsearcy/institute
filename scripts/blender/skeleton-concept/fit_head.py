"""Fit a smaller skull and a lower, deeper helmet. Preserve all body geometry and UVs."""
import bpy
from mathutils import Vector
OUT='/home/hfsearcy/git/institute/docs/concepts/skeleton-model'
pivot=Vector((0,.015,1.60))
changes=[]
for ob in list(bpy.data.objects):
    if ob.type!='MESH' or not ob.parent or ob.parent.name!='head':continue
    mw=ob.matrix_world.copy();inv=mw.inverted()
    skull='Old ivory' in ob.name
    eye='Cold teal soul' in ob.name
    if skull or eye:
        for v in ob.data.vertices:v.co=inv@(pivot+(mw@v.co-pivot)*.85)
        changes.append({'part':ob.name,'scale':.85})
    else:
        for v in ob.data.vertices:
            p=mw@v.co;p.y=.009+(p.y-.009)*1.06;p.z-=.025;v.co=inv@p
        changes.append({'part':ob.name,'depth_scale':1.06,'lowered_m':.025})
    ob.data.update()
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/head-fit-v21.blend')
result={'head_changes':changes,'body_geometry_changed':False,'uv_changed':False}
