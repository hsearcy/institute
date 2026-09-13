"""Shaped closed weapon bodies, ground bevels and rounded grip cross-sections."""
import sys,math,json,bpy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent));import common
# Pixel grip centers and guard/handle bounds are measured on original cropped references.
CONFIG={
'apprentice':(.4949,.825,.68,.73,.90), 'glacier':(.6136,.745,.61,.65,.85),
'thunderrod':(.534,.73,.48,.66,.87), 'cleaver':(.6585,.79,.67,.71,.91),
'starfall':(.5142,.80,.70,.75,.91),'phoenix_talon':(.6083,.79,.65,.70,.91),
'sunforged':(.4984,.14,.28,.06,.20),'icespear':(.50,.56,.50,.50,.69),
'tideglass':(.4567,.80,.68,.73,.91),'hailcaller':(.5483,.69,.49,.56,.81),
'arcfang':(.4548,.79,.67,.73,.91),'skybreaker':(.4949,.81,.70,.76,.91),
'stormsilver':(.4937,.80,.70,.74,.90)}
def build(item):
 cfg=CONFIG[item];data=json.loads((common.DATA/item/'trace.json').read_text());w,h=data['width'],data['height'];flip=item=='sunforged'
 root,data,unit,xyz=common.init(item,(w*cfg[0],h*cfg[1]),flip=flip);mat=common.material(item,.35 if item in ['glacier','tideglass','hailcaller'] else .5,.56)
 def depth(x,y,d,l,s):
  v=y/h;edge=max(.00045,d*s)
  if cfg[3]<=v<=cfg[4]:
   r=.017 if item!='hailcaller' else .020
   return max(.0007,math.sqrt(max(0,2*r*min(edge,r)-min(edge,r)**2)))
  if item=='hailcaller' and v<.49:
   return .001+min(.095,math.sqrt(max(0,edge*.10)))
  if item=='thunderrod' and .22<v<.38:
   # Solid conductor housed inside the broad forged prongs.
   cx=w*.5;cy=h*.30;r=.053;dx=(x-cx)*s;dy=(y-cy)*s
   orb=math.sqrt(max(0,r*r-dx*dx-dy*dy))
   return max(min(.012,edge*.55),orb)
  blade=(v>cfg[2]) if flip else (v<cfg[2])
  if blade and item!='thunderrod':return max(.00045,min(.009,edge*.38))
  return max(.0006,min(.016,edge*.75))
 region=None
 if item=='thunderrod':
  region=lambda x,y:not (((x-157)/54)**2+((y-273)/48)**2<1.10)
 common.solid(root,data,unit,xyz,mat,depth,region=region,name=item+' continuous forged shell, bevel and grasp')
 if item=='thunderrod':
  center=xyz(157,273);radius=48*unit
  blue=bpy.data.materials.new('Dark violet conductor');blue.diffuse_color=(.025,.018,.12,1);blue.use_nodes=True
  shader=blue.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.025,.018,.12,1);shader.inputs['Metallic'].default_value=.5;shader.inputs['Roughness'].default_value=.3
  bronze=bpy.data.materials.new('Aged brass orb straps');bronze.diffuse_color=(.18,.12,.045,1);bronze.use_nodes=True
  shader=bronze.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.18,.12,.045,1);shader.inputs['Metallic'].default_value=.7;shader.inputs['Roughness'].default_value=.48
  bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=radius,location=center);orb=bpy.context.object;orb.name='Round violet conductor';orb.parent=root;orb.data.materials.append(blue)
  for p in orb.data.polygons:p.use_smooth=True
  for offset in [-.28,.28]:
   bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,location=center+(common.Vector((0,0,offset*radius))),major_radius=radius*math.sqrt(1-offset**2),minor_radius=.0018)
   ring=bpy.context.object;ring.name='Conductor horizontal brass band';ring.parent=root;ring.data.materials.append(bronze)
  bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,location=center,rotation=(math.pi/2,0,0),major_radius=radius,minor_radius=.0018)
  ring=bpy.context.object;ring.name='Conductor meridian brass band';ring.parent=root;ring.data.materials.append(bronze)
 common.finish(root,item,'Contour follows the original reference; blade bevel, solid fittings, and round grip cross-sections use separate depth rules. Original image surface detail is projected onto closed geometry.')
if __name__=='__main__':
 ids=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
 for item in ids:build(item)
