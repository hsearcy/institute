"""Raise the sword to put the leather grip inside the rebuilt right hand."""
import bpy
s=bpy.data.objects['sword'];mw=s.matrix_world.copy();mw.translation.z+=.058;s.matrix_world=mw
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath='/home/hfsearcy/git/institute/docs/concepts/skeleton-model/details-source-v26.blend')
result={'sword_raised_m':.058}
