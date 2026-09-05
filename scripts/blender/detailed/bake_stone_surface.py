"""Bake a seamless original limestone surface for runtime masonry, via Blender MCP.

No atlas reuse: the runtime blocks have projected world-scale UVs. Periodic 4-D
noise makes all three maps tile without borders. Other workshop scenes survive.
"""
import bpy, math
from pathlib import Path

root = Path(__file__).resolve().parents[3]
out = root / 'web/public/assets/rpg/stone'
out.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('Vault seamless stone workshop')
bpy.context.window.scene = scene
bpy.ops.mesh.primitive_plane_add(size=2)
plane = bpy.context.object
material = bpy.data.materials.new('Vault eroded limestone tile')
material.use_nodes = True
plane.data.materials.append(material)
n = material.node_tree.nodes
l = material.node_tree.links
n.clear()
output = n.new('ShaderNodeOutputMaterial')
emission = n.new('ShaderNodeEmission')
l.new(emission.outputs[0], output.inputs['Surface'])
uv = n.new('ShaderNodeTexCoord')
separate = n.new('ShaderNodeSeparateXYZ')
l.new(uv.outputs['UV'], separate.inputs[0])

def math_node(operation, a, b=None):
    node = n.new('ShaderNodeMath'); node.operation = operation
    for index, value in enumerate((a, b)):
        if value is None: continue
        if isinstance(value, (int,float)): node.inputs[index].default_value = value
        else: l.new(value, node.inputs[index])
    return node.outputs[0]

angles = [math_node('MULTIPLY', separate.outputs[axis], math.tau) for axis in ('X','Y')]
periodic = n.new('ShaderNodeCombineXYZ')
for index, socket in enumerate((math_node('COSINE', angles[0]), math_node('SINE', angles[0]), math_node('COSINE', angles[1]))):
    l.new(socket, periodic.inputs[index])
w = math_node('SINE', angles[1])

def noise(scale, detail):
    node = n.new('ShaderNodeTexNoise'); node.noise_dimensions = '4D'
    node.inputs['Scale'].default_value = scale
    node.inputs['Detail'].default_value = detail
    node.inputs['Roughness'].default_value = .73
    l.new(periodic.outputs[0], node.inputs['Vector']); l.new(w, node.inputs['W'])
    return node.outputs['Fac']

def ramp(source, points):
    node = n.new('ShaderNodeValToRGB')
    elements = node.color_ramp.elements
    for i, (position, color) in enumerate(points):
        e = elements[i] if i < 2 else elements.new(position)
        e.position = position; e.color = (*color,1)
    l.new(source, node.inputs[0]); return node.outputs['Color']

broad = noise(1.65, 4)
mid = noise(9, 5)
fine = noise(55, 3)
strata = math_node('ADD', math_node('MULTIPLY', broad,.55), math_node('MULTIPLY', mid,.45))
color = ramp(strata, [(.25,(.042,.045,.037)),(.73,(.31,.285,.23)),(.45,(.115,.12,.10)),(.58,(.22,.205,.17))])
# Dark mineral pores and pale exposed grain affect color and relief together.
pores = ramp(fine, [(.29,(.28,.28,.28)),(.49,(1,1,1))])
multiply = n.new('ShaderNodeMixRGB'); multiply.blend_type = 'MULTIPLY'; multiply.inputs[0].default_value = .65
l.new(color,multiply.inputs[1]); l.new(pores,multiply.inputs[2])
height = math_node('ADD', math_node('ADD',math_node('MULTIPLY',broad,.45),math_node('MULTIPLY',mid,.40)),math_node('MULTIPLY',fine,.15))
roughness = ramp(strata, [(.25,(.97,.97,.97)),(.72,(.65,.65,.65))])
scene.render.engine = 'CYCLES'; scene.cycles.samples = 1
scene.render.bake.margin = 0; scene.render.bake.use_clear = True
scene.view_settings.view_transform = 'Standard'
for name, source in [('albedo',multiply.outputs[0]),('height',height),('roughness',roughness)]:
    if name not in globals().get('STONE_SURFACE_MAPS',('albedo','height','roughness')):continue
    image = bpy.data.images.new('Vault stone '+name, width=1024,height=1024,alpha=False)
    if name != 'albedo': image.colorspace_settings.name = 'Non-Color'
    target = n.new('ShaderNodeTexImage'); target.image=image
    for node in n: node.select=False
    target.select=True; n.active=target
    l.new(source,emission.inputs['Color'])
    bpy.ops.object.bake(type='EMIT')
    image.filepath_raw=str(out/(name+'.png')); image.file_format='PNG'; image.save()
    n.remove(target)
print('STONE_SURFACE_BAKED',str(out))
