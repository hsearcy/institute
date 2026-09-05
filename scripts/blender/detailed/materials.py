"""Procedural, physically based source shaders for the detailed asset revision.

These are baked to UV albedo / tangent normals / occlusion-roughness-metallic by
bake.py. Runtime GLBs retain the surface detail; no Blender-only nodes are shipped.
"""
import bpy, math, random

def source_material(name,base,kind='stone',metal=0,rough=.8):
    m=bpy.data.materials.new('Vault2_'+name);m.use_nodes=True
    m.diffuse_color=(*base,1);m['surface']=kind
    n=m.node_tree.nodes;l=m.node_tree.links;n.clear()
    out=n.new('ShaderNodeOutputMaterial');out.location=(750,100)
    p=n.new('ShaderNodeBsdfPrincipled');p.location=(500,100)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    l.new(p.outputs['BSDF'],out.inputs['Surface'])
    pos=n.new('ShaderNodeNewGeometry');pos.location=(-1100,0)
    def noise(scale,detail=3):
        a=n.new('ShaderNodeTexNoise');a.inputs['Scale'].default_value=scale
        a.inputs['Detail'].default_value=detail;a.inputs['Roughness'].default_value=.72
        l.new(pos.outputs['Position'],a.inputs['Vector']);return a
    broad=noise(2.6,4);mid=noise(17,4);fine=noise(115,2)
    color=n.new('ShaderNodeValToRGB');color.location=(-300,400)
    color.color_ramp.elements[0].position=.17;color.color_ramp.elements[0].color=(*(c*.46 for c in base),1)
    color.color_ramp.elements[1].position=.84;color.color_ramp.elements[1].color=(*(min(1,c*1.58) for c in base),1)
    l.new(broad.outputs['Fac'],color.inputs[0])
    mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=.34
    l.new(color.outputs['Color'],mult.inputs[1]);l.new(mid.outputs['Fac'],mult.inputs[2])
    base_output=mult.outputs[0]
    if kind in ('stone','metal','bone'):
        dirt=noise(5.2,4)
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.56;ramp.color_ramp.elements[1].position=.75
        l.new(dirt.outputs['Fac'],ramp.inputs[0])
        patch=n.new('ShaderNodeMixRGB');l.new(ramp.outputs[0],patch.inputs[0]);l.new(base_output,patch.inputs[1])
        patch.inputs[2].default_value=(.018,.034,.022,1) if kind=='stone' else (.017,.042,.035,1) if kind=='metal' else (.26,.22,.15,1)
        base_output=patch.outputs[0]
    l.new(base_output,p.inputs['Base Color'])
    rr=n.new('ShaderNodeMapRange');rr.inputs['From Min'].default_value=0;rr.inputs['From Max'].default_value=1
    rr.inputs['To Min'].default_value=max(.18,rough-.20);rr.inputs['To Max'].default_value=min(.98,rough+.12)
    l.new(mid.outputs['Fac'],rr.inputs['Value']);l.new(rr.outputs['Result'],p.inputs['Roughness'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.46;bump.inputs['Distance'].default_value=.028 if kind=='stone' else .007
    l.new(mid.outputs['Fac'],bump.inputs['Height'])
    micro=n.new('ShaderNodeBump');micro.inputs['Strength'].default_value=.32;micro.inputs['Distance'].default_value=.007 if kind=='stone' else .002
    l.new(fine.outputs['Fac'],micro.inputs['Height']);l.new(bump.outputs['Normal'],micro.inputs['Normal'])
    if kind=='cloth':
        wave=n.new('ShaderNodeTexWave');wave.wave_type='BANDS';wave.bands_direction='X';wave.inputs['Scale'].default_value=140
        wave.inputs['Distortion'].default_value=2;l.new(pos.outputs['Position'],wave.inputs['Vector'])
        l.new(wave.outputs['Color'],micro.inputs['Height']);micro.inputs['Distance'].default_value=.0015
    if kind=='wood':
        grain=n.new('ShaderNodeTexWave');grain.wave_type='BANDS';grain.bands_direction='X'
        grain.inputs['Scale'].default_value=45;grain.inputs['Distortion'].default_value=9
        grain.inputs['Detail'].default_value=4;l.new(pos.outputs['Position'],grain.inputs['Vector'])
        l.new(grain.outputs['Color'],bump.inputs['Height']);bump.inputs['Distance'].default_value=.004
        grainmix=n.new('ShaderNodeMixRGB');grainmix.blend_type='MULTIPLY';grainmix.inputs[0].default_value=.32
        l.new(base_output,grainmix.inputs[1]);l.new(grain.outputs['Color'],grainmix.inputs[2]);l.new(grainmix.outputs[0],p.inputs['Base Color'])
    l.new(micro.outputs['Normal'],p.inputs['Normal'])
    return m

def detailed_materials():
    return {
      'stone':source_material('weathered limestone',(.15,.122,.090)),
      'stoneLight':source_material('worn edge limestone',(.23,.20,.155)),
      'stoneDark':source_material('soot stained limestone',(.065,.058,.046)),
      'bronze':source_material('oxidized bronze',(.31,.16,.052),'metal',.78,.49),
      'gold':source_material('old brass',(.43,.235,.069),'metal',.82,.38),
      'iron':source_material('blackened steel',(.075,.085,.085),'metal',.72,.56),
      'steel':source_material('worn blade steel',(.29,.31,.29),'metal',.85,.33),
      'bone':source_material('stained old ivory',(.52,.45,.33),'bone',0,.79),
      'leather':source_material('cracked dark leather',(.055,.025,.012),'leather',0,.81),
      'teal':source_material('weathered teal wool',(.014,.16,.155),'cloth',0,.86),
      'tealLight':source_material('faded teal seam',(.015,.16,.15),'cloth',0,.83),
      'tealDark':source_material('deep teal wool',(.006,.055,.059),'cloth',0,.9),
      'shadow':source_material('recess shadow',(.008,.009,.008),'leather',0,.98),
      'wood':source_material('weathered oak',(.080,.039,.012),'wood',0,.8),
    }
