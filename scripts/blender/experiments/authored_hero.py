"""Reviewed CC0 hooded-warrior foundation for the canonical Wayfarer rebuild.

Load through Blender MCP. Preserve the licensed garment construction and all
existing scenes. Only the dedicated canonical wrapper promotes its packed export.
"""
from pathlib import Path
import hashlib
import bpy

SOURCE_SHA = '3f48d820b532677426ebae5ad77175faefc55f0ef4b071f523a4a97b5ab253ce'

def load_authored_warrior(root):
    path = Path(root)/'scripts/blender/sources/cc0-hooded-warrior/warrior-foundation.blend'
    if not path.exists():
        raise FileNotFoundError('Restore the licensed source: python scripts/blender/sources/cc0-hooded-warrior/fetch.py')
    with path.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != SOURCE_SHA:
            raise ValueError('Authored warrior source differs from the reviewed file')
    with bpy.data.libraries.load(str(path), link=False) as (source, target):
        target.scenes = source.scenes
    scene = target.scenes[0]
    scene.name = 'Authored CC0 hero adaptation workshop'
    bpy.context.window.scene = scene

    def enable(layer):
        layer.exclude = False
        layer.hide_viewport = False
        layer.collection.hide_viewport = False
        for child in layer.children:
            enable(child)

    for view_layer in scene.view_layers:
        enable(view_layer.layer_collection)
    for obj in scene.objects:
        obj.hide_set(False)
        obj.hide_viewport = False
    bpy.context.view_layer.update()
    return scene

def source_review(scene, name='authored-hero-candidate', height=1.85):
    """Snapshot evaluated source body parts; exclude its checkerboard set."""
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    collection = bpy.data.collections.new('Vault_'+name)
    scene.collection.children.link(collection)
    for source in list(scene.objects):
        if source.type != 'MESH' or source.name.startswith('Plane'):
            continue
        evaluated = source.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
        mesh.transform(evaluated.matrix_world)
        obj = bpy.data.objects.new(source.name+'_review', mesh)
        collection.objects.link(obj)
        obj['sourcePart'] = source.name
    low = min(v.co.z for obj in collection.objects for v in obj.data.vertices)
    high = max(v.co.z for obj in collection.objects for v in obj.data.vertices)
    factor = height/(high-low)
    for obj in collection.objects:
        for vertex in obj.data.vertices:
            vertex.co.z -= low
            vertex.co *= factor
    return collection

def control_metal_response(collection):
    """Broaden metallic highlights while leaving authored cloth/leather intact."""
    copies = {}
    for obj in collection.objects:
        for index, original in enumerate(list(obj.data.materials)):
            if not original or not original.name.split('.')[0] in ('set1','set2','set3'):
                continue
            if original not in copies:
                material = original.copy()
                material.name = 'Authored hero controlled steel '+original.name
                nodes = material.node_tree.nodes
                links = material.node_tree.links
                shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
                metallic = shader.inputs['Metallic'].links[0].from_socket
                roughness = shader.inputs['Roughness'].links[0].from_socket
                remap = nodes.new('ShaderNodeMapRange')
                remap.label = 'Weathered steel broad highlights, retain relative wear'
                remap.inputs['To Min'].default_value = .38
                remap.inputs['To Max'].default_value = .74
                links.new(roughness, remap.inputs['Value'])
                mix = nodes.new('ShaderNodeMixRGB')
                mix.blend_type = 'MIX'
                links.new(metallic, mix.inputs[0])
                links.new(roughness, mix.inputs[1])
                links.new(remap.outputs['Result'], mix.inputs[2])
                links.new(mix.outputs['Color'], shader.inputs['Roughness'])
                for normal in [n for n in nodes if n.type == 'NORMAL_MAP']:
                    strength = nodes.new('ShaderNodeMapRange')
                    strength.label = 'Steel micro-normal restraint; cloth normals unchanged'
                    strength.inputs['To Min'].default_value = 1
                    strength.inputs['To Max'].default_value = .6
                    links.new(metallic, strength.inputs['Value'])
                    links.new(strength.outputs['Result'], normal.inputs['Strength'])
                copies[original] = material
            obj.data.materials[index] = copies[original]
    return collection
