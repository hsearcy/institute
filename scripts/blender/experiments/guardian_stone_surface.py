"""Optional isolated scanned-stone source control; never installs public assets.

The authored-position attribute survives joined-source baking. Construction and
material reviews remain separate: this does not grant the model an art pass.
"""
from pathlib import Path
import hashlib
import json
import bpy


def apply(collection, root='/home/houston/git/institute'):
    source = Path(root) / 'scripts/blender/sources/rock-face-03'
    manifest = json.loads((source / 'manifest.json').read_text())
    images = {}
    for kind in ('Diffuse', 'Rough', 'Displacement'):
        path = source / (kind + '.jpg')
        if hashlib.sha256(path.read_bytes()).hexdigest() != manifest[kind]['sha256']:
            raise ValueError('Unverified source map: ' + kind)
        images[kind] = bpy.data.images.load(str(path), check_existing=True)
        if kind != 'Diffuse': images[kind].colorspace_settings.name = 'Non-Color'
    materials = {}
    for obj in collection.objects:
        if obj.type != 'MESH': continue
        eligible = [i for i, m in enumerate(obj.data.materials) if m and m.name.startswith('Vault_stoneOld')]
        if not eligible: continue
        coordinates = obj.data.attributes.get('GuardianStonePosition') or obj.data.attributes.new('GuardianStonePosition', 'FLOAT_VECTOR', 'POINT')
        for vertex, value in zip(obj.data.vertices, coordinates.data):
            value.vector = obj.matrix_world @ vertex.co
        for index in eligible:
            old = obj.data.materials[index]
            if old not in materials:
                mat = old.copy(); mat.name = old.name + ' verified rock surface control'
                nodes, links = mat.node_tree.nodes, mat.node_tree.links
                nodes.clear(); output = nodes.new('ShaderNodeOutputMaterial'); p = nodes.new('ShaderNodeBsdfPrincipled')
                p.inputs['Specular IOR Level'].default_value = .25
                links.new(p.outputs['BSDF'], output.inputs['Surface'])
                coordinates_node = nodes.new('ShaderNodeAttribute'); coordinates_node.attribute_name = 'GuardianStonePosition'
                mapping = nodes.new('ShaderNodeVectorMath'); mapping.operation = 'SCALE'; mapping.inputs[3].default_value = .72
                links.new(coordinates_node.outputs['Vector'], mapping.inputs[0])
                def texture(kind):
                    node = nodes.new('ShaderNodeTexImage'); node.image = images[kind]
                    node.projection = 'BOX'; node.projection_blend = .18
                    links.new(mapping.outputs['Vector'], node.inputs['Vector']); return node
                diffuse = texture('Diffuse'); sat = nodes.new('ShaderNodeHueSaturation')
                sat.inputs['Saturation'].default_value = .3; sat.inputs['Value'].default_value = 1.15
                links.new(diffuse.outputs['Color'], sat.inputs['Color'])
                tint = (.065,.075,.07) if 'Dark' in old.name else (.21,.22,.195) if 'Light' in old.name else (.155,.17,.15)
                mix = nodes.new('ShaderNodeMixRGB'); mix.inputs[0].default_value = .58
                mix.inputs[1].default_value = (*tint,1); links.new(sat.outputs['Color'], mix.inputs[2])
                links.new(mix.outputs[0], p.inputs['Base Color'])
                rough = texture('Rough'); remap = nodes.new('ShaderNodeMapRange')
                remap.inputs['To Min'].default_value = .75; remap.inputs['To Max'].default_value = .96
                links.new(rough.outputs['Color'], remap.inputs['Value']); links.new(remap.outputs['Result'], p.inputs['Roughness'])
                height = texture('Displacement'); bump = nodes.new('ShaderNodeBump')
                bump.inputs['Strength'].default_value = .34; bump.inputs['Distance'].default_value = .009
                links.new(height.outputs['Color'], bump.inputs['Height']); links.new(bump.outputs['Normal'], p.inputs['Normal'])
                mat['sourceLicense'] = 'CC0: Poly Haven rock_face_03; repository manifest verifies exact images'
                materials[old] = mat
            obj.data.materials[index] = materials[old]
    if len(materials) != 3: raise ValueError('Expected all three stone materials, found ' + str(len(materials)))
    return {'materials': len(materials), 'source': str(source), 'status': 'Source material control; not accepted'}
